import { LEVELS, LEVEL_COUNT, OPTION_GROUPS } from '../data/levels.js';
import { COPY } from '../data/copy.js';
import { CRANE_LAYOUT } from '../data/layout.js';
import { CRANE_STATES } from './crane-controller.js';
import { createSequenceScope, wait, isAbortError } from '../core/motion.js';
import { debugLog } from '../core/debug-overlay.js';

const INVITE_AFTER_MS = 3500;

/**
 * One engine runs all six levels from data:
 *   question → position the hook over a frame (LEFT / RIGHT, UP / DOWN in depth) → PICK (grab, lift)
 *   → DROP (lift, travel into depth to the bridge, align, lower, place, release) → consequence.
 * The action button reads PICK (live only with the hook at the front over a frame, hook empty) and flips to
 * DROP once a frame is on the hook (live only then).
 */
export function createLevelEngine({ gameState, crane, claw, triangles, bridge, placement, feedback, camera, input, audio, voice, builder, onComplete }) {
  const scope = createSequenceScope();
  let currentLevelIndex = 0;
  let currentGroup = null;
  let busy = false;
  let active = false;
  let inviteTimer = 0;
  let homeTrip = Promise.resolve();       // the empty hook's flight back to the yard after a placement
  let overSpot = false;                   // the carried frame is right over the target spot

  const currentLevel = () => LEVELS[currentLevelIndex];
  const inputLocked = () => gameState.get().isInputLocked;

  /* ---- Camera shots (the world layer moves; the page never scrolls) ---- */
  const cameraShots = {
    /** PICK: a very small lean toward the frame being grabbed. */
    focusTrianglePlatform(grab) {
      return camera.focus({ x: grab.x, y: grab.y + 120, scale: 1.1, pull: 0.3, duration: 620, signal: scope.signal });
    },
    /** DROP, lift: frame the load leaving the yard. */
    focusCarryingTriangle() {
      return camera.focus({ x: crane.position.x, y: 560, scale: 1.04, pull: 0.25, duration: 560, signal: scope.signal });
    },
    /** DROP, into depth: follow the load toward the spot on the bridge. */
    focusBridgeTarget(socket, { closer = false, duration = 1500 } = {}) {
      return camera.focus({ x: socket.x, y: closer ? 600 : 570, scale: closer ? 1.16 : 1.1, pull: closer ? 0.4 : 0.32, duration, signal: scope.signal });
    },
    resetCamera(duration = 700) {
      return camera.reset(duration, scope.signal);
    },
  };
  const fireAndForget = (promise) => promise.catch(() => {});

  function lockInput() {
    gameState.update({ isInputLocked: true });
    input.setEnabled(false);
    input.setActionState({ mode: crane.carried ? 'drop' : 'pick', enabled: false });
    input.invite(false);
    clearTimeout(inviteTimer);
    crane.lock();
  }

  function unlockInput() {
    crane.unlock();
    input.setEnabled(true);
    gameState.update({ isInputLocked: false });
    syncUi();
  }

  /** If the learner has not touched the crane a few seconds into a task, the side keys invite them. */
  function scheduleInvite() {
    clearTimeout(inviteTimer);
    inviteTimer = setTimeout(() => {
      const state = gameState.get();
      if (active && !state.isInputLocked && !crane.carried && !state.hoveredOptionId) input.invite(true);
    }, INVITE_AFTER_MS);
  }

  /** The action button follows the crane: PICK (hook empty, at the front, over a frame), DROP (frame on the hook). */
  function syncUi() {
    const state = gameState.get();
    const carried = crane.carried;
    const canAct = active && !busy && !state.isInputLocked && !crane.isBusy;
    const pickReady = canAct && !carried && state.craneState === CRANE_STATES.ALIGNED_WITH_TRIANGLE;
    const dropReady = canAct && Boolean(carried) && state.craneState === CRANE_STATES.CARRYING;
    input.setActionState({ mode: carried ? 'drop' : 'pick', enabled: pickReady || dropReady });
    if (triangles.setHovered(carried ? null : state.hoveredOptionId)) audio.play('bloop');
    bridge.setSocketArmed(Boolean(carried));
    // Like a real target: the spot turns green (with a chime) the moment the carried frame is right over it.
    if (!busy && !state.isInputLocked) {
      const over = placement.isOverSpot(carried, crane.position.x, crane.position.depth);
      if (over !== overSpot) {
        overSpot = over;
        bridge.setSocketAligned(over);
        if (over) audio.play('ding');
      }
    }
  }

  gameState.subscribe((state, patch) => {
    if ('craneState' in patch || 'hoveredOptionId' in patch || 'craneX' in patch || 'craneDepth' in patch || 'craneBusy' in patch) syncUi();
  });
  crane.setHoverResolver((x, carried, depth) => placement.resolveHover(x, carried, depth));
  input.on('axis', (axis) => {
    if (inputLocked()) return;
    crane.setAxis(axis);
    if (axis.x || axis.y) {
      input.invite(false);
      clearTimeout(inviteTimer);
    }
  });
  input.on('pick', () => beginPickupSequence());
  input.on('drop', () => transportTriangleToBridge());

  async function startLevel(index, { firstEntry = false } = {}) {
    const level = LEVELS[index];
    currentLevelIndex = index;
    gameState.update({ currentLevelIndex: index, activeSocketId: level.bridgeStage, transition: 'level:start' });
    placement.setActiveStage(level.bridgeStage);
    if (!placement.activeStage) console.error(`[level] task ${level.id}: unknown bridge stage "${level.bridgeStage}"`);
    const groupChanged = currentGroup !== level.optionGroup;
    currentGroup = level.optionGroup;
    fireAndForget(cameraShots.resetCamera(900));
    await triangles.showPlatform();
    feedback.setInstruction(level.instruction, { swap: !firstEntry, focus: level.focus });
    feedback.pushInstruction();
    await triangles.showOptions(OPTION_GROUPS[level.optionGroup], { refreshAll: groupChanged });
    bridge.showSocket(level.bridgeStage);
    await homeTrip;                                       // the hook is back over the yard before play resumes
    gameState.update({ transition: null });
    unlockInput();
    scheduleInvite();
    debugLog('level', `task ${level.id} started; correct = ${level.correctTriangleId}`);
  }

  /** PICK: lock the controls, lower, grab, lift the frame clear of the yard; DROP becomes live. */
  async function beginPickupSequence() {
    if (!active || busy || inputLocked() || crane.isBusy || crane.carried || crane.state !== CRANE_STATES.ALIGNED_WITH_TRIANGLE) return;
    const { option } = placement.resolveHover(crane.position.x, null);
    if (!option) return;
    busy = true;
    input.setEnabled(false);                              // arrows rest while the claw works
    input.setActionState({ mode: 'pick', enabled: false });
    input.invite(false);
    clearTimeout(inviteTimer);
    try {
      const grab = triangles.grabPointOf(option);
      triangles.lift(option);
      triangles.nudgePlatform();
      triangles.focusOn(option);
      fireAndForget(cameraShots.focusTrianglePlatform(grab));
      try {
        await crane.pickUp({ ...option, grabStageX: grab.x, grabStageY: grab.y }, { signal: scope.signal });
      } finally {
        triangles.clearFocus();
      }
      builder.nod();
      fireAndForget(cameraShots.resetCamera(800));
    } catch (error) {
      if (!isAbortError(error)) await recover(error);
    } finally {
      busy = false;
      if (active && !inputLocked()) input.setEnabled(true);
    }
    syncUi();
  }

  /** DROP: the crane carries the frame into the scene and sets it on the bridge, then the result plays. */
  async function transportTriangleToBridge() {
    const carried = crane.carried;
    if (!active || busy || inputLocked() || crane.isBusy || !carried || crane.state !== CRANE_STATES.CARRYING) return;
    busy = true;
    lockInput();
    try {
      await placeOnBridge(carried);
    } catch (error) {
      if (!isAbortError(error)) await recover(error);
    } finally {
      busy = false;
    }
    syncUi();
  }

  async function placeOnBridge(option) {
    const level = currentLevel();
    const socket = placement.activeStage.socket;
    const released = await crane.transportToBridge((scale) => placement.bridgeTarget(option, scale), {
      signal: scope.signal,
      onPhase(phase) {
        if (phase === 'lift') fireAndForget(cameraShots.focusCarryingTriangle());
        if (phase === 'depth') {
          triangles.recedePlatform();
          fireAndForget(cameraShots.focusBridgeTarget(socket));
        }
        if (phase === 'align') bridge.setSocketAligned(true);
        if (phase === 'lower') {
          bridge.setSocketLanding(true);
          fireAndForget(cameraShots.focusBridgeTarget(socket, { closer: true, duration: 900 }));
        }
        if (phase === 'place') {
          bridge.lockSocket();                                // green lock-in burst under the frame
          audio.play('bolt');
        }
      },
    });
    if (!released) throw new Error('the crane could not carry the frame to the bridge');
    triangles.placeInWorld(option, released.left, released.top, released.scale);
    await triangles.seat(option);
    bridge.hideSocket();
    overSpot = false;
    if (placement.isCorrect(option.id, level)) await handleCorrect(option, level);
    else await handleIncorrect(option);
  }

  /** Correct: relief → the hook flies home → the crew builds → settle → next task. */
  async function handleCorrect(option, level) {
    gameState.update({ transition: 'level:construct' });
    audio.play('correct');
    builder.cheer();
    voice.say(COPY.feedback.correct, { speaker: 'narrator' });
    claw.relief();
    await crane.liftAway({ signal: scope.signal });
    homeTrip = crane.returnHome({ signal: scope.signal }).catch(() => {});
    await camera.focus({ x: 960, y: 540, scale: 1.1, pull: 0.55, duration: 800, signal: scope.signal });
    triangles.release(option);
    await bridge.absorbFrame(option, level.bridgeStage, scope.signal);
    await bridge.constructStage(level.bridgeStage, { signal: scope.signal });
    audio.play('tada');
    gameState.update({ bridgeProgress: currentLevelIndex + 1 });
    await wait(380, scope.signal);
    if (currentLevelIndex === LEVEL_COUNT - 1) {
      active = false;
      await homeTrip;
      gameState.update({ transition: null, completed: true });
      await onComplete();
      return;
    }
    await cameraShots.resetCamera(600);
    await startLevel(currentLevelIndex + 1);
  }

  /** PDF rule: a wrong frame makes the whole bridge sway, collapse, and construction restarts. */
  async function handleIncorrect(option) {
    gameState.update({ transition: 'level:collapse' });
    audio.play('incorrect');
    setTimeout(() => audio.play('wahwah'), 350);
    builder.worry();
    crane.alarm(true);
    voice.say(COPY.feedback.incorrect, { speaker: 'narrator' });
    await triangles.rejectShake(option);
    camera.shake(7, 340);
    await claw.react();
    await crane.liftAway({ signal: scope.signal });
    homeTrip = crane.returnHome({ signal: scope.signal }).catch(() => {});
    await camera.focus({ x: 960, y: 540, scale: 1, duration: 520, signal: scope.signal });
    const falling = wait(bridge.builtCount ? 1900 : 300, scope.signal).then(() => triangles.dropIntoWater(option));
    await bridge.collapse({ signal: scope.signal });
    await falling;
    crane.alarm(false);
    gameState.update({ bridgeProgress: 0 });
    await cameraShots.resetCamera(500);
    await startLevel(0);
  }

  /** An unexpected failure must never leave the learner stuck: clear the hook and restart this task. */
  async function recover(error) {
    console.error('[level] recovering from an unexpected error:', error);
    try {
      lockInput();
      crane.discardCargo();
      crane.teleport(CRANE_LAYOUT.homeX);
      triangles.clearFocus();
      bridge.setSocketAligned(false);
      currentGroup = null;                                 // rebuild the yard's frames
      homeTrip = Promise.resolve();
      busy = false;
      await startLevel(currentLevelIndex);
    } catch (again) {
      console.error('[level] recovery failed:', again);
    }
  }

  return {
    get currentLevel() {
      return currentLevel();
    },
    get isBusy() {
      return busy;
    },
    async begin() {
      active = true;
      busy = false;
      await startLevel(0, { firstEntry: true });
    },
    /** Full reset for "Build it again": cancels sequences, clears the yard and the bridge. */
    async resetAll() {
      scope.cancel();
      active = false;
      busy = false;
      voice.stop();
      audio.stopAllLoops();
      crane.alarm(false);
      lockInput();
      crane.discardCargo();
      crane.teleport(CRANE_LAYOUT.homeX);
      homeTrip = Promise.resolve();
      triangles.clearFocus();
      await triangles.clearOptions();
      await triangles.showPlatform();      // back for the next build (the ending rolls it away)
      bridge.reset();
      currentGroup = null;
      currentLevelIndex = 0;
      gameState.update({ bridgeProgress: 0, currentLevelIndex: 0, carriedTriangleId: null, hoveredOptionId: null, completed: false, transition: null });
    },
  };
}

