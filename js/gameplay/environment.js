import { prefersReducedMotion } from '../core/motion.js';
import { STAGE } from '../data/layout.js';
import { WATER_TEXTURE } from '../data/water-texture.js';

/**
 * Moving water: the backdrop's own painted canal water, rippled and flowing on the GPU (WebGL).
 *
 * Nothing is drawn on top of the painting: a shader re-samples the painted water band with
 *  - gentle travelling ripples, strongest close to the viewer and calm toward the horizon (true perspective),
 *  - a slow flow toward the viewer, two phases cross-faded so the loop never jumps,
 * and fades to the untouched painting at the banks, the quay blocks and the far end, so walls,
 * reflections' edges and the bridge stay perfectly still. Without WebGL (or with reduced motion)
 * the painted water simply stays as it is.
 */
const HORIZON_Y = 566;                    // where the water meets the far shore in the backdrop
const BAND_TOP = WATER_TEXTURE.top;       // canvas top, stage px
const BAND_HEIGHT = STAGE.height - BAND_TOP;
const RIPPLE_PX = 12;                      // ripple displacement close to the viewer
const FLOW_PX = 64;                        // flow distance per cycle close to the viewer
const FLOW_CYCLE_S = 4.2;

/** The water's edges in the backdrop, as [y, x] from the far end to the front (measured on the painting). */
const LEFT_BANK = [[568, 930], [582, 900], [590, 800], [601, 700], [615, 600], [630, 500], [647, 400], [664, 300], [672, 212], [745, 212], [746, 0]];
const RIGHT_BANK = [[568, 1000], [576, 1070], [582, 1170], [595, 1270], [615, 1370], [635, 1470], [652, 1570], [667, 1670], [672, 1702], [745, 1702], [746, 1920]];
const QUAY_BLOCK_BOTTOM = 745;            // the stone blocks either side meet the water here
const QUAY_BLOCK_INNER = [212, 1702];

const VERTEX_SHADER = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FRAGMENT_SHADER = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D uTex;
uniform float uCanvasH;   // canvas height, device px
uniform float uRes;       // canvas px per stage px
uniform float uTime;      // seconds
uniform vec2 uLeft[${LEFT_BANK.length}];
uniform vec2 uRight[${RIGHT_BANK.length}];
const float H = ${HORIZON_Y.toFixed(1)};
const float TOP = ${BAND_TOP.toFixed(2)};
const float BAND = ${(WATER_TEXTURE.height).toFixed(2)};
const float N = ${LEFT_BANK.length - 1}.0;

vec3 painted(vec2 p) {
  vec2 uv = vec2(p.x / ${STAGE.width.toFixed(1)}, (p.y - TOP) / BAND);
  return texture2D(uTex, clamp(uv, vec2(0.001), vec2(0.999))).rgb;
}

void main() {
  float x = gl_FragCoord.x / uRes;
  float y = TOP + (uCanvasH - gl_FragCoord.y) / uRes;
  // Bank edges on this row.
  float L = 1e5;
  float R = -1e5;
  for (int i = 0; i < ${LEFT_BANK.length - 1}; i++) {
    if (y >= uLeft[i].x && y < uLeft[i + 1].x) L = mix(uLeft[i].y, uLeft[i + 1].y, (y - uLeft[i].x) / (uLeft[i + 1].x - uLeft[i].x));
    if (y >= uRight[i].x && y < uRight[i + 1].x) R = mix(uRight[i].y, uRight[i + 1].y, (y - uRight[i].x) / (uRight[i + 1].x - uRight[i].x));
  }
  if (y >= uLeft[${LEFT_BANK.length - 1}].x) L = uLeft[${LEFT_BANK.length - 1}].y;
  if (y >= uRight[${RIGHT_BANK.length - 1}].x) R = uRight[${RIGHT_BANK.length - 1}].y;
  float edge = min(x - L, R - x);
  float underBlock = (x < ${QUAY_BLOCK_INNER[0].toFixed(1)} || x > ${QUAY_BLOCK_INNER[1].toFixed(1)}) ? y - ${QUAY_BLOCK_BOTTOM.toFixed(1)} : 1e5;
  edge = min(edge, underBlock);
  // A strip of untouched painting along the banks, fading in: no shifted copy of the bank edge (it showed as dashes).
  float alpha = smoothstep(6.0, 34.0, edge);
  if (alpha <= 0.0) { gl_FragColor = vec4(0.0); return; }

  // Perspective: s is 0 at the horizon and 1 at the bottom of the screen.
  float s = clamp((y - H) / (${STAGE.height.toFixed(1)} - H), 0.0, 1.0);
  float calm = smoothstep(14.0, 70.0, edge) * smoothstep(0.0, 0.08, s);
  float z = 1.0 / max(s, 0.03);              // depth along the canal
  float wx = (x - 960.0) * z;                // across the canal, in front-row px
  float t = uTime;

  // Ripples: waves rolling toward the viewer, a cross swell, and fine chop.
  float w1 = sin(z * 2.4 - t * 2.0 + sin(wx * 0.0019 + t * 0.35) * 1.7);
  float w2 = sin(z * 5.6 + wx * 0.0034 - t * 2.8);
  float w3 = sin(wx * 0.0058 - z * 1.4 + t * 1.6);
  vec2 ripple = vec2(w3 * 0.65 + w2 * 0.35, w1 * 0.7 + w2 * 0.3) * (${RIPPLE_PX.toFixed(2)} * s * calm);

  // Flow toward the viewer: two phases half a cycle apart, cross-faded, so the loop is seamless.
  float p0 = fract(t / ${FLOW_CYCLE_S.toFixed(2)});
  float p1 = fract(p0 + 0.5);
  float flow = ${FLOW_PX.toFixed(1)} * s * s * calm;
  vec3 c0 = painted(vec2(x, y) + ripple - vec2(0.0, flow * (p0 - 0.5)));
  vec3 c1 = painted(vec2(x, y) + ripple - vec2(0.0, flow * (p1 - 0.5)));
  vec3 color = mix(c1, c0, 1.0 - abs(2.0 * p0 - 1.0));
  // Light catching the wave faces.
  // Light moving on the painted water: wave faces brighten and darken, and catch the sun where waves cross.
  color *= 1.0 + (0.1 * w1 + 0.05 * w2) * s * calm;
  color += vec3(0.16) * smoothstep(0.86, 1.0, w1 * 0.6 + w2 * 0.4) * s * calm;
  gl_FragColor = vec4(color * alpha, alpha);
}`;

function createWaterRenderer(canvas, image) {
  const options = { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, failIfMajorPerformanceCaveat: true, powerPreference: 'low-power' };
  let gl = null;
  try {
    gl = canvas.getContext('webgl', options) || canvas.getContext('experimental-webgl', options);
  } catch {
    gl = null;
  }
  if (!gl) return null;
  let uniforms = null;
  let lost = false;

  function compile(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) || 'shader compile failed');
    return shader;
  }

  /** Power-of-two copy of the water band so it can be mipmapped (crisp at every screen size). */
  function uploadTexture() {
    const pot = document.createElement('canvas');
    pot.width = 2048;
    pot.height = 512;
    pot.getContext('2d').drawImage(image, 0, 0, pot.width, pot.height);
    const texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, pot);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  }

  function init() {
    const program = gl.createProgram();
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX_SHADER));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT_SHADER));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || 'link failed');
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'aPos');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    uploadTexture();
    const at = (name) => gl.getUniformLocation(program, name);
    uniforms = { canvasH: at('uCanvasH'), res: at('uRes'), time: at('uTime') };
    gl.uniform1i(at('uTex'), 0);
    gl.uniform2fv(at('uLeft'), new Float32Array(LEFT_BANK.flat()));
    gl.uniform2fv(at('uRight'), new Float32Array(RIGHT_BANK.flat()));
    gl.clearColor(0, 0, 0, 0);
  }

  try {
    init();
  } catch (error) {
    console.warn('[water] moving water unavailable, the painted water stays still:', error.message);
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
    draw(now, resolution) {
      if (lost) return;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform1f(uniforms.canvasH, canvas.height);
      gl.uniform1f(uniforms.res, resolution);
      gl.uniform1f(uniforms.time, (now / 1000) % 3600);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
  };
}

export function buildEnvironment({ waterLayer }) {
  if (prefersReducedMotion()) return; // the painted water stays still
  const canvas = document.createElement('canvas');
  canvas.className = 'water-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.top = `${BAND_TOP}px`;
  canvas.style.height = `${BAND_HEIGHT}px`;
  waterLayer.appendChild(canvas);
  let resolution = 0;

  /** Backing store follows the on-screen size of the stage (never above stage resolution). */
  function fitResolution() {
    const stageScale = Math.min(window.innerWidth / STAGE.width, window.innerHeight / STAGE.height);
    const next = Math.round(Math.min(1, Math.max(0.5, stageScale * (window.devicePixelRatio || 1))) * 20) / 20;
    if (next === resolution) return;
    resolution = next;
    canvas.width = Math.round(STAGE.width * resolution);
    canvas.height = Math.round(BAND_HEIGHT * resolution);
  }

  const image = new Image();
  image.decoding = 'async';
  image.addEventListener('load', () => {
    fitResolution();
    const renderer = createWaterRenderer(canvas, image);
    if (!renderer) {
      canvas.remove();
      return;
    }
    window.addEventListener('resize', fitResolution);
    let lastDraw = -Infinity;
    const frame = (now) => {
      if (!document.hidden && now - lastDraw >= 1000 / 60 - 2) {
        lastDraw = now;
        renderer.draw(now, resolution);
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
  image.src = WATER_TEXTURE.src;
}
