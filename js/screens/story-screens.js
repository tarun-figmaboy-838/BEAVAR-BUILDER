import { COPY } from '../data/copy.js';
import { createSequenceScope, wait } from '../core/motion.js';
import { createCtaButton } from './screen-helpers.js';

const CAB_ZOOM = 2.2;

/** Zoom into the crane cab, where the beaver operator sits, and return where his bubble should go. */
export async function zoomToCab({ camera, builder, signal, duration = 1300 }) {
  const { x, y } = builder.cabCenter;
  await camera.focus({ x, y, scale: CAB_ZOOM, duration, signal });
  const { left, top, width } = builder.cabWindow;
  const anchor = camera.project(left + width, top);
  return { x: anchor.x + 40, y: Math.max(40, anchor.y - 20) };
}

/** G0.1 Meet the Builder: the crane rolls in, then we meet its operator in the cab. */
export function createMeetBuilderScreen({ els, audio, camera, crane, claw, triangles, feedback, builder, screenManager }) {
  const scope = createSequenceScope();
  let cta = null;
  const copy = COPY.screens.meetBuilder;

  return {
    async enter() {
      camera.reset(0);
      triangles.showIntroPile();
      triangles.enterPlatform();
      builder.show();
      await crane.enterFromOffstage({ signal: scope.signal })
        .then(() => wait(200, scope.signal))
        .then(() => claw.fumble())  // closes a beat too early, notices, readjusts
        .catch(() => {});
      const anchor = await zoomToCab({ camera, builder, signal: scope.signal }).catch(() => null);
      const bubble = feedback.showBubble(copy.line, { anchor });
      await bubble.finished;
      builder.worry();
      cta = createCtaButton({ overlaysEl: els.overlays, audio, label: copy.cta, onPress: () => screenManager.go('help-needed') });
    },
    async exit() {
      cta?.remove();
      cta = null;
    },
  };
}

/** G0.2 Your Help Is Needed: the operator asks, then the camera shows the frames he means. */
export function createHelpNeededScreen({ els, audio, camera, triangles, feedback, builder, screenManager }) {
  const scope = createSequenceScope();
  let cta = null;
  const copy = COPY.screens.helpNeeded;

  return {
    async enter() {
      const anchor = await zoomToCab({ camera, builder, signal: scope.signal, duration: 600 }).catch(() => null);
      const bubble = feedback.showBubble(copy.line, { anchor });
      await bubble.finished;
      builder.point();
      await feedback.hideBubble();
      await camera.focus({ x: 960, y: 880, scale: 1.12, pull: 0.5, duration: 1300, signal: scope.signal }).catch(() => {});
      await triangles.focusPulseSequence(scope.signal).catch(() => {});
      cta = createCtaButton({ overlaysEl: els.overlays, audio, label: copy.cta, onPress: () => screenManager.go('how-to-play') });
    },
    async exit() {
      cta?.remove();
      cta = null;
      await feedback.hideBubble();
    },
  };
}
