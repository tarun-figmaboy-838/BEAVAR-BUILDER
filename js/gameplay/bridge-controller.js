import { BRIDGE_GEOMETRY, stageById, memberId } from '../data/bridge-geometry.js';
import { WATER_LINE_Y, DECK_LAYOUT } from '../data/layout.js';
import { wait, tween, easings, playClassAnimation, prefersReducedMotion } from '../core/motion.js';
import { createTube, moveTube, createGusset, gussetDefs, svgElement, TUBE_PALETTES } from './svg-tubes.js';

const PILLAR_IMAGE = { src: 'assets/images/bridge/pillar-brick.png', width: 268, height: 321 };
const MEMBER_WIDTH = 18;
const FRAME_TUBE_WIDTH = 16;   // matches the frames on the yard (frame-shapes.js)
const PANEL_INSET = 11;        // colour plates sit inside the beams, as on PDF p7
const COVERED_FRACTION = 0.5;  // a plate mostly hidden behind later plates fades, so no leftover region reads as a triangle
const HOTSPOT_MARKUP = '<span class="hotspot__pad"></span><span class="hotspot__column"></span><span class="hotspot__sparks"><i></i><i></i><i></i><i></i></span><span class="hotspot__chevrons"><i></i><i></i></span>';

/* ---------- Pillars standing in the canal ---------- */
function buildPillar(x) {
  const { pillarTopY, pillarWidth } = BRIDGE_GEOMETRY;
  const height = Math.round((pillarWidth * PILLAR_IMAGE.height) / PILLAR_IMAGE.width);
  const unit = document.createElement('div');
  unit.className = 'pillar-unit';
  unit.style.left = `${x - pillarWidth / 2}px`;
  unit.style.top = `${pillarTopY}px`;
  unit.style.width = `${pillarWidth}px`;
  unit.style.height = `${height}px`;
  unit.style.setProperty('--wet', `${WATER_LINE_Y - pillarTopY}px`);
  unit.innerHTML = `
    <img class="pillar__reflection motion-ambient" src="${PILLAR_IMAGE.src}" alt="" draggable="false">
    <img class="pillar__body" src="${PILLAR_IMAGE.src}" alt="" draggable="false">
`;
  return unit;
}

/* ---------- Deck: a bare riveted steel girder from quay to quay while the bridge is being built ----------
   The road surface and the safety railings are laid on it only when the bridge is complete (finishDeck). */
function buildDeck(bridgeEl) {
  const { x1, x2, top, height, railHeight } = DECK_LAYOUT;
  const width = x2 - x1;
  const above = railHeight + 6;                  // room above the girder for the finished road and railings
  const g = above;                               // girder top, in deck coordinates
  const bottom = g + height;
  const stiffeners = [];
  for (let x = 46; x < width - 30; x += 104) stiffeners.push(x);
  const posts = [];
  for (let x = 18; x <= width - 18; x += 58) posts.push(x);
  const bearings = BRIDGE_GEOMETRY.pillarXs.map((px) => px - x1);
  const rivetRow = (y) => `
    <line x1="14" y1="${y}" x2="${width - 14}" y2="${y}" class="deck__rivets"/>
    <line x1="14" y1="${y - 0.9}" x2="${width - 14}" y2="${y - 0.9}" class="deck__rivets deck__rivets--shine"/>`;
  const deck = document.createElement('div');
  deck.className = 'deck';
  Object.assign(deck.style, { left: `${x1}px`, top: `${top - above}px`, width: `${width}px`, height: `${height + above}px` });
  deck.innerHTML = `
    <span class="deck__shadow"></span>
    <svg class="deck__svg" width="${width}" height="${height + above}" viewBox="0 0 ${width} ${height + above}" aria-hidden="true">
      <defs>
        <linearGradient id="deck-steel" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#b9c2cd"/><stop offset="0.35" stop-color="#8c96a3"/><stop offset="0.72" stop-color="#6b7583"/><stop offset="1" stop-color="#4a525e"/>
        </linearGradient>
      </defs>
      <g class="deck__finish">
        <g class="deck__rails">
          ${posts.map((x) => `<line x1="${x}" y1="${g - railHeight + 3}" x2="${x}" y2="${g - 2}" class="deck-rail__post"/>`).join('')}
          <line x1="8" y1="${g - railHeight + 3}" x2="${width - 8}" y2="${g - railHeight + 3}" class="deck-rail"/>
          <line x1="8" y1="${g - railHeight / 2}" x2="${width - 8}" y2="${g - railHeight / 2}" class="deck-rail deck-rail--mid"/>
        </g>
        <rect class="deck__road" x="2" y="${g - 7}" width="${width - 4}" height="9" rx="2"/>
      </g>
      <rect class="deck__web" x="1.5" y="${g}" width="${width - 3}" height="${height}" rx="3"/>
      <rect class="deck__flange" x="3" y="${g + 1.5}" width="${width - 6}" height="5.5"/>
      <rect class="deck__flange deck__flange--low" x="3" y="${bottom - 8}" width="${width - 6}" height="6.5"/>
      ${stiffeners.map((x) => `<rect class="deck__stiffener" x="${x - 3}" y="${g + 7}" width="6" height="${height - 15}" rx="1"/>`).join('')}
      ${rivetRow(g + 11)}
      ${rivetRow(bottom - 13)}
      ${bearings.map((x) => `<path class="deck-girder__bearing" d="M ${x - 34} ${bottom} h 68 l -8 7 h -52 z"/>`).join('')}
    </svg>`;
  bridgeEl.appendChild(deck);
  return deck;
}

const PERMUTATIONS = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];

/**
 * Best uniform scale + translation taking triangle `from` onto `to` (no rotation: frames keep their
 * orientation). Tries every corner pairing and keeps the closest; for similar triangles it is exact.
 */
function similarityFit(from, to) {
  const [fx, fy] = centroid(from);
  const [tx, ty] = centroid(to);
  let best = null;
  for (const order of PERMUTATIONS) {
    const target = order.map((k) => to[k]);
    let dot = 0;
    let norm = 0;
    for (let i = 0; i < 3; i += 1) {
      const ux = from[i][0] - fx;
      const uy = from[i][1] - fy;
      dot += ux * (target[i][0] - tx) + uy * (target[i][1] - ty);
      norm += ux * ux + uy * uy;
    }
    const scale = dot / (norm || 1);
    if (scale <= 0) continue;
    const residual = target.reduce((sum, [x, y], i) => sum + Math.hypot(tx + (from[i][0] - fx) * scale - x, ty + (from[i][1] - fy) * scale - y), 0);
    if (!best || residual < best.residual) best = { scale, residual, target };
  }
  return { scale: best?.scale ?? 1, centre: [tx, ty], target: best?.target ?? to };
}

/** Shrink a triangle toward its incentre so its colour plate sits inside the beams. */
function insetTriangle(points, distance) {
  const [a, b, c] = points;
  const la = Math.hypot(b[0] - c[0], b[1] - c[1]);
  const lb = Math.hypot(a[0] - c[0], a[1] - c[1]);
  const lc = Math.hypot(a[0] - b[0], a[1] - b[1]);
  const perimeter = la + lb + lc;
  const incentre = [(la * a[0] + lb * b[0] + lc * c[0]) / perimeter, (la * a[1] + lb * b[1] + lc * c[1]) / perimeter];
  const area = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2;
  const inradius = (2 * area) / perimeter;
  // small or thin triangles keep at least 65% of their size, so every plate stays visible
  const k = (inradius - Math.min(distance, inradius * 0.35)) / inradius;
  return points.map(([x, y]) => [incentre[0] + (x - incentre[0]) * k, incentre[1] + (y - incentre[1]) * k]);
}

function insideTriangle([px, py], [a, b, c]) {
  const sign = (p, q, r) => (p[0] - r[0]) * (q[1] - r[1]) - (q[0] - r[0]) * (p[1] - r[1]);
  const d1 = sign([px, py], a, b);
  const d2 = sign([px, py], b, c);
  const d3 = sign([px, py], c, a);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
}

/** Share of `panel` hidden behind any of `others` (sampled on a barycentric grid). */
function coveredFraction(panel, others) {
  if (!others.length) return 0;
  const [a, b, c] = panel;
  let hits = 0;
  let total = 0;
  const steps = 18;
  for (let i = 1; i < steps; i += 1) {
    for (let j = 1; i + j < steps; j += 1) {
      const u = i / steps;
      const v = j / steps;
      const point = [a[0] + (b[0] - a[0]) * u + (c[0] - a[0]) * v, a[1] + (b[1] - a[1]) * u + (c[1] - a[1]) * v];
      total += 1;
      if (others.some((other) => insideTriangle(point, other))) hits += 1;
    }
  }
  return total ? hits / total : 0;
}

/** True when segment p-q lies along one edge of the triangle (the dropped frame supplies that beam). */
function panelEdgeContains(triangle, p, q) {
  const onSegment = (a, b, point) => {
    const cross = (b[0] - a[0]) * (point[1] - a[1]) - (b[1] - a[1]) * (point[0] - a[0]);
    if (Math.abs(cross) / Math.hypot(b[0] - a[0], b[1] - a[1]) > 1.5) return false;
    const dot = (point[0] - a[0]) * (b[0] - a[0]) + (point[1] - a[1]) * (b[1] - a[1]);
    return dot >= -1 && dot <= (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2 + 1;
  };
  return [0, 1, 2].some((i) => {
    const a = triangle[i];
    const b = triangle[(i + 1) % 3];
    return onSegment(a, b, p) && onSegment(a, b, q);
  });
}

function centroid(points) {
  return [points.reduce((sum, p) => sum + p[0], 0) / points.length, points.reduce((sum, p) => sum + p[1], 0) / points.length];
}

/**
 * Pillars, deck girder, truss (3D steel tubes on the PDF geometry), triangle panels and the hotspot.
 * Construction and collapse are authored sequences, not physics.
 */
export function createBridgeController({ bridgeEl, fxEl, fx, audio }) {
  const { nodes, stages } = BRIDGE_GEOMETRY;
  const pillars = BRIDGE_GEOMETRY.pillarXs.map((x) => {
    const unit = buildPillar(x);
    bridgeEl.appendChild(unit);
    return unit;
  });

  const deck = buildDeck(bridgeEl);
  const svg = svgElement('svg', { class: 'truss', viewBox: '0 0 1920 1080', 'aria-hidden': 'true' });
  svg.appendChild(gussetDefs());
  const root = svgElement('g', { class: 'truss-root' });
  const panelsGroup = svgElement('g', { class: 'truss-panels' });
  const membersGroup = svgElement('g', { class: 'truss-members' });
  const nodesGroup = svgElement('g', { class: 'truss-nodes' });
  const flightLayer = svgElement('g', { class: 'truss-flights' });
  root.append(panelsGroup, membersGroup, nodesGroup);
  svg.append(root, flightLayer);
  bridgeEl.appendChild(svg);

  const memberEls = new Map();
  const panelEls = new Map();
  for (const stage of stages) {
    for (const [from, to] of stage.members) {
      const [x1, y1] = nodes[from];
      const [x2, y2] = nodes[to];
      const { group } = createTube(x1, y1, x2, y2, { width: MEMBER_WIDTH, palette: TUBE_PALETTES.paint, className: 'member', drawable: true });
      group.dataset.id = memberId(from, to);
      group.style.setProperty('--origin-x', `${x1}px`);
      group.style.setProperty('--origin-y', `${y1}px`);
      membersGroup.appendChild(group);
      memberEls.set(memberId(from, to), group);
    }
    panelEls.set(stage.id, stage.panels.map((names) => {
      const points = names.map((name) => nodes[name]);
      const plate = insetTriangle(points, PANEL_INSET);
      const polygon = svgElement('polygon', { class: `panel panel--${stage.panelType}`, points: plate.map((p) => p.map((n) => n.toFixed(1)).join(',')).join(' ') });
      panelsGroup.appendChild(polygon);
      const covers = stage.members.filter(([from, to]) => panelEdgeContains(points, nodes[from], nodes[to]));
      return { polygon, points, names, covers };
    }));
  }

  const nodeEls = new Map();
  for (const [name, [x, y]] of Object.entries(nodes)) {
    const gusset = createGusset(x, y);
    gusset.dataset.node = name;
    nodesGroup.appendChild(gusset);
    nodeEls.set(name, gusset);
  }

  function createHotspot(className) {
    const spot = document.createElement('span');
    spot.className = `hotspot ${className}`.trim();
    spot.innerHTML = HOTSPOT_MARKUP;
    return spot;
  }

  // The drop spot only marks the place: it is not tappable (joystick + PICK / DROP only).
  const socket = document.createElement('div');
  socket.className = 'hotspot socket';
  socket.setAttribute('aria-hidden', 'true');
  socket.innerHTML = HOTSPOT_MARKUP;
  bridgeEl.appendChild(socket);

  const demoSpots = BRIDGE_GEOMETRY.demoSpots.map(([x]) => {
    const spot = createHotspot('hotspot--demo');
    spot.style.left = `${x}px`;
    spot.style.top = `${BRIDGE_GEOMETRY.deckY}px`;
    bridgeEl.appendChild(spot);
    return spot;
  });


  const builtStages = [];
  const reduced = () => prefersReducedMotion();

  function stageMembers(stage) {
    return stage.members.map(([from, to]) => ({ from, to, element: memberEls.get(memberId(from, to)) }));
  }

  const installed = [];   // panels in the order they were installed

  /** Fade earlier colour plates that are now mostly behind later ones. */
  function refreshCoverage() {
    installed.forEach((panel, index) => {
      const later = installed.slice(index + 1).map((other) => other.points);
      panel.polygon.classList.toggle('is-covered', coveredFraction(panel.points, later) > COVERED_FRACTION);
    });
  }

  /** Lock a panel's beams and corner plates in place, and show its colour plate (PDF p7). */
  function installPanel(panel, { lit = true } = {}) {
    for (const [from, to] of panel.covers) memberEls.get(memberId(from, to)).classList.add('is-instant', 'is-built');
    for (const name of panel.names) nodeEls.get(name).classList.add('is-instant', 'is-built');
    if (!installed.includes(panel)) installed.push(panel);
    panel.polygon.classList.add('is-installed');
    panel.polygon.classList.toggle('is-lit', lit);
    refreshCoverage();
  }

  /** Flight overlay: the frame's own three beams and corner plates, re-drawn each frame. */
  function createFlightFrame(vertices) {
    const group = svgElement('g', { class: 'flight-frame' });
    const tubes = [0, 1, 2].map((i) => {
      const [x1, y1] = vertices[i];
      const [x2, y2] = vertices[(i + 1) % 3];
      const tube = createTube(x1, y1, x2, y2, { width: FRAME_TUBE_WIDTH, palette: TUBE_PALETTES.paint });
      group.appendChild(tube.group);
      return tube;
    });
    const plates = vertices.map(([x, y]) => {
      const plate = svgElement('g', { class: 'flight-frame__plate' });
      plate.appendChild(createGusset(0, 0, { radius: 13 }));
      plate.firstChild.setAttribute('class', 'truss-node is-built is-instant');
      plate.setAttribute('transform', `translate(${x} ${y})`);
      group.appendChild(plate);
      return plate;
    });
    flightLayer.appendChild(group);
    return {
      group,
      set(points) {
        tubes.forEach((tube, i) => {
          const [x1, y1] = points[i];
          const [x2, y2] = points[(i + 1) % 3];
          moveTube(tube, x1, y1, x2, y2);
        });
        plates.forEach((plate, i) => plate.setAttribute('transform', `translate(${points[i][0].toFixed(1)} ${points[i][1].toFixed(1)})`));
      },
    };
  }

  /** The fit: each corner is welded in turn (white-hot flash, shockwave ring, flying sparks) with a hammer clank. */
  async function hammerIntoPlace(corners, signal) {
    for (const [k, [x, y]] of corners.entries()) {
      audio.play('clank', { variant: k });
      fx.weld(x, y);
      await wait(reduced() ? 0 : 110, signal);
    }
    audio.play('bolt');
  }

  /**
   * Grow a frame into place. `from` and `to` are the same shape (similar triangles, same orientation),
   * so only the size and the centre change: the shape never does. Corners are paired by the best
   * similarity fit, and every in-between frame is an exact scaled copy.
   */
  async function growInPlace(from, to, { delay = 0, signal } = {}) {
    const fit = similarityFit(from, to);
    const frame = createFlightFrame(from);
    if (delay) await wait(delay, signal);
    const [fx0, fy0] = centroid(from);
    // Grow about the similarity's fixed point: the one place that does not move between the dropped
    // frame and its panel. A frame standing on the deck keeps its base planted on the deck the whole
    // time (centre-and-scale interpolation lifted it off mid-growth).
    const S = fit.scale;
    const fixed = Math.abs(1 - S) > 1e-3
      ? [(fit.centre[0] - S * fx0) / (1 - S), (fit.centre[1] - S * fy0) / (1 - S)]
      : null;
    await tween({
      duration: 760,
      ease: easings.inOutCubic,
      signal,
      onUpdate: (t) => {
        const scale = Math.exp(Math.log(S) * t);
        if (fixed) {
          frame.set(from.map(([x, y]) => [fixed[0] + (x - fixed[0]) * scale, fixed[1] + (y - fixed[1]) * scale]));
          return;
        }
        const cx = fx0 + (fit.centre[0] - fx0) * t;
        const cy = fy0 + (fit.centre[1] - fy0) * t;
        frame.set(from.map(([x, y]) => [cx + (x - fx0) * scale, cy + (y - fy0) * scale]));
      },
    });
    frame.set(fit.target);
    return frame;
  }

  /**
   * The dropped frame becomes the bridge (PDF p10). It is already the exact shape of its place, so it
   * stays where it was dropped and only grows to fit; every other place the same triangle appears gets
   * a copy of that place's own shape that grows there. Each then locks in with a hammer hit per corner.
   */
  async function absorbFrame(option, stageId, signal) {
    const panels = panelEls.get(stageId) ?? [];
    const left = parseFloat(option.element.style.left) || 0;
    const top = parseFloat(option.element.style.top) || 0;
    const dropped = option.localVertices.map(([x, y]) => [left + x, top + y]);
    option.element.remove();
    if (reduced() || !panels.length) {
      panels.forEach((panel) => installPanel(panel));
      return;
    }
    const growths = panels.map(async (panel, index) => {
      const [pcx, pcy] = centroid(panel.points);
      const start = index === 0 ? dropped : panel.points.map(([x, y]) => [pcx + (x - pcx) * 0.3, pcy + (y - pcy) * 0.3]);
      if (index > 0) audio.play('whoosh');
      const frame = await growInPlace(start, panel.points, { delay: index * 160, signal });
      installPanel(panel);
      frame.group.remove();
      await hammerIntoPlace(panel.points, signal);
    });
    await Promise.all(growths);
    await wait(260, signal);
    for (const panel of panels) panel.polygon.classList.remove('is-lit');
  }

  async function constructStage(stageId, { signal, instant = false } = {}) {
    const stage = stageById(stageId);
    if (!stage || builtStages.includes(stageId)) return;
    const members = stageMembers(stage).filter(({ element }) => !element.classList.contains('is-built'));
    const plateNodes = [...new Set(stage.members.flat())].filter((name) => !nodeEls.get(name).classList.contains('is-built'));
    if (instant || reduced()) {
      members.forEach(({ element }) => element.classList.add('is-instant', 'is-built'));
      plateNodes.forEach((name) => nodeEls.get(name).classList.add('is-instant', 'is-built'));
      stage.bolts.forEach((name) => nodeEls.get(name).classList.add('is-instant', 'is-built', 'is-bolted'));
      (panelEls.get(stageId) ?? []).forEach((panel) => installPanel(panel, { lit: false }));
      builtStages.push(stageId);
      return;
    }
    audio.startLoop('construction');
    for (const [index, { from, to, element }] of members.entries()) {
      const [x1, y1] = nodes[from];
      const [x2, y2] = nodes[to];
      element.style.setProperty('--draw-ms', `${Math.round(360 + Math.hypot(x2 - x1, y2 - y1) * 0.2)}ms`);
      element.classList.remove('is-instant');
      element.classList.add('is-built', 'is-fresh');
      fx.sparks(x1, y1);
      fx.dust((x1 + x2) / 2, (y1 + y2) / 2);
      audio.play('hammer', { variant: index % 3 });
      for (const name of [from, to]) {
        if (plateNodes.includes(name)) nodeEls.get(name).classList.add('is-built');
      }
      await wait(members.length > 4 ? 190 : 260, signal);
      fx.sparks(x2, y2, { small: true });
    }
    if (members.length) await wait(220, signal);
    else await wait(200, signal);
    for (const name of stage.bolts) {
      nodeEls.get(name).classList.remove('is-instant');
      nodeEls.get(name).classList.add('is-built', 'is-bolted');
      fx.sparks(...nodes[name], { small: true });
      audio.play('bolt');
      await wait(stage.members.length ? 90 : 230, signal);
    }
    audio.stopLoop('construction');
    pillars.forEach((pillar) => playClassAnimation(pillar, 'is-impact', 500));
    audio.play('thud');
    await playClassAnimation(root, 'is-settling', 700);
    members.forEach(({ element }) => element.classList.remove('is-fresh'));
    fx.ding(stage.socket.x, stage.socket.y - 80);
    audio.play('ding');
    builtStages.push(stageId);
  }

  function reset() {
    root.classList.remove('is-collapsing', 'is-swaying', 'is-warning', 'is-settling', 'is-proud');
    for (const element of [...memberEls.values(), ...nodeEls.values()]) {
      element.classList.remove('is-built', 'is-fresh', 'is-instant', 'is-bolted');
      for (const name of ['--fall-delay', '--fall-rot', '--fall-dx']) element.style.removeProperty(name);
    }
    for (const panels of panelEls.values()) panels.forEach(({ polygon }) => polygon.classList.remove('is-lit', 'is-installed', 'is-covered'));
    installed.length = 0;
    flightLayer.replaceChildren();
    builtStages.length = 0;
    socket.classList.remove('is-visible', 'is-aligned', 'is-armed');
    deck.classList.remove('is-finished');
  }

  /** warning wobble → growing sway → sections fall → splash → reset (PDF p10). */
  async function collapse({ signal } = {}) {
    audio.stopLoop('construction');
    const builtMembers = [...memberEls.values()].filter((element) => element.classList.contains('is-built'));
    const builtNodes = [...nodeEls.values()].filter((element) => element.classList.contains('is-built'));
    if (reduced()) {
      bridgeEl.classList.add('is-shaking');
      audio.play('collapse');
      await wait(300, signal);
      bridgeEl.classList.remove('is-shaking');
      reset();
      return;
    }
    if (builtMembers.length) {
      audio.play('creak');
      await playClassAnimation(root, 'is-warning', 820);
      audio.play('creak');
      await playClassAnimation(root, 'is-swaying', 1620);
      builtMembers.forEach((element, index) => {
        element.style.setProperty('--fall-delay', `${(index % 5) * 70 + Math.floor(index / 5) * 45}ms`);
        element.style.setProperty('--fall-rot', `${(index % 2 ? -1 : 1) * (14 + ((index * 7) % 22))}deg`);
        element.style.setProperty('--fall-dx', `${((index * 13) % 40) - 20}px`);
      });
      builtNodes.forEach((element, index) => {
        element.style.setProperty('--fall-delay', `${(index % 5) * 70}ms`);
        element.style.setProperty('--fall-dx', `${((index * 11) % 30) - 15}px`);
      });
      installed.forEach(({ polygon }, index) => {
        polygon.style.setProperty('--fall-delay', `${(index % 4) * 80}ms`);
        polygon.style.setProperty('--fall-dx', `${((index * 17) % 50) - 25}px`);
      });
      root.classList.add('is-collapsing');
    }
    bridgeEl.classList.add('is-shaking');
    audio.play('collapse');
    await wait(560, signal);
    [BRIDGE_GEOMETRY.spanLeft + 160, 960, BRIDGE_GEOMETRY.spanRight - 160].forEach((x, index) => {
      setTimeout(() => fx.splash(x, WATER_LINE_Y + 10), index * 90);
    });
    audio.play('splash');
    await wait(760, signal);
    bridgeEl.classList.remove('is-shaking');
    await wait(420, signal);
    reset();
  }

  return {
    absorbFrame,
    constructStage,
    collapse,
    reset,
    get builtCount() {
      return builtStages.length;
    },
    socketFor(stageId) {
      return stageById(stageId)?.socket ?? null;
    },
    showSocket(stageId) {
      const point = this.socketFor(stageId);
      if (!point) return;
      socket.style.left = `${point.x}px`;
      socket.style.top = `${BRIDGE_GEOMETRY.deckY}px`;
      socket.classList.remove('is-aligned');
      socket.classList.add('is-visible');
    },
    hideSocket() {
      socket.classList.remove('is-visible', 'is-aligned', 'is-armed');
    },
    setSocketAligned(aligned) {
      socket.classList.toggle('is-aligned', Boolean(aligned));
    },
    /** Armed while a frame is carried: the spot brightens and calls the crane over. */
    setSocketArmed(armed) {
      socket.classList.toggle('is-armed', Boolean(armed));
    },
    showDemoSpots() {
      demoSpots.forEach((spot) => spot.classList.add('is-visible'));
    },
    hideDemoSpots() {
      demoSpots.forEach((spot) => spot.classList.remove('is-visible'));
    },
    completeSettle: () => playClassAnimation(root, 'is-proud', 1100),
    /** The finishing touch once every frame is in: the road rolls out along the girder and the railings go up. */
    async finishDeck({ signal } = {}) {
      deck.classList.add('is-finished');
      audio.play('bolt');
      await wait(prefersReducedMotion() ? 0 : 650, signal);
      audio.play('clank', { variant: 1 });
      await wait(prefersReducedMotion() ? 0 : 500, signal);
    },
    impactPillars: () => pillars.forEach((pillar) => playClassAnimation(pillar, 'is-impact', 500)),
  };
}
