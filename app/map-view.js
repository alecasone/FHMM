import { TILE, FLOOR, terrainColor } from './world.js';
import { BIOME_COUNT, surfaceColor } from './biomes.js';
export class MapView {
  constructor(canvas, world) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d', { alpha: false }); this.world = world;
    this.center = { x: 0, y: 0 }; this.zoom = 1; this.cache = new Map(); this.pending = new Set(); this.contours = true; this.cursor = null; this.needsDraw = true;
    this.fitPending = true; this.observer = new ResizeObserver(() => { this.resize(); }); this.observer.observe(canvas.parentElement); this.resize();
  }
  resize() {
    const r = this.canvas.parentElement.getBoundingClientRect(); this.width = r.width; this.height = r.height;
    if (r.width <= 0 || r.height <= 0) return;
    const dpr = Math.min(devicePixelRatio, 2), w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0); this.needsDraw = true;
    if (this.fitPending || !Number.isFinite(this.zoom) || this.zoom <= 0) this.fit();
  }
  fit() { const b = this.world.bounds; this.center = { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 }; this.fitPending = !(this.width > 0 && this.height > 0); if (!this.fitPending) this.zoom = Math.max(.000001, Math.min(Math.max(1, this.width - 70) / (b.maxX - b.minX), Math.max(1, this.height - 100) / (b.maxY - b.minY))); this.needsDraw = true; }
  reset() { this.failed = false; this.cache.clear(); this.pending.clear(); this.cursor = null; this.resize(); this.fit(); }
  point(event) { if (!(this.zoom > 0) || !Number.isFinite(this.zoom) || !this.width || !this.height) return null; const r = this.canvas.getBoundingClientRect(); return { x: (event.clientX - r.left - this.width / 2) / this.zoom + this.center.x, y: (event.clientY - r.top - this.height / 2) / this.zoom + this.center.y }; }
  invalidate(keys) { for (const key of keys ?? this.cache.keys()) if (this.cache.has(key)) this.pending.add(key); this.needsDraw = true; }
  tile(key) {
    const world = this.world, [tx, ty] = key.split(',').map(Number), image = new ImageData(TILE, TILE), data = image.data;
    const samples = world.tiles.get(key), paint = world.biomes.get(key);
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const wx = tx * TILE + x, wy = ty * TILE + y, index = y * TILE + x, h = samples?.[index] ?? FLOOR;
      const left = x ? (samples?.[index - 1] ?? FLOOR) : world.get(wx - 1, wy), right = x < TILE - 1 ? (samples?.[index + 1] ?? FLOOR) : world.get(wx + 1, wy);
      const up = y ? (samples?.[index - TILE] ?? FLOOR) : world.get(wx, wy - 1), down = y < TILE - 1 ? (samples?.[index + TILE] ?? FLOOR) : world.get(wx, wy + 1);
      const color = world.ocean && h < world.sea ? terrainColor(h, world.sea, true) : surfaceColor(h, world.sea, wx, wy, Math.hypot(left - right, up - down) * 50, paint, index * BIOME_COUNT, world.biomesVisible);
      const slope = (left - right) * 11 + (up - down) * 7;
      let light = Math.max(.57, Math.min(1.35, .93 + slope));
      if (world.ocean && h < world.sea) light = 1;
      if (this.contours && h > world.sea && h % .055 < .0018) light *= .76;
      const i = (y * TILE + x) * 4; data[i] = color[0] * light; data[i + 1] = color[1] * light; data[i + 2] = color[2] * light; data[i + 3] = 255;
    }
    const canvas = this.cache.get(key) ?? document.createElement('canvas'); canvas.width = canvas.height = TILE; canvas.getContext('2d').putImageData(image, 0, 0); this.cache.set(key, canvas); this.pending.delete(key); return canvas;
  }
  draw() {
    if (!this.needsDraw || !this.width || !this.height) return;
    if (!(this.zoom > 0) || !Number.isFinite(this.zoom)) this.fit();
    this.needsDraw = false;
    const c = this.ctx, w = this.width, h = this.height, z = this.zoom, b = this.world.bounds;
    c.fillStyle = '#0e1d26'; c.fillRect(0, 0, w, h);
    const px = x => (x - this.center.x) * z + w / 2, py = y => (y - this.center.y) * z + h / 2;
    c.fillStyle = this.world.ocean ? `rgb(${terrainColor(-.18, this.world.sea, true).join(',')})` : '#36463b'; c.fillRect(px(b.minX), py(b.minY), (b.maxX - b.minX) * z, (b.maxY - b.minY) * z);
    c.save(); c.beginPath(); c.rect(px(b.minX), py(b.minY), (b.maxX - b.minX) * z, (b.maxY - b.minY) * z); c.clip();
    let rendered = 0; const visible = new Set();
    for (const key of new Set([...this.world.tiles.keys(), ...this.world.biomes.keys()])) {
      const [tx, ty] = key.split(',').map(Number), x = px(tx * TILE), y = py(ty * TILE), size = TILE * z;
      if (x + size < 0 || x > w || y + size < 0 || y > h) continue;
      visible.add(key);
      let tile = this.cache.get(key);
      if (!tile || this.pending.has(key)) { if (rendered < 6) { tile = this.tile(key); rendered++; } else this.needsDraw = true; }
      if (tile) c.drawImage(tile, x, y, size + .3, size + .3);
    }
    if (this.cache.size > 240) for (const key of this.cache.keys()) if (!visible.has(key)) { this.cache.delete(key); this.pending.delete(key); }
    const spacing = TILE * Math.max(1, 2 ** Math.ceil(Math.log2(60 / (TILE * z))));
    const minX = Math.max(b.minX, this.center.x - w / z / 2), maxX = Math.min(b.maxX, this.center.x + w / z / 2);
    const minY = Math.max(b.minY, this.center.y - h / z / 2), maxY = Math.min(b.maxY, this.center.y + h / z / 2);
    c.strokeStyle = '#b9d9d010'; c.lineWidth = 1; c.beginPath();
    for (let x = Math.ceil(minX / spacing) * spacing; x <= maxX; x += spacing) { c.moveTo(px(x), py(minY)); c.lineTo(px(x), py(maxY)); }
    for (let y = Math.ceil(minY / spacing) * spacing; y <= maxY; y += spacing) { c.moveTo(px(minX), py(y)); c.lineTo(px(maxX), py(y)); } c.stroke(); c.restore();
    c.strokeStyle = '#70919388'; c.lineWidth = 1; c.setLineDash([5, 5]); c.strokeRect(px(b.minX), py(b.minY), (b.maxX - b.minX) * z, (b.maxY - b.minY) * z); c.setLineDash([]);
    if (this.cursor) {
      const { x, y, radius } = this.cursor; c.beginPath(); c.arc(px(x), py(y), radius * z, 0, Math.PI * 2); c.fillStyle = '#dcebad12'; c.fill(); c.strokeStyle = '#e2edbb'; c.lineWidth = 1.3; c.stroke(); c.beginPath(); c.moveTo(px(x) - 4, py(y)); c.lineTo(px(x) + 4, py(y)); c.moveTo(px(x), py(y) - 4); c.lineTo(px(x), py(y) + 4); c.stroke();
    }
    document.querySelector('#map-zoom').textContent = `${Math.round(z * 100)}%`;
    document.querySelector('#map-scale').textContent = `${Math.round(70 / z).toLocaleString()} samples`;
  }
}
