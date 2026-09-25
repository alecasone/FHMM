import { BIOMES, BIOME_COUNT, surfaceColor } from './biomes.js';
import { TILE, keyOf } from './world.js';
import { riverSections } from './rivers.js';

// Compare unlit colors perceptually so lighting cannot change the selected biome.
function perceptual(rgb) {
  const [r, g, b] = rgb.map(v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; });
  const l = Math.cbrt(.4122214708*r + .5363325363*g + .0514459929*b);
  const m = Math.cbrt(.2119034982*r + .6806995451*g + .1073969566*b);
  const s = Math.cbrt(.0883024619*r + .2817188376*g + .6299787005*b);
  return [.2104542553*l + .793617785*m - .0040720468*s, 1.9779984951*l - 2.428592205*m + .4505937099*s, .0259040371*l + .7827717662*m - .808675766*s];
}
const palette = BIOMES.map(b => perceptual([1, 3, 5].map(i => parseInt(b.color.slice(i, i + 2), 16))));
export function nearestBiome(rgb) {
  const color = perceptual(rgb); let best = 0, distance = Infinity;
  palette.forEach((entry, index) => { const d = entry.reduce((sum, v, c) => sum + (v - color[c]) ** 2, 0); if (d < distance) { distance = d; best = index; } });
  return best;
}
function inPolygon(x, y, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i], b = points[j];
    if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
export function pickBiome(world, x, y) {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !world.inside(x, y)) return null;
  const water = BIOMES.findIndex(b => b.id === 'water');
  if (world.ocean && world.sample(x, y) < world.sea) return water;
  if (world.riversVisible) for (const river of world.rivers) {
    const sections = riverSections(world, river);
    for (let i = 1; i < sections.length; i++) {
      const a = sections[i - 1], b = sections[i];
      if (a.wet && b.wet && inPolygon(x, y, [a.left, a.right, b.right, b.left])) return water;
    }
  }
  x = Math.floor(x); y = Math.floor(y);
  const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE), weights = world.biomes.get(keyOf(tx, ty));
  const colors = world.colors.get(keyOf(tx, ty)), colorOffset = ((y - ty * TILE) * TILE + x - tx * TILE) * 4;
  if (world.biomesVisible && colors?.[colorOffset + 3]) return Array.from(colors.subarray(colorOffset, colorOffset + 3));
  const offset = ((y - ty * TILE) * TILE + x - tx * TILE) * BIOME_COUNT;
  if (world.biomesVisible && weights) {
    let best = -1, weight = 0;
    for (let b = 0; b < BIOME_COUNT; b++) if (weights[offset + b] > weight) { best = b; weight = weights[offset + b]; }
    if (best !== -1) return best;
  }
  const slope = Math.hypot(world.get(x - 1, y) - world.get(x + 1, y), world.get(x, y - 1) - world.get(x, y + 1)) * 50;
  return nearestBiome(surfaceColor(world.get(x, y), world.sea, x, y, slope));
}
