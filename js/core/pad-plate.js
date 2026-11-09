/**
 * The direction pad's panel, drawn as vector art so it fits its keys exactly at any size: a glossy navy cross
 * with a cyan rim light and a round hub. Geometry (stage px): the pad is SIZE square, each arm ARM wide, so
 * every key (KEY px) sits in its arm with an even margin, KEY_OFFSET from the centre.
 */
export const PAD = Object.freeze({
  SIZE: 360,
  ARM: 124,
  KEY: 104,
  KEY_OFFSET: 116,      // key centre from the pad centre: a 10 px margin to the end of the arm
  HUB: 34,              // hub radius
  OUTER_RADIUS: 24,     // rounded outer corners
  INNER_RADIUS: 16,     // filleted inside corners
});

/** A polygon with each corner rounded (radius per corner), as an SVG path. */
function roundedPath(points, radii) {
  const n = points.length;
  let d = '';
  for (let i = 0; i < n; i += 1) {
    const [vx, vy] = points[i];
    const [px, py] = points[(i - 1 + n) % n];
    const [nx, ny] = points[(i + 1) % n];
    const r = radii[i];
    const lp = Math.hypot(px - vx, py - vy);
    const ln = Math.hypot(nx - vx, ny - vy);
    const a = [vx + ((px - vx) * r) / lp, vy + ((py - vy) * r) / lp];
    const b = [vx + ((nx - vx) * r) / ln, vy + ((ny - vy) * r) / ln];
    d += `${i ? 'L' : 'M'}${a[0].toFixed(1)} ${a[1].toFixed(1)} Q${vx} ${vy} ${b[0].toFixed(1)} ${b[1].toFixed(1)} `;
  }
  return `${d}Z`;
}

/** The panel's SVG. `id` keeps gradient ids unique when the panel appears more than once on the page. */
export function padPlateSvg(id = 'pad') {
  const { SIZE: s, ARM, HUB, OUTER_RADIUS: ro, INNER_RADIUS: ri } = PAD;
  const c = s / 2;
  const h = ARM / 2;
  const inset = 2;
  const lo = inset;
  const hi = s - inset;
  const points = [
    [c - h, lo], [c + h, lo], [c + h, c - h], [hi, c - h], [hi, c + h], [c + h, c + h],
    [c + h, hi], [c - h, hi], [c - h, c + h], [lo, c + h], [lo, c - h], [c - h, c - h],
  ];
  const radii = [ro, ro, ri, ro, ro, ri, ro, ro, ri, ro, ro, ri];
  const cross = roundedPath(points, radii);
  return `<svg viewBox="0 0 ${s} ${s}" aria-hidden="true" focusable="false">
  <defs>
    <linearGradient id="${id}-fill" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2a63d6"/><stop offset="0.55" stop-color="#143e9e"/><stop offset="1" stop-color="#0b2768"/>
    </linearGradient>
    <linearGradient id="${id}-gloss" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.32"/><stop offset="0.45" stop-color="#ffffff" stop-opacity="0.06"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
    <radialGradient id="${id}-hub" cx="0.38" cy="0.32" r="0.75">
      <stop offset="0" stop-color="#4f86f0"/><stop offset="0.55" stop-color="#1a47b0"/><stop offset="1" stop-color="#0a2366"/>
    </radialGradient>
  </defs>
  <path d="${cross}" fill="url(#${id}-fill)" stroke="#071a4a" stroke-width="3"/>
  <path d="${cross}" fill="url(#${id}-gloss)" transform="translate(${c} ${c}) scale(0.94) translate(${-c} ${-c})"/>
  <path d="${cross}" fill="none" stroke="#6fe8ff" stroke-width="2.5" stroke-opacity="0.95" transform="translate(${c} ${c}) scale(0.975) translate(${-c} ${-c})"/>
  <circle cx="${c}" cy="${c}" r="${HUB + 3}" fill="#0a1f5a" opacity="0.55"/>
  <circle cx="${c}" cy="${c}" r="${HUB}" fill="url(#${id}-hub)" stroke="#7fe3ff" stroke-opacity="0.55" stroke-width="2"/>
  <ellipse cx="${c - HUB * 0.25}" cy="${c - HUB * 0.42}" rx="${HUB * 0.5}" ry="${HUB * 0.24}" fill="#ffffff" opacity="0.35"/>
</svg>`;
}
