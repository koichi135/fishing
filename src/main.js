// エントリポイント: レンダラー生成・ローディング・メインループ・動的解像度
import * as THREE from 'three';
import { UI, Store } from './ui.js';
import { Game } from './game.js';

const ui = new UI();
const showError = (msg) => {
  const l = document.getElementById('loader');
  l.style.display = 'flex';
  l.classList.remove('hide');
  ui.loading(1, '⚠ エラーが発生しました\n' + msg);
};
window.addEventListener('error', (e) => showError(e.message || String(e)));
window.addEventListener('unhandledrejection', (e) => showError(String(e.reason && e.reason.message || e.reason)));

function pickQuality() {
  const q = Store.settings.quality;
  if (q && q !== 'auto') return q;
  const coarse = matchMedia('(pointer: coarse)').matches;
  const mem = navigator.deviceMemory || 4;
  if (mem <= 2) return 'low';
  return coarse ? 'medium' : 'high';
}

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

async function boot() {
  const quality = pickQuality();
  const canvas = document.getElementById('c');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
  } catch (e) {
    showError('WebGL2 に対応したブラウザが必要です');
    return;
  }
  const dpr = window.devicePixelRatio || 1;
  const maxPR = quality === 'low' ? Math.min(dpr, 1) : quality === 'medium' ? Math.min(dpr, 1.5) : Math.min(dpr, 2);
  const minPR = Math.max(0.6, maxPR * 0.55);
  let pr = maxPR;
  renderer.setPixelRatio(pr);
  renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  ui.loading(0.08, 'ワールドを構築中…');
  await nextFrame();
  const game = new Game(renderer, ui, quality, (p, t) => ui.loading(p, t));
  window.__game = game;

  ui.loading(0.88, 'シェーダをコンパイル中…');
  await nextFrame();
  try { renderer.compile(game.scene, game.camera); } catch (e) { /* 未対応環境でも続行 */ }
  game.update(0.016);
  game.render();
  ui.loading(1, '準備完了');
  await nextFrame();
  ui.loaded();
  game.toTitle();

  // ---------------------------------------------------------------- ループ
  const clock = new THREE.Clock();
  let acc = 0, frames = 0, warm = 0;
  function frame() {
    requestAnimationFrame(frame);
    const raw = clock.getDelta();
    const dt = Math.min(raw, 0.05);
    game.update(dt);
    game.render();
    // 動的解像度: 重い端末では自動で描画解像度を下げる
    warm += raw;
    acc += raw; frames++;
    if (acc > 2 && warm > 4) {
      const avg = acc / frames;
      let npr = pr;
      if (avg > 1 / 38 && pr > minPR) npr = Math.max(minPR, pr * 0.85);
      else if (avg < 1 / 57 && pr < maxPR) npr = Math.min(maxPR, pr * 1.08);
      if (Math.abs(npr - pr) > 0.01) {
        pr = npr;
        renderer.setPixelRatio(pr);
        renderer.setSize(innerWidth, innerHeight);
        game.setViewportSize();
      }
      acc = 0; frames = 0;
    }
  }
  frame();

  const onResize = () => {
    renderer.setSize(innerWidth, innerHeight);
    game.setViewportSize();
  };
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', () => setTimeout(onResize, 200));
  document.addEventListener('visibilitychange', () => { clock.getDelta(); game.setReel(false); });
}

boot().catch((e) => showError(e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n') : String(e)));
