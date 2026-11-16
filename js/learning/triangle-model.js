/**
 * Pure triangle maths for the Triangle Workshop (the learning section).
 *
 * Vertices live in canvas px; 1 cm of the lesson is PX_PER_CM px, so every length and angle on
 * screen is computed from the drawn shape, never typed in. Nothing here touches the DOM, so the
 * same functions run under JavaScriptCore in tests/learning-model.test.js.
 *
 * Vertex order is A (apex), B (base left), C (base right). Side i joins vertex i and vertex i + 1,
 * so sides are [AB, BC, CA] and angles are [at A, at B, at C], as the PDF labels them.
 */
export const PX_PER_CM = 92;
const MIN_VERTEX_GAP_CM = 1.6;      // two corners never come closer than this
export const MIN_ALTITUDE_CM = 1.1;        // a dragged corner never comes closer than this to the opposite side
const MIN_ANGLE_DEG = 10;           // no needle-thin triangles
export const SNAP_RADIUS_PX = 10;          // a corner this close to an equality / right-angle locus snaps onto it
const EQUAL_CM_TOLERANCE = 0.03;    // after a snap the sides are equal to the pixel; this absorbs float noise
const RIGHT_DEG_TOLERANCE = 0.49;   // an angle that rounds to 90° on screen is a right angle
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const mul = (a, k) => [a[0] * k, a[1] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
const length = (a) => Math.hypot(a[0], a[1]);
const dist = (a, b) => length(sub(a, b));
const unit = (a) => {
  const l = length(a) || 1;
  return [a[0] / l, a[1] / l];
};
/** Left-hand normal of a direction vector. */
const perp = (a) => [-a[1], a[0]];
const others = (index) => [(index + 1) % 3, (index + 2) % 3];

export const vec = Object.freeze({ sub, add, mul, dot, cross, length, dist, unit, perp });

/** [AB, BC, CA] in px. */
function sideLengthsPx(vertices) {
  return [0, 1, 2].map((i) => dist(vertices[i], vertices[(i + 1) % 3]));
}

/** The angle at each vertex, in degrees. */
function anglesDeg(vertices) {
  return vertices.map((vertex, index) => {
    const [j, k] = others(index);
    const u = sub(vertices[j], vertex);
    const v = sub(vertices[k], vertex);
    const cosine = dot(u, v) / ((length(u) * length(v)) || 1);
    return (Math.acos(Math.min(1, Math.max(-1, cosine))) * 180) / Math.PI;
  });
}

const nearlyEqualCm = (a, b) => Math.abs(a - b) <= EQUAL_CM_TOLERANCE;

/** 'equilateral' | 'isosceles' (exactly two equal sides) | 'scalene', from side lengths in cm. */
export function classifyBySides(cm) {
  const pairs = [nearlyEqualCm(cm[0], cm[1]), nearlyEqualCm(cm[1], cm[2]), nearlyEqualCm(cm[2], cm[0])].filter(Boolean).length;
  if (pairs >= 2) return 'equilateral';
  if (pairs === 1) return 'isosceles';
  return 'scalene';
}

/** 'right' | 'obtuse' | 'acute', from angles in degrees. */
export function classifyByAngles(deg) {
  const largest = Math.max(...deg);
  if (Math.abs(largest - 90) <= RIGHT_DEG_TOLERANCE) return 'right';
  if (largest > 90) return 'obtuse';
  return 'acute';
}

const EQUAL_DEG_TOLERANCE = 0.05;

/**
 * The angles as shown, in whole degrees, as a learner checks them: they always add up to 180, equal angles
 * (an isosceles triangle's base angles) always show the same number, a right angle is 90 and nothing else
 * is. Of the whole-degree sets that keep those rules, the one closest to the true angles is shown.
 */
export function displayDegrees(deg) {
  const near = (d) => [Math.floor(d) - 1, Math.floor(d), Math.ceil(d), Math.ceil(d) + 1];
  const options = deg.map((d) => (Math.abs(d - 90) <= RIGHT_DEG_TOLERANCE ? [90] : [...new Set(near(d))].filter((v) => v > 0 && v !== 90)));
  const pairs = [[0, 1], [1, 2], [0, 2]].filter(([i, j]) => Math.abs(deg[i] - deg[j]) < EQUAL_DEG_TOLERANCE);
  let best = null;
  for (const a of options[0]) for (const b of options[1]) for (const c of options[2]) {
    const shown = [a, b, c];
    if (a + b + c !== 180 || pairs.some(([i, j]) => shown[i] !== shown[j])) continue;
    const errors = shown.map((v, i) => Math.abs(v - deg[i]));
    const cost = errors.reduce((sum, e) => sum + e, 0) + Math.max(...errors) * 0.01;
    if (!best || cost < best.cost) best = { shown, cost };
  }
  return best ? best.shown : deg.map(Math.round);
}

/** Everything the lesson shows about a triangle, computed from its corners. */
export function measure(vertices, pxPerCm = PX_PER_CM) {
  const px = sideLengthsPx(vertices);
  const cm = px.map((value) => value / pxPerCm);
  const deg = anglesDeg(vertices);
  const equalSides = cm.map((value, i) => others(i).some((j) => nearlyEqualCm(value, cm[j])));
  const rightAt = deg.findIndex((value) => Math.abs(value - 90) <= RIGHT_DEG_TOLERANCE);
  const obtuseAt = deg.findIndex((value) => value > 90 + RIGHT_DEG_TOLERANCE);
  return {
    px, cm, deg, equalSides, rightAt, obtuseAt,
    // Lengths as shown: sides the lesson counts as equal (and ticks) always read the same number.
    shownCm: cm.map((value, i) => {
      const group = [i, ...others(i).filter((j) => nearlyEqualCm(value, cm[j]))];
      return formatCm(group.reduce((sum, k) => sum + cm[k], 0) / group.length);
    }),
    shownDeg: displayDegrees(deg),
    bySides: classifyBySides(cm),
    byAngles: classifyByAngles(deg),
  };
}

/** "5 cm" or "4.9 cm": one decimal, dropped when it is zero. */
export function formatCm(cm) {
  const rounded = Math.round(cm * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)} cm`;
}

export function formatDeg(deg) {
  return `${Math.round(deg)}°`;
}

/* ---------- Building a triangle from a lesson spec ---------- */

/**
 * Corner positions in cm with y up, B at the origin and C on the x axis, from one of:
 *   { sides: [AB, BC, CA] }        lengths in cm (the PDF's left / bottom / right labels)
 *   { angles: [A, B, C], base }    degrees, with BC = base cm
 *   { pts: [[x, y], [x, y], [x, y]] }  explicit cm coordinates
 */
export function cmPointsFromSpec(spec) {
  if (spec.pts) return spec.pts.map((p) => [p[0], p[1]]);
  if (spec.angles) {
    const [A, B, C] = spec.angles.map((d) => (d * Math.PI) / 180);
    const base = spec.base ?? 6;
    const ab = (base * Math.sin(C)) / Math.sin(A);
    return [[ab * Math.cos(B), ab * Math.sin(B)], [0, 0], [base, 0]];
  }
  const [ab, bc, ca] = spec.sides;
  // Law of cosines at B gives A's position above the base.
  const cosB = Math.min(1, Math.max(-1, (ab * ab + bc * bc - ca * ca) / (2 * ab * bc)));
  const angleB = Math.acos(cosB);
  return [[ab * Math.cos(angleB), ab * Math.sin(angleB)], [0, 0], [bc, 0]];
}

/**
 * Place a spec on the canvas at PX_PER_CM: the shape's bounding box is centred on (cx, cy), or stands
 * on `baseY` when that is given instead. Canvas y runs down, so cm y is flipped.
 */
export function layoutFromSpec(spec, { cx, cy = null, baseY = null, pxPerCm = PX_PER_CM }) {
  const pts = cmPointsFromSpec(spec);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const midX = (Math.min(...xs) + Math.max(...xs)) / 2;
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const bottom = baseY ?? (cy + ((maxY - minY) * pxPerCm) / 2);
  return pts.map(([x, y]) => [cx + (x - midX) * pxPerCm, bottom - (y - minY) * pxPerCm]);
}

/* ---------- Keeping a dragged triangle usable ---------- */

export function isValidTriangle(vertices, bounds = null) {
  const px = sideLengthsPx(vertices);
  if (px.some((value) => value < MIN_VERTEX_GAP_CM * PX_PER_CM)) return false;
  if (anglesDeg(vertices).some((value) => value < MIN_ANGLE_DEG)) return false;
  if (bounds && vertices.some(([x, y]) => x < bounds.left || x > bounds.right || y < bounds.top || y > bounds.bottom)) return false;
  return true;
}

function clampToBounds(point, bounds) {
  if (!bounds) return point;
  return [Math.min(bounds.right, Math.max(bounds.left, point[0])), Math.min(bounds.bottom, Math.max(bounds.top, point[1]))];
}

/**
 * Where corner `index` may go for a wanted position: inside the bounds, never through the opposite
 * side (the triangle keeps its orientation), never too close to the other corners, never needle-thin.
 * The corner slides along a limit rather than sticking, except in the rare cases a bisection resolves.
 */
export function constrainVertex(index, wanted, vertices, bounds) {
  const [j, k] = others(index);
  const a = vertices[j];
  const b = vertices[k];
  const n = unit(perp(sub(b, a)));
  const side = Math.sign(dot(sub(vertices[index], a), n)) || 1;
  const minAltitude = MIN_ALTITUDE_CM * PX_PER_CM;
  const minGap = MIN_VERTEX_GAP_CM * PX_PER_CM;
  let point = clampToBounds(wanted, bounds);
  for (let pass = 0; pass < 2; pass += 1) {
    const altitude = dot(sub(point, a), n) * side;
    if (altitude < minAltitude) point = add(point, mul(n, (minAltitude - altitude) * side));
    for (const fixed of [a, b]) {
      const gap = dist(point, fixed);
      if (gap < minGap) {
        const away = gap < 1e-6 ? mul(n, side) : unit(sub(point, fixed));
        point = add(fixed, mul(away, minGap));
      }
    }
    point = clampToBounds(point, bounds);
  }
  const candidate = vertices.map((v, i) => (i === index ? point : v));
  if (isValidTriangle(candidate, bounds)) return point;
  // Rare (a needle angle at a fixed corner): the furthest valid point between where it was and where it wants to be.
  let lo = 0;
  let hi = 1;
  const from = vertices[index];
  for (let step = 0; step < 8; step += 1) {
    const mid = (lo + hi) / 2;
    const test = add(from, mul(sub(point, from), mid));
    if (isValidTriangle(vertices.map((v, i) => (i === index ? test : v)), bounds)) lo = mid;
    else hi = mid;
  }
  return add(from, mul(sub(point, from), lo));
}

/* ---------- Magnetic snapping onto the lesson's goal ---------- */

const projectOntoLine = (p, origin, direction) => add(origin, mul(direction, dot(sub(p, origin), direction)));
const projectOntoCircle = (p, centre, radius, fallbackDirection) => {
  const away = sub(p, centre);
  return add(centre, mul(length(away) < 1e-6 ? fallbackDirection : unit(away), radius));
};

/**
 * Candidate positions for corner `index` that make the goal true, given the other two corners:
 *   isosceles        the perpendicular bisector of AB (VA = VB), the circles VA = AB and VB = AB
 *   equilateral      the apex of the equilateral triangle on AB (same side as the corner)
 *   right            the circle on diameter AB (90° at V), the perpendiculars at A and B (90° there)
 *   rightIsosceles   the six points where both hold, plus the loci above as partial help
 * Points are returned before loci so an exact solution wins over a partial one.
 */
function snapCandidates(goal, index, vertices, wanted) {
  const [j, k] = others(index);
  const a = vertices[j];
  const b = vertices[k];
  const ab = sub(b, a);
  const l = length(ab);
  const direction = unit(ab);
  const n = perp(direction);
  const m = mul(add(a, b), 0.5);
  const side = Math.sign(dot(sub(wanted, a), n)) || 1;
  const points = [];
  const loci = [];
  const addLine = (kind, origin) => loci.push({ kind, point: projectOntoLine(wanted, origin, n) });
  const addCircle = (kind, centre, radius) => loci.push({ kind, point: projectOntoCircle(wanted, centre, radius, mul(n, side)) });
  if (goal === 'isosceles' || goal === 'rightIsosceles') {
    addLine('equal', m);
    addCircle('equal', a, l);
    addCircle('equal', b, l);
  }
  if (goal === 'equilateral') {
    points.push({ kind: 'equilateral', point: add(m, mul(n, (Math.sqrt(3) / 2) * l * side)) });
  }
  if (goal === 'right' || goal === 'rightIsosceles') {
    addCircle('right', m, l / 2);
    addLine('right', a);
    addLine('right', b);
  }
  if (goal === 'rightIsosceles') {
    points.push(
      { kind: 'rightIsosceles', point: add(m, mul(n, (l / 2) * side)) },
      { kind: 'rightIsosceles', point: add(a, mul(n, l * side)) },
      { kind: 'rightIsosceles', point: add(b, mul(n, l * side)) },
    );
  }
  return { points, loci };
}

/**
 * The position the corner takes for a wanted position: an exact goal point when one is within reach
 * (a wider magnet), else the nearest partial locus within SNAP_RADIUS_PX, else the wanted point itself.
 * Returns { point, snapped } where snapped names what it snapped to, or null.
 */
export function snapVertex(goal, index, wanted, vertices, radius = SNAP_RADIUS_PX) {
  if (!goal) return { point: wanted, snapped: null };
  const { points, loci } = snapCandidates(goal, index, vertices, wanted);
  const nearest = (list, reach) => {
    let best = null;
    for (const candidate of list) {
      const d = dist(candidate.point, wanted);
      if (d <= reach && (!best || d < best.d)) best = { ...candidate, d };
    }
    return best;
  };
  const exact = nearest(points, radius * 1.6);
  if (exact) return { point: exact.point, snapped: exact.kind };
  const partial = nearest(loci, radius);
  if (partial) return { point: partial.point, snapped: partial.kind };
  return { point: wanted, snapped: null };
}

/** True when the measured triangle satisfies the drag screen's goal. */
export function goalMet(goal, measured) {
  switch (goal) {
    case 'isosceles': return measured.bySides === 'isosceles';
    case 'equilateral': return measured.bySides === 'equilateral';
    case 'right': return measured.byAngles === 'right';
    case 'obtuse': return measured.byAngles === 'obtuse';
    case 'rightIsosceles': return measured.bySides === 'isosceles' && measured.byAngles === 'right';
    default: return false;
  }
}

/**
 * One position for corner `index` that satisfies the goal (used by the QA play-through and by the
 * late hint's ghost arrow): of the exact goal positions, the usable one nearest to where the corner is.
 */
export function solutionFor(goal, index, vertices, bounds = null) {
  const [j, k] = others(index);
  const a = vertices[j];
  const b = vertices[k];
  const ab = sub(b, a);
  const l = length(ab);
  const direction = unit(ab);
  const n = perp(direction);
  const m = mul(add(a, b), 0.5);
  const current = vertices[index];
  const side = Math.sign(dot(sub(current, a), n)) || 1;
  const up = mul(n, side);
  const candidates = [];
  if (goal === 'isosceles') {
    // On the bisector at the corner's own height (never the equilateral apex), or VA = AB / VB = AB.
    const onBisector = projectOntoLine(current, m, n);
    const apex = add(m, mul(up, (Math.sqrt(3) / 2) * l));
    candidates.push(dist(onBisector, apex) < 12 ? add(m, mul(up, dot(sub(onBisector, m), up) * 0.8)) : onBisector);
    candidates.push(add(m, mul(up, l * 0.55)), add(m, mul(up, l * 1.1)));
    for (const [centre, awayFrom] of [[a, b], [b, a]]) {
      const towards = unit(add(mul(unit(sub(centre, awayFrom)), 0.35), up));
      candidates.push(add(centre, mul(towards, l)));
    }
  } else if (goal === 'equilateral') {
    candidates.push(add(m, mul(up, (Math.sqrt(3) / 2) * l)));
  } else if (goal === 'right') {
    candidates.push(add(m, mul(up, l / 2)), add(a, mul(up, l * 0.75)), add(b, mul(up, l * 0.75)));
  } else if (goal === 'obtuse') {
    candidates.push(add(m, mul(up, l * 0.28)), add(m, mul(up, l * 0.22)));
  } else if (goal === 'rightIsosceles') {
    candidates.push(add(m, mul(up, l / 2)), add(a, mul(up, l)), add(b, mul(up, l)));
  } else {
    return current;
  }
  const usable = candidates.filter((point) => {
    const trial = vertices.map((v, i) => (i === index ? point : v));
    return isValidTriangle(trial, bounds) && goalMet(goal, measure(trial.map((v, i) => (i === index ? snapVertex(goal, index, point, vertices).point : v))));
  });
  const pool = usable.length ? usable : candidates;
  return pool.reduce((best, point) => (dist(point, current) < dist(best, current) ? point : best), pool[0]);
}
