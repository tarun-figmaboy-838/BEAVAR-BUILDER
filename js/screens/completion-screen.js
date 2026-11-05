import { COPY } from '../data/copy.js';
import { wait, playClassAnimation, createSequenceScope } from '../core/motion.js';
import { createCtaButton } from './screen-helpers.js';
import { cartoonLetters } from './title-screen.js';
import { zoomToCab } from './story-screens.js';

const PENNANT_COLORS = ['#e53935', '#fb8c00', '#fdd835', '#43a047', '#1e88e5', '#8e24aa', '#e53935', '#fb8c00', '#fdd835', '#43a047', '#1e88e5', '#8e24aa'];

/** PDF p18 "Excellent work!" state, then the p19 celebration. */
export function createCompletionScreen({ els, audio, voice, camera, crane, claw, bridge, feedback, fx, input, triangles, builder, levelEngine, screenManager }) {
  const scope = createSequenceScope();
  const copy = COPY.completion;
  let overlay = null;

  function buildOverlay() {
    overlay = document.createElement('section');
    overlay.className = 'completion';
    overlay.setAttribute('aria-label', copy.headline);
    const bolt = (corner) => `<img class="completion__bolt completion__bolt--${corner}" src="assets/images/crane/bolt.png" alt="" draggable="false">`;
    overlay.innerHTML = `
      <div class="completion__sign">
        <span class="completion__rope completion__rope--l"></span>
        <span class="completion__rope completion__rope--r"></span>
        <div class="completion__banner">
          <svg class="completion__string" viewBox="0 0 860 40" preserveAspectRatio="none" aria-hidden="true"><path d="M 0 4 Q 430 40 860 4" /></svg>
          <div class="completion__bunting">${PENNANT_COLORS.map((color, i) => `<span class="completion__pennant" style="--pennant:${color};--i:${i}"></span>`).join('')}</div>
          <span class="completion__planks"></span>
          ${['tl', 'tr', 'bl', 'br'].map(bolt).join('')}
          <h1 class="completion__headline" aria-label="${copy.headline}">${cartoonLetters(copy.headline)}</h1>
          <p class="completion__subline">${copy.subline}</p>
        </div>
      </div>
      <div class="completion__badge" hidden>
        <div>${copy.badge}</div>
        <div class="completion__stars">
          ${[0, 1, 2].map(() => '<img class="completion__star" src="assets/images/fx/sparkle-big.png" alt="" draggable="false">').join('')}
        </div>
      </div>`;
    els.overlays.appendChild(overlay);
  }

  return {
    async enter() {
      input.setEnabled(false);
      bridge.hideSocket();
      els.controls.hidden = true;
      triangles.clearOptions();
      const banner = feedback.setInstruction(copy.banner, { swap: true, complete: true });
      claw.relief();
      crane.parkAway({ signal: scope.signal }).catch(() => {});
      await camera.focus({ x: 960, y: 520, scale: 1.12, pull: 0.6, duration: 1200, signal: scope.signal });
      await bridge.completeSettle();
      audio.play('ding');
      await banner;
      await wait(400, scope.signal);
      await camera.focus({ x: 960, y: 540, scale: 1, duration: 1600, signal: scope.signal });

      feedback.hideInstruction();
      // The operator cheers in his cab, says the PDF line, then we pull back to the finished bridge.
      builder.cheer();
      const anchor = await zoomToCab({ camera, builder, signal: scope.signal }).catch(() => null);
      const builderLine = feedback.showBubble(copy.builderLine, { anchor });
      await builderLine.finished;
      await feedback.hideBubble();
      builder.cheer();
      await camera.reset(1600, scope.signal).catch(() => {});
      buildOverlay();
      const bannerEl = overlay.querySelector('.completion__sign');
      playClassAnimation(bannerEl, 'is-entering', 800);
      fx.confetti();
      audio.play('celebration');
      const headline = voice.say(`${copy.headline} ${copy.subline}`, { speaker: 'narrator' });
      await headline.finished;

      const badge = overlay.querySelector('.completion__badge');
      badge.hidden = false;
      playClassAnimation(badge, 'is-entering', 600);
      const stars = overlay.querySelectorAll('.completion__star');
      for (const star of stars) {
        await wait(260, scope.signal);
        star.classList.add('is-lit');
        audio.play('ding');
      }
      createCtaButton({
        overlaysEl: overlay,
        audio,
        label: copy.replay,
        onPress: async () => {
          await levelEngine.resetAll();
          screenManager.go('gameplay');
        },
      }).classList.add('completion__replay');
    },
    async exit() {
      await feedback.hideBubble();
      fx.clear();
      feedback.hideInstruction();
      overlay?.remove();
      overlay = null;
    },
  };
}
