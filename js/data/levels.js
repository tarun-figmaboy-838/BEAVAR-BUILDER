/**
 * Six levels, one per triangle type of the PDF p7 legend, in the deck's build order (PDF pages 11-17;
 * the deck repeats the equilateral task on p13 without adding a beam, so it is played once).
 * Only data lives here; one level engine renders and runs all of them.
 */
/**
 * The same frames as the PDF (p11-17), arranged so no correct frame sits right under its own drop spot:
 * the learner always has to carry it across with the crane (the PDF's middle frames were correct in
 * tasks 1 and 5, directly under their drop spots, so the hook never had to move).
 */
export const OPTION_GROUPS = Object.freeze({
  sides: Object.freeze(['isosceles', 'scalene', 'equilateral']),
  angles: Object.freeze(['acute', 'obtuse', 'right']),
});

export const LEVELS = Object.freeze([
  Object.freeze({
    id: 1,
    instruction: 'Choose a triangle with exactly 2 equal sides.',
    focus: 'exactly 2 equal sides',   // key words, shown in the highlight colour
    optionGroup: 'sides',
    correctTriangleId: 'isosceles',
    rule: 'exactlyTwoEqualSides',
    bridgeStage: 'outer-frame',
  }),
  Object.freeze({
    id: 2,
    instruction: 'Choose an equilateral triangle.',
    focus: 'equilateral',   // key words, shown in the highlight colour
    optionGroup: 'sides',
    correctTriangleId: 'equilateral',
    rule: 'equilateral',
    bridgeStage: 'apex-diagonals',
  }),
  Object.freeze({
    id: 3,
    instruction: 'Choose a triangle where all 3 sides have different lengths.',
    focus: 'all 3 sides have different lengths',   // key words, shown in the highlight colour
    optionGroup: 'sides',
    correctTriangleId: 'scalene',
    rule: 'allSidesDifferent',
    bridgeStage: 'side-struts',
  }),
  Object.freeze({
    id: 4,
    instruction: 'Choose an acute-angled triangle.',
    focus: 'acute-angled',   // key words, shown in the highlight colour
    optionGroup: 'angles',
    correctTriangleId: 'acute',
    rule: 'acute',
    bridgeStage: 'crown-bar',
  }),
  Object.freeze({
    id: 5,
    instruction: 'Choose a triangle with one 90° angle.',
    focus: 'one 90° angle',   // key words, shown in the highlight colour
    optionGroup: 'angles',
    correctTriangleId: 'right',
    rule: 'rightAngle',
    bridgeStage: 'center-posts',
  }),
  Object.freeze({
    id: 6,
    instruction: 'Choose a triangle with one angle greater than 90°.',
    focus: 'one angle greater than 90°',   // key words, shown in the highlight colour
    optionGroup: 'angles',
    correctTriangleId: 'obtuse',
    rule: 'obtuseAngle',
    bridgeStage: 'upper-diagonals',
  }),
]);

export const LEVEL_COUNT = LEVELS.length;
