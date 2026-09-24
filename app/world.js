import { BIOME_COUNT } from './biomes.js';
import { objectPatch, objectBytes, applyObjectPatch } from './objects.js';
export const TILE = 128;
export const FLOOR = -.18;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const keyOf = (x, y) => `${x},${y}`;
export const metadataBytes = (before, after) => Math.max(512, (JSON.stringify(before).length + JSON.stringify(after).length) * 2);

export class World {
  constructor() {
    this.tiles = new Map();
    this.biomes = new Map(); this.biomesVisible = true;
    this.rivers = []; this.riversVisible = true;
    this.objects = []; this.objectsVisible = true; this.objectsRevision = 0;
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
    if (!Number.isFinite(value) || !Number.isInteger(x) || !Number.isInteger(y) || !this.inside(x, y)) return;
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
    // Shared mesh borders and slope shading read samples in adjacent tiles.
    const xs = [0], ys = [0];
    if (lx <= 4) xs.push(-1); if (lx >= TILE - 5) xs.push(1);
    if (ly <= 4) ys.push(-1); if (ly >= TILE - 5) ys.push(1);
    for (const ox of xs) for (const oy of ys) this.dirty.add(keyOf(tx + ox, ty + oy));
    this.revision++;
  }
  paintBiome(x, y, biome, amount, stroke) {
    if (!this.inside(x, y) || !Number.isFinite(amount) || amount <= 0 || !Number.isInteger(biome) || biome < -1 || biome >= BIOME_COUNT) return;
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE), key = keyOf(tx, ty);
    let tile = this.biomes.get(key); if (!tile && biome === -1) return;
    if (!tile) { tile = new Uint8Array(TILE * TILE * BIOME_COUNT); this.biomes.set(key, tile); }
    const index = (y - ty * TILE) * TILE + x - tx * TILE, offset = index * BIOME_COUNT;
    const a = Math.min(1, amount), before = tile.slice(offset, offset + BIOME_COUNT); let total = 0, largest = 0;
    // Retain sub-byte paint during a stroke instead of forcing each faint dab to add a whole byte.
    let precise = stroke?.biomePrecision?.get(key);
    if (stroke && !precise && a < 1 / 255) {
      stroke.biomePrecision ??= new Map();
      precise = Float32Array.from(tile); stroke.biomePrecision.set(key, precise);
    }
    for (let b = 0; b < BIOME_COUNT; b++) {
      const value = (precise ? precise[offset + b] : tile[offset + b]) * (1 - a) + (b === biome ? 255 * a : 0);
      let n = Math.round(value);
      if (a >= 1 / 255 && b === biome && n === before[b] && n < 255) n++;
      if (a >= 1 / 255 && biome === -1 && n === before[b] && n > 0) n--;
      if (precise) precise[offset + b] = n === Math.round(value) ? value : n;
      tile[offset + b] = n; total += n;
      if (n > tile[offset + largest]) largest = b;
    }
    if (precise) {
      let sum = 0; for (let b = 0; b < BIOME_COUNT; b++) sum += precise[offset + b];
      if (sum > 255) for (let b = 0; b < BIOME_COUNT; b++) precise[offset + b] *= 255 / sum;
    }
    if (total > 255) tile[offset + largest] -= total - 255;
    if (before.every((v, b) => v === tile[offset + b])) return;
    if (stroke) { let changes = stroke.biomeChanges.get(key); if (!changes) { changes = new Map(); stroke.biomeChanges.set(key, changes); } if (!changes.has(index)) changes.set(index, before); }
    this.dirty.add(key); this.revision++;
    if (x - tx * TILE <= 4 || y - ty * TILE <= 4 || x - tx * TILE >= TILE - 5 || y - ty * TILE >= TILE - 5) this.touch(tx, ty);
  }
  touch(tx, ty) {
    // Include neighbors: shared mesh borders and slope shading depend on their samples.
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) this.dirty.add(keyOf(tx + dx, ty + dy));
    this.revision++;
  }
  invalidate() { for (const map of [this.tiles, this.biomes]) for (const key of map.keys()) this.dirty.add(key); this.revision++; }
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
  begin(label) { return { label, changes: new Map(), biomeChanges: new Map() }; }
  commit(stroke) {
    const patches = []; let bytes = 0;
    for (const [key, changes] of stroke.changes) {
      const tile = this.world.tiles.get(key), indices = [], before = [], after = [];
      for (const [index, value] of changes) if (value !== tile[index]) { indices.push(index); before.push(value); after.push(tile[index]); }
      if (indices.length) { patches.push({ key, indices: Uint16Array.from(indices), before: Float32Array.from(before), after: Float32Array.from(after) }); bytes += indices.length * 10; }
    }
    for (const [key, changes] of stroke.biomeChanges ?? []) {
      const tile = this.world.biomes.get(key), indices = [], before = [], after = [];
      for (const [index, values] of changes) {
        const offset = index * BIOME_COUNT;
        if (values.every((v, b) => v === tile[offset + b])) continue;
        indices.push(index); for (let b = 0; b < BIOME_COUNT; b++) { before.push(values[b]); after.push(tile[offset + b]); }
      }
      if (indices.length) { patches.push({ channel: 'biomes', key, indices: Uint16Array.from(indices), before: Uint8Array.from(before), after: Uint8Array.from(after) }); bytes += indices.length * (2 + 2 * BIOME_COUNT); }
    }
    const riverMeta = stroke.riversBefore ? { before: { rivers: stroke.riversBefore }, after: { rivers: structuredClone(this.world.rivers) } } : {};
    const objects = objectPatch(this.world, stroke);
    if (objects) bytes += objectBytes(objects);
    if (stroke.riversBefore) bytes += metadataBytes(riverMeta.before, riverMeta.after);
    if (patches.length || stroke.riversBefore || objects) this.push({ label: stroke.label, patches, bytes, time: Date.now(), ...riverMeta, ...(objects ? { objects } : {}) });
    return patches.length > 0 || !!stroke.riversBefore || !!objects;
  }
  metadata(label, before, after) { if (JSON.stringify(before) !== JSON.stringify(after)) this.push({ label, before, after, bytes: metadataBytes(before, after), time: Date.now() }); }
  push(entry) {
    for (const removed of this.entries.splice(this.cursor)) this.bytes -= removed.bytes;
    this.entries.push(entry); this.bytes += entry.bytes; this.cursor++;
    while (this.entries.length > 1 && (this.bytes > this.budget || this.entries.length > this.limit)) { this.bytes -= this.entries.shift().bytes; this.cursor--; this.trimmed++; }
  }
  apply(entry, forward) {
    if (entry.objects) applyObjectPatch(this.world, entry.objects, forward);
    if (entry.before && entry.after) { Object.assign(this.world, structuredClone(forward ? entry.after : entry.before)); this.world.invalidate(); }
    if (entry.patches) for (const patch of entry.patches) {
      const paint = patch.channel === 'biomes', store = paint ? this.world.biomes : this.world.tiles, stride = paint ? BIOME_COUNT : 1;
      let tile = store.get(patch.key);
      if (!tile) { tile = paint ? new Uint8Array(TILE * TILE * BIOME_COUNT) : new Float32Array(TILE * TILE).fill(FLOOR); store.set(patch.key, tile); }
      const values = forward ? patch.after : patch.before;
      for (let i = 0; i < patch.indices.length; i++) for (let b = 0; b < stride; b++) tile[patch.indices[i] * stride + b] = values[i * stride + b];
      if (entry.reset && tile.every(v => v === (paint ? 0 : Math.fround(FLOOR)))) store.delete(patch.key);
      const [x, y] = patch.key.split(',').map(Number); this.world.touch(x, y);
    }
  }
  undo() { if (!this.cursor) return false; this.apply(this.entries[--this.cursor], false); return true; }
  redo() { if (this.cursor === this.entries.length) return false; this.apply(this.entries[this.cursor++], true); return true; }
  goTo(cursor) { if (!Number.isInteger(cursor) || cursor < 0 || cursor > this.entries.length) return; while (this.cursor > cursor) this.undo(); while (this.cursor < cursor) this.redo(); }
}

export function resetWorld(world, history, preset = 'ocean') {
  const next = new World(); if (preset === 'islands') seedWorld(next);
  const metadata = w => ({ bounds: structuredClone(w.bounds), sea: w.sea, ocean: w.ocean, biomesVisible: w.biomesVisible, rivers: structuredClone(w.rivers), riversVisible: w.riversVisible, objectsVisible: w.objectsVisible });
  const entry = { label: preset === 'islands' ? 'Reset to starter islands' : 'Reset to empty ocean', reset: true, before: metadata(world), after: metadata(next), patches: [], bytes: 512, time: Date.now() };
  entry.bytes = metadataBytes(entry.before, entry.after);
  if (world.objects.length) { entry.objects = { added: [], removed: structuredClone(world.objects) }; entry.bytes += objectBytes(entry.objects); }
  for (const channel of ['height', 'biomes']) {
    const current = channel === 'height' ? world.tiles : world.biomes, target = channel === 'height' ? next.tiles : next.biomes;
    const stride = channel === 'height' ? 1 : BIOME_COUNT, Type = stride === 1 ? Float32Array : Uint8Array, baseline = stride === 1 ? Math.fround(FLOOR) : 0;
    for (const key of new Set([...current.keys(), ...target.keys()])) {
      const old = current.get(key), fresh = target.get(key), indices = [], before = [], after = [];
      for (let i = 0; i < TILE * TILE; i++) {
        let changed = false; for (let b = 0; b < stride; b++) if ((old?.[i * stride + b] ?? baseline) !== (fresh?.[i * stride + b] ?? baseline)) { changed = true; break; }
        if (!changed) continue;
        indices.push(i); for (let b = 0; b < stride; b++) { before.push(old?.[i * stride + b] ?? baseline); after.push(fresh?.[i * stride + b] ?? baseline); }
      }
      if (indices.length) { entry.patches.push({ key, channel, indices: Uint16Array.from(indices), before: Type.from(before), after: Type.from(after) }); entry.bytes += indices.length * (2 + stride * Type.BYTES_PER_ELEMENT * 2); }
    }
  }
  world.tiles = next.tiles; world.biomes = next.biomes; world.objects = []; world.objectsRevision++; Object.assign(world, metadata(next)); world.dirty.clear(); world.invalidate(); history.push(entry);
}

export function dab(world, stroke, cx, cy, options) {
  const { radius, strength, tool, mask, rotation = 0, target = 0, dt = 1, biome = 0, mode = 'additive', strokeHeight = .3 } = options;
  if (![cx, cy, radius, strength, rotation, target, dt].every(Number.isFinite) || radius <= 0) return;
  const blending = mode === 'blend' && ['raise', 'lower', 'stamp'].includes(tool);
  if (blending && (!stroke?.changes || !Number.isFinite(strokeHeight) || strokeHeight <= 0)) return;
  const b = world.bounds, cos = Math.cos(rotation), sin = Math.sin(rotation);
  const left = Math.max(b.minX, Math.floor(cx - radius)), right = Math.min(b.maxX - 1, Math.ceil(cx + radius));
  const top = Math.max(b.minY, Math.floor(cy - radius)), bottom = Math.min(b.maxY - 1, Math.ceil(cy + radius));
  if (left > right || top > bottom) return;
  // Summed areas keep both fine smoothing and broad melding O(1) per edited sample.
  // All values come from the pre-dab snapshot, avoiding directional bias.
  let integral, stride;
  const meld = tool === 'meld', kernel = meld ? clamp(Math.round(radius * .3), 3, 64) : 2;
  if (tool === 'smooth' || meld) {
    const width = right - left + kernel * 2 + 1, height = bottom - top + kernel * 2 + 1;
    stride = width + 1; integral = new Float64Array(stride * (height + 1));
    for (let y = 0; y < height; y++) {
      let row = 0;
      for (let x = 0; x < width; x++) { const sx = left - kernel + x, sy = top - kernel + y; row += meld ? world.get(clamp(sx, b.minX, b.maxX - 1), clamp(sy, b.minY, b.maxY - 1)) : world.get(sx, sy); integral[(y + 1) * stride + x + 1] = integral[y * stride + x + 1] + row; }
    }
  }
  for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
    const dx = (x - cx) / radius, dy = (y - cy) / radius, distance = Math.hypot(dx, dy);
    if (distance >= 1) continue;
    const falloff = Math.pow(1 - distance * distance, 2);
    let weight = falloff;
    if (mask && !meld) {
      const u = (dx * cos + dy * sin + 1) * .5, v = (-dx * sin + dy * cos + 1) * .5;
      const mx = clamp(Math.round(u * (mask.size - 1)), 0, mask.size - 1), my = clamp(Math.round(v * (mask.size - 1)), 0, mask.size - 1);
      weight *= mask.data[my * mask.size + mx] / 65535;
    }
    const current = world.get(x, y), amount = strength * weight * dt;
    if (tool === 'paint' || tool === 'erase') { if (current >= world.sea) world.paintBiome(x, y, tool === 'erase' ? -1 : biome, amount * .5, stroke); continue; }
    let value = current;
    if (blending) {
      const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE), index = (y - ty * TILE) * TILE + x - tx * TILE;
      // Reuse the undo baseline: an overlapping dab can strengthen the brush
      // profile, but never add a second layer during this stroke.
      const original = stroke.changes.get(keyOf(tx, ty))?.get(index) ?? current;
      const depth = clamp(strength, 0, 1) * weight * strokeHeight;
      value = tool === 'lower' ? Math.min(current, original - depth) : Math.max(current, original + depth);
    } else if (tool === 'raise' || tool === 'lower') value += amount * .055 * (tool === 'raise' ? 1 : -1);
    if (tool === 'flatten') value += (target - current) * Math.min(1, amount * .38);
    if (tool === 'stamp' && !blending) value = Math.max(current, target + weight * strength * .8);
    if (tool === 'smooth' || meld) {
      const ix = x - left, iy = y - top, diameter = kernel * 2 + 1;
      const sum = integral[(iy + diameter) * stride + ix + diameter] - integral[iy * stride + ix + diameter] - integral[(iy + diameter) * stride + ix] + integral[iy * stride + ix];
      // Broad averaging lowers peaks and fills cuts together; exponential blending cannot overshoot.
      const influence = meld ? 1 - Math.exp(-Math.max(0, amount) * 3) : Math.min(1, amount * .65);
      value += (sum / (diameter * diameter) - current) * influence;
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
