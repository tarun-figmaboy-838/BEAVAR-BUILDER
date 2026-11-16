import { createSequenceScope, wait, isAbortError } from '../core/motion.js';
import { bridgeSeatTarget } from '../gameplay/placement-controller.js';
import { zoomToCab } from './story-screens.js';
import { LEARNING_COPY } from '../learning/learning-content.js';

const HOOK_COPY = Object.freeze({
  /** Why he is stuck (the standalone build says it here; the game says it on its own story screen). */
  framesLine: "I have all these triangular frames, but I can't remember which ones go where!",
  /** The deck's own line ("Triangles.pdf" H8), without its space framing. */
  learnFirst: 'We must identify them! But to do that we need to learn about triangles first.',
});
const TRY_PILE_INDEX = 1;          // the acute frame in the yard: the operator's hopeful first pick
const TRY_TARGET_X = 960;          // the middle spot on the deck

/**
 * The hook before the workshop: the operator gets on with the bridge, lifts a frame from the yard and
 * sets it on the glowing spot, and it does not fit: it shakes loose and drops into the canal. He looks
 * at the frames left in the yard (all triangles, all different) and sees what he needs first: to learn
 * about triangles. In the standalone build he also says why he is stuck (the game said it already).
 */
export function createHookScreen({ audio, camera, crane, claw, triangles, bridge, feedback, builder, fx, screenManager, nextScreen = 'learning', sayFramesLine = false }) {
  const scope = createSequenceScope();

  async function say(text) {
    const anchor = await zoomToCab({ camera, builder, signal: scope.signal, duration: 1000 }).catch(() => null);
    const line = feedback.showBubble(text, { anchor });
    await line.finished;
    await feedback.hideBubble();
  }

  async function tryAFrame() {
    const item = triangles.pileItems()[TRY_PILE_INDEX];
    if (!item) return;
    const grab = { x: item.homeCenterX - item.width / 2 + item.grabX * item.width, y: item.baseY - item.baseOffset + item.grabY };
    bridge.showDemoSpots?.();
    await crane.glideTo(grab.x, { signal: scope.signal });
    await crane.pickUp({ ...item, id: 'hook', grabStageX: grab.x, grabStageY: grab.y }, { signal: scope.signal });
    builder.nod();
    await wait(300, scope.signal);
    const released = await crane.transportToBridge((scale) => bridgeSeatTarget(item, TRY_TARGET_X, scale), { signal: scope.signal });
    if (!released) return;
    triangles.placeInWorld(item, released.left, released.top, released.scale);
    await triangles.seat(item);
    bridge.hideDemoSpots?.();
    // It does not fit: a wobble, the alarm, and it drops into the canal.
    audio.play('incorrect');
    setTimeout(() => audio.play('wahwah'), 350);
    builder.worry();
    crane.alarm(true);
    await triangles.rejectShake(item);
    camera.shake(7, 340);
    await claw.react();
    await crane.liftAway({ signal: scope.signal });
    const homeTrip = crane.returnHome({ signal: scope.signal }).catch(() => {});
    await wait(300, scope.signal);
    const falling = triangles.dropIntoWater(item);
    setTimeout(() => fx.splash(TRY_TARGET_X, 760), 760);
    await falling;
    crane.alarm(false);
    await homeTrip;
  }

  async function run() {
    try {
      camera.reset(600).catch(() => {});
      builder.show();
      triangles.showIntroPile();
      triangles.enterPlatform?.();
      await wait(700, scope.signal);
      await tryAFrame();
      if (sayFramesLine) await say(HOOK_COPY.framesLine);
      // He looks at the frames left in the yard: all triangles, all different.
      await camera.focus({ x: 960, y: 880, scale: 1.12, pull: 0.5, duration: 1100, signal: scope.signal }).catch(() => {});
      builder.point();
      await triangles.focusPulseSequence(scope.signal).catch(() => {});
      await wait(300, scope.signal);
      await say(HOOK_COPY.learnFirst);
      await wait(250, scope.signal);
      await say(LEARNING_COPY.beaver.enter);
      await camera.reset(800, scope.signal).catch(() => {});
      if (screenManager.currentName === 'hook') screenManager.go(nextScreen);
    } catch (error) {
      if (!isAbortError(error)) console.error('[hook]', error);
    }
  }

  return {
    async enter() { run(); },
    async exit() {
      scope.cancel();
      bridge.hideDemoSpots?.();
      crane.alarm(false);
      crane.discardCargo();
      await feedback.hideBubble();
    },
  };
}
