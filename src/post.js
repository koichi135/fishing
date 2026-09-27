// ポストプロセス: ブルーム + 水中歪み/ビネット/色収差/フラッシュ + トーンマップ
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const FinalShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uUnder: { value: 0 },
    uFlash: { value: 0 },
    uAberr: { value: 0 },
    uDanger: { value: 0 },
    uVignette: { value: 0.35 },
    uTint: { value: new THREE.Color(1, 1, 1) },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uTime, uUnder, uFlash, uAberr, uDanger, uVignette;
    uniform vec3 uTint;
    varying vec2 vUv;
    float hash( vec2 p ) { return fract( sin( dot( p, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 ); }
    void main() {
      vec2 uv = vUv;
      vec2 c = uv - 0.5;
      if ( uUnder > 0.0 ) {
        uv += vec2( sin( uv.y * 22.0 + uTime * 1.9 ), cos( uv.x * 18.0 + uTime * 1.6 ) ) * 0.0022 * uUnder;
      }
      float ab = uAberr * 0.012 + uUnder * 0.0015;
      vec3 col;
      col.r = texture2D( tDiffuse, uv + c * ab ).r;
      col.g = texture2D( tDiffuse, uv ).g;
      col.b = texture2D( tDiffuse, uv - c * ab ).b;
      col *= uTint;
      float r = length( c * vec2( 1.0, 0.85 ) );
      float vig = smoothstep( 0.85, 0.25, r );
      col *= mix( 1.0, vig, uVignette + uUnder * 0.25 );
      float edge = smoothstep( 0.3, 0.75, r );
      col = mix( col, vec3( 1.4, 0.12, 0.05 ) * ( 0.5 + 0.5 * dot( col, vec3( 0.33 ) ) ), uDanger * edge * 0.55 );
      col += uFlash;
      col += ( hash( uv * 800.0 + uTime ) - 0.5 ) * 0.012;
      gl_FragColor = vec4( col, 1.0 );
    }
  `,
};

export class Post {
  constructor(renderer, scene, camera, quality) {
    this.renderer = renderer;
    const size = renderer.getSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x * renderer.getPixelRatio(), size.y * renderer.getPixelRatio(), {
      type: THREE.HalfFloatType, samples: quality === 'high' ? 4 : 0,
    });
    this.composer = new EffectComposer(renderer, rt);
    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);
    this.bloom = null;
    if (quality !== 'low') {
      this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.32, 0.35, 0.96);
      this.composer.addPass(this.bloom);
    }
    this.final = new ShaderPass(FinalShader);
    this.composer.addPass(this.final);
    this.composer.addPass(new OutputPass());
    this.u = this.final.uniforms;
  }

  setSize(w, h, pr) {
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
  }

  setCamera(cam) { this.renderPass.camera = cam; }

  render(dt) { this.composer.render(dt); }
}
