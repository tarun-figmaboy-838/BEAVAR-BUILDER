/**
 * The bridge's steel, drawn with painted art (assets/images/kit), not flat vector strokes:
 *   - a beam is a painted bar sliced in three (left end with its bolt, a middle that stretches to any
 *     length, right end with its bolt), laid along the member, so every beam keeps round ends and an
 *     undistorted bolt sitting on each joint, whatever its length or angle;
 *   - a joint is a painted hexagonal steel plate with bolts.
 * Yellow box beams carry the outer frame and the triangle frames; navy bars are the inner members.
 * The member's exact geometry (node to node) is unchanged, so every triangle is still exactly its type.
 */
export const SVG_NS = 'http://www.w3.org/2000/svg';

/** Beam art: slice heights and widths in art px; boltAt is the bolt's centre, measured from the beam's end. */
const BEAMS = Object.freeze({
  yellow: { l: 'assets/images/kit/beam-yellow-l.png', m: 'assets/images/kit/beam-yellow-m.png', r: 'assets/images/kit/beam-yellow-r.png', h: 140, capL: 130, capR: 130, boltAt: 72, scale: 1.25 },
  navy: { l: 'assets/images/kit/beam-navy-l.png', m: 'assets/images/kit/beam-navy-m.png', r: 'assets/images/kit/beam-navy-r.png', h: 100, capL: 116, capR: 116, boltAt: 53, scale: 1.1 },
});
// The plate art is 240 x 220 inside a 14 px clear margin (268 x 248), so its outline is never cut at the edge.
const JOINT = Object.freeze({ src: 'assets/images/kit/joint-plate.png', width: 268, height: 248, plate: 240 });

export const STEEL_IMAGES = [...Object.values(BEAMS).flatMap((b) => [b.l, b.m, b.r]), JOINT.src];

/** Which painted bar a palette uses (kept as names so callers did not change). */
export const TUBE_PALETTES = Object.freeze({ paint: 'yellow', navy: 'navy', steel: 'navy' });

export function svgElement(name, attributes = {}) {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  return element;
}

function image(href) {
  const element = svgElement('image', { preserveAspectRatio: 'none' });
  element.setAttribute('href', href);
  return element;
}

/** Lay the beam's three slices along the member from (x1, y1) to (x2, y2). */
function placeBeam(tube, x1, y1, x2, y2) {
  const art = BEAMS[tube.art];
  const length = Math.hypot(x2 - x1, y2 - y1) || 1;
  const angle = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
  const h = tube.width * art.scale;
  const s = h / art.h;
  const overhang = art.boltAt * s;                       // the bolt sits on the joint
  const capL = art.capL * s;
  const capR = art.capR * s;
  const total = length + overhang * 2;
  const middle = Math.max(0.5, total - capL - capR);
  const [left, mid, right] = tube.images;
  const y = (-h / 2).toFixed(2);
  const set = (el, x, w) => {
    el.setAttribute('x', x.toFixed(2));
    el.setAttribute('y', y);
    el.setAttribute('width', w.toFixed(2));
    el.setAttribute('height', h.toFixed(2));
  };
  set(left, -overhang, capL);
  set(mid, -overhang + capL - 0.4, middle + 0.8);         // a hair of overlap: no seam between slices
  set(right, -overhang + capL + middle, capR);
  tube.place.setAttribute('transform', `translate(${x1.toFixed(1)} ${y1.toFixed(1)}) rotate(${angle.toFixed(2)})`);
  tube.length = length;
}

/**
 * Returns { group, length }. With `drawable`, the beam is drawn in from its start end when its member
 * gets `.is-built` (gameplay.css: .member .tube__draw).
 */
export function createTube(x1, y1, x2, y2, { width = 16, palette = TUBE_PALETTES.paint, className = '', drawable = false } = {}) {
  const art = BEAMS[palette] ? palette : 'yellow';
  const group = svgElement('g', { class: `tube tube--${art} ${className}`.trim() });
  const place = svgElement('g', { class: 'tube__place' });
  const draw = svgElement('g', { class: drawable ? 'tube__draw' : 'tube__body' });
  const images = [image(BEAMS[art].l), image(BEAMS[art].m), image(BEAMS[art].r)];
  draw.append(...images);
  place.appendChild(draw);
  group.appendChild(place);
  const tube = { group, place, images, art, width, length: 0 };
  placeBeam(tube, x1, y1, x2, y2);
  return tube;
}

/** Move an existing beam's ends (used while a frame flies into the bridge). */
export function moveTube(tube, x1, y1, x2, y2) {
  placeBeam(tube, x1, y1, x2, y2);
}

/** Kept for the SVGs that add it once; the painted joints need no gradients. */
export function gussetDefs() {
  return svgElement('defs');
}

/** A joint: the painted hexagonal steel plate with bolts, centred on (x, y). */
export function createGusset(x, y, { radius = 17 } = {}) {
  const group = svgElement('g', { class: 'truss-node' });
  const w = (radius * 2.3 * JOINT.width) / JOINT.plate;
  const h = (radius * 2.3 * JOINT.height) / JOINT.plate;
  const plate = svgElement('image', { class: 'truss-node__plate', x: (x - w / 2).toFixed(1), y: (y - h / 2).toFixed(1), width: w.toFixed(1), height: h.toFixed(1) });
  plate.setAttribute('href', JOINT.src);
  group.appendChild(plate);
  group.appendChild(svgElement('g', { class: 'truss-node__rivets' }));
  return group;
}
