// 空: 大気散乱スカイ(昼)・夜空・雲、環境マップ生成
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { dirFromAngles } from './data.js';

const FAR_VERT = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
  gl_Position = p.xyww;
}
`;

const NIGHT_FRAG = /* glsl */`
varying vec3 vDir;
uniform vec3 uTop, uHorizon, uGlow, uMoonDir;
uniform float uTime;
float h13( vec3 p ) { p = fract( p * 0.3183099 + 0.1 ); p *= 17.0; return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) ); }
void main() {
  vec3 d = normalize( vDir );
  float h = d.y;
  vec3 c = mix( uHorizon, uTop, smoothstep( -0.02, 0.55, h ) );
  // 街明かりの光害(沖の対岸方向)
  c += uGlow * exp( -max( h, 0.0 ) * 14.0 ) * ( 0.35 + 0.65 * smoothstep( -0.3, 0.8, -d.z ) );
  // 月
  float m = max( dot( d, uMoonDir ), 0.0 );
  c += vec3( 0.75, 0.82, 1.0 ) * ( smoothstep( 0.99955, 0.9997, m ) * 6.0 + pow( m, 60.0 ) * 0.12 + pow( m, 6.0 ) * 0.03 );
  // 星
  vec3 sd = d * 260.0;
  vec3 id = floor( sd );
  float r = h13( id );
  if ( r > 0.992 ) {
    vec3 f = fract( sd ) - 0.5;
    float s = smoothstep( 0.22, 0.0, length( f ) );
    float tw = 0.55 + 0.45 * sin( uTime * ( 2.0 + r * 5.0 ) + r * 90.0 );
    c += vec3( 0.9, 0.95, 1.0 ) * s * tw * 1.4 * smoothstep( 0.02, 0.25, h ) * ( 1.0 - smoothstep( 0.9, 0.99, m ) );
  }
  if ( h < 0.0 ) c = uHorizon * 0.6;
  gl_FragColor = vec4( c, 1.0 );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const CLOUD_FRAG = /* glsl */`
varying vec3 vDir;
uniform float uTime, uCover;
uniform vec3 uLit, uShade, uSunDir;
float hash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
float noise( vec2 p ) {
  vec2 i = floor( p ), f = fract( p );
  vec2 u = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( hash( i ), hash( i + vec2( 1, 0 ) ), u.x ), mix( hash( i + vec2( 0, 1 ) ), hash( i + vec2( 1, 1 ) ), u.x ), u.y );
}
float fbm( vec2 p ) {
  float s = 0.0, a = 0.5;
  for ( int i = 0; i < CLOUD_OCT; i++ ) { s += a * noise( p ); p = p * 2.03 + vec2( 1.7, 9.2 ); a *= 0.5; }
  return s;
}
void main() {
  vec3 d = normalize( vDir );
  if ( d.y < 0.0 ) discard;
  vec2 uv = d.xz / ( d.y + 0.1 ) * 1.3 + vec2( uTime * 0.006, uTime * 0.0025 );
  float n = fbm( uv );
  float c = smoothstep( 1.0 - uCover - 0.05, 1.0 - uCover + 0.3, n );
  float n2 = fbm( uv + uSunDir.xz * 0.12 );
  float shade = clamp( ( n - n2 ) * 3.5 + 0.55, 0.0, 1.0 );
  vec3 col = mix( uShade, uLit, shade );
  float sg = max( dot( d, uSunDir ), 0.0 );
  col += uLit * ( pow( sg, 10.0 ) * 1.2 + pow( sg, 3.0 ) * 0.2 ) * ( 1.0 - c * 0.4 );
  float alpha = c * smoothstep( 0.0, 0.15, d.y ) * 0.95;
  gl_FragColor = vec4( col, alpha );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export class SkySystem {
  constructor(renderer, quality) {
    this.renderer = renderer;
    this.group = new THREE.Group();
    this.sunDir = new THREE.Vector3(0, 1, 0);   // 実際のライト方向(夜は月)
    this.lightColor = new THREE.Color();

    this.sky = new Sky();
    this.sky.scale.setScalar(1600);
    this.sky.renderOrder = -10;
    this.group.add(this.sky);

    this.nightMat = new THREE.ShaderMaterial({
      vertexShader: FAR_VERT, fragmentShader: NIGHT_FRAG, side: THREE.BackSide, depthWrite: false,
      uniforms: {
        uTop: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uGlow: { value: new THREE.Color() },
        uMoonDir: { value: new THREE.Vector3(0, 1, 0) }, uTime: { value: 0 },
      },
    });
    this.night = new THREE.Mesh(new THREE.SphereGeometry(700, 32, 16), this.nightMat);
    this.night.renderOrder = -10;
    this.group.add(this.night);

    this.cloudMat = new THREE.ShaderMaterial({
      vertexShader: FAR_VERT, fragmentShader: CLOUD_FRAG, side: THREE.BackSide, depthWrite: false, transparent: true,
      defines: { CLOUD_OCT: quality === 'low' ? 3 : 5 },
      uniforms: {
        uTime: { value: 0 }, uCover: { value: 0.4 },
        uLit: { value: new THREE.Color() }, uShade: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3() },
      },
    });
    this.clouds = new THREE.Mesh(new THREE.SphereGeometry(650, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), this.cloudMat);
    this.clouds.renderOrder = -9;
    this.group.add(this.clouds);

    this.envScene = new THREE.Scene();
    const size = quality === 'low' ? 64 : 128;
    this.cubeRT = new THREE.WebGLCubeRenderTarget(size, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
    this.cubeCam = new THREE.CubeCamera(1, 3000, this.cubeRT);
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envMap = null;
  }

  get cubeTexture() { return this.cubeRT.texture; }

  apply(p) {
    const s = p.sky;
    const night = !!p.night;
    this.sky.visible = !night;
    this.night.visible = night;
    if (!night) {
      const u = this.sky.material.uniforms;
      u.turbidity.value = s.turbidity;
      u.rayleigh.value = s.rayleigh;
      u.mieCoefficient.value = s.mieC;
      u.mieDirectionalG.value = s.mieG;
      dirFromAngles(s.elev, s.azi, u.sunPosition.value);
      dirFromAngles(Math.max(s.elev, 1.5), s.azi, this.sunDir);
    } else {
      const u = this.nightMat.uniforms;
      u.uTop.value.set(p.nightSky.top);
      u.uHorizon.value.set(p.nightSky.horizon);
      u.uGlow.value.set(p.nightSky.glow).multiplyScalar(0.5);
      dirFromAngles(s.moonElev, s.moonAzi, u.uMoonDir.value);
      this.sunDir.copy(u.uMoonDir.value);
    }
    const cu = this.cloudMat.uniforms;
    cu.uCover.value = p.clouds.cover;
    cu.uLit.value.set(p.clouds.lit).multiplyScalar(night ? 0.12 : 0.9);
    cu.uShade.value.set(p.clouds.shade).multiplyScalar(night ? 0.12 : 0.55);
    cu.uSunDir.value.copy(this.sunDir);
    this.lightColor.set(p.sunColor);
    this.capture();
  }

  capture() {
    const parent = this.group.parent;
    const pos = this.group.position.clone();
    this.group.position.set(0, 0, 0);
    this.envScene.add(this.group);
    this.cubeCam.position.set(0, 0, 0);
    this.cubeCam.update(this.renderer, this.envScene);
    if (parent) parent.add(this.group);
    this.group.position.copy(pos);
    const prev = this.envMap;
    this.envMap = this.pmrem.fromCubemap(this.cubeRT.texture).texture;
    if (prev) prev.dispose();
  }

  update(dt, camera, time) {
    this.group.position.copy(camera.position);
    this.cloudMat.uniforms.uTime.value = time;
    this.nightMat.uniforms.uTime.value = time;
  }
}
