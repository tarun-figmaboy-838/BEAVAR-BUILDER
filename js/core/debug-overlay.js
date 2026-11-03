import { DEBUG_MODE } from '../config.js';

/** Categorised logging, silent unless DEBUG_MODE. */
export function debugLog(category, ...details) {
  if (!DEBUG_MODE) return;
  console.debug(`[${category}]`, ...details);
}

/** Small read-only panel showing the live game state (development only). */
export function createDebugOverlay({ element, gameState, getExtra }) {
  if (!DEBUG_MODE) return { destroy() {} };
  element.hidden = false;
  const timer = setInterval(() => {
    const state = gameState.get();
    const extra = getExtra?.() ?? {};
    const lines = {
      screen: state.screen,
      level: state.currentLevelIndex + 1,
      craneState: state.craneState,
      craneX: Math.round(state.craneX),
      hoistY: Math.round(state.hoistY),
      carried: state.carriedTriangleId,
      hovered: state.hoveredOptionId,
      socket: state.activeSocketId,
      bridgeProgress: state.bridgeProgress,
      inputLocked: state.isInputLocked,
      transition: state.transition,
      ...extra,
    };
    element.textContent = Object.entries(lines)
      .map(([key, value]) => `${key.padEnd(14)} ${value ?? '-'}`)
      .join('\n');
  }, 120);
  return { destroy: () => clearInterval(timer) };
}
