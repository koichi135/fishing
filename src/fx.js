// パーティクル(しぶき・泡・飛沫)と水中エフェクト(ゴッドレイ・マリンスノー)
import * as THREE from 'three';
import { U } from './shared.js';

// ------------------------------------------------------------------ 汎用パーティクル
const P_VERT = /* glsl */`
attribute float aSize;
attribute float aAlpha;
attribute float aType;
uniform float uScale;
varying float vAlpha;
varying float vType;
varying float vUnder;
void main() {
  vec4 mv = modelViewMatrix * vec4( position, 1.0 );
  gl_PointSize = aSize * uScale / max( -mv.z, 0.1 );
  gl_Position = projectionMatrix * mv;
  vAlpha = aAlpha;
  vType = aType;
  vUnder = step( position.y, 0.0 );
}
`;
const P_FRAG = /* glsl */`
uniform vec3 uSpray;
uniform vec3 uBubble;
varying float vAlpha;
varying float vType;
varying float vUnder;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float r = length( c );
  if ( r > 0.5 ) discard;
  vec3 col;
  float a;
  if ( vType < 0.5 ) {               // しぶき
    a = smoothstep( 0.5, 0.05, r );
    col = uSpray;
  } else if ( vType < 1.5 ) {        // 泡
    float ring = smoothstep( 0.5, 0.42, r ) * ( 0.25 + smoothstep( 0.25, 0.45, r ) );
    float hl = smoothstep( 0.16, 0.0, length( c - vec2( -0.15, -0.15 ) ) );
    a = ring + hl;
    col = uBubble * ( 1.0 + hl * 2.0 );
  } else {                           // 水面の白泡
    a = smoothstep( 0.5, 0.0, r ) * 0.7;
    col = uSpray * 0.9;
  }
  gl_FragColor = vec4( col, a * vAlpha );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export class Particles {
  constructor(max = 1600) {
    this.max = max;
    this.n = 0;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.type = new Float32Array(max);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aType', new THREE.BufferAttribute(this.type, 1).setUsage(THREE.DynamicDrawUsage));
    this.material = new THREE.ShaderMaterial({
      vertexShader: P_VERT, fragmentShader: P_FRAG, transparent: true, depthWrite: false,
      uniforms: { uScale: { value: 400 }, uSpray: { value: new THREE.Color(1, 1, 1) }, uBubble: { value: new THREE.Color(0.7, 0.85, 0.95) } },
    });
    this.points = new THREE.Points(this.geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 3;
  }

  setScale(heightPx, fov) {
    this.material.uniforms.uScale.value = heightPx / (2 * Math.tan(THREE.MathUtils.degToRad(fov) / 2));
  }

  setLight(l) {
    this.material.uniforms.uSpray.value.setRGB(1, 1, 1).multiplyScalar(l);
    this.material.uniforms.uBubble.value.setRGB(0.65, 0.85, 0.95).multiplyScalar(Math.max(0.25, l));
  }

  emit(type, x, y, z, vx, vy, vz, life, size) {
    if (this.n >= this.max) return;
    const i = this.n++;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.life[i] = life; this.maxLife[i] = life; this.size[i] = size; this.type[i] = type; this.alpha[i] = 1;
  }

  /** 水面のスプラッシュ */
  splash(x, z, strength = 1, y = 0.02) {
    const n = Math.round(22 * strength + 6);
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2;
      const s = (0.6 + Math.random() * 1.8) * Math.sqrt(strength);
      const up = (1.6 + Math.random() * 3.2) * Math.sqrt(strength);
      this.emit(0, x + Math.cos(a) * 0.08, y, z + Math.sin(a) * 0.08, Math.cos(a) * s, up, Math.sin(a) * s, 0.6 + Math.random() * 0.7, 0.03 + Math.random() * 0.06 * strength);
    }
    for (let k = 0; k < n * 0.5; k++) {
      const a = Math.random() * Math.PI * 2, d = Math.random() * 0.5 * Math.sqrt(strength);
      this.emit(2, x + Math.cos(a) * d, 0.03, z + Math.sin(a) * d, Math.cos(a) * 0.3, 0, Math.sin(a) * 0.3, 1.2 + Math.random() * 1.2, 0.15 + Math.random() * 0.25 * strength);
    }
    this.bubbles(x, -0.1, z, Math.round(10 * strength), 0.3 * strength);
  }

  bubbles(x, y, z, n, spread = 0.1) {
    for (let k = 0; k < n; k++) {
      this.emit(1, x + (Math.random() - 0.5) * spread, y - Math.random() * spread, z + (Math.random() - 0.5) * spread,
        (Math.random() - 0.5) * 0.2, 0.2 + Math.random() * 0.4, (Math.random() - 0.5) * 0.2, 1.5 + Math.random() * 2.5, 0.012 + Math.random() * 0.025);
    }
  }

  /** 空中の水滴(魚を抜き上げたとき等) */
  drips(x, y, z, n, spread = 0.2) {
    for (let k = 0; k < n; k++) {
      this.emit(0, x + (Math.random() - 0.5) * spread, y + (Math.random() - 0.5) * spread * 0.5, z + (Math.random() - 0.5) * spread,
        (Math.random() - 0.5) * 0.6, Math.random() * 0.8, (Math.random() - 0.5) * 0.6, 0.8 + Math.random() * 0.6, 0.02 + Math.random() * 0.03);
    }
  }

  update(dt, time) {
    const p = this.pos, v = this.vel;
    let i = 0;
    while (i < this.n) {
      this.life[i] -= dt;
      const t = this.type[i];
      const i3 = i * 3;
      let dead = this.life[i] <= 0;
      if (!dead) {
        if (t === 0) {
          v[i3 + 1] -= 9.8 * dt;
          v[i3] *= 1 - dt * 0.8; v[i3 + 2] *= 1 - dt * 0.8;
          if (p[i3 + 1] < -0.05 && v[i3 + 1] < 0) dead = true;
        } else if (t === 1) {
          v[i3 + 1] = Math.min(v[i3 + 1] + dt * 1.2, 0.9);
          v[i3] = Math.sin(time * 6 + i) * 0.08;
          v[i3 + 2] = Math.cos(time * 5 + i * 1.3) * 0.08;
          if (p[i3 + 1] > -0.02) dead = true;
        } else {
          v[i3] *= 1 - dt * 1.5; v[i3 + 2] *= 1 - dt * 1.5;
          this.size[i] += dt * 0.12;
        }
      }
      if (dead) {
        const j = --this.n;
        if (j !== i) {
          p[i3] = p[j * 3]; p[i3 + 1] = p[j * 3 + 1]; p[i3 + 2] = p[j * 3 + 2];
          v[i3] = v[j * 3]; v[i3 + 1] = v[j * 3 + 1]; v[i3 + 2] = v[j * 3 + 2];
          this.life[i] = this.life[j]; this.maxLife[i] = this.maxLife[j]; this.size[i] = this.size[j]; this.type[i] = this.type[j];
        }
        continue;
      }
      p[i3] += v[i3] * dt; p[i3 + 1] += v[i3 + 1] * dt; p[i3 + 2] += v[i3 + 2] * dt;
      const r = this.life[i] / this.maxLife[i];
      this.alpha[i] = t === 1 ? Math.min(1, r * 3) : t === 2 ? r * r : Math.min(1, r * 2);
      i++;
    }
    this.geo.setDrawRange(0, this.n);
    for (const k of ['position', 'aSize', 'aAlpha', 'aType']) this.geo.attributes[k].needsUpdate = true;
  }
}

// ------------------------------------------------------------------ 水中エフェクト
const SNOW_VERT = /* glsl */`
attribute float aSeed;
uniform float uTime, uBox, uScale;
varying float vA;
void main() {
  vec3 p = position + vec3( sin( uTime * 0.21 + aSeed * 7.0 ) * 0.4, -uTime * 0.035, cos( uTime * 0.17 + aSeed * 5.0 ) * 0.4 );
  vec3 rel = mod( p - cameraPosition + uBox * 0.5, uBox ) - uBox * 0.5;
  vec3 w = cameraPosition + rel;
  vec4 mv = viewMatrix * vec4( w, 1.0 );
  float d = -mv.z;
  gl_PointSize = ( 0.012 + aSeed * 0.02 ) * uScale / max( d, 0.1 );
  gl_Position = projectionMatrix * mv;
  vA = smoothstep( uBox * 0.5, uBox * 0.2, length( rel ) ) * smoothstep( 0.2, 1.0, d ) * step( w.y, -0.05 );
}
`;
const SNOW_FRAG = /* glsl */`
uniform vec3 uCol;
varying float vA;
void main() {
  float r = length( gl_PointCoord - 0.5 );
  if ( r > 0.5 ) discard;
  gl_FragColor = vec4( uCol, smoothstep( 0.5, 0.1, r ) * vA * 0.7 );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const RAY_VERT = /* glsl */`
attribute vec2 aCorner;
attribute vec2 aCenter;
attribute float aWidth;
attribute float aSeed;
uniform float uTime, uBox, uLen;
uniform vec3 uSunDir;
varying vec2 vUv;
varying float vSeed;
varying float vFade;
void main() {
  vec2 rel = mod( aCenter - cameraPosition.xz + uBox * 0.5, uBox ) - uBox * 0.5;
  vec3 top = vec3( cameraPosition.x + rel.x, 0.0, cameraPosition.z + rel.y );
  vec3 dir = normalize( vec3( -uSunDir.x * 0.6, -1.0, -uSunDir.z * 0.6 ) );
  vec3 along = top + dir * ( aCorner.y * uLen );
  vec3 toCam = normalize( cameraPosition - along );
  vec3 side = normalize( cross( dir, toCam ) );
  vec3 w = along + side * aCorner.x * aWidth;
  vUv = aCorner;
  vSeed = aSeed;
  vFade = smoothstep( uBox * 0.5, uBox * 0.25, length( rel ) ) * smoothstep( 2.0, 7.0, length( cameraPosition - along ) );
  gl_Position = projectionMatrix * viewMatrix * vec4( w, 1.0 );
}
`;
const RAY_FRAG = /* glsl */`
uniform float uTime, uInt;
uniform vec3 uCol;
varying vec2 vUv;
varying float vSeed;
varying float vFade;
void main() {
  float edge = 1.0 - abs( vUv.x ) * 2.0;
  edge = edge * edge;
  float depthF = pow( 1.0 - vUv.y, 1.8 );
  float flick = 0.45 + 0.55 * sin( uTime * ( 0.35 + vSeed * 0.4 ) + vSeed * 30.0 );
  float top = smoothstep( 0.0, 0.12, vUv.y );
  float a = edge * depthF * top * flick * vFade * uInt * 0.09;
  gl_FragColor = vec4( uCol * a, 1.0 );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export class UnderwaterFX {
  constructor(quality) {
    this.group = new THREE.Group();
    const n = { low: 400, medium: 900, high: 1400 }[quality] || 900;
    const box = 22;
    const pos = new Float32Array(n * 3), seed = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = Math.random() * box; pos[i * 3 + 1] = Math.random() * box; pos[i * 3 + 2] = Math.random() * box;
      seed[i] = Math.random();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    this.snowMat = new THREE.ShaderMaterial({
      vertexShader: SNOW_VERT, fragmentShader: SNOW_FRAG, transparent: true, depthWrite: false,
      uniforms: { uTime: U.uTime, uBox: { value: box }, uScale: { value: 400 }, uCol: { value: new THREE.Color(0.7, 0.8, 0.8) } },
    });
    this.snow = new THREE.Points(g, this.snowMat);
    this.snow.frustumCulled = false;
    this.group.add(this.snow);

    // ゴッドレイ
    const rays = quality === 'low' ? 12 : 22;
    const rBox = 34;
    const corner = [], center = [], width = [], seedR = [], idx = [];
    for (let i = 0; i < rays; i++) {
      const cx = Math.random() * rBox, cz = Math.random() * rBox, w = 0.35 + Math.random() * 1.3, s = Math.random();
      const base = i * 4;
      for (const [x, y] of [[-0.5, 0], [0.5, 0], [0.5, 1], [-0.5, 1]]) {
        corner.push(x, y); center.push(cx, cz); width.push(w); seedR.push(s);
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(rays * 12), 3));
    rg.setAttribute('aCorner', new THREE.Float32BufferAttribute(corner, 2));
    rg.setAttribute('aCenter', new THREE.Float32BufferAttribute(center, 2));
    rg.setAttribute('aWidth', new THREE.Float32BufferAttribute(width, 1));
    rg.setAttribute('aSeed', new THREE.Float32BufferAttribute(seedR, 1));
    rg.setIndex(idx);
    this.rayMat = new THREE.ShaderMaterial({
      vertexShader: RAY_VERT, fragmentShader: RAY_FRAG, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: {
        uTime: U.uTime, uBox: { value: rBox }, uLen: { value: 11 }, uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        uInt: { value: 1 }, uCol: { value: new THREE.Color(0.6, 0.85, 0.9) },
      },
    });
    this.rays = new THREE.Mesh(rg, this.rayMat);
    this.rays.frustumCulled = false;
    this.rays.renderOrder = 2;
    this.group.add(this.rays);
  }

  setScale(heightPx, fov) {
    this.snowMat.uniforms.uScale.value = heightPx / (2 * Math.tan(THREE.MathUtils.degToRad(fov) / 2));
  }

  apply(p, sunDir) {
    this.rayMat.uniforms.uSunDir.value.copy(sunDir);
    this.rayMat.uniforms.uInt.value = p.godray;
    this.rayMat.uniforms.uCol.value.set(p.waterShallow).lerp(new THREE.Color(p.sunColor), 0.5).multiplyScalar(1.6);
    this.snowMat.uniforms.uCol.value.set(p.waterShallow).multiplyScalar(p.night ? 1.2 : 2.2);
  }
}
