import { COPY } from '../data/copy.js';
import { createSequenceScope, wait } from '../core/motion.js';

const CAB_ZOOM = 2.1;

/** Zoom into the crane cab, where the beaver operator sits, and return where his bubble should go. */
export async function zoomToCab({ camera, builder, signal, duration = 1300 }) {
  const { x, y } = builder.cabCenter;
  await camera.focus({ x, y, scale: CAB_ZOOM, duration, signal });
  const anchor = camera.project(builder.bubbleAnchor.x, builder.bubbleAnchor.y);
  return { x: anchor.x + 40, y: Math.max(40, anchor.y - 20) };
}

/** G0.1 Meet the Builder: the crane rolls in, then we meet its operator in the cab. */
export function createMeetBuilderScreen({ camera, crane, claw, triangles, feedback, builder, screenManager }) {
  const scope = createSequenceScope();
  const copy = COPY.screens.meetBuilder;

  /** Runs after the screen has entered, so it can move the story on by itself (no button). */
  async function run() {
    try {
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
      // No button: once the line has been read, the story moves on by itself.
      await wait(1300, scope.signal);
      screenManager.go('help-needed');
    } catch {
      /* the screen was left early */
    }
  }

  return {
    async enter() {
      run();
    },
    async exit() {
      scope.cancel();
    },
  };
}

/** G0.2 Your Help Is Needed: the operator asks, then the camera shows the frames he means. */
export function createHelpNeededScreen({ camera, triangles, feedback, builder, screenManager }) {
  const scope = createSequenceScope();
  const copy = COPY.screens.helpNeeded;

  async function run() {
    try {
      const anchor = await zoomToCab({ camera, builder, signal: scope.signal, duration: 600 }).catch(() => null);
      const bubble = feedback.showBubble(copy.line, { anchor });
      await bubble.finished;
      builder.point();
      await feedback.hideBubble();
      await camera.focus({ x: 960, y: 880, scale: 1.12, pull: 0.5, duration: 1300, signal: scope.signal }).catch(() => {});
      await triangles.focusPulseSequence(scope.signal).catch(() => {});
      await wait(500, scope.signal);
      screenManager.go('how-to-play');
    } catch {
      /* the screen was left early */
    }
  }

  return {
    async enter() {
      run();
    },
    async exit() {
      scope.cancel();
      await feedback.hideBubble();
    },
  };
}
