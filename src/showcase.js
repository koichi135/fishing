// リザルト画面・図鑑用の魚ターンテーブル
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildFishModel } from './fish.js';

export class Showcase {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.camera = new THREE.PerspectiveCamera(30, 1.6, 0.05, 50);
    this.camera.position.set(0, 1.12, 2.3);
    this.camera.lookAt(0, 1, 0);
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(2, 3, 2);
    this.scene.add(key, new THREE.HemisphereLight(0xcfe6ff, 0x203040, 0.8));
    this.pivot = new THREE.Group();
    this.pivot.position.y = 1;
    this.scene.add(this.pivot);
    this.model = null;
    this.t = 0;
  }

  resize() {
    const w = this.canvas.clientWidth || 320, h = this.canvas.clientHeight || 200;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  show(sp) {
    if (this.model) this.pivot.remove(this.model);
    this.model = buildFishModel(sp, 1, { forShowcase: true });
    this.model.userData.uni.uSwimAmp.value = 0.05;
    const s = sp.ribbon ? 0.9 : 1.05;
    this.model.scale.setScalar(s);
    this.pivot.add(this.model);
    this.tiltX = sp.flat ? 1.05 : 0.1;
    this.t = 0;
    this.resize();
  }

  update(dt) {
    if (!this.model) return;
    this.t += dt;
    const u = this.model.userData.uni;
    u.uSwimPhase.value += dt * 5;
    this.pivot.rotation.y = Math.sin(this.t * 0.6) * 0.7 + 0.15;
    this.pivot.rotation.x = this.tiltX ?? 0.1;
    this.pivot.position.y = 1 + Math.sin(this.t * 1.3) * 0.02;
    this.renderer.render(this.scene, this.camera);
  }

  thumbnail(sp) {
    const prevW = this.canvas.width, prevH = this.canvas.height;
    this.renderer.setSize(320, 180, false);
    this.camera.aspect = 320 / 180;
    this.camera.updateProjectionMatrix();
    if (this.model) this.pivot.remove(this.model);
    const m = buildFishModel(sp, 1, { forShowcase: true });
    m.userData.uni.uSwimAmp.value = 0.03;
    m.scale.setScalar(sp.ribbon ? 0.9 : 1.05);
    this.pivot.add(m);
    this.pivot.rotation.set(sp.flat ? 1.05 : 0.1, 0.25, 0);
    this.renderer.render(this.scene, this.camera);
    const url = this.canvas.toDataURL('image/png');
    this.pivot.remove(m);
    if (this.model) this.pivot.add(this.model);
    this.canvas.width = prevW; this.canvas.height = prevH;
    return url;
  }
}
