import { COPY } from '../data/copy.js';
import { playClassAnimation } from '../core/motion.js';

/** Cartoon letters, each in its own span so they can hop one after another (celebration headline). */
export function cartoonLetters(text, startIndex = 0) {
  return [...text].map((char, offset) => (char === ' '
    ? '<span class="cartoon-letter cartoon-letter--space"> </span>'
    : `<span class="cartoon-letter" style="--i:${startIndex + offset}">${char}</span>`)).join('');
}

/** Game start: the live construction site and one big Start button. */
export function createTitleScreen({ els, audio, voice, camera, builder, screenManager }) {
  let button = null;

  return {
    async enter() {
      camera.reset(0);
      builder.show(); // the operator is already waiting in the cab
      button = document.createElement('button');
      button.type = 'button';
      button.className = 'start-button';
      button.textContent = COPY.title.start;
      let pressed = false;
      button.addEventListener('click', () => {
        if (pressed) return;
        pressed = true;
        audio.unlock();
        audio.play('uiTap');
        voice.unlock();
        voice.prefetch();
        screenManager.go('meet-builder');
      });
      els.overlays.appendChild(button);
      button.focus({ preventScroll: true });
    },
    async exit() {
      if (!button) return;
      await playClassAnimation(button, 'is-leaving', 420);
      button.remove();
      button = null;
    },
  };
}
