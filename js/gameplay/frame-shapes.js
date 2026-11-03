import { createTube, createGusset, svgElement, TUBE_PALETTES } from './svg-tubes.js';
import { SHOW_PDF_MARKS } from '../data/triangles.js';

/**
 * Builds a triangle frame as SVG from exact vertices: three yellow steel tubes with bolted corner
 * plates (the same parts the bridge is made of) and the PDF's notation marks.
 */
export const FRAME_PAD = 24;   // room around the vertices for tube thickness, plates and shadow
const PAD = FRAME_PAD;
const TUBE_WIDTH = 16;
const INK = '#2a1a05';
const TICK_HALF = 12;     // half-length of a tick mark across the beam
const TICK_GAP = 8;       // spacing between multiple ticks
const ARC_RADIUS = 26;
const SQUARE_SIZE = 22;

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const mul = (a, k) => [a[0] * k, a[1] * k];
const unit = (v) => {
  const length = Math.hypot(v[0], v[1]) || 1;
  return [v[0] / length, v[1] / length];
};

function addTicks(group, a, b, count) {
  if (!count) return;
  const direction = unit(sub(b, a));
  const normal = [-direction[1], direction[0]];
  const middle = mul(add(a, b), 0.5);
  for (let k = 0; k < count; k += 1) {
    const centre = add(middle, mul(direction, (k - (count - 1) / 2) * TICK_GAP));
    const p = add(centre, mul(normal, TICK_HALF));
    const q = sub(centre, mul(normal, TICK_HALF));
    group.appendChild(svgElement('line', { x1: p[0].toFixed(1), y1: p[1].toFixed(1), x2: q[0].toFixed(1), y2: q[1].toFixed(1), class: 'frame__tick' }));
  }
}

function addArc(group, vertex, toA, toB) {
  const u = unit(sub(toA, vertex));
  const v = unit(sub(toB, vertex));
  const start = add(vertex, mul(u, ARC_RADIUS));
  const end = add(vertex, mul(v, ARC_RADIUS));
  const sweep = u[0] * v[1] - u[1] * v[0] > 0 ? 1 : 0;
  group.appendChild(svgElement('path', {
    d: `M ${start[0].toFixed(1)} ${start[1].toFixed(1)} A ${ARC_RADIUS} ${ARC_RADIUS} 0 0 ${sweep} ${end[0].toFixed(1)} ${end[1].toFixed(1)}`,
    class: 'frame__arc',
  }));
}

function addSquare(group, vertex, toA, toB) {
  const u = mul(unit(sub(toA, vertex)), SQUARE_SIZE);
  const v = mul(unit(sub(toB, vertex)), SQUARE_SIZE);
  const corner = add(add(vertex, u), v);
  const points = [add(vertex, u), corner, add(vertex, v)].map((p) => p.map((n) => n.toFixed(1)).join(',')).join(' ');
  group.appendChild(svgElement('polyline', { points, class: 'frame__square' }));
}

/**
 * Returns { svg, width, height, localVertices, centroid, grabX, grabY, baseOffset } in element pixels.
 * `scale` sizes the shape; tube thickness stays constant so every frame matches the bridge beams.
 */
export function buildFrameSvg(definition, { scale = 1, marks = SHOW_PDF_MARKS } = {}) {
  const scaled = definition.vertices.map(([x, y]) => [x * scale, y * scale]);
  const minX = Math.min(...scaled.map((p) => p[0]));
  const minY = Math.min(...scaled.map((p) => p[1]));
  const maxX = Math.max(...scaled.map((p) => p[0]));
  const maxY = Math.max(...scaled.map((p) => p[1]));
  const local = scaled.map(([x, y]) => [x - minX + PAD, y - minY + PAD]);
  const width = Math.round(maxX - minX + PAD * 2);
  const height = Math.round(maxY - minY + PAD * 2);

  const svg = svgElement('svg', { class: 'frame', width, height, viewBox: `0 0 ${width} ${height}`, 'aria-hidden': 'true' });
  for (let i = 0; i < 3; i += 1) {
    const [x1, y1] = local[i];
    const [x2, y2] = local[(i + 1) % 3];
    svg.appendChild(createTube(x1, y1, x2, y2, { width: TUBE_WIDTH, palette: TUBE_PALETTES.paint, className: 'frame__beam' }).group);
  }
  if (marks && definition.marks) {
    const ink = svgElement('g', { class: 'frame__marks', stroke: INK });
    (definition.marks.ticks ?? []).forEach((count, i) => addTicks(ink, local[i], local[(i + 1) % 3], count));
    for (const index of definition.marks.arcs ?? []) addArc(ink, local[index], local[(index + 1) % 3], local[(index + 2) % 3]);
    if (definition.marks.square !== undefined) {
      const index = definition.marks.square;
      addSquare(ink, local[index], local[(index + 1) % 3], local[(index + 2) % 3]);
    }
    svg.appendChild(ink);
  }
  for (const [x, y] of local) {
    const plate = createGusset(x, y, { radius: 13 });
    plate.setAttribute('class', 'truss-node frame__plate is-built is-instant is-bolted');
    svg.appendChild(plate);
  }

  const top = local.reduce((best, p) => (p[1] < best[1] - 0.5 || (Math.abs(p[1] - best[1]) <= 0.5 && p[0] < best[0]) ? p : best), local[0]);
  return {
    svg,
    width,
    height,
    localVertices: local,
    grabX: top[0] / width,
    grabY: top[1],
    centroid: [(local[0][0] + local[1][0] + local[2][0]) / 3, (local[0][1] + local[1][1] + local[2][1]) / 3],
    baseOffset: maxY - minY + PAD,   // element top → the line the frame stands on
  };
}
