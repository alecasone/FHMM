import { noise, smoothstep } from './biomes.js';

export const MAX_RIVERS = 128, MAX_RIVER_POINTS = 32768, MAX_RIVER_LENGTH = 8192;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

export function validateRivers(rivers) {
  if (!Array.isArray(rivers) || rivers.length > MAX_RIVERS) throw new Error('Invalid river list');
  let count = 0;
  for (const river of rivers) {
    if (!river || !Number.isFinite(river.depth) || river.depth < .005 || river.depth > .12 || !Array.isArray(river.points) || river.points.length < 2 || river.points.length > 4096) throw new Error('Invalid river');
    count += river.points.length; let length = 0;
    for (let i = 0; i < river.points.length; i++) {
      const p = river.points[i];
      if (!p || !['x', 'y', 'water', 'width'].every(k => Number.isFinite(p[k])) || Math.abs(p.x) > 2 ** 24 || Math.abs(p.y) > 2 ** 24 || p.water < -.95 || p.water > 2 || p.width < 1 || p.width > 64) throw new Error('Invalid river samples');
      if (i) { length += distance(p, river.points[i - 1]); if (p.water > river.points[i - 1].water + 1e-8) throw new Error('River cannot flow uphill'); }
    }
    if (length > MAX_RIVER_LENGTH + 100) throw new Error('River is too long');
  }
  if (count > MAX_RIVER_POINTS) throw new Error('River detail budget exceeded');
}

function resample(points, spacing) {
  const result = [{ ...points[0] }]; let remaining = spacing;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], length = distance(a, b); if (!length) continue;
    let d = remaining;
    for (; d <= length; d += spacing) { const t = d / length; result.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }); }
    remaining = d - length;
  }
  if (distance(result.at(-1), points.at(-1)) > .1) result.push({ ...points.at(-1) });
  return result;
}

export function planRiver(world, guide, { width = 18, depth = .03, natural = true } = {}) {
  if (!Array.isArray(guide) || guide.length < 2 || guide.length > 4096 || !Number.isFinite(width) || !Number.isFinite(depth)) throw new Error('Draw a river path on the terrain.');
  width = clamp(width, 4, 48); depth = clamp(depth, .005, .12);
  let length = 0;
  for (let i = 0; i < guide.length; i++) {
    const p = guide[i]; if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !world.inside(p.x, p.y)) throw new Error('Keep the river inside the world borders.');
    if (i) length += distance(p, guide[i - 1]);
  }
  if (length < 8) throw new Error('Drag a longer path from the source toward its outlet.');
  if (length > MAX_RIVER_LENGTH) throw new Error('Draw rivers in sections shorter than 8,192 samples.');
  let route = resample(guide, Math.max(3, width * .4));
  if (world.sample(route[0].x, route[0].y) < world.sample(route.at(-1).x, route.at(-1).y)) route.reverse();
  // Search only a narrow corridor around the drawn guide. This favors nearby
  // valleys without a whole-world drainage solve or surprising distant routes.
  if (natural) {
    route = route.map((p, i, all) => {
      if (!i || i === all.length - 1) return p;
      const a = all[i - 1], b = all[i + 1], d = distance(a, b) || 1, nx = -(b.y - a.y) / d, ny = (b.x - a.x) / d;
      const bend = (noise(i * .09 + 51, p.x * .003) - .5) * width;
      let best = p, score = Infinity;
      for (let j = -3; j <= 3; j++) {
        const offset = j * width * .3 + bend, q = { x: p.x + nx * offset, y: p.y + ny * offset };
        if (!world.inside(q.x, q.y)) continue;
        const cost = world.sample(q.x, q.y) + Math.abs(offset) / width * .018;
        if (cost < score) { best = q; score = cost; }
      }
      return best;
    });
  }
  for (let pass = 0; pass < 3; pass++) route = route.map((p, i, all) => !i || i === all.length - 1 ? p : ({ x: (all[i - 1].x + p.x * 2 + all[i + 1].x) / 4, y: (all[i - 1].y + p.y * 2 + all[i + 1].y) / 4 }));
  route = resample(route, Math.max(2, width * .22));
  const points = []; let water = 2, land = false;
  for (let i = 0; i < route.length; i++) {
    const p = route[i], h = world.sample(p.x, p.y), step = i ? distance(p, route[i - 1]) : 0;
    water = Math.max(-.95, Math.min(h - depth * .18, water - step * .000025));
    const growth = .66 + .34 * i / (route.length - 1), variation = .9 + noise(p.x * .035, p.y * .035) * .2;
    points.push({ ...p, water, width: width * growth * variation });
    if (h > world.sea) land = true;
    // End at the first sea crossing rather than carving the seabed indefinitely.
    if (land && world.ocean && h < world.sea - depth && points.length > 2) break;
  }
  if (points.length < 2 || (world.ocean && !land)) throw new Error('Start the river on land.');
  const river = { depth, points }; validateRivers([...world.rivers, river]); return river;
}

// Rasterize the entire path into one local envelope before editing. Adjacent
// segments do not repeatedly erode or repaint the same bank sample.
export function carveRiver(world, stroke, river) {
  const cells = new Map(), points = river.points, depth = river.depth;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], dx = b.x - a.x, dy = b.y - a.y, length2 = dx * dx + dy * dy;
    if (!length2) continue;
    const margin = Math.max(a.width, b.width) * 1.35 + 2;
    for (let y = Math.max(world.bounds.minY, Math.floor(Math.min(a.y, b.y) - margin)); y <= Math.min(world.bounds.maxY - 1, Math.ceil(Math.max(a.y, b.y) + margin)); y++) {
      for (let x = Math.max(world.bounds.minX, Math.floor(Math.min(a.x, b.x) - margin)); x <= Math.min(world.bounds.maxX - 1, Math.ceil(Math.max(a.x, b.x) + margin)); x++) {
        const t = clamp(((x - a.x) * dx + (y - a.y) * dy) / length2, 0, 1), cx = a.x + dx * t, cy = a.y + dy * t;
        const width = a.width + (b.width - a.width) * t, water = a.water + (b.water - a.water) * t;
        const r = Math.hypot(x - cx, y - cy) / (width * .5); if (r > 2.6) continue;
        const old = world.get(x, y), bed = water - depth * (.85 - .7 * Math.min(1, r) ** 2);
        const blend = 1 - smoothstep(1, 2.6, r), target = old + (Math.min(old, bed) - old) * blend;
        const key = `${x},${y}`, prior = cells.get(key), wet = r < 1.05, paint = (wet ? .52 : .34) * blend;
        if (!prior) cells.set(key, { x, y, target, paint, wet });
        else { prior.target = Math.min(prior.target, target); if (paint > prior.paint) { prior.paint = paint; prior.wet = wet; } }
      }
    }
  }
  for (const p of cells.values()) {
    world.set(p.x, p.y, p.target, stroke);
    world.paintBiome(p.x, p.y, p.wet ? 8 : 7, p.paint, stroke);
  }
  return cells.size;
}

export function addRiver(world, stroke, guide, options) {
  const river = planRiver(world, guide, options);
  stroke.riversBefore ??= structuredClone(world.rivers);
  carveRiver(world, stroke, river); world.rivers = [...world.rivers, river]; world.revision++; return river;
}

export function riverSections(world, river) {
  let along = 0;
  return river.points.map((p, i, points) => {
    const a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)], length = distance(a, b) || 1;
    const nx = -(b.y - a.y) / length, ny = (b.x - a.x) / length;
    if (i) along += distance(points[i - 1], p);
    const wet = world.inside(p.x, p.y) && world.sample(p.x, p.y) < p.water - .0001 && !(world.ocean && p.water < world.sea);
    const edge = sign => {
      let width = 0;
      if (wet) for (let j = 1; j <= 8; j++) { const d = p.width * .5 * j / 8; if (world.sample(p.x + nx * d * sign, p.y + ny * d * sign) >= p.water) break; width = d; }
      return { x: p.x + nx * width * sign, y: p.y + ny * width * sign };
    };
    const grade = (b.water - a.water) / length;
    return { ...p, left: edge(-1), right: edge(1), wet, along, normalX: -grade * (b.x - a.x) / length, normalY: -grade * (b.y - a.y) / length };
  });
}
