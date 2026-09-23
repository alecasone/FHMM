export const TILE = 128;
export const FLOOR = -.18;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const keyOf = (x, y) => `${x},${y}`;

export class World {
  constructor() {
    this.tiles = new Map();
    this.bounds = { minX: -512, minY: -512, maxX: 512, maxY: 512 };
    this.sea = 0; this.ocean = true; this.name = 'The Unwritten Isles';
    this.dirty = new Set(); this.revision = 0;
  }
  inside(x, y) { const b = this.bounds; return x >= b.minX && y >= b.minY && x < b.maxX && y < b.maxY; }
  get(x, y) {
    x = Math.floor(x); y = Math.floor(y);
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    return this.tiles.get(keyOf(tx, ty))?.[(y - ty * TILE) * TILE + x - tx * TILE] ?? Math.fround(FLOOR);
  }
  sample(x, y) {
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    return (this.get(ix, iy) * (1 - fx) + this.get(ix + 1, iy) * fx) * (1 - fy) + (this.get(ix, iy + 1) * (1 - fx) + this.get(ix + 1, iy + 1) * fx) * fy;
  }
  set(x, y, value, stroke) {
    if (!this.inside(x, y)) return;
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE), key = keyOf(tx, ty);
    let tile = this.tiles.get(key);
    const index = (y - ty * TILE) * TILE + x - tx * TILE;
    value = Math.fround(clamp(value, -1, 2));
    if ((tile?.[index] ?? Math.fround(FLOOR)) === value) return;
    if (!tile) { tile = new Float32Array(TILE * TILE).fill(FLOOR); this.tiles.set(key, tile); }
    if (stroke) {
      let changed = stroke.changes.get(key);
      if (!changed) { changed = new Map(); stroke.changes.set(key, changed); }
      if (!changed.has(index)) changed.set(index, tile[index]);
    }
    tile[index] = value;
    this.dirty.add(key);
    const lx = x - tx * TILE, ly = y - ty * TILE;
    if (lx < 2) this.dirty.add(keyOf(tx - 1, ty));
    if (lx > TILE - 3) this.dirty.add(keyOf(tx + 1, ty));
    if (ly < 2) this.dirty.add(keyOf(tx, ty - 1));
    if (ly > TILE - 3) this.dirty.add(keyOf(tx, ty + 1));
    if (lx < 2 && ly < 2) this.dirty.add(keyOf(tx - 1, ty - 1));
    this.revision++;
  }
  touch(tx, ty) {
    // Include neighbors: shared mesh borders and slope shading depend on their samples.
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) this.dirty.add(keyOf(tx + dx, ty + dy));
    this.revision++;
  }
  invalidate() { for (const key of this.tiles.keys()) this.dirty.add(key); this.revision++; }
  expand(direction, tiles = 2) {
    const amount = TILE * tiles;
    if (direction === 'all' || direction === 'west') this.bounds.minX -= amount;
    if (direction === 'all' || direction === 'north') this.bounds.minY -= amount;
    if (direction === 'all' || direction === 'east') this.bounds.maxX += amount;
    if (direction === 'all' || direction === 'south') this.bounds.maxY += amount;
    this.revision++;
  }
}

export class History {
  constructor(world, budget = 256 * 1024 * 1024, limit = 2000) { this.world = world; this.entries = []; this.cursor = 0; this.bytes = 0; this.budget = budget; this.limit = limit; this.trimmed = 0; }
  begin(label) { return { label, changes: new Map() }; }
  commit(stroke) {
    const patches = []; let bytes = 0;
    for (const [key, changes] of stroke.changes) {
      const tile = this.world.tiles.get(key), indices = [], before = [], after = [];
      for (const [index, value] of changes) if (value !== tile[index]) { indices.push(index); before.push(value); after.push(tile[index]); }
      if (indices.length) { patches.push({ key, indices: Uint16Array.from(indices), before: Float32Array.from(before), after: Float32Array.from(after) }); bytes += indices.length * 10; }
    }
    if (patches.length) this.push({ label: stroke.label, patches, bytes, time: Date.now() });
    return patches.length > 0;
  }
  metadata(label, before, after) { if (JSON.stringify(before) !== JSON.stringify(after)) this.push({ label, before, after, bytes: 512, time: Date.now() }); }
  push(entry) {
    for (const removed of this.entries.splice(this.cursor)) this.bytes -= removed.bytes;
    this.entries.push(entry); this.bytes += entry.bytes; this.cursor++;
    while (this.entries.length > 1 && (this.bytes > this.budget || this.entries.length > this.limit)) { this.bytes -= this.entries.shift().bytes; this.cursor--; this.trimmed++; }
  }
  apply(entry, forward) {
    if (entry.patches) for (const patch of entry.patches) {
      let tile = this.world.tiles.get(patch.key);
      if (!tile) { tile = new Float32Array(TILE * TILE).fill(FLOOR); this.world.tiles.set(patch.key, tile); }
      const values = forward ? patch.after : patch.before;
      for (let i = 0; i < patch.indices.length; i++) tile[patch.indices[i]] = values[i];
      const [x, y] = patch.key.split(',').map(Number); this.world.touch(x, y);
    }
    else { Object.assign(this.world, structuredClone(forward ? entry.after : entry.before)); this.world.invalidate(); }
  }
  undo() { if (!this.cursor) return false; this.apply(this.entries[--this.cursor], false); return true; }
  redo() { if (this.cursor === this.entries.length) return false; this.apply(this.entries[this.cursor++], true); return true; }
  goTo(cursor) { while (this.cursor > cursor) this.undo(); while (this.cursor < cursor) this.redo(); }
}

export function dab(world, stroke, cx, cy, options) {
  const { radius, strength, tool, mask, rotation = 0, target = 0, dt = 1 } = options;
  const b = world.bounds, cos = Math.cos(rotation), sin = Math.sin(rotation);
  const left = Math.max(b.minX, Math.floor(cx - radius)), right = Math.min(b.maxX - 1, Math.ceil(cx + radius));
  const top = Math.max(b.minY, Math.floor(cy - radius)), bottom = Math.min(b.maxY - 1, Math.ceil(cy + radius));
  if (left > right || top > bottom) return;
  // An integral image keeps the 5x5 smoothing kernel O(1) per edited sample.
  // All values come from the pre-dab snapshot, avoiding directional bias.
  let integral, stride;
  if (tool === 'smooth') {
    const width = right - left + 5, height = bottom - top + 5;
    stride = width + 1; integral = new Float64Array(stride * (height + 1));
    for (let y = 0; y < height; y++) {
      let row = 0;
      for (let x = 0; x < width; x++) { row += world.get(left - 2 + x, top - 2 + y); integral[(y + 1) * stride + x + 1] = integral[y * stride + x + 1] + row; }
    }
  }
  for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
    const dx = (x - cx) / radius, dy = (y - cy) / radius, distance = Math.hypot(dx, dy);
    if (distance >= 1) continue;
    const falloff = Math.pow(1 - distance * distance, 2);
    let weight = falloff;
    if (mask) {
      const u = (dx * cos + dy * sin + 1) * .5, v = (-dx * sin + dy * cos + 1) * .5;
      const mx = clamp(Math.round(u * (mask.size - 1)), 0, mask.size - 1), my = clamp(Math.round(v * (mask.size - 1)), 0, mask.size - 1);
      weight *= mask.data[my * mask.size + mx] / 65535;
    }
    const current = world.get(x, y), amount = strength * weight * dt;
    let value = current;
    if (tool === 'raise' || tool === 'lower') value += amount * .055 * (tool === 'raise' ? 1 : -1);
    if (tool === 'flatten') value += (target - current) * Math.min(1, amount * .38);
    if (tool === 'stamp') value = Math.max(current, target + weight * strength * .8);
    if (tool === 'smooth') {
      const ix = x - left, iy = y - top;
      const sum = integral[(iy + 5) * stride + ix + 5] - integral[iy * stride + ix + 5] - integral[(iy + 5) * stride + ix] + integral[iy * stride + ix];
      value += (sum / 25 - current) * Math.min(1, amount * .65);
    }
    world.set(x, y, value, stroke);
  }
}

function hash(x, y) { const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return n - Math.floor(n); }
function noise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y); let fx = x - ix, fy = y - iy;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  return (hash(ix, iy) * (1 - fx) + hash(ix + 1, iy) * fx) * (1 - fy) + (hash(ix, iy + 1) * (1 - fx) + hash(ix + 1, iy + 1) * fx) * fy;
}
export function seedWorld(world) {
  for (let ty = -4; ty < 4; ty++) for (let tx = -4; tx < 4; tx++) {
    const tile = new Float32Array(TILE * TILE);
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const wx = tx * TILE + x, wy = ty * TILE + y;
      const n = noise(wx / 115 + 10, wy / 115 + 8) * .58 + noise(wx / 47, wy / 47) * .26 + noise(wx / 19, wy / 19) * .11 + noise(wx / 7, wy / 7) * .05;
      const a = Math.exp(-((wx + 115) ** 2 / 62000 + (wy + 30) ** 2 / 93000));
      const b = Math.exp(-((wx - 205) ** 2 / 17000 + (wy - 140) ** 2 / 28000));
      const c = Math.exp(-((wx - 160) ** 2 / 19000 + (wy + 230) ** 2 / 16000));
      const mass = Math.max(a, b * .77, c * .67);
      const ridge = Math.pow(1 - Math.abs(noise(wx / 90 + 40, wy / 90) * 2 - 1), 3);
      tile[y * TILE + x] = Math.max(FLOOR, mass * (.36 + n * .56) - .31 + Math.max(0, mass - .50) * ridge * .68);
    }
    world.tiles.set(keyOf(tx, ty), tile);
  }
  world.invalidate();
}

const WATER_COLORS = [[-.7, 13, 34, 48], [-.18, 20, 54, 69], [-.025, 39, 91, 98], [0, 75, 135, 133]];
const LAND_COLORS = [[-1, 65, 82, 62], [0, 184, 171, 122], [.035, 118, 142, 88], [.15, 70, 107, 75], [.3, 101, 121, 91], [.48, 144, 146, 126], [.68, 193, 194, 178], [.9, 233, 239, 229], [2, 250, 252, 248]];
export function terrainColor(h, sea = 0, ocean = true) {
  const r = h - sea;
  const stops = ocean && r < 0 ? WATER_COLORS : LAND_COLORS;
  for (let i = 1; i < stops.length; i++) if (r <= stops[i][0]) { const lo = stops[i - 1], hi = stops[i], t = clamp((r - lo[0]) / (hi[0] - lo[0]), 0, 1); return [1, 2, 3].map(k => lo[k] + (hi[k] - lo[k]) * t); }
  return stops.at(-1).slice(1);
}
