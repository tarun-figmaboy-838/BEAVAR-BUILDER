/**
 * A static triangle figure (checkpoint cards, sorting cards, the summary):
 * the same geometry as the live canvas, drawn once from a spec and fitted into a box. Side lengths,
 * angles, ticks and the right-angle square are all computed from the shape, never typed in.
 */
import { cmPointsFromSpec, measure, formatDeg, PX_PER_CM } from './triangle-model.js';
import { svgEl, fmt, sideLabelPoint, arcPath, squarePoints, tickSegment, outwardNormal, cornerFrame, valueHues } from './triangle-draw.js';

/**
 * Options: labels 'sides' | 'angles' | null; ticks (equal-side marks); square (right-angle mark); arcs;
 * pad (room around the shape); strokeScale and labelSize (line weight and number size for the card's size).
 */
const MAX_SCALE = PX_PER_CM * 0.78;     // small shapes are never blown up past this

export function buildTriangleFigure(spec, { width = 260, height = 200, labels = null, ticks = false, square = false, arcs = false, pad = 34, strokeScale = 1, labelSize = 19 } = {}) {
  const pts = cmPointsFromSpec(spec);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const spanX = Math.max(...xs) - Math.min(...xs);
  const spanY = Math.max(...ys) - Math.min(...ys);
  const labelPad = labels === 'angles' ? pad + labelSize * 2.6 : labels ? pad + labelSize * 1.6 : pad;   // room for the numbers outside the shape (angle values sit beyond the corners)
  const scale = Math.min(MAX_SCALE, (width - labelPad * 2) / spanX, (height - labelPad * 2) / spanY);
  const midX = (Math.min(...xs) + Math.max(...xs)) / 2;
  const minY = Math.min(...ys);
  const figureHeight = spanY * scale;
  const baseY = height / 2 + figureHeight / 2;
  const vertices = pts.map(([x, y]) => [width / 2 + (x - midX) * scale, baseY - (y - minY) * scale]);
  const m = measure(vertices.map(([x, y]) => [x * (PX_PER_CM / scale), y * (PX_PER_CM / scale)]));   // true cm, whatever the fit
  const svg = svgEl('svg', { class: 'ws-figure', viewBox: `0 0 ${width} ${height}`, width, height, 'aria-hidden': 'true' });
  const sides = svgEl('g', { class: 'ws-figure__sides' });
  for (let i = 0; i < 3; i += 1) {
    const [x1, y1] = vertices[i];
    const [x2, y2] = vertices[(i + 1) % 3];
    const attrs = { x1: fmt(x1), y1: fmt(y1), x2: fmt(x2), y2: fmt(y2) };
    sides.append(svgEl('line', { ...attrs, class: 'ws-figure__edge', style: `stroke-width:${14 * strokeScale}` }), svgEl('line', { ...attrs, class: 'ws-figure__body', style: `stroke-width:${8 * strokeScale}` }));
  }
  // Corner marks go UNDER the sides (a coloured slice rimmed by its arc, as on the big triangle), ticks on top.
  const angleHue = valueHues(m.shownDeg);
  const sideHue = valueHues(m.shownCm);
  const corners = svgEl('g', { class: 'ws-figure__marks' });
  const radius = Math.max(30, 20 * strokeScale + 14);
  for (let i = 0; i < 3; i += 1) {
    const isRight = m.rightAt === i;
    const tint = `ws-corner--${m.obtuseAt === i ? 'obtuse' : angleHue[i]}`;          // each corner its own colour; an obtuse one red
    if (square && isRight) {
      const sq = squarePoints(vertices, i, radius * 0.7).split(' ');
      corners.appendChild(svgEl('path', { d: `M ${fmt(vertices[i][0])} ${fmt(vertices[i][1])} L ${sq.join(' L ')} Z`, class: `ws-figure__wedge ${tint}` }));
      corners.appendChild(svgEl('polyline', { points: sq.join(' '), class: `ws-figure__square ${tint}` }));
    } else if (arcs) {
      const arc = arcPath(vertices, i, radius);
      corners.appendChild(svgEl('path', { d: `M ${fmt(vertices[i][0])} ${fmt(vertices[i][1])} L ${arc.slice(2)} Z`, class: `ws-figure__wedge ${tint}` }));
      corners.appendChild(svgEl('path', { d: arc, class: `ws-figure__arc ${tint}` }));
    }
  }
  svg.append(corners, sides);
  const marks = svgEl('g', { class: 'ws-figure__ticks' });
  if (ticks) {
    m.equalSides.forEach((equal, i) => {
      if (equal) marks.appendChild(svgEl('line', { ...tickSegment(vertices, i, 8), class: 'ws-figure__tick' }));
    });
  }
  svg.appendChild(marks);
  for (let i = 0; i < 3; i += 1) {
    const [x, y] = vertices[i];
    svg.appendChild(svgEl('circle', { cx: fmt(x), cy: fmt(y), r: 8 * strokeScale, class: 'ws-figure__node' }));
  }
  if (labels === 'sides') {
    for (let i = 0; i < 3; i += 1) {
      // Clear of the line and its tick whichever way the side runs: the gap grows by half the text's
      // extent along the side's normal (its width on an upright side, its height on a flat one).
      const text = m.shownCm[i];
      const n = outwardNormal(vertices, i);
      const gap = 6 * strokeScale + 6 + Math.abs(n[0]) * (text.length * labelSize * 0.29) + Math.abs(n[1]) * (labelSize * 0.55);
      const [x, y] = sideLabelPoint(vertices, i, gap);
      svg.appendChild(svgEl('text', { x: fmt(x), y: fmt(y), class: `ws-figure__label ws-figure__label--side ws-sidehue--${sideHue[i]}`, style: `font-size:${labelSize}px` }, [document.createTextNode(text)]));
    }
  }
  if (labels === 'angles') {
    for (let i = 0; i < 3; i += 1) {
      // Outside the corner, straight back along its bisector: on a small card the three values never meet.
      const text = formatDeg(m.shownDeg[i]);
      const { bisector } = cornerFrame(vertices, i);
      const away = 10 * strokeScale + 8 + Math.abs(bisector[0]) * (text.length * labelSize * 0.3) + Math.abs(bisector[1]) * (labelSize * 0.6);
      const [x, y] = [vertices[i][0] - bisector[0] * away, vertices[i][1] - bisector[1] * away];
      svg.appendChild(svgEl('text', { x: fmt(x), y: fmt(y), class: `ws-figure__label ws-figure__label--angle ws-corner--${m.obtuseAt === i ? 'obtuse' : angleHue[i]}`, style: `font-size:${labelSize}px` }, [document.createTextNode(text)]));
    }
  }
  return { svg, vertices, measured: m };
}
