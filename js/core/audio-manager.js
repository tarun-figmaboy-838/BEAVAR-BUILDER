/**
 * Procedural sound design on WebAudio. No recordings ship with the project (see docs/ASSETS.md
 * for the drop-in hook); every cue is synthesised so the game is self-contained.
 * Guards: per-sound minimum interval, and loud cues are staggered so two never fire at once.
 */
const LOUD_GAP_SECONDS = 0.085;
const STORAGE_KEY = 'bridge-builder.muted';

function createNoiseBuffer(context, seconds) {
  const length = Math.floor(context.sampleRate * seconds);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
  return buffer;
}

function shapeGain(gainNode, t0, { attack, peak, hold, release }) {
  const gain = gainNode.gain;
  gain.cancelScheduledValues(t0);
  gain.setValueAtTime(0.0001, t0);
  gain.linearRampToValueAtTime(peak, t0 + attack);
  gain.setValueAtTime(peak, t0 + attack + hold);
  gain.exponentialRampToValueAtTime(0.0001, t0 + attack + hold + release);
}

function makeTone(context, out) {
  return ({ type = 'sine', freq = 440, freqEnd, t0, duration = 0.2, gain = 0.2, attack = 0.005, release }) => {
    const oscillator = context.createOscillator();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(freq, t0);
    if (freqEnd) oscillator.frequency.exponentialRampToValueAtTime(freqEnd, t0 + duration);
    const gainNode = context.createGain();
    const releaseTime = release ?? duration * 0.6;
    shapeGain(gainNode, t0, { attack, peak: gain, hold: Math.max(0, duration - attack - releaseTime), release: releaseTime });
    oscillator.connect(gainNode).connect(out);
    oscillator.start(t0);
    oscillator.stop(t0 + duration + 0.1);
  };
}

function makeNoise(context, out, buffer) {
  return ({ t0, duration = 0.1, gain = 0.2, filter = 'lowpass', freq = 1200, freqEnd, q = 0.7, attack = 0.004, release }) => {
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const biquad = context.createBiquadFilter();
    biquad.type = filter;
    biquad.frequency.setValueAtTime(freq, t0);
    if (freqEnd) biquad.frequency.exponentialRampToValueAtTime(freqEnd, t0 + duration);
    biquad.Q.value = q;
    const gainNode = context.createGain();
    const releaseTime = release ?? duration * 0.6;
    shapeGain(gainNode, t0, { attack, peak: gain, hold: Math.max(0, duration - attack - releaseTime), release: releaseTime });
    source.connect(biquad).connect(gainNode).connect(out);
    source.start(t0);
    source.stop(t0 + duration + 0.1);
  };
}

/* ---- One-shot cues ---- */
const SOUNDS = {
  uiTap: { minInterval: 0.04, play: ({ tone, t0 }) => tone({ t0, freq: 720, freqEnd: 960, duration: 0.06, gain: 0.08 }) },
  controlPress: {
    minInterval: 0.05,
    play: ({ tone, noise, t0 }) => {
      noise({ t0, duration: 0.04, gain: 0.18, freq: 900 });
      tone({ t0, type: 'sine', freq: 170, freqEnd: 120, duration: 0.07, gain: 0.12 });
    },
  },
  clawOpen: {
    minInterval: 0.12,
    play: ({ tone, noise, t0 }) => {
      tone({ t0, type: 'sawtooth', freq: 230, freqEnd: 410, duration: 0.16, gain: 0.05 });
      noise({ t0, duration: 0.12, gain: 0.05, filter: 'highpass', freq: 2600 });
    },
  },
  clawClose: {
    minInterval: 0.12,
    play: ({ tone, noise, t0 }) => {
      tone({ t0, type: 'sawtooth', freq: 410, freqEnd: 210, duration: 0.16, gain: 0.05 });
      noise({ t0: t0 + 0.14, duration: 0.035, gain: 0.16, filter: 'bandpass', freq: 1900, q: 2 });
    },
  },
  pickup: {
    loud: true,
    minInterval: 0.2,
    play: ({ tone, noise, t0 }) => {
      tone({ t0, type: 'sine', freq: 120, freqEnd: 78, duration: 0.2, gain: 0.3 });
      noise({ t0, duration: 0.08, gain: 0.16, freq: 650 });
    },
  },
  placement: {
    loud: true,
    minInterval: 0.2,
    play: ({ tone, noise, t0 }) => {
      noise({ t0, duration: 0.05, gain: 0.2, filter: 'bandpass', freq: 2400, q: 1.5 });
      tone({ t0, type: 'square', freq: 320, freqEnd: 240, duration: 0.12, gain: 0.08 });
      tone({ t0: t0 + 0.03, type: 'sine', freq: 1250, duration: 0.45, gain: 0.06, release: 0.4 });
    },
  },
  bolt: {
    minInterval: 0.06,
    play: ({ tone, noise, t0 }) => {
      tone({ t0, type: 'square', freq: 1700, duration: 0.03, gain: 0.05 });
      noise({ t0, duration: 0.03, gain: 0.1, filter: 'highpass', freq: 4200 });
    },
  },
  hammer: {
    minInterval: 0.09,
    play: ({ tone, noise, t0, options }) => {
      const pitch = 200 + (options?.variant ?? 0) * 40;
      noise({ t0, duration: 0.05, gain: 0.22, freq: 1500 });
      tone({ t0, type: 'triangle', freq: pitch, freqEnd: pitch * 0.7, duration: 0.05, gain: 0.1 });
    },
  },
  /** A cartoon hammer hit on steel: knock, ring and a little thud (each corner of a fitted frame). */
  clank: {
    minInterval: 0.08,
    play: ({ tone, noise, t0, options }) => {
      const pitch = [880, 990, 1110][(options?.variant ?? 0) % 3];
      noise({ t0, duration: 0.04, gain: 0.32, filter: 'bandpass', freq: 2600, q: 1.4 });
      tone({ t0, type: 'square', freq: pitch, freqEnd: pitch * 0.94, duration: 0.18, gain: 0.07, release: 0.16 });
      tone({ t0, type: 'sine', freq: pitch * 2.7, duration: 0.22, gain: 0.04, release: 0.2 });
      tone({ t0, type: 'sine', freq: 140, freqEnd: 80, duration: 0.09, gain: 0.22 });
    },
  },
  ding: {
    minInterval: 0.3,
    play: ({ tone, t0 }) => {
      tone({ t0, type: 'sine', freq: 1760, duration: 0.55, gain: 0.12, release: 0.5 });
      tone({ t0, type: 'sine', freq: 2637, duration: 0.3, gain: 0.04, release: 0.28 });
    },
  },
  correct: {
    loud: true,
    minInterval: 0.5,
    play: ({ tone, t0 }) => {
      [523, 659, 784, 1046].forEach((freq, index) => tone({ t0: t0 + index * 0.09, type: 'sine', freq, duration: 0.34, gain: 0.14, release: 0.28 }));
    },
  },
  incorrect: {
    loud: true,
    minInterval: 0.5,
    play: ({ tone, t0 }) => {
      tone({ t0, type: 'triangle', freq: 330, freqEnd: 300, duration: 0.26, gain: 0.16 });
      tone({ t0: t0 + 0.26, type: 'triangle', freq: 262, freqEnd: 236, duration: 0.36, gain: 0.16 });
    },
  },
  creak: {
    minInterval: 0.4,
    play: ({ tone, noise, t0 }) => {
      tone({ t0, type: 'sawtooth', freq: 95, freqEnd: 68, duration: 0.9, gain: 0.05, release: 0.6 });
      noise({ t0, duration: 0.9, gain: 0.07, filter: 'bandpass', freq: 420, freqEnd: 260, q: 3, release: 0.6 });
    },
  },
  collapse: {
    loud: true,
    minInterval: 1,
    play: ({ tone, noise, t0 }) => {
      noise({ t0, duration: 1.3, gain: 0.45, freq: 320, freqEnd: 110, release: 0.9 });
      tone({ t0, type: 'sine', freq: 62, freqEnd: 40, duration: 0.9, gain: 0.3, release: 0.7 });
      [0.18, 0.36, 0.6, 0.82].forEach((offset, index) => noise({ t0: t0 + offset, duration: 0.08, gain: 0.26 - index * 0.04, freq: 900 }));
    },
  },
  splash: {
    loud: true,
    minInterval: 0.5,
    play: ({ noise, t0 }) => {
      noise({ t0, duration: 0.55, gain: 0.34, filter: 'bandpass', freq: 1100, freqEnd: 380, q: 1.2, release: 0.4 });
      noise({ t0: t0 + 0.05, duration: 0.3, gain: 0.12, filter: 'highpass', freq: 3200 });
    },
  },
  celebration: {
    loud: true,
    minInterval: 1,
    play: ({ tone, t0 }) => {
      const notes = [[523, 0], [659, 0.14], [784, 0.28], [1046, 0.42]];
      notes.forEach(([freq, offset]) => tone({ t0: t0 + offset, type: 'triangle', freq, duration: 0.3, gain: 0.14, release: 0.22 }));
      [523, 659, 784, 1046].forEach((freq) => tone({ t0: t0 + 0.62, type: 'sine', freq, duration: 1.1, gain: 0.06, release: 0.9 }));
    },
  },
  whoosh: {
    minInterval: 0.2,
    play: ({ noise, t0 }) => noise({ t0, duration: 0.38, gain: 0.2, filter: 'bandpass', freq: 500, freqEnd: 2600, q: 0.9, release: 0.2 }),
  },
  thud: {
    loud: true,
    minInterval: 0.2,
    play: ({ tone, noise, t0 }) => {
      tone({ t0, type: 'sine', freq: 90, freqEnd: 55, duration: 0.22, gain: 0.28 });
      noise({ t0, duration: 0.06, gain: 0.14, freq: 500 });
    },
  },
};

/* ---- Loops ---- */
const LOOPS = {
  craneMotor: {
    start({ context, out, options }) {
      const heavy = Boolean(options?.heavy);
      const master = context.createGain();
      master.gain.setValueAtTime(0.0001, context.currentTime);
      master.gain.linearRampToValueAtTime(heavy ? 0.055 : 0.045, context.currentTime + 0.12);
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = heavy ? 320 : 420;
      filter.connect(master).connect(out);
      const oscillators = [heavy ? 52 : 64, heavy ? 79 : 97].map((freq) => {
        const oscillator = context.createOscillator();
        oscillator.type = 'sawtooth';
        oscillator.frequency.value = freq;
        oscillator.connect(filter);
        oscillator.start();
        return oscillator;
      });
      const wobble = context.createOscillator();
      wobble.frequency.value = heavy ? 6 : 9;
      const wobbleGain = context.createGain();
      wobbleGain.gain.value = 0.012;
      wobble.connect(wobbleGain).connect(master.gain);
      wobble.start();
      return {
        stop() {
          const now = context.currentTime;
          master.gain.cancelScheduledValues(now);
          master.gain.setTargetAtTime(0.0001, now, 0.05);
          setTimeout(() => {
            oscillators.forEach((oscillator) => oscillator.stop());
            wobble.stop();
          }, 300);
        },
      };
    },
  },
  construction: {
    start({ context, out, buffer }) {
      const tone = makeTone(context, out);
      const noise = makeNoise(context, out, buffer);
      let beat = 0;
      const timer = setInterval(() => {
        const t0 = context.currentTime + 0.02;
        const variant = beat % 3;
        noise({ t0, duration: 0.05, gain: 0.16, freq: 1400 + variant * 300 });
        tone({ t0, type: 'triangle', freq: 210 + variant * 35, freqEnd: 150, duration: 0.05, gain: 0.07 });
        if (beat % 4 === 2) tone({ t0, type: 'sawtooth', freq: 150, freqEnd: 190, duration: 0.3, gain: 0.025, release: 0.2 });
        beat += 1;
      }, 175);
      return { stop: () => clearInterval(timer) };
    },
  },
};

function readStoredMute() {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function createAudioManager() {
  let context = null;
  let master = null;
  let noiseBuffer = null;
  let muted = readStoredMute();
  let ducked = false;
  let lastLoudAt = 0;
  const lastPlayed = new Map();
  const activeLoops = new Map();
  const listeners = new Set();

  function ensureContext() {
    if (context) return context;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    context = new AudioContextClass();
    master = context.createGain();
    master.gain.value = muted ? 0 : 1;
    master.connect(context.destination);
    noiseBuffer = createNoiseBuffer(context, 1.5);
    return context;
  }

  function isReady() {
    const ctx = ensureContext();
    return Boolean(ctx && ctx.state === 'running');
  }

  function applyMasterGain() {
    if (!master) return;
    const target = muted ? 0 : ducked ? 0.42 : 1;
    master.gain.setTargetAtTime(target, context.currentTime, 0.06);
  }

  return {
    /** Call from a user gesture so the browser allows audio. */
    unlock() {
      const ctx = ensureContext();
      if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
    },
    play(name, options) {
      const definition = SOUNDS[name];
      if (!definition) {
        console.warn(`[audio] unknown sound: ${name}`);
        return;
      }
      if (!isReady()) return;
      const now = context.currentTime;
      if (now - (lastPlayed.get(name) ?? -1) < (definition.minInterval ?? 0.05)) return;
      let t0 = now + 0.005;
      if (definition.loud) {
        if (t0 - lastLoudAt < LOUD_GAP_SECONDS) t0 = lastLoudAt + LOUD_GAP_SECONDS;
        lastLoudAt = t0;
      }
      lastPlayed.set(name, now);
      definition.play({ t0, options, tone: makeTone(context, master), noise: makeNoise(context, master, noiseBuffer) });
    },
    startLoop(name, options) {
      if (activeLoops.has(name) || !LOOPS[name] || !isReady()) return;
      activeLoops.set(name, LOOPS[name].start({ context, out: master, buffer: noiseBuffer, options }));
    },
    stopLoop(name) {
      const handle = activeLoops.get(name);
      if (!handle) return;
      activeLoops.delete(name);
      handle.stop();
    },
    stopAllLoops() {
      for (const name of [...activeLoops.keys()]) this.stopLoop(name);
    },
    isLooping(name) {
      return activeLoops.has(name);
    },
    get muted() {
      return muted;
    },
    setMuted(value) {
      muted = Boolean(value);
      applyMasterGain();
      try {
        localStorage.setItem(STORAGE_KEY, muted ? '1' : '0');
      } catch {
        /* storage unavailable: mute still applies for this session */
      }
      for (const listener of listeners) listener(muted);
    },
    /** Effects sit under the narration while a voice line plays. */
    duck(on) {
      ducked = Boolean(on);
      applyMasterGain();
    },
    toggleMuted() {
      this.setMuted(!muted);
      return muted;
    },
    onMuteChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
