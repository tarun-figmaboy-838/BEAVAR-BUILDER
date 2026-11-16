/**
 * Shared SVG geometry for the workshop's triangles (the live canvas and the static figures):
 * where a side label sits, a corner's frame, arc and right-angle paths, tick marks, value colours.
 * Pure functions over canvas px.
 */
import { vec } from './triangle-model.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const ARC_RADIUS = 38;
const SQUARE_SIZE = 24;
const TICK_HALF = 12;
const SIDE_LABEL_GAP = 38;

export function svgEl(name, attributes = {}, children = []) {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) {
    if (value !== undefined && value !== null) element.setAttribute(key, String(value));
  }
  for (const child of children) element.appendChild(child);
  return element;
}

export const fmt = (n) => (Math.round(n * 10) / 10).toString();

/** The normal of side i that points away from the triangle. */
export function outwardNormal(vertices, i) {
  const a = vertices[i];
  const b = vertices[(i + 1) % 3];
  const c = vertices[(i + 2) % 3];
  const mid = vec.mul(vec.add(a, b), 0.5);
  let n = vec.perp(vec.unit(vec.sub(b, a)));
  if (vec.dot(n, vec.sub(c, mid)) > 0) n = vec.mul(n, -1);
  return n;
}

function sideMidpoint(vertices, i) {
  return vec.mul(vec.add(vertices[i], vertices[(i + 1) % 3]), 0.5);
}

/** Where side i's measurement tag goes: just outside the middle of the side. */
export function sideLabelPoint(vertices, i, gap = SIDE_LABEL_GAP) {
  return vec.add(sideMidpoint(vertices, i), vec.mul(outwardNormal(vertices, i), gap));
}

/** Unit vectors from vertex i along its two sides, and the angle between them in radians. */
export function cornerFrame(vertices, i) {
  const u = vec.unit(vec.sub(vertices[(i + 1) % 3], vertices[i]));
  const w = vec.unit(vec.sub(vertices[(i + 2) % 3], vertices[i]));
  const theta = Math.acos(Math.min(1, Math.max(-1, vec.dot(u, w))));
  return { u, w, theta, bisector: vec.unit(vec.add(u, w)) };
}

/** Arc of radius r inside corner i, optionally only the first `fraction` of the angle (drawing it in). */
export function arcPath(vertices, i, radius = ARC_RADIUS, fraction = 1) {
  const { u, w, theta } = cornerFrame(vertices, i);
  const v = vertices[i];
  const sign = vec.cross(u, w) > 0 ? 1 : -1;
  const angle = theta * fraction;
  const end = [u[0] * Math.cos(angle) - sign * u[1] * Math.sin(angle), sign * u[0] * Math.sin(angle) + u[1] * Math.cos(angle)];
  const start = vec.add(v, vec.mul(u, radius));
  const stop = vec.add(v, vec.mul(end, radius));
  return `M ${fmt(start[0])} ${fmt(start[1])} A ${radius} ${radius} 0 0 ${sign > 0 ? 1 : 0} ${fmt(stop[0])} ${fmt(stop[1])}`;
}

export function squarePoints(vertices, i, size = SQUARE_SIZE) {
  const { u, w } = cornerFrame(vertices, i);
  const v = vertices[i];
  const p = vec.add(v, vec.mul(u, size));
  const q = vec.add(vec.add(v, vec.mul(u, size)), vec.mul(w, size));
  const r = vec.add(v, vec.mul(w, size));
  return [p, q, r].map((pt) => `${fmt(pt[0])},${fmt(pt[1])}`).join(' ');
}

/** A short line across the middle of side i (an "equal sides" tick). */
export function tickSegment(vertices, i, half = TICK_HALF, offset = 0) {
  const direction = vec.unit(vec.sub(vertices[(i + 1) % 3], vertices[i]));
  const n = vec.perp(direction);
  const centre = vec.add(sideMidpoint(vertices, i), vec.mul(direction, offset));
  const p = vec.add(centre, vec.mul(n, half));
  const q = vec.sub(centre, vec.mul(n, half));
  return { x1: fmt(p[0]), y1: fmt(p[1]), x2: fmt(q[0]), y2: fmt(q[1]) };
}

export function centroid(vertices) {
  return [(vertices[0][0] + vertices[1][0] + vertices[2][0]) / 3, (vertices[0][1] + vertices[1][1] + vertices[2][1]) / 3];
}

/** Colour groups by value: equal values (as shown) share an index, different values get the next one. */
export function valueHues(labels) {
  const seen = [];
  return labels.map((label) => { let k = seen.indexOf(label); if (k < 0) { seen.push(label); k = seen.length - 1; } return k; });
}
