/**
 * Riveted steel girders in SVG (the bridge's members and the triangle frames): a dark outline, the
 * painted web, a shaded lower flange, a lit upper flange with a bright edge, and a row of rivet heads
 * down the middle; offsets follow the member's normal so light always comes from the upper left.
 */
export const SVG_NS = 'http://www.w3.org/2000/svg';

export const TUBE_PALETTES = Object.freeze({
  steel: Object.freeze({ rim: '#272e38', body: '#6c7786', shade: '#48515d', light: '#a9b4c1', spec: '#eef2f6', rivet: '#2f353e', rivetShine: '#d5dce4' }),
  paint: Object.freeze({ rim: '#5f3f00', body: '#e6a300', shade: '#a86c00', light: '#ffc933', spec: '#fff4c4', rivet: '#7a4e00', rivetShine: '#ffe7a0' }),
  /** Navy structural steel for the bridge's inner bars (the yellow box beams carry the outer frame). */
  navy: Object.freeze({ rim: '#16203a', body: '#3d5283', shade: '#28375c', light: '#6a83bb', spec: '#c4d3f3', rivet: '#16203a', rivetShine: '#9db2df' }),
});

export function svgElement(name, attributes = {}) {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  return element;
}

/** Light comes from the upper left, so the "lit" normal always points up (or left for vertical tubes). */
function litNormal(dx, dy, length) {
  let nx = -dy / length;
  let ny = dx / length;
  if (ny > 0 || (Math.abs(ny) < 1e-6 && nx > 0)) {
    nx = -nx;
    ny = -ny;
  }
  return [nx, ny];
}

/** `trim` is how far (in member widths) a layer stops short of each joint; `dash` turns a line into a row of dots. */
function tubeLayers(width, palette) {
  const rivetPitch = Math.max(11, width * 0.85);
  return [
    { className: 'tube__rim', color: palette.rim, strokeWidth: width, offset: 0, cap: 'round', trim: 0 },
    { className: 'tube__body', color: palette.body, strokeWidth: width - 5, offset: 0, cap: 'round', trim: 0 },
    { className: 'tube__shade', color: palette.shade, strokeWidth: width * 0.2, offset: -width * 0.26, cap: 'butt', trim: 0.45 },
    { className: 'tube__light', color: palette.light, strokeWidth: width * 0.18, offset: width * 0.26, cap: 'butt', trim: 0.45 },
    { className: 'tube__spec', color: palette.spec, strokeWidth: Math.max(1.2, width * 0.07), offset: width * 0.16, cap: 'butt', trim: 0.45 },
    { className: 'tube__rivets', color: palette.rivet, strokeWidth: width * 0.25, offset: -width * 0.03, cap: 'round', trim: 1.3, dash: `0 ${rivetPitch.toFixed(1)}` },
    { className: 'tube__rivets tube__rivets--shine', color: palette.rivetShine, strokeWidth: width * 0.1, offset: width * 0.03, cap: 'round', trim: 1.3, dash: `0 ${rivetPitch.toFixed(1)}` },
  ];
}

function placeLines(tube, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.hypot(dx, dy) || 1;
  const [nx, ny] = litNormal(dx, dy, length);
  tube.layers.forEach((layer, index) => {
    const trim = Math.min(0.45, (tube.width * layer.trim) / length);
    const ox = nx * layer.offset;
    const oy = ny * layer.offset;
    const line = tube.lines[index];
    line.setAttribute('x1', (x1 + dx * trim + ox).toFixed(1));
    line.setAttribute('y1', (y1 + dy * trim + oy).toFixed(1));
    line.setAttribute('x2', (x2 - dx * trim + ox).toFixed(1));
    line.setAttribute('y2', (y2 - dy * trim + oy).toFixed(1));
  });
  tube.length = length;
}

/**
 * Returns { group, length, lines }. With `drawable`, every line gets a dash pattern so the tube can be
 * "drawn" in by animating stroke-dashoffset (see .member in gameplay.css).
 */
export function createTube(x1, y1, x2, y2, { width = 16, palette = TUBE_PALETTES.steel, className = '', drawable = false } = {}) {
  const layers = tubeLayers(width, palette);
  const group = svgElement('g', { class: `tube ${className}`.trim() });
  const lines = layers.map((layer) => {
    const line = svgElement('line', {
      stroke: layer.color,
      'stroke-width': layer.strokeWidth.toFixed(1),
      'stroke-linecap': layer.cap,
      class: layer.className,
    });
    if (layer.dash) line.setAttribute('stroke-dasharray', layer.dash);
    group.appendChild(line);
    return line;
  });
  const tube = { group, lines, layers, width, length: 0 };
  placeLines(tube, x1, y1, x2, y2);
  if (drawable) {
    const length = tube.length;
    // Rivet rows keep their dot pattern and fade in once the girder is drawn (gameplay.css).
    lines.forEach((line, index) => {
      if (!layers[index].dash) line.setAttribute('stroke-dasharray', `${length.toFixed(1)} ${(length + 80).toFixed(1)}`);
    });
    group.style.setProperty('--hidden-offset', `${(length + 40).toFixed(1)}px`);
  }
  return tube;
}

/** Move an existing tube's ends (used while a frame flies into the bridge). */
export function moveTube(tube, x1, y1, x2, y2) {
  placeLines(tube, x1, y1, x2, y2);
}

/** Shared gradients for frame-style corner plates (add once per SVG). */
export function gussetDefs() {
  const defs = svgElement('defs');
  defs.innerHTML = `
    <linearGradient id="gusset-steel" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#b9c1cc"/><stop offset="0.5" stop-color="#848d99"/><stop offset="1" stop-color="#5d6571"/>
    </linearGradient>
    <radialGradient id="gusset-bolt" cx="0.38" cy="0.32" r="0.7">
      <stop offset="0" stop-color="#ffffff"/><stop offset="0.45" stop-color="#b9c3d0"/><stop offset="1" stop-color="#5d6676"/>
    </radialGradient>`;
  return defs;
}

/** A joint plate: rounded grey steel plate with a steel bolt; rivets once bolted. */
export function createGusset(x, y, { radius = 17 } = {}) {
  const group = svgElement('g', { class: 'truss-node' });
  const points = [];
  for (let i = 0; i < 6; i += 1) {
    const angle = (Math.PI / 3) * i + Math.PI / 6;
    points.push(`${(x + Math.cos(angle) * radius).toFixed(1)},${(y + Math.sin(angle) * radius).toFixed(1)}`);
  }
  group.appendChild(svgElement('polygon', { points: points.join(' '), class: 'truss-node__plate' }));
  group.appendChild(svgElement('circle', { cx: x, cy: y, r: radius - 5, class: 'truss-node__plate-light' }));
  group.appendChild(svgElement('circle', { cx: x, cy: y, r: 7.5, class: 'truss-node__bolt' }));
  const rivets = svgElement('g', { class: 'truss-node__rivets' });
  for (let i = 0; i < 3; i += 1) {
    const angle = (Math.PI * 2 * i) / 3 - Math.PI / 2;
    rivets.appendChild(svgElement('circle', { cx: (x + Math.cos(angle) * 12).toFixed(1), cy: (y + Math.sin(angle) * 12).toFixed(1), r: 2.6, class: 'truss-node__rivet' }));
  }
  group.appendChild(rivets);
  return group;
}
