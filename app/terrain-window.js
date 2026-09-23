import { TILE, clamp, keyOf } from './world.js';

export const MIN_RENDER_DISTANCE = 2;
export const MAX_RENDER_DISTANCE = 12;
export const DEFAULT_RENDER_DISTANCE = 6;

// Distance is a tile radius. Bound the working set independently of world size.
export function normalizeRenderDistance(value) {
  const number = Number(value);
  return Number.isFinite(number) && value !== null ? clamp(Math.round(number), MIN_RENDER_DISTANCE, MAX_RENDER_DISTANCE) : DEFAULT_RENDER_DISTANCE;
}

export function terrainWindow(bounds, targetX, targetY, distance) {
  const radius = normalizeRenderDistance(distance);
  const tx = Math.floor(clamp(targetX, bounds.minX, bounds.maxX - 1) / TILE);
  const ty = Math.floor(clamp(targetY, bounds.minY, bounds.maxY - 1) / TILE);
  const visible = {
    minX: Math.max(bounds.minX, (tx - radius) * TILE), minY: Math.max(bounds.minY, (ty - radius) * TILE),
    maxX: Math.min(bounds.maxX, (tx + radius) * TILE), maxY: Math.min(bounds.maxY, (ty + radius) * TILE),
  };
  const tiles = [];
  for (let y = visible.minY / TILE; y < visible.maxY / TILE; y++) {
    for (let x = visible.minX / TILE; x < visible.maxX / TILE; x++) tiles.push({ key: keyOf(x, y), x, y });
  }
  tiles.sort((a, b) => (a.x - tx) ** 2 + (a.y - ty) ** 2 - (b.x - tx) ** 2 - (b.y - ty) ** 2);
  return { bounds: visible, tiles, keys: new Set(tiles.map(tile => tile.key)) };
}
