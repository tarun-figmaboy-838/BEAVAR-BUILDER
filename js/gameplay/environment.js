import { prefersReducedMotion } from '../core/motion.js';
import { STAGE } from '../data/layout.js';

/**
 * Living water over the painted canal: a ground plane in true perspective whose ripple glints and
 * wave crests drift toward the viewer, a slow sun sheen, and a twinkling sun-glitter path.
 *
 * The plane is drawn by the GPU (WebGL): one quad, one small shader, two tiny ripple textures, so the
 * main thread does almost nothing per frame on laptops, tablets and phones alike. (A CSS 3D version
 * needed ~150 megapixels of layers and crashed iPhone Safari; a 2D-canvas version cost the CPU
 * thousands of draw calls a frame.) Without WebGL the plane falls back to a lighter 2D canvas.
 * The glitter sparkles are plain images animated by the compositor.
 */
const HORIZON_Y = 405;                    // where the canal meets the sky in the background art
const TOP = HORIZON_Y;                    // canvas top, stage px
const HEIGHT = STAGE.height - TOP;
const PERSPECTIVE = 520;
const TILT = (80 * Math.PI) / 180;
const SIN = Math.sin(TILT);
const COS = Math.cos(TILT);
const PLANE_DEPTH = 2600;                 // the plane's length into the distance
const GLITTER_COUNT = 34;
const TEXTURE_W = 512;
const TEXTURE_H = 256;
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
const SHEEN = { cycleMs: 8000, width: STAGE.width * 0.4, top: 400, height: 680, alpha: 0.2 };

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
const cycle = (now, ms) => (now % ms) / ms;

/** Time-dependent placement shared by both renderers. */
function frameState(now) {
  const ripples = RIPPLES.map((layer) => {
    const f = cycle(now, layer.cycleMs);
    return { offsetX: layer.originX + layer.driftX * f, offsetY: layer.originY + layer.driftY * f };
  });
  const crestOffset = CRESTS.originY + CRESTS.period * cycle(now, CRESTS.cycleMs);
  const phase = cycle(now, SHEEN.cycleMs);
  const sheenLeft = -SHEEN.width + smooth(phase) * SHEEN.width * 3.5;
  const sheenOpacity = phase < 0.2 ? smooth(phase / 0.2) : phase > 0.8 ? 1 - smooth((phase - 0.8) / 0.2) : 1;
  return { ripples, crestOffset, sheenLeft, sheenOpacity };
}

/** One ripple tile drawn into a power-of-two texture (alpha = glint strength), wrapping at the edges. */
function makeRippleTexture(layer) {
  const canvas = document.createElement('canvas');
  canvas.width = TEXTURE_W;
  canvas.height = TEXTURE_H;
  const ctx = canvas.getContext('2d');
  const sx = TEXTURE_W / layer.tileW;
  const sy = TEXTURE_H / layer.tileH;
  for (const [rx, ry, cx, cy, alpha] of layer.glints) {
    for (const ox of [-TEXTURE_W, 0, TEXTURE_W]) {
      for (const oy of [-TEXTURE_H, 0, TEXTURE_H]) {
        ctx.save();
        ctx.translate(cx * sx + ox, cy * sy + oy);
        ctx.scale(rx * sx, ry * sy);
        const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
        gradient.addColorStop(0, `rgba(255, 255, 255, ${alpha * layer.opacity})`);
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(-1, -1, 2, 2);
        ctx.restore();
      }
    }
  }
  return canvas;
}

const VERTEX_SHADER = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FRAGMENT_SHADER = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform float uCanvasH;     // canvas height, device px
uniform float uRes;         // canvas px per stage px
uniform sampler2D uTexA;
uniform sampler2D uTexB;
uniform vec4 uRipA;         // offsetX, offsetY, tileW, tileH
uniform vec4 uRipB;
uniform float uCrest;       // crest offset
uniform vec2 uSheen;        // left, opacity
const float H = ${HORIZON_Y.toFixed(1)};
const float B = ${(STAGE.height - HORIZON_Y).toFixed(1)};
const float P = ${PERSPECTIVE.toFixed(1)};
const float SINT = ${SIN.toFixed(6)};
const float COST = ${COS.toFixed(6)};
const float DEPTH = ${PLANE_DEPTH.toFixed(1)};

void main() {
  float x = gl_FragCoord.x / uRes;
  float y = ${TOP.toFixed(1)} + (uCanvasH - gl_FragCoord.y) / uRes;
  // Canal outline: banks converge on the horizon (soft one-pixel edge).
  float l; float r;
  if (y >= 700.0) { l = 0.0; r = 1920.0; }
  else if (y >= 648.0) { float t = (700.0 - y) / 52.0; l = mix(0.0, 178.0, t); r = mix(1920.0, 1745.0, t); }
  else { float t = min(1.0, (648.0 - y) / 240.0); l = mix(178.0, 640.0, t); r = mix(1745.0, 1280.0, t); }
  float inside = clamp(min(x - l, r - x) * uRes + 0.5, 0.0, 1.0) * step(408.0, y);
  // Screen row -> distance along the water plane (inverse perspective).
  float dy = y - H;
  float d = P * (B - dy) / (dy * SINT + P * COST);
  float s = P / (P + d * SINT);
  float X = 960.0 + (x - 960.0) / s;
  float py = DEPTH - d;
  float k = d / DEPTH;
  float fade = k <= 0.55 ? 1.0 : clamp((0.96 - k) / 0.41, 0.0, 1.0);
  float a1 = texture2D(uTexA, vec2((X - uRipA.x) / uRipA.z, (py - uRipA.y) / uRipA.w)).a * fade;
  float a2 = texture2D(uTexB, vec2((X - uRipB.x) / uRipB.z, (py - uRipB.y) / uRipB.w)).a * fade;
  float cp = mod(py - uCrest, ${CRESTS.period.toFixed(1)});
  float crest = ${CRESTS.alpha.toFixed(2)} * max(0.0, 1.0 - abs(cp - ${CRESTS.peak.toFixed(1)}) / ${CRESTS.halfWidth.toFixed(1)}) * fade;
  // Sun sheen: a soft band sliding across at 100deg.
  float sheen = 0.0;
  if (x >= uSheen.x && x <= uSheen.x + ${SHEEN.width.toFixed(1)} && y >= ${SHEEN.top.toFixed(1)}) {
    vec2 c = vec2(uSheen.x + ${(SHEEN.width / 2).toFixed(1)}, ${(SHEEN.top + SHEEN.height / 2).toFixed(1)});
    vec2 dir = vec2(${Math.sin((100 * Math.PI) / 180).toFixed(6)}, ${(-Math.cos((100 * Math.PI) / 180)).toFixed(6)});
    float halfLen = ${((SHEEN.width * Math.sin((100 * Math.PI) / 180) + SHEEN.height * Math.abs(Math.cos((100 * Math.PI) / 180))) / 2).toFixed(2)};
    sheen = ${SHEEN.alpha.toFixed(2)} * max(0.0, 1.0 - abs(dot(vec2(x, y) - c, dir)) / halfLen) * uSheen.y;
  }
  float a = (1.0 - (1.0 - a1) * (1.0 - a2) * (1.0 - crest) * (1.0 - sheen)) * inside;
  gl_FragColor = vec4(a, a, a, a);
}`;

/** WebGL renderer; returns null when WebGL is unavailable or software-only. */
function createGlRenderer(canvas) {
  const options = { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, failIfMajorPerformanceCaveat: true, powerPreference: 'low-power' };
  let gl = null;
  try {
    gl = canvas.getContext('webgl', options) || canvas.getContext('experimental-webgl', options);
  } catch {
    gl = null;
  }
  if (!gl) return null;
  let program = null;
  let uniforms = null;
  let lost = false;

  function compile(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) || 'shader compile failed');
    return shader;
  }

  function texture(unit, source) {
    const tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    const aniso = gl.getExtension('EXT_texture_filter_anisotropic') || gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic');
    if (aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
  }

  function init() {
    program = gl.createProgram();
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX_SHADER));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT_SHADER));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || 'link failed');
    gl.useProgram(program);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'aPos');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    texture(0, makeRippleTexture(RIPPLES[0]));
    texture(1, makeRippleTexture(RIPPLES[1]));
    const at = (name) => gl.getUniformLocation(program, name);
    uniforms = { canvasH: at('uCanvasH'), res: at('uRes'), texA: at('uTexA'), texB: at('uTexB'), ripA: at('uRipA'), ripB: at('uRipB'), crest: at('uCrest'), sheen: at('uSheen') };
    gl.uniform1i(uniforms.texA, 0);
    gl.uniform1i(uniforms.texB, 1);
    gl.clearColor(0, 0, 0, 0);
  }

  try {
    init();
  } catch (error) {
    console.warn('[water] WebGL unavailable, using the 2D fallback:', error.message);
    return null;
  }
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    lost = true;
  });
  canvas.addEventListener('webglcontextrestored', () => {
    try {
      init();
      lost = false;
    } catch {
      lost = true;
    }
  });

  return {
    kind: 'webgl',
    draw(now, resolution) {
      if (lost) return;
      const state = frameState(now);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform1f(uniforms.canvasH, canvas.height);
      gl.uniform1f(uniforms.res, resolution);
      const [a, b] = state.ripples;
      gl.uniform4f(uniforms.ripA, a.offsetX, a.offsetY, RIPPLES[0].tileW, RIPPLES[0].tileH);
      gl.uniform4f(uniforms.ripB, b.offsetX, b.offsetY, RIPPLES[1].tileW, RIPPLES[1].tileH);
      gl.uniform1f(uniforms.crest, state.crestOffset);
      gl.uniform2f(uniforms.sheen, state.sheenLeft, state.sheenOpacity);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
  };
}

/** Fallback without WebGL: the same plane on a 2D canvas, with the faint far glints skipped. */
function create2dRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const glow = document.createElement('canvas');
  glow.width = glow.height = 64;
  const g = glow.getContext('2d');
  const gradient = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
  g.fillStyle = gradient;
  g.fillRect(0, 0, 64, 64);

  const projectY = (d) => HORIZON_Y + (STAGE.height - HORIZON_Y - d * COS) * (PERSPECTIVE / (PERSPECTIVE + d * SIN));
  const depthFade = (d) => {
    const t = d / PLANE_DEPTH;
    return t <= 0.55 ? 1 : t >= 0.96 ? 0 : (0.96 - t) / 0.41;
  };
  const canalSpan = (y) => {
    if (y >= 700) return [0, STAGE.width];
    if (y >= 648) {
      const t = (700 - y) / 52;
      return [lerp(0, 178, t), lerp(1920, 1745, t)];
    }
    const t = Math.min(1, (648 - y) / 240);
    return [lerp(178, 640, t), lerp(1745, 1280, t)];
  };

  return {
    kind: '2d',
    draw(now, resolution) {
      const state = frameState(now);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(resolution, 0, 0, resolution, 0, -TOP * resolution);
      ctx.save();
      ctx.beginPath();
      CANAL.forEach(([x, y], index) => (index ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      ctx.clip();
      RIPPLES.forEach((layer, index) => {
        const { offsetX, offsetY } = state.ripples[index];
        for (const [rx, ry, cx, cy, alpha] of layer.glints) {
          const jMin = Math.ceil((PLANE_DEPTH * 0.04 - cy - offsetY - ry) / layer.tileH);
          const jMax = Math.floor((PLANE_DEPTH + ry - cy - offsetY) / layer.tileH);
          for (let j = jMin; j <= jMax; j += 1) {
            const d = PLANE_DEPTH - (cy + j * layer.tileH + offsetY);
            const strength = alpha * depthFade(d) * layer.opacity;
            if (strength < 0.03) continue;
            const s = PERSPECTIVE / (PERSPECTIVE + d * SIN);
            const y = projectY(d);
            const w = 2 * rx * s;
            const yFar = projectY(d + ry);
            const h = Math.max(0.35, projectY(Math.max(0, d - ry)) - yFar);
            if (w * h < 1.2) continue;
            const [left, right] = canalSpan(y);
            const xMin = STAGE.centerX + (left - STAGE.centerX) / s - rx;
            const xMax = STAGE.centerX + (right - STAGE.centerX) / s + rx;
            ctx.globalAlpha = strength;
            for (let i = Math.ceil((xMin - cx - offsetX) / layer.tileW), iMax = Math.floor((xMax - cx - offsetX) / layer.tileW); i <= iMax; i += 1) {
              const x = STAGE.centerX + (cx + i * layer.tileW + offsetX - STAGE.centerX) * s;
              ctx.drawImage(glow, x - w / 2, yFar, w, h);
            }
          }
        }
      });
      ctx.restore();
    },
  };
}

/** The sun-glitter path: sparkles that twinkle, larger when closer; animated by the compositor (CSS). */
function buildGlitter(waterLayer) {
  const holder = document.createElement('div');
  holder.className = 'water-glitter motion-ambient';
  const random = seeded(7);
  for (let i = 0; i < GLITTER_COUNT; i += 1) {
    const depth = Math.pow(random(), 0.8);                 // 0 = horizon, 1 = front
    const y = HORIZON_Y + 20 + depth * (STAGE.height - HORIZON_Y - 20);
    const spread = 40 + depth * 260;
    const x = STAGE.centerX + (random() * 2 - 1) * spread;
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
    holder.appendChild(glint);
  }
  waterLayer.appendChild(holder);
}

export function buildEnvironment({ waterLayer }) {
  const makeCanvas = () => {
    const element = document.createElement('canvas');
    element.className = 'water-canvas';
    element.setAttribute('aria-hidden', 'true');
    return element;
  };
  let canvas = makeCanvas();
  waterLayer.appendChild(canvas);
  buildGlitter(waterLayer);
  let resolution = 0;

  /** Backing store follows the on-screen size of the stage (never above stage resolution). */
  function fitResolution() {
    const stageScale = Math.min(window.innerWidth / STAGE.width, window.innerHeight / STAGE.height);
    const next = Math.round(Math.min(1, Math.max(0.5, stageScale * (window.devicePixelRatio || 1))) * 20) / 20;
    if (next === resolution) return false;
    resolution = next;
    canvas.width = Math.round(STAGE.width * resolution);
    canvas.height = Math.round(HEIGHT * resolution);
    return true;
  }
  fitResolution();

  let renderer = createGlRenderer(canvas);
  if (!renderer) {
    // A canvas that was asked for WebGL cannot give a 2D context: swap in a fresh one.
    const fresh = makeCanvas();
    fresh.width = canvas.width;
    fresh.height = canvas.height;
    canvas.replaceWith(fresh);
    canvas = fresh;
    renderer = create2dRenderer(canvas);
  }
  // The GPU path redraws every frame (capped at 60 fps); the 2D fallback runs at 30 fps.
  const frameMs = renderer.kind === 'webgl' ? 1000 / 60 : 1000 / 30;
  let lastDraw = -Infinity;

  if (prefersReducedMotion()) {
    const still = () => renderer.draw(2600, resolution);
    window.addEventListener('resize', () => fitResolution() && requestAnimationFrame(still));
    still();
    return;
  }
  window.addEventListener('resize', () => {
    if (fitResolution()) lastDraw = -Infinity;
  });
  const frame = (now) => {
    if (!document.hidden && now - lastDraw >= frameMs - 2) {
      lastDraw = now;
      renderer.draw(now, resolution);
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
