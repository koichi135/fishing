// 海底・岩礁・海藻・桟橋・遠景などの静的ワールド
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { enhance, seabedY, REEFS, fbm, vnoise, mulberry32, canvasTexture } from './shared.js';
import { waveHeight } from './water.js';

const rng = mulberry32(20260927);
const R = (a, b) => a + (b - a) * rng();

// ------------------------------------------------------------------ テクスチャ
function sandTexture() {
  return canvasTexture(256, 256, (c, w, h) => {
    const img = c.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const rip = Math.sin((x + Math.sin(y * 0.09) * 9) * 0.21) * 10;
        const n = (Math.random() - 0.5) * 46 + rip + fbm(x * 0.05, y * 0.05, 3) * 30;
        img.data[i] = 196 + n; img.data[i + 1] = 180 + n; img.data[i + 2] = 146 + n * 0.8; img.data[i + 3] = 255;
      }
    }
    c.putImageData(img, 0, 0);
  }, { repeat: 70 });
}

function woodTexture() {
  return canvasTexture(128, 512, (c, w, h) => {
    c.fillStyle = '#7a5a3a'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 90; i++) {
      c.strokeStyle = `rgba(${40 + Math.random() * 40},${25 + Math.random() * 25},${10},${0.15 + Math.random() * 0.25})`;
      c.lineWidth = 0.5 + Math.random() * 2;
      const x = Math.random() * w;
      c.beginPath(); c.moveTo(x, 0);
      for (let y = 0; y <= h; y += 16) c.lineTo(x + Math.sin(y * 0.02 + i) * 4, y);
      c.stroke();
    }
    for (let i = 0; i < 6; i++) { // 節
      const x = Math.random() * w, y = Math.random() * h;
      c.fillStyle = 'rgba(40,24,10,0.45)'; c.beginPath(); c.ellipse(x, y, 4, 9, 0, 0, Math.PI * 2); c.fill();
    }
  }, { repeat: 1 });
}

function concreteTexture() {
  return canvasTexture(256, 256, (c, w, h) => {
    c.fillStyle = '#9a9a94'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 4000; i++) {
      const v = 110 + Math.random() * 70;
      c.fillStyle = `rgba(${v},${v},${v - 6},0.25)`;
      c.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
    c.strokeStyle = 'rgba(60,60,60,0.35)'; c.lineWidth = 2;
    for (let y = 0; y < h; y += 64) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
    for (let x = 0; x < w; x += 128) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); }
  }, { repeat: 1 });
}

function windowTexture() {
  return canvasTexture(64, 128, (c, w, h) => {
    c.fillStyle = '#000'; c.fillRect(0, 0, w, h);
    for (let y = 4; y < h - 4; y += 8) {
      for (let x = 3; x < w - 3; x += 7) {
        if (Math.random() < 0.42) {
          const warm = Math.random() < 0.7;
          c.fillStyle = warm ? `rgba(255,${190 + Math.random() * 50},${110 + Math.random() * 60},1)` : 'rgba(190,220,255,1)';
          c.fillRect(x, y, 4, 4);
        }
      }
    }
  }, { repeat: 1 });
}

// ------------------------------------------------------------------ 本体
export class World {
  constructor(scene, quality) {
    this.scene = scene;
    this.quality = quality;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.lampLights = [];
    this.lampBulbs = [];
    this.lampCones = [];
    this.lampPositions = [];
    this.boats = [];
    this.buoys = [];
    this.blinkers = [];
    this.emissiveMats = [];

    this.buildSeabed();
    this.buildRocks();
    this.buildSeaweed();
    this.buildStarfish();
    this.buildPier();
    this.buildShore();
    this.buildScenery();
    this.buildBoats();
  }

  // ---------------------------------------------------------------- 海底
  buildSeabed() {
    const seg = this.quality === 'low' ? 110 : 170;
    const geo = new THREE.PlaneGeometry(340, 300, seg, seg);
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, 0, -120);
    const p = geo.attributes.position;
    const col = new Float32Array(p.count * 3);
    const cSand = new THREE.Color(0xc9b48a), cDeep = new THREE.Color(0x7d7d62), cMud = new THREE.Color(0x6b6048), cGravel = new THREE.Color(0x8a857a);
    const c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      const y = seabedY(x, z);
      p.setY(i, y);
      c.copy(cSand).lerp(cDeep, THREE.MathUtils.clamp((-y - 3.5) / 7, 0, 1));
      const mud = THREE.MathUtils.clamp(fbm(x * 0.03 + 50, z * 0.03, 3) * 1.8 + 0.1, 0, 1);
      c.lerp(cMud, mud * 0.55);
      for (const r of REEFS) {
        const d = Math.hypot(x - r.x, z - r.z);
        if (d < r.r * 1.6) c.lerp(cGravel, (1 - d / (r.r * 1.6)) * 0.6);
      }
      const v = 0.9 + vnoise(x * 0.8, z * 0.8) * 0.2;
      col[i * 3] = c.r * v; col[i * 3 + 1] = c.g * v; col[i * 3 + 2] = c.b * v;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const mat = enhance(new THREE.MeshStandardMaterial({ vertexColors: true, map: sandTexture(), roughness: 1, metalness: 0 }), { caustics: true, key: 'seabed' });
    const mesh = new THREE.Mesh(geo, mat);
    this.group.add(mesh);
  }

  rockGeometry(seed) {
    const g = new THREE.IcosahedronGeometry(1, this.quality === 'low' ? 1 : 2);
    const p = g.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).normalize();
      const n = fbm(v.x * 1.6 + seed, v.y * 1.6 + v.z * 1.3 - seed, 4);
      v.multiplyScalar(1 + n * 0.45);
      p.setXYZ(i, v.x, v.y, v.z);
    }
    return g;
  }

  buildRocks() {
    const geos = [];
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), t = new THREE.Vector3();
    const base = new THREE.Color(0x6e675c), moss = new THREE.Color(0x4f5e3a), dark = new THREE.Color(0x3a3630);
    const place = (x, z, sc) => {
      const g = this.rockGeometry(rng() * 100);
      const sy = sc * R(0.45, 0.85);
      q.setFromEuler(new THREE.Euler(R(0, 0.4), R(0, 6.28), R(0, 0.4)));
      s.set(sc * R(0.8, 1.3), sy, sc * R(0.8, 1.3));
      t.set(x, seabedY(x, z) + sy * 0.35, z);
      m.compose(t, q, s);
      g.applyMatrix4(m);
      g.computeVertexNormals();
      const n = g.attributes.normal, cnt = g.attributes.position.count;
      const col = new Float32Array(cnt * 3);
      const c = new THREE.Color();
      for (let i = 0; i < cnt; i++) {
        const ny = n.getY(i);
        c.copy(base).lerp(moss, THREE.MathUtils.clamp(ny, 0, 1) * 0.7).lerp(dark, THREE.MathUtils.clamp(-ny, 0, 1) * 0.6);
        const k = 0.85 + rng() * 0.25;
        col[i * 3] = c.r * k; col[i * 3 + 1] = c.g * k; col[i * 3 + 2] = c.b * k;
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.deleteAttribute('uv');
      geos.push(g);
    };
    for (const r of REEFS) {
      const n = Math.round(r.r * 1.6);
      for (let i = 0; i < n; i++) {
        const a = rng() * Math.PI * 2, d = Math.sqrt(rng()) * r.r;
        place(r.x + Math.cos(a) * d, r.z + Math.sin(a) * d, R(0.5, 1.7) * (1 - d / r.r * 0.5));
      }
    }
    for (let i = 0; i < 30; i++) place(R(-60, 60), R(-90, -4), R(0.2, 0.7));
    // 桟橋の根元の捨て石
    for (let i = 0; i < 14; i++) place(R(-3, 3), R(-4, 5), R(0.4, 0.9));
    const merged = mergeGeometries(geos);
    const mat = enhance(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true }), { caustics: true, key: 'rock' });
    this.group.add(new THREE.Mesh(merged, mat));
  }

  buildSeaweed() {
    const count = { low: 220, medium: 520, high: 800 }[this.quality] || 520;
    const geo = new THREE.PlaneGeometry(0.16, 1, 1, 8);
    geo.translate(0, 0.5, 0);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) { // 先細り
      const y = p.getY(i);
      p.setX(i, p.getX(i) * (1 - y * 0.75));
    }
    const mat = enhance(new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.75 }), {
      caustics: true, key: 'weed',
      begin: /* glsl */`
        vec3 transformed = vec3( position );
        float hgt = uv.y;
        #ifdef USE_INSTANCING
          float ph = instanceMatrix[3].x * 0.9 + instanceMatrix[3].z * 0.6;
        #else
          float ph = 0.0;
        #endif
        float sw = sin( uTime * 1.1 + ph + hgt * 2.2 ) * 0.22 + sin( uTime * 2.3 + ph * 1.7 ) * 0.05;
        transformed.x += sw * hgt * hgt;
        transformed.z += cos( uTime * 0.8 + ph ) * 0.12 * hgt * hgt;
      `,
    });
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), t = new THREE.Vector3();
    const cols = [0x4d6b2a, 0x6b7a2a, 0x7a5a2a, 0x3f5e38, 0x8a6a30];
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      let x, z;
      if (rng() < 0.75) {
        const r = REEFS[Math.floor(rng() * REEFS.length)];
        const a = rng() * Math.PI * 2, d = Math.sqrt(rng()) * r.r * 1.3;
        x = r.x + Math.cos(a) * d; z = r.z + Math.sin(a) * d;
      } else if (rng() < 0.4) {
        x = R(-3, 3); z = R(-4, 5);
      } else {
        x = R(-50, 50); z = R(-80, -5);
      }
      const h = R(0.5, 2.4);
      q.setFromEuler(new THREE.Euler(R(-0.15, 0.15), R(0, 6.28), R(-0.15, 0.15)));
      s.set(R(0.8, 1.6), h, 1);
      t.set(x, seabedY(x, z) - 0.05, z);
      m.compose(t, q, s);
      mesh.setMatrixAt(i, m);
      c.set(cols[Math.floor(rng() * cols.length)]).multiplyScalar(R(0.7, 1.15));
      mesh.setColorAt(i, c);
    }
    this.group.add(mesh);
  }

  buildStarfish() {
    const shape = new THREE.Shape();
    for (let i = 0; i <= 10; i++) {
      const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
      const r = i % 2 === 0 ? 0.1 : 0.04;
      if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r); else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.015, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 2 });
    geo.rotateX(-Math.PI / 2);
    const mat = enhance(new THREE.MeshStandardMaterial({ roughness: 0.8 }), { caustics: true, key: 'star' });
    const n = 40;
    const mesh = new THREE.InstancedMesh(geo, mat, n);
    const m = new THREE.Matrix4(), c = new THREE.Color();
    const cols = [0xe0662a, 0xd8452e, 0x8a4ab0, 0xf0a030];
    for (let i = 0; i < n; i++) {
      const x = R(-30, 30), z = R(-60, -3);
      const sc = R(0.7, 1.5);
      m.compose(new THREE.Vector3(x, seabedY(x, z) + 0.02, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, R(0, 6.28), 0)), new THREE.Vector3(sc, sc, sc));
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, c.set(cols[i % cols.length]));
    }
    this.group.add(mesh);
  }

  // ---------------------------------------------------------------- 桟橋
  buildPier() {
    const wood = woodTexture();
    const deckMat = enhance(new THREE.MeshStandardMaterial({ map: wood, roughness: 0.85, color: 0xcfc0a8 }), { key: 'wood' });
    const planks = [];
    for (let z = 6; z > -3.2; z -= 0.27) {
      const g = new THREE.BoxGeometry(4.2, 0.08, 0.25);
      g.translate(R(-0.04, 0.04), 1.16 + R(-0.008, 0.008), z);
      planks.push(g);
    }
    for (const x of [-1.8, 1.8]) {
      const g = new THREE.BoxGeometry(0.22, 0.3, 9.6);
      g.translate(x, 0.98, 1.4);
      planks.push(g);
    }
    this.group.add(new THREE.Mesh(mergeGeometries(planks), deckMat));

    // 杭(牡蠣・フジツボの付いた水中部分)
    const pileGeos = [];
    for (const x of [-1.8, 1.8]) {
      for (const z of [5.2, 2.6, 0, -2.9]) {
        const bottom = seabedY(x, z) - 0.3;
        const h = 1.1 - bottom;
        const g = new THREE.CylinderGeometry(0.17, 0.19, h, 14, 24);
        g.translate(x, bottom + h / 2, z);
        const p = g.attributes.position;
        const col = new Float32Array(p.count * 3);
        const cw = new THREE.Color(0x4a3a2a), ca = new THREE.Color(0x3d5a2e), cb = new THREE.Color(0x8a8578), c = new THREE.Color();
        for (let i = 0; i < p.count; i++) {
          const y = p.getY(i);
          if (y > 0.35) c.copy(cw);
          else if (y > -0.35) c.copy(ca);
          else {
            c.copy(cb).lerp(ca, vnoise(p.getX(i) * 9, y * 5) * 0.6);
            const r = 1 + vnoise(p.getZ(i) * 12 + y * 7, y * 9) * 0.25;
            p.setX(i, x + (p.getX(i) - x) * r);
            p.setZ(i, z + (p.getZ(i) - z) * r);
          }
          col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
        }
        g.setAttribute('color', new THREE.BufferAttribute(col, 3));
        g.deleteAttribute('uv');
        g.computeVertexNormals();
        pileGeos.push(g);
      }
    }
    const pileMat = enhance(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }), { caustics: true, key: 'pile' });
    this.group.add(new THREE.Mesh(mergeGeometries(pileGeos), pileMat));

    // 手すり
    const railGeos = [];
    for (const x of [-2.0, 2.0]) {
      for (let z = 6; z >= -3.0; z -= 1.5) {
        const g = new THREE.BoxGeometry(0.07, 1.0, 0.07);
        g.translate(x, 1.7, z);
        railGeos.push(g);
      }
      for (const y of [2.18, 1.7]) {
        const g = new THREE.BoxGeometry(0.06, 0.06, 9.1);
        g.translate(x, y, 1.5);
        railGeos.push(g);
      }
    }
    const railMat = enhance(new THREE.MeshStandardMaterial({ color: 0xd8d4c8, roughness: 0.5, metalness: 0.3 }), { key: 'rail' });
    this.group.add(new THREE.Mesh(mergeGeometries(railGeos), railMat));

    // 常夜灯
    const poleMat = enhance(new THREE.MeshStandardMaterial({ color: 0x3a4048, roughness: 0.5, metalness: 0.6 }), { key: 'pole' });
    for (const [x, z, dir] of [[-2.05, -2.9, -1], [2.05, 2.2, 1]]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 4.2, 10), poleMat);
      pole.position.set(x, 1.2 + 2.1, z);
      this.group.add(pole);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.06, 0.06), poleMat);
      arm.position.set(x + dir * 0.42, 5.3, z);
      this.group.add(arm);
      const head = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.28, 0.2, 14), poleMat);
      head.position.set(x + dir * 0.85, 5.22, z);
      this.group.add(head);
      const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0 });
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 8), bulbMat);
      bulb.position.set(x + dir * 0.85, 5.08, z);
      this.group.add(bulb);
      this.lampBulbs.push(bulbMat);
      const L = new THREE.PointLight(0xffc27a, 0, 38, 1.6);
      L.position.set(x + dir * 0.85, 4.95, z);
      this.group.add(L);
      this.lampLights.push(L);
      this.lampPositions.push(L.position.clone());
      // 光の円錐(夜霧に浮かぶ光)
      const coneGeo = new THREE.ConeGeometry(1.9, 5, 24, 1, true);
      coneGeo.translate(0, -2.5, 0);
      const coneMat = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        uniforms: { uInt: { value: 0 } },
        vertexShader: `varying float vY; varying vec3 vN; varying vec3 vV;
          void main(){ vY = -position.y / 5.0; vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `uniform float uInt; varying float vY; varying vec3 vN; varying vec3 vV;
          void main(){ float edge = pow(abs(dot(vN, vV)), 1.5); float a = (1.0 - vY) * edge * uInt * 0.1; gl_FragColor = vec4(vec3(1.0,0.78,0.5)*a, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          }`,
      });
      const cone = new THREE.Mesh(coneGeo, coneMat);
      cone.position.set(x + dir * 0.85, 5.1, z);
      this.group.add(cone);
      this.lampCones.push(coneMat);
    }

    // 小物: タックルボックスとバケツ
    const boxMat = enhance(new THREE.MeshStandardMaterial({ color: 0x2f6fb0, roughness: 0.45 }), { key: 'box' });
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.28, 0.3), boxMat);
    box.position.set(-1.1, 1.34, -1.6); box.rotation.y = 0.3;
    this.group.add(box);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.05, 0.32), enhance(new THREE.MeshStandardMaterial({ color: 0xe8e4d8, roughness: 0.5 }), { key: 'lid' }));
    lid.position.set(-1.1, 1.5, -1.6); lid.rotation.y = 0.3;
    this.group.add(lid);
    const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.14, 0.3, 16, 1, true), enhance(new THREE.MeshStandardMaterial({ color: 0xe86a2a, roughness: 0.6, side: THREE.DoubleSide }), { key: 'bucket' }));
    bucket.position.set(1.15, 1.35, -1.3);
    this.group.add(bucket);
  }

  buildShore() {
    const conc = concreteTexture();
    conc.repeat.set(60, 4);
    const mat = enhance(new THREE.MeshStandardMaterial({ map: conc, roughness: 0.9, color: 0xb8b4aa }), { caustics: true, key: 'quay' });
    const wall = new THREE.Mesh(new THREE.BoxGeometry(600, 14, 30), mat);
    wall.position.set(0, 1.2 - 7, 6.5 + 15);
    this.group.add(wall);
    // 背後の倉庫群
    const whMat = enhance(new THREE.MeshStandardMaterial({ color: 0x8a95a0, roughness: 0.8 }), { key: 'wh' });
    for (let i = 0; i < 9; i++) {
      const w = R(18, 40), h = R(6, 14), d = R(14, 22);
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), whMat);
      m.position.set(-120 + i * 32 + R(-5, 5), 1.2 + h / 2, R(40, 60));
      this.group.add(m);
    }
  }

  // ---------------------------------------------------------------- 遠景
  buildScenery() {
    const conc = concreteTexture();
    conc.repeat.set(40, 1);
    // 防波堤
    const bw = new THREE.Mesh(new THREE.BoxGeometry(360, 4, 8), enhance(new THREE.MeshStandardMaterial({ map: conc, roughness: 0.9, color: 0xa8a49a }), { caustics: true, key: 'bw' }));
    bw.position.set(-30, 0, -240);
    this.group.add(bw);
    // 消波ブロック(簡易テトラポッド)
    const tetra = (() => {
      const arms = [];
      const dirs = [[0, 1, 0], [0.94, -0.33, 0], [-0.47, -0.33, 0.82], [-0.47, -0.33, -0.82]];
      for (const d of dirs) {
        const g = new THREE.ConeGeometry(0.9, 2.2, 6);
        g.translate(0, 1.1, 0);
        g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...d)));
        arms.push(g);
      }
      return mergeGeometries(arms);
    })();
    const tn = this.quality === 'low' ? 60 : 140;
    const tMesh = new THREE.InstancedMesh(tetra, enhance(new THREE.MeshStandardMaterial({ color: 0xa09c92, roughness: 0.95 }), { key: 'tetra' }), tn);
    const m = new THREE.Matrix4();
    for (let i = 0; i < tn; i++) {
      m.compose(new THREE.Vector3(-205 + i * (350 / tn) + R(-1, 1), R(-0.8, 1.2), -234 + R(-1.5, 1.5)),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(R(0, 6), R(0, 6), R(0, 6))), new THREE.Vector3(1, 1, 1));
      tMesh.setMatrixAt(i, m);
    }
    this.group.add(tMesh);

    // 灯台
    const lh = new THREE.Group();
    lh.position.set(152, 2, -240);
    const white = enhance(new THREE.MeshStandardMaterial({ color: 0xf2f0ea, roughness: 0.6 }), { key: 'lhw' });
    const red = enhance(new THREE.MeshStandardMaterial({ color: 0xd8342a, roughness: 0.5 }), { key: 'lhr' });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.6, 3, 20), white); base.position.y = 1.5; lh.add(base);
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 2.1, 14, 20), red); tower.position.y = 10; lh.add(tower);
    const gallery = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.0, 0.4, 20), white); gallery.position.y = 17.2; lh.add(gallery);
    this.lhLampMat = new THREE.MeshBasicMaterial({ color: 0xfff2c0 });
    const lantern = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 1.6, 16), this.lhLampMat); lantern.position.y = 18.2; lh.add(lantern);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.3, 1.2, 16), red); roof.position.y = 19.6; lh.add(roof);
    const beamGeo = new THREE.ConeGeometry(9, 120, 20, 1, true);
    beamGeo.translate(0, -60, 0);
    beamGeo.rotateZ(Math.PI / 2);
    this.lhBeamMat = new THREE.MeshBasicMaterial({ color: 0xfff0c0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.lhBeam = new THREE.Mesh(beamGeo, this.lhBeamMat);
    this.lhBeam.position.y = 18.2;
    lh.add(this.lhBeam);
    this.group.add(lh);
    this.lighthousePos = new THREE.Vector3(152, 20.2, -240);

    // 対岸の街並み
    const win = windowTexture();
    const bcount = this.quality === 'low' ? 90 : 180;
    const bGeo = new THREE.BoxGeometry(1, 1, 1);
    bGeo.translate(0, 0.5, 0);
    this.cityMat = enhance(new THREE.MeshStandardMaterial({ color: 0x5a6470, roughness: 0.7, emissive: 0xffffff, emissiveMap: win, emissiveIntensity: 0 }), { key: 'city' });
    const city = new THREE.InstancedMesh(bGeo, this.cityMat, bcount);
    for (let i = 0; i < bcount; i++) {
      const x = R(-1100, 1100), z = R(-880, -1050);
      const h = Math.pow(rng(), 2.2) * 120 + 12;
      m.compose(new THREE.Vector3(x, -2, z), new THREE.Quaternion(), new THREE.Vector3(R(14, 40), h, R(14, 30)));
      city.setMatrixAt(i, m);
      if (h > 90 && this.blinkers.length < 10) this.addBlinker(new THREE.Vector3(x, h, z), 0xff2a1a, 3.5, 1.2);
    }
    this.group.add(city);

    // ガントリークレーン
    const craneMat = enhance(new THREE.MeshStandardMaterial({ color: 0xd84a3a, roughness: 0.6 }), { key: 'crane' });
    const craneW = enhance(new THREE.MeshStandardMaterial({ color: 0xe8e8e2, roughness: 0.6 }), { key: 'craneW' });
    for (let i = 0; i < 5; i++) {
      const g = new THREE.Group();
      g.position.set(-520 + i * 55, 0, -760);
      for (const lx of [-8, 8]) for (const lz of [-6, 6]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(1.4, 34, 1.4), i % 2 ? craneW : craneMat);
        leg.position.set(lx, 17, lz); g.add(leg);
      }
      const top = new THREE.Mesh(new THREE.BoxGeometry(20, 4, 14), craneW); top.position.y = 36; g.add(top);
      const boom = new THREE.Mesh(new THREE.BoxGeometry(2, 2.5, 70), craneMat);
      boom.position.set(0, 38, 20 + (i % 3) * 4); boom.rotation.x = i === 2 ? -0.9 : 0; g.add(boom);
      this.group.add(g);
      this.addBlinker(new THREE.Vector3(g.position.x, 41, -760), 0xff2a1a, 2.5, 1.6 + i * 0.3);
    }

    // 山並み
    const mg = new THREE.PlaneGeometry(3600, 260, 180, 1);
    const mp = mg.attributes.position;
    for (let i = 0; i < mp.count; i++) {
      if (mp.getY(i) > 0) {
        const x = mp.getX(i);
        mp.setY(i, 10 + Math.max(0, fbm(x * 0.0024, 3.3, 5) * 150 + 55));
      } else mp.setY(i, -20);
    }
    const mountains = new THREE.Mesh(mg, enhance(new THREE.MeshBasicMaterial({ color: 0x2c3a4c }), { key: 'mtn' }));
    mountains.position.set(0, 0, -1650);
    this.group.add(mountains);
  }

  addBlinker(pos, color, size, period) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0 });
    const s = new THREE.Mesh(new THREE.SphereGeometry(size, 8, 6), mat);
    s.position.copy(pos);
    this.group.add(s);
    this.blinkers.push({ mat, period, phase: rng() * 3 });
  }

  buildBoats() {
    const hullGeo = new THREE.BoxGeometry(2.4, 1.0, 7, 4, 2, 8);
    const p = hullGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const z = p.getZ(i), y = p.getY(i);
      let x = p.getX(i);
      const bow = THREE.MathUtils.clamp((-z - 1.2) / 2.3, 0, 1);
      x *= 1 - bow * 0.95;
      if (y < 0) x *= 0.55;
      p.setX(i, x);
      if (y > 0) p.setY(i, y + bow * 0.35);
    }
    hullGeo.computeVertexNormals();
    const hullMats = [0xf2f2ee, 0x2a5aa0].map((c) => enhance(new THREE.MeshStandardMaterial({ color: c, roughness: 0.5 }), { key: 'hull' + c, caustics: true }));
    const cabinMat = enhance(new THREE.MeshStandardMaterial({ color: 0xe8e8e0, roughness: 0.5 }), { key: 'cabin' });
    const defs = [[-34, -72, 0.6, 0], [46, -118, -2.2, 1], [-120, -180, 1.2, 0]];
    for (const [x, z, rot, mi] of defs) {
      const g = new THREE.Group();
      const hull = new THREE.Mesh(hullGeo, hullMats[mi]); hull.position.y = 0.15; g.add(hull);
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.3, 2.2), cabinMat); cabin.position.set(0, 1.2, 0.8); g.add(cabin);
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 3.2), cabinMat); mast.position.set(0, 3.2, 0.6); g.add(mast);
      const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff0d0, transparent: true, opacity: 0.2 });
      const light = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), lightMat); light.position.set(0, 4.8, 0.6); g.add(light);
      g.position.set(x, 0, z);
      g.rotation.y = rot;
      g.userData = { x, z, rot, lightMat };
      this.group.add(g);
      this.boats.push(g);
    }
    // ブイ
    for (const [x, z, c] of [[-22, -60, 0xd8342a], [26, -64, 0x2aa04a], [-60, -130, 0xd8342a]]) {
      const g = new THREE.Group();
      const mat = enhance(new THREE.MeshStandardMaterial({ color: c, roughness: 0.5 }), { key: 'buoy' + c, caustics: true });
      const f = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.8, 1.4, 16), mat); f.position.y = 0.1; g.add(f);
      const top = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.8, 12), mat); top.position.y = 1.7; g.add(top);
      const lm = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.2 });
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), lm); l.position.y = 2.7; g.add(l);
      g.position.set(x, 0, z);
      g.userData = { x, z, lm, phase: rng() * 4 };
      this.group.add(g);
      this.buoys.push(g);
    }
  }

  // ---------------------------------------------------------------- 時間帯反映
  apply(p) {
    const lamp = p.lamps;
    this.lampOn = lamp;
    for (const L of this.lampLights) L.intensity = lamp * 55; // 点灯数を固定してシェーダ再コンパイルを避ける
    for (const b of this.lampBulbs) b.color.setRGB(1, 0.85, 0.62).multiplyScalar(lamp > 0 ? 3 + lamp * 5 : 0.6);
    for (const c of this.lampCones) c.uniforms.uInt.value = p.night ? lamp : lamp * 0.25;
    this.cityMat.emissiveIntensity = p.night ? 1.4 : p.id === 'dusk' ? 0.35 : 0;
    this.lhLampMat.color.setRGB(1, 0.95, 0.75).multiplyScalar(p.night || p.id === 'dusk' ? 6 : 1);
    this.night = p.night;
    this.lhBeamMat.opacity = p.night ? 0.08 : p.id === 'dusk' ? 0.03 : 0;
    this.lhBeam.visible = this.lhBeamMat.opacity > 0;
    for (const b of this.boats) b.userData.lightMat.opacity = p.night ? 1 : 0.15;
  }

  update(dt, t) {
    for (const b of this.boats) {
      const { x, z, rot } = b.userData;
      b.position.y = waveHeight(x, z, t) * 1.2;
      b.rotation.set((waveHeight(x, z - 2, t) - waveHeight(x, z + 2, t)) * 0.25, rot, (waveHeight(x - 1, z, t) - waveHeight(x + 1, z, t)) * 0.4);
    }
    for (const b of this.buoys) {
      const { x, z, lm, phase } = b.userData;
      b.position.y = waveHeight(x, z, t) * 1.3;
      b.rotation.set(Math.sin(t * 0.9 + phase) * 0.08, 0, Math.cos(t * 0.7 + phase) * 0.08);
      lm.opacity = this.night ? ((t + phase) % 4 < 0.5 ? 1 : 0.1) : 0.15;
    }
    for (const bl of this.blinkers) bl.mat.opacity = this.night ? (((t + bl.phase) % bl.period) < 0.35 ? 1 : 0.05) : 0;
    if (this.lhBeam.visible) this.lhBeam.rotation.y = t * 0.9;
  }
}
