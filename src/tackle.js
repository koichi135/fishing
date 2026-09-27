// タックル: ルアー(モデル+挙動)・ロッド・ライン・タモ網・着水マーカー
import * as THREE from 'three';
import { enhance, seabedY, RETRIEVE_POINT, clamp } from './shared.js';
import { waveHeight } from './water.js';
import { LURES } from './data.js';

// ------------------------------------------------------------------ ルアーのモデル
function trebleHook(scale = 1) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, metalness: 1, roughness: 0.25 });
  const shank = new THREE.Mesh(new THREE.CylinderGeometry(0.0007, 0.0007, 0.014, 5), mat);
  shank.position.y = -0.007;
  g.add(shank);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.0024, 0.0006, 5, 10), mat);
  g.add(ring);
  for (let k = 0; k < 3; k++) {
    const hook = new THREE.Mesh(new THREE.TorusGeometry(0.0045, 0.0007, 4, 10, Math.PI * 1.25), mat);
    hook.rotation.set(0, (k / 3) * Math.PI * 2, Math.PI * 0.95);
    hook.position.y = -0.016;
    const wrap = new THREE.Group();
    wrap.rotation.y = (k / 3) * Math.PI * 2;
    hook.rotation.set(0, 0, Math.PI * 1.05);
    hook.position.set(0.0045, -0.016, 0);
    wrap.add(hook);
    g.add(wrap);
  }
  g.scale.setScalar(scale);
  return g;
}

function latheBody(len, radius, profileFn, segs = 24) {
  const pts = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    pts.push(new THREE.Vector2(Math.max(profileFn(t) * radius, 0.0004), (t - 0.5) * len));
  }
  return pts;
}

function buildLure(type) {
  const L = LURES[type];
  const c = L.colors;
  const g = new THREE.Group();
  const side = new THREE.MeshPhysicalMaterial({ color: c.side, metalness: 0.85, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.08, iridescence: 0.5, iridescenceIOR: 1.5 });
  const back = new THREE.MeshPhysicalMaterial({ color: c.back, metalness: 0.4, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1 });
  const belly = new THREE.MeshPhysicalMaterial({ color: c.belly, metalness: 0.1, roughness: 0.35, clearcoat: 1 });
  let len, rad, flatZ, deep = 1, prof;
  if (type === 'minnow') { len = 0.11; rad = 0.012; flatZ = 0.6; prof = (t) => Math.sin(t * Math.PI) ** 0.75; }
  else if (type === 'pencil') { len = 0.1; rad = 0.0095; flatZ = 0.85; prof = (t) => Math.sin(t * Math.PI) ** 0.6 * (0.8 + 0.2 * t); }
  else if (type === 'vib') { len = 0.07; rad = 0.012; flatZ = 0.38; deep = 1.8; prof = (t) => Math.sin(t * Math.PI) ** 0.7; }
  else { len = 0.08; rad = 0.017; flatZ = 1; prof = (t) => (t < 0.08 ? 0.75 + t * 2 : Math.sin(Math.min(1, t * 1.05) * Math.PI * 0.5 + Math.PI * 0.5) ** 0.3 * (1 - t * 0.45)); }
  const pts = latheBody(len, rad, prof);
  const orient = (m) => { m.rotation.z = Math.PI / 2; m.scale.set(deep, 1, flatZ); return m; };
  const bodyM = orient(new THREE.Mesh(new THREE.LatheGeometry(pts, 24), side));
  g.add(bodyM);
  const backM = orient(new THREE.Mesh(new THREE.LatheGeometry(pts, 24, Math.PI * 0.12, Math.PI * 0.76), back));
  backM.scale.multiplyScalar(1.015);
  g.add(backM);
  const bellyM = orient(new THREE.Mesh(new THREE.LatheGeometry(pts, 16, Math.PI * 1.25, Math.PI * 0.5), belly));
  bellyM.scale.multiplyScalar(1.01);
  g.add(bellyM);
  // 目
  const eyeW = new THREE.MeshPhysicalMaterial({ color: 0xffd23a, metalness: 0.6, roughness: 0.2, clearcoat: 1 });
  const eyeB = new THREE.MeshBasicMaterial({ color: 0x080808 });
  const er = rad * 0.42 * (type === 'vib' ? 1.1 : 1);
  for (const s of [1, -1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(er, 10, 8), eyeW);
    e.scale.set(1, 1, 0.5);
    e.position.set(-len * 0.34, rad * 0.25 * deep, s * rad * flatZ * 0.72);
    g.add(e);
    const p = new THREE.Mesh(new THREE.SphereGeometry(er * 0.55, 8, 6), eyeB);
    p.position.set(-len * 0.345, rad * 0.25 * deep, s * rad * flatZ * 0.72 + s * er * 0.3);
    g.add(p);
  }
  if (type === 'minnow') {
    const lip = new THREE.Mesh(new THREE.PlaneGeometry(0.026, 0.03), new THREE.MeshPhysicalMaterial({ color: 0xdff0ff, transparent: true, opacity: 0.45, roughness: 0.05, side: THREE.DoubleSide, clearcoat: 1 }));
    lip.position.set(-len * 0.54, -rad * 0.7, 0);
    lip.rotation.set(0, Math.PI / 2, 0);
    lip.rotateX(-0.95);
    g.add(lip);
  }
  if (type === 'vib') {
    const eyeRing = new THREE.Mesh(new THREE.TorusGeometry(0.003, 0.0008, 5, 10), new THREE.MeshStandardMaterial({ color: 0xaaaaaa, metalness: 1, roughness: 0.3 }));
    eyeRing.position.set(-len * 0.12, rad * deep * 1.02, 0);
    g.add(eyeRing);
  }
  if (type === 'popper') {
    const cup = new THREE.Mesh(new THREE.CircleGeometry(rad * 0.62, 18), new THREE.MeshStandardMaterial({ color: 0x3a0a08, roughness: 0.6 }));
    cup.position.set(-len * 0.5 + 0.004, 0, 0);
    cup.rotation.y = -Math.PI / 2;
    g.add(cup);
    const feather = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.035, 8), new THREE.MeshStandardMaterial({ color: 0xff3a2a, roughness: 0.9 }));
    feather.rotation.z = Math.PI / 2;
    feather.position.set(len * 0.62, -0.004, 0);
    g.add(feather);
  }
  const hooks = type === 'vib' ? [[-len * 0.05, -rad * deep * 0.9], [len * 0.38, -rad * deep * 0.7]] : [[-len * 0.12, -rad * 0.95], [len * 0.36, -rad * 0.8]];
  for (const [hx, hy] of hooks) {
    const h = trebleHook(type === 'vib' ? 0.9 : 1);
    h.position.set(hx, hy, 0);
    g.add(h);
  }
  g.userData.len = len;
  return g;
}

export class Lure {
  constructor(scene) {
    this.root = new THREE.Group();
    this.root.rotation.order = 'YZX';
    this.models = {};
    for (const k of Object.keys(LURES)) {
      const m = buildLure(k);
      m.visible = false;
      this.root.add(m);
      this.models[k] = m;
    }
    this.type = 'minnow';
    this.models.minnow.visible = true;
    this.inner = this.models.minnow;
    scene.add(this.root);
    this.pos = new THREE.Vector3();
    this.dir = new THREE.Vector3(0, 0, 1);
    this.speed = 0;
    this.vy = 0;
    this.twitch = 0;
    this.events = { twitch: false, stop: false, bottom: false, pop: false };
    this.onBottom = false;
    this.prevSpeed = 0;
    this.popT = 0;
  }

  setType(t) {
    this.models[this.type].visible = false;
    this.type = t;
    this.models[t].visible = true;
    this.inner = this.models[t];
  }

  get noseLen() { return this.inner.userData.len * 0.5; }

  reset(pos) {
    this.pos.copy(pos);
    this.speed = 0; this.vy = 0; this.twitch = 0; this.prevSpeed = 0;
  }

  doTwitch() {
    this.twitch = 1;
    this.events.twitch = true;
    if (this.type === 'popper') { this.events.pop = true; this.popT = 0.35; }
  }

  /** 水中の挙動。returns true if lure reached the pier */
  update(dt, t, reeling, reelV) {
    const ev = this.events;
    ev.stop = false; ev.bottom = false;
    const tx = RETRIEVE_POINT.x - this.pos.x, tz = RETRIEVE_POINT.z - this.pos.z;
    const hd = Math.hypot(tx, tz);
    if (hd > 1e-3) this.dir.set(tx / hd, 0, tz / hd);
    const target = reeling ? reelV : 0;
    this.speed += (target - this.speed) * Math.min(1, dt * 3);
    if (this.twitch > 0) {
      this.speed += this.twitch * (this.type === 'popper' ? 4 : 7) * dt;
      this.twitch = Math.max(0, this.twitch - dt * 3.2);
    }
    if (this.prevSpeed > 0.35 && this.speed < 0.3) ev.stop = true;
    this.prevSpeed = this.speed;
    const sp = this.speed;
    const surf = waveHeight(this.pos.x, this.pos.z, t);
    switch (this.type) {
      case 'minnow': {
        if (sp > 0.08) {
          const ty = -1.25 * Math.min(1, sp / 1.2);
          this.vy += ((ty - this.pos.y) * 1.4 - this.vy) * Math.min(1, dt * 4);
        } else this.vy += (0.24 - this.vy) * Math.min(1, dt * 2);
        break;
      }
      case 'pencil': this.vy += ((-0.3 + sp * 0.3) - this.vy) * Math.min(1, dt * 2); break;
      case 'vib': this.vy += ((-0.9 + sp * 0.8) - this.vy) * Math.min(1, dt * 3); break;
      default: this.vy = 0;
    }
    this.vy = clamp(this.vy, -1.2, 0.6);
    this.pos.x += this.dir.x * sp * dt;
    this.pos.z += this.dir.z * sp * dt;
    this.pos.y += this.vy * dt;
    if (this.type === 'popper') this.pos.y = surf - 0.005;
    else this.pos.y = Math.min(this.pos.y, surf - 0.025);
    const bed = seabedY(this.pos.x, this.pos.z) + 0.05;
    const wasBottom = this.onBottom;
    this.onBottom = this.pos.y <= bed + 0.01;
    if (this.pos.y < bed) { this.pos.y = bed; this.vy = Math.max(this.vy, 0); }
    if (this.onBottom && !wasBottom) ev.bottom = true;
    this.pose(dt, t, surf);
    return Math.hypot(this.pos.x - RETRIEVE_POINT.x, this.pos.z - RETRIEVE_POINT.z) < 1.4;
  }

  pose(dt, t, surf) {
    const sp = this.speed;
    const yaw = Math.atan2(this.dir.z, -this.dir.x);
    let roll = 0, yawOff = 0, pitch = 0, sway = 0;
    const sf = Math.min(1, sp / 1.1);
    if (this.type === 'minnow') {
      const ph = t * Math.PI * 2 * (2.2 + sp * 3);
      roll = 0.5 * sf * Math.sin(ph); yawOff = 0.28 * sf * Math.cos(ph); sway = 0.012 * sf * Math.cos(ph);
      pitch = (sp > 0.08 ? 0.22 : 0) - this.vy * 0.9;
    } else if (this.type === 'pencil') {
      const ph = t * Math.PI * 2 * (0.9 + sp * 0.8);
      roll = 0.35 * sf * Math.sin(ph); yawOff = 0.45 * sf * Math.sin(ph); sway = 0.03 * sf * Math.sin(ph);
      pitch = -this.vy * 1.2 + (sp < 0.1 ? 0.35 : 0);
    } else if (this.type === 'vib') {
      const ph = t * Math.PI * 2 * (7 + sp * 8);
      roll = 0.3 * sf * Math.sin(ph); yawOff = 0.1 * sf * Math.cos(ph);
      pitch = -this.vy * 0.6 + (sp < 0.1 ? 0.5 : 0.1);
    } else {
      pitch = -0.35 + Math.sin(t * 2) * 0.03;
      roll = (waveHeight(this.pos.x - 0.1, this.pos.z, t) - waveHeight(this.pos.x + 0.1, this.pos.z, t)) * 3;
      if (this.popT > 0) { this.popT -= dt; pitch -= Math.sin((this.popT / 0.35) * Math.PI) * 0.45; }
    }
    yawOff += this.twitch * 0.9 * Math.sin(t * 29);
    this.root.position.set(this.pos.x + this.dir.z * sway, this.pos.y, this.pos.z - this.dir.x * sway);
    this.root.rotation.set(roll, yaw + yawOff, clamp(pitch, -0.9, 0.9));
  }
}

// ------------------------------------------------------------------ ロッド
export class Rod {
  constructor(scene) {
    this.N = 26;
    this.R = 7;
    this.len = 2.75;
    const vCount = (this.N + 1) * this.R;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vCount * 3), 3).setUsage(THREE.DynamicDrawUsage));
    const col = new Float32Array(vCount * 3);
    const idx = [];
    const cGrip = new THREE.Color(0x222428), cSeat = new THREE.Color(0xb8bcc4), cBlank = new THREE.Color(0x1a2a4a), cTip = new THREE.Color(0xf2f2f2), cWrap = new THREE.Color(0xc8a040);
    this.radii = [];
    for (let i = 0; i <= this.N; i++) {
      const t = i / this.N;
      let c = cBlank, r = THREE.MathUtils.lerp(0.0105, 0.0022, Math.pow(t, 0.75));
      if (t < 0.15) { c = cGrip; r = 0.0135; }
      else if (t < 0.19) { c = cSeat; r = 0.0115; }
      else if (t > 0.97) c = cTip;
      else if (Math.abs(t - 0.2) < 0.012) c = cWrap;
      this.radii.push(r);
      for (let j = 0; j < this.R; j++) {
        const k = (i * this.R + j) * 3;
        col[k] = c.r; col[k + 1] = c.g; col[k + 2] = c.b;
      }
    }
    for (let i = 0; i < this.N; i++) {
      for (let j = 0; j < this.R; j++) {
        const a = i * this.R + j, b = i * this.R + ((j + 1) % this.R), c2 = a + this.R, d = b + this.R;
        idx.push(a, b, c2, b, d, c2);
      }
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(idx);
    this.geo = geo;
    this.mesh = new THREE.Mesh(geo, enhance(new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1 }), { key: 'rod' }));
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);

    const guideMat = new THREE.MeshStandardMaterial({ color: 0x999ca4, metalness: 1, roughness: 0.25 });
    this.guides = [0.34, 0.47, 0.58, 0.68, 0.77, 0.85, 0.92, 0.985].map((t, i) => {
      const s = THREE.MathUtils.lerp(0.012, 0.003, i / 7);
      const m = new THREE.Mesh(new THREE.TorusGeometry(s, s * 0.18, 5, 14), guideMat);
      scene.add(m);
      return { t, m, s };
    });

    // スピニングリール
    this.reel = new THREE.Group();
    const dark = new THREE.MeshPhysicalMaterial({ color: 0x2a2c30, metalness: 0.6, roughness: 0.3, clearcoat: 1 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xd0a040, metalness: 1, roughness: 0.25 });
    const silver = new THREE.MeshStandardMaterial({ color: 0xc8ccd4, metalness: 1, roughness: 0.2 });
    const stem = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.06, 0.012), dark); stem.position.y = -0.03; this.reel.add(stem);
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.03, 14, 10), dark); body.scale.set(1.2, 1, 0.9); body.position.set(0.005, -0.075, 0); this.reel.add(body);
    const rotor = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.022, 0.03, 18), dark); rotor.rotation.z = Math.PI / 2; rotor.position.set(0.045, -0.075, 0); this.reel.add(rotor);
    this.spool = new THREE.Mesh(new THREE.CylinderGeometry(0.023, 0.023, 0.025, 18), silver); this.spool.rotation.z = Math.PI / 2; this.spool.position.set(0.075, -0.075, 0); this.reel.add(this.spool);
    const lineOn = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.02, 18), new THREE.MeshStandardMaterial({ color: 0xa8f050, roughness: 0.6 })); lineOn.rotation.z = Math.PI / 2; lineOn.position.set(0.075, -0.075, 0); this.reel.add(lineOn);
    const bail = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.0015, 5, 16, Math.PI), gold); bail.rotation.set(0, Math.PI / 2, 0); bail.position.set(0.062, -0.075, 0); this.reel.add(bail);
    this.handle = new THREE.Group(); this.handle.position.set(0.005, -0.075, 0.03); this.reel.add(this.handle);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.05, 0.006), silver); arm.position.y = 0.025; this.handle.add(arm);
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.02, 10), gold); knob.rotation.x = Math.PI / 2; knob.position.set(0, 0.05, 0.012); this.handle.add(knob);
    scene.add(this.reel);

    this.pts = Array.from({ length: this.N + 1 }, () => new THREE.Vector3());
    this.tan = Array.from({ length: this.N + 1 }, () => new THREE.Vector3());
    this.tip = new THREE.Vector3();
    this.q = new THREE.Quaternion();
    this.reelAngle = 0;
  }

  setVisible(v) {
    this.mesh.visible = v; this.reel.visible = v;
    for (const g of this.guides) g.m.visible = v;
  }

  /**
   * base: 手元, dir0: 竿の向き(単位), lineTarget: ラインの先, bend: 0〜1
   */
  update(base, dir0, lineTarget, bend, reelSpeed, dt) {
    const N = this.N, seg = this.len / N;
    const d = dir0.clone();
    // 仮の先端からラインへの方向
    const approxTip = base.clone().addScaledVector(dir0, this.len);
    const lineDir = lineTarget.clone().sub(approxTip).normalize();
    let axis = new THREE.Vector3().crossVectors(dir0, lineDir);
    let theta = Math.acos(clamp(dir0.dot(lineDir), -1, 1)) * clamp(bend, 0, 1) * 0.92;
    if (axis.lengthSq() < 1e-6) { axis.set(1, 0, 0); theta = 0; }
    axis.normalize();
    // 自重でわずかに垂れる
    const sagAxis = new THREE.Vector3().crossVectors(dir0, new THREE.Vector3(0, -1, 0));
    const sag = sagAxis.lengthSq() > 1e-6 ? 0.06 : 0;
    sagAxis.normalize();
    let wsum = 0;
    for (let i = 0; i < N; i++) wsum += Math.pow(i / N, 2.2);
    this.pts[0].copy(base);
    for (let i = 0; i < N; i++) {
      this.tan[i].copy(d);
      this.pts[i + 1].copy(this.pts[i]).addScaledVector(d, seg);
      const w = Math.pow(i / N, 2.2) / wsum;
      this.q.setFromAxisAngle(axis, theta * w);
      d.applyQuaternion(this.q);
      if (sag) { this.q.setFromAxisAngle(sagAxis, sag * w); d.applyQuaternion(this.q); }
    }
    this.tan[N].copy(d);
    this.tip.copy(this.pts[N]);

    const p = this.geo.attributes.position;
    const side = new THREE.Vector3(), nrm = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i <= N; i++) {
      const T = this.tan[i];
      side.crossVectors(T, up);
      if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
      side.normalize();
      nrm.crossVectors(side, T).normalize();
      const r = this.radii[i];
      for (let j = 0; j < this.R; j++) {
        const a = (j / this.R) * Math.PI * 2;
        const ca = Math.cos(a) * r, sa = Math.sin(a) * r;
        p.setXYZ(i * this.R + j, this.pts[i].x + side.x * ca + nrm.x * sa, this.pts[i].y + side.y * ca + nrm.y * sa, this.pts[i].z + side.z * ca + nrm.z * sa);
      }
      if (i === Math.round(N * 0.165)) this.frameAt(this.reel, this.pts[i], T, nrm, side, 0);
    }
    p.needsUpdate = true;
    this.geo.computeVertexNormals();
    this.geo.computeBoundingSphere();
    for (const g of this.guides) {
      const f = g.t * N;
      const i = Math.min(N - 1, Math.floor(f));
      const k = f - i;
      const P = this.pts[i].clone().lerp(this.pts[i + 1], k);
      const T = this.tan[i].clone().lerp(this.tan[i + 1], k).normalize();
      side.crossVectors(T, up).normalize();
      nrm.crossVectors(side, T).normalize();
      g.m.position.copy(P).addScaledVector(nrm, -(this.radii[i] + g.s * 1.1));
      g.m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), T);
    }
    this.reelAngle += reelSpeed * dt * 12;
    this.handle.rotation.z = -this.reelAngle;
    this.spool.rotation.x = this.reelAngle * 0.3;
  }

  frameAt(obj, P, T, N, S) {
    const m = new THREE.Matrix4().makeBasis(T, N, S);
    obj.quaternion.setFromRotationMatrix(m);
    obj.position.copy(P);
  }

  /** ガイドを通るラインの経路(手元側→先端) */
  guidePoints() { return this.guides.map((g) => g.m.position); }
}

// ------------------------------------------------------------------ ライン(カメラ向きリボン)
export class FishingLine {
  constructor(scene, color = 0xb6ff5a) {
    this.N = 72;
    this.pts = Array.from({ length: this.N }, () => new THREE.Vector3());
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.N * 2 * 3), 3).setUsage(THREE.DynamicDrawUsage));
    const idx = [];
    for (let i = 0; i < this.N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    geo.setIndex(idx);
    this.geo = geo;
    this.mat = enhance(new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }), { key: 'line' });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
    scene.add(this.mesh);
    this.count = this.N;
  }

  /** tip→end の経路を作る。slack: 0(ピン)〜1(たるみ) */
  setPath(tip, end, slack, guides = null) {
    const P = this.pts;
    let k = 0;
    if (guides) for (const g of guides) if (k < 8) P[k++].copy(g);
    const rest = this.N - k;
    if (end.y < -0.02 && tip.y > 0) {
      const s0 = tip.y / (tip.y - end.y);
      const E = tip.clone().lerp(end, s0 * (1 - 0.45 * slack));
      E.y = 0.0;
      const nAir = Math.round(rest * 0.55);
      const dAir = tip.distanceTo(E);
      const C = tip.clone().add(E).multiplyScalar(0.5);
      C.y -= slack * dAir * 0.22 + dAir * 0.01;
      for (let i = 0; i < nAir; i++) {
        const t = i / (nAir - 1);
        P[k++].set(
          (1 - t) * (1 - t) * tip.x + 2 * (1 - t) * t * C.x + t * t * E.x,
          (1 - t) * (1 - t) * tip.y + 2 * (1 - t) * t * C.y + t * t * E.y,
          (1 - t) * (1 - t) * tip.z + 2 * (1 - t) * t * C.z + t * t * E.z);
      }
      const nW = this.N - k;
      const C2 = E.clone().add(end).multiplyScalar(0.5);
      C2.y -= slack * E.distanceTo(end) * 0.18;
      for (let i = 0; i < nW; i++) {
        const t = (i + 1) / nW;
        P[k++].set(
          (1 - t) * (1 - t) * E.x + 2 * (1 - t) * t * C2.x + t * t * end.x,
          (1 - t) * (1 - t) * E.y + 2 * (1 - t) * t * C2.y + t * t * end.y,
          (1 - t) * (1 - t) * E.z + 2 * (1 - t) * t * C2.z + t * t * end.z);
      }
    } else {
      const C = tip.clone().add(end).multiplyScalar(0.5);
      C.y -= slack * tip.distanceTo(end) * 0.2;
      for (let i = 0; i < rest; i++) {
        const t = i / (rest - 1);
        P[k++].set(
          (1 - t) * (1 - t) * tip.x + 2 * (1 - t) * t * C.x + t * t * end.x,
          (1 - t) * (1 - t) * tip.y + 2 * (1 - t) * t * C.y + t * t * end.y,
          (1 - t) * (1 - t) * tip.z + 2 * (1 - t) * t * C.z + t * t * end.z);
      }
    }
  }

  update(camera, heightPx) {
    const p = this.geo.attributes.position;
    const pxWorld = (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) / heightPx;
    const T = new THREE.Vector3(), V = new THREE.Vector3(), S = new THREE.Vector3();
    for (let i = 0; i < this.N; i++) {
      const a = this.pts[Math.max(0, i - 1)], b = this.pts[Math.min(this.N - 1, i + 1)];
      T.subVectors(b, a);
      if (T.lengthSq() < 1e-10) T.set(0, 0, 1);
      T.normalize();
      V.subVectors(camera.position, this.pts[i]);
      const dist = V.length();
      V.divideScalar(dist || 1);
      S.crossVectors(T, V);
      if (S.lengthSq() < 1e-8) S.set(1, 0, 0);
      S.normalize();
      const w = Math.max(dist * pxWorld * 1.1, 0.0006);
      const P = this.pts[i];
      p.setXYZ(i * 2, P.x + S.x * w, P.y + S.y * w, P.z + S.z * w);
      p.setXYZ(i * 2 + 1, P.x - S.x * w, P.y - S.y * w, P.z - S.z * w);
    }
    p.needsUpdate = true;
  }
}

// ------------------------------------------------------------------ タモ網
export class Net {
  constructor(scene) {
    this.group = new THREE.Group();
    const metal = new THREE.MeshStandardMaterial({ color: 0xc0c4cc, metalness: 1, roughness: 0.3 });
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.018, 2.4, 8), metal);
    handle.position.set(0, 1.2, 0);
    this.group.add(handle);
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.01, 6, 28), metal);
    hoop.rotation.x = Math.PI / 2;
    hoop.position.y = -0.02;
    this.group.add(hoop);
    const net = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.5, 20, 5, true), new THREE.MeshStandardMaterial({ color: 0xdcdcd0, wireframe: true, transparent: true, opacity: 0.55 }));
    net.rotation.x = Math.PI;
    net.position.y = -0.27;
    this.group.add(net);
    this.group.visible = false;
    scene.add(this.group);
  }
}

// ------------------------------------------------------------------ 着水予測マーカー
export class AimMarker {
  constructor(scene) {
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uCol: { value: new THREE.Color(0.4, 0.9, 1.0) } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv * 2.0 - 1.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform float uTime; uniform vec3 uCol; varying vec2 vUv;
        void main(){ float r = length(vUv); float ring = smoothstep(0.08,0.0,abs(r-0.8)) + smoothstep(0.06,0.0,abs(r - fract(uTime*0.8)*0.8))*0.6 + smoothstep(0.12,0.0,r)*0.8;
        gl_FragColor = vec4(uCol * ring, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        }`,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.mat);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.renderOrder = 5;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }
  set(x, z, size, t) {
    this.mesh.position.set(x, 0.12, z);
    this.mesh.scale.setScalar(size);
    this.mat.uniforms.uTime.value = t;
  }
}
