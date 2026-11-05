import { LEVELS, LEVEL_COUNT, OPTION_GROUPS } from '../data/levels.js';
import { COPY } from '../data/copy.js';
import { CRANE_LAYOUT } from '../data/layout.js';
import { BRIDGE_GEOMETRY } from '../data/bridge-geometry.js';
import { CRANE_STATES } from './crane-controller.js';
import { createSequenceScope, wait, isAbortError } from '../core/motion.js';
import { debugLog } from '../core/debug-overlay.js';

const NUDGE_AFTER_MS = 3500;

/** One engine runs all six levels from data: question → pick → carry → drop → consequence. */
export function createLevelEngine({ gameState, crane, claw, triangles, bridge, placement, feedback, camera, input, audio, voice, builder, onComplete }) {
  const scope = createSequenceScope();
  let currentLevelIndex = 0;
  let currentGroup = null;
  let busy = false;
  let active = false;
  let nudgeTimer = 0;

  const currentLevel = () => LEVELS[currentLevelIndex];
  const inputLocked = () => gameState.get().isInputLocked;

  function lockInput() {
    gameState.update({ isInputLocked: true });
    input.setEnabled(false);
    input.setActionState({ mode: crane.carried ? 'drop' : 'pick', enabled: false });
    input.nudgeJoystick(false);
    clearTimeout(nudgeTimer);
    crane.lock();
  }

  /** If the learner has not touched the crane a few seconds into a task, the joystick invites them. */
  function scheduleNudge() {
    clearTimeout(nudgeTimer);
    nudgeTimer = setTimeout(() => {
      const state = gameState.get();
      if (active && !state.isInputLocked && !crane.carried && !state.hoveredOptionId) input.nudgeJoystick(true);
    }, NUDGE_AFTER_MS);
  }

  function unlockInput() {
    crane.unlock();
    input.setEnabled(true);
    gameState.update({ isInputLocked: false });
    syncUi();
  }

  function syncUi() {
    const state = gameState.get();
    const carried = crane.carried;
    const hover = active ? placement.resolveHover(state.craneX, carried) : {};
    const canAct = active && !busy && !state.isInputLocked && !crane.isBusy;
    const pickReady = canAct && !carried && state.craneState === CRANE_STATES.HOVERING_OPTION;
    const dropReady = canAct && Boolean(carried) && state.craneState === CRANE_STATES.HOVERING_TARGET;
    input.setActionState({ mode: carried ? 'drop' : 'pick', enabled: pickReady || dropReady });
    triangles.setHovered(carried ? null : state.hoveredOptionId);
    bridge.setSocketAligned(Boolean(carried) && Boolean(hover.overSocket));
    bridge.setSocketArmed(Boolean(carried));
  }

  gameState.subscribe((state, patch) => {
    if ('craneState' in patch || 'hoveredOptionId' in patch || 'craneX' in patch || 'craneBusy' in patch) syncUi();
  });
  crane.setHoverResolver((x, carried) => placement.resolveHover(x, carried));
  input.on('axis', (axis) => {
    if (inputLocked()) return;
    crane.setAxis(axis);
    if (axis.x || axis.y) {
      input.nudgeJoystick(false);
      clearTimeout(nudgeTimer);
    }
  });
  input.on('pick', () => handlePick());
  input.on('drop', () => handleDrop());
  input.on('primary', () => {
    if (input.isActionAvailable('pick')) handlePick();
    else if (input.isActionAvailable('drop')) handleDrop();
  });

  async function startLevel(index, { firstEntry = false } = {}) {
    const level = LEVELS[index];
    currentLevelIndex = index;
    gameState.update({ currentLevelIndex: index, activeSocketId: level.bridgeStage, transition: 'level:start' });
    placement.setActiveStage(level.bridgeStage);
    if (!placement.activeStage) console.error(`[level] task ${level.id}: unknown bridge stage "${level.bridgeStage}"`);
    const groupChanged = currentGroup !== level.optionGroup;
    currentGroup = level.optionGroup;
    camera.reset(900, scope.signal).catch(() => {});
    await triangles.showPlatform();
    feedback.setInstruction(level.instruction, { swap: !firstEntry });
    feedback.pushInstruction();
    await triangles.showOptions(OPTION_GROUPS[level.optionGroup], { refreshAll: groupChanged });
    bridge.showSocket(level.bridgeStage);
    gameState.update({ transition: null });
    unlockInput();
    scheduleNudge();
    debugLog('level', `task ${level.id} started; correct = ${level.correctTriangleId}`);
  }

  async function handlePick() {
    if (!active || busy || inputLocked() || crane.isBusy || crane.carried || crane.state !== CRANE_STATES.HOVERING_OPTION) return;
    const { option } = placement.resolveHover(crane.position.x, null);
    if (!option) return;
    busy = true;
    input.setActionState({ mode: 'pick', enabled: false });
    input.nudgeJoystick(false);
    clearTimeout(nudgeTimer);
    try {
      const grab = triangles.grabPointOf(option);
      triangles.lift(option);
      triangles.nudgePlatform();
      triangles.focusOn(option);
      camera.focus({ x: grab.x, y: grab.y + 90, scale: 1.3, pull: 0.65, duration: 650, signal: scope.signal }).catch(() => {});
      try {
        await crane.pickUp({ ...option, grabStageX: grab.x, grabStageY: grab.y }, { signal: scope.signal });
      } finally {
        triangles.clearFocus();
      }
      triangles.hidePlatform();
      camera.focus({ x: 960, y: 460, scale: 1.2, pull: 0.6, duration: 1100, signal: scope.signal }).catch(() => {});
    } catch (error) {
      if (!isAbortError(error)) throw error;
    } finally {
      busy = false;
    }
    syncUi();
  }

  async function handleDrop() {
    const carried = crane.carried;
    if (!active || busy || inputLocked() || crane.isBusy || !carried || crane.state !== CRANE_STATES.HOVERING_TARGET) return;
    const hover = placement.resolveHover(crane.position.x, carried);
    busy = true;
    input.setActionState({ mode: 'drop', enabled: false });
    try {
      if (hover.overSocket) await placeOnBridge(carried);
    } catch (error) {
      if (!isAbortError(error)) throw error;
    } finally {
      busy = false;
    }
    syncUi();
  }

  /** Lower the frame until its base stands on the road, inside the hotspot. */
  function dropGripY(option) {
    return BRIDGE_GEOMETRY.deckY - (option.baseOffset - option.grabY);
  }

  async function placeOnBridge(option) {
    lockInput();
    const level = currentLevel();
    const socket = placement.activeStage.socket;
    camera.focus({ x: socket.x, y: socket.y, scale: 1.28, pull: 0.55, duration: 900, signal: scope.signal }).catch(() => {});
    const released = await crane.lowerAndRelease(
      { craneX: placement.craneXForSocket(option), gripY: dropGripY(option) },
      { signal: scope.signal }
    );
    triangles.placeInWorld(option, released.left, released.top);
    bridge.hideSocket();
    await triangles.seat(option);
    if (placement.isCorrect(option.id, level)) await handleCorrect(option, level);
    else await handleIncorrect(option);
  }

  /** Lock → release → focus → crew builds → settle → next task. */
  async function handleCorrect(option, level) {
    gameState.update({ transition: 'level:construct' });
    audio.play('correct');
    builder.cheer();
    voice.say(COPY.feedback.correct, { speaker: 'narrator' });
    claw.relief();
    await crane.liftAway({ signal: scope.signal });
    crane.parkAway({ signal: scope.signal }).catch(() => {});
    await camera.focus({ x: 960, y: 480, scale: 1.1, pull: 0.55, duration: 800, signal: scope.signal });
    triangles.release(option);
    await bridge.absorbFrame(option, level.bridgeStage, scope.signal);
    await bridge.constructStage(level.bridgeStage, { signal: scope.signal });
    gameState.update({ bridgeProgress: currentLevelIndex + 1 });
    await wait(380, scope.signal);
    if (currentLevelIndex === LEVEL_COUNT - 1) {
      active = false;
      gameState.update({ transition: null, completed: true });
      await onComplete();
      return;
    }
    await camera.reset(600, scope.signal);
    await startLevel(currentLevelIndex + 1);
  }

  /** PDF rule: a wrong frame makes the whole bridge sway, collapse, and construction restarts. */
  async function handleIncorrect(option) {
    gameState.update({ transition: 'level:collapse' });
    audio.play('incorrect');
    builder.worry();
    crane.alarm(true);
    voice.say(COPY.feedback.incorrect, { speaker: 'narrator' });
    await triangles.rejectShake(option);
    camera.shake(7, 340);
    await claw.react();
    await crane.liftAway({ signal: scope.signal });
    crane.parkAway({ signal: scope.signal }).catch(() => {});
    await camera.focus({ x: 960, y: 540, scale: 1, duration: 520, signal: scope.signal });
    const falling = wait(bridge.builtCount ? 1900 : 300, scope.signal).then(() => triangles.dropIntoWater(option));
    await bridge.collapse({ signal: scope.signal });
    await falling;
    crane.alarm(false);
    gameState.update({ bridgeProgress: 0 });
    await camera.reset(500, scope.signal);
    await startLevel(0);
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
      triangles.clearFocus();
      await triangles.clearOptions();
      await triangles.showPlatform();
      bridge.reset();
      currentGroup = null;
      currentLevelIndex = 0;
      gameState.update({ bridgeProgress: 0, currentLevelIndex: 0, carriedTriangleId: null, hoveredOptionId: null, completed: false, transition: null });
    },
  };
}
