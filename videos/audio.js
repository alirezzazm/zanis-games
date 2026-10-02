// Soundtrack for the booth videos, synthesised with WebAudio (no audio files in the repo):
// a soft music bed plus sound effects placed on the timeline of each scene.
//
// window.renderAudio(sceneId) renders the whole track offline and resolves with a base64 WAV;
// videos/render.mjs muxes it into the MP4. There is no voice-over: the captions carry the explanation.

// Wrapped in a function scope: scenes.js is a classic script too and has its own top-level names (e.g. noise).
(() => {
const SAMPLE_RATE = 44100;

// ---------------------------------------------------------------- instruments
function tone(ctx, out, { at, frequency, duration, type = 'sine', gain = 0.2, slideTo, attack = 0.01 }) {
  const oscillator = ctx.createOscillator();
  const volume = ctx.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, at);
  if (slideTo) oscillator.frequency.exponentialRampToValueAtTime(slideTo, at + duration);
  volume.gain.setValueAtTime(0.0001, at);
  volume.gain.exponentialRampToValueAtTime(gain, at + attack);
  volume.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  oscillator.connect(volume).connect(out);
  oscillator.start(at);
  oscillator.stop(at + duration + 0.05);
}

function noise(ctx, out, { at, duration, gain = 0.2, filter = 1200, sweepTo, type = 'bandpass' }) {
  const length = Math.ceil(duration * SAMPLE_RATE);
  const buffer = ctx.createBuffer(1, length, SAMPLE_RATE);
  const data = buffer.getChannelData(0);
  // Deterministic noise so every render of a scene is identical.
  let seed = 22222 + Math.round(at * 1000);
  for (let index = 0; index < length; index++) {
    seed = (seed * 16807) % 2147483647;
    data[index] = (seed / 2147483647) * 2 - 1;
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const band = ctx.createBiquadFilter();
  band.type = type;
  band.frequency.setValueAtTime(filter, at);
  if (sweepTo) band.frequency.exponentialRampToValueAtTime(sweepTo, at + duration);
  const volume = ctx.createGain();
  volume.gain.setValueAtTime(0.0001, at);
  volume.gain.exponentialRampToValueAtTime(gain, at + Math.min(0.08, duration / 3));
  volume.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  source.connect(band).connect(volume).connect(out);
  source.start(at);
}

const EFFECTS = {
  tick: (ctx, out, at) => tone(ctx, out, { at, frequency: 1400, duration: 0.04, type: 'square', gain: 0.05 }),
  click: (ctx, out, at) => {
    tone(ctx, out, { at, frequency: 620, duration: 0.09, type: 'triangle', gain: 0.25 });
    tone(ctx, out, { at: at + 0.07, frequency: 930, duration: 0.25, gain: 0.18 });
  },
  buzz: (ctx, out, at) => {
    tone(ctx, out, { at, frequency: 150, duration: 0.9, type: 'sawtooth', gain: 0.3 });
    tone(ctx, out, { at, frequency: 157, duration: 0.9, type: 'square', gain: 0.12 });
  },
  whoosh: (ctx, out, at) => noise(ctx, out, { at, duration: 0.9, gain: 0.3, filter: 300, sweepTo: 3200 }),
  select: (ctx, out, at) => {
    tone(ctx, out, { at, frequency: 880, duration: 0.12, gain: 0.22 });
    tone(ctx, out, { at: at + 0.1, frequency: 1320, duration: 0.3, gain: 0.2 });
  },
  sweep: (ctx, out, at) => tone(ctx, out, { at, frequency: 420, slideTo: 980, duration: 1.2, type: 'triangle', gain: 0.1, attack: 0.3 }),
  beep: (ctx, out, at) => tone(ctx, out, { at, frequency: 660, duration: 0.22, type: 'square', gain: 0.14 }),
  go: (ctx, out, at) => tone(ctx, out, { at, frequency: 990, duration: 0.6, type: 'square', gain: 0.16 }),
  ratchet: (ctx, out, at) => noise(ctx, out, { at, duration: 0.07, gain: 0.12, filter: 2600 }),
  fanfare: (ctx, out, at) =>
    [523.25, 659.25, 783.99, 1046.5].forEach((frequency, index) =>
      tone(ctx, out, { at: at + index * 0.14, frequency, duration: index === 3 ? 0.9 : 0.3, type: 'triangle', gain: 0.28 }),
    ),
  applause: (ctx, out, at) => noise(ctx, out, { at, duration: 3, gain: 0.16, filter: 2400, type: 'highpass' }),
  chime: (ctx, out, at) =>
    [1318.5, 1760, 2093].forEach((frequency, index) => tone(ctx, out, { at: at + index * 0.09, frequency, duration: 0.8, gain: 0.14 })),
};

/** Music bed: a slow four-chord loop (pad + plucked arpeggio), quiet enough to sit under the effects. */
function musicBed(ctx, out, duration) {
  const chords = [
    [220.0, 261.63, 329.63], // A minor
    [174.61, 220.0, 261.63], // F major
    [261.63, 329.63, 392.0], // C major
    [196.0, 246.94, 293.66], // G major
  ];
  const bar = 2.4;
  for (let start = 0, index = 0; start < duration; start += bar, index++) {
    const chord = chords[index % chords.length];
    chord.forEach((frequency) => tone(ctx, out, { at: start, frequency, duration: bar * 1.05, gain: 0.035, attack: 0.5 }));
    for (let step = 0; step < 8; step++) {
      const note = chord[step % chord.length] * (step % 4 === 3 ? 4 : 2);
      tone(ctx, out, { at: start + step * (bar / 8), frequency: note, duration: 0.5, type: 'triangle', gain: 0.045 });
    }
  }
}

// ---------------------------------------------------------------- per-scene timelines
/** Every `interval` seconds between `from` and `to`. */
const every = (effect, from, to, interval) => {
  const events = [];
  for (let at = from; at < to; at += interval) events.push([at, effect]);
  return events;
};

const TIMELINES = {
  'buzz-wire': [
    ...every('tick', 3, 7.1, 0.45),
    [7.2, 'buzz'],
    ...every('tick', 9.6, 19.3, 0.38),
    [19.5, 'fanfare'],
    [19.7, 'applause'],
  ],
  'vr-ar': [
    [7.3, 'whoosh'],
    [11.3, 'click'],
    [12.6, 'click'],
    [13.9, 'click'],
    [15.5, 'chime'],
    [18.2, 'select'],
    [20.6, 'sweep'],
    [22.0, 'sweep'],
    [26.4, 'whoosh'],
    [30.0, 'chime'],
  ],
  'install-race': [
    [2.6, 'beep'],
    [3.4, 'beep'],
    [4.2, 'beep'],
    [5.0, 'go'],
    ...every('ratchet', 5.4, 17.3, 0.31),
    [17.5, 'fanfare'],
    [17.7, 'applause'],
  ],
};

// ---------------------------------------------------------------- WAV export
function toWavBase64(buffer) {
  const channels = buffer.numberOfChannels;
  const frames = buffer.length;
  const bytes = new Uint8Array(44 + frames * channels * 2);
  const view = new DataView(bytes.buffer);
  const writeText = (offset, value) => [...value].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
  writeText(0, 'RIFF');
  view.setUint32(4, 36 + frames * channels * 2, true);
  writeText(8, 'WAVE');
  writeText(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  writeText(36, 'data');
  view.setUint32(40, frames * channels * 2, true);
  const data = Array.from({ length: channels }, (_, channel) => buffer.getChannelData(channel));
  let offset = 44;
  for (let frame = 0; frame < frames; frame++) {
    for (let channel = 0; channel < channels; channel++) {
      const sample = Math.max(-1, Math.min(1, data[channel][frame]));
      view.setInt16(offset, sample * 0x7fff, true);
      offset += 2;
    }
  }
  let binary = '';
  const chunk = 0x8000;
  for (let start = 0; start < bytes.length; start += chunk) binary += String.fromCharCode(...bytes.subarray(start, start + chunk));
  return btoa(binary);
}

/** Renders the soundtrack of a scene offline. Resolves with a base64-encoded 16-bit stereo WAV. */
window.renderAudio = async (sceneId) => {
  const duration = window.SCENES[sceneId];
  const ctx = new OfflineAudioContext(2, Math.ceil(duration * SAMPLE_RATE), SAMPLE_RATE);
  const master = ctx.createGain();
  // Fade the whole track in and out so the video does not start or end with a click.
  master.gain.setValueAtTime(0.0001, 0);
  master.gain.exponentialRampToValueAtTime(0.9, 0.6);
  master.gain.setValueAtTime(0.9, duration - 1.2);
  master.gain.exponentialRampToValueAtTime(0.0001, duration - 0.05);
  master.connect(ctx.destination);
  musicBed(ctx, master, duration);
  for (const [at, effect] of TIMELINES[sceneId] ?? []) EFFECTS[effect](ctx, master, at);
  return toWavBase64(await ctx.startRendering());
};
})();
