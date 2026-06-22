// src/utils/speech.js
// 使用浏览器内置 Web Speech API + Web Audio API 播报游戏音效

// 语音配置
const SPEECH_CONFIG = {
  lang: 'zh-CN',
  rate: 0.9,
  pitch: 1.1,
  volume: 0.8,
};

const EVENT_SPEECH = {
  peng: '碰！',
  gang: '杠！',
  angang: '暗杠！',
  minggang: '明杠！',
  hu: '胡了！',
  zimo: '自摸！',
  chi: '吃！',
  pass: '过！',
  ting: '听牌！',
};

let speechEnabled = true;

/** 播放语音 */
export const speak = (event, customText = null) => {
  if (!speechEnabled) return;
  if (!window.speechSynthesis) return;
  const text = customText || EVENT_SPEECH[event];
  if (!text) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = SPEECH_CONFIG.lang;
  u.rate = SPEECH_CONFIG.rate;
  u.pitch = SPEECH_CONFIG.pitch;
  u.volume = SPEECH_CONFIG.volume;
  try { window.speechSynthesis.speak(u); } catch (e) {}
};

/** "咚" 出牌音效 — Web Audio API 短促打击音 */
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
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.2);
  } catch (e) {}
};

/** "好运来" 胡牌音效 */
export const playWin = () => {
  if (!speechEnabled) return;
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  // 先说"好运来"
  const u1 = new SpeechSynthesisUtterance('好运来！');
  u1.lang = 'zh-CN';
  u1.rate = 0.7;
  u1.pitch = 1.4;
  u1.volume = 1.0;
  try { window.speechSynthesis.speak(u1); } catch (e) {}
};

export const toggleSpeech = () => {
  speechEnabled = !speechEnabled;
  return speechEnabled;
};

export const isSpeechEnabled = () => speechEnabled;
