import test from 'node:test';
import assert from 'node:assert/strict';
import { World, History, resetWorld } from '../app/world.js';
import { addRiver, carveRiver, planRiver, riverSections, validateRivers } from '../app/rivers.js';
import { encodeWorld, decodeWorld } from '../app/file-format.js';
import { sunDirection, hillshade } from '../app/view-math.js';

function slope() {
  const world = new World();
  for (let y = -30; y <= 120; y++) for (let x = -60; x <= 60; x++) world.set(x, y, .45 - y * .002);
  return world;
}
const guide = [{ x: 0, y: 0 }, { x: 7, y: 30 }, { x: -5, y: 60 }, { x: 0, y: 95 }];
const snapshot = w => ({ tiles: [...w.tiles].map(([k, v]) => [k, [...v]]), biomes: [...w.biomes].map(([k, v]) => [k, [...v]]), rivers: structuredClone(w.rivers) });

test('a rough river becomes a downhill water profile and physically lowers its bed', () => {
  const world = slope(), history = new History(world), stroke = history.begin('River');
  const river = addRiver(world, stroke, guide, { width: 14, depth: .04 }); history.commit(stroke);
  assert(river.points.length > 10); assert.equal(world.rivers.length, 1); assert(stroke.biomeChanges.size > 0);
  river.points.forEach((p, i) => { if (i) assert(p.water <= river.points[i - 1].water); assert(world.sample(p.x, p.y) < p.water); });
  for (const [key, changes] of stroke.changes) for (const [i, old] of changes) assert(world.tiles.get(key)[i] <= old);
  assert.equal(world.get(55, 50), Math.fround(.35));
});

test('drawing uphill reverses the guide so water always runs downhill', () => {
  const world = slope(); const river = planRiver(world, [...guide].reverse(), { natural: false });
  assert.equal(river.points[0].y, 0); assert.equal(river.points.at(-1).y, 95);
  assert(river.points[0].water > river.points.at(-1).water);
});

test('ridges along a river are cut through without creating uphill water', () => {
  const world = slope(); for (let y = 40; y <= 55; y++) for (let x = -40; x <= 40; x++) world.set(x, y, .9);
  const stroke = new History(world).begin('River'), river = addRiver(world, stroke, guide, { natural: false });
  assert(world.get(0, 48) < .45); river.points.forEach((p, i) => { if (i) assert(p.water <= river.points[i - 1].water); });
});

test('river terrain, bank colors, and water undo/redo together and survive FMM3', async () => {
  const world = slope(), history = new History(world), original = world.get(0, 0), stroke = history.begin('River');
  addRiver(world, stroke, guide); history.commit(stroke); const after = snapshot(world);
  const loaded = await decodeWorld(encodeWorld(world, history)); assert.deepEqual(snapshot(loaded.world), after);
  loaded.history.undo(); assert.equal(loaded.world.rivers.length, 0); assert.equal(loaded.world.get(0, 0), original);
  loaded.history.redo(); assert.deepEqual(snapshot(loaded.world), after);
  resetWorld(loaded.world, loaded.history); assert.equal(loaded.world.rivers.length, 0);
  loaded.history.undo(); assert.deepEqual(snapshot(loaded.world), after);
});

test('raised terrain blocks river water; recarving reopens the stored channel', () => {
  const world = slope(), history = new History(world), stroke = history.begin('River'), river = addRiver(world, stroke, guide); history.commit(stroke);
  const index = Math.floor(river.points.length / 2), p = river.points[index];
  for (let y = Math.floor(p.y) - 3; y <= Math.ceil(p.y) + 3; y++) for (let x = Math.floor(p.x) - 3; x <= Math.ceil(p.x) + 3; x++) world.set(x, y, 1);
  assert.equal(riverSections(world, river)[index].wet, false);
  carveRiver(world, history.begin('Recarve'), river); assert.equal(riverSections(world, river)[index].wet, true);
});

test('invalid, ocean-only, short, or excessive paths fail before changing terrain', () => {
  const world = new World(), history = new History(world);
  assert.throws(() => addRiver(world, history.begin('River'), guide), /land/);
  assert.throws(() => planRiver(world, [{ x: 0, y: 0 }, { x: NaN, y: 4 }]), /borders/);
  assert.throws(() => planRiver(world, [{ x: 0, y: 0 }, { x: 1, y: 1 }]), /longer/);
  world.expand('all', 80);
  assert.throws(() => planRiver(world, [{ x: -5000, y: 0 }, { x: 5000, y: 0 }]), /sections/);
  assert.equal(world.tiles.size, 0); assert.equal(world.rivers.length, 0);
  assert.throws(() => validateRivers([{ depth: .03, points: [{ x: 0, y: 0, width: 10, water: 0 }, { x: 1, y: 1, width: 10, water: 1 }] }]), /uphill/);
});

test('FMM2 worlds migrate to an empty river layer', async () => {
  const blob = encodeWorld(new World(), new History(new World())), bytes = new Uint8Array(await blob.arrayBuffer());
  const n = new DataView(bytes.buffer).getUint32(4, true), meta = JSON.parse(new TextDecoder().decode(bytes.slice(8, 8 + n)));
  meta.version = 2; delete meta.rivers; delete meta.riversVisible;
  const json = new TextEncoder().encode(JSON.stringify(meta)), header = new Uint8Array(8); header.set(new TextEncoder().encode('FMM2')); new DataView(header.buffer).setUint32(4, json.length, true);
  const loaded = await decodeWorld(new Blob([header, json, bytes.slice(8 + n)])); assert.deepEqual(loaded.world.rivers, []); assert.equal(loaded.world.riversVisible, true);
});

test('shared sun azimuth reverses hill shading and follows compass bearings', () => {
  const east = sunDirection(90, 32), west = sunDirection(270, 32), north = sunDirection(0, 32);
  assert(east.x > .8); assert(west.x < -.8); assert(north.z < -.8);
  assert(hillshade(.4, .2, .3, .3, east) > hillshade(.4, .2, .3, .3, west));
  assert(Math.abs(Math.hypot(east.x, east.y, east.z) - 1) < 1e-8);
});
