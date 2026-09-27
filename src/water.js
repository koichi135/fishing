// 水面: Gerstner 波 + フレネル反射 + 波紋 + 水中からのスネルの窓
import * as THREE from 'three';
import { U } from './shared.js';

// [方向deg, 振幅m, 波長m]
const WAVE_DEF = [
  [-18, 0.085, 13.0],
  [34, 0.05, 7.2],
  [-72, 0.03, 4.1],
  [78, 0.016, 2.3],
];
const WAVES = WAVE_DEF.map(([deg, a, l]) => {
  const r = THREE.MathUtils.degToRad(deg);
  const k = (Math.PI * 2) / l;
  return { dx: Math.cos(r), dz: Math.sin(r), a, k, w: Math.sqrt(9.8 * k) };
});

/** 水面の高さ(JS側: ルアーやボートの上下動に使用) */
export function waveHeight(x, z, t) {
  let y = 0;
  for (const w of WAVES) y += w.a * Math.sin(w.k * (w.dx * x + w.dz * z) - w.w * t);
  return y;
}

const VERT = /* glsl */`
uniform float uTime;
uniform vec4 uWave[4];
uniform float uQ;
varying vec3 vWorld;
varying float vHeight;
void main() {
  vec3 p = ( modelMatrix * vec4( position, 1.0 ) ).xyz;
  float dist = length( p.xz - cameraPosition.xz );
  float fade = 1.0 - smoothstep( 90.0, 280.0, dist );
  vec3 disp = vec3( 0.0 );
  for ( int i = 0; i < 4; i++ ) {
    vec4 w = uWave[ i ];
    float k = w.w;
    float f = k * dot( w.xy, p.xz ) - sqrt( 9.8 * k ) * uTime;
    float qa = uQ / ( k * 4.0 );
    disp.xz += w.xy * qa * cos( f );
    disp.y += w.z * sin( f );
  }
  p += disp * fade;
  vHeight = disp.y * fade;
  vWorld = p;
  gl_Position = projectionMatrix * viewMatrix * vec4( p, 1.0 );
}
`;

const FRAG = /* glsl */`
uniform float uTime;
uniform vec4 uWave[4];
uniform float uQ;
uniform vec4 uRipple[8];
uniform samplerCube uEnv;
uniform vec3 uSunDir, uSunColor, uDeep, uShallow;
uniform float uSunStrength, uLight;
uniform vec4 uLamp[3];
uniform vec3 uLampColor;
uniform vec3 uWaterColor, uAirColor;
uniform float uWaterDensity, uAirDensity;
uniform vec3 uAbsorb;
varying vec3 vWorld;
varying float vHeight;

vec3 waveNormal( vec2 xz, float dist ) {
  float fade = 1.0 - smoothstep( 90.0, 280.0, dist );
  vec3 n = vec3( 0.0, 1.0, 0.0 );
  for ( int i = 0; i < 4; i++ ) {
    vec4 w = uWave[ i ];
    float k = w.w;
    float f = k * dot( w.xy, xz ) - sqrt( 9.8 * k ) * uTime;
    float c = cos( f );
    n.x -= w.x * k * w.z * c * fade;
    n.z -= w.y * k * w.z * c * fade;
    n.y -= uQ * 0.25 * sin( f ) * fade;
  }
  // 細かいさざ波
  float df = exp( -dist * 0.02 );
  for ( int j = 0; j < 6; j++ ) {
    float a = float( j ) * 2.39996 + 0.7;
    vec2 d = vec2( cos( a ), sin( a ) );
    float kk = 2.4 + float( j ) * 2.1;
    float ph = kk * dot( d, xz ) - sqrt( 9.8 * kk ) * uTime + float( j ) * 3.1;
    float amp = 0.017 / ( 1.0 + float( j ) * 0.4 );
    n.xz -= d * kk * amp * cos( ph ) * df;
  }
  // インタラクティブな波紋(着水・ヒット・ナブラ)
  for ( int r = 0; r < 8; r++ ) {
    vec4 rp = uRipple[ r ];
    float age = uTime - rp.z;
    if ( rp.w <= 0.0 || age < 0.0 || age > 5.0 ) continue;
    vec2 dv = xz - rp.xy;
    float rad = length( dv ) + 1e-3;
    float front = age * 1.7;
    float band = exp( -pow( ( rad - front ) * 1.6, 2.0 ) ) + exp( -pow( ( rad - front * 0.6 ) * 2.2, 2.0 ) ) * 0.6;
    float amp = rp.w * band * exp( -age * 0.8 ) / ( 1.0 + rad * 0.5 );
    n.xz += ( dv / rad ) * sin( ( rad - front ) * 11.0 ) * amp;
  }
  return normalize( n );
}

void main() {
  vec3 toCam = cameraPosition - vWorld;
  float dist = length( toCam );
  vec3 V = toCam / dist;
  vec3 N = waveNormal( vWorld.xz, dist );
  vec3 col;
  float alpha = 1.0;
  if ( gl_FrontFacing ) {
    float NdV = max( dot( N, V ), 0.0 );
    float fres = 0.02 + 0.98 * pow( 1.0 - NdV, 5.0 );
    vec3 R = reflect( -V, N );
    R.y = abs( R.y );
    vec3 refl = textureCube( uEnv, vec3( -R.x, R.y, R.z ) ).rgb;
    vec3 L = uSunDir;
    float sd = max( dot( R, L ), 0.0 );
    vec3 body = mix( uDeep, uShallow, 0.25 + 0.4 * ( 1.0 - NdV ) ) * uLight;
    float sss = pow( max( dot( V, -L ), 0.0 ), 4.0 ) * clamp( vHeight * 7.0 + 0.35, 0.0, 1.0 );
    body += uShallow * sss * 0.9 * uLight;
    col = mix( body, refl, fres );
    col += uSunColor * uSunStrength * ( pow( sd, 900.0 ) * 70.0 + pow( sd, 120.0 ) * 1.6 );
    for ( int i = 0; i < 3; i++ ) {
      if ( uLamp[ i ].w <= 0.0 ) continue;
      vec3 ld = normalize( uLamp[ i ].xyz - vWorld );
      float s = max( dot( R, ld ), 0.0 );
      col += uLampColor * uLamp[ i ].w * ( pow( s, 260.0 ) * 9.0 + pow( s, 30.0 ) * 0.25 );
    }
    float foam = smoothstep( 0.09, 0.17, vHeight );
    col = mix( col, vec3( 0.85, 0.9, 0.95 ) * uLight * 1.4, foam * 0.35 );
    alpha = clamp( 0.62 + fres * 0.7 + foam * 0.2, 0.0, 1.0 );
    float af = 1.0 - exp( -uAirDensity * dist );
    col = mix( col, uAirColor, af );
    alpha = mix( alpha, 1.0, af );
  } else {
    vec3 Nd = -N;
    vec3 I = -V;
    vec3 T = refract( I, Nd, 1.333 );
    float camDepth = max( -cameraPosition.y, 0.0 );
    vec3 wc = uWaterColor * 1.6 * exp( -uAbsorb * camDepth * 0.35 );
    if ( dot( T, T ) < 0.01 ) {
      col = wc * 1.1;
    } else {
      vec3 sky = textureCube( uEnv, vec3( -T.x, abs( T.y ), T.z ) ).rgb;
      float edge = smoothstep( 0.0, 0.3, T.y );
      col = mix( wc * 1.6, sky * 0.85, edge );
      col += uSunColor * uSunStrength * pow( max( dot( T, uSunDir ), 0.0 ), 300.0 ) * 18.0;
    }
    col *= exp( -uAbsorb * camDepth * 0.5 );
    float wf = 1.0 - exp( -uWaterDensity * dist );
    col = mix( col, wc, wf );
  }
  gl_FragColor = vec4( col, alpha );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/** カメラ周辺を密にした同心円グリッド */
function polarGrid(rings, segs, growth, first) {
  const pos = [];
  const idx = [];
  pos.push(0, 0, 0);
  const radii = [];
  let r = first;
  for (let i = 0; i < rings; i++) { radii.push(r); r = r * growth + first * 0.3; }
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < segs; j++) {
      const a = (j / segs) * Math.PI * 2;
      pos.push(Math.cos(a) * radii[i], 0, Math.sin(a) * radii[i]);
    }
  }
  for (let j = 0; j < segs; j++) {
    const a = 1 + j, b = 1 + ((j + 1) % segs);
    idx.push(0, b, a);
  }
  for (let i = 0; i < rings - 1; i++) {
    for (let j = 0; j < segs; j++) {
      const a = 1 + i * segs + j, b = 1 + i * segs + ((j + 1) % segs);
      const c = a + segs, d = b + segs;
      idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  // 上向き(+Y)が表になるよう巻き順を検証
  const p = g.attributes.position;
  const A = new THREE.Vector3().fromBufferAttribute(p, idx[0]);
  const B = new THREE.Vector3().fromBufferAttribute(p, idx[1]);
  const C = new THREE.Vector3().fromBufferAttribute(p, idx[2]);
  const n = new THREE.Vector3().crossVectors(B.sub(A), C.sub(A));
  if (n.y < 0) {
    const ix = g.index.array;
    for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
  }
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 5000);
  return g;
}

export class Water {
  constructor(quality, envCube) {
    const hi = quality !== 'low';
    const geo = hi ? polarGrid(150, 144, 1.042, 0.35) : polarGrid(95, 96, 1.07, 0.5);
    this.rippleIdx = 0;
    this.ripples = Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, -99, 0));
    this.lamps = Array.from({ length: 3 }, () => new THREE.Vector4(0, 0, 0, 0));
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      side: THREE.DoubleSide,
      uniforms: {
        uTime: U.uTime,
        uWave: { value: WAVES.map((w) => new THREE.Vector4(w.dx, w.dz, w.a, w.k)) },
        uQ: { value: 0.55 },
        uRipple: { value: this.ripples },
        uEnv: { value: envCube },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        uSunColor: { value: new THREE.Color(1, 1, 1) },
        uSunStrength: { value: 1 },
        uDeep: { value: new THREE.Color() },
        uShallow: { value: new THREE.Color() },
        uLight: { value: 1 },
        uLamp: { value: this.lamps },
        uLampColor: { value: new THREE.Color(1.0, 0.72, 0.4) },
        uWaterColor: U.uWaterColor,
        uWaterDensity: U.uWaterDensity,
        uAirColor: U.uAirColor,
        uAirDensity: U.uAirDensity,
        uAbsorb: U.uAbsorb,
      },
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.position.set(0, 0, -20);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
  }

  apply(p, sky) {
    const u = this.material.uniforms;
    u.uSunDir.value.copy(sky.sunDir);
    u.uSunColor.value.set(p.sunColor);
    u.uSunStrength.value = p.night ? 0.35 : (p.sky.elev > 20 ? 1.0 : 1.6);
    u.uDeep.value.set(p.waterDeep);
    u.uShallow.value.set(p.waterShallow);
    u.uLight.value = p.night ? 0.25 : 1.0;
  }

  setLamps(list, intensity) {
    for (let i = 0; i < 3; i++) {
      const L = list[i];
      if (L) this.lamps[i].set(L.x, L.y, L.z, intensity);
      else this.lamps[i].w = 0;
    }
  }

  /** 波紋を追加(strength: 0.05〜0.5 程度) */
  ripple(x, z, strength, time) {
    const r = this.ripples[this.rippleIdx];
    r.set(x, z, time, strength);
    this.rippleIdx = (this.rippleIdx + 1) % this.ripples.length;
  }
}
