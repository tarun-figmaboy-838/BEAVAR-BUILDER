import { CONTROLS_LAYOUT } from '../data/layout.js';

/**
 * Crane controls: an analog joystick (pointer drag, arrow keys, WASD) and one contextual action
 * button that reads PICK until a frame is lifted and flips to DROP while one is carried.
 * Emits intent only; the level engine decides whether an action is legal.
 */
const KEY_TO_DIRECTION = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
};
const DEAD_ZONE = 0.18;
const ACTION_LABELS = { pick: 'Pick the triangle', drop: 'Drop the triangle' };

export function createInputManager({ controlsEl, audio }) {
  const joystickEl = controlsEl.querySelector('#joystick');
  const knobEl = joystickEl.querySelector('.joystick__knob');
  const stemEl = joystickEl.querySelector('.joystick__stem');
  const actionButton = controlsEl.querySelector('#action-button');
  const keysHeld = { left: false, right: false, up: false, down: false };
  const listeners = new Map();
  let pointerAxis = null;
  let activePointerId = null;
  let lastAxis = { x: 0, y: 0 };
  let enabled = false;
  let actionMode = 'pick';
  let actionEnabled = false;
  let demoAxis = null;

  function emit(event, payload) {
    for (const listener of listeners.get(event) ?? []) listener(payload);
  }

  function on(event, listener) {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(listener);
    return () => listeners.get(event).delete(listener);
  }

  function keyboardAxis() {
    return { x: (keysHeld.right ? 1 : 0) - (keysHeld.left ? 1 : 0), y: (keysHeld.down ? 1 : 0) - (keysHeld.up ? 1 : 0) };
  }

  function renderKnob(axis) {
    const travel = CONTROLS_LAYOUT.knobTravel;
    const dx = axis.x * travel;
    const dy = axis.y * travel;
    knobEl.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`;
    const length = Math.hypot(dx, dy);
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI - 90;
    stemEl.style.transform = `rotate(${angle.toFixed(1)}deg) scaleY(${(length / 40).toFixed(3)})`;
    stemEl.style.opacity = length > 2 ? '1' : '0';
    if (length > 2) joystickEl.classList.remove('is-nudging');
    const directions = [];
    if (axis.y < -0.3) directions.push('up');
    if (axis.y > 0.3) directions.push('down');
    if (axis.x < -0.3) directions.push('left');
    if (axis.x > 0.3) directions.push('right');
    joystickEl.dataset.dir = directions.join(' ');
  }

  function currentAxis() {
    if (demoAxis) return demoAxis;
    if (pointerAxis) return pointerAxis;
    return keyboardAxis();
  }

  function publishAxis() {
    const axis = currentAxis();
    renderKnob(axis);
    const live = enabled && !demoAxis ? axis : { x: 0, y: 0 };
    if (live.x === lastAxis.x && live.y === lastAxis.y) return;
    lastAxis = live;
    emit('axis', live);
  }

  function axisFromPointer(event) {
    const rect = joystickEl.getBoundingClientRect();
    const travelScreen = CONTROLS_LAYOUT.knobTravel * (rect.width / CONTROLS_LAYOUT.joystickSize);
    let x = (event.clientX - (rect.left + rect.width / 2)) / travelScreen;
    let y = (event.clientY - (rect.top + rect.height / 2)) / travelScreen;
    const magnitude = Math.hypot(x, y);
    if (magnitude > 1) {
      x /= magnitude;
      y /= magnitude;
    }
    const filter = (value) => (Math.abs(value) < DEAD_ZONE ? 0 : Math.round(value * 100) / 100);
    return { x: filter(x), y: filter(y) };
  }

  function endDrag() {
    if (activePointerId === null) return;
    activePointerId = null;
    pointerAxis = null;
    joystickEl.classList.remove('is-dragging');
    publishAxis();
  }

  joystickEl.addEventListener('pointerdown', (event) => {
    if (!enabled || demoAxis) return;
    event.preventDefault();
    joystickEl.setPointerCapture?.(event.pointerId);
    activePointerId = event.pointerId;
    joystickEl.classList.add('is-dragging');
    audio.play('controlPress');
    pointerAxis = axisFromPointer(event);
    publishAxis();
  });
  joystickEl.addEventListener('pointermove', (event) => {
    if (event.pointerId !== activePointerId) return;
    pointerAxis = axisFromPointer(event);
    publishAxis();
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    joystickEl.addEventListener(type, (event) => {
      if (event.pointerId === activePointerId) endDrag();
    });
  }
  joystickEl.addEventListener('contextmenu', (event) => event.preventDefault());

  function setKey(direction, value) {
    if (keysHeld[direction] === value) return;
    if (value && !enabled) return;
    keysHeld[direction] = value;
    joystickEl.classList.toggle('is-keyboard', Object.values(keysHeld).some(Boolean));
    if (value) audio.play('controlPress');
    publishAxis();
  }

  function releaseAll() {
    for (const direction of Object.keys(keysHeld)) keysHeld[direction] = false;
    joystickEl.classList.remove('is-keyboard');
    endDrag();
    publishAxis();
  }

  function pulse(element, className) {
    element.classList.remove(className);
    void element.offsetWidth;
    element.classList.add(className);
    setTimeout(() => element.classList.remove(className), 800);
  }

  actionButton.addEventListener('pointerdown', () => actionButton.classList.add('is-pressed'));
  for (const type of ['pointerup', 'pointercancel', 'pointerleave']) {
    actionButton.addEventListener(type, () => actionButton.classList.remove('is-pressed'));
  }
  actionButton.addEventListener('click', () => {
    if (!enabled) return;
    if (!actionEnabled) {
      pulse(actionButton, 'is-denied');
      return;
    }
    audio.play('controlPress');
    emit(actionMode);
  });

  window.addEventListener('keydown', (event) => {
    if (event.repeat || event.target.closest?.('input, textarea')) return;
    const direction = KEY_TO_DIRECTION[event.code];
    if (direction) {
      if (enabled) event.preventDefault();
      setKey(direction, true);
      return;
    }
    if (event.code === 'Space' || event.code === 'Enter') {
      const focusedButton = event.target.closest?.('button, a');
      // Enter keeps native activation of a focused control; Space is always PICK/DROP during play,
      // except on the screen-advancing buttons.
      if (focusedButton && (event.code === 'Enter' || focusedButton.classList.contains('cta-button'))) return;
      if (!enabled) return;
      event.preventDefault();
      if (actionEnabled) {
        actionButton.classList.add('is-pressed');
        setTimeout(() => actionButton.classList.remove('is-pressed'), 140);
        emit('primary');
      }
    }
  });
  window.addEventListener('keyup', (event) => {
    const direction = KEY_TO_DIRECTION[event.code];
    if (direction) setKey(direction, false);
    // Space on a focused frame/spot button would otherwise "click" it on release.
    if (event.code === 'Space' && enabled && !event.target.closest?.('.cta-button')) event.preventDefault();
  });
  window.addEventListener('blur', releaseAll);

  return {
    on,
    releaseAll,
    get enabled() {
      return enabled;
    },
    setEnabled(value) {
      enabled = Boolean(value);
      joystickEl.setAttribute('aria-disabled', String(!enabled));
      if (!enabled) releaseAll();
    },
    /** mode: 'pick' | 'drop'. The face flips when the mode changes; it pulses when it becomes usable. */
    setActionState({ mode, enabled: usable }) {
      if (mode && mode !== actionMode) {
        actionMode = mode;
        actionButton.dataset.mode = mode;
        actionButton.setAttribute('aria-label', ACTION_LABELS[mode]);
      }
      const becameUsable = usable && !actionEnabled;
      actionEnabled = Boolean(usable);
      actionButton.disabled = !actionEnabled;
      if (becameUsable) pulse(actionButton, 'is-ready');
    },
    /** Invite the player to move: the joystick glows and bobs until it is used. */
    nudgeJoystick(on) {
      joystickEl.classList.toggle('is-nudging', Boolean(on));
    },
    isActionAvailable(action) {
      return actionEnabled && actionMode === action;
    },
    /** How-to-play demonstrations drive the real controls while the player's input is gated. */
    showDemoAxis(axis) {
      demoAxis = axis ? { x: axis.x, y: axis.y } : null;
      joystickEl.classList.toggle('is-keyboard', Boolean(demoAxis));
      emit('demo-axis', demoAxis ?? { x: 0, y: 0 });
      publishAxis();
    },
    async demoPress(mode) {
      this.setActionState({ mode, enabled: true });
      actionButton.classList.add('is-pressed');
      await new Promise((resolve) => setTimeout(resolve, 180));
      actionButton.classList.remove('is-pressed');
    },
  };
}
