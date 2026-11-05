import { prefersReducedMotion } from '../core/motion.js';

/**
 * Drone intro: seven aerial shots of the canal town cut together like drone footage, one continuous
 * flight that lands on the live construction site:
 *   straight down over the canal, turning as it climbs -> tilts up to reveal the town ->
 *   flies forward and dives -> banks left -> swings across to the right bank -> drops to skim the
 *   water -> pulls up and back to the front view -> lands on the game.
 *
 * The camera never stops, and every cut happens inside a move: a 3D tilt, a zoom-through or a
 * whip pan, with both shots travelling the same way and a touch of motion blur, so the cuts read as
 * one flight, not a slideshow. A slight hover sway runs underneath. Transform, opacity and a brief
 * blur only, on two images at a time.
 */
const P = 1400; // perspective of the 3D moves, stage px

/** Pose of the camera over a shot: translate %, rotate X/Y/Z deg, scale, blur px, opacity. */
const pose = (o, { x = 0, y = 0, rx = 0, ry = 0, rz = 0, s = 1, blur = 0, a = 1 } = {}) => ({
  offset: o,
  transform: `perspective(${P}px) translate(${x}%, ${y}%) rotateX(${rx}deg) rotateY(${ry}deg) rotateZ(${rz}deg) scale(${s})`,
  filter: `blur(${blur}px)`,
  opacity: a,
});

export const DRONE_SHOTS = Object.freeze([
  {
    // Straight down over the canal: turning and climbing, then tilting up toward the horizon.
    src: 'assets/images/drone/01-top-down.png', ms: 1750, origin: '50% 50%',
    keys: [pose(0, { rz: 14, s: 1.38 }), pose(0.55, { rz: 4, s: 1.26 }), pose(1, { y: -7, rx: 36, s: 1.34, blur: 4 })],
  },
  {
    // Still tilting up as it appears, then flying forward over the town toward the mountains.
    src: 'assets/images/drone/02-high-aerial.png', ms: 1500, origin: '50% 17%',
    keys: [pose(0, { y: 5, rx: -12, s: 1.12, blur: 4, a: 0 }), pose(0.24, { y: 1, rx: -2, s: 1.1 }), pose(0.82, { s: 1.24 }), pose(1, { s: 1.4, blur: 5 })],
  },
  {
    // Lower along the canal, still moving forward, then starting to bank left.
    src: 'assets/images/drone/03-mid-aerial.png', ms: 1300, origin: '50% 24%',
    keys: [pose(0, { s: 1.04, blur: 5, a: 0 }), pose(0.25, { s: 1.09 }), pose(0.7, { s: 1.15 }), pose(1, { x: 6, ry: -9, s: 1.22, blur: 5 })],
  },
  {
    // Over the left bank: the bank swings through and the camera whips across to the right.
    src: 'assets/images/drone/04-left-bank.png', ms: 1250, origin: '60% 40%',
    keys: [pose(0, { x: 6, ry: -7, s: 1.2, blur: 5, a: 0 }), pose(0.25, { x: 3, ry: -3, s: 1.18 }), pose(0.7, { x: 0, ry: 0, s: 1.17 }), pose(1, { x: -7, ry: 9, s: 1.2, blur: 5 })],
  },
  {
    // Arriving over the right bank still swinging, then diving toward the water.
    src: 'assets/images/drone/05-right-bank.png', ms: 1250, origin: '40% 42%',
    keys: [pose(0, { x: 7, ry: -8, s: 1.2, blur: 5, a: 0 }), pose(0.25, { x: 3, ry: -3, s: 1.17 }), pose(0.65, { x: 0, ry: 0, s: 1.16 }), pose(1, { y: -9, s: 1.34, blur: 5 })],
  },
  {
    // Skimming low and fast over the water, a little roll in the turn.
    src: 'assets/images/drone/06-water-level.png', ms: 1200, origin: '50% 47%',
    keys: [pose(0, { y: 9, s: 1.06, blur: 5, a: 0 }), pose(0.24, { y: 3, s: 1.1 }), pose(0.8, { rz: -1.2, s: 1.3 }), pose(1, { rz: -1.6, s: 1.46, blur: 6 })],
  },
  {
    // Pulling up and back to the front view of the site.
    src: 'assets/images/drone/07-front.png', ms: 1550, origin: '50% 42%',
    keys: [pose(0, { y: 3, rz: -1, s: 1.34, blur: 6, a: 0 }), pose(0.2, { y: 3, rz: -0.6, s: 1.28 }), pose(1, { y: 0, rz: 0, s: 1.05 })],
  },
]);
const CUT_MS = 340;       // the two shots overlap for this long inside each move
const REVEAL_MS = 800;    // the last shot dissolving into the live scene

/**
 * Plays the flight over `host`. `onReveal` fires as the last shot starts dissolving (so the game
 * camera is already moving underneath). Returns { done, skip }.
 */
export function playDroneIntro(host, { onReveal } = {}) {
  if (prefersReducedMotion()) return { done: Promise.resolve(), skip() {} };
  const layer = document.createElement('div');
  layer.className = 'drone-intro';
  layer.setAttribute('aria-hidden', 'true');
  const hover = document.createElement('div');
  hover.className = 'drone-intro__hover';
  layer.appendChild(hover);
  host.prepend(layer);

  const animations = [];
  const timers = [];
  let finished = false;
  let resolveDone;
  const done = new Promise((resolve) => {
    resolveDone = resolve;
  });

  function finish() {
    if (finished) return;
    finished = true;
    timers.forEach(clearTimeout);
    animations.forEach((animation) => animation.cancel());
    layer.remove();
    resolveDone();
  }

  let start = 0;
  const images = DRONE_SHOTS.map((shot, index) => {
    const image = new Image();
    image.className = 'drone-intro__shot';
    image.src = shot.src;
    image.alt = '';
    image.draggable = false;
    image.style.transformOrigin = shot.origin;
    image.style.opacity = '0';
    hover.appendChild(image);
    const delay = start;
    animations.push(image.animate(shot.keys, { duration: shot.ms, delay, easing: 'linear', fill: 'both' }));
    // Once the next shot has fully taken over, this one is hidden and freed.
    if (index < DRONE_SHOTS.length - 1) timers.push(setTimeout(() => image.remove(), delay + shot.ms + 40));
    start += shot.ms - CUT_MS;
    return image;
  });
  images[0].style.opacity = '1';

  const revealAt = start + CUT_MS - REVEAL_MS * 0.55;
  timers.push(setTimeout(() => onReveal?.(), revealAt));
  animations.push(layer.animate([{ opacity: 1 }, { opacity: 0 }], { duration: REVEAL_MS, delay: revealAt, easing: 'ease-in-out', fill: 'both' }));
  timers.push(setTimeout(finish, Math.max(revealAt + REVEAL_MS, start + CUT_MS) + 40));

  return { done, skip: finish };
}
