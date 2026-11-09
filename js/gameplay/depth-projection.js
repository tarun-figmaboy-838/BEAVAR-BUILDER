import { PLATFORM_LAYOUT } from '../data/layout.js';
import { BRIDGE_GEOMETRY } from '../data/bridge-geometry.js';

/**
 * One perspective for the whole yard-to-bridge move (pseudo-3D over 2D art).
 *
 * World axes: x across the stage, `height` above the ground (stage px, measured at the front plane),
 * z into the scene: z = 0 is the yard platform's plane (the frames stand at its baseY), z = 1 is the
 * bridge deck's plane (frames stand on the road at deckY).
 *
 * The camera looks at a painted horizon; a point recedes toward the vanishing point by
 *   scale(z) = 1 / (1 + k z),   ground(z) = horizonY + (nearGroundY - horizonY) * scale(z)
 * and k is solved so the ground at z = 1 is exactly the bridge deck. With the horizon where the
 * backdrop paints it, a frame on the bridge is drawn at 0.6 of its size on the platform.
 */
export const DEPTH = (() => {
  const horizonY = 255;                        // the backdrop's horizon (far quays and hills)
  const vanishX = 960;
  const nearGroundY = PLATFORM_LAYOUT.baseY;   // z = 0: where the frames stand in the yard
  const farGroundY = BRIDGE_GEOMETRY.deckY;    // z = 1: where they stand on the bridge
  const farScale = (farGroundY - horizonY) / (nearGroundY - horizonY);
  const k = 1 / farScale - 1;
  // The same perspective as a real 3D camera: CSS `perspective: perspectivePx` with its origin on
  // (vanishX, horizonY) draws a point `distancePx` behind the front plane exactly at depth 1.
  const perspectivePx = 1500;
  return Object.freeze({ horizonY, vanishX, nearGroundY, farGroundY, farScale, k, perspectivePx, distancePx: k * perspectivePx });
})();

/** How large something at depth z is drawn, relative to the front plane. */
export function depthScale(z) {
  return 1 / (1 + DEPTH.k * z);
}

/** Screen y of the ground at depth z. */
export function groundY(z) {
  return DEPTH.horizonY + (DEPTH.nearGroundY - DEPTH.horizonY) * depthScale(z);
}

/** A world point (x, height above the ground, depth z) on the stage, with its draw scale. */
export function projectWorldToScreen({ x, height, z }) {
  const scale = depthScale(z);
  return { x: DEPTH.vanishX + (x - DEPTH.vanishX) * scale, y: groundY(z) - height * scale, scale };
}

/** The inverse at a known depth: the world point that appears at stage (x, y). */
export function screenToWorld({ x, y, z }) {
  const scale = depthScale(z);
  return { x: DEPTH.vanishX + (x - DEPTH.vanishX) / scale, height: (groundY(z) - y) / scale, z };
}

/** A point given in front-plane stage coordinates (x, y as if at depth 0) seen at depth z. */
export function frontToScreen({ x, y, z }) {
  const scale = depthScale(z);
  return { x: DEPTH.vanishX + (x - DEPTH.vanishX) * scale, y: DEPTH.horizonY + (y - DEPTH.horizonY) * scale, scale };
}

/** The inverse: the front-plane coordinates of a stage point seen at depth z. */
export function screenToFront({ x, y, z }) {
  const scale = depthScale(z);
  return { x: DEPTH.vanishX + (x - DEPTH.vanishX) / scale, y: DEPTH.horizonY + (y - DEPTH.horizonY) / scale };
}
