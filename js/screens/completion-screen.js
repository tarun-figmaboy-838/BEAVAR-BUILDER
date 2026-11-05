import { COPY } from '../data/copy.js';
import { wait, playClassAnimation, createSequenceScope } from '../core/motion.js';
import { createCtaButton } from './screen-helpers.js';
import { zoomToCab } from './story-screens.js';
import { createTownLife, playBridgeShots } from '../gameplay/town-life.js';

/** PDF p18 "Excellent work!" state, then the p19 celebration. */
export function createCompletionScreen({ els, audio, voice, camera, crane, claw, bridge, feedback, fx, input, triangles, builder, levelEngine, screenManager }) {
  const scope = createSequenceScope();
  const copy = COPY.completion;
  let overlay = null;
  const town = createTownLife({ bridgeEl: els.bridge, fx, audio });

  /** BRIDGE BUILT! sign (painted art) hung from the jib on two ropes; the replay button in the centre. */
  function buildOverlay() {
    overlay = document.createElement('section');
    overlay.className = 'completion';
    overlay.setAttribute('aria-label', `${copy.headline} ${copy.subline}`);
    overlay.innerHTML = `
      <div class="completion__sign">
        <span class="completion__rope completion__rope--l"></span>
        <span class="completion__rope completion__rope--r"></span>
        <img class="completion__art" src="assets/images/kit/sign-bridge-built.png" alt="" draggable="false">
      </div>`;
    els.overlays.appendChild(overlay);
  }

  return {
    async enter() {
      input.setEnabled(false);
      bridge.hideSocket();
      els.controls.hidden = true;
      triangles.clearOptions();
      triangles.hidePlatform();          // the yard platform rolls away: the ending is about the bridge
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
      // The opening (PDF p19), at road level: at the entrance the beaver cuts the ribbon and the town drives
      // in; then inside the bridge, and the far end looking back. Meanwhile the side view gets its banners
      // and traffic, so the bridge is open and busy when the camera comes back.
      builder.hide();
      await playBridgeShots(els.overlays, {
        signal: scope.signal,
        audio,
        onLastShot: () => {
          town.startTraffic();
          builder.show();
        },
      });
      builder.show();
      builder.cheer();
      buildOverlay();
      const bannerEl = overlay.querySelector('.completion__sign');
      playClassAnimation(bannerEl, 'is-entering', 800);
      fx.confetti();
      audio.play('celebration');
      const headline = voice.say(`${copy.headline} ${copy.subline}`, { speaker: 'narrator' });
      await headline.finished;

      createCtaButton({
        overlaysEl: overlay,
        audio,
        icon: 'replay-art',
        label: copy.replay,
        onPress: async () => {
          await levelEngine.resetAll();
          screenManager.go('gameplay');
        },
      }).classList.add('completion__replay');
    },
    async exit() {
      scope.cancel();
      town.stop();
      builder.show();
      await feedback.hideBubble();
      fx.clear();
      feedback.hideInstruction();
      overlay?.remove();
      overlay = null;
    },
  };
}
