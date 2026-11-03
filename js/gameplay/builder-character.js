import { prefersReducedMotion } from '../core/motion.js';
import { CRANE_RIG } from '../data/layout.js';

/**
 * The beaver builder (assets/images/characters/builder, sliced from the supplied beaver sheet) is the crane operator:
 * he sits in the cab window, behind the glass. Whole-frame sprite animation only: idle with blinks,
 * talking while a line plays, cheering, worrying.
 */
const frameSrc = (index) => `assets/images/characters/builder/beaver-${String(index).padStart(2, '0')}.png`;

const POSES = Object.freeze({
  idle: { frames: [0, 1, 2, 1], ms: 460 },
  blink: { frames: [3, 4, 3], ms: 70 },
  talk: { frames: [16, 18, 17, 19, 21, 20, 22, 19], ms: 120 },
  point: { frames: [27, 28, 29, 28], ms: 170 },
  cheer: { frames: [35, 36, 37, 36], ms: 130 },
  worry: { frames: [4, 3, 4, 13], ms: 160 },
});

export const BUILDER_FRAME_SOURCES = [...new Set(Object.values(POSES).flatMap((pose) => pose.frames))].map(frameSrc);

export function createBuilderCharacter({ hostEl }) {
  const { cabWindow } = CRANE_RIG;
  const root = document.createElement('div');
  root.className = 'builder';
  root.hidden = true;
  root.setAttribute('aria-hidden', 'true');
  Object.assign(root.style, { left: `${cabWindow.left}px`, top: `${cabWindow.top}px`, width: `${cabWindow.width}px`, height: `${cabWindow.height}px` });
  root.innerHTML = '<div class="builder__body"><img class="builder__frame" alt="" draggable="false"></div><span class="builder__glass"></span>';
  hostEl.appendChild(root);
  const body = root.querySelector('.builder__body');
  const image = root.querySelector('.builder__frame');

  let pose = 'idle';
  let frameIndex = 0;
  let timer = 0;
  let returnTimer = 0;
  let nextBlinkAt = performance.now() + 2500;

  function show(frame) {
    const src = frameSrc(frame);
    if (image.getAttribute('src') !== src) image.setAttribute('src', src);
  }

  function tick() {
    const definition = POSES[pose];
    frameIndex = (frameIndex + 1) % definition.frames.length;
    if (pose === 'idle' && performance.now() > nextBlinkAt) {
      nextBlinkAt = performance.now() + 2200 + Math.random() * 2400;
      setPose('blink', { thenIdleAfter: 230 });
      return;
    }
    show(definition.frames[frameIndex]);
  }

  function setPose(name, { thenIdleAfter = 0 } = {}) {
    clearTimeout(returnTimer);
    pose = POSES[name] ? name : 'idle';
    frameIndex = 0;
    show(POSES[pose].frames[0]);
    clearInterval(timer);
    if (!prefersReducedMotion() || pose === 'talk') timer = setInterval(tick, POSES[pose].ms);
    if (thenIdleAfter) returnTimer = setTimeout(() => setPose('idle'), thenIdleAfter);
  }

  function bounce(className, ms) {
    body.classList.remove(className);
    void body.offsetWidth;
    body.classList.add(className);
    setTimeout(() => body.classList.remove(className), ms);
  }

  return {
    /** The operator is always in the cab; the camera decides how close we are. */
    show() {
      root.hidden = false;
      if (!timer) setPose('idle');
    },
    /** Centre of the cab window in stage coordinates (camera focus target, bubble anchor). */
    get cabCenter() {
      return { x: cabWindow.left + cabWindow.width / 2, y: cabWindow.top + cabWindow.height / 2 };
    },
    get cabWindow() {
      return cabWindow;
    },
    hide() {
      root.hidden = true;
      clearInterval(timer);
      timer = 0;
    },
    setPose,
    /** Talk until `finished` resolves (the narration's own clock), then settle back to idle. */
    async talkUntil(finished) {
      setPose('talk');
      try {
        await finished;
      } finally {
        if (pose === 'talk') setPose('idle');
      }
    },
    cheer() {
      setPose('cheer', { thenIdleAfter: 1700 });
      bounce('is-hopping', 900);
    },
    worry() {
      setPose('worry', { thenIdleAfter: 1500 });
      bounce('is-shaking', 700);
    },
    point() {
      setPose('point', { thenIdleAfter: 1400 });
    },
    get element() {
      return root;
    },
  };
}
