import { CRANE_LAYOUT } from '../data/layout.js';
import { BRIDGE_GEOMETRY, stageById } from '../data/bridge-geometry.js';

/**
 * Where the crane must be to seat `carried` with its centroid over stage x `spotX`, when the load is
 * drawn at `scale`: the trolley x, and the claw-top y that stands the frame's base on the road.
 */
export function bridgeSeatTarget(carried, spotX, scale) {
  const centroidFromGrab = (carried.centroid[0] - carried.grabX * carried.width) * scale;
  const baseBelowClawTop = (CRANE_LAYOUT.gripOffsetY - carried.grabY + 2 + carried.baseOffset) * scale;
  return { x: spotX - centroidFromGrab, y: BRIDGE_GEOMETRY.deckY - baseBelowClawTop };
}

/**
 * Alignment between the claw, the option frames in the yard, and the active spot on the bridge.
 * Every target is computed from the frame's own geometry (grab corner, centroid, base) and the bridge
 * geometry, never from fixed screen positions.
 */
export function createPlacementController({ triangles }) {
  let activeStage = null;

  return {
    setActiveStage(stageId) {
      activeStage = stageById(stageId);
    },
    get activeStage() {
      return activeStage;
    },
    /** The crane position that seats `carried` on the active task's spot (see bridgeSeatTarget). */
    bridgeTarget(carried, scale) {
      return bridgeSeatTarget(carried, activeStage.socket.x, scale);
    },
    /** With no frame on the hook: the yard frame whose grab corner is within reach of the claw. */
    resolveHover(craneX, carried) {
      if (carried) return {};
      let best = null;
      for (const option of triangles.allOptions()) {
        const distance = Math.abs(craneX - triangles.grabPointOf(option).x);
        if (distance <= CRANE_LAYOUT.optionTolerance && (!best || distance < best.distance)) best = { option, distance };
      }
      return { option: best?.option ?? null };
    },
    isCorrect(triangleId, level) {
      return triangleId === level.correctTriangleId;
    },
  };
}
