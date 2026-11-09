import { CONTROLS_LAYOUT } from '../data/layout.js';
import { padPlateSvg } from './pad-plate.js';

/**
 * Crane controls.
 *   Pad (bottom-left): four direction keys. LEFT / RIGHT move the trolley along the jib; UP sends the hook
 *   back into the scene (toward the bridge), DOWN brings it forward to the yard. Each key is its own button
 *   with its own pressed state: pressing one never animates another key, the panel, or the action button.
 *   Tap = a small nudge (the direction is held at least `tapMs`), hold = continuous travel, release = the
 *   crane brakes smoothly (its own inertia).
 *   Action button (bottom-right): reads PICK while the hook is empty (usable only with the hook at the front,
 *   over a frame) and flips over to DROP once a frame is on the hook (DROP starts the whole transport).
 *   It is a real `disabled` button whenever its action is not possible.
 * Keyboard: arrows / WASD press the matching key; Space (or Enter) presses the action button.
 * Emits intent only ('axis', 'pick', 'drop'); the level engine decides what is legal.
 */
const ACTION_LABELS = { pick: 'Pick the triangle', drop: 'Drop: carry the triangle to the bridge' };
const KEY_TO_DIRECTION = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
};
const DIRECTIONS = ['up', 'right', 'down', 'left'];

export function createInputManager({ controlsEl, audio }) {
  const padEl = controlsEl.querySelector('#dpad');
  padEl.querySelector('.dpad__plate').innerHTML = padPlateSvg('pad');      // the panel, fitted to its keys
  const keyEls = Object.fromEntries(DIRECTIONS.map((direction) => [direction, padEl.querySelector(`.dpad__key[data-direction="${direction}"]`)]));
  const actionButton = controlsEl.querySelector('#action-button');
  const sounds = { pick: 'pickPress', drop: 'dropPress' };
  let actionMode = 'pick';
  let actionEnabled = false;
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

  function fireAction() {
    audio.play(sounds[actionMode]);
    emit(actionMode);
  }

  actionButton.addEventListener('pointerdown', () => { if (!actionButton.disabled) actionButton.classList.add('is-pressed'); });
  for (const type of ['pointerup', 'pointercancel', 'pointerleave']) {
    actionButton.addEventListener(type, () => actionButton.classList.remove('is-pressed'));
  }
  actionButton.addEventListener('click', () => {
    if (enabled && !actionButton.disabled) fireAction();
  });

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
      if (!actionEnabled) return;
      actionButton.classList.add('is-pressed');
      setTimeout(() => actionButton.classList.remove('is-pressed'), 150);
      fireAction();
    }
  });
  window.addEventListener('keyup', (event) => {
    const direction = KEY_TO_DIRECTION[event.code];
    if (direction) releaseDirection(direction, 'keyboard');
    if (event.code === 'Space' && enabled && !event.target.closest?.('.cta-button')) event.preventDefault();
  });
  window.addEventListener('blur', releaseAll);

  /** mode 'pick' | 'drop' (the button flips over when it changes); `usable` enables the real button, with one
   *  small activation pop when it becomes usable (never a loop). */
  function setAction(mode, usable) {
    if (mode && mode !== actionMode) {
      actionMode = mode;
      actionButton.dataset.mode = mode;
      actionButton.setAttribute('aria-label', ACTION_LABELS[mode]);
    }
    const became = usable && actionButton.disabled;
    actionEnabled = Boolean(usable);
    actionButton.disabled = !actionEnabled;
    if (!actionEnabled) actionButton.classList.remove('is-pressed');
    if (became) {
      actionButton.classList.remove('is-ready');
      void actionButton.offsetWidth;
      actionButton.classList.add('is-ready');
      setTimeout(() => actionButton.classList.remove('is-ready'), 600);
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
    setActionState({ mode, enabled: usable }) {
      setAction(mode, usable);
    },
    isActionAvailable(action) {
      return actionEnabled && actionMode === action;
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
      setAction(action, true);
      actionButton.classList.add('is-pressed');
      audio.play(sounds[action]);
      await new Promise((resolve) => setTimeout(resolve, 180));
      actionButton.classList.remove('is-pressed');
      setAction(action, false);
    },
  };
}
