/**
 * The Triangle Workshop, screen by screen. Only data lives here: the maths, wording, questions and
 * answers come from the source deck ("Triangles.pdf", learning and checkpoint pages); one flow
 * (js/learning/learning-flow.js) renders and runs every screen from it.
 *
 * Triangle specs (see triangle-model.js): sides [AB, BC, CA] in cm are the deck's left / bottom /
 * right labels; angles [A, B, C] are its top / left / right labels; pts are explicit cm coordinates.
 * `keep: true` keeps the learner's own triangle from the previous screen when it already has the
 * `requires` classification (so a discovery names the shape the learner actually made).
 */
/** Every learner-facing string is the deck's own wording (the spaceship framing is not used). */
export const LEARNING_COPY = Object.freeze({
  workshopTitle: 'Triangles',
  beaver: {
    enter: "Let's explore triangles!",
    leave: "You're ready!",
  },
  check: 'CHECK',
  continue: 'CONTINUE',
  greatJob: 'GREAT JOB!',
  summary: {
    heading: "Let's summarise what we learned.",
    sidesTitle: 'Triangles by sides',
    anglesTitle: 'Triangles by angles',
    both: 'A triangle can be classified by both its sides and its angles.',
    cta: "You're ready!",
  },
});

const SCALENE_546 = Object.freeze({ sides: [5, 6, 4] });            // left 5, bottom 6, right 4 (PDF L04)
const RIGHT_ISOSCELES = Object.freeze({ pts: [[0, 5], [0, 0], [5, 0]] });   // 5 / 5 / 7.1 with the 90° at B (PDF L18)

export const LEARNING_SCREENS = Object.freeze([
  /* ---- Recall ---- */
  { id: 'L01', kind: 'draw', triangle: { sides: [5, 6, 5] },
    narration: 'This is a triangle.' },
  { id: 'L02', kind: 'count', triangle: { sides: [5, 6, 5] }, keep: true, requires: null,
    narration: 'A closed shape with 3 straight sides is called a triangle.', focus: '3 straight sides' },
  { id: 'L03', kind: 'morph', triangle: { sides: [5, 6, 5] }, keep: true, requires: null,
    shapes: [{ sides: [6.2, 3.2, 6.2] }, { sides: [4.4, 7.2, 4.4] }, SCALENE_546],
    narration: "Triangles can be of different types. Let's explore them!" },

  /* ---- Sides ---- */
  { id: 'L04', kind: 'measureSides', zoom: 1.2, triangle: SCALENE_546,
    narration: "Let's measure the sides of this triangle.", focus: 'measure the sides' },
  { id: 'L05', kind: 'question', triangle: SCALENE_546, layout: 'stack',
    show: { sideLabels: true },
    question: {
      prompt: 'What do you notice about the sides?',
      options: ['All three are different', 'Two sides are equal', 'All three are equal'],
      correct: 'All three are different',
      reinforce: 'sides',
    } },
  { id: 'L06', kind: 'discover', triangle: SCALENE_546,
    show: { sideLabels: true }, tones: ['orange', 'green', 'purple'],
    badge: 'SCALENE', tone: 'scalene', cues: { highlight: 'all three sides different', name: 'scalene' },
    narration: 'A triangle with all three sides different is called a scalene triangle.', focus: 'scalene' },
  { id: 'L07', kind: 'drag', triangle: SCALENE_546, goal: 'isosceles', hintVertex: 0,
    show: { sideLabels: true, ticks: true },
    narration: 'What if two sides were equal?', instruction: 'Drag any vertex to make two sides equal.' },
  { id: 'L08', kind: 'discover', triangle: { sides: [5, 6, 5] }, keep: true, requires: 'isosceles',
    show: { sideLabels: true, ticks: true }, highlightEqual: true,
    badge: 'ISOSCELES', tone: 'isosceles', cues: { highlight: 'two equal sides', name: 'isosceles' },
    narration: 'A triangle with two equal sides is called an isosceles triangle.', focus: 'isosceles' },
  { id: 'L09', kind: 'drag', triangle: { pts: [[2.65, 4.24], [0, 0], [5.3, 0]] }, goal: 'equilateral', hintVertex: 2,
    show: { sideLabels: true, ticks: true },
    narration: 'Can you make all three sides equal?', instruction: 'Drag a vertex until the three lengths match.' },
  { id: 'L10', kind: 'discover', triangle: { sides: [5, 5, 5] }, keep: true, requires: 'equilateral',
    show: { sideLabels: true, ticks: true }, highlightEqual: true,
    badge: 'EQUILATERAL', tone: 'equilateral', cues: { highlight: 'all three sides equal', name: 'equilateral' },
    narration: 'A triangle with all three sides equal is called an equilateral triangle.', focus: 'equilateral' },

  /* ---- Checkpoints on sides ---- */
  { id: 'CFU01', kind: 'sort',
    narration: 'Sort the triangles.',
    cards: [
      { id: 'A', spec: { sides: [5, 6, 4] }, answer: 'scalene' },
      { id: 'B', spec: { sides: [5, 7, 5] }, answer: 'isosceles' },
      { id: 'C', spec: { sides: [6, 6, 6] }, answer: 'equilateral' },
    ],
    bins: [{ id: 'scalene', label: 'SCALENE' }, { id: 'isosceles', label: 'ISOSCELES' }, { id: 'equilateral', label: 'EQUILATERAL' }],
    success: 'Great job! You sorted all the triangles.' },
  { id: 'CFU02', kind: 'drag', triangle: SCALENE_546, goal: 'isosceles', hintVertex: 0, hintAfterMs: 20000,
    show: { sideLabels: true, ticks: true },
    narration: 'Make this triangle isosceles.',
    success: { badge: 'ISOSCELES', tone: 'isosceles', narration: 'Great! This triangle is isosceles.', highlightEqual: true, name: 'isosceles' } },

  /* ---- Angles ---- */
  { id: 'L11', kind: 'measureAngles', zoom: 1.2, triangle: { angles: [60, 60, 60], base: 5 },
    narration: "Now let's measure the angles.", focus: 'measure the angles' },
  { id: 'L12', kind: 'question', triangle: { angles: [60, 60, 60], base: 5 }, layout: 'stack',
    show: { angleArcs: true, angleLabels: true },
    question: {
      prompt: 'What do you notice about the angles?',
      options: ['All are acute angles', 'One angle is right angle', 'One angle is obtuse angle'],
      correct: 'All are acute angles',
      reinforce: 'angles',
    } },
  { id: 'L13', kind: 'compare90', triangle: { angles: [60, 60, 60], base: 5 },
    show: { angleArcs: true, angleLabels: true },
    narration: 'All three angles are less than 90°. So they are acute angles.', focus: 'less than 90°' },
  { id: 'L14', kind: 'discover', triangle: { angles: [60, 60, 60], base: 5 },
    show: { angleArcs: true, angleLabels: true }, highlightAngles: [0, 1, 2],
    badge: 'ACUTE-ANGLED', tone: 'acute', cues: { highlight: '3 acute angles', name: 'acute angled' },
    narration: 'A triangle which has 3 acute angles is called an acute angled triangle.', focus: 'acute angled' },
  { id: 'L15', kind: 'drag', triangle: { angles: [65, 62, 53], base: 5.6 }, goal: 'right', hintVertex: 0,
    show: { angleArcs: true, angleLabels: true, square: true },
    narration: 'Can you make one angle exactly 90°?', instruction: 'Drag a vertex; angles change live.' },
  { id: 'L16', kind: 'discover', triangle: { angles: [55, 90, 35], base: 5 }, keep: true, requires: 'right',
    show: { angleArcs: true, angleLabels: true, square: true }, highlightAngles: 'right',
    badge: 'RIGHT-ANGLED', tone: 'right', cues: { highlight: 'one angle equal to 90°', name: 'right angled' },
    narration: 'A triangle with one angle equal to 90° is called a right angled triangle.', focus: 'right angled' },
  { id: 'L17', kind: 'drag', triangle: { angles: [78, 54, 48], base: 6 }, goal: 'obtuse', hintVertex: 0,
    show: { angleArcs: true, angleLabels: true, square: true },
    narration: 'What if one of the angles was obtuse?', instruction: 'Drag any vertex to make any angle obtuse.' },
  { id: 'L18', kind: 'discover', triangle: { angles: [110, 40, 30], base: 7 }, keep: true, requires: 'obtuse',
    show: { angleArcs: true, angleLabels: true }, highlightAngles: 'obtuse',
    badge: 'OBTUSE-ANGLED', tone: 'obtuse', cues: { highlight: 'greater than 90°', name: 'obtuse-angled' },
    narration: 'A triangle with one angle greater than 90° is called an obtuse-angled triangle.', focus: 'greater than 90°' },

  /* ---- Checkpoints on angles ---- */
  { id: 'CFU03', kind: 'multi',
    narration: 'Which of these are acute-angled triangles?',
    cards: [
      { id: 'A', spec: { angles: [60, 50, 70], base: 5 } },
      { id: 'B', spec: { angles: [90, 40, 50], base: 6 } },
      { id: 'C', spec: { angles: [100, 40, 40], base: 6 } },
      { id: 'D', spec: { angles: [60, 60, 60], base: 5 } },
    ],
    correct: ['A', 'D'],
    success: 'Correct! Both A and D have only acute angles.' },
  { id: 'CFU04', kind: 'drag', triangle: { angles: [70, 60, 50], base: 5.6 }, goal: 'right', hintVertex: 0, hintAfterMs: 20000,
    show: { angleArcs: true, angleLabels: true, square: true },
    narration: 'Make this triangle right-angled.', instruction: 'Drag any vertex to create one 90° angle.',
    success: { badge: 'RIGHT-ANGLED', tone: 'right', narration: 'A triangle with one 90° angle is right-angled.', highlightAngles: 'right', name: 'right-angled' } },

  /* ---- Both ---- */
  { id: 'L19', kind: 'question', triangle: RIGHT_ISOSCELES, layout: 'stack',
    show: { sideLabels: true, ticks: true, angleLabels: [1], square: true },
    question: {
      prompt: 'What type of triangle is this by its sides?',
      options: ['Scalene', 'Isosceles', 'Equilateral'],
      correct: 'Isosceles',
      reinforce: 'equalSides',
    } },
  { id: 'L20', kind: 'question', triangle: RIGHT_ISOSCELES, layout: 'stack',
    show: { sideLabels: true, ticks: true, angleLabels: [1], square: true },
    question: {
      prompt: 'What type is this triangle by its angles?',
      options: ['Acute-angled', 'Right-angled', 'Obtuse-angled'],
      correct: 'Right-angled',
      reinforce: 'rightAngle',
    } },
  { id: 'L21', kind: 'dualReveal', layout: 'stack', triangle: RIGHT_ISOSCELES,
    show: { sideLabels: true, ticks: true, angleLabels: [1], square: true },
    badges: [{ text: 'ISOSCELES', tone: 'isosceles' }, { text: 'RIGHT-ANGLED', tone: 'right' }],
    narration: 'This triangle is both isosceles and right angled.', focus: 'both' },
  { id: 'L22', kind: 'lenses', layout: 'stack', triangle: RIGHT_ISOSCELES,
    show: { sideLabels: true, ticks: true, angleLabels: [1], square: true },
    lenses: [{ title: 'BY SIDES', result: 'Isosceles', tone: 'isosceles' }, { title: 'BY ANGLES', result: 'Right-angled', tone: 'right' }],
    narration: 'So a triangle can be classified by both its sides and its angles.', focus: 'both its sides and its angles' },

  /* ---- Checkpoints on both ---- */
  { id: 'CFU05', kind: 'dual', triangle: { sides: [4, 7.5, 5.1] }, layout: 'dual',
    show: { sideLabels: true, angleArcs: true, angleLabels: true },
    narration: 'Classify the triangle.',
    prompt: 'Classify by sides and angles.',
    groups: [
      { id: 'sides', label: 'BY SIDES', options: ['Scalene', 'Isosceles', 'Equilateral'], correct: 'Scalene', style: 'list' },
      { id: 'angles', label: 'BY ANGLES', options: ['Acute', 'Right', 'Obtuse'], correct: 'Obtuse', style: 'pills' },
    ],
    success: { badges: [{ text: 'SCALENE', tone: 'scalene' }, { text: 'OBTUSE-ANGLED', tone: 'obtuse' }],
      narration: 'Correct! This triangle is scalene and obtuse-angled.' } },
  { id: 'CFU06', kind: 'drag', layout: 'stack', triangle: SCALENE_546, goal: 'rightIsosceles', hintVertex: 0, hintAfterMs: 30000, silentSnaps: true,
    show: { sideLabels: true, ticks: true, angleLabels: true, square: true },
    narration: 'Make a right-angled isosceles triangle.', instruction: 'Satisfy both conditions in one shape.',
    success: { final: true, badges: [{ text: 'ISOSCELES', tone: 'isosceles' }, { text: 'RIGHT-ANGLED', tone: 'right' }],
      narration: 'You can classify triangles by sides and angles!' } },

  /* ---- Summary ---- */
  { id: 'SUMMARY', kind: 'summary',
    bySides: [
      { name: 'Scalene', tone: 'scalene', text: 'All sides are different.', spec: { sides: [5, 6, 4] }, labels: 'sides' },
      { name: 'Isosceles', tone: 'isosceles', text: 'Two sides are equal.', spec: { sides: [5, 6, 5] }, labels: 'sides' },
      { name: 'Equilateral', tone: 'equilateral', text: 'All three sides are equal.', spec: { sides: [5, 5, 5] }, labels: 'sides' },
    ],
    byAngles: [
      // All three angles different, so it is not mistaken for the equilateral card above it.
      { name: 'Acute-angled', tone: 'acute', text: 'All angles are less than 90°.', spec: { angles: [65, 70, 45], base: 5 }, labels: 'angles' },
      { name: 'Right-angled', tone: 'right', text: 'One angle is 90°.', spec: { angles: [60, 90, 30], base: 4 }, labels: 'angles' },
      { name: 'Obtuse-angled', tone: 'obtuse', text: 'One angle is greater than 90°.', spec: { angles: [120, 30, 30], base: 6 }, labels: 'angles' },
    ],
    example: { spec: RIGHT_ISOSCELES, badges: [{ text: 'Isosceles', tone: 'isosceles' }, { text: 'Right-angled', tone: 'right' }] } },
]);
