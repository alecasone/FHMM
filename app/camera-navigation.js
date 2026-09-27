export const CLOSEUP_DISTANCE = 2;
export const CAMERA_CLEARANCE = .5;
export const MAX_MAP_ZOOM = 64;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

// Normalize mouse wheels, line/page scrolling and trackpad pinch in both views.
export function wheelZoomFactor(event) {
  const pixels = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 100 : 1) * (event.ctrlKey ? 10 : 1);
  return Number.isFinite(pixels) ? Math.exp(clamp(pixels * .001, -.5, .5)) : 1;
}

// Scale about the picked surface, then rebase orbit depth without turning the
// camera. The picked point retains its screen position even on tall mountains.
export function surfaceZoom(position, target, anchor, factor, maxDistance) {
  const length = Math.hypot(target.x - position.x, target.y - position.y, target.z - position.z);
  if (!(length > 0) || !Number.isFinite(factor) || factor <= 0) return null;
  const forward = { x: (target.x - position.x) / length, y: (target.y - position.y) / length, z: (target.z - position.z) / length };
  let depth = (anchor.x - position.x) * forward.x + (anchor.y - position.y) * forward.y + (anchor.z - position.z) * forward.z;
  if (!Number.isFinite(depth) || depth <= 0) { anchor = target; depth = length; }
  const boundedDepth = clamp(depth * factor, CLOSEUP_DISTANCE, maxDistance);
  // A grazing/edge hit may already be outside orbit limits. Never reverse the
  // requested zoom direction or jump farther than the wheel asked us to move.
  const scale = clamp(boundedDepth / depth, Math.min(factor, 1), Math.max(factor, 1));
  const nextDepth = clamp(depth * scale, CLOSEUP_DISTANCE, maxDistance);
  const nextPosition = {}, nextTarget = {};
  for (const axis of ['x', 'y', 'z']) {
    nextPosition[axis] = anchor[axis] + (position[axis] - anchor[axis]) * scale;
    nextTarget[axis] = nextPosition[axis] + forward[axis] * nextDepth;
  }
  return { position: nextPosition, target: nextTarget };
}
