/**
 * Maths QA for the Triangle Workshop. Runs under JavaScriptCore (no DOM):
 *   /System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc -m tests/learning-model.test.js
 * Checks that every triangle in the content map is valid and really has the classification the deck
 * says, that every answer key matches the geometry, that snapping gives exact equality / right angles,
 * and that a dragged corner can never make a degenerate triangle.
 */
import { test, assert, report } from './harness.js';
import {
  measure, layoutFromSpec, cmPointsFromSpec, classifyBySides, classifyByAngles, formatCm, formatDeg,
  snapVertex, goalMet, solutionFor, constrainVertex, isValidTriangle, displayDegrees, PX_PER_CM, MIN_ALTITUDE_CM, SNAP_RADIUS_PX,
} from '../js/learning/triangle-model.js';
import { LEARNING_SCREENS } from '../js/learning/learning-content.js';

const FRAME = { cx: 780, cy: 300 };
const BOUNDS = { left: 80, top: 40, right: 1480, bottom: 600 };
const near = (a, b, tolerance = 0.01) => Math.abs(a - b) <= tolerance;
const place = (spec) => layoutFromSpec(spec, FRAME);
const BY_SIDES_OPTION = { 'All three are different': 'scalene', 'Two sides are equal': 'isosceles', 'All three are equal': 'equilateral', Scalene: 'scalene', Isosceles: 'isosceles', Equilateral: 'equilateral' };
const BY_ANGLES_OPTION = { 'All are acute angles': 'acute', 'One angle is right angle': 'right', 'One angle is obtuse angle': 'obtuse', 'Acute-angled': 'acute', 'Right-angled': 'right', 'Obtuse-angled': 'obtuse', Acute: 'acute', Right: 'right', Obtuse: 'obtuse' };

test('side specs reproduce the deck lengths (5 / 6 / 4 cm) on the canvas', () => {
  const m = measure(place({ sides: [5, 6, 4] }));
  assert.ok(near(m.cm[0], 5) && near(m.cm[1], 6) && near(m.cm[2], 4), `got ${m.cm.map((v) => v.toFixed(2))}`);
  assert.equal(m.bySides, 'scalene');
});

test('angle specs reproduce the deck angles and stand on the base line', () => {
  const m = measure(place({ angles: [65, 62, 53], base: 5.6 }));
  assert.ok(near(m.deg[0], 65, 0.01) && near(m.deg[1], 62, 0.01) && near(m.deg[2], 53, 0.01), `got ${m.deg}`);
  const pts = place({ angles: [60, 60, 60], base: 5 });
  assert.ok(near(pts[1][1], pts[2][1]), 'base corners sit on one line');
  assert.ok(pts[0][1] < pts[1][1], 'the apex is above the base');
  assert.ok(near((pts[0][1] + pts[1][1]) / 2, FRAME.cy, 0.01), 'the shape is centred on the frame');
});

test('the right isosceles triangle of L19-L22 is 5 / 5 / 7.1 cm with its 90° at B', () => {
  const m = measure(place({ pts: [[0, 5], [0, 0], [5, 0]] }));
  assert.equal(formatCm(m.cm[0]), '5 cm');
  assert.equal(formatCm(m.cm[1]), '5 cm');
  assert.equal(formatCm(m.cm[2]), '7.1 cm');
  assert.equal(m.rightAt, 1);
  assert.equal(m.bySides, 'isosceles');
  assert.equal(m.byAngles, 'right');
});

test('CFU05 triangle reads 4 / 7.5 / 5.1 cm and 110° / 40° / 30°, scalene and obtuse', () => {
  const m = measure(place({ sides: [4, 7.5, 5.1] }));
  assert.deepEqual(m.cm.map(formatCm), ['4 cm', '7.5 cm', '5.1 cm']);
  assert.deepEqual(m.deg.map(formatDeg), ['110°', '40°', '30°']);
  assert.equal(m.bySides, 'scalene');
  assert.equal(m.byAngles, 'obtuse');
});

test('every lesson triangle is a valid triangle and has the classification its screen needs', () => {
  for (const screen of LEARNING_SCREENS) {
    const specs = [screen.triangle, ...(screen.shapes ?? []), ...(screen.silhouettes ?? []), ...(screen.cards ?? []).map((c) => c.spec), ...(screen.bySides ?? []).map((c) => c.spec), ...(screen.byAngles ?? []).map((c) => c.spec), screen.example?.spec].filter(Boolean);
    for (const spec of specs) {
      const vertices = place(spec);
      assert.ok(isValidTriangle(vertices), `${screen.id}: ${JSON.stringify(spec)} is not a usable triangle`);
    }
    if (screen.triangle && screen.requires) {
      const m = measure(place(screen.triangle));
      assert.ok(m.bySides === screen.requires || m.byAngles === screen.requires, `${screen.id}: canonical triangle is ${m.bySides}/${m.byAngles}, screen needs ${screen.requires}`);
    }
    if (screen.kind === 'discover' && screen.triangle) {
      const m = measure(place(screen.triangle));
      const named = screen.tone;
      assert.ok(m.bySides === named || m.byAngles === named, `${screen.id}: badge ${screen.badge} but the triangle is ${m.bySides}/${m.byAngles}`);
    }
  }
});

test('every question has exactly one correct option, and it matches the geometry', () => {
  for (const screen of LEARNING_SCREENS.filter((s) => s.kind === 'question')) {
    const { question } = screen;
    assert.ok(question.options.includes(question.correct), `${screen.id}: correct option missing`);
    assert.equal(question.options.filter((o) => o === question.correct).length, 1);
    const m = measure(place(screen.triangle));
    const expected = BY_SIDES_OPTION[question.correct] ?? BY_ANGLES_OPTION[question.correct];
    assert.ok(expected === m.bySides || expected === m.byAngles, `${screen.id}: answer "${question.correct}" but triangle is ${m.bySides}/${m.byAngles}`);
    for (const option of question.options) {
      if (option === question.correct) continue;
      const wrong = BY_SIDES_OPTION[option] ?? BY_ANGLES_OPTION[option];
      assert.ok(wrong !== m.bySides && wrong !== m.byAngles, `${screen.id}: option "${option}" is also true: ambiguous`);
    }
  }
});

test('CFU01 sorting answers match the card geometry (isosceles means exactly two equal sides)', () => {
  const screen = LEARNING_SCREENS.find((s) => s.id === 'CFU01');
  for (const card of screen.cards) assert.equal(measure(place(card.spec)).bySides, card.answer, `card ${card.id}`);
  assert.deepEqual(screen.cards.map((c) => c.answer).sort(), screen.bins.map((b) => b.id).sort(), 'one card per crate');
});

test('CFU03: exactly the cards with three acute angles are the answer', () => {
  const screen = LEARNING_SCREENS.find((s) => s.id === 'CFU03');
  const acute = screen.cards.filter((c) => measure(place(c.spec)).byAngles === 'acute').map((c) => c.id).sort();
  assert.deepEqual(acute, [...screen.correct].sort());
  const b = measure(place(screen.cards[1].spec));
  assert.equal(b.rightAt, 0, 'card B has its right angle at the top, as drawn in the deck');
});

test('CFU05: both answer keys match the geometry', () => {
  const screen = LEARNING_SCREENS.find((s) => s.id === 'CFU05');
  const m = measure(place(screen.triangle));
  assert.equal(BY_SIDES_OPTION[screen.groups[0].correct], m.bySides);
  assert.equal(BY_ANGLES_OPTION[screen.groups[1].correct], m.byAngles);
});

test('summary cards show what they name', () => {
  const screen = LEARNING_SCREENS.find((s) => s.id === 'SUMMARY');
  for (const card of screen.bySides) assert.equal(measure(place(card.spec)).bySides, card.tone, card.name);
  for (const card of screen.byAngles) assert.equal(measure(place(card.spec)).byAngles, card.tone, card.name);
  const example = measure(place(screen.example.spec));
  assert.ok(example.bySides === 'isosceles' && example.byAngles === 'right');
});

test('a drag start never already satisfies its goal (nothing is given away)', () => {
  for (const screen of LEARNING_SCREENS.filter((s) => s.kind === 'drag')) {
    assert.ok(!goalMet(screen.goal, measure(place(screen.triangle))), `${screen.id} starts already ${screen.goal}`);
  }
});

test('classification tolerances match what the labels show', () => {
  assert.equal(classifyBySides([5, 5.02, 6]), 'isosceles');
  assert.equal(classifyBySides([5, 5.1, 6]), 'scalene');
  assert.equal(classifyBySides([5, 5, 5.02]), 'equilateral');
  assert.equal(classifyByAngles([89.6, 50, 40.4]), 'right');
  assert.equal(classifyByAngles([90.6, 50, 39.4]), 'obtuse');
  assert.equal(classifyByAngles([89.4, 50, 40.6]), 'acute');
  assert.equal(formatCm(5.04), '5 cm');
  assert.equal(formatCm(4.94), '4.9 cm');
  assert.equal(formatCm(7.0711), '7.1 cm');
  assert.equal(formatDeg(89.6), '90°');
  assert.equal(formatDeg(90.49), '90°');
});

test('snapping onto the bisector makes two sides equal to the pixel', () => {
  const vertices = place({ sides: [5, 6, 4] });
  const [, b, c] = vertices;
  const midX = (b[0] + c[0]) / 2;
  const wanted = [midX + 6, vertices[0][1]];                     // 6 px off the bisector
  const { point, snapped } = snapVertex('isosceles', 0, wanted, vertices);
  assert.equal(snapped, 'equal');
  const m = measure([point, b, c]);
  assert.ok(near(m.cm[0], m.cm[2], 1e-9), 'AB = CA exactly');
  assert.ok(goalMet('isosceles', m));
  assert.ok(!goalMet('isosceles', measure([[midX + 40, vertices[0][1]], b, c])), 'well off the bisector it stays scalene');
});

test('snapping onto the circle on diameter BC makes exactly one 90° angle', () => {
  const vertices = place({ angles: [65, 62, 53], base: 5.6 });
  const [, b, c] = vertices;
  const target = solutionFor('right', 0, vertices);
  const wanted = [target[0] + 5, target[1] - 5];
  const { point, snapped } = snapVertex('right', 0, wanted, vertices);
  assert.equal(snapped, 'right');
  const m = measure([point, b, c]);
  assert.ok(near(m.deg[0], 90, 1e-6), `angle at A is ${m.deg[0]}`);
  assert.equal(m.byAngles, 'right');
  assert.equal(m.deg.filter((d) => Math.abs(d - 90) < 0.49).length, 1);
});

test('the equilateral apex and the right-isosceles points are exact', () => {
  const start = place({ pts: [[2.65, 4.24], [0, 0], [5.3, 0]] });
  const apex = solutionFor('equilateral', 0, start);
  const eq = measure([snapVertex('equilateral', 0, [apex[0] + 7, apex[1] + 7], start).point, start[1], start[2]]);
  assert.equal(eq.bySides, 'equilateral');
  assert.ok(near(eq.cm[0], eq.cm[1], 1e-9) && near(eq.cm[1], eq.cm[2], 1e-9));
  const scalene = place({ sides: [5, 6, 4] });
  const ri = solutionFor('rightIsosceles', 0, scalene);
  const snap = snapVertex('rightIsosceles', 0, [ri[0] + 8, ri[1] - 6], scalene);
  assert.equal(snap.snapped, 'rightIsosceles');
  const m = measure([snap.point, scalene[1], scalene[2]]);
  assert.ok(goalMet('rightIsosceles', m), `${m.bySides} ${m.byAngles} ${m.deg}`);
  assert.equal(m.rightAt, 0);
});

test('every goal has a reachable solution for every corner', () => {
  for (const screen of LEARNING_SCREENS.filter((s) => s.kind === 'drag')) {
    const vertices = place(screen.triangle);
    for (let i = 0; i < 3; i += 1) {
      const solution = solutionFor(screen.goal, i, vertices, BOUNDS);
      const settled = constrainVertex(i, solution, vertices, BOUNDS);
      const snapped = snapVertex(screen.goal, i, settled, vertices).point;
      const m = measure(vertices.map((v, k) => (k === i ? snapped : v)));
      assert.ok(goalMet(screen.goal, m), `${screen.id}: corner ${i} solution gives ${m.bySides}/${m.byAngles}`);
    }
  }
});

test('a corner dragged through the opposite side stays a usable triangle on its own side', () => {
  const vertices = place({ sides: [5, 6, 4] });
  const pushed = constrainVertex(0, [vertices[0][0], vertices[1][1] + 80], vertices, BOUNDS);
  const result = vertices.map((v, i) => (i === 0 ? pushed : v));
  assert.ok(isValidTriangle(result, BOUNDS));
  assert.ok(pushed[1] <= vertices[1][1] - MIN_ALTITUDE_CM * PX_PER_CM + 0.01, 'kept above the base by the minimum altitude');
  const squeezed = constrainVertex(0, [vertices[1][0] + 2, vertices[1][1] - 2], vertices, BOUNDS);
  assert.ok(isValidTriangle(vertices.map((v, i) => (i === 0 ? squeezed : v)), BOUNDS), 'never on top of another corner');
  const outside = constrainVertex(0, [-500, -500], vertices, BOUNDS);
  assert.ok(outside[0] >= BOUNDS.left && outside[1] >= BOUNDS.top, 'clamped to the board');
});

test('labels that look equal are equal: the snap magnet is wider than the label rounding', () => {
  // Two sides whose labels both read 5.0 cm differ by at most 0.1 cm = 5.6 px; the magnet reaches further.
  assert.ok(SNAP_RADIUS_PX > 0.1 * PX_PER_CM, `snap ${SNAP_RADIUS_PX}px vs rounding ${0.1 * PX_PER_CM}px`);
});

test('the angles shown add up to 180°, equal angles read equal, 90° only on a right angle', () => {
  const cases = [[33.5, 56.5, 90], [59.6, 60.4, 60], [60.4, 60.4, 59.2], [90.6, 44.7, 44.7], [89.4, 45.3, 45.3], [110.5, 40.25, 29.25],
    [88.85, 45.575, 45.575], [89, 45.5, 45.5], [120, 30, 30]];
  for (const deg of cases) {
    const shown = displayDegrees(deg);
    assert.equal(shown.reduce((sum, d) => sum + d, 0), 180, `${deg} -> ${shown}`);
    shown.forEach((d, i) => assert.ok((d === 90) === (Math.abs(deg[i] - 90) <= 0.49), `${deg} -> ${shown}: 90 only for a right angle`));
    [[0, 1], [1, 2], [0, 2]].forEach(([i, j]) => { if (Math.abs(deg[i] - deg[j]) < 0.05) assert.equal(shown[i], shown[j], `${deg} -> ${shown}: equal angles show equal`); });
    shown.forEach((d, i) => assert.ok(Math.abs(d - deg[i]) < 1.6, `${deg} -> ${shown}: close to the true angle`));
  }
  for (const screen of LEARNING_SCREENS.filter((s) => s.triangle)) {
    assert.equal(measure(place(screen.triangle)).shownDeg.reduce((sum, d) => sum + d, 0), 180, screen.id);
  }
});

test('sides counted as equal always read the same length', () => {
  const m = measure([[0, 0], [4.949 * PX_PER_CM, 0], [2.4745 * PX_PER_CM, 4.2995 * PX_PER_CM]].map(([x, y]) => [x, y]));
  m.equalSides.forEach((equal, i) => { if (equal) m.equalSides.forEach((other, j) => { if (other) assert.equal(m.shownCm[i], m.shownCm[j]); }); });
});

test('every screen id is unique', () => {
  const ids = LEARNING_SCREENS.map((screen) => screen.id);
  assert.equal(new Set(ids).size, ids.length);
});

report('learning-model');
