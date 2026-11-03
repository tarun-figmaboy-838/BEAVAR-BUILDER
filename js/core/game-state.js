/** The one game state. Modules read it, patch it, and subscribe to changes. */
const INITIAL_STATE = Object.freeze({
  screen: 'boot',
  currentLevelIndex: 0,
  bridgeProgress: 0,          // number of stages built
  craneState: 'locked',
  craneBusy: false,          // a scripted crane motion or sequence is running
  craneX: 0,
  hoistY: 0,
  carriedTriangleId: null,
  hoveredOptionId: null,
  activeSocketId: null,
  isInputLocked: true,
  transition: null,           // name of the running screen/level transition, if any
  audioMuted: false,
  completed: false,
});

export function createGameState() {
  let state = { ...INITIAL_STATE };
  const listeners = new Set();

  return {
    get() {
      return state;
    },
    update(patch) {
      let changed = false;
      for (const key of Object.keys(patch)) {
        if (state[key] !== patch[key]) {
          changed = true;
          break;
        }
      }
      if (!changed) return state;
      state = { ...state, ...patch };
      for (const listener of listeners) listener(state, patch);
      return state;
    },
    reset(overrides = {}) {
      state = { ...INITIAL_STATE, audioMuted: state.audioMuted, ...overrides };
      for (const listener of listeners) listener(state, state);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
