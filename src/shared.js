// 共有ユニフォーム・マテリアル拡張・ノイズなどのユーティリティ
import * as THREE from 'three';

// ------------------------------------------------------------------ 共有ユニフォーム
// すべての拡張マテリアルが同じオブジェクト参照を持つので、ここを書き換えるだけで全体に反映される
export const U = {
  uTime:         { value: 0 },
  uWaterColor:   { value: new THREE.Color(0x1c6a84) },
  uWaterDensity: { value: 0.07 },
  uAirColor:     { value: new THREE.Color(0xb6d0e6) },
  uAirDensity:   { value: 0.0015 },
  uAbsorb:       { value: new THREE.Vector3(0.26, 0.07, 0.045) },
  uCaustic:      { value: 1.0 },
  uUnderBoost:   { value: 1.5 },
};

// ------------------------------------------------------------------ GLSL 片
const VS_PARS = /* glsl */`
uniform float uTime;
varying vec3 vWorldF;
`;
const VS_WORLD = /* glsl */`
{
  vec4 wpF = vec4( transformed, 1.0 );
  #ifdef USE_INSTANCING
    wpF = instanceMatrix * wpF;
  #endif
  vWorldF = ( modelMatrix * wpF ).xyz;
}
`;

export const GLSL_CAUSTIC = /* glsl */`
float causticF( vec2 uv, float time ) {
  const float TAU = 6.28318530718;
  vec2 p = mod( uv * TAU, TAU ) - 250.0;
  vec2 i = p;
  float c = 1.0;
  const float inten = 0.005;
  for ( int n = 0; n < 4; n++ ) {
    float t = time * ( 1.0 - ( 3.5 / float( n + 1 ) ) );
    i = p + vec2( cos( t - i.x ) + sin( t + i.y ), sin( t - i.y ) + cos( t + i.x ) );
    c += 1.0 / length( vec2( p.x / ( sin( i.x + t ) / inten ), p.y / ( cos( i.y + t ) / inten ) ) );
  }
  c /= 4.0;
  c = 1.17 - pow( c, 1.4 );
  return clamp( pow( abs( c ), 8.0 ), 0.0, 2.0 );
}
`;

const FS_PARS = /* glsl */`
uniform float uTime;
uniform vec3 uWaterColor;
uniform float uWaterDensity;
uniform vec3 uAirColor;
uniform float uAirDensity;
uniform vec3 uAbsorb;
uniform float uCaustic;
uniform float uUnderBoost;
varying vec3 vWorldF;
${GLSL_CAUSTIC}
// 水中/空気中の光路長に応じた吸収とフォグ(カメラが水上・水中どちらでも正しくなる)
vec3 applyEnv( vec3 col ) {
  vec3 camP = cameraPosition;
  vec3 fp = vWorldF;
  float total = length( fp - camP );
  float wPath = 0.0;
  if ( camP.y < 0.0 ) {
    wPath = fp.y < 0.0 ? total : total * clamp( -camP.y / max( fp.y - camP.y, 1e-4 ), 0.0, 1.0 );
  } else if ( fp.y < 0.0 ) {
    wPath = total * clamp( -fp.y / max( camP.y - fp.y, 1e-4 ), 0.0, 1.0 );
  }
  float aPath = total - wPath;
  float depth = max( -fp.y, 0.0 );
  #ifdef CAUSTICS
  if ( fp.y < 0.0 ) {
    float c = causticF( fp.xz * 0.28, uTime * 0.55 ) + causticF( fp.xz * 0.11 + 3.7, uTime * 0.4 ) * 0.5;
    col *= 1.0 + c * uCaustic * exp( -depth * 0.16 ) * 1.3;
  }
  #endif
  if ( wPath > 0.0 || fp.y < 0.0 ) {
    if ( fp.y < 0.0 ) col *= uUnderBoost;
    col *= exp( -uAbsorb * ( wPath + depth ) );
    float camDepth = max( -min( camP.y, 0.0 ), 0.0 );
    vec3 wc = uWaterColor * 1.6 * exp( -uAbsorb * camDepth * 0.35 );
    float wf = 1.0 - exp( -uWaterDensity * wPath );
    col = mix( col, wc, wf );
  }
  float af = 1.0 - exp( -uAirDensity * aPath );
  col = mix( col, uAirColor, af );
  return col;
}
`;

/**
 * 標準マテリアルに水中環境(吸収・フォグ・コースティクス)を組み込む。
 * opts.begin / opts.beginNormal / opts.color で頂点・色の処理も差し込める。
 */
export function enhance(mat, opts = {}) {
  const key = opts.key || 'base';
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, U, opts.uniforms || {});
    let vs = shader.vertexShader;
    let fs = shader.fragmentShader;
    vs = vs.replace('#include <common>', '#include <common>\n' + VS_PARS + (opts.vsPars || ''));
    if (opts.beginNormal) vs = vs.replace('#include <beginnormal_vertex>', opts.beginNormal);
    if (opts.begin) vs = vs.replace('#include <begin_vertex>', opts.begin);
    vs = vs.replace('#include <fog_vertex>', '#include <fog_vertex>\n' + VS_WORLD);
    fs = fs.replace('#include <common>', '#include <common>\n' + FS_PARS + (opts.fsPars || ''));
    if (opts.color) fs = fs.replace('#include <color_fragment>', '#include <color_fragment>\n' + opts.color);
    if (opts.emissive) fs = fs.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + opts.emissive);
    fs = fs.replace('#include <opaque_fragment>', '#include <opaque_fragment>\ngl_FragColor.rgb = applyEnv( gl_FragColor.rgb );');
    fs = fs.replace('#include <fog_fragment>', '');
    shader.vertexShader = vs;
    shader.fragmentShader = fs;
    if (opts.onShader) opts.onShader(shader);
  };
  if (opts.caustics) mat.defines = Object.assign(mat.defines || {}, { CAUSTICS: '' });
  mat.customProgramCacheKey = () => 'env-' + key + (opts.caustics ? '-c' : '');
  return mat;
}

// ------------------------------------------------------------------ 乱数・ノイズ
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(x, y) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
export function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, y, oct = 4) {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { s += a * (vnoise(x * f, y * f) * 2 - 1); f *= 2.03; a *= 0.5; }
  return s;
}

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export function angleWrap(a) { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; }

// ------------------------------------------------------------------ 地形(JS側でも高さを参照するため共有)
export const ANGLER = new THREE.Vector3(0, 1.2, -2.6);   // 釣り人の足元(桟橋の先端)
export const RETRIEVE_POINT = new THREE.Vector3(0.3, 0, -3.6); // ルアーを巻き寄せる水面上の点

export function seabedY(x, z) {
  const d = Math.max(0, -z - 2);
  let y = -3.2 - 4.2 * smoothstep(0, 70, d) - 2.5 * smoothstep(70, 220, d);
  y += fbm(x * 0.045 + 11.3, z * 0.045 - 7.1, 4) * 1.1 + fbm(x * 0.22, z * 0.22, 2) * 0.18;
  return y;
}

// 岩礁の中心(魚の付き場)
export const REEFS = [
  { x: -13, z: -21, r: 7 },
  { x: 12, z: -33, r: 8 },
  { x: -5, z: -48, r: 9 },
  { x: 24, z: -16, r: 5 },
  { x: -26, z: -38, r: 6 },
];

// ------------------------------------------------------------------ キャンバステクスチャ
export function canvasTexture(w, h, draw, { repeat = 1, srgb = true } = {}) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = 4;
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
