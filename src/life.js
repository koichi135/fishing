// ベイトの群れ・カモメ・ナブラ
import * as THREE from 'three';
import { enhance, seabedY } from './shared.js';
import { bodyGeometry } from './fish.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ------------------------------------------------------------------ ベイト(イワシの群れ)
export class BaitSchool {
  constructor(scene, quality) {
    this.n = { low: 50, medium: 110, high: 170 }[quality] || 110;
    const { geo } = bodyGeometry({ depth: 0.2, width: 0.1, peak: 0.34, ped: 0.06, asym: 0.05 }, { S: 12, R: 6 });
    // 尾びれを簡易に追加
    const tail = new THREE.BufferGeometry();
    tail.setAttribute('position', new THREE.Float32BufferAttribute([0.34, 0.01, 0, 0.5, 0.1, 0, 0.44, 0, 0, 0.34, -0.01, 0, 0.44, 0, 0, 0.5, -0.1, 0], 3));
    tail.computeVertexNormals();
    this.uPhase = { value: 0 };
    const mat = enhance(new THREE.MeshStandardMaterial({ color: 0xc8d8e4, metalness: 0.85, roughness: 0.25, side: THREE.DoubleSide }), {
      key: 'bait', caustics: true, uniforms: { uSwimPhase: this.uPhase },
      vsPars: 'uniform float uSwimPhase;',
      begin: /* glsl */`
        vec3 transformed = vec3( position );
        float ph = 0.0;
        #ifdef USE_INSTANCING
          ph = instanceMatrix[3].x * 3.1 + instanceMatrix[3].y * 5.3;
        #endif
        float t = clamp( position.x + 0.5, 0.0, 1.0 );
        transformed.z += 0.09 * t * t * sin( t * 6.0 - uSwimPhase - ph );
      `,
    });
    // 背中を青くするため頂点カラーを付ける
    const p = geo.attributes.position;
    const col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const up = p.getY(i) > 0.012;
      col[i * 3] = up ? 0.25 : 0.95; col[i * 3 + 1] = up ? 0.42 : 0.97; col[i * 3 + 2] = up ? 0.6 : 1.0;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    mat.vertexColors = true;
    const tcol = new Float32Array(tail.attributes.position.count * 3).fill(0.6);
    tail.setAttribute('color', new THREE.BufferAttribute(tcol, 3));
    const merged = new THREE.BufferGeometry();
    {
      const a = geo.toNonIndexed();
      const b = tail;
      const pos = new Float32Array(a.attributes.position.count * 3 + b.attributes.position.count * 3);
      pos.set(a.attributes.position.array, 0); pos.set(b.attributes.position.array, a.attributes.position.array.length);
      const cc = new Float32Array(pos.length);
      cc.set(a.attributes.color.array, 0); cc.set(b.attributes.color.array, a.attributes.color.array.length);
      merged.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      merged.setAttribute('color', new THREE.BufferAttribute(cc, 3));
      merged.computeVertexNormals();
    }
    this.mesh = new THREE.InstancedMesh(merged, mat, this.n);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.center = new THREE.Vector3(-6, -2.2, -22);
    this.target = this.center.clone();
    this.vel = new THREE.Vector3();
    this.fish = [];
    for (let i = 0; i < this.n; i++) {
      this.fish.push({
        a: Math.random() * Math.PI * 2, r: 0.4 + Math.random() * 1.6, h: (Math.random() - 0.5) * 1.2,
        w: (0.5 + Math.random() * 0.5) * (Math.random() < 0.5 ? 1 : -1), pos: this.center.clone(), yaw: 0, size: 0.07 + Math.random() * 0.04,
      });
    }
    this.scatter = 0;
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.e = new THREE.Euler(0, 0, 0, 'YZX');
    this.retarget = 0;
  }

  update(dt, t, { nabura, threats }) {
    this.uPhase.value += dt * 14;
    this.retarget -= dt;
    if (nabura) {
      this.target.set(nabura.pos.x, -0.5, nabura.pos.z);
    } else if (this.retarget <= 0) {
      const x = (Math.random() - 0.5) * 50, z = -10 - Math.random() * 40;
      this.target.set(x, Math.max(seabedY(x, z) + 1.5, -1.2 - Math.random() * 2.5), z);
      this.retarget = 15 + Math.random() * 15;
    }
    const to = this.target.clone().sub(this.center);
    const d = to.length();
    const sp = nabura ? 2.2 : 0.6;
    if (d > 0.3) this.vel.lerp(to.multiplyScalar(sp / d), Math.min(1, dt * 0.8));
    else this.vel.multiplyScalar(1 - dt);
    this.center.addScaledVector(this.vel, dt);
    // 脅威(捕食魚・ルアー)が近いと散る
    let scare = nabura ? 0.6 : 0;
    for (const th of threats) {
      const dd = th.distanceTo(this.center);
      if (dd < 4) scare = Math.max(scare, 1 - dd / 4);
    }
    this.scatter += (scare - this.scatter) * Math.min(1, dt * 3);
    const spread = 1 + this.scatter * 1.8;
    for (let i = 0; i < this.n; i++) {
      const f = this.fish[i];
      f.a += f.w * dt * (1 + this.scatter * 2);
      const tx = this.center.x + Math.cos(f.a) * f.r * spread;
      const tz = this.center.z + Math.sin(f.a) * f.r * spread;
      const ty = Math.min(this.center.y + f.h * spread + Math.sin(t * 0.8 + i) * 0.15, -0.08);
      const ox = f.pos.x, oz = f.pos.z, oy = f.pos.y;
      f.pos.x += (tx - f.pos.x) * Math.min(1, dt * 3);
      f.pos.y += (ty - f.pos.y) * Math.min(1, dt * 3);
      f.pos.z += (tz - f.pos.z) * Math.min(1, dt * 3);
      const vx = f.pos.x - ox, vz = f.pos.z - oz, vy = f.pos.y - oy;
      if (vx * vx + vz * vz > 1e-8) f.yaw = Math.atan2(vz, -vx);
      this.e.set(0, f.yaw, -Math.atan2(vy, Math.hypot(vx, vz) + 1e-5) * 0.6);
      this.q.setFromEuler(this.e);
      this.m.compose(f.pos, this.q, new THREE.Vector3(f.size, f.size, f.size));
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// ------------------------------------------------------------------ カモメ
function colored(geo, hex) {
  const c = new THREE.Color(hex);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  if (geo.index) return geo.toNonIndexed();
  return geo;
}
let gullParts = null;
function gullGeometry() {
  if (gullParts) return gullParts;
  const body = new THREE.SphereGeometry(0.12, 10, 8); body.scale(1, 0.9, 2.6);
  const head = new THREE.SphereGeometry(0.08, 10, 8); head.translate(0, 0.06, -0.3);
  const beak = new THREE.ConeGeometry(0.02, 0.09, 6); beak.rotateX(-Math.PI / 2); beak.translate(0, 0.05, -0.41);
  const tail = new THREE.ConeGeometry(0.07, 0.18, 4); tail.scale(1, 1, 0.25); tail.rotateX(Math.PI / 2); tail.translate(0, 0.02, 0.36);
  const strip = (g) => { g.deleteAttribute('uv'); return g; };
  const bodyGeo = mergeGeometries([colored(strip(body), 0xf4f4f0), colored(strip(head), 0xf4f4f0), colored(strip(beak), 0xf0c030), colored(strip(tail), 0xf4f4f0)]);
  const wing = (s) => {
    const inner = new THREE.PlaneGeometry(0.42, 0.22); inner.rotateX(-Math.PI / 2); inner.translate(s * 0.21, 0, 0);
    const outer = new THREE.PlaneGeometry(0.4, 0.16); outer.rotateX(-Math.PI / 2); outer.translate(s * 0.2, 0, 0.02);
    const tip = new THREE.PlaneGeometry(0.14, 0.12); tip.rotateX(-Math.PI / 2); tip.translate(s * 0.36, 0.001, 0.03);
    return { inner: colored(strip(inner), 0x9aa2aa), outer: mergeGeometries([colored(strip(outer), 0x9aa2aa), colored(strip(tip), 0x1a1a1a)]) };
  };
  gullParts = { body: bodyGeo, wings: { 1: wing(1), '-1': wing(-1) }, mat: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide }) };
  return gullParts;
}
function gullModel() {
  const parts = gullGeometry();
  const g = new THREE.Group();
  g.add(new THREE.Mesh(parts.body, parts.mat));
  const wings = [];
  for (const s of [1, -1]) {
    const pivot = new THREE.Group();
    pivot.position.set(s * 0.08, 0.04, -0.05);
    pivot.add(new THREE.Mesh(parts.wings[s].inner, parts.mat));
    const outerPivot = new THREE.Group();
    outerPivot.position.x = s * 0.42;
    outerPivot.add(new THREE.Mesh(parts.wings[s].outer, parts.mat));
    pivot.add(outerPivot);
    g.add(pivot);
    wings.push({ pivot, outerPivot, s });
  }
  g.userData.wings = wings;
  g.scale.setScalar(1.6);
  return g;
}

export class Birds {
  constructor(scene, n = 6) {
    this.birds = [];
    this.center = new THREE.Vector3(10, 12, -45);
    for (let i = 0; i < n; i++) {
      const m = gullModel();
      scene.add(m);
      this.birds.push({ m, a: Math.random() * Math.PI * 2, r: 6 + Math.random() * 10, h: 8 + Math.random() * 8, w: (0.25 + Math.random() * 0.25) * (i % 2 ? 1 : -1), flap: Math.random() * 10, dive: 0 });
    }
    this.wander = 0;
  }

  update(dt, t, { nabura, night, particles, water, audio }) {
    this.wander -= dt;
    const tgt = nabura ? new THREE.Vector3(nabura.pos.x, 7, nabura.pos.z) : null;
    if (tgt) this.center.lerp(tgt, Math.min(1, dt * 0.5));
    else if (this.wander <= 0) { this.wander = 20; this.center.set((Math.random() - 0.5) * 120, 18, -40 - Math.random() * 80); }
    for (const b of this.birds) {
      b.m.visible = !night;
      if (night) continue;
      b.a += b.w * dt;
      const x = this.center.x + Math.cos(b.a) * b.r, z = this.center.z + Math.sin(b.a) * b.r;
      let y = this.center.y + b.h * 0.5 + Math.sin(t * 0.5 + b.r) * 0.8;
      if (nabura && b.dive <= 0 && Math.random() < dt * 0.08) b.dive = 1.6;
      if (b.dive > 0) {
        b.dive -= dt;
        const k = Math.sin((1 - b.dive / 1.6) * Math.PI);
        y = y * (1 - k) + 0.2 * k;
        if (b.dive < 0.85 && b.dive + dt >= 0.85) {
          particles.splash(x, z, 0.5);
          water.ripple(x, z, 0.25, t);
        }
      }
      const prev = b.m.position.clone();
      b.m.position.set(x, y, z);
      const v = b.m.position.clone().sub(prev);
      if (v.lengthSq() > 1e-8) b.m.rotation.set(-Math.atan2(v.y, Math.hypot(v.x, v.z)) * 0.8, Math.atan2(-v.x, -v.z), -b.w * 0.8);
      const glide = b.dive > 0 ? 0 : (Math.sin(t * 0.3 + b.r) > 0.3 ? 0.15 : 1);
      b.flap += dt * 9 * (0.3 + glide);
      const f = Math.sin(b.flap) * 0.6 * glide + 0.08;
      for (const w of b.m.userData.wings) {
        w.pivot.rotation.z = w.s * f;
        w.outerPivot.rotation.z = w.s * f * 0.6;
      }
      if (nabura && Math.random() < dt * 0.02 && audio) audio.gull(x, y, z);
    }
  }
}

// ------------------------------------------------------------------ ナブラ
export class Nabura {
  constructor() {
    this.active = null;
    this.next = 18 + Math.random() * 20;
    this.splashT = 0;
    this.activity = 1;
  }
  setActivity(a) { this.activity = a; this.next = 12 + Math.random() * 20; this.active = null; }

  update(dt, t, { particles, water, audio, onStart }) {
    if (!this.active) {
      this.next -= dt * this.activity;
      if (this.next <= 0) {
        const a = THREE.MathUtils.degToRad((Math.random() - 0.5) * 70);
        const d = 18 + Math.random() * 26;
        this.active = { pos: new THREE.Vector3(Math.sin(a) * d, 0, -2.6 - Math.cos(a) * d), life: 22 + Math.random() * 16 };
        onStart && onStart(this.active);
      }
      return;
    }
    const n = this.active;
    n.life -= dt;
    n.pos.x += Math.sin(t * 0.2) * dt * 0.5;
    this.splashT -= dt;
    if (this.splashT <= 0) {
      this.splashT = 0.08 + Math.random() * 0.35;
      const a = Math.random() * Math.PI * 2, r = Math.random() * 3.2;
      const x = n.pos.x + Math.cos(a) * r, z = n.pos.z + Math.sin(a) * r;
      const big = Math.random() < 0.18;
      particles.splash(x, z, big ? 1.1 : 0.35);
      if (big) water.ripple(x, z, 0.3, t);
      if (big && audio) audio.splashAt(x, 0, z, 0.6);
    }
    if (n.life <= 0) {
      this.active = null;
      this.next = 35 + Math.random() * 40;
    }
  }
}
