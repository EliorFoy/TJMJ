// src/utils/speech.js
// 优先使用预录制音频（public/sfx/），降级为浏览器 TTS

const BASE = import.meta.env.BASE_URL || '/';

// 本地音频缓存（防止重复加载）
const audioCache = {};

const loadAudio = (path) => {
  if (audioCache[path]) return audioCache[path];
  const a = new Audio();
  a.preload = 'auto';
  a.src = path;
  audioCache[path] = a;
  return a;
};

// 动作音效映射
const SFX = {
  chi:    'sfx/chi.mp3',
  peng:   'sfx/peng.mp3',
  gang:   'sfx/gang.mp3',
  angang: 'sfx/angang.mp3',
  minggang: 'sfx/minggang.mp3',
  hu:     'sfx/hu.mp3',
  zimo:   'sfx/zimo.mp3',
  pass:   'sfx/pass.mp3',
};

// 牌名 → 文件名映射
const tileNames = {
  11:'一万',12:'二万',13:'三万',14:'四万',15:'五万',16:'六万',17:'七万',18:'八万',19:'九万',
  21:'一条',22:'二条',23:'三条',24:'四条',25:'五条',26:'六条',27:'七条',28:'八条',29:'九条',
  31:'一筒',32:'二筒',33:'三筒',34:'四筒',35:'五筒',36:'六筒',37:'七筒',38:'八筒',39:'九筒',
};

let speechEnabled = true;

/** 播放预录制音效（存在则播，否则降级 TTS） */
const playSfx = (path) => {
  if (!speechEnabled) return;
  try {
    const a = loadAudio(`${BASE}${path}`);
    a.currentTime = 0;
    a.play().catch(() => {});
  } catch(e) {}
};

/** 播放动作语音（吃碰杠胡等） */
export const speak = (event, customText = null) => {
  if (!speechEnabled) return;
  const path = SFX[event];
  if (path) {
    playSfx(path);
    return;
  }
  // TTS 降级
  if (!window.speechSynthesis) return;
  const text = customText || event;
  if (!text) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'zh-CN'; u.rate = 0.9; u.pitch = 1.1; u.volume = 0.8;
  try { window.speechSynthesis.speak(u); } catch(e) {}
};

/** 播报牌名（出牌时用） */
export const speakTile = (tileValue) => {
  if (!speechEnabled) return;
  const name = tileNames[tileValue];
  if (!name) return;
  // 尝试预录制文件 sfx/tile_XX.mp3
  playSfx(`sfx/tile_${tileValue}.mp3`);
};

/** "咚" 出牌音效 */
export const playDong = () => {
  if (!speechEnabled) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.6, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.2);
  } catch(e) {}
};

/** "好运来" 胡牌音效 */
export const playWin = () => {
  playSfx('sfx/win.mp3');
};

export const toggleSpeech = () => { speechEnabled = !speechEnabled; return speechEnabled; };
export const isSpeechEnabled = () => speechEnabled;
