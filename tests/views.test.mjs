import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../app/world.js';
import { MapView } from '../app/map-view.js';
import { renderViews } from '../app/render-loop.js';

function harness() {
  const size = { width: 500, height: 650 }, radii = [];
  const ctx = { setTransform() {}, translate() {}, rotate() {}, closePath() {}, fillRect() {}, save() {}, beginPath() {}, rect() {}, clip() {}, moveTo() {}, lineTo() {}, stroke() {}, restore() {}, setLineDash() {}, strokeRect() {}, fill() {}, arc(x, y, radius) { if (!Number.isFinite(radius) || radius < 0) throw new Error('Invalid radius'); radii.push(radius); } };
  const container = { getBoundingClientRect: () => ({ ...size, left: 0, top: 0 }) };
  const canvas = { parentElement: container, width: 0, height: 0, getBoundingClientRect: container.getBoundingClientRect, getContext: () => ctx };
  globalThis.ResizeObserver = class { observe() {} }; globalThis.devicePixelRatio = 1; globalThis.document = { querySelector: () => ({ textContent: '' }) };
  return { size, canvas, radii, map: new MapView(canvas, new World()) };
}
test('fitting while 2D is hidden defers zoom and restores a valid view on reveal', () => {
  const { map, size, radii } = harness(); const priorZoom = map.zoom;
  size.width = 0; size.height = 0; map.resize(); map.world.expand('all'); map.fit();
  assert.equal(map.fitPending, true); assert.equal(map.zoom, priorZoom);
  size.width = 500; size.height = 650; map.resize(); assert.equal(map.fitPending, false); assert(map.zoom > 0);
  map.cursor = { x: 0, y: 0, radius: 80 }; assert.doesNotThrow(() => map.draw()); assert(radii.every(n => n > 0));
});
test('small, hidden and damaged viewport transforms recover after reset', () => {
  const { map, size } = harness(); size.width = 40; size.height = 40; map.resize(); map.fit(); assert(map.zoom > 0);
  map.zoom = -2; map.cursor = { x: 0, y: 0, radius: 20 }; map.needsDraw = true; assert.doesNotThrow(() => map.draw()); assert(map.zoom > 0);
  map.failed = true; map.cache.set('0,0', {}); map.pending.add('0,0'); map.reset(); assert.equal(map.failed, false); assert.equal(map.cache.size, 0); assert.equal(map.pending.size, 0);
});
test('one view error cannot freeze the other view or repeatedly throw each frame', () => {
  let drawn = 0, failures = 0; const broken = { draw() { throw new Error('graphics error'); } }, good = { draw() { drawn++; } };
  for (let frame = 0; frame < 3; frame++) renderViews([['2D', broken], ['3D', good]], () => failures++);
  assert.equal(drawn, 3); assert.equal(failures, 1); assert.equal(broken.failed, true);
});

test('rotated map picking and panning invert the displayed rotation', () => {
  const { map } = harness(); map.zoom = 2; map.center = { x: 30, y: -10 }; map.setRotation(90);
  const p = map.point({ clientX: map.width / 2 + 40, clientY: map.height / 2 });
  assert(Math.abs(p.x - 30) < 1e-8); assert(Math.abs(p.y + 30) < 1e-8);
  const delta = map.screenDelta(0, 20); assert(Math.abs(delta.x - 10) < 1e-8); assert(Math.abs(delta.y) < 1e-8);
  assert.doesNotThrow(() => map.draw());
});

test('rotated fit includes the complete rectangular world', () => {
  const { map } = harness(); map.world.expand('east'); map.setRotation(45); map.fit();
  const b = map.world.bounds, diagonal = ((b.maxX - b.minX) + (b.maxY - b.minY)) / Math.sqrt(2);
  assert(diagonal * map.zoom <= map.width - 70 + 1e-6); assert(diagonal * map.zoom <= map.height - 100 + 1e-6);
});
