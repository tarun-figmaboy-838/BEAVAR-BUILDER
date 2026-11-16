/**
 * The workshop's live triangle: three steel sides with bolted corners drawn as SVG from exact
 * vertices, with side lengths, angle arcs, ticks and the right-angle square computed from the
 * shape every frame. Corners can be dragged (pointer capture, touch, a wide invisible hit area);
 * while a goal is set, a corner near a position that makes the goal true snaps onto it.
 */
import { measure, formatDeg, constrainVertex, snapVertex, goalMet, solutionFor, vec, PX_PER_CM } from './triangle-model.js';
import { svgEl, fmt, sideLabelPoint, arcPath, squarePoints, tickSegment, cornerFrame, outwardNormal, centroid, valueHues } from './triangle-draw.js';
import { tween, easings, wait, prefersReducedMotion, playClassAnimation } from '../core/motion.js';

const VERTEX_HIT_RADIUS = 46;
const DEFAULT_VISIBLE = Object.freeze({ sides: true, vertices: true, sideLabels: false, angleArcs: false, angleLabels: false, ticks: false, square: false });

/** Every corner mark is the same size, big enough to read at a glance. */
const CORNER_RADIUS = 80;
/** The right-angle square: the same share of the corner as on the card figures, so it reads as big as an arc. */
const SQUARE = CORNER_RADIUS * 0.7;
const normaliseSet = (value) => (value === true ? [0, 1, 2] : Array.isArray(value) ? value : []);

export function createTriangleCanvas({ host, width, height, audio }) {
  const svg = svgEl('svg', { class: 'ws-canvas', viewBox: `0 0 ${width} ${height}`, 'aria-hidden': 'true' });
  host.appendChild(svg);
  const defs = svgEl('defs');
  const pattern = svgEl('pattern', { id: 'ws-tape-ticks', patternUnits: 'userSpaceOnUse', width: PX_PER_CM, height: 16 });
  const tickLong = svgEl('rect', { x: 0, y: 0, width: 2, height: 9, fill: '#5a4310' });
  const tickHalf = svgEl('rect', { x: PX_PER_CM / 2 - 1, y: 0, width: 2, height: 5, fill: '#5a4310' });
  pattern.append(tickLong, tickHalf);
  defs.appendChild(pattern);
  svg.appendChild(defs);
  const toolLayer = svgEl('g', { class: 'ws-tools' });
  const tri = svgEl('g', { class: 'ws-tri' });
  const markLayer = svgEl('g', { class: 'ws-marks' });     // corner fills and arcs sit UNDER the sides, so nothing crosses a line
  const fxLayer = svgEl('g', { class: 'ws-fx' });
  svg.append(toolLayer, tri, fxLayer);
  tri.appendChild(markLayer);

  const sides = [0, 1, 2].map((i) => {
    const group = svgEl('g', { class: 'ws-side', 'data-index': i });
    const body = svgEl('line', { class: 'ws-side__body' });
    const tick = svgEl('line', { class: 'ws-tick' });
    group.append(body, tick);
    return { group, body, tick };
  });
  const angles = [0, 1, 2].map((i) => {
    const group = svgEl('g', { class: 'ws-angle', 'data-index': i });
    const mark = svgEl('g', { class: 'ws-angle ws-angle--mark', 'data-index': i });   // same classes as the group, drawn under the sides
    const wedge = svgEl('path', { class: 'ws-angle__wedge' });    // the filled slice of the corner (Fishing Frenzy / Polygon style)
    const arc = svgEl('path', { class: 'ws-angle__arc' });
    const square = svgEl('polyline', { class: 'ws-angle__square' });
    const label = svgEl('text', { class: 'ws-angle__label' });
    mark.append(wedge);
    group.append(arc, square, label);
    return { group, mark, wedge, arc, square, label };
  });
  const sideLabels = [0, 1, 2].map((i) => {
    const group = svgEl('g', { class: 'ws-side-label', 'data-index': i });
    const text = svgEl('text', { class: 'ws-side-label__text' });
    group.append(text);
    return { group, text };
  });
  const vertices = [0, 1, 2].map((i) => {
    const group = svgEl('g', { class: 'ws-vertex', 'data-index': i });
    const hit = svgEl('circle', { class: 'ws-vertex__hit', r: VERTEX_HIT_RADIUS });
    const point = svgEl('g', { class: 'ws-vertex__point' });      // the dot that breathes / pulses as one piece
    const plate = svgEl('circle', { class: 'ws-vertex__plate', r: 16 });
    const bolt = svgEl('circle', { class: 'ws-vertex__bolt', r: 6 });
    point.append(plate, bolt);
    group.append(hit, point);
    return { group, hit, point, plate, bolt };
  });
  for (const a of angles) markLayer.appendChild(a.mark);
  for (const s of sides) tri.appendChild(s.group);
  for (const a of angles) tri.appendChild(a.group);
  for (const l of sideLabels) tri.appendChild(l.group);
  for (const v of vertices) tri.appendChild(v.group);

  let points = [[width / 2, 120], [width / 2 - 180, 420], [width / 2 + 180, 420]];
  let visible = { ...DEFAULT_VISIBLE, sides: false, vertices: false };     // nothing until a screen places its triangle
  let pxPerCm = PX_PER_CM;              // bigger on the measuring screens (setZoom), 1 cm stays 1 cm
  let measured = measure(points, pxPerCm);
  let drag = { enabled: false, goal: null, bounds: null, silentSnaps: false, onChange: null, onRelease: null };
  let active = null;      // the drag in progress
  let lastSnap = null;
  let hint = null;
  const chips = [];

  const setHidden = (element, hidden) => element.classList.toggle('ws-hidden', hidden);
  const inSet = (value, i) => value === true || (Array.isArray(value) && value.includes(i));

  /** Positions every element from the current corners; cheap enough to run on every pointer move. */
  function render() {
    measured = measure(points, pxPerCm);
    const angleHue = valueHues(measured.shownDeg);                // equal angles (as shown) share a colour
    const sideHue = valueHues(measured.shownCm);                  // equal lengths share a colour
    for (let i = 0; i < 3; i += 1) {
      const [x1, y1] = points[i];
      const [x2, y2] = points[(i + 1) % 3];
      const s = sides[i];
      s.body.setAttribute('x1', fmt(x1)); s.body.setAttribute('y1', fmt(y1));
      s.body.setAttribute('x2', fmt(x2)); s.body.setAttribute('y2', fmt(y2));
      const tick = tickSegment(points, i);
      for (const [key, value] of Object.entries(tick)) s.tick.setAttribute(key, value);
      setHidden(s.group, !visible.sides);
      setHidden(s.tick, !(visible.ticks && measured.equalSides[i]));

      const v = vertices[i];
      v.group.setAttribute('transform', `translate(${fmt(points[i][0])} ${fmt(points[i][1])})`);
      setHidden(v.group, !visible.vertices);

      const a = angles[i];
      const isRight = measured.rightAt === i;
      const radius = CORNER_RADIUS;
      a.arc.setAttribute('d', cornerArc(points, i, radius));
      a.wedge.setAttribute('d', wedgePath(points, i, radius));
      a.square.setAttribute('points', squarePoints(points, i, SQUARE));
      const showArc = inSet(visible.angleArcs, i);
      const showSquare = (visible.square || showArc) && isRight;      // a right angle is marked with its square, never a curve
      if (showSquare) {
        const [p1, p2, p3] = squarePoints(points, i, SQUARE).split(' ');
        a.wedge.setAttribute('d', `M ${fmt(points[i][0])} ${fmt(points[i][1])} L ${p1} L ${p2} L ${p3} Z`);   // the square, filled
      }
      setHidden(a.arc, !showArc || showSquare);
      setHidden(a.wedge, !showArc && !showSquare);
      setHidden(a.square, !showSquare);
      const [lx, ly] = cornerLabelPoint(points, i);
      a.label.setAttribute('x', fmt(lx)); a.label.setAttribute('y', fmt(ly));
      a.label.style.setProperty('--ox', `${fmt((points[i][0] - lx) * 0.75)}px`);   // the value slides out of its corner
      a.label.style.setProperty('--oy', `${fmt((points[i][1] - ly) * 0.75)}px`);
      a.label.textContent = formatDeg(measured.shownDeg[i]);
      setHidden(a.label, !inSet(visible.angleLabels, i));
      a.group.dataset.hue = String(angleHue[i]);
      a.mark.dataset.hue = String(angleHue[i]);
      angleClass(a, 'is-right', isRight);
      angleClass(a, 'is-obtuse', measured.obtuseAt === i);

      const l = sideLabels[i];
      l.group.dataset.hue = String(sideHue[i]);
      l.text.textContent = measured.shownCm[i];
      // The number sits clear of the line and its equal-side tick whichever way the side runs: the gap
      // grows by the half of the text that lies along the side's normal (its width on a vertical side).
      const normal = outwardNormal(points, i);
      const gap = 22 + Math.abs(normal[0]) * (l.text.textContent.length * 8.5) + Math.abs(normal[1]) * 15;
      const [sx, sy] = sideLabelPoint(points, i, gap);
      l.group.style.setProperty('--ox', `${fmt(-normal[0] * gap * 0.75)}px`);
      l.group.style.setProperty('--oy', `${fmt(-normal[1] * gap * 0.75)}px`);
      l.text.setAttribute('x', fmt(sx)); l.text.setAttribute('y', fmt(sy));
      setHidden(l.group, !inSet(visible.sideLabels, i));
    }
    tri.dataset.bySides = measured.bySides;
    tri.dataset.byAngles = measured.byAngles;
  }

  /* ---------- Pointer mapping (works through the stage scale and the camera's world transform) ---------- */
  function toSvg(clientX, clientY) {
    const matrix = svg.getScreenCTM();
    if (!matrix) return [clientX, clientY];
    const point = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse());
    return [point.x, point.y];
  }
  function toClient(x, y) {
    const matrix = svg.getScreenCTM();
    if (!matrix) return { x, y };
    const point = new DOMPoint(x, y).matrixTransform(matrix);
    return { x: point.x, y: point.y };
  }

  /* ---------- Dragging ---------- */
  function onPointerDown(index, event) {
    if (!drag.enabled || active) return;
    event.preventDefault();
    const group = vertices[index].group;
    try { group.setPointerCapture(event.pointerId); } catch { /* older browsers */ }
    const pointer = toSvg(event.clientX, event.clientY);
    active = { index, pointerId: event.pointerId, offset: vec.sub(points[index], pointer), moved: false };
    group.classList.add('is-dragging');
    svg.classList.add('is-dragging');
    clearHint();
    audio?.play('vertexPick');
  }
  function onPointerMove(event) {
    if (!active || event.pointerId !== active.pointerId) return;
    event.preventDefault();
    const wanted = vec.add(toSvg(event.clientX, event.clientY), active.offset);
    const constrained = constrainVertex(active.index, wanted, points, drag.bounds);
    const { point, snapped } = snapVertex(drag.goal, active.index, constrained, points);
    const settled = constrainVertex(active.index, point, points, drag.bounds);
    points = points.map((p, i) => (i === active.index ? settled : p));
    active.moved = true;
    render();
    if (snapped !== lastSnap) {
      lastSnap = snapped;
      if (snapped && !drag.silentSnaps) {
        audio?.play(snapped === 'equal' || snapped === 'equilateral' ? 'snapEqual' : 'snapRight');
        sparkleAt(points[active.index], { count: 6 });
      }
      tri.classList.toggle('is-snapped', Boolean(snapped));
    }
    drag.onChange?.(measured, { snapped, goalMet: goalMet(drag.goal, measured) });
  }
  function endDrag(event) {
    if (!active || (event && event.pointerId !== active.pointerId)) return;
    const { index, moved } = active;
    vertices[index].group.classList.remove('is-dragging');
    svg.classList.remove('is-dragging');
    tri.classList.remove('is-snapped');
    active = null;
    lastSnap = null;
    drag.onRelease?.(measured, { moved, goalMet: goalMet(drag.goal, measured), index });
  }
  vertices.forEach((v, index) => {
    v.group.addEventListener('pointerdown', (event) => onPointerDown(index, event));
    v.group.addEventListener('pointermove', onPointerMove);
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) v.group.addEventListener(type, endDrag);
  });
  svg.addEventListener('contextmenu', (event) => event.preventDefault());

  const angleClass = (a, cls, on) => { a.group.classList.toggle(cls, on); a.mark.classList.toggle(cls, on); };
  /** Corner i's arc at radius r, trimmed to the space between the two sides (drawn over them, never across them). */
  function cornerArc(pts, i, r = CORNER_RADIUS, fraction = 1) {
    const { u, w, theta } = cornerFrame(pts, i);
    const v = pts[i];
    const sign = vec.cross(u, w) > 0 ? 1 : -1;
    const trim = Math.min(theta * 0.3, Math.asin(Math.min(0.9, 13 / r)));       // a side's half width plus its edge
    const a0 = trim;
    const a1 = trim + (theta - 2 * trim) * fraction;
    const dir = (a) => [u[0] * Math.cos(a) - sign * u[1] * Math.sin(a), sign * u[0] * Math.sin(a) + u[1] * Math.cos(a)];
    const p0 = vec.add(v, vec.mul(dir(a0), r));
    const p1 = vec.add(v, vec.mul(dir(a1), r));
    return `M ${fmt(p0[0])} ${fmt(p0[1])} A ${r} ${r} 0 0 ${sign > 0 ? 1 : 0} ${fmt(p1[0])} ${fmt(p1[1])}`;
  }
  /** Where corner i's value goes: just past its arc, along the corner's bisector. */
  function cornerLabelPoint(pts, i) {
    const { bisector, theta } = cornerFrame(pts, i);
    const distance = Math.min(170, Math.max(CORNER_RADIUS + 40, 24 / Math.sin(theta / 2) + 52));
    return vec.add(pts[i], vec.mul(bisector, distance));
  }

  /** The filled slice of corner i: from the vertex out to the arc and back (the arc may be partly swept). */
  function wedgePath(pts, i, radius = CORNER_RADIUS, fraction = 1) {
    const v = pts[i];
    return `M ${fmt(v[0])} ${fmt(v[1])} L ${arcPath(pts, i, radius, fraction).slice(2)} Z`;
  }

  /* ---------- Tools and hints ---------- */
  function clearHint() {
    hint?.remove();
    hint = null;
    for (const v of vertices) v.group.classList.remove('is-hinted');
  }

  /** A ghost corner and a dashed arrow showing which corner to drag and roughly where. */
  function hintDirection(index) {
    const from = points[index];
    const target = solutionFor(drag.goal, index, points, drag.bounds);
    const away = vec.sub(target, from);
    return { from, target, dir: vec.length(away) > 24 ? vec.unit(away) : vec.mul(outwardNormal(points, (index + 1) % 3), 1) };
  }
  /** Where the ghost hand should carry corner i: from the corner, the way the hint arrow points. */
  function ghostPath(index) {
    if (!drag.goal) return null;
    const { from, dir } = hintDirection(index);
    return [[...from], vec.add(from, vec.mul(dir, 120))];
  }
  function showHint(index, direction = null) {
    clearHint();
    const from = points[index];
    let dir = direction;
    if (!dir) dir = hintDirection(index).dir;
    // From the corner outwards: a dashed shaft, an arrowhead pointing the way, and the ghost corner to drag to.
    const start = vec.add(from, vec.mul(dir, 30));
    const shaftEnd = vec.add(from, vec.mul(dir, 66));
    const ghost = vec.add(from, vec.mul(dir, 102));
    const group = svgEl('g', { class: 'ws-hint' });
    group.append(
      svgEl('line', { class: 'ws-hint__line', x1: fmt(start[0]), y1: fmt(start[1]), x2: fmt(shaftEnd[0]), y2: fmt(shaftEnd[1]) }),
      svgEl('polygon', { class: 'ws-hint__arrow', points: arrowHead(from, dir) }),
      svgEl('circle', { class: 'ws-hint__ghost', cx: fmt(ghost[0]), cy: fmt(ghost[1]), r: 12 }),
    );
    fxLayer.appendChild(group);
    hint = group;
    vertices.forEach((v, i) => v.group.classList.toggle('is-hinted', i === index));
  }
  function arrowHead(at, dir) {
    const base = vec.add(at, vec.mul(dir, 64));
    const n = vec.perp(dir);
    const p1 = vec.add(at, vec.mul(dir, 86));       // the tip points away from the corner, towards the ghost
    const p2 = vec.add(base, vec.mul(n, 11));
    const p3 = vec.sub(base, vec.mul(n, 11));
    return [p1, p2, p3].map((p) => `${fmt(p[0])},${fmt(p[1])}`).join(' ');
  }

  function clearChips() {
    chips.splice(0).forEach((chip) => chip.remove());
  }
  /** A bold number beside side i (the "1, 2, 3" count of PDF L02): text alone, no tag behind it. */
  function showCountChip(index, text) {
    const [x, y] = sideLabelPoint(points, index, 48);
    const group = svgEl('g', { class: 'ws-coin', transform: `translate(${fmt(x)} ${fmt(y)})` });
    group.append(svgEl('text', { class: 'ws-coin__text', y: 1 }, [document.createTextNode(text)]));
    fxLayer.appendChild(group);
    chips.push(group);
    return playClassAnimation(group, 'is-pop', 500);
  }

  const reduced = () => prefersReducedMotion();

  /** A glowing light runs along side i from one corner to the other, then fades (a gold trace). */
  function traceSide(index, { delay = 0, duration = 900 } = {}) {
    if (reduced()) return;
    const a = points[index];
    const b = points[(index + 1) % 3];
    const line = svgEl('line', { class: 'ws-trace-glow', x1: fmt(a[0]), y1: fmt(a[1]), x2: fmt(b[0]), y2: fmt(b[1]), pathLength: 1 });
    runTrace(line, delay, duration);
  }
  /** The same light sweeps round the arc of corner i. */
  function traceAngle(index, { delay = 0, duration = 700 } = {}) {
    if (reduced()) return;
    // A right angle is marked with its square, never a curve: the light runs along the square's two edges.
    let d = cornerArc(points, index, CORNER_RADIUS);
    if (measured.rightAt === index) {
      const [p, q, r] = squarePoints(points, index, SQUARE).split(' ');
      d = `M ${p} L ${q} L ${r}`;
    }
    const path = svgEl('path', { class: 'ws-trace-glow', d, pathLength: 1 });
    runTrace(path, delay, duration);
  }
  function runTrace(el, delay, duration) {
    el.style.strokeDasharray = '1 1';
    el.style.strokeDashoffset = '1';
    setTimeout(() => {
      fxLayer.appendChild(el);
      const anim = el.animate?.([{ strokeDashoffset: 1, opacity: 1 }, { strokeDashoffset: 0, opacity: 1, offset: 0.6 }, { strokeDashoffset: 0, opacity: 0 }],
        { duration, easing: 'ease-out', fill: 'both' });
      (anim?.finished ?? Promise.resolve()).catch(() => {}).finally(() => el.remove());
    }, delay);
  }

  /** A little burst of sparks at a point (a snap, a success): dots thrown outward. */
  function sparkleAt([x, y], { count = 8 } = {}) {
    if (reduced()) return;
    const group = svgEl('g', { class: 'ws-sparks', transform: `translate(${fmt(x)} ${fmt(y)})` });
    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const distance = 34 + Math.random() * 26;
      const dot = svgEl('circle', { class: 'ws-spark', r: 4 + Math.random() * 3 });
      dot.style.setProperty('--dx', `${(Math.cos(angle) * distance).toFixed(1)}px`);
      dot.style.setProperty('--dy', `${(Math.sin(angle) * distance).toFixed(1)}px`);
      group.appendChild(dot);
    }
    fxLayer.appendChild(group);
    setTimeout(() => group.remove(), 700);
  }

  /** PDF L01: the triangle is built corner → side → corner → side → corner → closing side, then clicks shut. */
  async function drawIn({ signal } = {}) {
    visible = { ...DEFAULT_VISIBLE };
    render();
    tri.classList.add('is-drawing');
    for (const s of sides) { s.body.style.strokeDasharray = ''; setHidden(s.group, true); }
    for (const v of vertices) setHidden(v.group, true);
    for (let i = 0; i < 3; i += 1) {
      const v = vertices[i];
      setHidden(v.group, false);
      playClassAnimation(v.group, 'is-pop', 420);
      audio?.play('bolt');
      await wait(reduced() ? 0 : 480, signal);
      const s = sides[i];
      const length = measured.px[i];
      s.body.style.strokeDasharray = `${fmt(length)} ${fmt(length)}`;
      s.body.style.strokeDashoffset = fmt(length);
      setHidden(s.group, false);
      audio?.play('drawLine');
      await tween({ duration: reduced() ? 0 : 950, ease: easings.mechanical, signal, onUpdate: (t) => {
        s.body.style.strokeDashoffset = fmt(length * (1 - t));
      } });
      await wait(reduced() ? 0 : 260, signal);
    }
    for (const s of sides) { s.body.style.strokeDasharray = ''; s.body.style.strokeDashoffset = ''; }
    tri.classList.remove('is-drawing');
    audio?.play('clank', { variant: 1 });
    await playClassAnimation(tri, 'is-closed', 620);
  }

  /** Slide the corners to new positions (the shape keeps its identity, nothing is swapped). */
  async function morphTo(target, { duration = 800, ease = easings.inOutCubic, signal } = {}) {
    const from = points.map((p) => [...p]);
    if (reduced() || duration <= 0) {
      points = target.map((p) => [...p]);
      render();
      return;
    }
    await tween({ duration, ease, signal, onUpdate: (t) => {
      points = from.map((p, i) => [p[0] + (target[i][0] - p[0]) * t, p[1] + (target[i][1] - p[1]) * t]);
      render();
    } });
    points = target.map((p) => [...p]);
    render();
  }

  /**
   * The tape is pulled along side i (from its far end with `fromEnd`), running beside it and up to the
   * beaver's hand (`hand()`), then the length slides out of the side (PDF L04).
   */
  async function measureSide(index, { signal, fromEnd = 0, onProgress = null, hand = null } = {}) {
    const s = sides[index];
    const a = fromEnd ? points[(index + 1) % 3] : points[index];
    const b = fromEnd ? points[index] : points[(index + 1) % 3];
    const n = outwardNormal(points, index);
    const direction = vec.unit(vec.sub(b, a));
    const length = measured.px[index];
    // The tape, spread along the side as far as it has been pulled: a yellow band with tick marks.
    const stripAngle = (Math.atan2(direction[1], direction[0]) * 180) / Math.PI;
    const beside = vec.add(a, vec.mul(n, 20));     // the tape runs alongside the side, so the side itself stays in view
    const strip = svgEl('g', { class: 'ws-tape-strip', transform: `translate(${fmt(beside[0])} ${fmt(beside[1])}) rotate(${fmt(stripAngle)})` });
    const band = svgEl('rect', { class: 'ws-tape-strip__band', x: 0, y: -8, width: 0, height: 16, rx: 3 });
    const ticks = svgEl('rect', { class: 'ws-tape-strip__ticks', x: 0, y: -8, width: 0, height: 16, fill: 'url(#ws-tape-ticks)' });
    const hook = svgEl('rect', { class: 'ws-tape-strip__hook', x: -3, y: -12, width: 7, height: 24, rx: 2 });
    strip.append(band, ticks, hook);
    toolLayer.appendChild(strip);
    // The tape runs on from the tip of the strip straight into the tape measure in his hand.
    const lead = hand ? svgEl('line', { class: 'ws-tape-strip__lead' }) : null;
    if (hand) toolLayer.append(lead);
    const leadTo = (tip) => {
      const h = hand?.();
      if (!h) return;
      lead.setAttribute('x1', fmt(tip[0])); lead.setAttribute('y1', fmt(tip[1])); lead.setAttribute('x2', fmt(h[0])); lead.setAttribute('y2', fmt(h[1]));
    };
    s.group.classList.add('is-measuring');
    audio?.play('drawLine');
    await tween({ duration: reduced() ? 0 : 1500, ease: easings.mechanical, signal, onUpdate: (t) => {
      const along = vec.add(a, vec.mul(direction, length * t));
      band.setAttribute('width', fmt(length * t));
      ticks.setAttribute('width', fmt(length * t));
      hook.setAttribute('x', fmt(length * t - 3));
      onProgress?.(t, along);
      leadTo(vec.add(along, vec.mul(n, 20)));
    } });
    await wait(reduced() ? 0 : 450, signal);          // the reading settles on the tape
    strip.classList.add('is-leaving');
    lead?.classList.add('is-leaving');
    s.group.classList.remove('is-measuring');
    await wait(reduced() ? 0 : 400, signal);
    strip.remove();
    lead?.remove();
    visible.sideLabels = [...new Set([...normaliseSet(visible.sideLabels), index])];
    render();
    audio?.play('measure');
    playClassAnimation(sideLabels[index].group, 'is-pop', 600);   // the length slides out of the side
    await wait(reduced() ? 0 : 450, signal);
  }

  /** The arc of corner i sweeps open while the value counts up beside it (the beaver holds the protractor on it, PDF L11). */
  async function measureAngle(index, { signal } = {}) {
    const a = angles[index];
    const reading = measured.shownDeg[index];
    const radius = CORNER_RADIUS;
    angleClass(a, 'is-measuring', true);
    visible.angleLabels = [...new Set([...normaliseSet(visible.angleLabels), index])];
    render();
    setHidden(a.arc, false);                          // after the redraw, so the sweep is seen
    setHidden(a.wedge, false);
    a.arc.setAttribute('d', cornerArc(points, index, radius, 0.02));
    a.wedge.setAttribute('d', wedgePath(points, index, radius, 0.02));
    audio?.play('drawLine');
    await tween({ duration: reduced() ? 0 : 1400, ease: easings.mechanical, signal, onUpdate: (t) => {
      a.arc.setAttribute('d', cornerArc(points, index, radius, Math.max(0.02, t)));
      a.wedge.setAttribute('d', wedgePath(points, index, radius, Math.max(0.02, t)));
      a.label.textContent = `${Math.round(reading * t)}°`;
    } });
    a.arc.setAttribute('d', cornerArc(points, index, radius));
    a.label.textContent = formatDeg(reading);
    visible.angleArcs = [...new Set([...normaliseSet(visible.angleArcs), index])];
    render();                                         // the corner keeps its mark from now on
    audio?.play('measure');
    playClassAnimation(a.label, 'is-pop', 520);
    angleClass(a, 'is-measuring', false);
    await wait(reduced() ? 0 : 500, signal);
  }

  render();

  return {
    get points() { return points.map((p) => [...p]); },
    get measured() { return measured; },
    setPoints(next) {
      points = next.map((p) => [...p]);
      render();
    },
    /** Which parts show: sides, vertices, sideLabels, angleArcs, angleLabels (true | [indices]), ticks, square. */
    setVisible(next, { merge = true, instant = false } = {}) {
      visible = merge ? { ...visible, ...next } : { ...DEFAULT_VISIBLE, ...next };
      if (instant) tri.classList.add('is-instant');      // no fade: nothing of the old shape lingers
      render();
      if (instant) requestAnimationFrame(() => requestAnimationFrame(() => tri.classList.remove('is-instant')));
    },
    get visible() { return { ...visible }; },
    setTone(index, tone) {
      for (const el of [sides[index].group, sideLabels[index].group]) {
        if (tone) el.dataset.tone = tone;
        else delete el.dataset.tone;
      }
    },
    /** The shape's scale: 1 cm = PX_PER_CM × zoom px (the measuring screens show it bigger). */
    setZoom(zoom = 1) {
      pxPerCm = PX_PER_CM * zoom;
      pattern.setAttribute('width', fmt(pxPerCm));
      tickHalf.setAttribute('x', fmt(pxPerCm / 2 - 1));
      render();
    },
    get pxPerCm() { return pxPerCm; },
    get basePxPerCm() { return PX_PER_CM; },
    /** Removes any tape or trace left by a screen that was skipped mid-measure. */
    clearTools() {
      toolLayer.replaceChildren();
      fxLayer.querySelectorAll('.ws-trace-glow, .ws-tape-strip__lead').forEach((el) => el.remove());
    },
    clearTones() {
      for (const el of [...sides, ...sideLabels]) delete el.group.dataset.tone;
    },
    /** Names some sides: they glow, the others step back, and a spark runs along each named one. */
    emphasiseSides(indices) {
      sides.forEach((s, i) => s.group.classList.toggle('is-emphasis', indices.includes(i)));
      tri.classList.toggle('is-focusing', indices.length > 0);
      svg.closest('.workshop')?.classList.toggle('is-shape-focus', indices.length > 0);
      indices.forEach((i, n) => traceSide(i, { delay: n * 120 }));
    },
    emphasiseAngles(indices) {
      angles.forEach((a, i) => angleClass(a, 'is-emphasis', indices.includes(i)));
      tri.classList.toggle('is-focusing', indices.length > 0);
      svg.closest('.workshop')?.classList.toggle('is-shape-focus', indices.length > 0);
      indices.forEach((i, n) => traceAngle(i, { delay: n * 120 }));
    },
    clearEmphasis() {
      for (const s of sides) s.group.classList.remove('is-emphasis');
      for (const a of angles) angleClass(a, 'is-emphasis', false);
      tri.classList.remove('is-focusing');
      svg.closest('.workshop')?.classList.remove('is-shape-focus');
    },
    pulseSide: (i) => { traceSide(i); return playClassAnimation(sides[i].group, 'is-pulse', 620); },
    pulseSideLabel: (i) => playClassAnimation(sideLabels[i].group, 'is-pulse', 620),
    pulseAngle: (i) => { traceAngle(i); playClassAnimation(angles[i].mark, 'is-pulse', 700); return playClassAnimation(angles[i].group, 'is-pulse', 700); },
    pulseAll: () => playClassAnimation(tri, 'is-closed', 620),
    drawIn,
    morphTo,
    measureSide,
    measureAngle,
    showHint,
    ghostPath,
    clearHint,
    showCountChip,
    clearChips,
    sparkleVertices: () => points.forEach((p) => sparkleAt(p)),
    /** Dragging: enabled, goal ('isosceles' | 'equilateral' | 'right' | 'obtuse' | 'rightIsosceles'), bounds, callbacks. */
    setDrag(next) {
      drag = { ...drag, ...next };
      if (!drag.bounds) drag.bounds = { left: 50, top: 50, right: width - 50, bottom: height - 40 };
      svg.classList.toggle('is-draggable', Boolean(drag.enabled));
      if (!drag.enabled && active) endDrag(null);
    },
    get isDragging() { return Boolean(active); },
    toClient,
    solutionFor: (goal, index, bounds = drag.bounds) => solutionFor(goal, index, points, bounds),
    centroid: () => centroid(points),
    outwardNormal: (i) => outwardNormal(points, i),
  };
}
