import test from 'node:test';
import assert from 'node:assert/strict';
import { World, TILE } from '../app/world.js';
import { SceneView } from '../app/scene-view.js';
import { normalizeRenderDistance, terrainWindow, MAX_RENDER_DISTANCE } from '../app/terrain-window.js';

const largeBounds = { minX: -16384, minY: -16384, maxX: 16384, maxY: 16384 };

test('render distance stays bounded on huge worlds and orders nearby terrain first', () => {
  for (const radius of [2, 6, MAX_RENDER_DISTANCE]) {
    const region = terrainWindow(largeBounds, 0, 0, radius);
    assert.equal(region.tiles.length, (radius * 2) ** 2);
    assert.equal(region.keys.size, region.tiles.length);
    assert.deepEqual(region.tiles[0], { key: '0,0', x: 0, y: 0 });
    assert.equal(region.bounds.maxX - region.bounds.minX, radius * 2 * TILE);
    const distances = region.tiles.map(tile => tile.x ** 2 + tile.y ** 2);
    assert.deepEqual(distances, [...distances].sort((a, b) => a - b));
  }
  assert.equal(normalizeRenderDistance(Infinity), 6);
  assert.equal(normalizeRenderDistance('invalid'), 6);
  assert.equal(normalizeRenderDistance(null), 6);
  assert.equal(normalizeRenderDistance(-100), 2);
  assert.equal(normalizeRenderDistance(5000), MAX_RENDER_DISTANCE);
});

test('render windows clip to expanded borders and clamp focus outside the world', () => {
  const bounds = { minX: -768, minY: -512, maxX: 1024, maxY: 512 };
  for (const [x, y] of [[-768, -512], [1023, 511], [-1, -1], [1e8, -1e8]]) {
    const region = terrainWindow(bounds, x, y, 12);
    assert(region.tiles.length > 0 && region.tiles.length <= 24 ** 2);
    for (const tile of region.tiles) {
      assert(tile.x * TILE >= bounds.minX && (tile.x + 1) * TILE <= bounds.maxX);
      assert(tile.y * TILE >= bounds.minY && (tile.y + 1) * TILE <= bounds.maxY);
    }
  }
});

function sceneHarness() {
  const view = Object.create(SceneView.prototype), built = [], disposed = [];
  Object.assign(view, {
    world: new World(), container: { clientWidth: 600, clientHeight: 400 },
    controls: { target: { x: 0, z: 0 } }, renderDistance: 2, meshes: new Map(), pending: new Set(),
    scene: { remove() {} }, renderer: { shadowMap: {}, render() {} },
    rivers: { update(relief, bounds) { this.bounds = bounds; return false; } },
    build(key) { built.push(key); this.pending.delete(key); this.meshes.set(key, { geometry: { dispose() { disposed.push(key); } } }); },
  });
  view.world.bounds = { ...largeBounds };
  const settle = () => { for (let i = 0; i < 150; i++) view.draw(); };
  return { view, built, disposed, settle };
}

test('3D streams a bounded batch, expands live, and immediately disposes distant meshes on shrink', () => {
  const { view, built, disposed, settle } = sceneHarness();
  view.draw(); assert(built.length > 0 && built.length <= 4);
  settle(); assert.equal(view.meshes.size, 16);
  const smallBounds = { ...view.rivers.bounds }, initialWindow = view.renderWindow;
  view.draw(); assert.equal(view.renderWindow, initialWindow, 'stationary views reuse the plan');
  view.setRenderDistance(6); settle(); assert.equal(view.meshes.size, 144);
  assert.equal(view.rivers.bounds.maxX, 768);
  view.renderer.shadowMap.needsUpdate = false;
  view.setRenderDistance(2); view.draw();
  assert.equal(view.meshes.size, 16); assert.equal(disposed.length, 128);
  assert.equal(view.renderer.shadowMap.needsUpdate, true);
  assert.deepEqual(view.rivers.bounds, smallBounds);
  assert.equal(view.world.tiles.size, 0, 'view distance must not allocate authoritative terrain');
});

test('edited meshes refresh before missing terrain; panning unloads old regions and river geometry follows', () => {
  const { view, built, disposed, settle } = sceneHarness();
  settle(); view.pending.add('-2,-2'); built.length = 0;
  view.setRenderDistance(12); view.draw();
  assert.equal(built[0], '-2,-2'); assert(built.length <= 4);
  view.controls.target.x = 10000; view.controls.target.z = -10000;
  view.setRenderDistance(2); view.draw();
  assert(disposed.length >= 16); assert(view.meshes.size <= 4);
  settle(); assert.equal(view.meshes.size, 16);
  assert.deepEqual(view.rivers.bounds, terrainWindow(largeBounds, 10000, -10000, 2).bounds);
  assert.equal(view.pending.size, 0);
});
