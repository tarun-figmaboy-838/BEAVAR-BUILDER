/**
 * The lesson card in front of the workshop backdrop: the narration box at the top (sized to its words),
 * the drawing surface with the live triangle and the screen's widgets, and the beaver's place.
 * Everything written on it is live text, revealed word by word with the voice.
 */
import { LEARNING_COPY } from './learning-content.js';
import { revealWords, hugWords } from '../gameplay/feedback-controller.js';
import { fitBubble } from '../gameplay/bubble-shape.js';
import { playClassAnimation, wait, prefersReducedMotion } from '../core/motion.js';
import { VO_WORD_TIMES } from '../data/vo-word-times.js';

/** Stage-space geometry of the card and its parts. */
export const BOARD = Object.freeze({
  left: 160, top: 110, width: 1600, height: 820,
  backdrop: 'assets/images/workshop/learning-backdrop.webp',
  /** The drawing surface inside the card (below the narration box), in card px. */
  surface: Object.freeze({ left: 20, top: 150, width: 1560, height: 640 }),
  canvas: Object.freeze({ width: 1560, height: 640 }),
  /** Where the beaver stands: his feet, in card px. */
  guide: Object.freeze({ x: 150, groundY: 800 }),
});

const READING_MS_PER_CHARACTER = 58;         // a reading pace for lines without a clip (a clip sets its own)

/** When each word of `text` appears: the clip's measured word times, or the same even pace revealWords uses. */
function wordDelays(text, spoken, typingMs) {
  const words = text.split(' ');
  const times = spoken.clipId ? VO_WORD_TIMES[spoken.clipId] : null;
  const synced = Array.isArray(times) && times.length === words.length;
  const step = words.length > 1 ? Math.max(40, Math.min(220, (typingMs - 300) / (words.length - 1))) : 0;
  return words.map((_, i) => Math.round(synced ? times[i] / (spoken.rate ?? 1) : i * step));
}
/**
 * A line longer than one comfortable box is shown in parts, one after another (the voice reads it whole):
 * first at sentence ends, then at a natural join nearest the middle. Returns word-index boundaries.
 */
const LINE_MAX = 58;
const JOINS = [' is called ', ', ', ' and ', ' but ', ' so ', ' by ', ' when ', ' to ', ' with '];
function splitLine(text) {
  const words = text.split(' ');
  if (text.length <= LINE_MAX) return [[0, words.length]];
  const pieces = [];                                 // [startWord, endWord) ranges
  let start = 0;
  words.forEach((w, i) => { if (/[.!?]$/.test(w) && i < words.length - 1) { pieces.push([start, i + 1]); start = i + 1; } });
  pieces.push([start, words.length]);
  const out = [];
  for (const [a, b] of pieces) {
    const piece = words.slice(a, b).join(' ');
    if (piece.length <= LINE_MAX || b - a < 4) { out.push([a, b]); continue; }
    let bestAt = -1; let bestDist = Infinity;
    for (const join of JOINS) {
      let from = 0;
      for (;;) {
        const at = piece.indexOf(join, from);
        if (at < 0) break;
        const cut = join === ', ' ? at + 1 : at;    // the comma stays with the first part
        const dist = Math.abs(cut - piece.length / 2);
        const wordsBefore = piece.slice(0, cut).trim().split(' ').length;
        if (dist < bestDist && wordsBefore >= 2 && b - a - wordsBefore >= 2) { bestDist = dist; bestAt = a + wordsBefore; }
        from = at + 1;
      }
    }
    if (bestAt > a && bestAt < b) { out.push([a, bestAt]); out.push([bestAt, b]); } else out.push([a, b]);
  }
  return out;
}
/** The index of the word where `phrase` begins in `text` (case and trailing punctuation ignored), or -1. */
function phraseIndex(text, phrase) {
  const clean = (w) => w.toLowerCase().replace(/[.,!?;:]+$/, '');
  const words = text.split(' ').map(clean);
  const wanted = phrase.split(' ').map(clean);
  for (let i = 0; i + wanted.length <= words.length; i += 1) {
    if (wanted.every((w, k) => words[i + k] === w)) return i;
  }
  return -1;
}

export function createWorkshopBoard({ hostEl, voice, audio, talker = null }) {
  const root = document.createElement('div');
  root.className = 'workshop';
  root.dataset.state = 'ENTERING';
  root.setAttribute('aria-label', LEARNING_COPY.workshopTitle);
  root.innerHTML = `
    <div class="workshop__card">
      <div class="ws-narration" role="status" aria-live="polite">
        <p class="ws-narration__text"></p>
      </div>
      <div class="workshop__surface">
        <div class="ws-stage"></div>
        <div class="ws-overlay"></div>
      </div>
      <div class="workshop__guide"></div>
    </div>`;
  hostEl.appendChild(root);

  const cardEl = root.querySelector('.workshop__card');
  const stageEl = root.querySelector('.ws-stage');
  const overlayEl = root.querySelector('.ws-overlay');
  let bubbleEl = null;
  const guideHostEl = root.querySelector('.workshop__guide');
  const narrationEl = root.querySelector('.ws-narration');
  const textEl = root.querySelector('.ws-narration__text');

  const reduced = () => prefersReducedMotion();
  let cueTimers = [];
  let partTimers = [];
  let currentLine = '';
  const cancelParts = () => { partTimers.forEach(clearTimeout); partTimers = []; };
  const cancelCues = () => { cueTimers.forEach(clearTimeout); cueTimers = []; cancelParts(); };
  /** Runs each cue when its phrase is spoken (the words appear at the same moment). */
  function scheduleCues(text, spoken, typingMs, cues) {
    cancelCues();
    if (!cues?.length) return;
    const delays = wordDelays(text, spoken, typingMs);
    const start = () => {
      for (const cue of cues) {
        const index = phraseIndex(text, cue.phrase);
        const at = reduced() ? 0 : index >= 0 ? delays[index] : 0;
        cueTimers.push(setTimeout(() => { try { cue.run(); } catch (error) { console.error('[learning] cue', error); } }, at));
      }
    };
    (spoken.started ?? Promise.resolve()).then(start);
  }

  return {
    root, stageEl, overlayEl, guideHostEl, narrationEl,
    talker,
    cancelCues,
    /** The card comes up from the workshop floor and settles. */
    async rise({ signal } = {}) {
      root.classList.remove('is-lowered');
      root.classList.add('is-rising');
      audio?.play('panelRise');
      await wait(reduced() ? 0 : 900, signal).catch(() => {});
      root.classList.remove('is-rising');
      root.classList.add('is-up');
    },
    async lower({ signal } = {}) {
      root.classList.remove('is-up');
      root.classList.add('is-lowering');
      audio?.play('panelRise');
      await wait(reduced() ? 0 : 700, signal).catch(() => {});
      root.classList.remove('is-lowering');
      root.classList.add('is-lowered');
    },
    setState(name) {
      root.dataset.state = name;
    },
    /** The beaver at the card: in front of it at the bottom-left, or peeking from behind a summary card. */
    setGuidePresent(present) {
      root.classList.toggle('has-guide', Boolean(present));
    },
    setGuidePeeking(on) {
      root.classList.toggle('is-peeking', Boolean(on));
    },
    /**
     * The teaching line: the words appear at the voice's pace (recorded clip or a reading pace), and each
     * cue ({ phrase, run }) fires on its spoken word. `focus` words take the key-word style.
     */
    narrate(text, { focus = null, cues = null } = {}) {
      narrationEl.hidden = false;
      playClassAnimation(narrationEl, 'is-swapping', 420);
      const spoken = voice.say(text, { speaker: 'builder' });
      const typingMs = spoken.spoke ? Math.max(300, (spoken.seconds - 0.35) * 1000) : Math.min(4200, text.length * READING_MS_PER_CHARACTER);
      currentLine = text;
      cancelParts();
      const parts = splitLine(text);
      let typed;
      if (parts.length === 1) {
        typed = revealWords(textEl, text, typingMs, focus, { times: spoken.clipId ? VO_WORD_TIMES[spoken.clipId] : null, rate: spoken.rate ?? 1, started: spoken.started });
      } else {
        // Each part takes the box in turn, when its first word is due; the words keep the whole line's timing.
        const words = text.split(' ');
        const delays = wordDelays(text, spoken, typingMs);
        // Each part reveals word by word on the line's own word times (its span is passed so it animates).
        const showPart = ([a, b], started) => revealWords(textEl, words.slice(a, b).join(' '), delays[b - 1] - delays[a] + 300, focus, { times: delays.slice(a, b).map((d) => d - delays[a]), rate: 1, started });
        showPart(parts[0], spoken.started);
        (spoken.started ?? Promise.resolve()).then(() => {
          for (const part of parts.slice(1)) {
            partTimers.push(setTimeout(() => { playClassAnimation(narrationEl, 'is-swapping', 420); showPart(part, null); }, reduced() ? 0 : delays[part[0]]));
          }
        });
        const last = parts[parts.length - 1];
        typed = wait(reduced() ? 0 : delays[last[1] - 1] + 460);
      }
      scheduleCues(text, spoken, typingMs, cues);
      this.talker?.talkUntil?.(spoken.finished);
      return { finished: Promise.all([spoken.finished, typed]).then(() => undefined), seconds: spoken.seconds };
    },
    /** The line on screen, as plain text (for the QA hooks). */
    get narrationText() {
      return currentLine || (textEl.querySelector('.visually-hidden')?.textContent ?? textEl.textContent);
    },
    /** Stops the voice mid-line (a debug jump). */
    stopVoice() {
      voice.stop();
    },
    clearNarration() {
      cancelParts();
      currentLine = '';
      textEl.textContent = '';
    },
    /**
     * The beaver says a line himself, in the game's own speech bubble (the cab's: white, crane-yellow outline,
     * drawn tail), its tail on `tip` (card px, just above his head), not in the narration box.
     */
    speak(text, { focus = null, tip = { x: 205, y: 430 }, holdMs = 900, cues = null } = {}) {
      narrationEl.hidden = true;
      cancelCues();
      currentLine = text;
      bubbleEl?.remove();
      bubbleEl = document.createElement('div');
      bubbleEl.className = 'speech-bubble ws-say';
      bubbleEl.innerHTML = '<svg class="speech-bubble__shape" aria-hidden="true"><path class="speech-bubble__face"/></svg><p class="speech-bubble__text"></p>';
      cardEl.appendChild(bubbleEl);
      const textEl = bubbleEl.querySelector('.speech-bubble__text');
      const spoken = voice.say(text, { speaker: 'builder' });
      const typingMs = spoken.spoke ? Math.max(300, (spoken.seconds - 0.35) * 1000) : Math.min(4200, text.length * READING_MS_PER_CHARACTER);
      const typed = revealWords(textEl, text, typingMs, focus, { times: spoken.clipId ? VO_WORD_TIMES[spoken.clipId] : null, rate: spoken.rate ?? 1, started: spoken.started });
      scheduleCues(text, spoken, typingMs, cues);
      hugWords(bubbleEl, textEl);
      const at = fitBubble(bubbleEl.querySelector('.speech-bubble__shape'), bubbleEl, { at: 0.16, lean: -1 });
      bubbleEl.style.left = `${Math.round(tip.x - at[0])}px`;
      bubbleEl.style.top = `${Math.round(tip.y - at[1])}px`;
      bubbleEl.style.transformOrigin = `${Math.round(at[0])}px ${Math.round(at[1])}px`;
      playClassAnimation(bubbleEl, 'is-entering', 620);
      this.talker?.talkUntil?.(spoken.finished);
      const finished = Promise.all([spoken.finished, typed]).then(() => wait(reduced() ? 0 : holdMs)).then(() => this.hideBubble());
      return { finished, seconds: spoken.seconds };
    },
    hideBubble() {
      const bubble = bubbleEl;
      if (!bubble) return Promise.resolve();
      bubbleEl = null;
      bubble.classList.add('is-leaving');
      return wait(reduced() ? 0 : 280).then(() => bubble.remove());
    },
    hideNarration() {
      narrationEl.hidden = true;
    },
    destroy() {
      root.remove();
    },
  };
}
