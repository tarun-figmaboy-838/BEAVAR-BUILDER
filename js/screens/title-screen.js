import { COPY } from '../data/copy.js';
import { playClassAnimation, createSequenceScope, prefersReducedMotion, wait } from '../core/motion.js';
import { createDroneIntro } from './drone-intro.js';
import { DRONE_INTRO } from '../config.js';

/** Cartoon letters, each in its own span so they can hop one after another (celebration headline). */
export function cartoonLetters(text, startIndex = 0) {
  return [...text].map((char, offset) => (char === ' '
    ? '<span class="cartoon-letter cartoon-letter--space"> </span>'
    : `<span class="cartoon-letter" style="--i:${startIndex + offset}">${char}</span>`)).join('');
}

/** The live site, framed slightly closer, so it is already settling back as the drone shots dissolve. */
const LANDING = { x: 960, y: 560, scale: 1.1 };
const FULL_SITE = { x: 960, y: 540, scale: 1 };
const CAPTION_AT_MS = 2500;     // the deck's subline appears mid-flight
const CAPTION_MS = 2600;

/**
 * Game start: the title over the first drone shot (hovering above the canal) and one Start button.
 * Start sends the drone on its flight over the town (with the deck's subline as a caption); it lands
 * on the live site and the story begins. Any tap or key during the flight skips to the landing.
 */
export function createTitleScreen({ els, audio, voice, camera, builder, screenManager }) {
  let button = null;
  let card = null;
  let caption = null;
  let flight = null;
  const scope = createSequenceScope();

  function buildTitleCard() {
    const element = document.createElement('div');
    element.className = 'title-card';
    element.innerHTML = `<h1 class="title-card__headline" aria-label="${COPY.title.headline}"><img class="title-card__logo" src="assets/images/kit/title-logo.png" alt="" draggable="false"></h1>`;
    return element;
  }

  async function fly() {
    const skip = () => {
      scope.cancel();
      flight.skip();
      caption?.remove();
      camera.reset(380);
    };
    els.stage.addEventListener('pointerdown', skip);
    window.addEventListener('keydown', skip);
    try {
      const landed = flight.play();
      wait(CAPTION_AT_MS, scope.signal).then(() => {
        caption = document.createElement('p');
        caption.className = 'drone-caption';
        caption.textContent = COPY.title.subline;
        caption.style.animationDuration = `${CAPTION_MS}ms`;
        els.overlays.appendChild(caption);
        setTimeout(() => caption?.remove(), CAPTION_MS + 50);
      }).catch(() => {});
      await landed;
      await wait(500, scope.signal).catch(() => {});
    } finally {
      els.stage.removeEventListener('pointerdown', skip);
      window.removeEventListener('keydown', skip);
    }
  }

  return {
    async enter() {
      builder.show(); // the operator is already waiting in the cab
      const withFlight = DRONE_INTRO && !prefersReducedMotion();
      await camera.fly([withFlight ? LANDING : FULL_SITE], { duration: 0 });
      flight = withFlight ? createDroneIntro(els.stage, {
        before: els.hud,
        onReveal: () => {
          camera.fly([LANDING, FULL_SITE], { duration: 1500, signal: scope.signal }).catch(() => {});
          setTimeout(() => builder.cheer(), 500);
        },
      }) : null;
      card = buildTitleCard();
      card.classList.add('is-entering');
      els.overlays.appendChild(card);
      button = document.createElement('button');
      button.type = 'button';
      button.className = 'start-button';
      button.setAttribute('aria-label', COPY.title.start);
      // The play button (painted art, generated for this game): a soft pulse ripples out behind it.
      button.innerHTML = `
        <span class="start-button__glow"></span>
        <img class="start-button__face" src="assets/images/kit/play-button.png" alt="" draggable="false">`;
      let pressed = false;
      button.addEventListener('click', async () => {
        if (pressed) return;
        pressed = true;
        audio.unlock();
        audio.play('uiTap');
        audio.startMusic();
        voice.unlock();
        voice.prefetch();
        await Promise.all([playClassAnimation(button, 'is-leaving', 420), playClassAnimation(card, 'is-leaving', 460)]);
        button?.remove();
        card?.remove();
        button = null;
        card = null;
        if (flight) await fly();
        screenManager.go('meet-builder');
      });
      button.classList.add('is-entering');
      button.addEventListener('animationend', () => button?.classList.remove('is-entering'), { once: true });
      els.overlays.appendChild(button);
      button.focus({ preventScroll: true });
    },
    async exit() {
      scope.cancel();
      flight?.remove();
      caption?.remove();
      card?.remove();
      card = null;
      if (!button) return;
      await playClassAnimation(button, 'is-leaving', 420);
      button.remove();
      button = null;
    },
  };
}
