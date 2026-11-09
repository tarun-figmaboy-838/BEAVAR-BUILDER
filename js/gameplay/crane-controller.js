import { CRANE_LAYOUT, CRANE_RIG, PLATFORM_LAYOUT } from '../data/layout.js';
import { tween, wait, easings } from '../core/motion.js';
import { debugLog } from '../core/debug-overlay.js';
import { buildClawFrames } from './claw-controller.js';
import { DEPTH, depthScale, groundY, frontToScreen, screenToFront } from './depth-projection.js';

/**
 * The crane's states. Player input only moves the crane in the drivable ones; everything else is an
 * awaited scripted sequence (pick, transport, return), and only the transitions below are allowed.
 */
export const CRANE_STATES = Object.freeze({
  IDLE: 'idle',
  MOVING: 'moving',
  ALIGNED_WITH_TRIANGLE: 'alignedWithTriangle',
  LOWERING_TO_PICK: 'loweringToPick',
  GRABBING: 'grabbing',
  LIFTING_TRIANGLE: 'liftingTriangle',
  CARRYING: 'carrying',                    // holding a frame, ready to transport (DROP is live)
  TRANSPORTING_DEPTH: 'transportingDepth',
  ALIGNING_WITH_BRIDGE: 'aligningWithBridge',
  LOWERING_TO_PLACE: 'loweringToPlace',
  RELEASING: 'releasing',
  RETURNING: 'returning',
  LOCKED: 'locked',
});

const S = CRANE_STATES;
/** Every legal move of the state machine; anything else is refused (and logged in debug mode). */
const TRANSITIONS = Object.freeze({
  [S.IDLE]: [S.MOVING, S.ALIGNED_WITH_TRIANGLE, S.LOCKED],
  [S.MOVING]: [S.IDLE, S.ALIGNED_WITH_TRIANGLE, S.LOCKED],
  [S.ALIGNED_WITH_TRIANGLE]: [S.IDLE, S.MOVING, S.LOWERING_TO_PICK, S.LOCKED],
  [S.LOWERING_TO_PICK]: [S.GRABBING, S.LOCKED],
  [S.GRABBING]: [S.LIFTING_TRIANGLE, S.LOCKED],
  [S.LIFTING_TRIANGLE]: [S.CARRYING, S.LOCKED],
  [S.CARRYING]: [S.TRANSPORTING_DEPTH, S.LOCKED],
  [S.TRANSPORTING_DEPTH]: [S.ALIGNING_WITH_BRIDGE, S.LOCKED],
  [S.ALIGNING_WITH_BRIDGE]: [S.LOWERING_TO_PLACE, S.LOCKED],
  [S.LOWERING_TO_PLACE]: [S.RELEASING, S.LOCKED],
  [S.RELEASING]: [S.RETURNING, S.LOCKED],
  [S.RETURNING]: [S.IDLE, S.LOCKED],
  // Scripted sequences (and the how-to demonstration) start from a locked crane.
  [S.LOCKED]: [S.IDLE, S.MOVING, S.ALIGNED_WITH_TRIANGLE, S.CARRYING, S.LOWERING_TO_PICK, S.TRANSPORTING_DEPTH, S.RETURNING],
});

const DRIVABLE_STATES = new Set([S.IDLE, S.MOVING, S.ALIGNED_WITH_TRIANGLE, S.CARRYING]);

const MAX_SWAY_DEG = 7;
const LIFT_CLEARANCE = 70;      // after a pick the frame hangs this far above the yard plate: clearly off it
const DEPTH_TRAVEL_MS = 1900;   // the move from the yard (z 0) to the bridge (z 1)
/** The jib slews about the top of the tower (the mast's centre line, the jib's centre line). */
const SLEW_PIVOT = Object.freeze({ x: 29.4, y: 56.5 });
const RETURN_MS = 1250;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function sprite(className, src, style = {}) {
  const image = new Image();
  image.className = className;
  image.src = src;
  image.alt = '';
  image.draggable = false;
  Object.assign(image.style, style);
  return image;
}

/** Raster crane kit, recomposed around a larger three-quarter operator cabin. */
function buildStructure() {
  const { tower, jibTile, jibTip, cabin, cabinMount } = CRANE_RIG;
  const mount = document.createElement('span');
  mount.className = 'crane-cabin-mount';
  Object.assign(mount.style, { left: `${cabinMount.left}px`, top: `${cabinMount.top}px`, width: `${cabinMount.width}px`, height: `${cabinMount.height}px` });
  const structure = document.createElement('div');
  structure.className = 'crane-structure';
  const mast = document.createElement('div');
  mast.className = 'crane-tower__mast';
  Object.assign(mast.style, {
    position: 'absolute', left: '-127px', top: '70px', width: '312.8px', height: '530px',
    backgroundImage: `url("${tower.mastSrc}")`, backgroundSize: '312.8px 42.84px',
  });
  /** One lattice side of the jib (the kit's tiled girder and its tip). */
  const jibSide = (className) => {
    const face = document.createElement('div');
    face.className = `crane-arm__face ${className}`;
    const girder = document.createElement('div');
    girder.className = 'crane-jib';
    Object.assign(girder.style, {
      left: '0px', top: '15.5px', width: '1806px', height: '82px',
      backgroundImage: `url("${jibTile.src}")`, backgroundSize: '129px 82px',
    });
    face.append(girder, sprite('crane-jib-tip', jibTip.src, { left: '1806px', top: '15.5px', width: '119px', height: '82px' }));
    return face;
  };
  // The jib is a box truss (a lattice side in front, one behind, the underside between them), so it has
  // real volume when it slews: the back lattice shows through the front one and the underside opens up.
  // Jib, tip and trolley form one arm that turns about the tower top into the scene.
  const arm = document.createElement('div');
  arm.className = 'crane-arm';
  arm.style.transformOrigin = `${SLEW_PIVOT.x}px ${SLEW_PIVOT.y}px`;
  const underside = document.createElement('div');
  underside.className = 'crane-arm__face crane-arm__face--under';
  const { trolley } = CRANE_RIG;
  const trolleyImage = sprite('trolley', trolley.src, { position: 'absolute', left: `${-trolley.width / 2}px`, top: `${trolley.top}px`, width: `${trolley.width}px`, height: `${trolley.height}px` });
  arm.append(jibSide('crane-arm__face--back'), underside, jibSide('crane-arm__face--front'), trolleyImage);
  structure.append(mast,
    // The base holds the foot of the mast, so it shares the mast's scale and left edge exactly; the tower stands
    // just off-screen left and the base's plinth ends before the bridge's left end cap (x 168).
    sprite('crane-base', tower.baseSrc, { position: 'absolute', left: '-127px', top: '562.7px', width: '312.8px', height: '118.3px' }),
    arm,
    mount,
    sprite('crane-cabin', cabin.src, { position: 'absolute', left: `${cabin.left}px`, top: `${cabin.top}px`, width: `${cabin.width}px`, height: `${cabin.height}px` }),
  );
  return { structure, arm, trolley: trolleyImage };
}

/**
 * Builds the crane, the hoist rig (pendulum, cable, claw, cargo) and the load's ground shadow.
 * The crane is drawn in real 3D (CSS perspective calibrated to the painted horizon, js/gameplay/
 * depth-projection.js): the jib arm slews into the scene and the hoist hangs from the trolley at its true
 * 3D position, always facing the camera, so the load shrinks and recedes with the whole machine.
 */
export function buildCraneDom(craneEl, platformEl) {
  const { structure, arm, trolley: trolleyImage } = buildStructure();
  craneEl.appendChild(structure);
  // The shadow lies on the ground under the load (yard plate, water, then the bridge deck), below the rig.
  const shadow = document.createElement('div');
  shadow.className = 'claw-shadow';
  craneEl.appendChild(shadow);
  const rig = document.createElement('div');
  rig.className = 'trolley-rig';
  rig.innerHTML = `
    <div class="pendulum">
      <div class="hoist">
        <span class="cable"></span>
        <div class="hoist__load">
          <div class="claw"></div>
          <div class="claw-cargo"></div>
        </div>
      </div>
    </div>`;
  // The warning light lives on the cab roof (painted in the tower sprite); a lit copy flashes over it.
  const { cabBeacon } = CRANE_RIG;
  const beacon = document.createElement('span');
  beacon.className = 'cab-beacon';
  Object.assign(beacon.style, { left: `${cabBeacon.left}px`, top: `${cabBeacon.top}px`, width: `${cabBeacon.size}px`, height: `${cabBeacon.size}px` });
  beacon.innerHTML = '<span class="cab-beacon__light cab-beacon__light--orange"></span><span class="cab-beacon__light cab-beacon__light--red"></span>';
  craneEl.append(rig, beacon);
  buildClawFrames(rig.querySelector('.claw'));
  return { rig, arm, trolley: trolleyImage, beacon, shadow, platformEl };
}

/**
 * The crane in three axes, in world coordinates (x and the claw's y as seen on the front plane, depth
 * 0 = over the yard, 1 = over the bridge deck): LEFT / RIGHT move the trolley across, UP / DOWN slew the
 * jib so the trolley and hook travel into / out of the scene, and the claw's height is automatic (PICK
 * lowers and lifts; DROP lifts, carries, lowers). Every scripted motion is an awaited sequence that cannot
 * overlap another.
 */
export function createCraneController({ craneEl, dom, claw, gameState, audio }) {
  const { rig, arm, trolley, beacon, shadow, platformEl } = dom;
  const pendulumEl = rig.querySelector('.pendulum');
  const hoistEl = rig.querySelector('.hoist');
  const cargoEl = rig.querySelector('.claw-cargo');
  const trolleyHalf = CRANE_RIG.trolley.width / 2;

  const motion = { x: CRANE_LAYOUT.homeX, vx: 0, y: CRANE_LAYOUT.restY, vy: 0, depth: 0, vz: 0, sway: 0, swayVelocity: 0 };
  const axis = { x: 0, y: 0 };
  const rendered = { x: NaN, y: NaN, sway: NaN, depth: NaN };
  let lastX = motion.x;
  let lastY = motion.y;
  let lastMeasuredVx = 0;
  let state = S.LOCKED;
  let carried = null;
  let carryMaxY = CRANE_LAYOUT.maxY;   // while carrying, the frame can't be lowered back into the yard
  let scriptedMotions = 0;
  let hoverResolver = () => ({});
  let motorRunning = false;
  let winchRunning = false;
  let sequenceRunning = false;
  let unlockWhenLanded = false;        // the level unlocked while the empty hook was still flying back
  craneEl.dataset.state = state;

  /** Moves the state machine; refuses (and reports) any transition the table does not allow. */
  function setState(next) {
    if (state === next) return true;
    if (!TRANSITIONS[state]?.includes(next)) {
      debugLog('crane', `refused ${state} -> ${next}`);
      return false;
    }
    state = next;
    craneEl.dataset.state = next;
    gameState.update({ craneState: next });
    debugLog('crane', 'state', next);
    return true;
  }

  function publishBusy() {
    const busy = sequenceRunning || scriptedMotions > 0;
    if (gameState.get().craneBusy !== busy) gameState.update({ craneBusy: busy });
  }

  function ropeLength() {
    return motion.y - CRANE_LAYOUT.pivotY;
  }

  /**
   * The load's shadow on the ground below it (yard plate, water, bridge deck): under the frame's centre
   * when carrying, as wide as the frame; darker and tighter as the load comes down, smaller with depth.
   */
  function renderShadow(scale) {
    const ground = groundY(motion.depth);
    const heightAbove = PLATFORM_LAYOUT.baseY - motion.y;            // claw-top height above the ground (world px)
    const closeness = clamp(1 - (heightAbove - 260) / 560, 0, 1);
    const swayOffset = Math.sin((motion.sway * Math.PI) / 180) * (ropeLength() + 80) * scale;
    const overYard = motion.depth < 0.06 && !platformEl.classList.contains('is-away')
      && motion.x > PLATFORM_LAYOUT.deckLeft - 40 && motion.x < PLATFORM_LAYOUT.deckRight + 40;
    const overScene = motion.depth >= 0.06;                            // the empty hook's shadow crosses the water too
    const worldX = carried ? motion.x + (carried.centroid[0] - carried.grabX * carried.width) : motion.x;
    const centreX = frontToScreen({ x: worldX, y: 0, z: motion.depth }).x;
    const width = carried ? (carried.width / 170) * 0.9 : 1;          // the shadow art is 170 px wide
    const opacity = carried ? 0.5 + closeness * 0.4 : 0.45 + closeness * 0.55;
    shadow.style.opacity = carried || overYard || overScene ? opacity.toFixed(2) : '0';
    const spread = (1.15 - closeness * 0.35) * scale;
    shadow.style.transform = `translate(${(centreX + swayOffset).toFixed(1)}px, ${(ground + 4 * scale).toFixed(1)}px) scale(${(spread * width).toFixed(3)}, ${spread.toFixed(3)})`;
  }

  /**
   * The jib slews about the tower top so that the trolley, `reach` out along it, sits over (x, depth): the
   * whole arm turns into the scene in perspective and the trolley rides it. The hoist rig hangs from that
   * same 3D point, facing the camera.
   */
  function render() {
    const scale = depthScale(motion.depth);
    if (motion.x !== rendered.x || motion.depth !== rendered.depth) {
      const back = motion.depth * DEPTH.distancePx;
      const across = motion.x - SLEW_PIVOT.x;
      const slew = (Math.atan2(back, across) * 180) / Math.PI;
      const reach = Math.hypot(across, back);
      arm.style.transform = back > 0.01 ? `rotateY(${slew.toFixed(3)}deg)` : '';
      trolley.style.left = `${(SLEW_PIVOT.x + reach - trolleyHalf).toFixed(2)}px`;
      rig.style.transform = back > 0.01 ? `translate3d(${motion.x.toFixed(2)}px, 0, ${(-back).toFixed(2)}px)` : `translateX(${motion.x.toFixed(2)}px)`;
      rendered.x = motion.x;
      rendered.depth = motion.depth;
    }
    if (motion.y !== rendered.y) {
      hoistEl.style.transform = `translateY(${ropeLength().toFixed(2)}px)`;
      rendered.y = motion.y;
    }
    if (Math.abs(motion.sway - rendered.sway) > 0.01) {
      pendulumEl.style.transform = `rotate(${motion.sway.toFixed(2)}deg)`;
      rendered.sway = motion.sway;
    }
    renderShadow(scale);
  }

  function refreshHoverState(isMoving) {
    if (carried) {
      setState(S.CARRYING);
      return;
    }
    const hover = hoverResolver(motion.x, carried, motion.depth) ?? {};
    const hoveredId = hover.option?.id ?? null;
    if (gameState.get().hoveredOptionId !== hoveredId) gameState.update({ hoveredOptionId: hoveredId });
    setState(hoveredId ? S.ALIGNED_WITH_TRIANGLE : isMoving ? S.MOVING : S.IDLE);
  }

  /** Authored pendulum: the load lags when the trolley starts and settles with a small swing when it stops. */
  function updateSway(dt, measuredVx) {
    const acceleration = (measuredVx - lastMeasuredVx) / dt;
    lastMeasuredVx = measuredVx;
    const length = Math.max(140, ropeLength() + 90);
    const stiffness = 2600 / length;
    const damping = carried ? 2.2 : 1.8;
    const drive = (-acceleration * (carried ? 0.1 : 0.08) * 57.3) / length;
    motion.swayVelocity += (drive - motion.sway * stiffness - motion.swayVelocity * damping) * dt;
    motion.sway = clamp(motion.sway + motion.swayVelocity * dt, -MAX_SWAY_DEG, MAX_SWAY_DEG);
  }

  function setLoop(name, on, options) {
    if (on) audio.startLoop(name, options);
    else audio.stopLoop(name);
  }

  function update(dt) {
    if (dt <= 0) return;
    const drivable = scriptedMotions === 0 && !sequenceRunning && DRIVABLE_STATES.has(state);
    const maxSpeed = carried ? CRANE_LAYOUT.carrySpeed : CRANE_LAYOUT.maxSpeed;   // a load makes the crane heavier
    const targetVx = drivable ? axis.x * maxSpeed : 0;
    const targetVz = drivable ? -axis.y * CRANE_LAYOUT.depthSpeed * (carried ? 0.85 : 1) : 0;   // UP = away from the camera
    // Accelerate gently (weight), brake a little faster (a tap is a small nudge, a release a smooth stop).
    motion.vx += (targetVx - motion.vx) * Math.min(1, dt * (targetVx ? (carried ? 3.6 : 4.6) : 7));
    motion.vz += (targetVz - motion.vz) * Math.min(1, dt * (targetVz ? 4 : 7));
    if (!targetVx && Math.abs(motion.vx) < 2) motion.vx = 0;
    if (!targetVz && Math.abs(motion.vz) < 0.004) motion.vz = 0;
    if (scriptedMotions === 0) {
      motion.x = clamp(motion.x + motion.vx * dt, CRANE_LAYOUT.minX, CRANE_LAYOUT.maxX);
      if (motion.x === CRANE_LAYOUT.minX || motion.x === CRANE_LAYOUT.maxX) motion.vx = 0;
      if (motion.vz) {
        motion.depth = clamp(motion.depth + motion.vz * dt, 0, 1);    // the jib slews; the hook keeps its height
        if (motion.depth === 0 || motion.depth === 1) motion.vz = 0;
      }
    }

    const measuredVx = (motion.x - lastX) / dt;
    const measuredVy = (motion.y - lastY) / dt;
    lastX = motion.x;
    lastY = motion.y;
    updateSway(dt, measuredVx);

    // Sound follows the player's motion: the trolley motor for travel (along the jib or in depth), the winch
    // for the cable. Scripted sequences play their own cues, so these loops never double up with them.
    const travelling = Math.abs(measuredVx) > 6 || Math.abs(motion.vz) > 0.03;
    const winching = Math.abs(measuredVy) > 6;
    trolley.classList.toggle('is-running', travelling);
    if (!sequenceRunning) {
      if (travelling !== motorRunning) {
        motorRunning = travelling;
        setLoop('craneMotor', travelling, { heavy: Boolean(carried) });
      }
      if (winching !== winchRunning) {
        winchRunning = winching;
        setLoop('winch', winching);
      }
    }
    beacon.classList.toggle('is-flashing', travelling || winching || sequenceRunning);
    if (drivable) refreshHoverState(travelling || winching);

    const current = gameState.get();
    if (Math.abs(current.craneX - motion.x) >= 1 || Math.abs(current.hoistY - motion.y) >= 1 || Math.abs((current.craneDepth ?? 0) - motion.depth) >= 0.01) {
      gameState.update({ craneX: Math.round(motion.x), hoistY: Math.round(motion.y), craneDepth: Math.round(motion.depth * 100) / 100 });
    }
    render();
  }

  /** One scripted motion: the crane follows `apply` along a tween and ignores the player meanwhile. */
  async function runScripted({ duration, ease = easings.mechanical, signal, apply }) {
    scriptedMotions += 1;
    publishBusy();
    try {
      await tween({ from: 0, to: 1, duration, ease, signal, onUpdate: apply });
    } finally {
      scriptedMotions -= 1;
      motion.vx = 0;
      motion.vy = 0;
      publishBusy();
    }
  }

  function glideTo(x, { duration, ease, signal } = {}) {
    const from = motion.x;
    const to = clamp(x, CRANE_LAYOUT.minX, CRANE_LAYOUT.maxX);
    if (Math.abs(to - from) < 0.5) return Promise.resolve();
    const ms = duration ?? clamp((Math.abs(to - from) / CRANE_LAYOUT.maxSpeed) * 1000 * 1.15, 160, 1100);
    return runScripted({ duration: ms, ease, signal, apply: (t) => { motion.x = from + (to - from) * t; } });
  }

  function hoistTo(y, { duration, ease, signal } = {}) {
    const from = motion.y;
    const to = clamp(y, CRANE_LAYOUT.restY, CRANE_LAYOUT.maxY);
    if (Math.abs(to - from) < 0.5) return Promise.resolve();
    const ms = duration ?? clamp((Math.abs(to - from) / (CRANE_LAYOUT.hoistSpeed * 1.25)) * 1000 * 1.15, 160, 1100);
    return runScripted({ duration: ms, ease, signal, apply: (t) => { motion.y = from + (to - from) * t; } });
  }

  /** Damp the pendulum to rest before the claw touches anything, so frames never jump. */
  async function settleSway(signal, duration = 220) {
    if (Math.abs(motion.sway) < 0.05 && Math.abs(motion.swayVelocity) < 0.5) return;
    const from = motion.sway;
    scriptedMotions += 1;
    publishBusy();
    try {
      await tween({ from, to: 0, duration, ease: easings.outCubic, signal, onUpdate: (value) => { motion.sway = value; motion.swayVelocity = 0; } });
    } finally {
      scriptedMotions -= 1;
      publishBusy();
    }
  }

  /** Claw-top y at which a frame held by the claw hangs `clearance` px above the yard plate. */
  function clawTopAboveYard(option, clearance) {
    const hang = CRANE_LAYOUT.gripOffsetY - option.grabY + 2 + option.baseOffset;
    return clamp(PLATFORM_LAYOUT.baseY - clearance - hang, CRANE_LAYOUT.restY, CRANE_LAYOUT.maxY);
  }

  function attach(option) {
    carried = option;
    carryMaxY = clawTopAboveYard(option, LIFT_CLEARANCE);
    option.element.classList.add('is-carried');
    option.element.classList.remove('is-hovered');
    option.element.style.left = `${-option.grabX * option.width}px`;
    option.element.style.top = `${-option.grabY + 2}px`;
    cargoEl.appendChild(option.element);
    gameState.update({ carriedTriangleId: option.id, hoveredOptionId: null });
  }

  /** Detaches the carried frame: where its top-left corner sits on the stage, and at what scale. */
  function release() {
    if (!carried) return null;
    const option = carried;
    const claw = frontToScreen({ x: motion.x, y: motion.y, z: motion.depth });
    const scale = claw.scale;
    carried = null;
    carryMaxY = CRANE_LAYOUT.maxY;
    const left = claw.x - option.grabX * option.width * scale;
    const top = claw.y + (CRANE_LAYOUT.gripOffsetY - option.grabY + 2) * scale;
    option.element.classList.remove('is-carried');
    gameState.update({ carriedTriangleId: null });
    return { option, left, top, scale };
  }

  async function withSequence(run) {
    if (sequenceRunning) return null;
    sequenceRunning = true;
    if (winchRunning) {
      winchRunning = false;
      audio.stopLoop('winch');
    }
    if (motorRunning) {
      motorRunning = false;
      audio.stopLoop('craneMotor');
    }
    publishBusy();
    try {
      return await run();
    } finally {
      sequenceRunning = false;
      publishBusy();
    }
  }

  return {
    update,
    get state() {
      return state;
    },
    get carried() {
      return carried;
    },
    get position() {
      return { x: motion.x, y: motion.y, depth: motion.depth };
    },
    get isBusy() {
      return sequenceRunning || scriptedMotions > 0;
    },
    setAxis(next) {
      axis.x = clamp(next.x, -1, 1);
      axis.y = clamp(next.y, -1, 1);
    },
    setHoverResolver(resolver) {
      hoverResolver = resolver;
    },
    lock() {
      axis.x = 0;
      axis.y = 0;
      unlockWhenLanded = false;
      setState(S.LOCKED);
    },
    unlock() {
      if (state === S.RETURNING) {
        unlockWhenLanded = true;                // the return trip hands control back when it lands
        return;
      }
      if (state === S.LOCKED) setState(carried ? S.CARRYING : S.IDLE);
    },
    glideTo,
    hoistTo,
    /** Kick the hook so it swings and settles (entrance, comic beats). */
    swingImpulse(amount = 20) {
      motion.swayVelocity += amount;
    },
    teleport(x, y = CRANE_LAYOUT.restY) {
      motion.x = clamp(x, CRANE_LAYOUT.minX - 700, CRANE_LAYOUT.maxX + 700);
      motion.y = y;
      motion.depth = 0;
      lastX = motion.x;
      lastY = motion.y;
      lastMeasuredVx = 0;
      motion.vz = 0;
      motion.sway = 0;
      motion.swayVelocity = 0;
      render();
    },

    /** PICK: open → line up → lower → close → squeeze → lift the frame clear of the yard. */
    pickUp(option, { signal } = {}) {
      return withSequence(async () => {
        if (carried || !setState(S.LOWERING_TO_PICK)) return false;
        audio.play('clawOpen');
        await claw.open();
        if (motion.depth > 0) {                                           // slew back over the yard first
          const from = motion.depth;
          await runScripted({ duration: 220, ease: easings.outCubic, signal, apply: (t) => { motion.depth = from * (1 - t); } });
          motion.depth = 0;
        }
        await glideTo(option.grabStageX, { signal, duration: 220 });
        await settleSway(signal);
        audio.play('winchDown');
        await hoistTo(option.grabStageY - CRANE_LAYOUT.gripOffsetY + 6, { signal, ease: easings.outCubic });
        setState(S.GRABBING);
        await wait(90, signal);
        audio.play('clawClose');
        await claw.close();
        attach(option);
        audio.play('pickup');
        audio.play('boing');
        option.element.classList.add('is-lifted');                      // a quick squash-and-stretch as it leaves the yard
        setTimeout(() => option.element.classList.remove('is-lifted'), 520);
        await claw.squeeze();
        await wait(60, signal);
        setState(S.LIFTING_TRIANGLE);
        audio.play('winchUp');
        await hoistTo(carryMaxY, { signal, duration: 520, ease: easings.outCubic });
        this.swingImpulse(5);                                             // the weight settles on the cable
        setState(S.CARRYING);
        return true;
      });
    },

    /**
     * DROP: the whole crane move, as one sequence:
     *   lift (straight up off the yard) → into depth (yard plane to bridge plane, the load shrinking
     *   in perspective, its shadow crossing the water) → approach (a long slow-down) → align over the
     *   spot → lower until the frame's base stands on the road → place (a small seat) → release.
     * `target(scale)` returns { x, y }: the trolley x and claw-top y that seat the frame at that scale.
     * `onPhase(name)` lets the level engine frame each beat with the camera.
     * Resolves with { option, left, top, scale } (where the frame now stands) or null.
     */
    transportToBridge(target, { signal, onPhase } = {}) {
      return withSequence(async () => {
        if (!carried || !setState(S.TRANSPORTING_DEPTH)) return null;
        const farScale = depthScale(1);
        const seat = target(farScale);                                     // stage coordinates on the bridge
        const spot = screenToFront({ x: seat.x, y: seat.y, z: 1 });        // the same point for the crane (world)

        const alreadyOver = motion.depth >= 0.8;              // the player brought it out over the bridge
        if (!alreadyOver) {
        // A. Lift: straight up, away from the yard. The cable tightens and the load gives a small sway.
        onPhase?.('lift');
        audio.play('winchUp');
        this.swingImpulse(-6);
        await hoistTo(CRANE_LAYOUT.restY, { signal, duration: 560, ease: easings.outCubic });
        await wait(80, signal);
        }

        // B + C. Into depth, then a long gentle approach: the jib slews into the scene, the trolley runs out
        // along it, and the load (same height above the ground) shrinks and recedes with it.
        onPhase?.('depth');
        audio.startLoop('craneMotor', { heavy: true });
        audio.play('whoosh');
        this.swingImpulse(12);                                  // the load lags as the jib starts to turn (cartoon swing)
        const start = { x: motion.x, depth: motion.depth };
        try {
          await runScripted({
            duration: Math.max(420, DEPTH_TRAVEL_MS * (1 - start.depth)),
            ease: easings.linear,
            signal,
            apply: (t) => {
              const zT = easings.travel(t);
              const xT = easings.inOutCubic(Math.min(1, t * 1.08));
              motion.depth = start.depth + (1 - start.depth) * zT;
              motion.x = start.x + (spot.x - start.x) * xT;
            },
          });
        } finally {
          audio.stopLoop('craneMotor');
        }
        this.swingImpulse(-9);                                  // ...and swings on when it stops: a wobble, then it settles

        // D. Align over the spot (the spot was computed from the frame's real geometry at this scale).
        setState(S.ALIGNING_WITH_BRIDGE);
        onPhase?.('align');
        await glideTo(spot.x, { signal, duration: 200, ease: easings.outCubic });
        await settleSway(signal, 300);
        await wait(90, signal);

        // E. Lower onto the deck: slow, steady, no snap.
        setState(S.LOWERING_TO_PLACE);
        onPhase?.('lower');
        audio.play('winchDown');
        await hoistTo(spot.y, { signal, duration: 760, ease: easings.outCubic });

        // F. Place: the frame touches down on the spot: a green lock-in and a metallic click.
        onPhase?.('place');
        audio.play('placement');
        audio.play('ding');
        await wait(110, signal);

        // G. Release: the claw opens; the frame stays on the bridge.
        setState(S.RELEASING);
        audio.play('clawOpen');
        await claw.open();
        const released = release();
        onPhase?.('release');
        return released;
      });
    },

    /** Removes whatever is in the claw (resets and restarts). */
    discardCargo() {
      const released = release();
      released?.option.element.remove();
      claw.setClosed(false);
    },
    /** Red warning beacon (wrong frame) or orange (moving), for comic emphasis. */
    alarm(on) {
      beacon.classList.toggle('is-alarm', Boolean(on));
    },
    /** Raise the empty claw from the bridge. */
    liftAway({ signal } = {}) {
      audio.play('winchUp');
      return hoistTo(CRANE_LAYOUT.restY, { signal, duration: 520, ease: easings.outCubic });
    },
    /** The empty hook travels back out of depth to the front of the yard, ready for the next pick. */
    returnHome({ signal, x = CRANE_LAYOUT.parkX } = {}) {
      return withSequence(async () => {
        setState(S.RETURNING);
        const from = { x: motion.x, y: motion.y, depth: motion.depth };
        const to = { x: clamp(x, CRANE_LAYOUT.minX, CRANE_LAYOUT.maxX), y: CRANE_LAYOUT.restY };
        audio.startLoop('craneMotor');
        try {
          await runScripted({
            duration: from.depth > 0.01 ? RETURN_MS : clamp((Math.abs(to.x - from.x) / CRANE_LAYOUT.maxSpeed) * 1150, 160, 1100),
            ease: easings.inOutCubic,
            signal,
            apply: (t) => {
              motion.depth = from.depth * (1 - t);
              motion.x = from.x + (to.x - from.x) * t;
              motion.y = from.y + (to.y - from.y) * t;
            },
          });
        } finally {
          audio.stopLoop('craneMotor');
          motion.depth = Math.max(0, motion.depth);
          motion.swayVelocity += 8;                             // the empty hook bobs as it arrives home
          if (state === S.RETURNING) setState(unlockWhenLanded ? S.IDLE : S.LOCKED);
          unlockWhenLanded = false;
        }
      });
    },
    /** Glide along the jib (scenes outside play: entrance, ending). */
    parkAway({ signal, x = CRANE_LAYOUT.parkX } = {}) {
      return glideTo(x, { signal, ease: easings.inOutCubic });
    },
    /** Entrance: the trolley rolls in along the girder, overshoots a touch, and the hook swings to rest. */
    async enterFromOffstage({ signal } = {}) {
      this.teleport(CRANE_LAYOUT.maxX + 520);
      const from = motion.x;
      scriptedMotions += 1;
      publishBusy();
      try {
        await tween({ from, to: CRANE_LAYOUT.homeX, duration: 1150, ease: easings.outSoftBack, signal, onUpdate: (value) => { motion.x = value; } });
      } finally {
        scriptedMotions -= 1;
        publishBusy();
      }
    },
  };
}
