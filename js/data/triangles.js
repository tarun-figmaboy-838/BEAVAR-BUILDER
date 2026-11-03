/**
 * The option frames. Each task's correct frame is an exact small copy (a similar triangle) of the
 * bridge panel it fits (same shape, same orientation, only smaller), so after the drop it only grows
 * in place. Vertices are computed from the bridge geometry, in stage px at option size, first vertex =
 * the top corner the claw grabs. The maths tests classify these same numbers.
 *
 * `marks` are the PDF option cards' notation (pages 11-17), derived from the geometry:
 * tick marks for the side tasks, angle arcs and the right-angle square for the angle tasks.
 * They are not drawn (SHOW_PDF_MARKS = false): the frames read as plain steel girders, by request.
 */
import { BRIDGE_GEOMETRY, stageById } from './bridge-geometry.js';
import { LEVELS, OPTION_GROUPS } from './levels.js';

export const SHOW_PDF_MARKS = false;

const OPTION_BOX = Object.freeze({ width: 300, height: 210 });
const EQUAL_TOLERANCE = 0.06;
const RIGHT_TOLERANCE_DEG = 1;

const length = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

function cornerAngles(points) {
  return points.map((vertex, i) => {
    const a = points[(i + 1) % 3];
    const b = points[(i + 2) % 3];
    const u = [a[0] - vertex[0], a[1] - vertex[1]];
    const v = [b[0] - vertex[0], b[1] - vertex[1]];
    return (Math.acos((u[0] * v[0] + u[1] * v[1]) / (Math.hypot(...u) * Math.hypot(...v))) * 180) / Math.PI;
  });
}

/**
 * Turn a panel into its option frame: the very same shape and orientation, only smaller, so after the
 * drop it can grow into place without turning or changing shape.
 */
function frameFromPanel(points) {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const scale = Math.min(OPTION_BOX.width / (Math.max(...xs) - Math.min(...xs)), OPTION_BOX.height / (Math.max(...ys) - Math.min(...ys)));
  const placed = points.map(([x, y]) => [Math.round((x - Math.min(...xs)) * scale * 100) / 100, Math.round((y - Math.min(...ys)) * scale * 100) / 100]);
  // top corner first (ties: the leftmost), keeping the winding
  const topIndex = placed.reduce((best, p, i) => (p[1] < placed[best][1] - 0.01 || (Math.abs(p[1] - placed[best][1]) <= 0.01 && p[0] < placed[best][0]) ? i : best), 0);
  return [0, 1, 2].map((k) => placed[(topIndex + k) % 3]);
}

function marksFor(id, vertices) {
  if (OPTION_GROUPS.sides.includes(id)) {
    const sides = [0, 1, 2].map((i) => length(vertices[i], vertices[(i + 1) % 3]));
    const same = (a, b) => Math.abs(a - b) / Math.max(a, b) <= EQUAL_TOLERANCE;
    if (same(sides[0], sides[1]) && same(sides[1], sides[2])) return { ticks: [2, 2, 2] };
    const pair = [[0, 1], [1, 2], [0, 2]].find(([i, j]) => same(sides[i], sides[j]));
    if (pair) return { ticks: sides.map((_, i) => (pair.includes(i) ? 1 : 0)) };
    const rank = [...sides].sort((a, b) => a - b);
    return { ticks: sides.map((side) => rank.indexOf(side) + 1) };
  }
  const angles = cornerAngles(vertices);
  const square = angles.findIndex((a) => Math.abs(a - 90) <= RIGHT_TOLERANCE_DEG);
  return square >= 0 ? { square } : { arcs: [0, 1, 2] };
}

function panelFor(id) {
  const level = LEVELS.find((l) => l.correctTriangleId === id);
  const stage = level && stageById(level.bridgeStage);
  return stage ? stage.panels[0].map((name) => BRIDGE_GEOMETRY.nodes[name]) : null;
}

const ALL_IDS = [...OPTION_GROUPS.sides, ...OPTION_GROUPS.angles];

export const TRIANGLES = Object.freeze(Object.fromEntries(ALL_IDS.map((id) => {
  const panel = panelFor(id);
  const vertices = frameFromPanel(panel);
  return [id, Object.freeze({ id, vertices, marks: Object.freeze(marksFor(id, vertices)) })];
})));

/** Decorative frames lying in the yard during the intro screens (PDF p4-6 show five frames). */
export const INTRO_PILE = Object.freeze(['scalene', 'acute', 'right', 'isosceles', 'equilateral']);
