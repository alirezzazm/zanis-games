// Sound effects synthesised with WebAudio, so the app ships no audio files.

let context = null;
let muted = false;

function audio() {
  if (!context) {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    context = new Ctor();
  }
  if (context.state === 'suspended') context.resume();
  return context;
}

function tone(frequency, duration, { type = 'sine', gain = 0.15, delay = 0, slideTo } = {}) {
  const ctx = audio();
  if (!ctx || muted) return;
  const start = ctx.currentTime + delay;
  const oscillator = ctx.createOscillator();
  const volume = ctx.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  if (slideTo) oscillator.frequency.exponentialRampToValueAtTime(slideTo, start + duration);
  volume.gain.setValueAtTime(gain, start);
  volume.gain.exponentialRampToValueAtTime(0.001, start + duration);
  oscillator.connect(volume).connect(ctx.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

export const sfx = {
  tap: () => tone(520, 0.06, { type: 'triangle', gain: 0.1 }),
  tick: () => tone(900, 0.03, { type: 'square', gain: 0.05 }),
  good: () => {
    tone(660, 0.1);
    tone(880, 0.14, { delay: 0.09 });
  },
  bad: () => tone(200, 0.25, { type: 'sawtooth', gain: 0.1, slideTo: 110 }),
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, { delay: i * 0.11, type: 'triangle' })),
  lose: () => [392, 330, 262].forEach((f, i) => tone(f, 0.22, { delay: i * 0.14, type: 'triangle', gain: 0.1 })),
  setMuted(value) {
    muted = value;
  },
  isMuted: () => muted,
};
