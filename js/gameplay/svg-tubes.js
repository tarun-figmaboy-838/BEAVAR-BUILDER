/**
 * 3D-looking steel tubes in SVG: a dark rim, the body, a shaded underside, a lit band and a
 * specular line, offset along the tube's normal so light always comes from the upper left.
 */
export const SVG_NS = 'http://www.w3.org/2000/svg';

export const TUBE_PALETTES = Object.freeze({
  steel: Object.freeze({ rim: '#272e38', body: '#6c7786', shade: '#48515d', light: '#a9b4c1', spec: '#eef2f6' }),
  paint: Object.freeze({ rim: '#5f3f00', body: '#e6a300', shade: '#b47800', light: '#ffcb3a', spec: '#fff4c4' }),
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

function tubeLayers(width, palette) {
  return [
    { className: 'tube__rim', color: palette.rim, strokeWidth: width, offset: 0, cap: 'round', trimmed: false },
    { className: 'tube__body', color: palette.body, strokeWidth: width - 5, offset: 0, cap: 'round', trimmed: false },
    { className: 'tube__shade', color: palette.shade, strokeWidth: width * 0.26, offset: -width * 0.22, cap: 'butt', trimmed: true },
    { className: 'tube__light', color: palette.light, strokeWidth: width * 0.3, offset: width * 0.14, cap: 'butt', trimmed: true },
    { className: 'tube__spec', color: palette.spec, strokeWidth: Math.max(1.5, width * 0.1), offset: width * 0.24, cap: 'butt', trimmed: true },
  ];
}

function placeLines(tube, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.hypot(dx, dy) || 1;
  const [nx, ny] = litNormal(dx, dy, length);
  const inset = Math.min(0.45, (tube.width * 0.45) / length);
  tube.layers.forEach((layer, index) => {
    const trim = layer.trimmed ? inset : 0;
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
    group.appendChild(line);
    return line;
  });
  const tube = { group, lines, layers, width, length: 0 };
  placeLines(tube, x1, y1, x2, y2);
  if (drawable) {
    const length = tube.length;
    lines.forEach((line) => line.setAttribute('stroke-dasharray', `${length.toFixed(1)} ${(length + 80).toFixed(1)}`));
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
      <stop offset="0" stop-color="#ffe98a"/><stop offset="0.45" stop-color="#ffb21e"/><stop offset="1" stop-color="#d47a00"/>
    </radialGradient>`;
  return defs;
}

/** A corner plate like the triangle frames' joints: rounded grey plate with an orange bolt; rivets once bolted. */
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
