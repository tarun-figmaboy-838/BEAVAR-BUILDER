import { VO_LINES } from '../data/vo-lines.js';

/**
 * Narration player in the Fishing Frenzy style: one reused <audio>, lines looked up by the exact
 * text on screen, unlocked by the Start tap, SFX ducked while a voice plays, every clip prefetched
 * quietly after Start. Without a clip (or with ?vo=0) the line falls back to the device's speech
 * voice, and without that it is simply shown for a reading-pace moment. Nothing ever blocks the game.
 */
const VO_DIR = 'assets/audio/vo/';
/** A twentieth of a second of silence: unlocks audio on tablets without ever sounding a real line. */
const SILENT_CLIP = 'data:audio/wav;base64,UklGRrQBAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YZABAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA';
const WORDS_PER_SECOND = 2.6;
const PREFERRED_SPEECH_LANGS = ['en-IN', 'en-GB', 'en-US', 'en'];

function normalize(text) {
  return String(text ?? '').replace(/\s+/g, ' ').trim();
}

function estimateSeconds(text) {
  const words = normalize(text).split(' ').filter(Boolean).length;
  return Math.max(1.1, 0.35 + words / WORDS_PER_SECOND);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function createVoiceManager({ audio }) {
  const params = new URLSearchParams(location.search);
  const disabledByQuery = params.get('vo') === '0';
  const rate = clamp(parseFloat(params.get('vorate')) || 1, 0.5, 4);
  let element = null;
  try {
    element = new Audio();
    element.preload = 'auto';
  } catch {
    element = null;
  }
  const clipsEnabled = Boolean(element) && !disabledByQuery && Object.keys(VO_LINES).length > 0;
  // Only the studio voice (the beaver's recorded clips) is heard: a line without its clip is shown at a reading
  // pace instead of being read by a different device voice. `?speech=1` turns the device voice on for review.
  const speechEnabled = params.get('speech') === '1' && !disabledByQuery && typeof speechSynthesis !== 'undefined' && typeof SpeechSynthesisUtterance !== 'undefined';
  const blobUrls = new Map();
  let token = 0;
  let unlocked = false;
  let muted = false;
  let prefetchStarted = false;
  let settleCurrent = null; // resolves the line that is playing, so stop() never leaves a promise hanging

  // The production build (dist/) ships every clip as small Ogg Opus too and marks <html data-vo-ogg>;
  // browsers that can play it (Chrome, Firefox, Edge, newer Safari) take the Ogg, the rest keep the MP3.
  const canOgg = Boolean(element) && element.canPlayType('audio/ogg; codecs="opus"') !== '';
  const useOgg = canOgg && document.documentElement.hasAttribute('data-vo-ogg');
  // A clip with its own Ogg twin (the lesson's: `ogg` in the map) plays it wherever Opus plays, else its AAC.
  const fileFor = (clip) => (clip.ogg && canOgg ? clip.ogg : useOgg ? clip.file.replace(/\.mp3$/, '.ogg') : clip.file);
  const clipFor = (text) => VO_LINES[normalize(text)] ?? null;
  const sourceFor = (clip) => blobUrls.get(fileFor(clip)) ?? VO_DIR + fileFor(clip);

  /**
   * Until the beaver's studio lines exist, the device reads them: a MALE Indian English voice first, so it
   * sounds like the operator's recorded voice (Male Teacher), then any Indian English voice, then the rest.
   */
  const MALE_VOICE_NAMES = ['rishi', 'aman', 'ravi', 'prabhat', 'hemant', 'kumar', 'daniel', 'arthur', 'oliver', 'aaron', 'alex', 'fred', 'guy', 'ryan', 'thomas'];
  const FEMALE_VOICE_NAMES = ['tara', 'veena', 'isha', 'lekha', 'heera', 'neerja', 'kalpana', 'swara', 'samantha', 'karen', 'moira', 'tessa', 'fiona', 'victoria', 'kate', 'serena', 'susan', 'zira', 'aria', 'jenny', 'female'];
  const nameHas = (voice, names) => names.some((n) => voice.name?.toLowerCase().includes(n));
  function pickSpeechVoice() {
    const voices = speechSynthesis.getVoices();
    for (const lang of PREFERRED_SPEECH_LANGS) {
      const inLang = voices.filter((voice) => voice.lang?.toLowerCase().replace('_', '-').startsWith(lang.toLowerCase()));
      const male = inLang.find((voice) => nameHas(voice, MALE_VOICE_NAMES)) ?? inLang.find((voice) => !nameHas(voice, FEMALE_VOICE_NAMES));
      if (male) return male;
    }
    for (const lang of PREFERRED_SPEECH_LANGS) {
      const match = voices.find((voice) => voice.lang?.toLowerCase().replace('_', '-').startsWith(lang.toLowerCase()));
      if (match) return match;
    }
    return voices[0] ?? null;
  }

  function playClip(clip, myToken, onStart = () => {}) {
    return new Promise((resolve) => {
      let started = false;
      let settled = false;
      let watchdog = 0;
      const finish = (spoke) => {
        if (settled) return;
        settled = true;
        clearTimeout(watchdog);
        onStart();                 // never leave a caption waiting for a voice that did not come
        if (myToken === token) {
          element.onplaying = element.onended = element.onerror = null;
          audio.duck(false);
          settleCurrent = null;
        }
        resolve(spoke);
      };
      settleCurrent = () => finish(started);
      element.onplaying = () => {
        if (myToken !== token) return;
        started = true;
        onStart();
        audio.duck(true);
      };
      element.onended = () => myToken === token && finish(true);
      element.onerror = () => myToken === token && finish(started);
      watchdog = setTimeout(() => finish(started), (clip.seconds / rate) * 1000 + 900);
      try {
        element.src = sourceFor(clip);
        element.playbackRate = rate;
        element.muted = muted;
        const playing = element.play();
        playing?.catch(() => myToken === token && finish(false));
      } catch {
        finish(false);
      }
    });
  }

  function speakWithDevice(text, speaker, myToken) {
    return new Promise((resolve) => {
      const utterance = new SpeechSynthesisUtterance(normalize(text));
      const chosenVoice = pickSpeechVoice();
      if (chosenVoice) utterance.voice = chosenVoice;
      utterance.rate = 0.95 * rate;
      utterance.pitch = speaker === 'builder' ? 0.9 : 1.05;
      let settled = false;
      let watchdog = 0;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(watchdog);
        if (myToken === token) {
          audio.duck(false);
          settleCurrent = null;
        }
        resolve(true);
      };
      settleCurrent = finish;
      utterance.onend = finish;
      utterance.onerror = finish;
      watchdog = setTimeout(finish, (estimateSeconds(text) / rate) * 1000 + 1500);
      audio.duck(true);
      try {
        speechSynthesis.cancel();
        speechSynthesis.speak(utterance);
      } catch {
        finish();
      }
    });
  }

  return {
    get hasRecordedClips() {
      return clipsEnabled;
    },
    hasClip(text) {
      return Boolean(clipFor(text));
    },
    /** Call inside the first user gesture (Start): a muted play unlocks audio on tablets. */
    unlock() {
      if (!clipsEnabled || unlocked) return;
      unlocked = true;
      try {
        element.muted = true;
        element.src = SILENT_CLIP;
        const playing = element.play();
        const settle = () => {
          if (token === 0) element.pause();
          element.muted = muted;
        };
        if (playing?.then) playing.then(settle, () => { element.muted = muted; unlocked = false; });
        else settle();
      } catch {
        unlocked = false;
      }
    },
    /** Speak a line. Returns its expected length and a promise that resolves when it has finished. */
    say(text, { speaker = 'narrator' } = {}) {
      this.stop();
      const myToken = ++token;
      const clip = clipFor(text);
      // `started` resolves when the voice is actually heard (a clip can wait to load), so captions can wait for it.
      if (clipsEnabled && clip && !muted) {
        let markStarted;
        const started = new Promise((resolve) => { markStarted = resolve; });
        return { seconds: clip.seconds / rate, spoke: true, clipId: clip.id, rate, started, finished: playClip(clip, myToken, markStarted).then(() => undefined) };
      }
      if (speechEnabled && !muted) {
        return { seconds: estimateSeconds(text) / rate, spoke: true, rate, started: Promise.resolve(), finished: speakWithDevice(text, speaker, myToken).then(() => undefined) };
      }
      const seconds = estimateSeconds(text) / rate;
      return { seconds, spoke: false, rate, started: Promise.resolve(), finished: new Promise((resolve) => setTimeout(resolve, seconds * 1000)) };
    },
    stop() {
      const interrupted = settleCurrent;
      settleCurrent = null;
      token += 1;
      if (element) {
        element.onplaying = element.onended = element.onerror = null;
        try {
          element.pause();
        } catch {
          /* nothing was playing */
        }
      }
      if (speechEnabled) {
        try {
          speechSynthesis.cancel();
        } catch {
          /* no utterance queued */
        }
      }
      audio.duck(false);
      interrupted?.(); // settles the cut-off line now; its token no longer matches, so it changes nothing else
    },
    setMuted(value) {
      muted = Boolean(value);
      if (element) element.muted = muted;
      if (muted) this.stop();
    },
    /** After Start: fetch every clip quietly, one at a time, so each is ready when its line comes. */
    prefetch() {
      if (!clipsEnabled || prefetchStarted || location.protocol === 'file:' || typeof fetch !== 'function') return;
      prefetchStarted = true;
      const files = [...new Set(Object.values(VO_LINES).map(fileFor))];
      (async () => {
        for (const file of files) {
          try {
            const response = await fetch(VO_DIR + file);
            if (response.ok) blobUrls.set(file, URL.createObjectURL(await response.blob()));
          } catch {
            /* the clip streams when it is needed instead */
          }
        }
      })();
    },
  };
}
