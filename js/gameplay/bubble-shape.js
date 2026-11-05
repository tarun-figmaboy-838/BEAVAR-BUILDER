/**
 * Speech-bubble outline, drawn for whatever box the words need (after the Polygon game's bubble):
 * a rounded body and one swept tail that leans toward the speaker, so the tail never stretches or
 * smears the way a stretched picture would.
 *
 * Proportions: corner radius ~26 px, tail base ~20 % of the body width (never wider than 0.8 of
 * its length), tail length ~17 % of the body height (56..96 px), tip off to the leaning side.
 */
export const BUBBLE = Object.freeze({
  stroke: 6,
  radius: 28,
  tailBase: 0.2,
  tailBaseMax: 120,
  tailLen: 0.3,
  tailLenMin: 52,
  tailLenMax: 84,
});

const lim = (v, a, b) => (v < a ? a : v > b ? b : v);
const f = (n) => (Math.round(n * 10) / 10).toString();

/**
 * Path for a body of w x h with a tail hanging off the bottom edge.
 * tail.at: where the tail leaves the bottom edge (0..1 of the width); tail.lean: -1 tip left, +1 right.
 * Returns { d, tailLen, tip: [x, y] } in the bubble's own pixels.
 */
export function bubblePath(w, h, tail = { at: 0.15, lean: -1 }) {
  const s = BUBBLE.stroke;
  const r = Math.max(18, Math.min(BUBBLE.radius, w * 0.08, h * 0.3));
  const x0 = s / 2;
  const y0 = s / 2;
  const x1 = w - s / 2;
  const y1 = h - s / 2;
  const L = lim(h * BUBBLE.tailLen, BUBBLE.tailLenMin, BUBBLE.tailLenMax);
  const bw = Math.min(BUBBLE.tailBaseMax, w * BUBBLE.tailBase, L * 0.8);
  const lean = tail.lean < 0 ? -1 : 1;
  const cx = lim(tail.at * w, r + bw / 2 + 6, w - r - bw / 2 - 6);
  const b0 = cx - bw / 2;
  const b1 = cx + bw / 2;
  const tipX = cx + lean * bw * 0.62;
  const tipY = y1 + L;
  let d = `M${f(x0 + r)} ${f(y0)} H${f(x1 - r)} A${f(r)} ${f(r)} 0 0 1 ${f(x1)} ${f(y0 + r)} `
    + `V${f(y1 - r)} A${f(r)} ${f(r)} 0 0 1 ${f(x1 - r)} ${f(y1)} `;
  // Two curves, as in the reference: the outer edge sweeps from the far base corner to the tip,
  // the inner edge climbs back more steeply, which gives the tail its belly.
  if (lean < 0) {
    d += `H${f(b1)} C${f(b1 - bw * 0.08)} ${f(y1 + L * 0.62)}, ${f(tipX + bw * 0.34)} ${f(tipY - L * 0.28)}, ${f(tipX)} ${f(tipY)} `
      + `C${f(tipX + bw * 0.06)} ${f(tipY - L * 0.5)}, ${f(b0 + bw * 0.1)} ${f(y1 + L * 0.3)}, ${f(b0)} ${f(y1)} `;
  } else {
    d += `H${f(b1)} C${f(b1 - bw * 0.1)} ${f(y1 + L * 0.3)}, ${f(tipX - bw * 0.06)} ${f(tipY - L * 0.5)}, ${f(tipX)} ${f(tipY)} `
      + `C${f(tipX - bw * 0.34)} ${f(tipY - L * 0.28)}, ${f(b0 + bw * 0.08)} ${f(y1 + L * 0.62)}, ${f(b0)} ${f(y1)} `;
  }
  d += `H${f(x0 + r)} A${f(r)} ${f(r)} 0 0 1 ${f(x0)} ${f(y1 - r)} V${f(y0 + r)} A${f(r)} ${f(r)} 0 0 1 ${f(x0 + r)} ${f(y0)} Z`;
  return { d, tailLen: L, tip: [tipX, tipY] };
}

/** Sizes the bubble's SVG layer to the box the words decided and draws the outline. Returns the tip. */
export function fitBubble(svg, box, tail) {
  const w = Math.max(60, Math.round(box.offsetWidth));
  const h = Math.max(40, Math.round(box.offsetHeight));
  const { d, tailLen, tip } = bubblePath(w, h, tail);
  svg.setAttribute('viewBox', `0 0 ${w} ${h + tailLen}`);
  svg.style.width = `${w}px`;
  svg.style.height = `${h + tailLen}px`;
  svg.querySelectorAll('path').forEach((path) => path.setAttribute('d', d));
  return tip;
}
