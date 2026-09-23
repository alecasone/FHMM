import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { World, History, dab, TILE, FLOOR } from '../app/world.js';
import { encodeWorld, decodeWorld } from '../app/file-format.js';
const options = { radius: 12, strength: .5, tool: 'raise' };
function paint(world, history, x, y, params = {}) { const stroke = history.begin(params.tool || 'raise'); dab(world, stroke, x, y, { ...options, ...params }); history.commit(stroke); }
const snapshot = world => [...world.tiles].map(([key, data]) => [key, Array.from(data)]);

test('sparse expansion does not allocate terrain, including negative coordinates', () => {
  const world = new World(); const original = structuredClone(world.bounds);
  for (let i = 0; i < 1000; i++) world.expand('all');
  assert.equal(world.tiles.size, 0); assert.equal(world.bounds.minX, original.minX - 256000);
  world.set(-129, -1, .32); assert.equal(world.get(-129, -1), Math.fround(.32)); assert.equal(world.tiles.size, 1);
  assert.equal(world.get(-128, -1), Math.fround(FLOOR));
});
test('a cross-tile brush stroke can be undone and redone bit-for-bit', () => {
  const world = new World(), history = new History(world);
  paint(world, history, 0, 0); assert.equal(world.tiles.size, 4); const painted = snapshot(world);
  assert(world.get(0, 0) > FLOOR); history.undo();
  for (const tile of world.tiles.values()) assert(tile.every(n => n === Math.fround(FLOOR)));
  history.redo(); assert.deepEqual(snapshot(world), painted);
});
test('raise and lower are inverse within float precision and brushes stop at bounds', () => {
  const world = new World(), history = new History(world);
  paint(world, history, 511, 511); paint(world, history, 511, 511, { tool: 'lower' });
  assert(Math.abs(world.get(511, 511) - FLOOR) < 1e-6); assert.equal(world.get(512, 512), Math.fround(FLOOR)); assert.equal(world.tiles.size, 1);
});
test('flatten approaches a fixed sampled target and smooth reduces a spike', () => {
  const world = new World(), history = new History(world); world.set(4, 4, .8);
  paint(world, history, 4, 4, { tool: 'flatten', target: .2, strength: 1 }); assert(world.get(4, 4) < .8 && world.get(4, 4) > .2);
  const before = world.get(4, 4); paint(world, history, 4, 4, { tool: 'smooth', strength: 1 }); assert(world.get(4, 4) < before);
  history.undo(); assert.equal(world.get(4, 4), before);
});
test('dragging a smooth brush entirely outside the world is a safe no-op', () => {
  const world = new World(), history = new History(world);
  assert.doesNotThrow(() => paint(world, history, 2000, 2000, { tool: 'smooth' }));
  assert.equal(world.tiles.size, 0); assert.equal(history.entries.length, 0);
});
test('zero brush mask makes no edits; a stamp does not accumulate repeatedly', () => {
  const world = new World(), history = new History(world);
  paint(world, history, 20, 20, { mask: { size: 2, data: new Uint16Array(4) } }); assert.equal(history.entries.length, 0); assert.equal(world.tiles.size, 0);
  paint(world, history, 20, 20, { tool: 'stamp', target: FLOOR }); const first = snapshot(world);
  paint(world, history, 20, 20, { tool: 'stamp', target: FLOOR }); assert.deepEqual(snapshot(world), first); assert.equal(history.entries.length, 1);
});
test('a new edit after undo discards only the redo branch', () => {
  const world = new World(), history = new History(world);
  paint(world, history, 20, 20); paint(world, history, 60, 20); history.undo(); paint(world, history, 90, 20);
  assert.equal(history.entries.length, 2); assert.equal(history.redo(), false); assert.equal(world.get(60, 20), Math.fround(FLOOR));
});
test('metadata and terrain replay correctly across expansion and sea-level edits', () => {
  const world = new World(), history = new History(world), before = structuredClone(world.bounds);
  world.expand('west'); history.metadata('Expand west', { bounds: before }, { bounds: structuredClone(world.bounds) });
  paint(world, history, -600, 0); world.sea = .3; history.metadata('Sea', { sea: 0 }, { sea: .3 }); const final = snapshot(world);
  history.goTo(0); assert.deepEqual(world.bounds, before); assert.equal(world.sea, 0);
  history.goTo(3); assert.equal(world.sea, .3); assert.equal(world.bounds.minX, -768); assert.deepEqual(snapshot(world), final);
});
test('2,000-step history keeps its limit, and memory budget retires oldest entries', () => {
  const world = new World(), history = new History(world);
  for (let i = 0; i < 2100; i++) { const stroke = history.begin('One sample'); world.set(0, 0, i % 2 ? .1 : .2, stroke); history.commit(stroke); }
  assert.equal(history.entries.length, 2000); assert.equal(history.trimmed, 100); assert.equal(history.cursor, 2000);
  const small = new History(new World(), 1500); for (let i = 0; i < 10; i++) small.metadata('Sea', { sea: 0 }, { sea: .1 });
  assert.equal(small.entries.length, 2); assert.equal(small.bytes, 1024); assert.equal(small.trimmed, 8);
});
test('file round-trip preserves float heights, bounds, layers, and both sides of history', async () => {
  const world = new World(), history = new History(world); world.name = 'Test archipelago';
  paint(world, history, -128, 0); paint(world, history, 128, 0, { tool: 'lower' }); history.undo();
  const loaded = await decodeWorld(encodeWorld(world, history)); assert.deepEqual(snapshot(loaded.world), snapshot(world)); assert.equal(loaded.world.name, world.name); assert.equal(loaded.history.cursor, 1);
  loaded.history.redo(); history.redo(); assert.deepEqual(snapshot(loaded.world), snapshot(world));
  loaded.history.goTo(0); assert.equal(loaded.world.get(-128, 0), Math.fround(FLOOR));
});
test('corrupt and truncated files fail without changing the current world', async () => {
  await assert.rejects(() => decodeWorld(new Blob(['not-a-world'])), /not an FMM/);
  const file = encodeWorld(new World(), new History(new World())); await assert.rejects(() => decodeWorld(file.slice(0, 15)), /damaged/);
});
test('brush pack is complete, 16-bit, and has non-flat height data', async () => {
  const manifest = JSON.parse(await readFile(new URL('../app/brushes/manifest.json', import.meta.url)));
  assert.equal(manifest.length, 44);
  for (const brush of manifest) {
    const buffer = await readFile(new URL(`../app/brushes/${brush.id}.bin`, import.meta.url)); assert.equal(buffer.length, 256 * 256 * 2);
    let max = 0, precise = false; for (let i = 0; i < buffer.length; i += 2) { const n = buffer.readUInt16LE(i); max = Math.max(max, n); if (n % 257) precise = true; }
    assert(max > 10000, brush.name); assert(precise, `${brush.name} retains more than 8-bit precision`);
  }
});
