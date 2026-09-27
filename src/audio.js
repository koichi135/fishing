// WebAudio による合成サウンド(音声ファイル不要)
export class GameAudio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.listener = { x: 0, y: 2.8, z: -2.4 };
    this.reelAcc = 0;
    this.dragAcc = 0;
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
    const c = this.ctx;
    this.master = c.createGain();
    this.master.gain.value = this.enabled ? 0.9 : 0;
    const comp = c.createDynamicsCompressor();
    this.master.connect(comp).connect(c.destination);
    // ノイズバッファ
    const len = c.sampleRate * 2;
    this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.brown = c.createBuffer(1, len, c.sampleRate);
    const b = this.brown.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; b[i] = last * 3.5; }
    // 波音(アンビエンス)
    this.waveGain = c.createGain(); this.waveGain.gain.value = 0.0;
    const ws = c.createBufferSource(); ws.buffer = this.noise; ws.loop = true;
    const wf = c.createBiquadFilter(); wf.type = 'lowpass'; wf.frequency.value = 700;
    const lfo = c.createOscillator(); lfo.frequency.value = 0.13;
    const lfoG = c.createGain(); lfoG.gain.value = 0.05;
    const waveBase = c.createGain(); waveBase.gain.value = 0.07;
    lfo.connect(lfoG).connect(waveBase.gain);
    ws.connect(wf).connect(waveBase).connect(this.waveGain).connect(this.master);
    ws.start(); lfo.start();
    // 水中の環境音
    this.underGain = c.createGain(); this.underGain.gain.value = 0;
    const us = c.createBufferSource(); us.buffer = this.brown; us.loop = true;
    const uf = c.createBiquadFilter(); uf.type = 'lowpass'; uf.frequency.value = 380;
    us.connect(uf).connect(this.underGain).connect(this.master);
    us.start();
    this.setUnder(false);
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.master) this.master.gain.value = on ? 0.9 : 0;
  }

  setUnder(u) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.waveGain.gain.setTargetAtTime(u ? 0.25 : 1.0, t, 0.3);
    this.underGain.gain.setTargetAtTime(u ? 0.5 : 0.0, t, 0.3);
  }

  setListener(p) { this.listener.x = p.x; this.listener.y = p.y; this.listener.z = p.z; }
  distGain(x, y, z, ref = 8) {
    const d = Math.hypot(x - this.listener.x, y - this.listener.y, z - this.listener.z);
    return ref / (ref + d);
  }

  // ------------------------------------------------ 部品
  env(g, t0, a, peak, dur) {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  }
  tone(freq, dur, { type = 'sine', gain = 0.2, delay = 0, to = null, attack = 0.005 } = {}) {
    if (!this.ctx) return;
    const c = this.ctx, t0 = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    this.env(g, t0, attack, gain, dur);
    o.connect(g).connect(this.master);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }
  noiseHit(dur, { gain = 0.3, type = 'lowpass', freq = 1500, to = null, q = 0.8, delay = 0, attack = 0.004 } = {}) {
    if (!this.ctx) return;
    const c = this.ctx, t0 = c.currentTime + delay;
    const s = c.createBufferSource(); s.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t0); f.Q.value = q;
    if (to) f.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    const g = c.createGain();
    this.env(g, t0, attack, gain, dur);
    s.connect(f).connect(g).connect(this.master);
    s.start(t0, Math.random()); s.stop(t0 + dur + 0.05);
  }

  // ------------------------------------------------ 効果音
  click() { this.tone(1800, 0.04, { type: 'square', gain: 0.05 }); }
  castWhoosh(power) {
    this.noiseHit(0.45, { type: 'bandpass', freq: 2600, to: 380, q: 1.2, gain: 0.35 + power * 0.25 });
    this.noiseHit(1.6, { type: 'highpass', freq: 5000, gain: 0.06, delay: 0.1, attack: 0.05 }); // スプールからの放出音
  }
  splash(s = 1) {
    this.noiseHit(0.25 + s * 0.35, { type: 'lowpass', freq: 2400, to: 500, gain: Math.min(0.5, 0.18 + s * 0.2) });
    this.tone(160, 0.15 + s * 0.1, { gain: 0.12 * s, to: 60 });
  }
  splashAt(x, y, z, s = 1) {
    const g = this.distGain(x, y, z, 10);
    if (g < 0.08) return;
    this.noiseHit(0.2 + s * 0.3, { type: 'lowpass', freq: 1800, to: 500, gain: 0.35 * g * s });
  }
  pop() {
    this.tone(420, 0.12, { gain: 0.25, to: 110 });
    this.noiseHit(0.18, { type: 'bandpass', freq: 900, gain: 0.2, q: 2 });
  }
  reel(dt, speed) {
    if (!this.ctx || speed <= 0.01) return;
    this.reelAcc += dt * speed * 14;
    while (this.reelAcc > 1) { this.reelAcc -= 1; this.noiseHit(0.018, { type: 'bandpass', freq: 3200, q: 4, gain: 0.08 }); }
  }
  drag(dt, rate) {
    if (!this.ctx || rate <= 0.01) return;
    this.dragAcc += dt * (18 + rate * 50);
    while (this.dragAcc > 1) { this.dragAcc -= 1; this.tone(2100 + Math.random() * 300, 0.012, { type: 'square', gain: 0.05 }); }
  }
  bite() {
    this.tone(95, 0.35, { gain: 0.5, to: 45 });
    this.noiseHit(0.2, { type: 'lowpass', freq: 800, gain: 0.3 });
    this.tone(880, 0.08, { type: 'square', gain: 0.08, delay: 0.05 });
    this.tone(880, 0.08, { type: 'square', gain: 0.08, delay: 0.18 });
  }
  hit() {
    [0, 0.07, 0.14].forEach((d, i) => this.tone([392, 523, 659][i], 0.5, { type: 'sawtooth', gain: 0.1, delay: d }));
    this.tone(1046, 0.6, { type: 'triangle', gain: 0.12, delay: 0.2 });
    this.noiseHit(0.4, { type: 'highpass', freq: 3000, gain: 0.1 });
  }
  perfect() { this.tone(1318, 0.25, { type: 'triangle', gain: 0.15 }); this.tone(1760, 0.35, { type: 'triangle', gain: 0.15, delay: 0.08 }); }
  jump() { this.splash(1.6); this.noiseHit(0.9, { type: 'lowpass', freq: 1200, to: 300, gain: 0.3, delay: 0.5 }); }
  snap() {
    this.noiseHit(0.05, { type: 'highpass', freq: 2500, gain: 0.6 });
    this.tone(300, 0.4, { type: 'sawtooth', gain: 0.2, to: 60 });
  }
  lost() { this.tone(330, 0.3, { type: 'triangle', gain: 0.15, to: 220 }); this.tone(220, 0.5, { type: 'triangle', gain: 0.15, delay: 0.25, to: 140 }); }
  fanfare() {
    const n = [523, 659, 784, 1046, 784, 1046, 1318];
    n.forEach((f, i) => this.tone(f, 0.22, { type: 'triangle', gain: 0.16, delay: i * 0.1 }));
    this.tone(1568, 0.8, { type: 'sine', gain: 0.12, delay: 0.7 });
  }
  nabura() { this.tone(660, 0.1, { type: 'square', gain: 0.06 }); this.tone(990, 0.14, { type: 'square', gain: 0.06, delay: 0.12 }); }
  gull(x, y, z) {
    const g = this.distGain(x, y, z, 25);
    if (!this.ctx || g < 0.1) return;
    const base = 1400 + Math.random() * 500;
    this.tone(base, 0.18, { type: 'sawtooth', gain: 0.05 * g, to: base * 0.7 });
    this.tone(base * 1.1, 0.22, { type: 'sawtooth', gain: 0.05 * g, to: base * 0.6, delay: 0.22 });
  }
}
