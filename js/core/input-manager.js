import { CONTROLS_LAYOUT } from '../data/layout.js';

/**
 * Crane controls.
 *   Pad (bottom-left): four arrow keys. LEFT / RIGHT move the trolley along the jib, UP / DOWN raise and
 *   lower the claw. Each key is its own button with its own pressed state: pressing one never animates
 *   another key, the plate, or PICK. Tap = a small nudge (the direction is held at least `tapMs`),
 *   hold = continuous travel, release = the crane brakes smoothly (its own inertia).
 *   PICK (the pad's centre button): usable only with the claw over a frame and the hook empty.
 *   DROP (bottom-right): usable only once a frame is on the hook; it starts the whole transport.
 *   PICK and DROP are real buttons, `disabled` whenever their action is not possible.
 * Keyboard: arrows / WASD press the matching key; Space (or Enter) presses PICK, or DROP while carrying.
 * Emits intent only ('axis', 'pick', 'drop'); the level engine decides what is legal.
 */
const KEY_TO_DIRECTION = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
};
const DIRECTIONS = ['up', 'right', 'down', 'left'];

export function createInputManager({ controlsEl, audio }) {
  const padEl = controlsEl.querySelector('#dpad');
  const keyEls = Object.fromEntries(DIRECTIONS.map((direction) => [direction, padEl.querySelector(`.dpad__key[data-direction="${direction}"]`)]));
  const buttons = { pick: controlsEl.querySelector('#pick-button'), drop: controlsEl.querySelector('#drop-button') };
  const sounds = { pick: 'pickPress', drop: 'dropPress' };
  const usable = { pick: false, drop: false };
  const held = Object.fromEntries(DIRECTIONS.map((direction) => [direction, null]));   // per key: { since, source } while held
  const releaseTimers = {};
  const listeners = new Map();
  let lastAxis = { x: 0, y: 0 };
  let enabled = false;
  let demoAxis = null;

  function emit(event, payload) {
    for (const listener of listeners.get(event) ?? []) listener(payload);
  }

  function on(event, listener) {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(listener);
    return () => listeners.get(event).delete(listener);
  }

  function heldAxis() {
    return { x: (held.right ? 1 : 0) - (held.left ? 1 : 0), y: (held.down ? 1 : 0) - (held.up ? 1 : 0) };
  }

  function publishAxis() {
    const axis = enabled && !demoAxis ? heldAxis() : { x: 0, y: 0 };
    if (axis.x === lastAxis.x && axis.y === lastAxis.y) return;
    lastAxis = axis;
    emit('axis', axis);
  }

  /** One key goes down: only that key compresses; the crane starts that way. */
  function pressDirection(direction, source) {
    if (!enabled || demoAxis) return;
    clearTimeout(releaseTimers[direction]);
    if (!held[direction]) audio.play('keyTap', { variant: DIRECTIONS.indexOf(direction) });
    held[direction] = { since: performance.now(), source };
    keyEls[direction].classList.add('is-pressed');
    padEl.classList.remove('is-inviting');
    publishAxis();
  }

  /** The key springs back at once; the direction is held a little longer if it was only a tap. */
  function releaseDirection(direction, source) {
    const press = held[direction];
    if (!press || (source && press.source !== source)) return;
    keyEls[direction].classList.remove('is-pressed');
    const remaining = CONTROLS_LAYOUT.tapMs - (performance.now() - press.since);
    const finish = () => {
      if (held[direction] !== press) return;
      held[direction] = null;
      publishAxis();
    };
    if (remaining > 0) releaseTimers[direction] = setTimeout(finish, remaining);
    else finish();
  }

  function releaseAll() {
    for (const direction of DIRECTIONS) {
      clearTimeout(releaseTimers[direction]);
      held[direction] = null;
      keyEls[direction].classList.remove('is-pressed');
    }
    publishAxis();
  }

  for (const direction of DIRECTIONS) {
    const keyEl = keyEls[direction];
    keyEl.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      if (!enabled || demoAxis) return;
      keyEl.setPointerCapture?.(event.pointerId);
      pressDirection(direction, `pointer:${event.pointerId}`);
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      keyEl.addEventListener(type, (event) => releaseDirection(direction, `pointer:${event.pointerId}`));
    }
    keyEl.addEventListener('contextmenu', (event) => event.preventDefault());
    keyEl.addEventListener('click', (event) => event.preventDefault());    // movement is press-and-hold, never a click
  }

  function fire(action) {
    audio.play(sounds[action]);
    emit(action);
  }

  for (const [action, button] of Object.entries(buttons)) {
    button.addEventListener('pointerdown', () => { if (!button.disabled) button.classList.add('is-pressed'); });
    for (const type of ['pointerup', 'pointercancel', 'pointerleave']) {
      button.addEventListener(type, () => button.classList.remove('is-pressed'));
    }
    button.addEventListener('click', () => {
      if (enabled && !button.disabled) fire(action);
    });
  }

  window.addEventListener('keydown', (event) => {
    if (event.target.closest?.('input, textarea')) return;
    const direction = KEY_TO_DIRECTION[event.code];
    if (direction) {
      if (enabled) event.preventDefault();
      if (!event.repeat) pressDirection(direction, 'keyboard');
      return;
    }
    if (event.code === 'Space' || event.code === 'Enter') {
      if (event.repeat) return;
      const focusedButton = event.target.closest?.('button, a');
      // Enter keeps native activation of a focused control; Space is always the action during play,
      // except on the screen-advancing buttons.
      if (focusedButton && (event.code === 'Enter' || focusedButton.classList.contains('cta-button'))) return;
      if (!enabled) return;
      event.preventDefault();
      const action = usable.pick ? 'pick' : usable.drop ? 'drop' : null;
      if (!action) return;
      buttons[action].classList.add('is-pressed');
      setTimeout(() => buttons[action].classList.remove('is-pressed'), 150);
      fire(action);
    }
  });
  window.addEventListener('keyup', (event) => {
    const direction = KEY_TO_DIRECTION[event.code];
    if (direction) releaseDirection(direction, 'keyboard');
    if (event.code === 'Space' && enabled && !event.target.closest?.('.cta-button')) event.preventDefault();
  });
  window.addEventListener('blur', releaseAll);

  /** Enables or disables a real button; one small activation pop when it becomes usable, never a loop. */
  function setUsable(action, value) {
    const button = buttons[action];
    const became = value && button.disabled;
    usable[action] = Boolean(value);
    button.disabled = !usable[action];
    if (!usable[action]) button.classList.remove('is-pressed');
    if (became) {
      button.classList.remove('is-ready');
      void button.offsetWidth;
      button.classList.add('is-ready');
      setTimeout(() => button.classList.remove('is-ready'), 600);
    }
  }

  return {
    on,
    releaseAll,
    get enabled() {
      return enabled;
    },
    setEnabled(value) {
      enabled = Boolean(value);
      padEl.classList.toggle('is-locked', !enabled);
      for (const keyEl of Object.values(keyEls)) keyEl.setAttribute('aria-disabled', String(!enabled));
      if (!enabled) releaseAll();
    },
    setPickEnabled(value) {
      setUsable('pick', value);
    },
    setDropEnabled(value) {
      setUsable('drop', value);
    },
    isActionAvailable(action) {
      return Boolean(usable[action]);
    },
    /** Invite the player to move: the side keys bob gently until one is pressed. */
    invite(on) {
      padEl.classList.toggle('is-inviting', Boolean(on));
    },
    /** How-to-play demonstrations show the real keys while the player's input is gated. */
    showDemoAxis(axis) {
      demoAxis = axis && (axis.x || axis.y) ? { x: axis.x, y: axis.y } : null;
      const pressed = demoAxis ? { left: demoAxis.x < 0, right: demoAxis.x > 0, up: demoAxis.y < 0, down: demoAxis.y > 0 } : {};
      for (const direction of DIRECTIONS) keyEls[direction].classList.toggle('is-pressed', Boolean(pressed[direction]));
      emit('demo-axis', demoAxis ?? { x: 0, y: 0 });
      publishAxis();
    },
    async demoPress(action) {
      setUsable(action, true);
      buttons[action].classList.add('is-pressed');
      audio.play(sounds[action]);
      await new Promise((resolve) => setTimeout(resolve, 180));
      buttons[action].classList.remove('is-pressed');
      setUsable(action, false);
    },
  };
}
