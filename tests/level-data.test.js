/**
 * Maths QA (release blocker): every task has exactly one correct frame in its option group,
 * the correct frame satisfies the task's rule from measured geometry, and the deck's wording,
 * order and bridge progression are intact.
 */
import { test, assert, report } from './harness.js';
import { LEVELS, OPTION_GROUPS, LEVEL_COUNT } from '../js/data/levels.js';
import { TRIANGLES } from '../js/data/triangles.js';
import { RULES, classifyBySides, classifyByAngles, angles } from '../js/data/triangle-geometry.js';
import { BRIDGE_GEOMETRY, stageById } from '../js/data/bridge-geometry.js';
import { PLATFORM_LAYOUT, CRANE_LAYOUT } from '../js/data/layout.js';
import { FRAME_PAD } from '../js/gameplay/frame-shapes.js';

const PDF_INSTRUCTIONS = [
  'Choose a triangle with exactly 2 equal sides.',
  'Choose an equilateral triangle.',
  'Choose a triangle where all 3 sides have different lengths.',
  'Choose an acute-angled triangle.',
  'Choose a triangle with one 90° angle.',
  'Choose a triangle with one angle greater than 90°.',
];

test('six levels, one per triangle type of the PDF p7 legend, in the deck order with the exact PDF wording', () => {
  assert.equal(LEVEL_COUNT, 6);
  assert.deepEqual(LEVELS.map((level) => level.instruction), PDF_INSTRUCTIONS);
  assert.deepEqual(LEVELS.map((level) => level.id), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual([...new Set(LEVELS.map((level) => level.correctTriangleId))].sort(), ['acute', 'equilateral', 'isosceles', 'obtuse', 'right', 'scalene']);
});

test('correct answers match the deck', () => {
  assert.deepEqual(
    LEVELS.map((level) => level.correctTriangleId),
    ['isosceles', 'equilateral', 'scalene', 'acute', 'right', 'obtuse']
  );
});

test('option groups follow the deck (sides for levels 1-3, angles for levels 4-6), same three frames each', () => {
  assert.deepEqual(LEVELS.slice(0, 3).map((level) => level.optionGroup), ['sides', 'sides', 'sides']);
  assert.deepEqual(LEVELS.slice(3).map((level) => level.optionGroup), ['angles', 'angles', 'angles']);
  assert.deepEqual([...OPTION_GROUPS.sides].sort(), ['equilateral', 'isosceles', 'scalene']);
  assert.deepEqual([...OPTION_GROUPS.angles].sort(), ['acute', 'obtuse', 'right']);
});

test('every task makes the learner carry the correct frame across: it never starts under its drop spot', () => {
  const SLOTS = PLATFORM_LAYOUT.slotXs;
  for (const level of LEVELS) {
    const slot = SLOTS[OPTION_GROUPS[level.optionGroup].indexOf(level.correctTriangleId)];
    const vertices = TRIANGLES[level.correctTriangleId].vertices;
    const xs = vertices.map((v) => v[0]);
    const minX = Math.min(...xs);
    const width = Math.max(...xs) - minX + 2 * FRAME_PAD;
    const top = vertices.reduce((best, v) => (v[1] < best[1] || (v[1] === best[1] && v[0] < best[0]) ? v : best));
    const grab = top[0] - minX + FRAME_PAD;
    const centre = xs.reduce((sum, x) => sum + x, 0) / 3 - minX + FRAME_PAD;
    const pickX = slot - width / 2 + grab;
    const dropX = stageById(level.bridgeStage).socket.x - (centre - grab);
    assert.ok(Math.abs(pickX - dropX) > CRANE_LAYOUT.socketTolerance + 20, `task ${level.id}: hook travels only ${Math.abs(pickX - dropX).toFixed(0)} px`);
  }
});

test('measured silhouettes classify as their role by sides', () => {
  assert.equal(classifyBySides(TRIANGLES.equilateral.vertices), 'equilateral');
  assert.equal(classifyBySides(TRIANGLES.isosceles.vertices), 'isosceles');
  assert.equal(classifyBySides(TRIANGLES.scalene.vertices), 'scalene');
});

test('measured silhouettes classify as their role by angles', () => {
  assert.equal(classifyByAngles(TRIANGLES.acute.vertices), 'acute');
  assert.equal(classifyByAngles(TRIANGLES.right.vertices), 'right');
  assert.equal(classifyByAngles(TRIANGLES.obtuse.vertices), 'obtuse');
  assert.ok(Math.max(...angles(TRIANGLES.obtuse.vertices)) > 100, 'the obtuse angle must be visually obvious');
});

for (const level of LEVELS) {
  test(`task ${level.id}: exactly one option satisfies "${level.instruction}"`, () => {
    const rule = RULES[level.rule];
    assert.ok(rule, `unknown rule ${level.rule}`);
    const satisfying = OPTION_GROUPS[level.optionGroup].filter((id) => rule(TRIANGLES[id].vertices));
    assert.deepEqual(satisfying, [level.correctTriangleId]);
  });
}

test('every option is drawn from exact vertices, top corner first, with the PDF marks for its group', () => {
  for (const id of [...OPTION_GROUPS.sides, ...OPTION_GROUPS.angles]) {
    const frame = TRIANGLES[id];
    assert.equal(frame.vertices.length, 3, `${id} vertices`);
    assert.equal(frame.vertices[0][1], Math.min(...frame.vertices.map((v) => v[1])), `${id}: first vertex must be the top corner the claw grabs`);
    assert.ok(frame.marks, `${id}: marks`);
  }
  assert.deepEqual(TRIANGLES.equilateral.marks.ticks, [2, 2, 2]);
  assert.equal(TRIANGLES.isosceles.marks.ticks.filter(Boolean).length, 2);
  assert.equal(new Set(TRIANGLES.scalene.marks.ticks).size, 3);
  assert.ok(TRIANGLES.right.marks.square !== undefined, 'the right frame has its right-angle square');
});

test('the right-angle square sits on the 90° corner, and the shapes are clearly their type', () => {
  const rightAngles = angles(TRIANGLES.right.vertices);
  assert.ok(Math.abs(rightAngles[TRIANGLES.right.marks.square] - 90) < 1e-6, `right corner is ${rightAngles[TRIANGLES.right.marks.square]}`);
  assert.ok(Math.max(...angles(TRIANGLES.obtuse.vertices)) > 115, 'obtuse angle must be obvious');
  assert.ok(Math.max(...angles(TRIANGLES.acute.vertices)) < 80, 'acute angles must be clearly below 90°');
  assert.ok(Math.max(...angles(TRIANGLES.scalene.vertices)) < 84 || Math.max(...angles(TRIANGLES.scalene.vertices)) > 96, 'the scalene frame must not look right-angled');
  const [a, b, c] = angles(TRIANGLES.equilateral.vertices);
  assert.ok(Math.abs(a - 60) < 0.01 && Math.abs(b - 60) < 0.01 && Math.abs(c - 60) < 0.01, 'equilateral is exact');
});

test('bridge stages exist for every task and together make the full deck design', () => {
  const stageIds = LEVELS.map((level) => level.bridgeStage);
  assert.deepEqual(stageIds, ['outer-frame', 'apex-diagonals', 'side-struts', 'crown-bar', 'center-posts', 'upper-diagonals']);
  const allMembers = new Set();
  for (const id of stageIds) {
    const stage = stageById(id);
    assert.ok(stage, `stage ${id}`);
    for (const [from, to] of stage.members) {
      assert.ok(BRIDGE_GEOMETRY.nodes[from] && BRIDGE_GEOMETRY.nodes[to], `nodes ${from}-${to}`);
      const key = [from, to].sort().join('-');
      assert.ok(!allMembers.has(key), `member ${key} built twice`);
      allMembers.add(key);
    }
    assert.ok(stage.socket.x > BRIDGE_GEOMETRY.spanLeft && stage.socket.x < BRIDGE_GEOMETRY.spanRight, `${id}: drop spot must be on the bridge`);
    assert.ok(stage.panels.length > 0, `${id}: the chosen triangle must appear somewhere on the bridge`);
  }
  assert.equal(allMembers.size, 20);
});

test('every level builds something new: level 2 adds both apex diagonals (p13), level 4 the crown and middle bars (p16)', () => {
  assert.deepEqual(stageById('apex-diagonals').members, [['A', 'D1'], ['A', 'D2']]);
  assert.deepEqual(stageById('crown-bar').members, [['K1', 'K2'], ['H1', 'H2']]);
  for (const level of LEVELS) assert.ok(stageById(level.bridgeStage).members.length > 0, `task ${level.id} adds no beam`);
});

test('the truss reaches from quay to quay', () => {
  assert.ok(BRIDGE_GEOMETRY.spanLeft <= 240 && BRIDGE_GEOMETRY.spanRight >= 1680);
});

test('PDF progression: end braces arrive with the centre posts (p17); level 6 adds the upper diagonals (p18)', () => {
  const posts = stageById('center-posts').members.map((pair) => pair.join('-'));
  for (const brace of ['E1-F1', 'E1-D1', 'E2-F2', 'E2-D2']) assert.ok(posts.includes(brace), `missing ${brace}`);
  assert.deepEqual(stageById('upper-diagonals').members, [['M1', 'K1'], ['M2', 'K2']]);
});

/** Each highlighted panel must really be the triangle type its task asks for. */
const PANEL_RULE_BY_STAGE = {
  'outer-frame': 'exactlyTwoEqualSides',
  'apex-diagonals': 'equilateral',
  'side-struts': 'allSidesDifferent',
  'crown-bar': 'acute',
  'center-posts': 'rightAngle',
  'upper-diagonals': 'obtuseAngle',
};
for (const [stageId, ruleName] of Object.entries(PANEL_RULE_BY_STAGE)) {
  test(`bridge panels for ${stageId} satisfy "${ruleName}"`, () => {
    for (const panel of stageById(stageId).panels) {
      const vertices = panel.map((name) => BRIDGE_GEOMETRY.nodes[name]);
      assert.ok(RULES[ruleName](vertices), `${panel.join('-')} is not ${ruleName}`);
    }
  });
}

test('each drop spot is under the centre of the panel the frame fits into (drop where it fits)', () => {
  for (const level of LEVELS) {
    const stage = stageById(level.bridgeStage);
    const corners = stage.panels[0].map((name) => BRIDGE_GEOMETRY.nodes[name]);
    const cx = corners.reduce((sum, p) => sum + p[0], 0) / 3;
    assert.ok(Math.abs(stage.socket.x - cx) < 0.6, `task ${level.id}: drop spot x=${stage.socket.x}, panel centre x=${cx.toFixed(1)}`);
  }
});

test('panel colours follow the task: every panel of a step is the chosen triangle type', () => {
  for (const level of LEVELS) assert.equal(stageById(level.bridgeStage).panelType, level.correctTriangleId, `task ${level.id}`);
});

test('each correct frame is an exact smaller copy of its place on the bridge (same shape and orientation)', () => {
  for (const level of LEVELS) {
    const frame = TRIANGLES[level.correctTriangleId].vertices;
    const panel = stageById(level.bridgeStage).panels[0].map((name) => BRIDGE_GEOMETRY.nodes[name]);
    const centre = (t) => [0, 1].map((k) => t.reduce((sum, p) => sum + p[k], 0) / 3);
    const [fx, fy] = centre(frame);
    const [px, py] = centre(panel);
    // some pairing of corners must match by one uniform scale, with no rotation
    const fits = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]].some((order) => {
      const target = order.map((k) => panel[k]);
      const scale = Math.hypot(target[0][0] - px, target[0][1] - py) / Math.hypot(frame[0][0] - fx, frame[0][1] - fy);
      return frame.every(([x, y], i) => Math.hypot(px + (x - fx) * scale - target[i][0], py + (y - fy) * scale - target[i][1]) < 1.5);
    });
    assert.ok(fits, `task ${level.id}: the ${level.correctTriangleId} frame is not the shape of its place`);
  }
});

report('level-data');
