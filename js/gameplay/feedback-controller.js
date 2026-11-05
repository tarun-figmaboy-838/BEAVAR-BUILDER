import { wait, playClassAnimation, prefersReducedMotion } from '../core/motion.js';
import { fitBubble } from './bubble-shape.js';
import { VO_WORD_TIMES } from '../data/vo-word-times.js';

const READING_MS_PER_CHARACTER = 42;

/**
 * Types `text` into `element` over `totalMs`. A hidden full-length copy reserves the final size so the
 * card never grows while typing, and screen readers get the whole line at once.
 */
const escapeHtml = (value) => value.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/**
 * Shows `text` a word at a time over `totalMs` (each word rises and settles, eased, no overshoot), as
 * it is read out. The words of the `focus` phrase are the key words: gold, nothing behind them. Screen readers get the whole line at once. The layout is final from the first frame
 * (hidden words still take their place), so the box never grows while the words appear.
 */
function revealWords(element, text, totalMs, focus = null, { times = null, rate = 1, started = null } = {}) {
  element.textContent = '';
  const screenReaderCopy = document.createElement('span');
  screenReaderCopy.className = 'visually-hidden';
  screenReaderCopy.textContent = text;
  const line = document.createElement('span');
  line.className = 'reveal-line';
  line.setAttribute('aria-hidden', 'true');
  const start = focus ? text.indexOf(focus) : -1;
  const end = start + (focus?.length ?? 0);
  const words = [];
  let offset = 0;
  for (const word of text.split(' ')) {
    const at = text.indexOf(word, offset);
    offset = at + word.length;
    const bare = word.replace(/[.,!?;:]+$/, '');      // "sides." is a key word even with its full stop
    words.push({ word, key: start >= 0 && at >= start && at + bare.length <= end });
  }
  const step = words.length > 1 ? Math.max(40, Math.min(220, (totalMs - 300) / (words.length - 1))) : 0;
  const reduced = prefersReducedMotion() || totalMs <= 0;
  // Each word appears when it is spoken: measured times from the recording (tools/vo_word_times.py),
  // or an even pace when there is no recording for this line.
  const synced = Array.isArray(times) && times.length === words.length;
  const delayOf = (i) => (reduced ? 0 : Math.round(synced ? times[i] / rate : i * step));
  line.innerHTML = words.map(({ word, key }, i) => `<span class="w${key ? ' key' : ''}" style="--wdly:${delayOf(i)}ms">${escapeHtml(word)}</span>`).join(' ');
  if (reduced) line.classList.add('is-instant');
  // Hold the words until the voice is actually heard, then let them run with it.
  if (!reduced && started) {
    line.classList.add('is-waiting');
    started.then(() => line.classList.remove('is-waiting'));
  }
  element.append(screenReaderCopy, line);
  return wait(reduced ? 0 : delayOf(words.length - 1) + 460);
}

/** Narrows `box` to the widest line its words wrapped to (CSS alone cannot shrink a wrapped box). */
function hugWords(box, textEl) {
  const words = [...textEl.querySelectorAll('.reveal-line .w')];
  if (!words.length) return;
  const lines = new Map();
  for (const word of words) {
    const top = word.offsetTop;
    const line = lines.get(top) ?? { left: Infinity, right: -Infinity };
    line.left = Math.min(line.left, word.offsetLeft);
    line.right = Math.max(line.right, word.offsetLeft + word.offsetWidth);
    lines.set(top, line);
  }
  const widest = Math.max(...[...lines.values()].map((line) => line.right - line.left));
  const css = getComputedStyle(box);
  const padding = parseFloat(css.paddingLeft) + parseFloat(css.paddingRight);
  box.style.width = `${Math.ceil(widest + padding + 2)}px`;
}

/** The task card (PDF wording) and the builder's speech bubble. Nothing else is written on screen. */
export function createFeedbackController({ hudEl, overlaysEl, voice, builder }) {
  const instructionEl = document.getElementById('instruction');
  let bubbleEl = null;

  function speakAndType(element, text, { speaker, focus = null }) {
    const spoken = voice.say(text, { speaker });
    const typingMs = spoken.spoke ? Math.max(300, (spoken.seconds - 0.35) * 1000) : Math.min(2600, text.length * READING_MS_PER_CHARACTER);
    revealWords(element, text, typingMs, focus, { times: spoken.clipId ? VO_WORD_TIMES[spoken.clipId] : null, rate: spoken.rate ?? 1, started: spoken.started });
    return spoken.finished;
  }

  // The task plate's words (the plate itself is styled in components.css).
  instructionEl.innerHTML = '<p class="instruction__text"></p>';
  const signText = instructionEl.querySelector('.instruction__text');

  return {
    /** Shows the task line; the narrator reads it and the words appear at the voice's pace. */
    async setInstruction(text, { swap = false, complete = false, focus = null } = {}) {
      const wasHidden = instructionEl.hidden;
      instructionEl.hidden = false;
      instructionEl.classList.toggle('is-complete', complete);
      if (swap && !wasHidden) {
        instructionEl.classList.remove('is-swapping');
        void instructionEl.offsetWidth;
        instructionEl.classList.add('is-swapping');
        await wait(prefersReducedMotion() ? 0 : 190);
        const finished = speakAndType(signText, text, { speaker: 'narrator', focus });
        await wait(prefersReducedMotion() ? 0 : 340);
        instructionEl.classList.remove('is-swapping');
        return finished;
      }
      const finished = speakAndType(signText, text, { speaker: 'narrator', focus });
      playClassAnimation(instructionEl, 'is-entering', 720);
      return finished;
    },
    pushInstruction: () => playClassAnimation(instructionEl, 'is-pushed', 600),
    hideInstruction() {
      instructionEl.hidden = true;
      signText.textContent = '';
    },

    /**
     * The builder speaks from the cab: the bubble's tail points at him wherever the camera is,
     * words appear at the voice's pace, and the beaver talks.
     */
    showBubble(text, { anchor } = {}) {
      this.hideBubble({ instant: true });
      bubbleEl = document.createElement('div');
      bubbleEl.className = 'speech-bubble speech-bubble--cab';
      bubbleEl.innerHTML = '<svg class="speech-bubble__shape" aria-hidden="true"><path class="speech-bubble__face"/></svg><p class="speech-bubble__text"></p>';
      overlaysEl.appendChild(bubbleEl);
      const finished = speakAndType(bubbleEl.querySelector('.speech-bubble__text'), text, { speaker: 'builder' });
      // Hug the words: shrink the box to its widest wrapped line, so no empty margin is left at the sides.
      hugWords(bubbleEl, bubbleEl.querySelector('.speech-bubble__text'));
      // The words decide the box; the outline is drawn for it, and the tail's tip is put on the anchor
      // (the operator's mouth, just outside the cab glass), so the bubble sits up and to the right.
      const tip = fitBubble(bubbleEl.querySelector('.speech-bubble__shape'), bubbleEl, { at: 0.12, lean: -1 });
      if (anchor) {
        bubbleEl.style.left = `${Math.round(anchor.x - tip[0])}px`;
        bubbleEl.style.top = `${Math.round(Math.max(24, anchor.y - tip[1]))}px`;
        bubbleEl.style.transformOrigin = `${Math.round(tip[0])}px ${Math.round(tip[1])}px`;
      }
      playClassAnimation(bubbleEl, 'is-entering', 620);
      builder?.talkUntil(finished);
      return { element: bubbleEl, finished };
    },
    async hideBubble({ instant = false } = {}) {
      const bubble = bubbleEl;
      if (!bubble) return;
      bubbleEl = null;
      if (instant || prefersReducedMotion()) {
        bubble.remove();
        return;
      }
      await playClassAnimation(bubble, 'is-leaving', 400);
      bubble.remove();
    },
  };
}
