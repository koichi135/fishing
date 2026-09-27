// ゲーム本体: 状態遷移・カメラ・入力・釣りのロジック
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { U, ANGLER, RETRIEVE_POINT, seabedY, clamp, lerp, damp, angleWrap } from './shared.js';
import { PRESETS, SPECIES_BY_ID, LURES, DRAG, REEL_SPEEDS, sizeName, weightKg } from './data.js';
import { SkySystem } from './sky.js';
import { Water, waveHeight } from './water.js';
import { World } from './world.js';
import { Particles, UnderwaterFX } from './fx.js';
import { FishManager } from './fish.js';
import { BaitSchool, Birds, Nabura } from './life.js';
import { Lure, Rod, FishingLine, Net, AimMarker } from './tackle.js';
import { GameAudio } from './audio.js';
import { Post } from './post.js';
import { Showcase } from './showcase.js';
import { Store } from './ui.js';

const EYE = new THREE.Vector3(0, 2.72, -2.05);
const UP = new THREE.Vector3(0, 1, 0);
const SPOOL = 150;
const fwd = (yaw, out = new THREE.Vector3()) => out.set(Math.sin(yaw), 0, -Math.cos(yaw));
const right = (yaw, out = new THREE.Vector3()) => out.set(Math.cos(yaw), 0, Math.sin(yaw));
const bearingOf = (x, z) => Math.atan2(x - ANGLER.x, -(z - ANGLER.z));
const vib = (p) => { if (Store.settings.vibe === 'on') try { navigator.vibrate && navigator.vibrate(p); } catch (e) { /* 非対応 */ } };

export class Game {
  constructor(renderer, ui, quality, progress) {
    this.renderer = renderer;
    this.ui = ui;
    this.quality = quality;
    this.time = 0;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x000000, 0);
    this.camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.05, 2500);
    this.pipCam = new THREE.PerspectiveCamera(50, 1.6, 0.05, 400);
    this.camera.position.copy(EYE);

    progress(0.15, '空と海を生成中…');
    this.sky = new SkySystem(renderer, quality);
    this.scene.add(this.sky.group);
    this.water = new Water(quality, this.sky.cubeTexture);
    this.scene.add(this.water.mesh);

    progress(0.3, '海底と港を生成中…');
    this.world = new World(this.scene, quality);

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
    this.sun = new THREE.DirectionalLight(0xffffff, 2);
    this.scene.add(this.hemi, this.sun, this.sun.target);

    progress(0.45, '生き物を放流中…');
    this.particles = new Particles(quality === 'low' ? 900 : 1800);
    this.scene.add(this.particles.points);
    this.uw = new UnderwaterFX(quality);
    this.scene.add(this.uw.group);
    this.fishes = new FishManager(this.scene);
    this.bait = new BaitSchool(this.scene, quality);
    this.birds = new Birds(this.scene, quality === 'low' ? 4 : 7);
    this.nabura = new Nabura();

    progress(0.6, 'タックルを準備中…');
    this.lure = new Lure(this.scene);
    this.rod = new Rod(this.scene);
    this.line = new FishingLine(this.scene);
    this.net = new Net(this.scene);
    this.marker = new AimMarker(this.scene);

    this.post = new Post(renderer, this.scene, this.camera, quality);
    this.audio = new GameAudio();
    this.audio.setEnabled(Store.settings.sound === 'on');
    this.showcase = new Showcase(ui.el.showcase);
    this.thumbs = {};

    this.controls = new OrbitControls(this.camera, renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.1;
    this.controls.enablePan = false;
    this.controls.minDistance = 0.25;
    this.controls.maxDistance = 7;
    this.controls.enabled = false;

    // 状態
    this.state = 'title';
    this.presetId = 'dusk';
    this.lureType = 'minnow';
    this.speedIdx = 1;
    this.aimYaw = 0;
    this.reelHeld = false;
    this.steer = 0;
    this.steerTarget = 0;
    this.view = 'under';
    this.score = 0;
    this.pipSwap = false;
    this.flash = 0;
    this.aberr = 0;
    this.shake = 0;
    this.camTarget = new THREE.Vector3(0, 0, -20);
    this.prevLure = new THREE.Vector3();
    this.tmp = new THREE.Vector3();
    this.lastUnder = null;

    progress(0.75, '時間帯を設定中…');
    this.applyPreset('dusk');
    this.bindInput();
    this.ui.lureName(this.lureType);
    this.ui.bindSettings((k, v, prev) => this.onSetting(k, v, prev));
    this.setViewportSize();
  }

  // ================================================================ 時間帯
  applyPreset(id) {
    const p = PRESETS[id];
    this.presetId = id;
    this.preset = p;
    this.sky.apply(p);
    this.scene.environment = this.sky.envMap;
    this.water.apply(p, this.sky);
    this.world.apply(p);
    this.water.setLamps(p.lamps > 0 ? [...this.world.lampPositions, this.world.lighthousePos] : [], p.lamps * 1.4);
    this.uw.apply(p, this.sky.sunDir);
    this.hemi.color.set(p.hemiSky);
    this.hemi.groundColor.set(p.hemiGround);
    this.hemi.intensity = p.hemiInt;
    this.sun.color.set(p.sunColor);
    this.sun.intensity = p.sunInt;
    this.sun.position.copy(this.sky.sunDir).multiplyScalar(100);
    U.uWaterColor.value.set(p.waterFog);
    U.uWaterDensity.value = p.waterDensity;
    U.uAirColor.value.set(p.airFog);
    U.uAirDensity.value = p.airDensity;
    U.uCaustic.value = p.caustic;
    U.uUnderBoost.value = p.underBoost;
    this.renderer.toneMappingExposure = p.exposure;
    this.particles.setLight(p.night ? 0.35 : p.id === 'day' ? 1.1 : 0.8);
    this.fishes.setPreset(p);
    this.nabura.setActivity(p.night ? 0.3 : p.activity);
  }

  // ================================================================ 画面遷移
  startSession(presetId) {
    this.audio.init();
    if (this.fight) { this.fishes.remove(this.fight.fish); this.fight = null; }
    if (this.bite) { this.fishes.flee(this.bite.fish); this.bite = null; }
    this.ui.strike(false);
    if (presetId !== this.presetId) this.applyPreset(presetId);
    this.ui.closeAll();
    this.ui.hud(true);
    this.score = 0;
    Store.records.sessions++;
    Store.save();
    this.toReady('ボタン長押しでパワーを溜めて、離してキャスト!\n画面を左右にスワイプで狙いを変更');
    this.ui.toast(`${PRESETS[presetId].icon} ${PRESETS[presetId].label}の釣り場に到着`);
  }

  toTitle() {
    this.ui.closeAll();
    this.ui.hud(false);
    this.ui.pip(null);
    this.ui.strike(false);
    if (this.fight) { this.fishes.remove(this.fight.fish); this.fight = null; }
    this.state = 'title';
    this.marker.mesh.visible = false;
    this.net.group.visible = false;
    this.controls.enabled = false;
    this.ui.titleStats();
    this.ui.open('scrTitle');
  }

  toReady(hint) {
    this.state = 'ready';
    this.fight = null;
    this.bite = null;
    this.reelHeld = false;
    this.controls.enabled = false;
    this.net.group.visible = false;
    this.ui.el.btnReel.classList.remove('on');
    this.ui.phase('ready');
    this.ui.pip(null);
    this.ui.hint(hint || 'ボタン長押しでキャスト ・ 左右スワイプで狙いを変更');
    this.lure.setType(this.lureType);
  }

  // ================================================================ 入力
  bindInput() {
    const e = this.ui.el;
    const hold = (el, down, up) => {
      el.addEventListener('pointerdown', (ev) => {
        ev.preventDefault();
        this.audio.init();
        try { el.setPointerCapture(ev.pointerId); } catch (_) { /* noop */ }
        down(ev);
      });
      const end = (ev) => up(ev);
      el.addEventListener('pointerup', end);
      el.addEventListener('pointercancel', end);
      el.addEventListener('lostpointercapture', end);
    };
    hold(e.btnCast, () => this.startCharge(), () => this.releaseCast());
    hold(e.btnReel, () => this.setReel(true), () => this.setReel(false));
    e.btnTwitch.addEventListener('pointerdown', (ev) => { ev.preventDefault(); this.twitch(); });
    e.btnSpeed.addEventListener('click', () => {
      this.speedIdx = (this.speedIdx + 1) % REEL_SPEEDS.length;
      e.btnSpeed.textContent = '巻き ' + REEL_SPEEDS[this.speedIdx].label;
      this.audio.click();
    });
    e.btnView.addEventListener('click', () => this.toggleView());
    e.btnLure.addEventListener('click', () => { if (this.state === 'ready') this.openLures(); });
    e.btnMenu.addEventListener('click', () => this.pause());
    e.qte.addEventListener('pointerdown', (ev) => { ev.preventDefault(); this.qteHit(); });
    e.strike.addEventListener('pointerdown', (ev) => { ev.preventDefault(); this.hookset(); });

    // ロッド操作パッド
    const steerMove = (ev) => {
      const r = e.steer.getBoundingClientRect();
      const half = r.width / 2 - 40;
      this.steerTarget = clamp((ev.clientX - (r.left + r.width / 2)) / half, -1, 1);
    };
    e.steer.addEventListener('pointerdown', (ev) => { ev.preventDefault(); try { e.steer.setPointerCapture(ev.pointerId); } catch (_) { /* noop */ } steerMove(ev); this.steerActive = true; });
    e.steer.addEventListener('pointermove', (ev) => { if (this.steerActive) steerMove(ev); });
    const steerEnd = () => { this.steerActive = false; this.steerTarget = 0; };
    e.steer.addEventListener('pointerup', steerEnd);
    e.steer.addEventListener('pointercancel', steerEnd);

    // キャンバス: 狙いの変更 / PiP の切替
    const cv = this.renderer.domElement;
    let drag = null;
    cv.addEventListener('pointerdown', (ev) => {
      this.audio.init();
      if (this.state === 'fight' && this.pipRect) {
        const r = this.pipRect;
        if (ev.clientX >= r.x && ev.clientX <= r.x + r.w && ev.clientY >= r.yTop && ev.clientY <= r.yTop + r.h) { this.pipSwap = !this.pipSwap; return; }
      }
      if (this.state === 'ready' || this.state === 'charge') drag = { x: ev.clientX, yaw: this.aimYaw };
    });
    window.addEventListener('pointermove', (ev) => {
      if (drag) this.aimYaw = clamp(drag.yaw + (ev.clientX - drag.x) * 0.0035, -0.75, 0.75);
    });
    window.addEventListener('pointerup', () => { drag = null; });

    // キーボード(PC)
    const keys = {};
    window.addEventListener('keydown', (ev) => {
      if (ev.repeat) return;
      keys[ev.code] = true;
      this.audio.init();
      if (ev.code === 'Space') {
        ev.preventDefault();
        if (this.state === 'ready') this.startCharge();
        else if (this.state === 'bite') this.hookset();
        else this.setReel(true);
      }
      if (ev.code === 'KeyX') this.twitch();
      if (ev.code === 'KeyS' || ev.code === 'ArrowDown') this.qteHit();
      if (ev.code === 'KeyV') this.toggleView();
      if (ev.code === 'Escape') this.pause();
      if (ev.code === 'Enter' && this.state === 'result') this.next();
      this.keySteer(keys);
    });
    window.addEventListener('keyup', (ev) => {
      keys[ev.code] = false;
      if (ev.code === 'Space') { if (this.state === 'charge') this.releaseCast(); else this.setReel(false); }
      this.keySteer(keys);
    });

    // 画面ボタン
    document.getElementById('btnStart').addEventListener('click', () => { this.audio.init(); this.ui.open('scrTime'); });
    document.getElementById('btnZukan').addEventListener('click', () => this.openZukan());
    document.getElementById('btnSettings').addEventListener('click', () => this.ui.open('scrSettings'));
    document.getElementById('btnResume').addEventListener('click', () => this.resume());
    document.getElementById('btnPauseLure').addEventListener('click', () => { this.ui.back(); this.paused = false; if (this.state === 'ready') this.openLures(); else this.ui.toast('ルアー交換は回収後にできます'); });
    document.getElementById('btnPauseTime').addEventListener('click', () => { this.ui.closeAll(); this.paused = false; this.hud(false); this.ui.open('scrTime'); });
    document.getElementById('btnPauseSettings').addEventListener('click', () => this.ui.open('scrSettings'));
    document.getElementById('btnToTitle').addEventListener('click', () => { this.paused = false; this.toTitle(); });
    this.ui.el.btnNext.addEventListener('click', () => this.next());
    this.ui.renderTimes((id) => this.startSession(id));
    this.ui.onBack = (closed, prev) => {
      if (closed === 'scrPause') this.paused = false;
      if (closed === 'scrTime' && !prev && this.state !== 'title') this.toTitle();
    };
  }

  hud(on) { this.ui.hud(on); }

  keySteer(keys) {
    const l = keys.KeyA || keys.ArrowLeft, r = keys.KeyD || keys.ArrowRight;
    if (this.state === 'fight') this.steerTarget = (r ? 1 : 0) - (l ? 1 : 0);
    else if ((this.state === 'ready' || this.state === 'charge') && (l || r)) this.aimKey = (r ? 1 : 0) - (l ? 1 : 0);
    else this.aimKey = 0;
  }

  pause() {
    if (this.state === 'title' || this.state === 'result' || this.paused) return;
    this.paused = true;
    this.setReel(false);
    this.ui.open('scrPause');
  }
  resume() { this.paused = false; this.ui.closeAll(); }

  openLures() {
    this.ui.renderLures(this.lureType, (id) => {
      this.lureType = id;
      this.lure.setType(id);
      this.ui.lureName(id);
      this.audio.click();
      this.ui.back();
      this.ui.toast(`${LURES[id].name}に交換した`);
    });
    this.ui.open('sheetLure');
  }

  openZukan() {
    for (const id of Object.keys(Store.records.species)) {
      if (!this.thumbs[id]) this.thumbs[id] = this.showcase.thumbnail(SPECIES_BY_ID[id]);
    }
    this.ui.renderZukan(this.thumbs);
    this.ui.open('scrZukan');
  }

  onSetting(k, v) {
    if (k === 'sound') this.audio.setEnabled(v === 'on');
    if (k === 'quality') location.reload();
  }

  setReel(on) {
    if (on && !(this.state === 'retrieve' || this.state === 'fight')) return;
    this.reelHeld = on;
    this.ui.el.btnReel.classList.toggle('on', on);
  }

  twitch() {
    if (this.state !== 'retrieve') return;
    this.lure.doTwitch();
    this.rodJerk = 1;
    if (this.lure.type === 'popper') {
      this.particles.splash(this.lure.pos.x, this.lure.pos.z, 0.35);
      this.particles.bubbles(this.lure.pos.x, -0.05, this.lure.pos.z, 14, 0.15);
      this.water.ripple(this.lure.pos.x, this.lure.pos.z, 0.18, this.time);
      this.audio.pop();
    } else this.audio.click();
  }

  toggleView() {
    if (this.state !== 'retrieve' && this.state !== 'bite') return;
    this.view = this.view === 'under' ? 'above' : 'under';
    this.ui.el.btnView.textContent = this.view === 'under' ? '👁 水上' : '👁 水中';
    if (this.view === 'under') this.enterUnderCam();
    else this.controls.enabled = false;
    this.flash = 0.25;
  }

  // ================================================================ キャスト
  startCharge() {
    if (this.state !== 'ready' || this.paused) return;
    this.state = 'charge';
    this.power = 0;
    this.powerDir = 1;
    this.chargeT = 0;
    this.ui.phase('charge');
    this.ui.hint('ジャストゾーン(白枠)で離すと正確に遠くへ飛ぶ!');
  }

  releaseCast() {
    if (this.state !== 'charge') return;
    const perfect = this.power >= 0.86 && this.power <= 0.95;
    let dist = 8 + this.power * 42 + (perfect ? 4 : 0);
    const spread = perfect ? 0 : (0.5 + this.power) * 3.5;
    const f = fwd(this.aimYaw), r = right(this.aimYaw);
    const land = new THREE.Vector3(ANGLER.x, 0, ANGLER.z).addScaledVector(f, dist).addScaledVector(r, (Math.random() - 0.5) * spread);
    dist = Math.hypot(land.x - ANGLER.x, land.z - ANGLER.z);
    this.flight = {
      t: 0, dur: 0.75 + dist * 0.026, from: this.rod.tip.clone(), to: land, apex: 2.5 + dist * 0.16, dist, perfect,
    };
    this.state = 'flying';
    this.swingT = 0;
    this.ui.phase('flying');
    this.ui.hint('');
    this.audio.castWhoosh(this.power);
    this.ui.banner(perfect ? `ナイスキャスト!<small>${dist.toFixed(0)} m</small>` : `${dist.toFixed(0)} m`, perfect ? 'hot' : '', 1.1);
    if (perfect) { this.audio.perfect(); vib(20); }
  }

  landLure() {
    const L = this.flight.to;
    this.lure.reset(new THREE.Vector3(L.x, -0.03, L.z));
    this.particles.splash(L.x, L.z, 0.45);
    this.water.ripple(L.x, L.z, 0.22, this.time);
    this.audio.splash(0.5);
    vib(25);
    this.state = 'retrieve';
    this.view = 'under';
    this.ui.el.btnView.textContent = '👁 水上';
    this.enterUnderCam(true);
    this.flash = 0.5;
    this.ui.phase('retrieve');
    const sinking = this.lureType === 'vib' || this.lureType === 'pencil';
    this.ui.hint(sinking ? 'カウントダウンで沈めてからリールを巻こう\nトゥイッチで誘いを入れる' : 'リール長押しで巻く ・ 止めるとルアーが浮く\nトゥイッチ・ストップ&ゴーで食わせの間を作る');
  }

  enterUnderCam(reset = false) {
    const lp = this.lure.pos;
    const d = this.lure.dir;
    if (reset || !this.underOffset) {
      this.underOffset = new THREE.Vector3(-d.z * 1.1 - d.x * 0.7, -0.18, d.x * 1.1 - d.z * 0.7);
    }
    const target = lp.clone();
    target.y = Math.min(target.y, -0.35);
    this.camera.position.copy(target).add(this.underOffset);
    this.camera.position.y = Math.min(this.camera.position.y, -0.3);
    this.controls.target.copy(target);
    this.prevLure.copy(target);
    this.controls.enabled = true;
    this.controls.update();
  }

  // ================================================================ アタリ・アワセ
  onStrike(f) {
    if (this.lureType === 'popper' || f.pos.y > -1.2) this.strikeSplash = f;
  }

  onBite(f) {
    if (this.state !== 'retrieve') { f.state = 'cruise'; f.cd = 5; return; }
    this.state = 'bite';
    this.bite = { fish: f, t: 0, window: 0.9 };
    this.setReel(false);
    this.ui.strike(true, 0);
    this.ui.hint('');
    this.audio.bite();
    vib([80, 40, 120]);
    this.shake = 0.6;
    this.rodJerk = 1.5;
    if (this.lure.pos.y > -0.6 || this.lureType === 'popper') {
      this.particles.splash(this.lure.pos.x, this.lure.pos.z, 1.2 + f.len);
      this.water.ripple(this.lure.pos.x, this.lure.pos.z, 0.4, this.time);
      this.audio.splash(1.2);
    }
    this.particles.bubbles(this.lure.pos.x, this.lure.pos.y, this.lure.pos.z, 20, 0.3);
  }

  hookset() {
    if (this.state !== 'bite' || this.paused) return;
    const b = this.bite;
    const rt = b.t;
    const grade = rt < 0.32 ? 'PERFECT' : rt < 0.58 ? 'GREAT' : 'GOOD';
    const hold = grade === 'PERFECT' ? 1 : grade === 'GREAT' ? 0.85 : 0.7;
    this.ui.strike(false);
    this.bite = null;
    if (Math.random() < (grade === 'GOOD' ? 0.1 : 0.03)) {
      this.ui.banner('すっぽ抜け…', 'bad', 1.5);
      this.audio.lost();
      this.fishes.flee(b.fish);
      this.state = 'retrieve';
      this.ui.phase('retrieve');
      return;
    }
    this.startFight(b.fish, hold, grade);
  }

  missBite() {
    const b = this.bite;
    this.ui.strike(false);
    this.ui.banner('アワセが遅い!<small>ルアーを離された…</small>', 'bad', 1.8);
    this.audio.lost();
    this.fishes.flee(b.fish);
    this.bite = null;
    this.state = 'retrieve';
    this.ui.phase('retrieve');
  }

  // ================================================================ ファイト
  startFight(fish, hold, grade) {
    const sp = fish.sp;
    const sr = clamp((fish.cm - sp.min) / (sp.max - sp.min), 0, 1);
    fish.state = 'hooked';
    const bearing = bearingOf(fish.pos.x, fish.pos.z);
    const lineOut = Math.max(5, Math.hypot(fish.pos.x - ANGLER.x, fish.pos.z - ANGLER.z));
    const stamMax = 4 + sr * 15 * sp.stamina + sp.stamina * 5;
    this.fight = {
      fish, sp, sr, hold, grade, bearing, lineOut, stamMax, stam: stamMax,
      power: sp.power * (0.5 + sr * 1.0), phi: 0, phiT: 0, mode: 'run', modeT: 1.2 + Math.random(),
      depth: -fish.pos.y, tension: 35, slack: 0, slackT: 0, jump: null, t: 0, jumps: 0, prevLine: lineOut,
      heading: new THREE.Vector3(), qteOk: false,
    };
    this.state = 'fight';
    this.pipSwap = false;
    this.controls.enabled = false;
    this.ui.phase('fight');
    this.ui.banner(`${grade}!<small>HIT!!</small>`, 'hot', 1.3);
    this.ui.hint('魚が走ったら巻くのを我慢 ・ 止まったら巻く\nロッドは魚の走る向きと逆へ倒すと弱らせやすい');
    this.audio.hit();
    vib([60, 30, 160]);
    this.flash = 0.6;
    this.aberr = 1;
    this.particles.splash(fish.pos.x, fish.pos.z, 0.8 + fish.len);
    this.water.ripple(fish.pos.x, fish.pos.z, 0.35, this.time);
  }

  chooseMode(F) {
    const stamR = F.stam / F.stamMax;
    const sp = F.sp;
    if (stamR < 0.2) { F.mode = 'tired'; F.modeT = 2.2; F.phiT = (Math.random() - 0.5) * 1.2; return; }
    const r = Math.random();
    if (sp.jumpy > 0 && stamR > 0.28 && F.depth < 2.8 && F.lineOut > 6 && r < 0.2 * sp.jumpy) { this.startJump(F); return; }
    if (r < 0.28 + 0.4 * stamR) {
      F.mode = 'run'; F.modeT = 1.3 + Math.random() * 2.2;
      F.phiT = (Math.random() < 0.5 ? -1 : 1) * (0.2 + Math.random() * 1.2);
      vib(40);
    } else if (sp.shake > 0.4 && Math.random() < sp.shake * 0.5) {
      F.mode = 'shake'; F.modeT = 0.9 + Math.random() * 0.5;
    } else {
      F.mode = 'hold'; F.modeT = 1.2 + Math.random() * 1.8;
      F.phiT = (Math.random() < 0.5 ? -1 : 1) * (Math.random() < 0.35 ? 2.2 + Math.random() * 0.7 : 0.6 + Math.random() * 1.0);
    }
  }

  startJump(F) {
    F.mode = 'jump';
    F.jump = { t: 0, dur: 1.5, h: 0.6 + F.fish.len * 0.9 };
    F.modeT = 1.6;
    F.qteOk = false;
    F.jumps++;
    this.ui.qte(true);
    this.ui.banner('エラ洗い!', 'hot', 0.9);
    const p = F.fish.pos;
    this.particles.splash(p.x, p.z, 1.4 + F.fish.len);
    this.water.ripple(p.x, p.z, 0.45, this.time);
    this.audio.jump();
    vib([30, 30, 30, 30, 80]);
  }

  qteHit() {
    const F = this.fight;
    if (this.state !== 'fight' || !F || !F.jump || F.qteOk) return;
    if (F.jump.t < 1.05) {
      F.qteOk = true;
      this.ui.qte(false);
      this.ui.banner('ナイスいなし!', '', 0.9);
      this.audio.perfect();
      this.score += 20;
    }
  }

  updateFight(dt) {
    const F = this.fight;
    const fish = F.fish, sp = F.sp;
    F.t += dt;
    F.modeT -= dt;
    this.steer = damp(this.steer, this.steerTarget, 10, dt);
    if (F.modeT <= 0 && !F.jump) this.chooseMode(F);
    const stamR = F.stam / F.stamMax;
    F.phi += clamp(angleWrap(F.phiT - F.phi), -1.6 * dt, 1.6 * dt);
    const sinP = Math.sin(F.phi), cosP = Math.cos(F.phi);
    // ロッド操作(サイドプレッシャー)
    let sideMul = 1, spMul = 1;
    const lat = Math.abs(sinP) > 0.25 ? Math.sign(sinP) : 0;
    const recommend = -lat;
    if (lat !== 0 && Math.abs(this.steer) > 0.25) {
      if (Math.sign(this.steer) === -lat) { sideMul = 1.9; spMul = 0.72; F.phiT *= 1 - dt * 0.6; }
      else { sideMul = 0.55; spMul = 1.15; }
    }
    const modeV = { run: 1.5 * F.power + 0.6, hold: 0.45, shake: 0.2, tired: 0.3, jump: 0.2 }[F.mode];
    const v = modeV * spMul * (0.45 + 0.55 * stamR);
    const vr = v * cosP, vt = v * sinP;
    F.bearing = clamp(F.bearing + (vt / Math.max(F.lineOut, 3)) * dt, -1.25, 1.25);
    const modeF = { run: 1, hold: 0.42, shake: 0.7, tired: 0.18, jump: 0.3 }[F.mode];
    const pull = F.power * modeF * (0.45 + 0.55 * stamR);
    let target = pull * (vr > 0 ? 28 + 22 * cosP : 12) + (this.reelHeld ? 22 + (F.lineOut < 10 ? 8 : 0) : 0);
    if (F.slack > 0.2) target = 3;
    F.tension = damp(F.tension, target, 6, dt);
    let spike = 0;
    if (F.mode === 'shake') spike = Math.sin(F.t * 28) * 16 * sp.shake * (this.reelHeld ? 1.3 : 0.7);
    if (F.jump && this.reelHeld) spike += 22 + Math.sin(F.t * 30) * 8;
    const dragMax = DRAG[Store.settings.drag] || 60;
    let shown = F.tension;
    let slip = 0;
    if (shown > dragMax) {
      slip = Math.max(vr, 0.35) * Math.min(1, (shown - dragMax) / 14 + 0.4);
      shown = dragMax + (shown - dragMax) * 0.3;
      F.lineOut += slip * dt;
    }
    shown += spike;
    this.audio.drag(dt, slip);
    // ライン回収
    const reelV = 1.55;
    if (vr < 0) {
      const toward = -vr;
      if (this.reelHeld) F.slack = Math.max(0, F.slack + (toward - reelV) * dt);
      else F.slack = Math.min(4, F.slack + toward * dt);
      F.lineOut -= toward * dt;
    }
    if (this.reelHeld) {
      if (F.slack > 0) F.slack = Math.max(0, F.slack - reelV * dt);
      else if (shown < dragMax) F.lineOut -= reelV * clamp(1 - shown / (dragMax + 12), 0.08, 1) * dt;
      this.audio.reel(dt, 1);
    } else if (vr > 0 && shown < dragMax && F.slack <= 0) {
      // ドラグが滑らない範囲では魚は動けず負荷になる
    }
    if (F.slack > 0.2) F.slackT += dt; else F.slackT = Math.max(0, F.slackT - dt * 2);
    // スタミナ
    F.stam -= (0.3 + (shown / 100) * 1.7) * sideMul * (F.mode === 'run' ? 1.15 : 1) * dt;
    if (F.slack > 0.2) F.stam += 0.25 * dt;
    F.stam = clamp(F.stam, 0, F.stamMax);
    // ジャンプ
    if (F.jump) {
      F.jump.t += dt;
      if (F.jump.t > 1.05 && !F.qteOk) this.ui.qte(false);
      if (F.jump.t >= F.jump.dur) {
        const p = fish.pos;
        this.particles.splash(p.x, p.z, 1.2 + fish.len);
        this.water.ripple(p.x, p.z, 0.4, this.time);
        this.audio.splash(1.2);
        const throwP = F.qteOk ? 0.03 : 0.28 + 0.4 * (1 - F.hold) + (this.reelHeld ? 0.15 : 0);
        F.jump = null;
        this.ui.qte(false);
        F.modeT = 0;
        if (Math.random() < throwP) { this.endFight('hookout', 'エラ洗いでバラした…'); return; }
      }
    }
    // 判定
    if (shown >= 100) { this.endFight('break', 'ラインブレイク!!'); return; }
    if (F.lineOut >= SPOOL) { this.endFight('break', 'ラインが出切った…'); return; }
    if (F.slackT > 1.4 && Math.random() < dt * (0.9 - F.hold * 0.5)) { this.endFight('hookout', 'ラインが緩んでフックアウト…'); return; }
    if (F.lineOut <= 4.5) {
      if (stamR < 0.3) { this.startLanding(); return; }
      F.lineOut = 4.5;
      if (F.mode !== 'run') { F.mode = 'run'; F.modeT = 2; F.phiT = (Math.random() - 0.5) * 0.8; this.ui.toast('まだ元気だ!足元で突っ込む!'); }
    }
    F.lineOut = Math.max(F.lineOut, 4.5);
    // 魚の位置
    const r = fwd(F.bearing), t = right(F.bearing);
    const hx = ANGLER.x + r.x * F.lineOut, hz = ANGLER.z + r.z * F.lineOut;
    let targetDepth;
    const bed = -seabedY(hx, hz) - 0.4;
    if (F.mode === 'run') targetDepth = sp.depthPref === 'bottom' ? bed : Math.min(bed, 1.5 + stamR * 2.5);
    else if (F.mode === 'tired') targetDepth = 0.35;
    else targetDepth = Math.min(bed, 0.8 + stamR * 2);
    F.depth = damp(F.depth, targetDepth, 0.8, dt);
    const p = fish.pos;
    p.x = damp(p.x, hx, 6, dt);
    p.z = damp(p.z, hz, 6, dt);
    F.heading.copy(r).multiplyScalar(cosP).addScaledVector(t, sinP).normalize();
    const hyaw = Math.atan2(F.heading.z, -F.heading.x);
    fish.yaw = fish.yaw + clamp(angleWrap(hyaw - fish.yaw), -4 * dt, 4 * dt);
    let pitch = 0, roll = 0;
    if (F.jump) {
      const u = F.jump.t / F.jump.dur;
      p.y = -0.2 + F.jump.h * Math.sin(Math.PI * u);
      pitch = (0.5 - u) * 2.2;
      roll = Math.sin(F.jump.t * 26) * 0.5;
      if (Math.random() < dt * 30) this.particles.drips(p.x, p.y, p.z, 2, fish.len * 0.6);
      F.depth = 0.3;
    } else {
      p.y = damp(p.y, -F.depth, 3, dt);
      if (F.mode === 'shake') roll = Math.sin(F.t * 24) * 0.35;
      if (F.mode === 'tired') roll = 0.6 + Math.sin(F.t * 2) * 0.2;
      if (p.y > -0.4 && Math.random() < dt * 4) {
        this.particles.splash(p.x, p.z, 0.3);
        this.water.ripple(p.x, p.z, 0.12, this.time);
      }
    }
    fish.model.rotation.set(roll, fish.yaw, -pitch);
    fish.speed = v + Math.abs(F.lineOut - F.prevLine) / Math.max(dt, 1e-3);
    F.prevLine = F.lineOut;
    const u = fish.model.userData.uni;
    const freq = F.mode === 'run' ? 3.2 : F.mode === 'shake' ? 5 : F.mode === 'tired' ? 0.8 : 1.8;
    u.uSwimPhase.value += freq * Math.PI * 2 * dt;
    u.uSwimAmp.value = F.mode === 'tired' ? 0.03 : F.mode === 'shake' ? 0.09 : 0.07;
    u.uBend.value = Math.sin(F.t * 3) * (F.mode === 'run' ? 0.08 : 0.03);
    // ルアーは口元
    const nose = new THREE.Vector3(-fish.len * 0.5, 0, 0).applyEuler(fish.model.rotation).add(p);
    this.lure.pos.copy(nose);
    this.lure.root.position.copy(nose);
    this.lure.root.rotation.set(Math.sin(F.t * 20) * 0.4, fish.yaw + Math.PI, 0.6);
    if (Math.random() < dt * 3 && p.y < -0.2) this.particles.bubbles(p.x, p.y, p.z, 2, 0.1);

    // 演出
    F.shown = shown;
    this.danger = clamp((shown - 78) / 22, 0, 1);
    this.shake = Math.max(this.shake, F.mode === 'run' ? 0.12 : 0.04);
    if (shown > 90 && Math.random() < dt * 6) vib(15);
    this.ui.fight({ tension: shown, drag: dragMax, stamina: stamR, lineOut: F.lineOut, dir: F.mode === 'tired' ? 0 : sinP, recommend: F.mode === 'tired' ? 0 : recommend });
    this.ui.steerKnob(this.steer);
    this.ui.stats({ dist: F.lineOut, depth: Math.max(0, -p.y), score: this.score });
  }

  endFight(kind, msg) {
    const F = this.fight;
    this.ui.qte(false);
    this.ui.pip(null);
    this.danger = 0;
    if (kind === 'break') {
      this.audio.snap();
      vib([100, 50, 300]);
      this.ui.banner(msg + '<small>ルアーをロストした</small>', 'bad', 2.4);
      this.fishes.flee(F.fish);
      this.fight = null;
      this.toReady('新しいルアーを結び直した。もう一度キャスト!');
      return;
    }
    this.audio.lost();
    vib(200);
    this.ui.banner(msg, 'bad', 2.2);
    const lp = F.fish.pos.clone();
    this.fishes.flee(F.fish);
    this.fight = null;
    this.lure.reset(new THREE.Vector3(lp.x, Math.min(lp.y, -0.05), lp.z));
    this.state = 'retrieve';
    this.ui.phase('retrieve');
    this.enterUnderCam(true);
    this.ui.hint('まだルアーは生きている。巻いて回収しよう');
  }

  // ================================================================ ランディング
  startLanding() {
    const F = this.fight;
    this.state = 'landing';
    this.landT = 0;
    this.ui.phase('landing');
    this.ui.pip(null);
    this.ui.qte(false);
    this.ui.hint('');
    this.setReel(false);
    this.danger = 0;
    this.land = { from: F.fish.pos.clone(), fish: F.fish };
    this.net.group.visible = true;
    this.ui.banner('ランディング!', '', 1.2);
  }

  updateLanding(dt) {
    this.landT += dt;
    const t = this.landT;
    const fish = this.land.fish;
    const p = fish.pos;
    const surf = new THREE.Vector3(0.9, -0.12, -4.6);
    const top = new THREE.Vector3(0.7, 2.35, -3.1);
    const u = fish.model.userData.uni;
    u.uSwimPhase.value += dt * (t < 1.4 ? 22 : 12);
    u.uSwimAmp.value = 0.09;
    if (t < 1.2) {
      p.lerpVectors(this.land.from, surf, Math.min(1, t / 1.0));
      fish.model.rotation.set(Math.sin(t * 20) * 0.5 + 0.4, fish.yaw, 0.2);
      if (Math.random() < dt * 12) this.particles.splash(p.x, p.z, 0.35);
      this.net.group.position.lerpVectors(new THREE.Vector3(1.2, 3.2, -2.6), surf.clone().add(new THREE.Vector3(0, -0.05, 0)), Math.min(1, t / 1.2));
      this.net.group.rotation.set(0.5, 0, -0.3);
    } else if (t < 2.4) {
      const k = (t - 1.2) / 1.2;
      const e = k * k * (3 - 2 * k);
      this.net.group.position.lerpVectors(surf, top, e);
      p.copy(this.net.group.position).add(new THREE.Vector3(0, -0.22, 0));
      fish.model.rotation.set(Math.PI / 2 * 0.85 + Math.sin(t * 14) * 0.2, fish.yaw, 0.3);
      if (k < 0.2 && Math.random() < dt * 20) this.particles.splash(surf.x, surf.z, 0.6);
      if (Math.random() < dt * 25) this.particles.drips(p.x, p.y - 0.2, p.z, 3, 0.4);
    } else {
      p.copy(this.net.group.position).add(new THREE.Vector3(0, -0.22, 0));
      fish.model.rotation.set(Math.PI / 2 * 0.85 + Math.sin(t * 8) * 0.12, fish.yaw + (t - 2.4) * 0.3, 0.3);
      if (Math.random() < dt * 10) this.particles.drips(p.x, p.y - 0.2, p.z, 2, 0.4);
    }
    this.lure.root.position.copy(new THREE.Vector3(-fish.len * 0.5, 0, 0).applyEuler(fish.model.rotation).add(p));
    if (t > 3.2 && this.state === 'landing') this.showResult();
  }

  showResult() {
    const F = this.fight;
    const sp = F.sp, cm = F.fish.cm;
    const kg = weightKg(sp, cm);
    const rec = Store.records.species[sp.id];
    const isNew = !rec;
    const isBest = !rec || cm > rec.best;
    const sr = F.sr;
    const stars = clamp(sp.rarity + (sr > 0.75 ? 1 : 0), 1, 5);
    const gradeMul = F.grade === 'PERFECT' ? 1.3 : F.grade === 'GREAT' ? 1.15 : 1;
    const pts = Math.round((kg * 120 + cm * 2) * (1 + (sp.rarity - 1) * 0.6) * gradeMul * (1 + sr * 0.5));
    this.score += pts;
    Store.records.species[sp.id] = { best: Math.max(cm, rec ? rec.best : 0), count: (rec ? rec.count : 0) + 1 };
    Store.records.total++;
    Store.records.bestScore = Math.max(Store.records.bestScore, this.score);
    Store.save();
    delete this.thumbs[sp.id];
    const badges = [];
    if (isNew) badges.push(['図鑑に登録!', 'green']);
    else if (isBest) badges.push(['自己記録更新!']);
    if (sr > 0.8) badges.push(['ランカー!']);
    if (F.grade === 'PERFECT') badges.push(['PERFECTアワセ', 'blue']);
    if (F.jumps > 0) badges.push([`エラ洗い×${F.jumps}`, 'blue']);
    this.ui.result({
      head: sr > 0.8 ? 'BIG CATCH!' : 'CATCH!', name: sizeName(sp, cm), stars, cm, kg, score: pts, badges,
      meta: `${sp.name} ・ ${LURES[this.lureType].short}でヒット ・ セッション合計 ${this.score}pt`,
    });
    this.state = 'result';
    this.ui.phase('result');
    this.ui.open('scrResult');
    this.showcase.show(sp);
    this.audio.fanfare();
    vib([40, 40, 40, 40, 160]);
  }

  next() {
    if (this.state !== 'result') return;
    this.ui.back();
    if (this.fight) { this.fishes.remove(this.fight.fish); this.fight = null; }
    this.toReady('次の一匹を狙おう!');
  }

  // ================================================================ 毎フレーム
  update(dt) {
    this.time += dt;
    const t = this.time;
    U.uTime.value = t;
    this.ui.tick(dt);
    const active = !this.paused;

    if (active) {
      switch (this.state) {
        case 'ready': this.updateReady(dt); break;
        case 'charge': this.updateCharge(dt); break;
        case 'flying': this.updateFlying(dt); break;
        case 'retrieve': this.updateRetrieve(dt); break;
        case 'bite': this.updateBite(dt); break;
        case 'fight': this.updateFight(dt); break;
        case 'landing': this.updateLanding(dt); break;
        default: break;
      }
    }
    if (this.state !== 'retrieve' || this.paused) this.fishes.update(dt, { active: false, events: {} });
    // 環境
    this.nabura.update(dt, t, {
      particles: this.particles, water: this.water, audio: this.audio,
      onStart: () => { if (this.state !== 'title') { this.ui.toast('🐦 ナブラ発生! 沖の水面を狙え'); this.audio.nabura(); } },
    });
    const threats = this.fishes.list.filter((f) => f.state === 'chase' || f.state === 'strike').map((f) => f.pos);
    if (this.state === 'retrieve') threats.push(this.lure.pos);
    this.bait.update(dt, t, { nabura: this.nabura.active, threats });
    this.birds.update(dt, t, { nabura: this.nabura.active, night: this.preset.night, particles: this.particles, water: this.water, audio: this.audio });
    this.world.update(dt, t);
    this.particles.update(dt, t);
    this.updateTackle(dt);
    this.updateCamera(dt);
    this.sky.update(dt, this.camera, t);
    this.flash = Math.max(0, this.flash - dt * 2.2);
    this.aberr = Math.max(0, this.aberr - dt * 1.8);
    if (this.state === 'result') this.showcase.update(dt);
  }

  updateReady(dt) {
    if (this.aimKey) this.aimYaw = clamp(this.aimYaw + this.aimKey * dt * 0.8, -0.75, 0.75);
    this.ui.stats({ dist: null, depth: null, score: this.score });
    this.marker.mesh.visible = true;
    const f = fwd(this.aimYaw);
    const d = 26;
    this.marker.set(ANGLER.x + f.x * d, ANGLER.z + f.z * d, 1.4, this.time);
    this.nearNabura(ANGLER.x + f.x * d, ANGLER.z + f.z * d);
  }

  nearNabura(x, z) {
    const n = this.nabura.active;
    const hot = n && Math.hypot(n.pos.x - x, n.pos.z - z) < 8;
    this.marker.mat.uniforms.uCol.value.setRGB(hot ? 1 : 0.4, hot ? 0.6 : 0.9, hot ? 0.2 : 1.0);
  }

  updateCharge(dt) {
    this.chargeT += dt;
    this.power += this.powerDir * dt * 0.95;
    if (this.power >= 1) { this.power = 1; this.powerDir = -1; }
    if (this.power <= 0) { this.power = 0; this.powerDir = 1; }
    const dist = 8 + this.power * 42 + (this.power >= 0.86 && this.power <= 0.95 ? 4 : 0);
    this.ui.power(this.power, dist);
    if (this.aimKey) this.aimYaw = clamp(this.aimYaw + this.aimKey * dt * 0.8, -0.75, 0.75);
    const f = fwd(this.aimYaw);
    this.marker.mesh.visible = true;
    this.marker.set(ANGLER.x + f.x * dist, ANGLER.z + f.z * dist, 1 + dist * 0.05, this.time);
    this.nearNabura(ANGLER.x + f.x * dist, ANGLER.z + f.z * dist);
  }

  updateFlying(dt) {
    const F = this.flight;
    F.t += dt;
    this.swingT += dt;
    this.marker.mesh.visible = true;
    const k = Math.min(1, F.t / F.dur);
    const p = this.tmp.lerpVectors(F.from, F.to, k);
    p.y = lerp(F.from.y, 0, k) + F.apex * Math.sin(Math.PI * k) * (1 - k * 0.25);
    this.lure.pos.copy(p);
    this.lure.root.position.copy(p);
    this.lure.root.rotation.set(this.time * 9, Math.atan2(F.to.z - F.from.z, -(F.to.x - F.from.x)) + Math.PI, 0.4);
    if (k >= 1) { this.marker.mesh.visible = false; this.landLure(); }
  }

  updateRetrieve(dt) {
    this.marker.mesh.visible = false;
    const reelV = REEL_SPEEDS[this.speedIdx].v;
    const done = this.lure.update(dt, this.time, this.reelHeld, reelV);
    if (this.reelHeld) this.audio.reel(dt, reelV);
    if (this.lure.type === 'popper' && this.lure.speed > 0.2 && Math.random() < dt * 8) {
      this.particles.emit(2, this.lure.pos.x, 0.03, this.lure.pos.z, 0, 0, 0, 1.2, 0.08);
    }
    if (this.lure.events.bottom) this.ui.toast('ボトムタッチ!', 1);
    const ev = this.lure.events;
    this.fishes.update(dt, {
      active: true, lurePos: this.lure.pos, lureDir: this.lure.dir, lureSpeed: this.lure.speed, lureType: this.lure.type,
      events: ev, nabura: this.nabura.active,
      onStrike: (f) => this.onStrike(f), onBite: (f) => this.onBite(f),
    });
    ev.twitch = false; ev.pop = false;
    const lp = this.lure.pos;
    this.ui.stats({ dist: Math.hypot(lp.x - ANGLER.x, lp.z - ANGLER.z), depth: Math.max(0, -lp.y), score: this.score });
    this.updateFinder(dt);
    if (done && this.state === 'retrieve') {
      this.particles.drips(lp.x, 0.1, lp.z, 6, 0.1);
      this.toReady('ルアーを回収した。次のキャストへ!');
    }
  }

  updateFinder(dt) {
    if (Store.settings.finder !== 'on') return;
    const lp = this.lure.pos;
    const fish = [];
    for (const f of this.fishes.list) {
      if (Math.hypot(f.pos.x - lp.x, f.pos.z - lp.z) < 6) fish.push({ depth: -f.pos.y, len: f.len });
    }
    const bait = [];
    const bc = this.bait.center;
    if (Math.hypot(bc.x - lp.x, bc.z - lp.z) < 7) for (let i = 0; i < 6; i++) bait.push(-bc.y + (Math.random() - 0.5) * 1.6);
    this.ui.finder(dt, { bed: -seabedY(lp.x, lp.z), lure: -lp.y, fish, bait });
  }

  updateBite(dt) {
    const b = this.bite;
    b.t += dt;
    this.ui.strike(true, Math.min(1, b.t / b.window));
    const f = b.fish;
    const lp = this.lure.pos;
    // ルアーをくわえて首を振る
    f.pos.copy(lp).addScaledVector(f.dir(this.tmp), -f.len * 0.48);
    f.model.rotation.set(Math.sin(this.time * 30) * 0.25, f.yaw + Math.sin(this.time * 18) * 0.2, -f.pitch);
    f.model.userData.uni.uSwimPhase.value += dt * 25;
    this.lure.root.position.copy(lp).add(new THREE.Vector3(Math.sin(this.time * 40) * 0.02, 0, 0));
    this.shake = Math.max(this.shake, 0.15);
    if (b.t > b.window) this.missBite();
  }

  // ================================================================ タックル表示
  updateTackle(dt) {
    const st = this.state;
    const visible = st !== 'title';
    this.rod.setVisible(visible);
    this.line.mesh.visible = visible;
    this.lure.root.visible = visible;
    if (!visible) return;
    let yaw = this.aimYaw, elev = 0.55, bend = 0.02;
    const end = this.lure.root.position;
    this.rodJerk = Math.max(0, (this.rodJerk || 0) - dt * 4);
    if (st === 'charge') {
      elev = 0.55 + Math.min(1, this.chargeT * 4) * 1.45 + Math.sin(this.time * 7) * 0.02;
      bend = 0.05;
    } else if (st === 'flying') {
      const s = Math.min(1, this.swingT / 0.2);
      elev = lerp(2.0, 0.3, s) + (s >= 1 ? Math.min(0.2, (this.swingT - 0.2) * 0.6) : 0);
      bend = s < 1 ? 0.35 : 0.02;
      yaw = this.aimYaw;
    } else if (st === 'retrieve' || st === 'bite') {
      yaw = bearingOf(this.lure.pos.x, this.lure.pos.z);
      elev = 0.42 + this.rodJerk * 0.25;
      bend = 0.06 + this.lure.speed * 0.06 + (st === 'bite' ? 0.45 + Math.sin(this.time * 30) * 0.2 : 0) + this.rodJerk * 0.15;
    } else if (st === 'fight' && this.fight) {
      yaw = this.fight.bearing + this.steer * 0.6;
      elev = this.fight.jump && this.fight.qteOk ? 0.25 : 0.95;
      bend = clamp((this.fight.shown || 30) / 100, 0.1, 1);
    } else if (st === 'landing' || st === 'result') {
      yaw = 0.35; elev = 1.1; bend = 0.25;
    }
    this.rodYaw = this.rodYaw == null ? yaw : this.rodYaw + angleWrap(yaw - this.rodYaw) * Math.min(1, dt * 6);
    this.rodElev = this.rodElev == null ? elev : damp(this.rodElev, elev, st === 'flying' ? 30 : 8, dt);
    this.rodBend = this.rodBend == null ? bend : damp(this.rodBend, bend, 10, dt);
    const f = fwd(this.rodYaw), r = right(this.rodYaw);
    const base = EYE.clone().addScaledVector(right(this.aimView ?? this.rodYaw), 0.3).add(new THREE.Vector3(0, -0.74, 0)).addScaledVector(fwd(this.aimView ?? this.rodYaw), 0.34);
    const dir0 = f.multiplyScalar(Math.cos(this.rodElev)).addScaledVector(UP, Math.sin(this.rodElev)).addScaledVector(r, 0.08).normalize();
    // 待機時はルアーが竿先からぶら下がる
    if (st === 'ready' || st === 'charge') {
      const tip = this.rod.tip;
      const hang = tip.clone().add(new THREE.Vector3(Math.sin(this.time * 1.3) * 0.05, -0.55, Math.cos(this.time * 1.1) * 0.05));
      this.lure.pos.copy(hang);
      this.lure.root.position.copy(hang);
      this.lure.root.rotation.set(0, this.rodYaw + Math.PI / 2, -1.2);
    }
    this.rod.update(base, dir0, end, this.rodBend, this.reelHeld && (st === 'retrieve' || st === 'fight') ? 1 : 0, dt);
    const guides = [this.rod.spool.getWorldPosition(new THREE.Vector3()), ...this.rod.guidePoints()];
    const slack = st === 'fight' ? clamp((this.fight?.slack || 0) * 0.5, 0, 1) * 0.8 + 0.02 : st === 'retrieve' ? (this.reelHeld ? 0.12 : 0.45) : st === 'flying' ? 0.3 : 0.05;
    const lineEnd = (st === 'retrieve' || st === 'bite') ? this.lure.pos.clone().addScaledVector(this.lure.dir, this.lure.noseLen) : end;
    this.line.setPath(this.rod.tip, lineEnd, slack, guides);
    this.line.update(this.camera, this.viewH);
  }

  // ================================================================ カメラ
  updateCamera(dt) {
    const cam = this.camera;
    const st = this.state;
    let wantFov = 55;
    this.pipActive = false;
    this.aimView = null;
    if (st === 'title') {
      const a = this.time * 0.05 + 0.6;
      cam.position.set(Math.sin(a) * 16, 4.2 + Math.sin(this.time * 0.1), -6 + Math.cos(a) * 16);
      cam.lookAt(0, 1.2, -18);
    } else if (st === 'ready' || st === 'charge') {
      this.anglerView(dt, this.aimYaw, -0.1);
    } else if (st === 'flying') {
      const lp = this.lure.pos;
      const back = fwd(this.aimYaw).multiplyScalar(-4.5);
      const want = lp.clone().add(back).add(new THREE.Vector3(0.6, 1.6, 0));
      want.y = Math.max(want.y, 1.2);
      cam.position.lerp(want, Math.min(1, dt * 4));
      this.camTarget.lerp(lp, Math.min(1, dt * 8));
      cam.lookAt(this.camTarget);
    } else if (st === 'retrieve' || st === 'bite') {
      if (this.view === 'under') {
        const lp = this.lure.pos.clone();
        lp.y = Math.min(lp.y, -0.35);
        const delta = lp.clone().sub(this.prevLure);
        cam.position.add(delta);
        this.prevLure.copy(lp);
        this.controls.target.copy(lp);
        this.controls.update();
        const bed = seabedY(cam.position.x, cam.position.z) + 0.2;
        cam.position.y = clamp(cam.position.y, bed, -0.25);
        this.underOffset = cam.position.clone().sub(lp);
      } else {
        this.anglerView(dt, bearingOf(this.lure.pos.x, this.lure.pos.z), -0.18, this.lure.pos);
      }
    } else if (st === 'fight' && this.fight) {
      const fp = this.fight.fish.pos;
      this.anglerView(dt, bearingOf(fp.x, fp.z) * 0.8, -0.2, fp);
      wantFov = clamp(58 - this.fight.lineOut * 0.9, 30, 55) * (this.fight.jump ? 0.75 : 1);
      this.pipActive = true;
      this.updatePipCam(dt);
    } else if (st === 'landing' || st === 'result') {
      const fp = this.land.fish.pos;
      const a = 0.9 + (this.landT || 0) * 0.12;
      const want = new THREE.Vector3(fp.x + Math.sin(a) * 2.2, 2.7, fp.z - Math.cos(a) * 2.2 + 0.6);
      cam.position.lerp(want, Math.min(1, dt * 2));
      this.camTarget.lerp(fp, Math.min(1, dt * 4));
      cam.lookAt(this.camTarget);
    }
    if (Math.abs(cam.fov - wantFov) > 0.05) {
      cam.fov = damp(cam.fov, wantFov, 3, dt);
      cam.updateProjectionMatrix();
      this.particles.setScale(this.viewH * this.renderer.getPixelRatio(), cam.fov);
      this.uw.setScale(this.viewH * this.renderer.getPixelRatio(), cam.fov);
    }
    // 揺れ
    if (this.shake > 0.001) {
      cam.position.x += (Math.random() - 0.5) * this.shake * 0.06;
      cam.position.y += (Math.random() - 0.5) * this.shake * 0.06;
      this.shake = Math.max(0, this.shake - dt * 2.5);
    }
    // 水面ぎりぎりを避ける
    if (Math.abs(cam.position.y) < 0.18) cam.position.y = cam.position.y < 0 ? -0.18 : 0.18;
    const under = cam.position.y < 0;
    if (under !== this.lastUnder) { this.audio.setUnder(under); this.lastUnder = under; }
    this.audio.setListener(cam.position);
    // PiP
    if (this.pipActive) {
      const w = Math.min(innerWidth * 0.42, 220), h = w * 0.64;
      this.pipRect = { x: innerWidth - w - 10, yTop: Math.min(innerHeight * 0.26, 170), w, h };
      this.ui.pip(this.pipRect);
    } else if (this.pipRect) { this.pipRect = null; this.ui.pip(null); }
  }

  anglerView(dt, yaw, pitch, look = null) {
    const cam = this.camera;
    this.viewYaw = this.viewYaw == null ? yaw : this.viewYaw + angleWrap(yaw - this.viewYaw) * Math.min(1, dt * 4);
    this.aimView = this.viewYaw;
    const pos = EYE.clone().addScaledVector(right(this.viewYaw), 0.05);
    cam.position.lerp(pos, Math.min(1, dt * 5));
    let target;
    if (look) {
      target = look.clone();
      target.y = Math.max(target.y * 0.35, -1.2) + 0.1;
      const toward = target.clone().sub(EYE);
      const dist = Math.hypot(toward.x, toward.z);
      if (dist < 6) target = EYE.clone().add(new THREE.Vector3(toward.x / dist * 6, -2.2, toward.z / dist * 6));
    } else {
      target = EYE.clone().add(fwd(this.viewYaw).multiplyScalar(20)).add(new THREE.Vector3(0, 20 * Math.tan(pitch) - 0.6, 0));
    }
    this.camTarget.lerp(target, Math.min(1, dt * 4));
    cam.lookAt(this.camTarget);
  }

  updatePipCam(dt) {
    const F = this.fight;
    const fp = F.fish.pos;
    const h = F.heading;
    const side = new THREE.Vector3(-h.z, 0, h.x);
    const d = 1.4 + F.fish.len * 2.2;
    const want = fp.clone().addScaledVector(side, d).addScaledVector(h, -d * 0.5);
    want.y = Math.min(fp.y + 0.3, -0.3);
    if (F.jump) want.y = -0.4;
    want.y = Math.max(want.y, seabedY(want.x, want.z) + 0.25);
    if (!this.pipInit) { this.pipCam.position.copy(want); this.pipInit = true; }
    this.pipCam.position.lerp(want, Math.min(1, dt * 3));
    this.pipCam.lookAt(fp);
  }

  // ================================================================ 描画
  setViewportSize() {
    const w = innerWidth, h = innerHeight;
    this.viewH = h;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const pr = this.renderer.getPixelRatio();
    this.post.setSize(w, h, pr);
    this.particles.setScale(h * pr, this.camera.fov);
    this.uw.setScale(h * pr, this.camera.fov);
  }

  render() {
    const r = this.renderer;
    const swap = this.pipActive && this.pipSwap;
    const main = swap ? this.pipCam : this.camera;
    const sub = swap ? this.camera : this.pipCam;
    main.aspect = innerWidth / innerHeight;
    main.updateProjectionMatrix();
    this.post.setCamera(main);
    const under = main.position.y < 0;
    this.uw.group.visible = under;
    const pu = this.post.u;
    pu.uTime.value = this.time;
    pu.uUnder.value = under ? 1 : 0;
    pu.uFlash.value = this.flash * 0.35;
    pu.uAberr.value = this.aberr;
    pu.uDanger.value = (this.danger || 0) * (0.6 + 0.4 * Math.sin(this.time * 14));
    this.post.render();
    if (this.pipActive && this.pipRect) {
      const R = this.pipRect;
      const y = innerHeight - R.yTop - R.h;
      sub.aspect = R.w / R.h;
      sub.updateProjectionMatrix();
      this.uw.group.visible = sub.position.y < 0;
      r.setScissorTest(true);
      r.setViewport(R.x, y, R.w, R.h);
      r.setScissor(R.x, y, R.w, R.h);
      r.clear();
      r.render(this.scene, sub);
      r.setScissorTest(false);
      r.setViewport(0, 0, innerWidth, innerHeight);
    }
  }
}
