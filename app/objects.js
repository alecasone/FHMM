// Objects store horizontal anchors only. Their height is sampled from the terrain.
export const MAX_OBJECTS = 2 ** 50;
export function objectLimit(world) { const b = world.bounds; return Math.min(MAX_OBJECTS, (b.maxX - b.minX) * (b.maxY - b.minY)); }
export const OBJECT_TYPES = [
  {
    "id": "pine",
    "name": "Pine tree",
    "radius": 3.8,
    "color": "#315d40",
    "category": "Trees",
    "symbol": "conifer"
  },
  {
    "id": "oak",
    "name": "Broadleaf tree",
    "radius": 5,
    "color": "#648343",
    "category": "Trees",
    "symbol": "tree"
  },
  {
    "id": "spruce",
    "name": "Spruce",
    "radius": 4,
    "color": "#2c514e",
    "category": "Trees",
    "symbol": "conifer"
  },
  {
    "id": "birch",
    "name": "Birch",
    "radius": 3.5,
    "color": "#a5b76b",
    "category": "Trees",
    "symbol": "birch"
  },
  {
    "id": "willow",
    "name": "Willow",
    "radius": 7.5,
    "color": "#718c56",
    "category": "Trees",
    "symbol": "willow"
  },
  {
    "id": "autumn",
    "name": "Autumn maple",
    "radius": 5.5,
    "color": "#bf7037",
    "category": "Trees",
    "symbol": "tree"
  },
  {
    "id": "dead-tree",
    "name": "Dead tree",
    "radius": 3.8,
    "color": "#85735c",
    "category": "Trees",
    "symbol": "dead"
  },
  {
    "id": "shrub",
    "name": "Shrub",
    "radius": 2.8,
    "color": "#82944b",
    "category": "Plants",
    "symbol": "shrub"
  },
  {
    "id": "grass",
    "name": "Tall grass",
    "radius": 1.8,
    "color": "#899955",
    "category": "Plants",
    "symbol": "grass"
  },
  {
    "id": "fern",
    "name": "Fern",
    "radius": 2.4,
    "color": "#488452",
    "category": "Plants",
    "symbol": "fern"
  },
  {
    "id": "reeds",
    "name": "Reeds",
    "radius": 2,
    "color": "#8b9055",
    "category": "Plants",
    "symbol": "reeds"
  },
  {
    "id": "flowers",
    "name": "Wildflowers",
    "radius": 2,
    "color": "#b48ab2",
    "category": "Plants",
    "symbol": "flowers"
  },
  {
    "id": "rock",
    "name": "Rock",
    "radius": 3.2,
    "color": "#93958b",
    "category": "Rocks",
    "symbol": "rock"
  },
  {
    "id": "boulder",
    "name": "Granite boulder",
    "radius": 5.5,
    "color": "#8d9394",
    "category": "Rocks",
    "symbol": "rock"
  },
  {
    "id": "scree",
    "name": "Scree cluster",
    "radius": 4.5,
    "color": "#a5a393",
    "category": "Rocks",
    "symbol": "scree"
  },
  {
    "id": "basalt",
    "name": "Basalt columns",
    "radius": 4,
    "color": "#596269",
    "category": "Rocks",
    "symbol": "columns"
  },
  {
    "id": "cactus",
    "name": "Saguaro cactus",
    "radius": 3,
    "color": "#56805b",
    "category": "Desert",
    "symbol": "cactus"
  },
  {
    "id": "palm",
    "name": "Date palm",
    "radius": 6,
    "color": "#71884a",
    "category": "Desert",
    "symbol": "palm"
  },
  {
    "id": "yucca",
    "name": "Yucca",
    "radius": 2.8,
    "color": "#969369",
    "category": "Desert",
    "symbol": "fern"
  },
  {
    "id": "sandstone",
    "name": "Sandstone outcrop",
    "radius": 6,
    "color": "#bd8b5d",
    "category": "Desert",
    "symbol": "columns"
  }
];

const typesById = new Map(OBJECT_TYPES.map(type => [type.id, type]));
const MAX_FOOTPRINT = Math.max(...OBJECT_TYPES.map(type => type.radius)) * 5;
export const objectType = id => typesById.get(id);
export const isObjectTool = tool => ['scatter', 'place-object', 'erase-object'].includes(tool);
export const objectBytes = patch => (JSON.stringify(patch).length * 2);

export function validateObjects(objects, limit = MAX_OBJECTS) {
  if (!Array.isArray(objects) || objects.length > limit) throw new Error('Invalid object collection');
  const ids = new Set();
  for (const o of objects) {
    if (!o || typeof o.id !== 'string' || !/^[\w-]{1,64}$/.test(o.id) || ids.has(o.id) || !objectType(o.type) ||
      ![o.x, o.y, o.scale, o.rotation, o.tint].every(Number.isFinite) || Math.abs(o.x) > 2 ** 24 || Math.abs(o.y) > 2 ** 24 ||
      o.scale < .1 || o.scale > 5 || o.rotation < 0 || o.rotation > Math.PI * 2 || o.tint < 0 || o.tint > 1) throw new Error('Invalid terrain object');
    ids.add(o.id);
  }
}

// A small spatial hash keeps overlap checks local, even in a large forest.
const indexes = new WeakMap(), CELL = 32;
const cellKey = (x, y) => `${Math.floor(x / CELL)},${Math.floor(y / CELL)}`;
function spatialIndex(world) {
  let index = indexes.get(world);
  if (!index || index.source !== world.objects || index.revision !== world.objectsRevision) {
    index = { source: world.objects, revision: world.objectsRevision, cells: new Map() };
    for (const o of world.objects) indexInsert(index, o);
    indexes.set(world, index);
  }
  return index;
}
function indexInsert(index, o) {
  const key = cellKey(o.x, o.y);
  if (!index.cells.has(key)) index.cells.set(key, []);
  index.cells.get(key).push(o);
}
function nearby(index, x, y, radius, visit) {
  for (let cy = Math.floor((y - radius) / CELL); cy <= Math.floor((y + radius) / CELL); cy++)
    for (let cx = Math.floor((x - radius) / CELL); cx <= Math.floor((x + radius) / CELL); cx++)
      for (const o of index.cells.get(`${cx},${cy}`) || []) if (visit(o)) return true;
  return false;
}
function record(stroke, object, before) {
  stroke.objectChanges ??= new Map();
  if (!stroke.objectChanges.has(object.id)) stroke.objectChanges.set(object.id, before);
}
function changed(world) { world.objectsRevision++; world.revision++; }

export function placeObject(world, stroke, x, y, { type = 'pine', scale = 1, variation = .25, scatter = false, spacing = 0, random = Math.random } = {}) {
  if (!stroke || !objectType(type) || ![x, y, scale, variation].every(Number.isFinite) || scale < .5 || scale > 2.5 || variation < 0 || variation > .75) return false;
  if (!world.inside(x, y) || world.sample(x, y) <= world.sea + .002 || world.objects.length >= objectLimit(world)) return false;
  const size = scale * (1 + (random() * 2 - 1) * variation), index = spatialIndex(world);
  const footprint = objectType(type).radius * size;
  const clearance = scatter ? Math.max(0, spacing) * .7 : 0;
  if (nearby(index, x, y, scatter ? Math.max(footprint + MAX_FOOTPRINT, clearance) : 1, o => Math.hypot(o.x - x, o.y - y) < (scatter ? Math.max(clearance, (footprint + objectType(o.type).radius * o.scale) * .85) : .5))) return false;
  const object = { id: crypto.randomUUID(), type, x, y, scale: size, rotation: random() * Math.PI * 2, tint: random() };
  record(stroke, object, null); world.objects.push(object); changed(world);
  indexInsert(index, object); index.revision = world.objectsRevision;
  return true;
}

function hash(x, y, seed) { const value = Math.sin(x * 127.1 + y * 311.7 + seed) * 43758.5453; return value - Math.floor(value); }
export function scatterObjects(world, stroke, x, y, { radius = 56, density = .5, type = 'pine', scale = 1, variation = .25, random = Math.random } = {}) {
  if (!stroke || !objectType(type) || ![x, y, radius, density, scale, variation].every(Number.isFinite) || radius <= 0 || radius > 2048 || density <= 0 || density > 1 || scale < .5 || scale > 2.5) return 0;
  stroke.scatterSeed ??= random() * 10000; stroke.scatterCells ??= new Set();
  // Larger brushes spread scenery farther apart: counts grow roughly with radius,
  // rather than area. Clearance also prevents repeated strokes filling every gap.
  const brushSpread = Math.sqrt(Math.max(1, radius / 40));
  const spacing = Math.max(4, objectType(type).radius * scale * 2) * 1.6 * brushSpread / Math.sqrt(density);
  const b = world.bounds, left = Math.floor(Math.max(b.minX, x - radius) / spacing), right = Math.floor(Math.min(b.maxX, x + radius) / spacing);
  const top = Math.floor(Math.max(b.minY, y - radius) / spacing), bottom = Math.floor(Math.min(b.maxY, y + radius) / spacing);
  let count = 0;
  for (let cy = top; cy <= bottom; cy++) for (let cx = left; cx <= right; cx++) {
    if (world.objects.length >= objectLimit(world)) return count;
    const key = `${type}:${spacing}:${cx},${cy}`, px = (cx + .15 + hash(cx, cy, stroke.scatterSeed) * .7) * spacing, py = (cy + .15 + hash(cx, cy, stroke.scatterSeed + 31) * .7) * spacing;
    if (stroke.scatterCells.has(key) || Math.hypot(px - x, py - y) > radius) continue;
    stroke.scatterCells.add(key);
    if (placeObject(world, stroke, px, py, { type, scale, variation, random, scatter: true, spacing })) count++;
  }
  return count;
}

export function eraseObjects(world, stroke, x, y, radius, type = 'all') {
  if (!stroke || ![x, y, radius].every(Number.isFinite) || radius <= 0 || radius > 2048) return 0;
  const removed = new Set();
  nearby(spatialIndex(world), x, y, radius, o => {
    if ((type === 'all' || type === o.type) && Math.hypot(o.x - x, o.y - y) <= radius) { record(stroke, o, o); removed.add(o.id); }
    return false;
  });
  if (removed.size) { world.objects = world.objects.filter(o => !removed.has(o.id)); changed(world); }
  return removed.size;
}

export function objectPatch(world, stroke) {
  if (!stroke.objectChanges?.size) return null;
  const current = new Map(world.objects.map(o => [o.id, o])), added = [], removed = [];
  for (const [id, before] of stroke.objectChanges) {
    if (before && !current.has(id)) removed.push(before);
    else if (!before && current.has(id)) added.push(current.get(id));
  }
  return added.length || removed.length ? { added, removed } : null;
}
export function applyObjectPatch(world, patch, forward) {
  const remove = new Set((forward ? patch.removed : patch.added).map(o => o.id));
  world.objects = world.objects.filter(o => !remove.has(o.id)).concat(structuredClone(forward ? patch.added : patch.removed));
  changed(world);
}

// Match the two triangles of the displayed terrain mesh, including tile edges.
export function objectGroundHeight(world, x, y, step = 2) {
  const x0 = Math.floor(x / step) * step, y0 = Math.floor(y / step) * step, u = (x - x0) / step, v = (y - y0) / step;
  const sample = (dx, dy) => world.get(Math.min(world.bounds.maxX - 1, x0 + dx), Math.min(world.bounds.maxY - 1, y0 + dy));
  const a = sample(0, 0), b = sample(step, 0), c = sample(0, step), d = sample(step, step);
  return u + v <= 1 ? a + (b - a) * u + (c - a) * v : d + (c - d) * (1 - u) + (b - d) * (1 - v);
}
