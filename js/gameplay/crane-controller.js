import { CRANE_LAYOUT, CRANE_RIG, PLATFORM_LAYOUT } from '../data/layout.js';
import { tween, wait, easings } from '../core/motion.js';
import { debugLog } from '../core/debug-overlay.js';
import { buildClawFrames } from './claw-controller.js';

export const CRANE_STATES = Object.freeze({
  IDLE: 'idle',
  MOVING: 'moving',
  HOVERING_OPTION: 'hoveringOption',
  LOWERING: 'lowering',
  GRABBING: 'grabbing',
  CARRYING: 'carrying',
  HOVERING_TARGET: 'hoveringTarget',
  DROPPING: 'dropping',
  PLACING: 'placing',
  RETURNING: 'returning',
  LOCKED: 'locked',
});

const DRIVABLE_STATES = new Set([
  CRANE_STATES.IDLE,
  CRANE_STATES.MOVING,
  CRANE_STATES.HOVERING_OPTION,
  CRANE_STATES.CARRYING,
  CRANE_STATES.HOVERING_TARGET,
]);

const MAX_SWAY_DEG = 7;

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

/** Tower = top (jib root + cab) + repeated mast sections + base, so the jib can run along the top edge. */
function buildTower(tower) {
  const element = document.createElement('div');
  element.className = 'crane-tower';
  Object.assign(element.style, { left: `${tower.left}px`, top: `${tower.top}px`, width: `${tower.width}px` });
  const mast = document.createElement('div');
  mast.className = 'crane-tower__part crane-tower__mast';
  Object.assign(mast.style, {
    height: `${(tower.mastHeight * tower.mastSections).toFixed(2)}px`,
    backgroundImage: `url("${tower.mastSrc}")`,
    backgroundSize: `${tower.width}px ${tower.mastHeight}px`,
  });
  element.append(
    sprite('crane-tower__part', tower.topSrc, { height: `${tower.topHeight}px` }),
    mast,
    sprite('crane-tower__part', tower.baseSrc, { height: `${tower.baseHeight}px` }),
  );
  return element;
}

/** The kit's tower crane: tower + cabin + base on the left quay, jib tiled across, tip at the far end. */
function buildStructure() {
  const { tower, jibTile, jibStartX, jibTiles, jibTip } = CRANE_RIG;
  const structure = document.createElement('div');
  structure.className = 'crane-structure';
  const jib = document.createElement('div');
  jib.className = 'crane-jib';
  Object.assign(jib.style, {
    left: `${jibStartX}px`,
    top: `${tower.top}px`,
    width: `${jibTile.width * jibTiles}px`,
    height: `${jibTile.height}px`,
    backgroundImage: `url("${jibTile.src}")`,
    backgroundSize: `${jibTile.width}px ${jibTile.height}px`,
  });
  structure.append(
    jib,
    sprite('crane-jib-tip', jibTip.src, { left: `${jibStartX + jibTile.width * jibTiles}px`, top: `${tower.top}px`, width: `${jibTip.width}px`, height: `${jibTip.height}px` }),
    buildTower(tower),
  );
  return structure;
}

/** Builds the crane, the travelling trolley rig with its pendulum hoist, and the claw's shadow. */
export function buildCraneDom(craneEl, platformEl) {
  craneEl.appendChild(buildStructure());
  const { trolley } = CRANE_RIG;
  const rig = document.createElement('div');
  rig.className = 'trolley-rig';
  rig.innerHTML = `
    <div class="pendulum">
      <div class="hoist">
        <span class="cable"></span>
        <div class="claw"></div>
        <div class="claw-cargo"></div>
      </div>
    </div>`;
  const trolleyImage = sprite('trolley', trolley.src, { left: `${-trolley.width / 2}px`, top: `${trolley.top}px`, width: `${trolley.width}px`, height: `${trolley.height}px` });
  rig.append(trolleyImage);
  // The warning light lives on the cab roof (painted in the tower sprite); a lit copy flashes over it.
  const { cabBeacon } = CRANE_RIG;
  const beacon = document.createElement('span');
  beacon.className = 'cab-beacon';
  Object.assign(beacon.style, { left: `${cabBeacon.left}px`, top: `${cabBeacon.top}px`, width: `${cabBeacon.size}px`, height: `${cabBeacon.size}px` });
  beacon.innerHTML = `<img class="cab-beacon__light cab-beacon__light--orange" src="assets/images/crane-kit/beacon-orange.png" alt="" draggable="false"><img class="cab-beacon__light cab-beacon__light--red" src="assets/images/crane-kit/beacon-red.png" alt="" draggable="false">`;
  craneEl.append(rig, beacon);
  buildClawFrames(rig.querySelector('.claw'));
  const shadow = document.createElement('div');
  shadow.className = 'claw-shadow';
  platformEl.appendChild(shadow);
  return { rig, trolley: trolleyImage, beacon, shadow };
}

/**
 * Deterministic crane state machine. Player input only applies in drivable states; every scripted
 * motion (pick, drop, return, demos) runs as an awaited sequence that cannot overlap another.
 */
export function createCraneController({ craneEl, dom, claw, gameState, audio }) {
  const { rig, trolley, beacon, shadow } = dom;
  const pendulumEl = rig.querySelector('.pendulum');
  const hoistEl = rig.querySelector('.hoist');
  const cargoEl = rig.querySelector('.claw-cargo');

  const motion = { x: CRANE_LAYOUT.homeX, vx: 0, y: CRANE_LAYOUT.restY, vy: 0, sway: 0, swayVelocity: 0 };
  const axis = { x: 0, y: 0 };
  const rendered = { x: NaN, y: NaN, sway: NaN };
  let lastX = motion.x;
  let lastY = motion.y;
  let lastMeasuredVx = 0;
  let state = CRANE_STATES.LOCKED;
  let carried = null;
  let scriptedMotions = 0;
  let hoverResolver = () => ({});
  let motorRunning = false;
  let sequenceRunning = false;
  craneEl.dataset.state = state;

  function setState(next) {
    if (state === next) return;
    state = next;
    craneEl.dataset.state = next;
    gameState.update({ craneState: next });
    debugLog('crane', 'state', next);
  }

  function publishBusy() {
    const busy = sequenceRunning || scriptedMotions > 0;
    if (gameState.get().craneBusy !== busy) gameState.update({ craneBusy: busy });
  }

  function ropeLength() {
    return motion.y - CRANE_LAYOUT.pivotY;
  }

  function render() {
    if (motion.x !== rendered.x) {
      rig.style.transform = `translateX(${motion.x.toFixed(2)}px)`;
      rendered.x = motion.x;
    }
    if (motion.y !== rendered.y) {
      hoistEl.style.transform = `translateY(${ropeLength().toFixed(2)}px)`;
      rendered.y = motion.y;
    }
    if (Math.abs(motion.sway - rendered.sway) > 0.01) {
      pendulumEl.style.transform = `rotate(${motion.sway.toFixed(2)}deg)`;
      rendered.sway = motion.sway;
    }
    // The claw's shadow falls on the yard deck: darker and tighter as the claw comes down.
    const overDeck = motion.x > PLATFORM_LAYOUT.deckLeft - 40 && motion.x < PLATFORM_LAYOUT.deckRight + 40;
    const closeness = clamp((motion.y - CRANE_LAYOUT.restY) / (CRANE_LAYOUT.maxY - CRANE_LAYOUT.restY), 0, 1);
    const swayOffset = Math.sin((motion.sway * Math.PI) / 180) * (ropeLength() + 80);
    shadow.style.opacity = overDeck && !carried ? (0.45 + closeness * 0.55).toFixed(2) : '0';
    shadow.style.transform = `translate(${(motion.x + swayOffset).toFixed(1)}px, ${PLATFORM_LAYOUT.baseY + 6}px) scale(${(1.15 - closeness * 0.35).toFixed(2)})`;
  }

  function refreshHoverState(isMoving) {
    const hover = hoverResolver(motion.x, carried) ?? {};
    if (carried) {
      setState(hover.overSocket ? CRANE_STATES.HOVERING_TARGET : CRANE_STATES.CARRYING);
      return;
    }
    const hoveredId = hover.option?.id ?? null;
    if (gameState.get().hoveredOptionId !== hoveredId) gameState.update({ hoveredOptionId: hoveredId });
    setState(hoveredId ? CRANE_STATES.HOVERING_OPTION : isMoving ? CRANE_STATES.MOVING : CRANE_STATES.IDLE);
  }

  function updateSway(dt, measuredVx) {
    const acceleration = (measuredVx - lastMeasuredVx) / dt;
    lastMeasuredVx = measuredVx;
    const length = Math.max(140, ropeLength() + 90);
    const stiffness = 2600 / length;
    const damping = carried ? 2.2 : 1.8;
    const drive = (-acceleration * 0.08 * 57.3) / length;
    motion.swayVelocity += (drive - motion.sway * stiffness - motion.swayVelocity * damping) * dt;
    motion.sway = clamp(motion.sway + motion.swayVelocity * dt, -MAX_SWAY_DEG, MAX_SWAY_DEG);
  }

  function update(dt) {
    if (dt <= 0) return;
    const drivable = scriptedMotions === 0 && !sequenceRunning && DRIVABLE_STATES.has(state);
    const targetVx = drivable ? axis.x * CRANE_LAYOUT.maxSpeed : 0;
    const targetVy = drivable ? axis.y * CRANE_LAYOUT.hoistSpeed : 0;
    motion.vx += (targetVx - motion.vx) * Math.min(1, dt * (targetVx ? 5.5 : 9));
    motion.vy += (targetVy - motion.vy) * Math.min(1, dt * 8);
    if (!targetVx && Math.abs(motion.vx) < 2) motion.vx = 0;
    if (!targetVy && Math.abs(motion.vy) < 2) motion.vy = 0;
    if (scriptedMotions === 0) {
      motion.x = clamp(motion.x + motion.vx * dt, CRANE_LAYOUT.minX, CRANE_LAYOUT.maxX);
      motion.y = clamp(motion.y + motion.vy * dt, CRANE_LAYOUT.restY, CRANE_LAYOUT.maxY);
      if (motion.x === CRANE_LAYOUT.minX || motion.x === CRANE_LAYOUT.maxX) motion.vx = 0;
      if (motion.y === CRANE_LAYOUT.restY || motion.y === CRANE_LAYOUT.maxY) motion.vy = 0;
    }

    const measuredVx = (motion.x - lastX) / dt;
    const measuredVy = (motion.y - lastY) / dt;
    lastX = motion.x;
    lastY = motion.y;
    updateSway(dt, measuredVx);

    const isMoving = Math.abs(measuredVx) > 6 || Math.abs(measuredVy) > 6;
    if (isMoving !== motorRunning) {
      motorRunning = isMoving;
      trolley.classList.toggle('is-running', isMoving);
      beacon.classList.toggle('is-flashing', isMoving);
      if (isMoving) audio.startLoop('craneMotor', { heavy: Boolean(carried) });
      else audio.stopLoop('craneMotor');
    }
    if (drivable) refreshHoverState(isMoving);

    const current = gameState.get();
    if (Math.abs(current.craneX - motion.x) >= 1 || Math.abs(current.hoistY - motion.y) >= 1) {
      gameState.update({ craneX: Math.round(motion.x), hoistY: Math.round(motion.y) });
    }
    render();
  }

  async function runScripted(from, to, speed, { duration, ease = easings.mechanical, signal, apply }) {
    const distance = Math.abs(to - from);
    if (distance < 0.5) return;
    scriptedMotions += 1;
    publishBusy();
    try {
      await tween({
        from,
        to,
        duration: duration ?? clamp((distance / speed) * 1000 * 1.15, 160, 1100),
        ease,
        signal,
        onUpdate: apply,
      });
    } finally {
      scriptedMotions -= 1;
      motion.vx = 0;
      motion.vy = 0;
      publishBusy();
    }
  }

  function glideTo(x, options = {}) {
    const target = clamp(x, CRANE_LAYOUT.minX, CRANE_LAYOUT.maxX);
    return runScripted(motion.x, target, CRANE_LAYOUT.maxSpeed, { ...options, apply: (value) => { motion.x = value; } });
  }

  function hoistTo(y, options = {}) {
    const target = clamp(y, CRANE_LAYOUT.restY, CRANE_LAYOUT.maxY);
    return runScripted(motion.y, target, CRANE_LAYOUT.hoistSpeed * 1.25, { ...options, apply: (value) => { motion.y = value; } });
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

  function attach(option) {
    carried = option;
    option.element.classList.add('is-carried');
    option.element.classList.remove('is-hovered');
    option.element.style.left = `${-option.grabX * option.width}px`;
    option.element.style.top = `${-option.grabY + 2}px`;
    cargoEl.appendChild(option.element);
    gameState.update({ carriedTriangleId: option.id, hoveredOptionId: null });
  }

  /** Detaches the carried frame and returns where its top-left corner sits in stage space. */
  function release() {
    if (!carried) return null;
    const option = carried;
    carried = null;
    const left = motion.x - option.grabX * option.width;
    const top = motion.y + CRANE_LAYOUT.gripOffsetY - option.grabY + 2;
    option.element.classList.remove('is-carried');
    gameState.update({ carriedTriangleId: null });
    return { option, left, top };
  }

  async function withSequence(run) {
    if (sequenceRunning) return null;
    sequenceRunning = true;
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
      return { x: motion.x, y: motion.y };
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
      setState(CRANE_STATES.LOCKED);
    },
    unlock() {
      setState(carried ? CRANE_STATES.CARRYING : CRANE_STATES.IDLE);
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
      lastX = motion.x;
      lastY = motion.y;
      lastMeasuredVx = 0;
      motion.sway = 0;
      motion.swayVelocity = 0;
      render();
    },
    /** open → lower → anticipation → close → squeeze → lift. */
    pickUp(option, { signal } = {}) {
      return withSequence(async () => {
        if (carried) return false;
        setState(CRANE_STATES.LOWERING);
        audio.play('clawOpen');
        await claw.open();
        await glideTo(option.grabStageX, { signal, duration: 220 });
        await settleSway(signal);
        await hoistTo(option.grabStageY - CRANE_LAYOUT.gripOffsetY + 6, { signal });
        setState(CRANE_STATES.GRABBING);
        await wait(90, signal);
        audio.play('clawClose');
        await claw.close();
        attach(option);
        audio.play('pickup');
        await claw.squeeze();
        await wait(50, signal);
        await hoistTo(CRANE_LAYOUT.restY, { signal });
        setState(CRANE_STATES.CARRYING);
        return true;
      });
    },
    /** stop → settle → lower until the grabbed corner reaches `gripY` → open → release. */
    lowerAndRelease({ craneX, gripY }, { signal, returning = false } = {}) {
      return withSequence(async () => {
        if (!carried) return null;
        setState(returning ? CRANE_STATES.RETURNING : CRANE_STATES.DROPPING);
        await glideTo(craneX, { signal, duration: 240 });
        await settleSway(signal, 260);
        await wait(60, signal);
        await hoistTo(gripY - 2 - CRANE_LAYOUT.gripOffsetY, { signal });
        await wait(70, signal);
        audio.play('clawOpen');
        await claw.open();
        const released = release();
        audio.play(returning ? 'thud' : 'placement');
        setState(CRANE_STATES.PLACING);
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
    liftAway({ signal } = {}) {
      return hoistTo(CRANE_LAYOUT.restY, { signal });
    },
    parkAway({ signal, x = CRANE_LAYOUT.parkX } = {}) {
      return glideTo(x, { signal, ease: easings.inOutCubic });
    },
    /** Entrance: the trolley rolls in along the girder, overshoots a touch, and the hook swings to rest. */
    async enterFromOffstage({ signal } = {}) {
      this.teleport(CRANE_LAYOUT.maxX + 520);
      scriptedMotions += 1;
      publishBusy();
      try {
        await tween({ from: motion.x, to: CRANE_LAYOUT.homeX, duration: 1150, ease: easings.outSoftBack, signal, onUpdate: (value) => { motion.x = value; } });
      } finally {
        scriptedMotions -= 1;
        publishBusy();
      }
    },
  };
}
