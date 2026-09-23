import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { World, History, TILE, resetWorld } from '../app/world.js';
import { MAX_OBJECTS, OBJECT_TYPES, placeObject, scatterObjects, eraseObjects, validateObjects, objectGroundHeight } from '../app/objects.js';
import { ObjectView } from '../app/object-view.js';
import { encodeWorld, decodeWorld } from '../app/file-format.js';
import { accumulatesWhileHeld, StrokePath } from '../app/brush-stroke.js';

function land() {
  const world = new World();
  for (let y = -4; y < 4; y++) for (let x = -4; x < 4; x++) world.tiles.set(`${x},${y}`, new Float32Array(TILE * TILE).fill(.25));
  world.invalidate(); return world;
}
function random(seed = 12) { return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; }; }
const sorted = w => [...w.objects].sort((a, b) => a.id.localeCompare(b.id));
function add(world, history, type, x, y) { const stroke = history.begin(`Place ${type}`); assert(placeObject(world, stroke, x, y, { type, variation: 0 })); history.commit(stroke); return world.objects.at(-1); }
async function editFile(blob, edit) {
  const bytes = new Uint8Array(await blob.arrayBuffer()), n = new DataView(bytes.buffer).getUint32(4, true);
  const meta = JSON.parse(new TextDecoder().decode(bytes.slice(8, 8 + n))); edit(meta);
  const json = new TextEncoder().encode(JSON.stringify(meta)), header = new Uint8Array(8);
  header.set(new TextEncoder().encode(`FMM${meta.version}`)); new DataView(header.buffer).setUint32(4, json.length, true);
  return new Blob([header, json, bytes.slice(8 + n)]);
}

test('detail objects retain exact horizontal anchors and never change heights or paint', () => {
  const world = land(), history = new History(world), before = new Map([...world.tiles].map(([k, a]) => [k, a.slice()]));
  for (const [i, type] of OBJECT_TYPES.entries()) add(world, history, type.id, -128.3 + i * 15, -.75);
  assert.equal(world.objects[0].x, -128.3); assert.equal(world.objects[0].y, -.75);
  assert(!('height' in world.objects[0])); assert.deepEqual(world.tiles, before); assert.equal(world.biomes.size, 0);
  const stroke = history.begin('Duplicate'); assert.equal(placeObject(world, stroke, -128.3, -.75), false); assert.equal(history.commit(stroke), false);
});

test('scatter respects circular coverage, land, extent, size, and density without repeated buildup', () => {
  const world = land(), history = new History(world), stroke = history.begin('Forest'), options = { radius: 56, density: .65, random: random() };
  scatterObjects(world, stroke, -125, -125, options); const before = structuredClone(world.objects);
  assert(before.length > 30);
  for (const o of before) { assert(Math.hypot(o.x + 125, o.y + 125) <= 56); assert(o.scale >= .75 && o.scale <= 1.25); }
  for (let i = 0; i < 20; i++) scatterObjects(world, stroke, -125, -125, options);
  assert.deepEqual(world.objects, before); assert.equal(history.commit(stroke), true); assert.equal(history.entries.length, 1);
  for (const tool of ['scatter', 'place-object', 'erase-object']) assert.equal(accumulatesWhileHeld(tool, 'additive'), false);
  const count = (density, scale = 1) => { const w = land(); scatterObjects(w, new History(w).begin('Scatter'), 0, 0, { radius: 80, density, scale, random: random() }); return w.objects.length; };
  assert(count(.9) > count(.15) * 2); assert(count(.7) > count(.7, 2));
  const edge = history.begin('Edge'); scatterObjects(world, edge, 510, 510, options); assert(world.objects.every(o => world.inside(o.x, o.y)));
  const ocean = new World(), empty = new History(ocean).begin('Ocean'); scatterObjects(ocean, empty, 0, 0, options); assert.equal(ocean.objects.length, 0);
});

test('scatter strokes produce the same placement for sparse and frequent pointer events', () => {
  function stroke(steps) {
    const world = land(), edit = new History(world).begin('Scatter'), options = { radius: 30, random: random() };
    const paint = p => scatterObjects(world, edit, p.x, p.y, options), path = new StrokePath({ x: 0, y: 0 }, 6);
    paint({ x: 0, y: 0 }); for (let i = 1; i <= steps; i++) path.move({ x: 120 * i / steps, y: 0 }, paint);
    return world.objects.map(({ id, ...rest }) => rest);
  }
  assert.deepEqual(stroke(1), stroke(400));
});

test('filtered area erasing, undo/redo, branching, and net-zero strokes preserve objects', () => {
  const world = land(), history = new History(world);
  add(world, history, 'pine', -3, -3); add(world, history, 'shrub', 1, 1); add(world, history, 'rock', 3, 3); add(world, history, 'oak', 60, 60);
  const before = sorted(world), edit = history.begin('Erase pine'); assert.equal(eraseObjects(world, edit, 0, 0, 10, 'pine'), 1); history.commit(edit);
  assert.deepEqual(world.objects.map(o => o.type), ['shrub', 'rock', 'oak']); history.undo(); assert.deepEqual(sorted(world), before); history.redo();
  const all = history.begin('Clear area'); assert.equal(eraseObjects(world, all, 0, 0, 10), 2); history.commit(all); assert.equal(world.objects[0].type, 'oak');
  history.undo(); add(world, history, 'rock', -40, -40); assert.equal(history.redo(), false);
  const noop = history.begin('Add then erase'); placeObject(world, noop, 100, 100); eraseObjects(world, noop, 100, 100, 5); assert.equal(history.commit(noop), false);
});

test('FMM4 preserves mid-history redo, visibility, and reset restoration', async () => {
  const world = land(), history = new History(world);
  add(world, history, 'pine', -10, 0); add(world, history, 'rock', 10, 0); const before = sorted(world);
  world.objectsVisible = false; history.metadata('Hide objects', { objectsVisible: true }, { objectsVisible: false });
  const erase = history.begin('Erase'); eraseObjects(world, erase, 0, 0, 30); history.commit(erase); history.undo();
  const blob = encodeWorld(world, history); assert.equal(await blob.slice(0, 4).text(), 'FMM4');
  const loaded = await decodeWorld(blob); assert.deepEqual(sorted(loaded.world), before); assert.equal(loaded.world.objectsVisible, false);
  loaded.history.redo(); assert.equal(loaded.world.objects.length, 0); loaded.history.undo();
  resetWorld(loaded.world, loaded.history); assert.equal(loaded.world.objects.length, 0); assert.equal(loaded.world.objectsVisible, true);
  const reset = await decodeWorld(encodeWorld(loaded.world, loaded.history)); reset.history.undo(); assert.deepEqual(sorted(reset.world), before); assert.equal(reset.world.objectsVisible, false);
  reset.history.redo(); assert.equal(reset.world.objects.length, 0);
});

test('older FMM3 files migrate to an empty visible object layer', async () => {
  const world = land(), blob = await editFile(encodeWorld(world, new History(world)), meta => { meta.version = 3; delete meta.objects; delete meta.objectsVisible; });
  const loaded = await decodeWorld(blob); assert.equal(loaded.world.objects.length, 0); assert.equal(loaded.world.objectsVisible, true); assert.equal(loaded.world.get(0, 0), .25);
});

test('invalid placements and corrupt object records/history are rejected', async () => {
  const world = land(), history = new History(world), edit = history.begin('Invalid');
  for (const options of [{ type: 'bad' }, { scale: Infinity }, { scale: 0 }, { variation: -.1 }]) assert.equal(placeObject(world, edit, 0, 0, options), false);
  assert.equal(placeObject(world, edit, NaN, 0), false); assert.equal(placeObject(world, edit, 512, 0), false); assert.equal(history.commit(edit), false);
  const object = add(world, history, 'pine', 0, 0);
  for (const bad of [{ ...object, x: NaN }, { ...object, scale: -1 }, { ...object, type: 'script' }, { ...object, tint: 3 }]) assert.throws(() => validateObjects([bad]), /object/);
  assert.throws(() => validateObjects([object, object]), /object/);
  const blob = encodeWorld(world, history);
  await assert.rejects(decodeWorld(await editFile(blob, m => { m.objects[0].rotation = 'oops'; })), /object/);
  await assert.rejects(decodeWorld(await editFile(blob, m => { m.history.entries[0].objects.added[0].scale = 100; })), /object/);
  await assert.rejects(decodeWorld(await editFile(blob, m => { m.objectsVisible = 1; })), /layer/);
  await assert.rejects(decodeWorld(await editFile(blob, m => { m.history.entries[0].objects.added[0].id = 'missing'; })), /history/);
});

test('object limit and history budgets are enforced without copying the whole forest per edit', () => {
  const world = land(), history = new History(world, 2500);
  world.objects = Array.from({ length: MAX_OBJECTS - 1 }, (_, i) => ({ id: `tree-${i}`, type: 'pine', x: 200, y: 200, scale: 1, rotation: 0, tint: .5 }));
  add(world, history, 'rock', 0, 0); assert(history.entries[0].bytes < 1000);
  assert.equal(placeObject(world, history.begin('Full'), 30, 30), false); assert.equal(world.objects.length, MAX_OBJECTS);
  history.undo(); assert.equal(world.objects.length, MAX_OBJECTS - 1); history.redo(); assert.equal(world.objects.length, MAX_OBJECTS);
  for (let i = 0; i < 8; i++) { const edit = history.begin('Erase'); eraseObjects(world, edit, 0, 0, 4); history.commit(edit); add(world, history, 'rock', 0, 0); }
  assert(history.bytes <= history.budget); assert(history.trimmed > 0);
});

test('3D instances follow terrain triangles, relief, sea level, visibility and render distance', () => {
  const world = land(), history = new History(world), scene = new THREE.Scene(), view = new ObjectView(scene, world);
  add(world, history, 'pine', 0.5, .5); add(world, history, 'rock', 200, 200);
  const bounds = { minX: -128, minY: -128, maxX: 128, maxY: 128 };
  assert.equal(view.update(180, bounds), true); assert.equal(view.meshes.size, 1); const pine = view.meshes.get('pine'); assert.equal(pine.count, 1);
  const matrix = new THREE.Matrix4(); pine.getMatrixAt(0, matrix); assert.equal(matrix.elements[13], 45); assert.equal(view.update(180, bounds), false);
  world.set(0, 0, .5); view.update(300, bounds); pine.getMatrixAt(0, matrix); assert.equal(matrix.elements[13], objectGroundHeight(world, .5, .5) * 300);
  const g = pine.geometry; assert(g.attributes.position.count > 50); assert([...g.attributes.normal.array].every(Number.isFinite));
  let disposed = false; pine.addEventListener('dispose', () => disposed = true); world.objectsVisible = false; view.update(300, bounds); assert.equal(view.meshes.size, 0); assert(disposed);
  world.objectsVisible = true; world.sea = .7; view.update(300, bounds); assert.equal(view.meshes.size, 0);
  world.sea = 0; view.update(300, { minX: 128, minY: 128, maxX: 256, maxY: 256 }); assert.equal(view.meshes.size, 1); assert(view.meshes.has('rock')); assert.equal(world.objects.length, 2);
});

test('ground anchoring matches both terrain triangles and negative tile seams', () => {
  const world = land(); world.set(-2, -2, .2); world.set(0, -2, .4); world.set(-2, 0, .6); world.set(0, 0, 1);
  const a = world.get(-2, -2), b = world.get(0, -2), c = world.get(-2, 0), d = world.get(0, 0);
  assert.equal(objectGroundHeight(world, -1.5, -1.5), a * .5 + b * .25 + c * .25);
  assert.equal(objectGroundHeight(world, -.5, -.5), d * .5 + b * .25 + c * .25);
});
