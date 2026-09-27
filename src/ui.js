// DOM UI: 画面遷移・HUD・設定・図鑑・魚探
import { PRESETS, SPECIES, LURES, LURE_ORDER } from './data.js';

const $ = (id) => document.getElementById(id);

// ------------------------------------------------------------------ 保存
const LS_SET = 'bayside.settings.v1';
const LS_REC = 'bayside.records.v1';
function load(key, def) {
  try { return Object.assign(def, JSON.parse(localStorage.getItem(key) || '{}')); } catch (e) { return def; }
}
export const Store = {
  settings: load(LS_SET, { quality: 'auto', drag: 'mid', sound: 'on', vibe: 'on', finder: 'on' }),
  records: load(LS_REC, { species: {}, total: 0, bestScore: 0, sessions: 0 }),
  save() {
    try {
      localStorage.setItem(LS_SET, JSON.stringify(this.settings));
      localStorage.setItem(LS_REC, JSON.stringify(this.records));
    } catch (e) { /* プライベートモード等 */ }
  },
};

export class UI {
  constructor() {
    this.el = {};
    for (const id of ['loader', 'loadBar', 'loadText', 'hud', 'banner', 'toast', 'hint', 'hDist', 'hDepth', 'hLure', 'hScore',
      'ctlReady', 'ctlRetrieve', 'ctlFight', 'btnReel', 'btnCast', 'btnTwitch', 'btnSpeed', 'btnView', 'btnLure', 'btnMenu',
      'powerWrap', 'powerFill', 'powerTxt', 'fightHud', 'tenFill', 'dragMark', 'lineOut', 'stamFill', 'fishArrow', 'fishDirTxt',
      'steer', 'steerKnob', 'qte', 'strike', 'finderWrap', 'finder', 'pipFrame', 'showcase',
      'rHead', 'rSpecies', 'rStars', 'rBadges', 'rLen', 'rWeight', 'rScore', 'rMeta', 'btnNext',
      'timeGrid', 'zkGrid', 'zkCount', 'lureList', 'tTotal', 'tBest']) this.el[id] = $(id);
    this.screens = ['scrTitle', 'scrTime', 'scrZukan', 'scrSettings', 'scrPause', 'sheetLure', 'scrResult'];
    this.stack = [];
    this.bannerT = 0;
    this.toastT = 0;
    this.finderCtx = this.el.finder.getContext('2d');
    this.finderAcc = 0;
    document.querySelectorAll('[data-back]').forEach((b) => b.addEventListener('click', () => this.back()));
    this.sizeFinder();
  }

  // ---------------------------------------------------------------- 画面
  open(id, { replace = false } = {}) {
    if (replace) this.closeAll();
    const cur = this.stack[this.stack.length - 1];
    if (cur && cur !== id && !$(id).classList.contains('sheet')) $(cur).classList.remove('show');
    $(id).classList.add('show');
    this.stack.push(id);
  }
  back() {
    const id = this.stack.pop();
    if (id) $(id).classList.remove('show');
    const prev = this.stack[this.stack.length - 1];
    if (prev) $(prev).classList.add('show');
    if (this.onBack) this.onBack(id, prev);
  }
  closeAll() {
    for (const s of this.screens) $(s).classList.remove('show');
    this.stack.length = 0;
  }
  isOpen(id) { return $(id).classList.contains('show'); }

  loading(p, text) {
    this.el.loadBar.style.width = Math.round(p * 100) + '%';
    if (text) this.el.loadText.textContent = text;
  }
  loaded() { this.el.loader.classList.add('hide'); setTimeout(() => (this.el.loader.style.display = 'none'), 700); }

  // ---------------------------------------------------------------- HUD
  hud(on) { this.el.hud.classList.toggle('show', on); }

  phase(ph) {
    const e = this.el;
    e.ctlReady.classList.toggle('show', ph === 'ready' || ph === 'charge');
    e.ctlRetrieve.classList.toggle('show', ph === 'retrieve' || ph === 'bite');
    e.ctlFight.classList.toggle('show', ph === 'fight');
    e.btnReel.classList.toggle('show', ph === 'retrieve' || ph === 'fight' || ph === 'bite' || ph === 'sink');
    e.fightHud.classList.toggle('show', ph === 'fight');
    e.powerWrap.classList.toggle('show', ph === 'charge');
    e.btnCast.classList.toggle('charging', ph === 'charge');
    e.finderWrap.classList.toggle('show', Store.settings.finder === 'on' && (ph === 'retrieve' || ph === 'sink' || ph === 'bite'));
    e.btnLure.style.opacity = ph === 'ready' ? 1 : 0.5;
    if (ph !== 'fight') this.qte(false);
  }

  banner(text, cls = '', dur = 1.6) {
    const b = this.el.banner;
    b.innerHTML = text;
    b.className = 'show ' + cls;
    this.bannerT = dur;
  }
  toast(text, dur = 2.5) {
    this.el.toast.textContent = text;
    this.el.toast.classList.add('show');
    this.toastT = dur;
  }
  hint(text) { if (this.el.hint.textContent !== text) this.el.hint.textContent = text; }

  tick(dt) {
    if (this.bannerT > 0) { this.bannerT -= dt; if (this.bannerT <= 0) this.el.banner.classList.remove('show'); }
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) this.el.toast.classList.remove('show'); }
  }

  stats({ dist, depth, score }) {
    const e = this.el;
    const d = dist == null ? '-' : dist.toFixed(1) + 'm';
    const dp = depth == null ? '-' : depth.toFixed(1) + 'm';
    if (e.hDist.textContent !== d) e.hDist.textContent = d;
    if (e.hDepth.textContent !== dp) e.hDepth.textContent = dp;
    const s = String(score);
    if (e.hScore.textContent !== s) e.hScore.textContent = s;
  }
  lureName(t) { this.el.hLure.textContent = LURES[t].short; }

  power(v, dist) {
    this.el.powerFill.style.width = (v * 100).toFixed(1) + '%';
    const perfect = v >= 0.86 && v <= 0.95;
    this.el.powerTxt.textContent = `飛距離 約${dist.toFixed(0)}m${perfect ? '  ★ジャストゾーン' : ''}`;
  }

  fight({ tension, drag, stamina, lineOut, dir, recommend }) {
    const e = this.el;
    e.tenFill.style.width = Math.min(100, tension).toFixed(0) + '%';
    e.tenFill.className = tension > 85 ? 'danger' : tension > 62 ? 'warn' : '';
    e.dragMark.style.left = drag + '%';
    e.fightHud.classList.toggle('danger', tension > 85);
    e.stamFill.style.width = (stamina * 100).toFixed(0) + '%';
    e.lineOut.textContent = lineOut.toFixed(1) + ' m';
    e.fishArrow.textContent = dir < -0.25 ? '◀' : dir > 0.25 ? '▶' : '▲';
    e.fishDirTxt.textContent = dir < -0.25 ? '左へ走っている' : dir > 0.25 ? '右へ走っている' : '沖へ走っている';
    const l = e.steer.querySelector('.l'), r = e.steer.querySelector('.r');
    l.classList.toggle('hot', recommend < 0);
    r.classList.toggle('hot', recommend > 0);
  }
  steerKnob(v) {
    const w = this.el.steer.clientWidth - 80;
    this.el.steerKnob.style.transform = `translateX(${(v * w) / 2}px)`;
  }

  strike(on, progress = 0) {
    this.el.strike.classList.toggle('show', on);
    if (on) this.el.strike.querySelector('.ring').style.transform = `scale(${1 - progress * 0.75})`;
  }
  qte(on) { this.el.qte.classList.toggle('show', on); }

  pip(rect) {
    const f = this.el.pipFrame;
    if (!rect) { f.classList.remove('show'); return; }
    f.classList.add('show');
    f.style.left = rect.x + 'px'; f.style.top = rect.yTop + 'px';
    f.style.width = rect.w + 'px'; f.style.height = rect.h + 'px';
  }

  // ---------------------------------------------------------------- リザルト
  result(r) {
    const e = this.el;
    e.rHead.textContent = r.head;
    e.rSpecies.textContent = r.name;
    e.rStars.textContent = '★'.repeat(r.stars) + '☆'.repeat(5 - r.stars);
    e.rLen.textContent = r.cm + ' cm';
    e.rWeight.textContent = r.kg < 1 ? Math.round(r.kg * 1000) + ' g' : r.kg.toFixed(2) + ' kg';
    e.rScore.textContent = r.score;
    e.rBadges.innerHTML = r.badges.map(([t, c]) => `<span class="${c || ''}">${t}</span>`).join('');
    e.rMeta.textContent = r.meta;
  }

  // ---------------------------------------------------------------- 各種リスト
  renderTimes(onPick) {
    this.el.timeGrid.innerHTML = '';
    for (const p of Object.values(PRESETS)) {
      const b = document.createElement('button');
      b.className = 'timeCard ' + p.id;
      b.innerHTML = `<span class="ico">${p.icon}</span><b>${p.label}</b><small>${p.desc}</small>`;
      b.addEventListener('click', () => onPick(p.id));
      this.el.timeGrid.appendChild(b);
    }
  }

  renderLures(current, onPick) {
    this.el.lureList.innerHTML = '';
    for (const id of LURE_ORDER) {
      const L = LURES[id];
      const b = document.createElement('button');
      b.className = 'lureItem' + (id === current ? ' on' : '');
      b.innerHTML = `<span class="sw" style="background:${L.swatch}"></span><span><b>${L.name}</b><small>${L.desc}</small></span>`;
      b.addEventListener('click', () => onPick(id));
      this.el.lureList.appendChild(b);
    }
  }

  renderZukan(thumbs) {
    const rec = Store.records.species;
    let got = 0;
    this.el.zkGrid.innerHTML = '';
    for (const sp of SPECIES) {
      const r = rec[sp.id];
      if (r) got++;
      const d = document.createElement('div');
      d.className = 'zkCard' + (r ? '' : ' locked');
      const img = r && thumbs[sp.id] ? `<img src="${thumbs[sp.id]}" alt="">` : `<div class="sil">${sp.emoji}</div>`;
      d.innerHTML = `${img}<b>${r ? sp.name : '？？？'}</b><span class="stars">${'★'.repeat(sp.rarity)}</span>` +
        `<small>${r ? `最大 ${r.best}cm ・ ${r.count}匹<br>${sp.desc}` : 'まだ釣っていない'}</small>`;
      this.el.zkGrid.appendChild(d);
    }
    this.el.zkCount.textContent = `${got} / ${SPECIES.length}`;
  }

  bindSettings(onChange) {
    document.querySelectorAll('.seg').forEach((seg) => {
      const key = seg.dataset.key;
      const sync = () => seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', Store.settings[key] === b.dataset.v));
      sync();
      seg.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
        const prev = Store.settings[key];
        Store.settings[key] = b.dataset.v;
        Store.save();
        sync();
        onChange(key, b.dataset.v, prev);
      }));
    });
  }

  titleStats() {
    this.el.tTotal.textContent = Store.records.total;
    this.el.tBest.textContent = Store.records.bestScore;
  }

  // ---------------------------------------------------------------- 魚探
  sizeFinder() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.el.finder.width = 132 * dpr;
    this.el.finder.height = 92 * dpr;
    this.finderScale = dpr;
    const c = this.finderCtx;
    c.fillStyle = '#04182c';
    c.fillRect(0, 0, this.el.finder.width, this.el.finder.height);
  }

  finder(dt, { bed, lure, fish, bait }) {
    this.finderAcc += dt;
    if (this.finderAcc < 1 / 24) return;
    this.finderAcc = 0;
    const cv = this.el.finder, c = this.finderCtx, W = cv.width, H = cv.height, s = this.finderScale;
    const maxD = 11;
    const Y = (d) => Math.min(H, (d / maxD) * H);
    c.drawImage(cv, -s, 0);
    const x = W - s;
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0a2a4a'); g.addColorStop(1, '#02101e');
    c.fillStyle = g; c.fillRect(x, 0, s, H);
    // 底
    const by = Y(bed);
    c.fillStyle = '#ff3a1a'; c.fillRect(x, by, s, 2 * s);
    c.fillStyle = '#b83a14'; c.fillRect(x, by + 2 * s, s, 4 * s);
    c.fillStyle = '#5a2a18'; c.fillRect(x, by + 6 * s, s, H);
    // ベイト
    for (const d of bait) { c.fillStyle = 'rgba(80,220,255,0.8)'; c.fillRect(x, Y(d) - s * 0.5, s, s); }
    // 魚
    for (const f of fish) {
      const h = Math.max(2, f.len * 6) * s;
      c.fillStyle = f.len > 0.6 ? '#ff4a2a' : f.len > 0.35 ? '#ffb030' : '#ffe060';
      c.fillRect(x, Y(f.depth) - h / 2, s, h);
    }
    // ルアー
    if (lure != null) { c.fillStyle = '#ffffff'; c.fillRect(x, Y(lure) - s, s, 2 * s); }
  }
}
