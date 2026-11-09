/**
 * Stage-space layout constants (1920 x 1080 master composition).
 * CSS mirrors the structural values in styles/tokens.css.
 */
export const STAGE = Object.freeze({ width: 1920, height: 1080, centerX: 960, centerY: 540 });

/** The kit's tower crane, standing on the left quay; the jib is tiled across the canal. Kit pixels × KIT_SCALE. */
export const KIT_SCALE = 0.68;
export const CRANE_RIG = Object.freeze({
  /** The tower is the kit sprite cut in three, with extra mast sections so the jib runs along the top edge. */
  tower: Object.freeze({
    left: -140,
    top: 15.5,
    width: 312.8,
    topSrc: 'assets/images/crane-kit/tower-top.png', topHeight: 318.2,
    mastSrc: 'assets/images/crane-kit/tower-mast.png', mastHeight: 42.84, mastSections: 5,
    baseSrc: 'assets/images/crane-kit/tower-base.png', baseHeight: 118.3,
  }),
  jibTile: Object.freeze({ src: 'assets/images/crane-kit/jib-tile.png', width: 129, height: 109 }),
  jibStartX: 172,
  jibTiles: 13,
  jibTip: Object.freeze({ src: 'assets/images/crane-kit/jib-tip.png', width: 119, height: 109 }),
  trolley: Object.freeze({ src: 'assets/images/crane-kit/trolley.png', width: 233, height: 67, top: 8.5 }),
  /**
   * The operator cabin (art 1312 x 1199, shown at 300 x 274), hung under the jib on a steel mount, its
   * dark back plate over the mast lattice and its roof beacon clear of the jib. `operator-cabin-clear`
   * is the supplied cabin with its dashboard painted out: the operator's own joystick box is the control.
   */
  cabin: Object.freeze({ src: 'assets/images/crane-v2/operator-cabin-clear.png', frontSrc: 'assets/images/crane-v2/operator-cabin-front.png', left: -12.1, top: 94, width: 300, height: 274 }),   // body flush with the screen's left edge
  /** Steel mount from the jib down to the cabin's back plate. */
  cabinMount: Object.freeze({ left: 21.9, top: 90, width: 34, height: 44 }),
  /** The seated operator (2 x 2 atlas cells): back against the seat back, feet and joystick box on the cab floor. */
  cabWindow: Object.freeze({ left: 63.4, top: 181.6, width: 144, height: 144 }),
  /** A glow centred on the beacon painted on the cab roof; it pulses while the crane moves. */
  cabBeacon: Object.freeze({ left: 75.5, top: 74.7, size: 90 }),
  claw: Object.freeze({
    states: Object.freeze([
      Object.freeze({ id: 'open', src: 'assets/images/crane-kit/claw-open.png', width: 124, height: 191 }),
      Object.freeze({ id: 'half', src: 'assets/images/crane-kit/claw-half.png', width: 94, height: 196 }),
      Object.freeze({ id: 'closed', src: 'assets/images/crane-kit/claw-closed.png', width: 87, height: 198 }),
    ]),
  }),
});

export const CRANE_LAYOUT = Object.freeze({
  pivotY: 71.5,         // where the cable leaves the trolley: the pendulum pivot
  minX: 330,
  maxX: 1690,
  homeX: 1660,
  parkX: 1660,
  restY: 236,         // claw top when fully raised: below the task sign, so the claw is never hidden behind it
  maxY: 760,           // claw top when fully lowered: reaches the apex of the flattest frame
  maxSpeed: 500,       // px per second along the jib (empty hook)
  carrySpeed: 400,     // px per second with a frame on the hook: it feels heavier
  hoistSpeed: 460,     // px per second up/down (scripted: the claw's height is automatic)
  depthSpeed: 0.55,    // depth units per second with UP / DOWN (0 = over the yard, 1 = over the bridge deck)
  pickDepthReach: 0.08,  // the claw can only pick while it is this close to the yard's plane
  gripOffsetY: 176,    // distance from claw top to the point held between the jaws
  clawHeight: 198,
  optionTolerance: 72, // horizontal forgiveness when picking
  homeTolerance: 72,   // horizontal forgiveness when returning a frame to its slot
});

export const PLATFORM_LAYOUT = Object.freeze({
  src: 'assets/images/bridge/yard-platform.png', // the hazard-stripe yard platform (2139 x 422)
  left: 310,
  top: 890,
  width: 1300,
  deckLeft: 425,       // usable plate surface (inside the yellow end caps)
  deckRight: 1495,
  slotXs: Object.freeze([590, 960, 1330]),
  baseY: 950,          // where frames stand: centred on the grey plate
  pileXs: Object.freeze([520, 759, 950, 1161, 1400]),   // equal 43 px gaps between the yard frames
  pileBaseY: 950,
  optionScale: 1,
  pileScale: 0.72,
});

/**
 * The control pad (bottom-left): four arrow keys on a cross plate, PICK in its centre socket.
 * 280 px keeps the pad clear of the yard platform's left end cap (x 310). DROP sits bottom-right.
 * A tap holds its direction at least `tapMs`, so a quick tap is a small, controlled nudge.
 */
export const CONTROLS_LAYOUT = Object.freeze({
  padSize: 280,
  tapMs: 120,
});

export const WATER_LINE_Y = 745;   // where the backdrop's quay blocks meet the water

/**
 * The low road deck at walkway level (supplied deck art, sliced): left end cap, repeated road plates,
 * right end cap, all at `scale`. Its end caps rest on the quay walkways, so the road runs straight on
 * from both banks; grey arches under its yellow beam spring from three piers in the canal.
 * Art rows (supplied deck art): road top 316, frame-standing line 370, beam bottom 431, cap bottom 470.
 */
export const DECK_LAYOUT = Object.freeze({
  x1: 168, x2: 1752,
  scale: 0.37,
  art: Object.freeze({ top: 316, stand: 370, beamBottom: 431, capBottom: 470 }),
  left: Object.freeze({ src: 'assets/images/bridge/deck-left.png', width: 351, height: 154 }),
  tile: Object.freeze({ src: 'assets/images/bridge/deck-tile.png', width: 224, height: 115 }),
  right: Object.freeze({ src: 'assets/images/bridge/deck-right.png', width: 347, height: 154 }),
  bracket: Object.freeze({ src: 'assets/images/bridge/deck-bracket.png', width: 180, height: 108, scale: 0.36 }),
});

/** The three short brick piers in the canal (cap + bricks cut from the supplied bridge reference). */
export const PIER_LAYOUT = Object.freeze({
  src: 'assets/images/bridge/pier.png', artWidth: 292, artHeight: 154,
  xs: Object.freeze([345, 960, 1575]), width: 118, topY: 724,
  waterY: 758,          // the waterline on the piers: below the cap, the bricks fade into the canal
});
