/**
 * Pure geometry used by the maths QA tests and the debug overlay.
 * Tolerances reflect construction-frame silhouettes, not ideal line drawings.
 */
export const EQUAL_SIDE_TOLERANCE = 0.06; // 6% length difference still counts as equal
export const RIGHT_ANGLE_TOLERANCE = 6;   // degrees either side of 90°

function distance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

export function sideLengths(vertices) {
  const [a, b, c] = vertices;
  return [distance(a, b), distance(b, c), distance(c, a)];
}

export function angles(vertices) {
  return vertices.map((vertex, index) => {
    const prev = vertices[(index + 2) % 3];
    const next = vertices[(index + 1) % 3];
    const toPrev = [prev[0] - vertex[0], prev[1] - vertex[1]];
    const toNext = [next[0] - vertex[0], next[1] - vertex[1]];
    const cosine = (toPrev[0] * toNext[0] + toPrev[1] * toNext[1]) / (Math.hypot(...toPrev) * Math.hypot(...toNext));
    return (Math.acos(Math.min(1, Math.max(-1, cosine))) * 180) / Math.PI;
  });
}

function nearlyEqual(a, b, tolerance = EQUAL_SIDE_TOLERANCE) {
  return Math.abs(a - b) / Math.max(a, b) <= tolerance;
}

export function countEqualSidePairs(vertices) {
  const [ab, bc, ca] = sideLengths(vertices);
  return [nearlyEqual(ab, bc), nearlyEqual(bc, ca), nearlyEqual(ca, ab)].filter(Boolean).length;
}

/** 'equilateral' | 'isosceles' | 'scalene' */
export function classifyBySides(vertices) {
  const pairs = countEqualSidePairs(vertices);
  if (pairs === 3) return 'equilateral';
  if (pairs >= 1) return 'isosceles';
  return 'scalene';
}

/** 'right' | 'obtuse' | 'acute' */
export function classifyByAngles(vertices) {
  const largest = Math.max(...angles(vertices));
  if (Math.abs(largest - 90) <= RIGHT_ANGLE_TOLERANCE) return 'right';
  if (largest > 90 + RIGHT_ANGLE_TOLERANCE) return 'obtuse';
  return 'acute';
}

/** Instruction rules, keyed by `rule` in levels.js. Each returns true when the frame satisfies the task. */
export const RULES = Object.freeze({
  exactlyTwoEqualSides: (vertices) => classifyBySides(vertices) === 'isosceles',
  equilateral: (vertices) => classifyBySides(vertices) === 'equilateral',
  allSidesDifferent: (vertices) => classifyBySides(vertices) === 'scalene',
  acute: (vertices) => classifyByAngles(vertices) === 'acute',
  rightAngle: (vertices) => classifyByAngles(vertices) === 'right',
  obtuseAngle: (vertices) => classifyByAngles(vertices) === 'obtuse',
});
