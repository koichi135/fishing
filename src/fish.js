// 魚: 手続き生成モデル + 泳ぎシェーダ + 捕食魚AI
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { enhance, seabedY, REEFS, clamp, angleWrap, ANGLER } from './shared.js';
import { SPECIES, SPECIES_BY_ID } from './data.js';

// ------------------------------------------------------------------ 形状
function prof(t, peak, ped) {
  if (t < peak) { const u = t / peak; return Math.sqrt(Math.max(0, 1 - (1 - u) * (1 - u))); }
  if (t < 0.92) { const u = (t - peak) / (0.92 - peak); return 1 - (1 - ped) * (u * u * (3 - 2 * u)); }
  return ped;
}

/** 体のジオメトリ(全長1、ノーズ -X、尾 +X) */
export function bodyGeometry(sh, res = { S: 40, R: 20 }, ribbon = false) {
  const S = res.S, Rn = res.R;
  const bodyLen = ribbon ? 1.0 : 0.87;
  const pos = [];
  const idx = [];
  const upperAt = [], hwAt = [];
  for (let i = 0; i <= S; i++) {
    const t = i / S;
    const x = -0.5 + t * bodyLen;
    let hh, hw;
    if (ribbon) {
      const f = t < 0.08 ? Math.sqrt(t / 0.08) : 1 - Math.pow((t - 0.08) / 0.92, 1.6) * 0.97;
      hh = (sh.depth / 2) * f; hw = (sh.width / 2) * f;
    } else {
      hh = (sh.depth / 2) * prof(t, sh.peak, sh.ped);
      hw = (sh.width / 2) * prof(t, sh.peak * 0.8, Math.max(sh.ped * 0.6, 0.02));
    }
    hh = Math.max(hh, 0.002); hw = Math.max(hw, 0.0015);
    const up = hh * (1 + sh.asym), lo = hh * (1 - sh.asym * 0.5);
    const yc = sh.depth * 0.04 * Math.sin(Math.PI * t) - (1 - t) ** 6 * sh.depth * 0.08;
    upperAt.push(yc + up); hwAt.push(hw);
    for (let j = 0; j < Rn; j++) {
      const a = (j / Rn) * Math.PI * 2;
      const cy = Math.sin(a), cz = Math.cos(a);
      const y = yc + (cy > 0 ? up * cy : lo * cy);
      const z = hw * Math.sign(cz) * Math.pow(Math.abs(cz), 0.85);
      pos.push(x, y, z);
    }
  }
  for (let i = 0; i < S; i++) {
    for (let j = 0; j < Rn; j++) {
      const a = i * Rn + j, b = i * Rn + ((j + 1) % Rn), c = a + Rn, d = b + Rn;
      idx.push(a, c, b, b, c, d);
    }
  }
  // 先端と末端を閉じる
  const nose = pos.length / 3; pos.push(-0.5 - 0.004, upperAt[0] - sh.depth * 0.02, 0);
  const tail = pos.length / 3; pos.push(-0.5 + bodyLen + 0.004, (upperAt[S] + 0) * 0.3, 0);
  for (let j = 0; j < Rn; j++) {
    idx.push(nose, j, (j + 1) % Rn);
    idx.push(tail, S * Rn + ((j + 1) % Rn), S * Rn + j);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // 巻き順を確認(法線が外向きか)
  const n = g.attributes.normal;
  const mid = Math.floor(S / 2) * Rn + Math.floor(Rn / 4); // 上面付近
  if (n.getY(mid) < 0) {
    const ix = g.index.array;
    for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
    g.computeVertexNormals();
  }
  return { geo: g, bodyLen, upperAt, hwAt };
}

function shapeGeo(points, z = 0) {
  const s = new THREE.Shape();
  points.forEach(([x, y], i) => (i === 0 ? s.moveTo(x, y) : s.lineTo(x, y)));
  s.closePath();
  const g = new THREE.ShapeGeometry(s);
  g.translate(0, 0, z);
  g.deleteAttribute('uv');
  return g;
}

/** ヒレ一式 */
function finGeometry(sp, body) {
  const sh = sp.shape, f = sp.fins;
  const D = sh.depth;
  const geos = [];
  const upAt = (x) => {
    const t = clamp((x + 0.5) / body.bodyLen, 0, 1);
    return body.upperAt[Math.round(t * (body.upperAt.length - 1))];
  };
  const hwAt = (x) => {
    const t = clamp((x + 0.5) / body.bodyLen, 0, 1);
    return body.hwAt[Math.round(t * (body.hwAt.length - 1))];
  };
  const loAt = (x) => -upAt(x) * 0.8 + D * 0.03;
  const x0 = -0.5 + body.bodyLen - 0.03;
  const tipH = Math.max(D * 0.55, 0.075) * f.size;
  // 尾びれ
  if (f.tail === 'fork') geos.push(shapeGeo([[x0, 0.03], [x0 + 0.17, tipH], [x0 + 0.12, 0], [x0 + 0.17, -tipH], [x0, -0.03]]));
  else if (f.tail === 'deepfork') geos.push(shapeGeo([[x0, 0.02], [x0 + 0.18, tipH * 1.05], [x0 + 0.06, 0], [x0 + 0.18, -tipH * 1.05], [x0, -0.02]]));
  else if (f.tail === 'fan') geos.push(shapeGeo([[x0, 0.03], [x0 + 0.12, tipH * 0.85], [x0 + 0.155, tipH * 0.35], [x0 + 0.16, 0], [x0 + 0.155, -tipH * 0.35], [x0 + 0.12, -tipH * 0.85], [x0, -0.03]]));
  // 背びれ
  if (f.dorsal === 'spiny') {
    const pts = [];
    const xs = -0.2, xe = 0.02;
    pts.push([xs, upAt(xs) - 0.01]);
    const spikes = 8;
    for (let k = 0; k <= spikes; k++) {
      const x = xs + ((xe - xs) * k) / spikes;
      const h = D * (0.34 - Math.abs(k / spikes - 0.3) * 0.28) * f.size;
      pts.push([x, upAt(x) + h]);
      if (k < spikes) pts.push([x + (xe - xs) / spikes * 0.5, upAt(x) + h * 0.55]);
    }
    const x2s = 0.04, x2e = 0.26;
    pts.push([x2s, upAt(x2s) + D * 0.12]);
    pts.push([x2s + 0.04, upAt(x2s) + D * 0.26 * f.size]);
    pts.push([x2e - 0.03, upAt(x2e) + D * 0.16 * f.size]);
    pts.push([x2e, upAt(x2e) - 0.005]);
    for (let x = x2e; x >= xs; x -= 0.04) pts.push([x, upAt(x) - 0.012]);
    geos.push(shapeGeo(pts));
  } else if (f.dorsal === 'soft') {
    geos.push(shapeGeo([[-0.12, upAt(-0.12) - 0.01], [-0.06, upAt(-0.06) + D * 0.38 * f.size], [0.02, upAt(0.02) + D * 0.12], [0.3, upAt(0.3) + D * 0.08], [0.32, upAt(0.32) - 0.01], [0.1, upAt(0.1) - 0.012], [-0.12, upAt(-0.12) - 0.012]]));
  } else if (f.dorsal === 'flat' || f.dorsal === 'ribbon') {
    const xs = f.dorsal === 'flat' ? -0.4 : -0.42, xe = f.dorsal === 'flat' ? 0.33 : 0.46;
    const h = f.dorsal === 'flat' ? D * 0.1 : D * 0.35;
    const top = [], bot = [];
    for (let x = xs; x <= xe + 1e-6; x += 0.02) {
      const env = Math.max(0, Math.sin(Math.PI * (x - xs) / (xe - xs))) ** 0.5;
      top.push([x, upAt(x) + h * env]);
      bot.push([x, upAt(x) - 0.008]);
    }
    geos.push(shapeGeo([...top, ...bot.reverse()]));
    if (f.dorsal === 'flat') { // ヒラメは腹側にも長いヒレ
      const t2 = [], b2 = [];
      for (let x = -0.25; x <= 0.33; x += 0.02) {
        const env = Math.max(0, Math.sin(Math.PI * (x + 0.25) / 0.58)) ** 0.5;
        t2.push([x, -upAt(x) + 0.008]);
        b2.push([x, -upAt(x) - h * env]);
      }
      geos.push(shapeGeo([...t2, ...b2.reverse()]));
    }
  }
  // 尻びれ
  if (f.dorsal !== 'flat' && f.dorsal !== 'ribbon') {
    geos.push(shapeGeo([[0.06, loAt(0.06) + 0.01], [0.1, loAt(0.1) - D * 0.22 * f.size], [0.24, loAt(0.24) - D * 0.1], [0.27, loAt(0.27) + 0.01]]));
    // 腹びれ
    for (const s of [1, -1]) {
      const g = shapeGeo([[-0.2, 0], [-0.08, -D * 0.2 * f.size], [-0.1, 0]]);
      g.rotateX(s * 0.35);
      g.translate(0, loAt(-0.15) + 0.01, s * hwAt(-0.15) * 0.4);
      geos.push(g);
    }
  }
  // 胸びれ
  for (const s of [1, -1]) {
    const g = shapeGeo([[0, 0], [0.09 * f.size, D * 0.12], [0.11 * f.size, -D * 0.02], [0.02, -D * 0.05]]);
    g.rotateX(s * 1.1);
    g.rotateY(s * -0.35);
    g.translate(-0.3, -D * 0.08, s * hwAt(-0.3) * 0.92);
    geos.push(g);
  }
  return mergeGeometries(geos);
}

function eyeGeometry(sp, body) {
  const D = sp.shape.depth;
  const r = clamp(0.03 * Math.sqrt(D / 0.23), 0.014, 0.034);
  const x = -0.5 + body.bodyLen * 0.1;
  const t = (x + 0.5) / body.bodyLen;
  const k = Math.round(t * (body.upperAt.length - 1));
  const y = body.upperAt[k] * 0.35;
  const z = body.hwAt[k] * 0.86;
  const eyes = [], pupils = [];
  const sides = sp.flat ? [1] : [1, -1];
  for (const s of sides) {
    const e = new THREE.SphereGeometry(r, 12, 8); e.scale(1, 1, 0.5); e.translate(x, sp.flat ? y + r : y, s * z); eyes.push(e);
    const p = new THREE.SphereGeometry(r * 0.55, 10, 6); p.scale(1, 1, 0.5); p.translate(x - r * 0.05, sp.flat ? y + r : y, s * (z + r * 0.3)); pupils.push(p);
    if (sp.flat) { // ヒラメは両目が片側
      const e2 = e.clone(); e2.translate(0.05, D * 0.1, 0); eyes.push(e2);
      const p2 = p.clone(); p2.translate(0.05, D * 0.1, 0); pupils.push(p2);
    }
  }
  return { eyes: mergeGeometries(eyes), pupils: mergeGeometries(pupils) };
}

// ------------------------------------------------------------------ 泳ぎシェーダ
const SWIM_PARS = /* glsl */`
uniform float uSwimPhase;
uniform float uSwimAmp;
uniform float uBend;
uniform float uWaveK;
varying vec3 vFishLocal;
`;
const SWIM_NORMAL = /* glsl */`
vec3 objectNormal = vec3( normal );
#ifdef USE_TANGENT
  vec3 objectTangent = vec3( tangent.xyz );
#endif
float swT = clamp( position.x + 0.5, 0.0, 1.0 );
float swEnv = 0.1 + 0.9 * swT * swT;
float swPh = swT * uWaveK - uSwimPhase;
float swSlope = uSwimAmp * ( swEnv * cos( swPh ) * uWaveK + 1.8 * swT * sin( swPh ) ) + uBend * 2.0 * swT;
float swAng = atan( swSlope );
float cA = cos( swAng ), sA = sin( swAng );
objectNormal.xz = vec2( cA * objectNormal.x - sA * objectNormal.z, sA * objectNormal.x + cA * objectNormal.z );
`;
const SWIM_BEGIN = /* glsl */`
vec3 transformed = vec3( position );
transformed.z += uSwimAmp * swEnv * sin( swPh ) + uBend * swT * swT;
vFishLocal = position;
`;
const SWIM_BEGIN_NONORMAL = /* glsl */`
float swT = clamp( position.x + 0.5, 0.0, 1.0 );
float swEnv = 0.1 + 0.9 * swT * swT;
float swPh = swT * uWaveK - uSwimPhase;
vec3 transformed = vec3( position );
transformed.z += uSwimAmp * swEnv * sin( swPh ) + uBend * swT * swT;
vFishLocal = position;
`;
const BODY_FS_PARS = /* glsl */`
varying vec3 vFishLocal;
uniform vec3 uBack, uBelly, uStripe;
uniform float uStripeAmt, uSpots, uBars, uHalfH, uFlat;
`;
const BODY_COLOR = /* glsl */`
{
  vec3 L = vFishLocal;
  float hN = uFlat > 0.5 ? smoothstep( -0.004, 0.004, L.z ) : clamp( L.y / uHalfH * 0.5 + 0.5, 0.0, 1.0 );
  float sx = L.x + 0.5;
  vec3 fc = mix( uBelly, uBack, smoothstep( 0.4, 0.74, hN ) );
  if ( uFlat < 0.5 ) {
    float ll = 1.0 - smoothstep( 0.002, 0.007, abs( L.y - uHalfH * 0.32 - 0.01 * sin( sx * 3.1 ) ) );
    fc *= 1.0 - 0.22 * ll * step( 0.12, sx ) * ( 1.0 - step( 0.86, sx ) );
  }
  if ( uStripeAmt > 0.0 ) {
    float d = abs( hN - 0.52 );
    fc = mix( fc, uStripe, ( 1.0 - smoothstep( 0.03, 0.07, d ) ) * smoothstep( 0.08, 0.2, sx ) * ( 1.0 - smoothstep( 0.8, 0.9, sx ) ) * uStripeAmt );
  }
  if ( uSpots > 0.0 ) {
    vec2 sp = L.xy * 42.0 + L.z * 25.0;
    float n = sin( sp.x ) * sin( sp.y * 1.3 + sp.x * 0.4 );
    float spot = smoothstep( 0.72, 0.9, n ) * smoothstep( 0.45, 0.7, hN );
    vec3 sc = uFlat > 0.5 ? fc * 0.45 : vec3( 0.35, 0.65, 1.0 );
    fc = mix( fc, sc, spot * uSpots );
  }
  if ( uBars > 0.0 ) fc *= 1.0 - smoothstep( 0.3, 0.8, sin( sx * 40.0 ) ) * uBars * smoothstep( 0.45, 0.85, hN ) * 0.4;
  float scl = sin( L.x * 300.0 + sin( L.y * 260.0 ) * 1.6 ) * sin( L.y * 280.0 + L.x * 40.0 );
  fc *= 0.93 + 0.07 * scl;
  diffuseColor.rgb *= fc;
}
`;

const geoCache = new Map();
function speciesGeometry(sp) {
  if (geoCache.has(sp.id)) return geoCache.get(sp.id);
  const body = bodyGeometry(sp.shape, sp.ribbon ? { S: 60, R: 12 } : { S: 40, R: 20 }, !!sp.ribbon);
  const fins = finGeometry(sp, body);
  const eye = eyeGeometry(sp, body);
  const out = { body: body.geo, fins, eyes: eye.eyes, pupils: eye.pupils, halfH: sp.shape.depth * 0.5 };
  geoCache.set(sp.id, out);
  return out;
}

/** 魚モデル(Group)を生成。scale = 全長[m] */
export function buildFishModel(sp, lengthM, { forShowcase = false } = {}) {
  const g = speciesGeometry(sp);
  const uni = {
    uSwimPhase: { value: Math.random() * 10 },
    uSwimAmp: { value: 0.06 },
    uBend: { value: 0 },
    uWaveK: { value: sp.ribbon ? 11 : 5.5 },
  };
  const c = sp.colors;
  const bodyUni = Object.assign({
    uBack: { value: new THREE.Color(c.back) }, uBelly: { value: new THREE.Color(c.belly) },
    uStripe: { value: new THREE.Color(c.stripe || 0) }, uStripeAmt: { value: c.stripe ? 1 : 0 },
    uSpots: { value: c.spots || 0 }, uBars: { value: c.bars || 0 },
    uHalfH: { value: g.halfH }, uFlat: { value: sp.flat ? 1 : 0 },
  }, uni);
  const bodyMat = enhance(new THREE.MeshPhysicalMaterial({
    color: 0xffffff, metalness: 0.2 + c.sheen * 0.45, roughness: 0.3, clearcoat: 0.5, clearcoatRoughness: 0.25,
    iridescence: c.sheen * 0.7, iridescenceIOR: 1.35, iridescenceThicknessRange: [180, 520],
  }), {
    key: 'fishbody', caustics: !forShowcase, uniforms: bodyUni,
    vsPars: SWIM_PARS, beginNormal: SWIM_NORMAL, begin: SWIM_BEGIN, fsPars: BODY_FS_PARS, color: BODY_COLOR,
  });
  const finMat = enhance(new THREE.MeshStandardMaterial({
    color: c.fin, roughness: 0.5, metalness: 0.1, side: THREE.DoubleSide, transparent: true, opacity: 0.88,
  }), { key: 'fishfin', uniforms: uni, vsPars: SWIM_PARS, begin: SWIM_BEGIN_NONORMAL });
  const eyeMat = enhance(new THREE.MeshStandardMaterial({ color: sp.id === 'madai' ? 0xffd070 : 0xe8d890, metalness: 0.7, roughness: 0.2 }), { key: 'fisheye', uniforms: uni, vsPars: SWIM_PARS, begin: SWIM_BEGIN_NONORMAL });
  const pupilMat = enhance(new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.05, metalness: 0.2 }), { key: 'fishpupil', uniforms: uni, vsPars: SWIM_PARS, begin: SWIM_BEGIN_NONORMAL });

  const root = new THREE.Group();
  const inner = new THREE.Group(); // ヒラメは横倒し
  if (sp.flat) inner.rotation.x = -Math.PI / 2;
  root.add(inner);
  const body = new THREE.Mesh(g.body, bodyMat);
  const fins = new THREE.Mesh(g.fins, finMat);
  const eyes = new THREE.Mesh(g.eyes, eyeMat);
  const pupils = new THREE.Mesh(g.pupils, pupilMat);
  inner.add(body, fins, eyes, pupils);
  inner.scale.setScalar(lengthM);
  root.rotation.order = 'YZX';
  root.userData = { uni, lengthM, sp, inner };
  return root;
}

// ------------------------------------------------------------------ 捕食魚
function pickSize(sp) {
  const r = Math.pow(Math.random(), sp.skew);
  return Math.round(sp.min + (sp.max - sp.min) * r);
}

const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3();

export class Predator {
  constructor(sp, cm, pos) {
    this.sp = sp;
    this.cm = cm;
    this.len = cm / 100;
    this.model = buildFishModel(sp, this.len);
    this.model.position.copy(pos);
    this.pos = this.model.position;
    this.yaw = Math.random() * Math.PI * 2;
    this.pitch = 0;
    this.speed = 0.3;
    this.bend = 0;
    this.state = 'cruise';
    this.wp = pos.clone();
    this.cd = 2 + Math.random() * 3;
    this.chaseT = 0;
    this.mood = 0.6 + Math.random() * 0.8;
    this.t = 0;
    this.life = 90 + Math.random() * 90;
  }

  dir(out = tmpV) {
    const cp = Math.cos(this.pitch);
    return out.set(-Math.cos(this.yaw) * cp, Math.sin(this.pitch), Math.sin(this.yaw) * cp);
  }

  steer(target, speed, turn, dt) {
    const d = tmpV2.subVectors(target, this.pos);
    const dist = d.length();
    if (dist < 1e-4) return 0;
    d.divideScalar(dist);
    const desiredYaw = Math.atan2(d.z, -d.x);
    const dy = angleWrap(desiredYaw - this.yaw);
    const maxT = turn * dt;
    const step = clamp(dy, -maxT, maxT);
    this.yaw = angleWrap(this.yaw + step);
    this.bend += ((-step / Math.max(dt, 1e-3)) * 0.05 - this.bend) * Math.min(1, dt * 6);
    const desiredPitch = clamp(Math.asin(clamp(d.y, -1, 1)), -0.7, 0.7);
    this.pitch += (desiredPitch - this.pitch) * Math.min(1, dt * 3);
    this.speed += (speed - this.speed) * Math.min(1, dt * 3);
    const cp = Math.cos(this.pitch);
    const mv = Math.min(this.speed * dt, dist);
    this.pos.x += -Math.cos(this.yaw) * cp * mv;
    this.pos.z += Math.sin(this.yaw) * cp * mv;
    this.pos.y += Math.sin(this.pitch) * mv;
    return dist;
  }

  animate(dt) {
    const u = this.model.userData.uni;
    const bodyLens = this.speed / Math.max(this.len, 0.1);
    const freq = 0.9 + Math.min(bodyLens, 8) * 0.55;
    u.uSwimPhase.value += freq * Math.PI * 2 * dt;
    u.uSwimAmp.value = this.sp.ribbon ? 0.05 : 0.045 + Math.min(bodyLens, 6) * 0.006;
    u.uBend.value = clamp(this.bend, -0.25, 0.25);
    this.model.rotation.set(0, this.yaw, -this.pitch);
  }
}

export class FishManager {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
    this.target = 7;
    this.preset = 'day';
    this.spawnT = 0;
  }

  setPreset(p) {
    this.preset = p.id;
    this.target = Math.round(6 + p.activity * 2.5);
    this.clear();
    for (let i = 0; i < this.target; i++) this.spawn();
  }

  clear() {
    for (const f of this.list) this.scene.remove(f.model);
    this.list.length = 0;
  }

  chooseSpecies(nabura) {
    const pool = SPECIES.map((sp) => {
      let w = sp.weight * (sp.time[this.preset] ?? 1);
      if (nabura && sp.nabura) w *= sp.nabura;
      return [sp, w];
    }).filter(([, w]) => w > 0);
    const sum = pool.reduce((a, [, w]) => a + w, 0);
    let r = Math.random() * sum;
    for (const [sp, w] of pool) { r -= w; if (r <= 0) return sp; }
    return pool[0][0];
  }

  depthFor(sp, x, z) {
    const bed = seabedY(x, z);
    if (sp.depthPref === 'surface') return -(0.5 + Math.random() * 1.4);
    if (sp.depthPref === 'bottom') return bed + 0.3 + Math.random() * 0.7;
    return Math.max(bed + 0.6, -(0.9 + Math.random() * 3));
  }

  randomSpot(sp, near) {
    let x, z;
    if (near) {
      const a = Math.random() * Math.PI * 2, d = 3 + Math.random() * 8;
      x = near.x + Math.cos(a) * d; z = near.z + Math.sin(a) * d;
    } else if (sp.depthPref === 'bottom' && Math.random() < 0.6) {
      const r = REEFS[Math.floor(Math.random() * REEFS.length)];
      x = r.x + (Math.random() - 0.5) * r.r * 2.4; z = r.z + (Math.random() - 0.5) * r.r * 2.4;
    } else if (sp.id === 'tachiuo' || (this.preset === 'night' && Math.random() < 0.4)) {
      x = (Math.random() - 0.5) * 16; z = -5 - Math.random() * 16; // 常夜灯の明暗部
    } else {
      x = (Math.random() - 0.5) * 70; z = -8 - Math.random() * 48;
    }
    z = Math.min(z, -4.5);
    return new THREE.Vector3(x, this.depthFor(sp, x, z), z);
  }

  spawn(near = null) {
    const sp = this.chooseSpecies(!!near);
    const f = new Predator(sp, pickSize(sp), this.randomSpot(sp, near));
    f.wp.copy(this.randomSpot(sp, near));
    this.scene.add(f.model);
    this.list.push(f);
    return f;
  }

  remove(f) {
    this.scene.remove(f.model);
    const i = this.list.indexOf(f);
    if (i >= 0) this.list.splice(i, 1);
  }

  /**
   * ctx: { active, lurePos, lureDir, lureSpeed, lureType, events:{twitch, stop, bottom, pop}, nabura, onStrike(fish), onBite(fish), lureDepthOk }
   */
  update(dt, ctx) {
    this.spawnT -= dt;
    if (this.list.length < this.target && this.spawnT <= 0) {
      this.spawn(ctx.nabura && Math.random() < 0.6 ? ctx.nabura.pos : null);
      this.spawnT = 3;
    }
    if (ctx.nabura && Math.random() < dt * 0.25 && this.list.length < this.target + 3) this.spawn(ctx.nabura.pos);

    for (let i = this.list.length - 1; i >= 0; i--) {
      const f = this.list[i];
      f.t += dt;
      f.life -= dt;
      if (f.state === 'hooked' || f.state === 'biting') continue;
      f.cd = Math.max(0, f.cd - dt);
      const sp = f.sp;
      const d = ctx.active ? f.pos.distanceTo(ctx.lurePos) : 999;

      if (f.state === 'cruise') {
        const dist = f.steer(f.wp, 0.35 + f.len * 0.3, 1.2, dt);
        if (dist < 0.8) f.wp.copy(this.randomSpot(sp, ctx.nabura && sp.nabura && Math.random() < 0.7 ? ctx.nabura.pos : null));
        if (f.life <= 0 && d > 15) { f.state = 'leave'; f.wp.set(f.pos.x + (Math.random() - 0.5) * 60, f.pos.y, -80); }
        if (ctx.active && f.cd <= 0 && d < sp.detect) {
          const interest = this.interest(f, ctx, d);
          if (Math.random() < interest * dt * 2.4) { f.state = 'chase'; f.chaseT = 0; f.stopBonus = 0; }
        }
      } else if (f.state === 'chase') {
        f.chaseT += dt;
        if (!ctx.active) { f.state = 'cruise'; f.cd = 4; continue; }
        // ルアーの斜め後方に付く
        tmpV.copy(ctx.lureDir).multiplyScalar(-(0.45 + f.len * 0.9));
        tmpV.x += Math.sin(f.t * 1.7) * 0.2;
        tmpV.y += -0.08 + Math.sin(f.t * 1.3) * 0.06;
        tmpV.add(ctx.lurePos);
        f.steer(tmpV.clone(), Math.min(ctx.lureSpeed + 0.5 + (d > 2 ? d * 0.6 : 0), 3.2 + f.len * 2), 3.2, dt);
        const ev = ctx.events;
        const lf = sp.lures[ctx.lureType] ?? 1;
        let rate = 0.1 * f.mood * lf;
        if (ev.twitch) rate += 2.2 * lf;
        if (ev.stop) f.stopBonus = 1.2;
        if (ev.bottom && sp.depthPref === 'bottom') rate += 1.6 * lf;
        if (ev.pop && sp.depthPref !== 'bottom') rate += 2.0 * lf;
        f.stopBonus = Math.max(0, (f.stopBonus || 0) - dt);
        rate += f.stopBonus * 1.3 * lf;
        if (ctx.nabura && ctx.nabura.pos.distanceTo(ctx.lurePos) < 8) rate *= 2;
        if (d < 1.8 && Math.random() < rate * dt) { f.state = 'strike'; f.strikeT = 0; ctx.onStrike && ctx.onStrike(f); }
        const bored = ctx.lureSpeed < 0.05 && f.stopBonus <= 0 && f.chaseT > 2.5 && ctx.lureType !== 'popper';
        if (f.chaseT > 8 || d > sp.detect * 1.4 || bored) {
          f.state = 'cruise'; f.cd = 6 + Math.random() * 4;
          f.wp.copy(this.randomSpot(sp));
        }
      } else if (f.state === 'strike') {
        f.strikeT += dt;
        if (!ctx.active) { f.state = 'cruise'; f.cd = 4; continue; }
        const dist = f.steer(ctx.lurePos, 4.5 + f.len * 3, 7, dt);
        if (dist < 0.06 + f.len * 0.12) { f.state = 'biting'; ctx.onBite && ctx.onBite(f); }
        else if (f.strikeT > 1.6) { f.state = 'cruise'; f.cd = 5; }
      } else if (f.state === 'flee' || f.state === 'leave') {
        const dist = f.steer(f.wp, f.state === 'flee' ? 3.2 : 0.8, 3, dt);
        if (dist < 2 || f.pos.distanceTo(ANGLER) > 90) { this.remove(f); continue; }
      }
      if (f.state !== 'biting') {
        const bed = seabedY(f.pos.x, f.pos.z) + 0.2;
        if (f.pos.y < bed) f.pos.y = bed;
        if (f.pos.y > -0.15 && f.state !== 'strike') f.pos.y = -0.15;
        f.pos.z = Math.min(f.pos.z, -4.2);
      }
      f.animate(dt);
    }
  }

  interest(f, ctx, d) {
    const sp = f.sp;
    const lf = sp.lures[ctx.lureType] ?? 1;
    let speedFit;
    if (ctx.lureType === 'popper') speedFit = 0.6 + (ctx.events.pop ? 1.5 : 0);
    else speedFit = Math.exp(-Math.pow((ctx.lureSpeed - sp.speed) / sp.speedTol, 2)) + (ctx.events.twitch ? 0.8 : 0) + (ctx.lureSpeed < 0.1 && ctx.lureType === 'vib' ? 0.2 : 0);
    const depthGap = Math.abs(f.pos.y - ctx.lurePos.y);
    const depthFit = Math.exp(-Math.pow(depthGap / (sp.depthPref === 'surface' ? 2.2 : 1.8), 2));
    const time = sp.time[this.preset] ?? 1;
    let v = 0.9 * lf * speedFit * depthFit * time * f.mood * (1 - d / sp.detect);
    if (ctx.nabura && ctx.nabura.pos.distanceTo(ctx.lurePos) < 8) v *= 2.5;
    return v;
  }

  flee(f) {
    f.state = 'flee';
    f.wp.set(f.pos.x + (Math.random() - 0.5) * 40, clamp(f.pos.y - 1, -6, -0.5), f.pos.z - 30);
  }
}

export { pickSize, SPECIES_BY_ID };
