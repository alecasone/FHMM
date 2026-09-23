import test from 'node:test';
import assert from 'node:assert/strict';
import { World, History, dab, TILE, FLOOR } from '../app/world.js';
import { StrokePath, accumulatesWhileHeld } from '../app/brush-stroke.js';
import { encodeWorld, decodeWorld } from '../app/file-format.js';

const opts = { tool: 'raise', mode: 'blend', radius: 12, strength: .45, strokeHeight: .3 };
const snapshot = world => [...world.tiles].map(([key, data]) => [key, Array.from(data)]);

test('Blend makes repeated dabs idempotent instead of producing a spike', () => {
  const world = new World(), history = new History(world), stroke = history.begin('Blend');
  dab(world, stroke, 0, 0, opts); const first = snapshot(world);
  for (let i = 0; i < 100; i++) dab(world, stroke, 0, 0, { ...opts, dt: i + 1 });
  assert.deepEqual(snapshot(world), first);
  assert(Math.abs(world.get(0, 0) - (FLOOR + .135)) < 1e-7);
});

test('overlapping and returning brush paths respect a per-sample limit across tile seams', () => {
  const world = new World(), history = new History(world);
  world.set(-128, 0, .6); world.set(-127, 0, -.3);
  const before = new Map([[-128, world.get(-128, 0)], [-127, world.get(-127, 0)]]);
  const stroke = history.begin('Overlaps');
  for (const x of [-137, -128, -121, -127, -137, -128]) dab(world, stroke, x, 0, opts);
  for (const [key, changes] of stroke.changes) {
    const data = world.tiles.get(key);
    for (const [index, original] of changes) assert(data[index] - original <= .1350001);
  }
  for (const [x, original] of before) assert(Math.abs(world.get(x, 0) - original - .135) < 1e-7);
  const final = snapshot(world); history.commit(stroke); history.undo();
  for (const [x, original] of before) assert.equal(world.get(x, 0), original);
  history.redo(); assert.deepEqual(snapshot(world), final);
});

test('each new Blend stroke adds one deliberate layer and saved history remains exact', async () => {
  const world = new World(), history = new History(world);
  for (let i = 0; i < 2; i++) { const stroke = history.begin('Layer'); dab(world, stroke, 0, 0, opts); history.commit(stroke); }
  assert(Math.abs(world.get(0, 0) - (FLOOR + .27)) < 1e-7);
  const loaded = await decodeWorld(encodeWorld(world, history));
  loaded.history.undo(); assert(Math.abs(loaded.world.get(0, 0) - (FLOOR + .135)) < 1e-7);
  loaded.history.redo(); assert.deepEqual(snapshot(loaded.world), snapshot(world));
});

test('Blend lowering and stamping obey depth, strength, and heightmap masks', () => {
  const mask = { size: 3, data: new Uint16Array(9).fill(32768) };
  for (const tool of ['lower', 'stamp']) {
    const world = new World(), stroke = new History(world).begin(tool);
    for (let i = 0; i < 20; i++) dab(world, stroke, 0, 0, { ...opts, tool, mask, target: 1.8 });
    const change = world.get(0, 0) - FLOOR;
    assert(Math.abs(change - (tool === 'lower' ? -1 : 1) * .135 * 32768 / 65535) < 1e-7);
  }
  const world = new World(), stroke = new History(world).begin('Zero');
  dab(world, stroke, 0, 0, { ...opts, strength: 0 });
  dab(world, stroke, 0, 0, { ...opts, mask: { size: 2, data: new Uint16Array(4) } });
  assert.equal(world.tiles.size, 0); assert.equal(stroke.changes.size, 0);
});

test('Additive preserves continuous buildup; smoothing and paint still accumulate while held', () => {
  const world = new World(), stroke = new History(world).begin('Additive');
  dab(world, stroke, 0, 0, { ...opts, mode: 'additive' }); const first = world.get(0, 0);
  dab(world, stroke, 0, 0, { ...opts, mode: 'additive' }); assert(world.get(0, 0) > first);
  for (const tool of ['raise', 'lower']) { assert.equal(accumulatesWhileHeld(tool, 'blend'), false); assert.equal(accumulatesWhileHeld(tool, 'additive'), true); }
  for (const tool of ['smooth', 'flatten', 'paint', 'erase']) assert.equal(accumulatesWhileHeld(tool, 'blend'), true);
  assert.equal(accumulatesWhileHeld('stamp', 'blend'), false);
});

test('stroke spacing gives the same dabs for sparse and high-frequency pointer events', () => {
  const trace = (points) => { const result = [], path = new StrokePath({ x: 0, y: 0 }, 8); for (const point of points) path.move(point, p => result.push(p)); return result; };
  const sparse = trace([{ x: 100, y: 0 }]);
  const dense = trace(Array.from({ length: 400 }, (_, i) => ({ x: (i + 1) / 4, y: 0 })));
  assert.equal(sparse.length, 12); assert.equal(dense.length, sparse.length);
  dense.forEach((p, i) => assert(Math.hypot(p.x - sparse[i].x, p.y - sparse[i].y) < 1e-8));
  assert.deepEqual(sparse.at(-1), { x: 96, y: 0 });
  assert.deepEqual(trace([{ x: 3, y: 0 }, { x: 3, y: 13 }]), [{ x: 3, y: 5 }, { x: 3, y: 13 }]);
});

test('invalid moves are ignored and huge-world pointer jumps have bounded work', () => {
  const path = new StrokePath({ x: -TILE, y: 0 }, 2), points = [];
  assert.equal(path.move({ x: NaN, y: 0 }, p => points.push(p)), false);
  path.move({ x: 1000000, y: 0 }, p => points.push(p));
  assert(points.length <= 160); assert.equal(points.at(-1).x, 1000000);
});
