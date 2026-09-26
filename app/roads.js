import { noise, smoothstep } from './biomes.js';
export const ROAD_TYPES = {
  dirt: { name: 'Dirt track', color: [135, 105, 70] },
  gravel: { name: 'Gravel road', color: [154, 150, 134] },
  cobble: { name: 'Cobblestone', color: [145, 141, 127] },
  paved: { name: 'Paved road', color: [65, 69, 72] },
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export function paintRoad(world, stroke, guide, { type = 'dirt', width = 12, grade = false } = {}) {
  if (!stroke || !ROAD_TYPES[type] || !Array.isArray(guide) || guide.length < 2) return 0;
  if (!Number.isFinite(width) || width < 2 || width > 64 || guide.length > 4096 || guide.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y) || !world.inside(p.x, p.y))) throw new Error('Keep the road route inside the world.');
  let length = 0;
  for (let i = 1; i < guide.length; i++) length += Math.hypot(guide[i].x - guide[i - 1].x, guide[i].y - guide[i - 1].y);
  if (length < 1) return 0;
  if (length > 8192) throw new Error('Draw roads in sections shorter than 8,192 samples.');
  // Split long diagonals so work follows the road corridor, not its bounding square.
  const route = [{ ...guide[0] }];
  for (let i = 1; i < guide.length; i++) {
    const a = guide[i - 1], b = guide[i], count = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / Math.max(2, width * .5));
    for (let j = 1; j <= count; j++) route.push({ x: a.x + (b.x - a.x) * j / count, y: a.y + (b.y - a.y) * j / count });
  }
  guide = route;
  // Take the strongest coverage once per sample, including bends and crossings.
  const cells = new Map(), half = width / 2, margin = half + 2, bounds = world.bounds;
  let along = 0;
  for (let i = 1; i < guide.length; i++) {
    const a = guide[i - 1], b = guide[i], dx = b.x - a.x, dy = b.y - a.y, segment = Math.hypot(dx, dy);
    if (!segment) continue;
    const ah = world.sample(a.x, a.y), bh = world.sample(b.x, b.y);
    for (let y = Math.max(bounds.minY, Math.floor(Math.min(a.y, b.y) - margin)); y <= Math.min(bounds.maxY - 1, Math.ceil(Math.max(a.y, b.y) + margin)); y++)
      for (let x = Math.max(bounds.minX, Math.floor(Math.min(a.x, b.x) - margin)); x <= Math.min(bounds.maxX - 1, Math.ceil(Math.max(a.x, b.x) + margin)); x++) {
        const t = clamp(((x - a.x) * dx + (y - a.y) * dy) / (segment * segment), 0, 1);
        const ox = x - a.x - dx * t, oy = y - a.y - dy * t, distance = Math.hypot(ox, oy);
        const edge = type === 'dirt' ? (noise(x * .24, y * .24) - .5) * Math.min(2, half * .2) : 0;
        const coverage = 1 - smoothstep(half * .72, half + edge + .75, distance);
        if (!coverage || world.get(x, y) <= world.sea + .002) continue;
        const key = x + ',' + y, previous = cells.get(key);
        if (!previous || coverage > previous.coverage) cells.set(key, { x, y, coverage, across: (-dy * ox + dx * oy) / segment, along: along + t * segment, height: ah + (bh - ah) * t });
      }
    along += segment;
  }
  for (const p of cells.values()) {
    let color = ROAD_TYPES[type].color.slice(), shade = .9 + noise(p.x * .5, p.y * .5) * .2;
    if (type === 'dirt') shade *= 1 - Math.exp(-(((Math.abs(p.across) - half * .47) / Math.max(.6, half * .12)) ** 2)) * .16;
    if (type === 'gravel') shade = .72 + noise(p.x * 1.2, p.y * 1.2) * .5;
    if (type === 'cobble') {
      const row = Math.floor(p.across / 2.5), u = ((p.along / 3.5 + (row % 2) * .5) % 1 + 1) % 1, v = ((p.across / 2.5) % 1 + 1) % 1;
      if (u < .1 || v < .13) shade *= .55;
    }
    if (type === 'paved' && Math.abs(p.across) < .35 && p.along % 15 < 8) color = [213, 202, 152];
    world.paintColor(p.x, p.y, color.map(v => v * shade), p.coverage * .98, stroke);
    if (grade) world.set(p.x, p.y, world.get(p.x, p.y) + (Math.max(world.sea + .003, p.height) - world.get(p.x, p.y)) * p.coverage * .85, stroke);
  }
  return cells.size;
}
