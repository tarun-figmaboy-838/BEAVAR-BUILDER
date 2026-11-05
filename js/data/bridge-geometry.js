/**
 * Truss geometry from the deck's "Final Bridge Design" (PDF p8) and the task-by-task drawings
 * (PDF p11-18), mapped into stage space. The apex diagonals meet the deck so that the central
 * panel is a true equilateral triangle, so every panel the game highlights is mathematically exact.
 *
 * Each stage lists:
 *   members  beams the crew builds (PDF line drawing for that step)
 *   bolts    joints that receive bolted gusset plates
 *   panelType  the triangle type those panels are, coloured as in the PDF p7 legend
 *   panels   the triangles of the chosen type that appear in the bridge ("all the places where the
 *            chosen triangle appears on the bridge will be added simultaneously", PDF p10)
 *   socket   the drop spot: under the centre of the first panel, where the frame fits (computed below)
 */
/*
 * The truss spans the canal from quay to quay (end to end). Proportions follow PDF p9; the
 * constraints keep every highlighted panel exactly its type:
 *   the apex diagonals meet the deck so A-D1-D2 is equilateral (and so are A-H1-H2 and A-K1-K2),
 *   M1/M2 sit high on the chords so the side struts stand nearly upright, the posts and end braces are vertical.
 */
const DECK_Y = 640;                                     // the deck rests on the quay blocks of the backdrop
const SPAN = Object.freeze({ left: 220, right: 1700 });
const APEX = Object.freeze([960, 290]);
const RISE = DECK_Y - APEX[1];
const HALF_BASE = RISE / Math.sqrt(3);                  // half of the equilateral A-D1-D2's base
const CROWN = 0.24;                                     // crown bar, as a share of the rise (PDF p9)
const MIDDLE = 0.58;                                    // middle bar
const END_BRACE = 0.14;                                 // end-brace post, as a share along the chord
const STRUT_TOP = 0.78;                                 // where the side struts meet the chord: they lean out slightly toward the deck, as on PDF p9

const round = (n) => Math.round(n * 10) / 10;
const onDiagonal = (share, side) => [round(APEX[0] + side * HALF_BASE * share), round(APEX[1] + RISE * share)];
const onChord = (share, end) => [round(end + (APEX[0] - end) * share), round(DECK_Y - RISE * share)];

const NODES = Object.freeze({
  L: [SPAN.left, DECK_Y],
  R: [SPAN.right, DECK_Y],
  A: [...APEX],
  C: [APEX[0], DECK_Y],
  D1: onDiagonal(1, -1),
  D2: onDiagonal(1, 1),
  M1: onChord(STRUT_TOP, SPAN.left),
  M2: onChord(STRUT_TOP, SPAN.right),
  K1: onDiagonal(CROWN, -1),
  K2: onDiagonal(CROWN, 1),
  H1: onDiagonal(MIDDLE, -1),
  H2: onDiagonal(MIDDLE, 1),
  V1: [onDiagonal(MIDDLE, -1)[0], DECK_Y],
  V2: [onDiagonal(MIDDLE, 1)[0], DECK_Y],
  E1: onChord(END_BRACE, SPAN.left),
  E2: onChord(END_BRACE, SPAN.right),
  F1: [onChord(END_BRACE, SPAN.left)[0], DECK_Y],
  F2: [onChord(END_BRACE, SPAN.right)[0], DECK_Y],
});

/** The drop spot of each step is the centre of the first panel the chosen frame fills: drop where it fits. */
function withSockets(stages) {
  return Object.freeze(stages.map((stage) => {
    const corners = stage.panels[0].map((name) => NODES[name]);
    const x = corners.reduce((sum, p) => sum + p[0], 0) / 3;
    const y = corners.reduce((sum, p) => sum + p[1], 0) / 3;
    return Object.freeze({ ...stage, socket: Object.freeze({ x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 }) });
  }));
}

export const BRIDGE_GEOMETRY = Object.freeze({
  deckY: DECK_Y,
  apex: APEX,
  spanLeft: SPAN.left,
  spanRight: SPAN.right,
  pillarXs: Object.freeze([SPAN.left + 70, APEX[0], SPAN.right - 70]),
  pillarTopY: 676,
  pillarWidth: 176,
  nodes: NODES,
  stages: withSockets([
    {
      id: 'outer-frame',   // p11 → p12
      panelType: 'isosceles',
      members: [['L', 'R'], ['L', 'A'], ['A', 'R']],
      bolts: [],
      panels: [['L', 'A', 'R']],
    },
    {
      id: 'apex-diagonals',   // p12 → p13: both diagonals at once; the crew also bolts the frame
      panelType: 'equilateral',
      members: [['A', 'D1'], ['A', 'D2']],
      bolts: ['L', 'A', 'R', 'D1', 'D2'],
      panels: [['A', 'D1', 'D2']],
    },
    {
      id: 'side-struts',   // p14 → p15
      panelType: 'scalene',
      members: [['M1', 'D1'], ['M2', 'D2']],
      bolts: ['M1', 'M2'],
      panels: [['L', 'M1', 'D1'], ['R', 'M2', 'D2']],
    },
    {
      id: 'crown-bar',   // p15 → p16: the crown bar and the middle bar below it, as drawn on p16
      panelType: 'acute',
      members: [['K1', 'K2'], ['H1', 'H2']],
      bolts: ['K1', 'K2'],
      panels: [['A', 'K1', 'K2']],
    },
    {
      id: 'center-posts',   // p16 → p17: centre posts and end braces together
      panelType: 'right',
      members: [['A', 'C'], ['H1', 'V1'], ['H2', 'V2'], ['H1', 'C'], ['H2', 'C'], ['E1', 'F1'], ['E1', 'D1'], ['E2', 'F2'], ['E2', 'D2']],
      bolts: ['C', 'V1', 'V2', 'E1', 'E2', 'F1', 'F2'],
      panels: [['H1', 'V1', 'C'], ['H2', 'V2', 'C'], ['L', 'F1', 'E1'], ['R', 'F2', 'E2']],
    },
    {
      id: 'upper-diagonals',   // p17 → p18
      panelType: 'obtuse',
      members: [['M1', 'K1'], ['M2', 'K2']],
      bolts: [],
      panels: [['M1', 'K1', 'A'], ['M2', 'K2', 'A']],
    },
  ]),
  /** Hotspots on the How-to-Play screen (PDF p6 marks three spots on the deck). */
  demoSpots: Object.freeze([[690, 580], [960, 560], [1230, 580]]),
});

export function stageById(stageId) {
  return BRIDGE_GEOMETRY.stages.find((stage) => stage.id === stageId) ?? null;
}

export function memberId(from, to) {
  return `${from}-${to}`;
}
