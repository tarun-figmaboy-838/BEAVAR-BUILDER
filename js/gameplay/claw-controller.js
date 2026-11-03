import { wait, playClassAnimation, prefersReducedMotion } from '../core/motion.js';
import { CRANE_RIG } from '../data/layout.js';

const STATES = CRANE_RIG.claw.states; // open → half → closed (the kit's claw sprites)
const LAST = STATES.length - 1;

/** Stacks the kit's claw-state sprites, top-aligned and centred under the cable. */
export function buildClawFrames(clawEl) {
  STATES.forEach((state, index) => {
    const frame = new Image();
    frame.className = 'claw-frame';
    frame.src = state.src;
    frame.alt = '';
    frame.draggable = false;
    frame.style.width = `${state.width}px`;
    frame.style.height = `${state.height}px`;
    if (index === 0) frame.classList.add('is-active');
    clawEl.appendChild(frame);
  });
}

/** Mechanical open/close by swapping the approved claw sprites: no vector redraws, no morphing. */
export function createClawController({ clawEl }) {
  const frames = Array.from(clawEl.querySelectorAll('.claw-frame'));
  let frameIndex = 0;

  function show(index) {
    frames.forEach((frame, k) => frame.classList.toggle('is-active', k === index));
    frameIndex = index;
  }

  async function stepTo(target, frameMs) {
    const ms = prefersReducedMotion() ? 0 : frameMs;
    const direction = target > frameIndex ? 1 : -1;
    while (frameIndex !== target) {
      show(frameIndex + direction);
      if (ms) await wait(ms);
    }
  }

  show(0);

  return {
    open: () => stepTo(0, 70),
    close: () => stepTo(LAST, 80),
    /** Comic beat: snaps shut on nothing, notices, and reopens (intro only). */
    async fumble() {
      await stepTo(LAST, 50);
      await wait(180);
      await stepTo(1, 70);
      await wait(120);
      await stepTo(0, 70);
    },
    squeeze: () => playClassAnimation(clawEl, 'is-squeezing', 260),
    react: () => playClassAnimation(clawEl, 'is-reacting', 820),
    relief: () => playClassAnimation(clawEl, 'is-relieved', 620),
    setClosed(closed) {
      show(closed ? LAST : 0);
    },
    get isOpen() {
      return frameIndex === 0;
    },
  };
}
