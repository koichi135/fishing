// ゲームデータ: 時間帯・魚種・ルアー
import * as THREE from 'three';

// ------------------------------------------------------------------ 時間帯プリセット
// azi は正面(-Z 方向=沖)から時計回り(+X側)の方位角[deg]、elev は仰角[deg]
export const PRESETS = {
  dawn: {
    id: 'dawn', label: '朝マズメ', icon: '🌅', desc: '夜明けの高活性タイム',
    sky: { elev: 3.2, azi: 38, turbidity: 7, rayleigh: 2.6, mieC: 0.006, mieG: 0.86 },
    exposure: 0.3, sunColor: 0xffc9a0, sunInt: 2.4, hemiSky: 0xa9bbe0, hemiGround: 0x52443a, hemiInt: 0.9, underBoost: 1.9,
    airFog: 0xd6c1b8, airDensity: 0.0013, clouds: { cover: 0.42, lit: 0xffc3a0, shade: 0x5d6784 },
    waterDeep: 0x0b2e40, waterShallow: 0x2c6f7e, waterFog: 0x22627a, waterDensity: 0.072,
    caustic: 0.55, godray: 0.65, lamps: 0.0, night: false, activity: 1.35, envInt: 1.0,
  },
  day: {
    id: 'day', label: '日中', icon: '☀️', desc: '水が澄んで視界良好',
    sky: { elev: 52, azi: 150, turbidity: 2.6, rayleigh: 1.1, mieC: 0.004, mieG: 0.8 },
    exposure: 0.34, sunColor: 0xfff4e4, sunInt: 3.2, hemiSky: 0xbfdcff, hemiGround: 0x5a5448, hemiInt: 1.0, underBoost: 1.3,
    airFog: 0xbcd6ec, airDensity: 0.0011, clouds: { cover: 0.38, lit: 0xffffff, shade: 0x8fa2bd },
    waterDeep: 0x083252, waterShallow: 0x1f8196, waterFog: 0x1a6d88, waterDensity: 0.062,
    caustic: 1.0, godray: 1.0, lamps: 0.0, night: false, activity: 0.8, envInt: 1.0,
  },
  dusk: {
    id: 'dusk', label: '夕マズメ', icon: '🌇', desc: '夕焼けの時合い',
    sky: { elev: 2.4, azi: -32, turbidity: 9, rayleigh: 3.2, mieC: 0.008, mieG: 0.9 },
    exposure: 0.3, sunColor: 0xff9a5a, sunInt: 2.2, hemiSky: 0x9a8cc0, hemiGround: 0x4a3230, hemiInt: 0.9, underBoost: 2.0,
    airFog: 0xd09a86, airDensity: 0.0014, clouds: { cover: 0.5, lit: 0xff9a6a, shade: 0x4b3f63 },
    waterDeep: 0x0f2638, waterShallow: 0x3a5e6c, waterFog: 0x245468, waterDensity: 0.075,
    caustic: 0.4, godray: 0.55, lamps: 0.6, night: false, activity: 1.45, envInt: 1.0,
  },
  night: {
    id: 'night', label: '夜', icon: '🌙', desc: '常夜灯周りに大物の気配',
    sky: { elev: -20, azi: 0, moonElev: 24, moonAzi: -18 },
    exposure: 0.75, sunColor: 0x9db4ff, sunInt: 0.55, hemiSky: 0x2a3a66, hemiGround: 0x101418, hemiInt: 0.6, underBoost: 2.6,
    airFog: 0x121c33, airDensity: 0.0016, clouds: { cover: 0.3, lit: 0x5a6a92, shade: 0x0c1224 },
    waterDeep: 0x031018, waterShallow: 0x0b2a38, waterFog: 0x0b2534, waterDensity: 0.09,
    caustic: 0.12, godray: 0.12, lamps: 1.0, night: true, activity: 1.15, envInt: 1.6,
    nightSky: { top: 0x02040c, horizon: 0x16213d, glow: 0x6a4a3a },
  },
};

export function dirFromAngles(elevDeg, aziDeg, target = new THREE.Vector3()) {
  const e = THREE.MathUtils.degToRad(elevDeg), a = THREE.MathUtils.degToRad(aziDeg);
  return target.set(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)).normalize();
}

// ------------------------------------------------------------------ 魚種
// shape: depth=体高/全長, width=体幅/全長, peak=体高最大位置, ped=尾柄の細さ, asym=背側の張り出し
// depthPref: surface / mid / bottom、lures: ルアー別の好み、time: 時間帯別の活性
export const SPECIES = [
  {
    id: 'seabass', name: 'シーバス', sci: 'スズキ', rarity: 1, emoji: '🐟',
    sizeNames: [[40, 'セイゴ'], [60, 'フッコ'], [80, 'スズキ'], [999, 'ランカーシーバス']],
    min: 28, max: 98, skew: 1.9, wk: 0.0000105,
    shape: { depth: 0.23, width: 0.12, peak: 0.34, ped: 0.08, asym: 0.1, mouth: 1.2 },
    colors: { back: 0x2c3a46, belly: 0xe4ebef, fin: 0x5a6a78, stripe: 0, spots: 0, sheen: 0.55 },
    fins: { dorsal: 'spiny', tail: 'fork', size: 1.0 },
    depthPref: 'mid', speed: 1.1, speedTol: 0.75, power: 1.0, stamina: 1.0, jumpy: 1.0, shake: 0.5,
    lures: { minnow: 1.2, pencil: 1.15, vib: 0.9, popper: 0.85 },
    time: { dawn: 1.2, day: 0.6, dusk: 1.3, night: 1.4 }, weight: 36, detect: 9,
    desc: '湾岸ルアーの王様。エラ洗いで激しく首を振る。',
  },
  {
    id: 'hirasuzuki', name: 'ヒラスズキ', rarity: 4, emoji: '🐟',
    min: 45, max: 95, skew: 1.6, wk: 0.000013,
    shape: { depth: 0.28, width: 0.12, peak: 0.36, ped: 0.08, asym: 0.12, mouth: 1.1 },
    colors: { back: 0x25313c, belly: 0xd8e1e6, fin: 0x3f4c58, stripe: 0, spots: 0, sheen: 0.7 },
    fins: { dorsal: 'spiny', tail: 'fork', size: 1.05 },
    depthPref: 'mid', speed: 1.3, speedTol: 0.7, power: 1.35, stamina: 1.2, jumpy: 1.2, shake: 0.6,
    lures: { minnow: 1.2, pencil: 1.3, vib: 0.6, popper: 0.9 },
    time: { dawn: 1.4, day: 0.4, dusk: 1.2, night: 0.6 }, weight: 4, detect: 9,
    desc: '磯のサラシに潜む幻の平スズキ。体高があり引きは強烈。',
  },
  {
    id: 'kurodai', name: 'クロダイ', rarity: 2, emoji: '🐠',
    min: 25, max: 60, skew: 1.7, wk: 0.000024,
    shape: { depth: 0.4, width: 0.13, peak: 0.36, ped: 0.1, asym: 0.2, mouth: 0.6 },
    colors: { back: 0x2f3438, belly: 0x9aa4aa, fin: 0x23272b, stripe: 0, spots: 0, sheen: 0.35, bars: 0.35 },
    fins: { dorsal: 'spiny', tail: 'fan', size: 1.0 },
    depthPref: 'bottom', speed: 0.9, speedTol: 0.8, power: 0.95, stamina: 1.1, jumpy: 0, shake: 1.0,
    lures: { minnow: 0.5, pencil: 0.5, vib: 1.5, popper: 0.4 },
    time: { dawn: 1.0, day: 1.2, dusk: 1.0, night: 0.8 }, weight: 16, detect: 7,
    desc: 'チヌとも呼ばれる。底付近で激しく首を振るファイター。',
  },
  {
    id: 'madai', name: 'マダイ', rarity: 4, emoji: '🐡',
    min: 30, max: 80, skew: 1.8, wk: 0.00002,
    shape: { depth: 0.38, width: 0.13, peak: 0.34, ped: 0.09, asym: 0.25, mouth: 0.6 },
    colors: { back: 0xd9607a, belly: 0xf6dcd8, fin: 0xe07a88, stripe: 0, spots: 0.8, sheen: 0.6 },
    fins: { dorsal: 'spiny', tail: 'fork', size: 1.05 },
    depthPref: 'bottom', speed: 1.0, speedTol: 0.8, power: 1.15, stamina: 1.1, jumpy: 0, shake: 0.7,
    lures: { minnow: 0.5, pencil: 0.6, vib: 1.4, popper: 0.2 },
    time: { dawn: 1.3, day: 1.0, dusk: 1.1, night: 0.4 }, weight: 4, detect: 7,
    desc: '魚の王様。ボトムを攻めると稀に食ってくる。三段引きが特徴。',
  },
  {
    id: 'buri', name: 'ブリ', rarity: 3, emoji: '🐟',
    sizeNames: [[40, 'ワカシ'], [60, 'イナダ'], [80, 'ワラサ'], [999, 'ブリ']],
    min: 32, max: 105, skew: 1.9, wk: 0.0000125,
    shape: { depth: 0.2, width: 0.13, peak: 0.36, ped: 0.05, asym: 0.05, mouth: 0.8 },
    colors: { back: 0x2a5577, belly: 0xe8eef2, fin: 0xc8b048, stripe: 0xf0cf46, spots: 0, sheen: 0.7 },
    fins: { dorsal: 'soft', tail: 'deepfork', size: 0.9 },
    depthPref: 'surface', speed: 1.6, speedTol: 0.9, power: 1.6, stamina: 1.4, jumpy: 0, shake: 0.2,
    lures: { minnow: 1.0, pencil: 1.3, vib: 1.0, popper: 1.3 },
    time: { dawn: 1.5, day: 1.0, dusk: 1.2, night: 0.2 }, weight: 10, detect: 11, nabura: 3.0,
    desc: 'ナブラを追う青物。とにかく走る。ドラグ調整が鍵。',
  },
  {
    id: 'hirame', name: 'ヒラメ', rarity: 3, emoji: '🐟', flat: true,
    min: 30, max: 85, skew: 1.8, wk: 0.000012,
    shape: { depth: 0.44, width: 0.07, peak: 0.42, ped: 0.12, asym: 0.0, mouth: 1.0 },
    colors: { back: 0x6a5842, belly: 0xf1efe8, fin: 0x5a4a36, stripe: 0, spots: 1.0, sheen: 0.1 },
    fins: { dorsal: 'flat', tail: 'fan', size: 1.0 },
    depthPref: 'bottom', speed: 0.9, speedTol: 0.8, power: 0.85, stamina: 0.9, jumpy: 0, shake: 0.6,
    lures: { minnow: 0.8, pencil: 0.8, vib: 1.3, popper: 0.1 },
    time: { dawn: 1.3, day: 0.9, dusk: 1.1, night: 0.5 }, weight: 8, detect: 6,
    desc: '砂地に潜むフィッシュイーター。底付近を通すと飛びついてくる。',
  },
  {
    id: 'tachiuo', name: 'タチウオ', rarity: 2, emoji: '🗡', ribbon: true,
    min: 60, max: 130, skew: 1.6, wk: 0.0000016,
    shape: { depth: 0.075, width: 0.025, peak: 0.25, ped: 0.02, asym: 0.0, mouth: 1.4 },
    colors: { back: 0xc9d4dc, belly: 0xf2f6f8, fin: 0xd8e2e8, stripe: 0, spots: 0, sheen: 1.0 },
    fins: { dorsal: 'ribbon', tail: 'none', size: 1.0 },
    depthPref: 'mid', speed: 0.9, speedTol: 0.8, power: 0.75, stamina: 0.8, jumpy: 0, shake: 0.4,
    lures: { minnow: 1.2, pencil: 1.0, vib: 1.1, popper: 0.2 },
    time: { dawn: 0.5, day: 0.0, dusk: 0.9, night: 1.6 }, weight: 18, detect: 7,
    desc: '夜の常夜灯周りに集まる銀色の太刀。鋭い歯に注意。',
  },
  {
    id: 'aji', name: 'アジ', rarity: 1, emoji: '🐟',
    min: 14, max: 36, skew: 1.5, wk: 0.000013,
    shape: { depth: 0.24, width: 0.12, peak: 0.36, ped: 0.05, asym: 0.08, mouth: 0.6 },
    colors: { back: 0x5d7c78, belly: 0xeef0e4, fin: 0xb8b46a, stripe: 0x9ab87a, spots: 0, sheen: 0.8 },
    fins: { dorsal: 'soft', tail: 'deepfork', size: 1.0 },
    depthPref: 'mid', speed: 0.8, speedTol: 0.8, power: 0.35, stamina: 0.5, jumpy: 0, shake: 0.3,
    lures: { minnow: 0.8, pencil: 0.7, vib: 0.8, popper: 0.3 },
    time: { dawn: 1.2, day: 0.9, dusk: 1.2, night: 1.3 }, weight: 26, detect: 6,
    desc: '港の人気者。群れで回遊する。小さくても引きは楽しい。',
  },
];
export const SPECIES_BY_ID = Object.fromEntries(SPECIES.map((s) => [s.id, s]));

export function sizeName(sp, cm) {
  if (!sp.sizeNames) return sp.name;
  for (const [lim, n] of sp.sizeNames) if (cm < lim) return n;
  return sp.name;
}
export function weightKg(sp, cm) { return sp.wk * cm * cm * cm; }

// ------------------------------------------------------------------ ルアー
export const LURES = {
  minnow: {
    id: 'minnow', name: 'フローティングミノー', short: 'ミノー',
    desc: '浮力があり、巻くと約1.2m潜る万能型。止めると浮く。',
    colors: { back: 0x1d4f3c, side: 0xd6e4ec, belly: 0xf4f4f0, accent: 0xffffff },
    swatch: 'linear-gradient(180deg,#1d4f3c,#d6e4ec 55%,#f4f4f0)',
  },
  pencil: {
    id: 'pencil', name: 'シンキングペンシル', short: 'シンペン',
    desc: 'ゆっくり沈み、スローなS字スラロームで誘う。表層〜中層向け。',
    colors: { back: 0xd8386a, side: 0xf0e8f0, belly: 0xffffff, accent: 0xffd6e6 },
    swatch: 'linear-gradient(180deg,#d8386a,#f0e8f0 55%,#ffffff)',
  },
  vib: {
    id: 'vib', name: 'バイブレーション', short: 'バイブ',
    desc: '速く沈み、強い振動でアピール。底付近の魚に効く。',
    colors: { back: 0xc8a020, side: 0xe8d070, belly: 0xff7030, accent: 0x202020 },
    swatch: 'linear-gradient(180deg,#c8a020,#e8d070 55%,#ff7030)',
  },
  popper: {
    id: 'popper', name: 'ポッパー', short: 'ポッパー',
    desc: '水面に浮き、トゥイッチで水しぶきと音を立てる。水面が爆発する!',
    colors: { back: 0x2a2a2a, side: 0xf0f0f0, belly: 0xff4a2a, accent: 0xff4a2a },
    swatch: 'linear-gradient(180deg,#2a2a2a,#f0f0f0 55%,#ff4a2a)',
  },
};
export const LURE_ORDER = ['minnow', 'pencil', 'vib', 'popper'];

export const DRAG = { soft: 46, mid: 60, hard: 76 };
export const REEL_SPEEDS = [
  { id: 'slow', label: 'ゆっくり', v: 0.65 },
  { id: 'mid', label: '普通', v: 1.1 },
  { id: 'fast', label: '速巻き', v: 1.7 },
];
