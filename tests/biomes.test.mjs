import test from 'node:test';
import assert from 'node:assert/strict';
import { World, History, dab, resetWorld, TILE, FLOOR } from '../app/world.js';
import { BIOMES, BIOME_COUNT, surfaceColor } from '../app/biomes.js';
import { encodeWorld, decodeWorld } from '../app/file-format.js';

const terrainState = world => [...world.tiles].map(([key, value]) => [key, Array.from(value)]);
const paintState = world => [...world.biomes].filter(([, value]) => value.some(v => v)).map(([key, value]) => [key, Array.from(value)]);
function paint(world, history, biome, tool = 'paint', x = 0, y = 0) { const stroke = history.begin(tool); dab(world, stroke, x, y, { radius: 6, strength: .8, tool, biome }); history.commit(stroke); }
function land() { const world = new World(); for (let y = -16; y <= 16; y++) for (let x = -16; x <= 16; x++) world.set(x, y, .2); return world; }
test('biome painting blends across tile seams without modifying height', () => {
  const world = land(), history = new History(world), terrain = terrainState(world);
  paint(world, history, 9); assert.equal(world.biomes.size, 4); assert.deepEqual(terrainState(world), terrain);
  const painted = paintState(world); history.undo(); assert.deepEqual(paintState(world), []); history.redo(); assert.deepEqual(paintState(world), painted);
});
test('multiple biomes remain normalized and erasing restores automatic color', () => {
  const world = land(), history = new History(world);
  for (let b = 0; b < 30; b++) paint(world, history, b % BIOME_COUNT);
  for (const tile of world.biomes.values()) for (let i = 0; i < tile.length; i += BIOME_COUNT) assert(tile.subarray(i, i + BIOME_COUNT).reduce((a, b) => a + b) <= 255);
  const before = paintState(world);
  for (let n = 0; n < 80; n++) paint(world, history, 0, 'erase');
  assert.equal(world.biomes.get('0,0').subarray(0, BIOME_COUNT).reduce((a, b) => a + b), 0);
  assert.notDeepEqual(paintState(world), before);
});
test('painting ocean and erasing untouched terrain do not allocate color tiles', () => {
  const world = new World(), history = new History(world); paint(world, history, 9); paint(world, history, 0, 'erase'); assert.equal(world.biomes.size, 0); assert.equal(history.entries.length, 0);
});
test('snow, desert and forest have distinct deterministic colors with rock exposure', () => {
  const colors = [1, 5, 9].map(index => { const weights = new Uint8Array(BIOME_COUNT); weights[index] = 255; return surfaceColor(.25, 0, 47, -80, .05, weights); });
  assert(colors[2][0] > colors[1][0]); assert(colors[1][0] > colors[0][0]);
  const snow = new Uint8Array(BIOME_COUNT); snow[9] = 255;
  assert(surfaceColor(.25, 0, 47, -80, 1, snow)[0] < colors[2][0]);
  assert.deepEqual(surfaceColor(.2, 0, 1, 2, .1), surfaceColor(.2, 0, 1, 2, .1));
});
test('reset clears both layers, restores defaults, and undo/redo restores the entire world', () => {
  const world = land(), history = new History(world); world.expand('west'); world.sea = -.1; paint(world, history, 9); world.biomesVisible = false;
  const terrain = terrainState(world), biomes = paintState(world), bounds = structuredClone(world.bounds);
  resetWorld(world, history, 'ocean'); assert.equal(world.tiles.size, 0); assert.equal(world.biomes.size, 0); assert.equal(world.sea, 0); assert.equal(world.bounds.minX, -512);
  history.undo(); assert.deepEqual(terrainState(world), terrain); assert.deepEqual(paintState(world), biomes); assert.deepEqual(world.bounds, bounds); assert.equal(world.biomesVisible, false); assert.equal(world.sea, -.1);
  history.redo(); assert.equal(world.tiles.size, 0); assert.equal(world.biomes.size, 0);
});
test('version 2 save/load preserves biome paint and reset undo/redo', async () => {
  const world = land(), history = new History(world); paint(world, history, 5); const biomes = paintState(world), terrain = terrainState(world);
  resetWorld(world, history, 'ocean'); const loaded = await decodeWorld(encodeWorld(world, history));
  assert.equal(loaded.world.tiles.size, 0); loaded.history.undo(); assert.deepEqual(terrainState(loaded.world), terrain); assert.deepEqual(paintState(loaded.world), biomes);
  loaded.history.redo(); assert.equal(loaded.world.biomes.size, 0); assert.equal(loaded.world.tiles.size, 0);
});
test('version 1 world files load with automatic colors and intact terrain', async () => {
  const values = new Float32Array(TILE * TILE).fill(FLOOR); values[0] = .25;
  const metadata = { version: 1, tileSize: TILE, name: 'Legacy', bounds: new World().bounds, sea: 0, ocean: true, tiles: [{ key: '0,0', data: { offset: 0, length: values.length } }], history: { cursor: 0, entries: [], trimmed: 0 } };
  const json = new TextEncoder().encode(JSON.stringify(metadata)), header = new Uint8Array(8); header.set(new TextEncoder().encode('FMM1')); new DataView(header.buffer).setUint32(4, json.length, true);
  const loaded = await decodeWorld(new Blob([header, json, values])); assert.equal(loaded.world.get(0, 0), .25); assert.equal(loaded.world.biomes.size, 0); assert.equal(loaded.world.biomesVisible, true);
});
test('nonfinite brush input and invalid history cursor cannot corrupt or hang the world', () => {
  const world = new World(), history = new History(world); world.set(0, 0, NaN); world.set(0, 0, Infinity);
  dab(world, history.begin('invalid'), NaN, 0, { radius: 8, strength: 1, tool: 'raise' }); history.goTo(200); history.goTo(-1);
  assert.equal(world.tiles.size, 0); assert.equal(history.cursor, 0);
});
