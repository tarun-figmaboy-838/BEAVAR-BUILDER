import { prefersReducedMotion } from '../core/motion.js';

const HORIZON_Y = 405;          // where the canal meets the sky in the background art
const GLITTER_COUNT = 34;

/** Deterministic pseudo-random numbers, so the glitter path is the same on every load. */
function seeded(seed) {
  let value = seed;
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

/**
 * Living water over the painted canal:
 *  - a ground plane in true perspective: ripple texture and rolling wave crests shrink toward the
 *    horizon and drift toward the viewer, so the surface reads as moving water, not a sliding texture;
 *  - a sun-glitter path down the middle of the canal: sparkles that twinkle, larger when closer.
 */
export function buildEnvironment({ waterLayer }) {
  const water = document.createElement('div');
  water.className = 'water-fx motion-ambient';
  water.innerHTML = `
    <div class="water-fx__plane">
      <div class="water-fx__ripples water-fx__ripples--a"></div>
      <div class="water-fx__ripples water-fx__ripples--b"></div>
      <div class="water-fx__crests"></div>
    </div>
    <div class="water-fx__sheen"></div>`;
  const random = seeded(7);
  for (let i = 0; i < GLITTER_COUNT; i += 1) {
    const depth = Math.pow(random(), 0.8);                 // 0 = horizon, 1 = front
    const y = HORIZON_Y + 20 + depth * (1080 - HORIZON_Y - 20);
    const spread = 40 + depth * 260;
    const x = 960 + (random() * 2 - 1) * spread;
    const glint = new Image();
    glint.className = 'water-glint';
    glint.src = 'assets/images/fx/sparkle-cluster.png';
    glint.alt = '';
    glint.draggable = false;
    glint.style.left = `${x.toFixed(0)}px`;
    glint.style.top = `${y.toFixed(0)}px`;
    glint.style.width = `${(14 + depth * 46).toFixed(0)}px`;
    glint.style.setProperty('--glint-ms', `${(1800 + random() * 2600).toFixed(0)}ms`);
    glint.style.setProperty('--glint-delay', `${(-random() * 4000).toFixed(0)}ms`);
    water.appendChild(glint);
  }
  if (prefersReducedMotion()) water.classList.add('is-still');
  waterLayer.appendChild(water);
}
