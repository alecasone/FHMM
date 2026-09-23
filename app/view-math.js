export const radians = degrees => degrees * Math.PI / 180;
export const wrapDegrees = degrees => ((degrees % 360) + 360) % 360;
export function rotate2D(x, y, angle) { const c = Math.cos(angle), s = Math.sin(angle); return { x: x * c - y * s, y: x * s + y * c }; }
export function sunDirection(azimuth, elevation) {
  const a = radians(azimuth), e = radians(elevation);
  return { x: Math.sin(a) * Math.cos(e), y: Math.sin(e), z: -Math.cos(a) * Math.cos(e) };
}
export function hillshade(left, right, up, down, sun) {
  const nx = (left - right) * 180, nz = (up - down) * 180, length = Math.hypot(nx, 2, nz);
  return Math.max(.38, Math.min(1.35, .4 + Math.max(0, (nx * sun.x + 2 * sun.y + nz * sun.z) / length) * 1.15));
}
