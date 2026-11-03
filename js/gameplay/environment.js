import { prefersReducedMotion } from '../core/motion.js';
import { STAGE } from '../data/layout.js';

/**
 * Living water over the painted canal, drawn on ONE small canvas.
 *
 * It reproduces the earlier CSS look (a ground plane in true perspective whose ripple glints and
 * wave crests drift toward the viewer, a sun-glitter path down the canal, a slow sheen), but the
 * CSS version needed seven 3D-transformed, blended layers of ~150 megapixels in all, which made
 * iPhone/iPad Safari kill the tab ("A problem repeatedly occurred") and low-end laptops flicker.
 * The canvas is the canal's bounding box at most (1920 x 675 stage px), redrawn at 30 fps.
 */
const HORIZON_Y = 405;                    // where the canal meets the sky in the background art
const TOP = HORIZON_Y;                    // canvas top, stage px
const HEIGHT = STAGE.height - TOP;
const PERSPECTIVE = 520;
const TILT = (80 * Math.PI) / 180;
const SIN = Math.sin(TILT);
const COS = Math.cos(TILT);
const PLANE_DEPTH = 2600;                 // the plane's length into the distance
const FRAME_MS = 1000 / 30;
const GLITTER_COUNT = 34;
/** The canal's water outline (stage px): banks converge on the horizon. */
const CANAL = [[640, 408], [1280, 408], [1745, 648], [1920, 700], [1920, 1080], [0, 1080], [0, 700], [178, 648]];

/** Wave glints, as [radiusX, radiusY, centreX, centreY, alpha] inside one repeating tile. */
const RIPPLES = [
  {
    tileW: 300, tileH: 120, cycleMs: 5500, driftX: -300, driftY: 240, originX: -2400, originY: -600, opacity: 1,
    glints: [[29, 3.2, 139, 66, 0.73], [30, 3.2, 152, 69, 0.51], [26, 3.2, 180, 90, 0.48], [22, 3.2, 57, 91, 0.66], [32, 3.2, 260, 107, 0.65],
      [22, 3.2, 72, 11, 0.61], [29, 3.2, 79, 34, 0.46], [33, 3.2, 136, 95, 0.61], [26, 3.2, 150, 76, 0.59]],
  },
  {
    tileW: 470, tileH: 190, cycleMs: 8000, driftX: 470, driftY: 190, originX: -2400, originY: -600, opacity: 0.9,
    glints: [[49, 4.5, 416, 176, 0.51], [33, 4.5, 168, 51, 0.39], [41, 4.5, 332, 79, 0.52], [36, 4.5, 402, 152, 0.33],
      [41, 4.5, 385, 90, 0.55], [38, 4.5, 79, 116, 0.5], [51, 4.5, 85, 68, 0.54], [32, 4.5, 96, 54, 0.35]],
  },
];
const CRESTS = { period: 200, peak: 164, halfWidth: 24, alpha: 0.3, originY: -400, cycleMs: 3800 };

/** Deterministic pseudo-random numbers, so the glitter path is the same on every load. */
function seeded(seed) {
  let value = seed;
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

const smooth = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;

/** Stage position and size factor of a point on the water plane (x across, d = distance from the front edge). */
function project(x, d) {
  const s = PERSPECTIVE / (PERSPECTIVE + d * SIN);
  return { x: STAGE.centerX + (x - STAGE.centerX) * s, y: HORIZON_Y + (STAGE.height - HORIZON_Y - d * COS) * s, s };
}
const projectY = (d) => HORIZON_Y + (STAGE.height - HORIZON_Y - d * COS) * (PERSPECTIVE / (PERSPECTIVE + d * SIN));

/** The far end of the plane fades out (the old CSS mask: solid to 55 %, clear at 96 %). */
function depthFade(d) {
  const t = d / PLANE_DEPTH;
  if (t <= 0.55) return 1;
  if (t >= 0.96) return 0;
  return (0.96 - t) / 0.41;
}

/** Left and right water edges at a stage row. */
function canalSpan(y) {
  if (y >= 700) return [0, STAGE.width];
  if (y >= 648) {
    const t = (700 - y) / 52;
    return [lerp(0, 178, t), lerp(1920, 1745, t)];
  }
  const t = Math.min(1, (648 - y) / 240);
  return [lerp(178, 640, t), lerp(1745, 1280, t)];
}

function makeGlowSprite() {
  const sprite = document.createElement('canvas');
  sprite.width = sprite.height = 64;
  const ctx = sprite.getContext('2d');
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  return sprite;
}

/** The sun-glitter path: sparkles that twinkle, larger when closer (same seed and timings as before). */
function makeGlitter() {
  const random = seeded(7);
  const glitter = [];
  for (let i = 0; i < GLITTER_COUNT; i += 1) {
    const depth = Math.pow(random(), 0.8);                 // 0 = horizon, 1 = front
    const y = HORIZON_Y + 20 + depth * (STAGE.height - HORIZON_Y - 20);
    const spread = 40 + depth * 260;
    const x = STAGE.centerX + (random() * 2 - 1) * spread;
    const width = 14 + depth * 46;
    const cycleMs = 1800 + random() * 2600;
    const delayMs = -random() * 4000;
    glitter.push({ x, y, width, cycleMs, delayMs });
  }
  return glitter;
}

/** Twinkle keyframes: dark until 55 %, flash at 68 %, gone by 82 %. Returns [opacity, scale, degrees]. */
function twinkle(phase) {
  if (phase < 0.55) return [0, 0.4, 0];
  if (phase < 0.68) { const t = smooth((phase - 0.55) / 0.13); return [t, lerp(0.4, 1, t), lerp(0, 22, t)]; }
  if (phase < 0.82) { const t = smooth((phase - 0.68) / 0.14); return [1 - t, lerp(1, 0.6, t), lerp(22, 40, t)]; }
  const t = smooth((phase - 0.82) / 0.18);
  return [0, lerp(0.6, 0.4, t), lerp(40, 0, t)];
}

export function buildEnvironment({ waterLayer }) {
  const canvas = document.createElement('canvas');
  canvas.className = 'water-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  waterLayer.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  const glow = makeGlowSprite();
  const glitter = makeGlitter();
  const sparkle = new Image();
  sparkle.src = 'assets/images/fx/sparkle-cluster.png';
  let resolution = 0;
  let lastDraw = -Infinity;

  /** Backing store follows the on-screen size of the stage (never above stage resolution). */
  function fitResolution() {
    const stageScale = Math.min(window.innerWidth / STAGE.width, window.innerHeight / STAGE.height);
    const next = Math.round(Math.min(1, Math.max(0.5, stageScale * (window.devicePixelRatio || 1))) * 20) / 20;
    if (next === resolution) return;
    resolution = next;
    canvas.width = Math.round(STAGE.width * resolution);
    canvas.height = Math.round(HEIGHT * resolution);
    lastDraw = -Infinity;
  }

  function drawRipples(layer, now) {
    const f = (now % layer.cycleMs) / layer.cycleMs;
    const offsetX = layer.originX + layer.driftX * f;
    const offsetY = layer.originY + layer.driftY * f;
    for (const [rx, ry, cx, cy, alpha] of layer.glints) {
      // Plane-local row of this glint for tile row j: py = cy + j * tileH + offsetY; d = depth - py.
      const jMin = Math.ceil((PLANE_DEPTH * 0.04 - cy - offsetY - ry) / layer.tileH);
      const jMax = Math.floor((PLANE_DEPTH + ry - cy - offsetY) / layer.tileH);
      for (let j = jMin; j <= jMax; j += 1) {
        const d = PLANE_DEPTH - (cy + j * layer.tileH + offsetY);
        const fade = depthFade(d);
        if (fade <= 0) continue;
        const { y, s } = project(STAGE.centerX, d);
        const [left, right] = canalSpan(y);
        const xMin = STAGE.centerX + (left - STAGE.centerX) / s - rx;
        const xMax = STAGE.centerX + (right - STAGE.centerX) / s + rx;
        const yFar = projectY(d + ry);
        const yNear = projectY(Math.max(0, d - ry));
        const w = 2 * rx * s;
        const h = Math.max(0.35, yNear - yFar);
        ctx.globalAlpha = alpha * fade * layer.opacity;
        const iMin = Math.ceil((xMin - cx - offsetX) / layer.tileW);
        const iMax = Math.floor((xMax - cx - offsetX) / layer.tileW);
        for (let i = iMin; i <= iMax; i += 1) {
          const x = STAGE.centerX + (cx + i * layer.tileW + offsetX - STAGE.centerX) * s;
          ctx.drawImage(glow, x - w / 2, yFar, w, h);
        }
      }
    }
  }

  function drawCrests(now) {
    const f = (now % CRESTS.cycleMs) / CRESTS.cycleMs;
    const offsetY = CRESTS.originY + CRESTS.period * f;
    const kMin = Math.ceil((-offsetY - CRESTS.peak - CRESTS.halfWidth) / CRESTS.period);
    const kMax = Math.floor((PLANE_DEPTH - offsetY - CRESTS.peak + CRESTS.halfWidth) / CRESTS.period);
    for (let k = kMin; k <= kMax; k += 1) {
      const d = PLANE_DEPTH - (CRESTS.peak + k * CRESTS.period + offsetY);
      const fade = depthFade(d);
      if (fade <= 0) continue;
      const yFar = projectY(d + CRESTS.halfWidth);
      const yNear = projectY(Math.max(0, d - CRESTS.halfWidth));
      const yPeak = projectY(Math.max(0, d));
      if (yNear - yFar < 0.5) continue;
      const gradient = ctx.createLinearGradient(0, yFar, 0, yNear);
      const mid = Math.min(0.999, Math.max(0.001, (yPeak - yFar) / (yNear - yFar)));
      gradient.addColorStop(0, 'rgba(255, 255, 255, 0)');
      gradient.addColorStop(mid, `rgba(255, 255, 255, ${CRESTS.alpha})`);
      gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.globalAlpha = fade;
      ctx.fillStyle = gradient;
      ctx.fillRect(0, yFar, STAGE.width, yNear - yFar);
    }
  }

  /** A slow light sheen sliding across, like sun on a moving surface. */
  function drawSheen(now) {
    const phase = (now % 8000) / 8000;
    const travel = smooth(phase);
    const width = STAGE.width * 0.4;
    const left = -width + travel * width * 3.5;
    const opacity = phase < 0.2 ? smooth(phase / 0.2) : phase > 0.8 ? 1 - smooth((phase - 0.8) / 0.2) : 1;
    if (opacity <= 0) return;
    const top = 400;
    const height = 680;
    const cx = left + width / 2;
    const cy = top + height / 2;
    const dx = Math.sin((100 * Math.PI) / 180);
    const dy = -Math.cos((100 * Math.PI) / 180);
    const half = (Math.abs(width * dx) + Math.abs(height * dy)) / 2;
    const gradient = ctx.createLinearGradient(cx - dx * half, cy - dy * half, cx + dx * half, cy + dy * half);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0)');
    gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.2)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.globalAlpha = opacity;
    ctx.fillStyle = gradient;
    ctx.fillRect(left, top, width, height);
  }

  function drawGlitter(now) {
    if (!sparkle.complete || !sparkle.naturalWidth) return;
    const aspect = sparkle.naturalHeight / sparkle.naturalWidth;
    for (const glint of glitter) {
      const phase = (((now - glint.delayMs) % glint.cycleMs) + glint.cycleMs) % glint.cycleMs / glint.cycleMs;
      const [opacity, scale, degrees] = twinkle(phase);
      if (opacity <= 0.01) continue;
      const w = glint.width * scale;
      const h = w * aspect;
      ctx.save();
      ctx.globalAlpha = opacity;
      ctx.translate(glint.x, glint.y);
      ctx.rotate((degrees * Math.PI) / 180);
      ctx.drawImage(sparkle, -w / 2, -h / 2, w, h);
      ctx.restore();
    }
  }

  function draw(now) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(resolution, 0, 0, resolution, 0, -TOP * resolution);
    ctx.save();
    ctx.beginPath();
    CANAL.forEach(([x, y], index) => (index ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.clip();
    for (const layer of RIPPLES) drawRipples(layer, now);
    drawCrests(now);
    drawSheen(now);
    drawGlitter(now);
    ctx.restore();
  }

  function frame(now) {
    if (now - lastDraw >= FRAME_MS - 2) {
      lastDraw = now;
      draw(now);
    }
    requestAnimationFrame(frame);
  }

  fitResolution();
  window.addEventListener('resize', fitResolution);
  if (prefersReducedMotion()) {
    // Still water: one frame, redrawn only when the canvas is resized.
    const still = () => draw(2600);
    sparkle.addEventListener('load', still);
    window.addEventListener('resize', () => requestAnimationFrame(still));
    still();
  } else {
    requestAnimationFrame(frame);
  }
}
