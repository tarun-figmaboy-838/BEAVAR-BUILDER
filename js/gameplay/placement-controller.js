import { CRANE_LAYOUT } from '../data/layout.js';
import { stageById } from '../data/bridge-geometry.js';

/** Alignment checks between the claw, the option frames and the active bridge socket. */
export function createPlacementController({ triangles }) {
  let activeStage = null;

  /** The carried frame's centre (its centroid), given where the crane is. */
  function triangleCenterX(craneX, carried) {
    return craneX + carried.centroid[0] - carried.grabX * carried.width;
  }

  return {
    setActiveStage(stageId) {
      activeStage = stageById(stageId);
    },
    get activeStage() {
      return activeStage;
    },
    /** Crane x that puts the carried frame's centre right under the place it fits. */
    craneXForSocket(carried) {
      return activeStage.socket.x - (carried.centroid[0] - carried.grabX * carried.width);
    },
    resolveHover(craneX, carried) {
      if (carried) {
        // Once lifted, a frame goes to the bridge (PDF: pick, then place on the bridge); the yard slides away.
        const overSocket = Boolean(activeStage) && Math.abs(triangleCenterX(craneX, carried) - activeStage.socket.x) <= CRANE_LAYOUT.socketTolerance;
        return { overSocket };
      }
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
