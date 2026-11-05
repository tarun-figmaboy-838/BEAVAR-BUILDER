import { STAGE } from '../data/layout.js';
import { prefersReducedMotion, wait, tween, easings } from './motion.js';

/**
 * Focus controller: transforms the world layer (never the browser viewport).
 *
 * The camera is a critically damped follower, stepped by the game loop. It eases toward the
 * latest target in (x, y, log scale) space, so a zoom always grows about the point being framed,
 * and a new shot taken mid-move carries the current speed into it instead of restarting.
 * Shake lives on an inner layer and is refused while the camera moves, so effects never stack.
 */
const STANDARD_SHOT = Object.freeze({ x: STAGE.centerX, y: STAGE.centerY, scale: 1 });
const SETTLE_FACTOR = 3.2;   // a move of `duration` ms has visibly settled when the duration ends
const REST_EPSILON = 0.02;   // px / log-scale units below which the camera is at rest

/** Unity-style SmoothDamp: critically damped, frame-rate independent. Returns [value, velocity]. */
function smoothDamp(current, target, velocity, smoothTime, dt) {
  const omega = 2 / smoothTime;
  const x = omega * dt;
  const decay = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = current - target;
  const temp = (velocity + omega * change) * dt;
  return [target + (change + temp) * decay, (velocity - omega * temp) * decay];
}

export function createCameraController({ worldEl, shakeEl, screenFixedEl }) {
  const view = { x: STANDARD_SHOT.x, y: STANDARD_SHOT.y, logScale: 0 };
  const velocity = { x: 0, y: 0, logScale: 0 };
  let target = { x: STANDARD_SHOT.x, y: STANDARD_SHOT.y, logScale: 0 };
  let smoothTime = 0.2;
  let atRest = true;
  let movingUntil = 0;
  let lastTransform = '';

  function clampTranslation(x, y, scale) {
    // With scale >= 1 the world must keep covering the stage; with scale < 1 we centre it.
    if (scale <= 1) return { tx: STAGE.centerX - STAGE.centerX * scale, ty: STAGE.centerY - STAGE.centerY * scale };
    const tx = STAGE.centerX - x * scale;
    const ty = STAGE.centerY - y * scale;
    return {
      tx: Math.min(0, Math.max(STAGE.width - STAGE.width * scale, tx)),
      ty: Math.min(0, Math.max(STAGE.height - STAGE.height * scale, ty)),
    };
  }

  function render() {
    const scale = Math.exp(view.logScale);
    const { tx, ty } = clampTranslation(view.x, view.y, scale);
    const transform = `translate3d(${tx.toFixed(2)}px, ${ty.toFixed(2)}px, 0) scale(${scale.toFixed(5)})`;
    if (transform === lastTransform) return;
    lastTransform = transform;
    worldEl.style.transform = transform;
    // The inverse keeps screen-fixed items (the task card) still while the world zooms around them.
    if (screenFixedEl) screenFixedEl.style.transform = `translate3d(${(-tx / scale).toFixed(2)}px, ${(-ty / scale).toFixed(2)}px, 0) scale(${(1 / scale).toFixed(5)})`;
  }

  function setMoving(moving) {
    if (atRest === !moving) return;
    atRest = !moving;
    // A promoted layer is smooth to move but rasterised at one scale; drop it at rest so zoomed art is crisp.
    worldEl.classList.toggle('is-moving', moving);
  }

  function snap() {
    Object.assign(view, target);
    velocity.x = velocity.y = velocity.logScale = 0;
    setMoving(false);
    render();
  }

  function update(dt) {
    if (atRest || dt <= 0) return;
    for (const key of ['x', 'y', 'logScale']) {
      [view[key], velocity[key]] = smoothDamp(view[key], target[key], velocity[key], smoothTime, dt);
    }
    const remaining = Math.abs(view.x - target.x) + Math.abs(view.y - target.y) + Math.abs(view.logScale - target.logScale) * 400;
    const speed = Math.abs(velocity.x) + Math.abs(velocity.y) + Math.abs(velocity.logScale) * 400;
    if (remaining < REST_EPSILON && speed < REST_EPSILON * 10) snap();
    else render();
  }

  /**
   * Frame a stage point. `pull` (0..1) is how far the point travels toward the stage centre;
   * small pulls read as a gentle push rather than a hard re-centre. Resolves when the move has settled.
   */
  async function focus({ x = STAGE.centerX, y = STAGE.centerY, scale = 1, pull = 1, duration = 640, signal } = {}) {
    const reduced = prefersReducedMotion();
    target = {
      x: STAGE.centerX + (x - STAGE.centerX) * pull,
      y: STAGE.centerY + (y - STAGE.centerY) * pull,
      logScale: Math.log(reduced ? 1 : Math.max(0.5, scale)),
    };
    if (reduced || duration <= 0) {
      snap();
      return;
    }
    smoothTime = Math.max(0.06, duration / 1000 / SETTLE_FACTOR);
    movingUntil = performance.now() + duration;
    setMoving(true);
    await wait(duration, signal);
  }

  /**
   * Drone flight: the camera glides along one smooth curve (Catmull-Rom) through the given shots,
   * at an even speed, easing in at the start and out at the end, never stopping in between.
   */
  async function fly(shots, { duration = 4000, signal } = {}) {
    const points = shots.map(({ x = STAGE.centerX, y = STAGE.centerY, scale = 1 }) => [x, y, Math.log(Math.max(0.5, scale))]);
    if (!points.length) return;
    const last = points[points.length - 1];
    if (prefersReducedMotion() || points.length === 1) {
      target = { x: last[0], y: last[1], logScale: last[2] };
      snap();
      return;
    }
    const ZOOM_WEIGHT = 900; // how much a zoom counts against a pan when spacing the flight evenly
    const lengths = points.slice(1).map((p, i) => Math.hypot(p[0] - points[i][0], p[1] - points[i][1], (p[2] - points[i][2]) * ZOOM_WEIGHT) || 1);
    const total = lengths.reduce((sum, length) => sum + length, 0);
    const at = (i) => points[Math.max(0, Math.min(points.length - 1, i))];
    const catmullRom = (a, b, c, d, t) => 0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
    smoothTime = 0.14;
    movingUntil = performance.now() + duration;
    setMoving(true);
    await tween({
      duration,
      ease: easings.mechanical,
      signal,
      onUpdate: (u) => {
        let distance = u * total;
        let i = 0;
        while (i < lengths.length - 1 && distance > lengths[i]) distance -= lengths[i++];
        const t = Math.min(1, distance / lengths[i]);
        const [x, y, logScale] = [0, 1, 2].map((k) => catmullRom(at(i - 1)[k], at(i)[k], at(i + 1)[k], at(i + 2)[k], t));
        target = { x, y, logScale };
        setMoving(true);
      },
    });
  }

  function reset(duration = 640, signal) {
    return focus({ ...STANDARD_SHOT, duration, signal });
  }

  function shake(intensityPx = 6, durationMs = 320) {
    if (prefersReducedMotion() || performance.now() < movingUntil) return;
    shakeEl.style.setProperty('--shake-px', `${intensityPx}px`);
    shakeEl.classList.remove('is-shaking');
    void shakeEl.offsetWidth;
    shakeEl.classList.add('is-shaking');
    setTimeout(() => shakeEl.classList.remove('is-shaking'), durationMs + 40);
  }

  /** Where a world point appears on the stage once the current move settles (anchors HUD items to world objects). */
  function project(x, y) {
    const scale = Math.exp(target.logScale);
    const { tx, ty } = clampTranslation(target.x, target.y, scale);
    return { x: tx + x * scale, y: ty + y * scale, scale };
  }

  render();

  return {
    update,
    focus,
    fly,
    reset,
    shake,
    project,
    get isMoving() {
      return !atRest;
    },
  };
}
