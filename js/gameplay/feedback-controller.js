import { wait, playClassAnimation, prefersReducedMotion } from '../core/motion.js';

const READING_MS_PER_CHARACTER = 42;

/**
 * Types `text` into `element` over `totalMs`. A hidden full-length copy reserves the final size so the
 * card never grows while typing, and screen readers get the whole line at once.
 */
function typeText(element, text, totalMs, signal) {
  element.textContent = '';
  const screenReaderCopy = document.createElement('span');
  screenReaderCopy.className = 'visually-hidden';
  screenReaderCopy.textContent = text;
  const line = document.createElement('span');
  line.className = 'typed-line';
  line.setAttribute('aria-hidden', 'true');
  const ghost = document.createElement('span');
  ghost.className = 'typed-line__ghost';
  ghost.textContent = text;
  const visible = document.createElement('span');
  visible.className = 'typed-line__text';
  line.append(ghost, visible);
  element.append(screenReaderCopy, line);
  if (prefersReducedMotion() || totalMs <= 0) {
    visible.textContent = text;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const start = performance.now();
    let frame = 0;
    const finish = () => {
      cancelAnimationFrame(frame);
      visible.textContent = text;
      resolve();
    };
    signal?.addEventListener('abort', finish, { once: true });
    const step = (now) => {
      const progress = Math.min(1, (now - start) / totalMs);
      visible.textContent = text.slice(0, Math.ceil(text.length * progress));
      if (progress < 1) frame = requestAnimationFrame(step);
      else finish();
    };
    frame = requestAnimationFrame(step);
  });
}

/** The task card (PDF wording) and the builder's speech bubble. Nothing else is written on screen. */
export function createFeedbackController({ hudEl, overlaysEl, voice, builder }) {
  const instructionEl = document.getElementById('instruction');
  let bubbleEl = null;

  function speakAndType(element, text, { speaker }) {
    const spoken = voice.say(text, { speaker });
    const typingMs = spoken.spoke ? Math.max(300, (spoken.seconds - 0.35) * 1000) : Math.min(2600, text.length * READING_MS_PER_CHARACTER);
    typeText(element, text, typingMs);
    return spoken.finished;
  }

  return {
    /** Shows the task line; the narrator reads it and the words appear at the voice's pace. */
    async setInstruction(text, { swap = false, complete = false } = {}) {
      const wasHidden = instructionEl.hidden;
      instructionEl.hidden = false;
      instructionEl.classList.toggle('is-complete', complete);
      if (swap && !wasHidden) {
        instructionEl.classList.remove('is-swapping');
        void instructionEl.offsetWidth;
        instructionEl.classList.add('is-swapping');
        await wait(prefersReducedMotion() ? 0 : 190);
        const finished = speakAndType(instructionEl, text, { speaker: 'narrator' });
        await wait(prefersReducedMotion() ? 0 : 340);
        instructionEl.classList.remove('is-swapping');
        return finished;
      }
      const finished = speakAndType(instructionEl, text, { speaker: 'narrator' });
      playClassAnimation(instructionEl, 'is-entering', 720);
      return finished;
    },
    pushInstruction: () => playClassAnimation(instructionEl, 'is-pushed', 600),
    hideInstruction() {
      instructionEl.hidden = true;
      instructionEl.textContent = '';
    },

    /**
     * The builder speaks from the cab: the bubble is anchored beside the cab window wherever the camera is,
     * words type at the voice's pace, and the beaver talks.
     */
    showBubble(text, { anchor } = {}) {
      this.hideBubble({ instant: true });
      bubbleEl = document.createElement('div');
      bubbleEl.className = 'speech-bubble speech-bubble--cab';
      if (anchor) {
        bubbleEl.style.left = `${Math.round(anchor.x)}px`;
        bubbleEl.style.top = `${Math.round(anchor.y)}px`;
      }
      bubbleEl.innerHTML = '<p class="speech-bubble__text"></p>';
      overlaysEl.appendChild(bubbleEl);
      playClassAnimation(bubbleEl, 'is-entering', 620);
      const finished = speakAndType(bubbleEl.querySelector('.speech-bubble__text'), text, { speaker: 'builder' });
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
