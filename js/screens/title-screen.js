import { COPY } from '../data/copy.js';
import { playClassAnimation, createSequenceScope, prefersReducedMotion, wait } from '../core/motion.js';
import { playDroneIntro } from './drone-intro.js';

/** Cartoon letters, each in its own span so they can hop one after another (celebration headline). */
export function cartoonLetters(text, startIndex = 0) {
  return [...text].map((char, offset) => (char === ' '
    ? '<span class="cartoon-letter cartoon-letter--space"> </span>'
    : `<span class="cartoon-letter" style="--i:${startIndex + offset}">${char}</span>`)).join('');
}

/** The live site, framed slightly closer, so it is already settling back as the drone shots dissolve. */
const LANDING = { x: 960, y: 560, scale: 1.1 };
const FULL_SITE = { x: 960, y: 540, scale: 1 };

/** Game start: a drone flight over the canal town lands on the live site, then one big Start button. */
export function createTitleScreen({ els, audio, voice, camera, builder, screenManager }) {
  let button = null;
  const scope = createSequenceScope();

  /** Skippable: any tap, click or key during the flight jumps straight to the Start button. */
  async function droneIntro() {
    if (prefersReducedMotion()) {
      camera.reset(0);
      return;
    }
    await camera.fly([LANDING], { duration: 0 });
    const flight = playDroneIntro(els.overlays, {
      onReveal: () => {
        camera.fly([LANDING, FULL_SITE], { duration: 1500, signal: scope.signal }).catch(() => {});
        setTimeout(() => builder.cheer(), 500);
      },
    });
    const skip = () => {
      scope.cancel();
      flight.skip();
      camera.reset(380);
    };
    els.stage.addEventListener('pointerdown', skip);
    window.addEventListener('keydown', skip);
    try {
      await flight.done;
      await wait(600, scope.signal).catch(() => {});
    } finally {
      els.stage.removeEventListener('pointerdown', skip);
      window.removeEventListener('keydown', skip);
    }
  }

  return {
    async enter() {
      builder.show(); // the operator is already waiting in the cab
      await droneIntro();
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
      button.classList.add('is-entering');
      button.addEventListener('animationend', () => button?.classList.remove('is-entering'), { once: true });
      els.overlays.appendChild(button);
      button.focus({ preventScroll: true });
    },
    async exit() {
      scope.cancel();
      if (!button) return;
      await playClassAnimation(button, 'is-leaving', 420);
      button.remove();
      button = null;
    },
  };
}
