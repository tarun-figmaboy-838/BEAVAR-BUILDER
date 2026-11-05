import { CRANE_RIG } from '../data/layout.js';
import { prefersReducedMotion } from '../core/motion.js';

// Codex's polished operator: one 2 x 2 atlas per pose family, all framed alike (whole frames, same
// scale, the beaver seated at his joystick box), so poses switch without the beaver jumping.
export const BUILDER_FRAME_SOURCES = [
  'assets/images/characters/operator/beaver-idle-atlas.png',
  'assets/images/characters/operator/beaver-talk-atlas.png',
  'assets/images/characters/operator/beaver-happy-atlas.png',
  'assets/images/characters/operator/beaver-sad-atlas.png',
  'assets/images/characters/operator/beaver-drive-atlas.png',
  'assets/images/characters/operator/beaver-actions-atlas.png',
];
/**
 * Per-sheet fit (measured from each sheet's body outline against the idle sheet): the sheets were
 * generated separately, so each is scaled and nudged (in % of a frame) to match the idle sheet exactly.
 * Without this the beaver grows or shifts by a pixel or two whenever he switches pose.
 */
const SHEET_FIT = [
  { scale: 1, x: 0, y: 0 },              // idle
  { scale: 0.9879, x: 0.554, y: 0.996 }, // talk
  { scale: 1, x: 0, y: 0 },              // happy
  { scale: 0.9982, x: 0.012, y: 0.166 }, // sad
  { scale: 0.9828, x: 0.899, y: 1.325 }, // drive
  { scale: 1, x: 0.638, y: -0.478 },     // actions
];
/** Talking: only the mouth moves (closed, open, wide, smile), in an uneven, speech-like rhythm. */
const TALK_FRAMES = [1, 0, 2, 3, 0, 1, 2, 0, 3, 1, 0, 2];
const TALK_MS = [120, 90, 150, 110, 80, 130, 140, 90, 120, 100, 80, 160];
const POSES = {
  idle: { sheet: 0, frames: [0, 1, 2, 1, 0], durations: [3200, 70, 90, 70, 1200] },
  talk: { sheet: 1, frames: TALK_FRAMES, durations: TALK_MS },
  cheer: { sheet: 2, frames: [0, 1, 2, 3, 1, 0], ms: 260, once: true },
  worry: { sheet: 3, frames: [0, 1, 2, 1, 3], ms: 300, once: true },
  point: { sheet: 2, frames: [0, 1, 3, 0], ms: 300, once: true },
  drive: { sheet: 4, frames: [0], ms: 200 },
  pick: { sheet: 5, frames: [0], ms: 200 },
  carry: { sheet: 5, frames: [1], ms: 200 },
  drop: { sheet: 5, frames: [2], ms: 200 },
  complete: { sheet: 5, frames: [3], ms: 200 },
};
const REACTIONS = new Set(['talk', 'cheer', 'worry', 'point']);

export function createBuilderCharacter({ hostEl }) {
  const { cabWindow } = CRANE_RIG;
  const root = document.createElement('div');
  root.className = 'builder';
  root.hidden = true;
  root.setAttribute('aria-hidden', 'true');
  Object.assign(root.style, { left: `${cabWindow.left}px`, top: `${cabWindow.top}px`, width: `${cabWindow.width}px`, height: `${cabWindow.height}px` });
  // One frame layer: frames swap instantly, as in any sprite animation. The sheets are scale-matched
  // (SHEET_FIT), so the beaver never jumps; a cross-fade showed two poses on top of each other.
  root.innerHTML = '<div class="builder__body"><div class="builder__frame is-on"></div></div>';
  hostEl.appendChild(root);
  // The cab's front (body, window frame and a glass sheet) goes over the operator, so he sits inside, behind glass.
  const { cabin } = CRANE_RIG;
  const cabFront = new Image();
  cabFront.className = 'crane-cabin-front';
  cabFront.src = cabin.frontSrc;
  cabFront.alt = '';
  cabFront.draggable = false;
  Object.assign(cabFront.style, { left: `${cabin.left}px`, top: `${cabin.top}px`, width: `${cabin.width}px`, height: `${cabin.height}px` });
  hostEl.appendChild(cabFront);
  const beaconEl = hostEl.querySelector('.cab-beacon');
  if (beaconEl) hostEl.appendChild(beaconEl);   // the beacon's glow stays on top of the cab roof
  const frameEl = root.querySelector('.builder__frame');
  let shownKey = '';
  let pose = 'idle';
  let interval = 0;
  let returnTimer = 0;
  let index = 0;
  let revision = 0;
  let axis = { x: 0, y: 0 };
  let machinePose = 'idle';
  let completed = false;
  const driving = () => Math.hypot(axis.x, axis.y) > 0.05;
  const restingPose = () => completed ? 'complete' : driving() ? 'drive' : machinePose;
  function paint(layer, sheet, number) {
    const fit = SHEET_FIT[sheet];
    layer.style.backgroundImage = `url("${BUILDER_FRAME_SOURCES[sheet]}")`;
    layer.style.backgroundPosition = `${(number % 2) * 100}% ${Math.floor(number / 2) * 100}%`;
    layer.style.transform = `translate(${fit.x}%, ${fit.y}%) scale(${fit.scale})`;
  }
  function show(number) {
    const sheet = POSES[pose].sheet;
    const key = `${sheet}:${number}`;
    if (key !== shownKey) {
      shownKey = key;
      paint(frameEl, sheet, number);
    }
    root.dataset.facing = ['idle', 'drive', 'pick', 'carry', 'drop'].includes(pose) ? 'controls' : 'user';
    root.dataset.frame = String(number);
    root.dataset.sheet = String(sheet);
  }
  function driveFrame() {
    if (Math.abs(axis.y) > Math.abs(axis.x)) return axis.y < 0 ? 2 : 1;
    return axis.x < -.12 ? 1 : axis.x > .12 ? 3 : 0;
  }
  function advance() {
    const definition = POSES[pose];
    if (root.hidden || document.hidden || prefersReducedMotion() || definition.frames.length < 2) return;
    interval = setTimeout(() => {
      if (definition.once && index === definition.frames.length - 1) return;
      index = (index + 1) % definition.frames.length;
      show(definition.frames[index]);
      advance();
    }, definition.durations?.[index] ?? definition.ms);
  }
  function setPose(name, { thenIdleAfter = 0 } = {}) {
    clearTimeout(interval);
    clearTimeout(returnTimer);
    interval = 0;
    revision += 1;
    pose = POSES[name] ? name : 'idle';
    root.dataset.pose = pose;
    index = 0;
    show(pose === 'drive' ? driveFrame() : POSES[pose].frames[0]);
    advance();
    if (thenIdleAfter) returnTimer = setTimeout(() => setPose(restingPose()), thenIdleAfter);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { clearTimeout(interval); interval = 0; }
    else if (!root.hidden) setPose(restingPose());
  });
  return {
    show() { root.hidden = false; setPose(restingPose()); },
    hide() { root.hidden = true; axis = { x: 0, y: 0 }; setPose('idle'); },
    get cabCenter() { return { x: cabWindow.left + cabWindow.width / 2, y: cabWindow.top + cabWindow.height / 2 }; },
    get cabWindow() { return cabWindow; },
    /** Where the speech-bubble tail points: just right of the cab glass, level with the operator's mouth. */
    get bubbleAnchor() { return { x: CRANE_RIG.cabin.left + CRANE_RIG.cabin.width - 8, y: cabWindow.top + cabWindow.height * 0.34 }; },
    setPose,
    setGameState(state) {
      completed = state.completed;
      machinePose = ['lowering', 'grabbing'].includes(state.craneState) ? 'pick'
        : ['carrying', 'hoveringTarget'].includes(state.craneState) ? 'carry'
        : ['dropping', 'placing', 'returning'].includes(state.craneState) ? 'drop' : 'idle';
      if (!REACTIONS.has(pose) && restingPose() !== pose) setPose(restingPose());
    },
    setAxis(next) {
      axis = next;
      root.dataset.lean = axis.x < -0.12 ? 'left' : axis.x > 0.12 ? 'right' : axis.y < -0.3 ? 'up' : axis.y > 0.3 ? 'down' : '';
      if (!REACTIONS.has(pose)) {
        const nextPose = restingPose();
        if (nextPose !== pose) setPose(nextPose);
        else if (pose === 'drive') show(driveFrame());
      }
    },
    async talkUntil(finished) {
      setPose('talk');
      const token = revision;
      try { await finished; } finally { if (token === revision) setPose(restingPose()); }
    },
    cheer() { setPose('cheer', { thenIdleAfter: 2300 }); },
    worry() { setPose('worry', { thenIdleAfter: 2100 }); },
    point() { setPose('point', { thenIdleAfter: 1600 }); },
    get element() { return root; },
  };
}
