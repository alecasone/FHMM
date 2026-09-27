import { waterColor } from './water-colors.js';
import { TILE, FLOOR } from './world.js';
import { BIOME_COUNT, surfaceColor } from './biomes.js';
import { radians, rotate2D, sunDirection, hillshade, wrapDegrees } from './view-math.js';
import { riverSections } from './rivers.js';
import { drawMapObjects } from './object-map.js';
import { brushPreviewStamp } from './brush-preview.js';
import { drawCursorReference } from './cursor-reference-map.js';
const sameState = (before, after) => before && before.length === after.length && after.every((value, index) => value === before[index]);
export class MapView {
  constructor(canvas, world) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d', { alpha: false }); this.world = world;
    // Keep static layers at the exact display resolution; hovering only composites them.
    this.terrainCanvas = document.createElement('canvas'); this.terrainCtx = this.terrainCanvas.getContext('2d', { alpha: false });
    this.detailCanvas = document.createElement('canvas'); this.detailCtx = this.detailCanvas.getContext('2d');
    this.contentRevision = 0; this.terrainState = null; this.detailState = null;
    this.gridLabel = document.querySelector('#map-grid-scale'); this.zoomLabel = document.querySelector('#map-zoom'); this.scaleLabel = document.querySelector('#map-scale');
    this.rotation = 0; this.sunAzimuth = 315; this.sunElevation = 32; this.roadPreview = []; this.riverCache = []; this.riverState = null; this.lastFlowFrame = 0;
    this.center = { x: 0, y: 0 }; this.zoom = 1; this.cache = new Map(); this.pending = new Set(); this.contours = true; this.scaleGrid = true; this.gridSpacing = 128; this.referenceEnabled = true; this.referenceKind = 'house'; this.cursor = null; this.needsDraw = true;
    this.fitPending = true; this.observer = new ResizeObserver(() => { this.resize(); }); this.observer.observe(canvas.parentElement); this.resize();
  }
  resize() {
    const r = this.canvas.parentElement.getBoundingClientRect(); this.width = r.width; this.height = r.height;
    if (r.width <= 0 || r.height <= 0) return;
    const dpr = Math.min(devicePixelRatio, 2), w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    for (const layer of [this.terrainCanvas, this.detailCanvas]) if (layer.width !== w || layer.height !== h) { layer.width = w; layer.height = h; }
    this.dpr = dpr;
    for (const context of [this.ctx, this.terrainCtx, this.detailCtx]) context.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.terrainState = null; this.detailState = null; this.needsDraw = true;
    if (this.fitPending || !Number.isFinite(this.zoom) || this.zoom <= 0) this.fit();
  }
  fit() { const b = this.world.bounds, c = Math.abs(Math.cos(this.rotation)), s = Math.abs(Math.sin(this.rotation)), bw = b.maxX - b.minX, bh = b.maxY - b.minY; this.center = { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 }; this.fitPending = !(this.width > 0 && this.height > 0); if (!this.fitPending) this.zoom = Math.max(.000001, Math.min(Math.max(1, this.width - 70) / (bw * c + bh * s), Math.max(1, this.height - 100) / (bh * c + bw * s))); this.needsDraw = true; }
  setRotation(degrees) { this.rotation = radians(wrapDegrees(degrees)); this.needsDraw = true; }
  setBrushPreview(preview) { this.brushPreview = preview; this.previewStamp = preview ? brushPreviewStamp(preview.mask) : null; this.needsDraw = true; }
  screenDelta(x, y) { const p = rotate2D(x, y, -this.rotation); return { x: p.x / this.zoom, y: p.y / this.zoom }; }
  reset() { this.failed = false; this.cache.clear(); this.pending.clear(); this.cursor = null; this.resize(); this.fit(); }
  point(event) { if (!(this.zoom > 0) || !Number.isFinite(this.zoom) || !this.width || !this.height) return null; const r = this.canvas.getBoundingClientRect(), p = this.screenDelta(event.clientX - r.left - this.width / 2, event.clientY - r.top - this.height / 2); return { x: p.x + this.center.x, y: p.y + this.center.y }; }
  invalidate(keys) { for (const key of keys ?? this.cache.keys()) if (this.cache.has(key)) this.pending.add(key); this.contentRevision++; this.needsDraw = true; }
  tile(key) {
    const world = this.world, [tx, ty] = key.split(',').map(Number), image = this.tileImage ??= new ImageData(TILE, TILE), data = image.data, floor = Math.fround(FLOOR);
    const samples = world.tiles.get(key), paint = world.biomes.get(key), colors = world.colors.get(key), waterPaint = world.waterPaint.get(key), sun = sunDirection(this.sunAzimuth, this.sunElevation), rgb = [0, 0, 0];
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const wx = tx * TILE + x, wy = ty * TILE + y, index = y * TILE + x, h = samples?.[index] ?? floor;
      let color, light = 1;
      if (world.ocean && h < world.sea) color = waterColor(world.sea - h, world.waterStyle, waterPaint, index * 4, rgb);
      else {
        const left = x ? (samples?.[index - 1] ?? floor) : world.get(wx - 1, wy), right = x < TILE - 1 ? (samples?.[index + 1] ?? floor) : world.get(wx + 1, wy);
        const up = y ? (samples?.[index - TILE] ?? floor) : world.get(wx, wy - 1), down = y < TILE - 1 ? (samples?.[index + TILE] ?? floor) : world.get(wx, wy + 1);
        color = surfaceColor(h, world.sea, wx, wy, Math.hypot(left - right, up - down) * 50, paint, index * BIOME_COUNT, world.biomesVisible, colors, index * 4, rgb);
        light = hillshade(left, right, up, down, sun);
      }
      if (this.contours && h > world.sea && h % .055 < .0018) light *= .76;
      const i = (y * TILE + x) * 4; data[i] = color[0] * light; data[i + 1] = color[1] * light; data[i + 2] = color[2] * light; data[i + 3] = 255;
    }
    const canvas = this.cache.get(key) ?? document.createElement('canvas'); if (canvas.width !== TILE || canvas.height !== TILE) canvas.width = canvas.height = TILE; canvas.getContext('2d').putImageData(image, 0, 0); this.cache.set(key, canvas); this.pending.delete(key); return canvas;
  }
  *visibleTiles(bounds) {
    if (bounds.maxX < bounds.minX || bounds.maxY < bounds.minY) return;
    const maps = [this.world.tiles, this.world.biomes, this.world.colors, this.world.waterPaint];
    const minTX = Math.floor(bounds.minX / TILE), maxTX = Math.floor(bounds.maxX / TILE), minTY = Math.floor(bounds.minY / TILE), maxTY = Math.floor(bounds.maxY / TILE);
    const area = (maxTX - minTX + 1) * (maxTY - minTY + 1), allocated = maps.reduce((sum, map) => sum + map.size, 0);
    // Close views query local cells. Wide views walk sparse data, never empty world space.
    if (area <= allocated) {
      for (let ty = minTY; ty <= maxTY; ty++) for (let tx = minTX; tx <= maxTX; tx++) {
        const key = tx + ',' + ty;
        if (maps.some(map => map.has(key))) yield { key, tx, ty };
      }
    } else {
      const keys = new Set();
      for (const map of maps) for (const key of map.keys()) keys.add(key);
      for (const key of keys) {
        const [tx, ty] = key.split(',').map(Number);
        if (tx >= minTX && tx <= maxTX && ty >= minTY && ty <= maxTY) yield { key, tx, ty };
      }
    }
  }
  rotateContext(c) {
    c.translate(this.width / 2, this.height / 2); c.rotate(this.rotation); c.translate(-this.width / 2, -this.height / 2);
  }
  draw() {
    const time = performance.now(), world = this.world;
    if (this.objectRevision !== world.revision) { this.objectRevision = world.revision; this.needsDraw = true; }
    if (world.riversVisible && world.rivers.length && time - this.lastFlowFrame > 50) { this.needsDraw = true; this.lastFlowFrame = time; }
    if (!this.needsDraw || !this.width || !this.height) return;
    if (!(this.zoom > 0) || !Number.isFinite(this.zoom)) this.fit();
    this.needsDraw = false;
    const c = this.ctx, w = this.width, h = this.height, z = this.zoom, b = world.bounds;
    const halfW = (w * Math.abs(Math.cos(this.rotation)) + h * Math.abs(Math.sin(this.rotation))) / 2, halfH = (h * Math.abs(Math.cos(this.rotation)) + w * Math.abs(Math.sin(this.rotation))) / 2;
    const px = x => (x - this.center.x) * z + w / 2, py = y => (y - this.center.y) * z + h / 2;
    const visibleBounds = {
      minX: Math.max(b.minX, this.center.x - halfW / z), maxX: Math.min(b.maxX, this.center.x + halfW / z),
      minY: Math.max(b.minY, this.center.y - halfH / z), maxY: Math.min(b.maxY, this.center.y + halfH / z)
    };
    const spacing = this.gridSpacing * Math.max(1, 2 ** Math.ceil(Math.log2(60 / (this.gridSpacing * z))));
    const viewportState = [w, h, this.canvas.width, this.canvas.height, z, this.center.x, this.center.y, this.rotation, b.minX, b.minY, b.maxX, b.maxY];
    const terrainState = [...viewportState, this.contentRevision, world.tiles, world.biomes, world.colors, world.waterPaint, world.sea, world.ocean, world.biomesVisible, this.contours, this.sunAzimuth, this.sunElevation, world.waterStyle];
    if (!sameState(this.terrainState, terrainState)) {
      const layer = this.terrainCtx;
      layer.fillStyle = '#0e1d26'; layer.fillRect(0, 0, w, h);
      layer.save(); this.rotateContext(layer);
      layer.fillStyle = world.ocean ? `rgb(${waterColor(world.sea - FLOOR, world.waterStyle).join(',')})` : '#36463b';
      layer.fillRect(px(b.minX), py(b.minY), (b.maxX - b.minX) * z, (b.maxY - b.minY) * z);
      layer.imageSmoothingEnabled = z < 1;
      layer.beginPath(); layer.rect(px(b.minX), py(b.minY), (b.maxX - b.minX) * z, (b.maxY - b.minY) * z); layer.clip();
      let rendered = 0; const visible = new Set();
      for (const { key, tx, ty } of this.visibleTiles(visibleBounds)) {
        visible.add(key);
        let tile = this.cache.get(key);
        if (!tile || this.pending.has(key)) {
          if (rendered < 6) { tile = this.tile(key); rendered++; }
          else this.needsDraw = true;
        }
        if (tile) layer.drawImage(tile, px(tx * TILE), py(ty * TILE), TILE * z + .3, TILE * z + .3);
      }
      if (this.cache.size > 240) for (const key of this.cache.keys()) if (!visible.has(key)) { this.cache.delete(key); this.pending.delete(key); }
      layer.restore();
      // Finish progressively rebuilding visible tiles before freezing the backing image.
      this.terrainState = this.needsDraw ? null : terrainState;
    }
    const detailState = [...viewportState, world.terrainRevision, world.objects, world.objectsRevision, world.objectsVisible, world.sea, this.scaleGrid, this.gridSpacing];
    if (!sameState(this.detailState, detailState)) {
      const layer = this.detailCtx;
      layer.clearRect(0, 0, w, h); layer.save(); this.rotateContext(layer);
      layer.save(); layer.beginPath(); layer.rect(px(b.minX), py(b.minY), (b.maxX - b.minX) * z, (b.maxY - b.minY) * z); layer.clip();
      drawMapObjects(layer, world, px, py, z, visibleBounds);
      if (this.scaleGrid) {
        layer.strokeStyle = '#b9d9d038'; layer.lineWidth = 1; layer.beginPath();
        for (let x = Math.ceil(visibleBounds.minX / spacing) * spacing; x <= visibleBounds.maxX; x += spacing) { layer.moveTo(px(x), py(visibleBounds.minY)); layer.lineTo(px(x), py(visibleBounds.maxY)); }
        for (let y = Math.ceil(visibleBounds.minY / spacing) * spacing; y <= visibleBounds.maxY; y += spacing) { layer.moveTo(px(visibleBounds.minX), py(y)); layer.lineTo(px(visibleBounds.maxX), py(y)); }
        layer.stroke();
      }
      layer.restore();
      layer.strokeStyle = '#70919388'; layer.lineWidth = 1; layer.setLineDash([5, 5]);
      layer.strokeRect(px(b.minX), py(b.minY), (b.maxX - b.minX) * z, (b.maxY - b.minY) * z); layer.setLineDash([]);
      layer.restore(); this.detailState = detailState;
    }
    // Copy physical pixels directly, avoiding another resampling pass at noninteger DPR.
    c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.drawImage(this.terrainCanvas, 0, 0); c.restore();
    if ((world.riversVisible && world.rivers.length) || this.roadPreview.length > 1) {
      c.save(); this.rotateContext(c); c.beginPath(); c.rect(px(b.minX), py(b.minY), (b.maxX - b.minX) * z, (b.maxY - b.minY) * z); c.clip();
      this.drawRivers(c, px, py, z, time); c.restore();
    }
    c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.drawImage(this.detailCanvas, 0, 0); c.restore();
    c.imageSmoothingEnabled = z < 1;
    c.save(); this.rotateContext(c);
    if (this.cursor) {
      const { x, y, radius } = this.cursor; if (this.brushPreview && this.previewStamp) { c.save(); c.globalAlpha = this.brushPreview.opacity ?? .36; c.translate(px(x), py(y)); c.rotate(this.brushPreview.rotation || 0); c.drawImage(this.previewStamp, -radius * z, -radius * z, radius * z * 2, radius * z * 2); c.restore(); } c.beginPath(); c.arc(px(x), py(y), radius * z, 0, Math.PI * 2); c.fillStyle = '#dcebad12'; c.fill(); c.strokeStyle = this.brushPreview?.mask ? '#e2edbb88' : '#e2edbb'; c.lineWidth = 1.3; c.stroke(); c.beginPath(); c.moveTo(px(x) - 4, py(y)); c.lineTo(px(x) + 4, py(y)); c.moveTo(px(x), py(y) - 4); c.lineTo(px(x), py(y) + 4); c.stroke();
    }
    if (this.cursor && this.referenceEnabled && world.inside(this.cursor.x, this.cursor.y)) drawCursorReference(c, px(this.cursor.x), py(this.cursor.y), z, this.rotation, this.referenceKind);
    c.restore();
    const gridText = this.scaleGrid ? ' · grid ' + spacing.toLocaleString() : '', zoomText = `${Math.round(z * 100)}%`, scaleText = `${Math.round(70 / z).toLocaleString()} samples`;
    if (this.gridLabel && this.gridLabel.textContent !== gridText) this.gridLabel.textContent = gridText;
    if (this.zoomLabel && this.zoomLabel.textContent !== zoomText) this.zoomLabel.textContent = zoomText;
    if (this.scaleLabel && this.scaleLabel.textContent !== scaleText) this.scaleLabel.textContent = scaleText;
  }
  drawRivers(c, px, py, z, time) {
    const world = this.world, b = world.bounds, state = [world.terrainRevision, world.rivers, world.sea, world.ocean, b.minX, b.minY, b.maxX, b.maxY];
    if (!sameState(this.riverState, state)) { this.riverCache = world.rivers.map(r => riverSections(world, r)); this.riverState = state; }
    if (this.world.riversVisible) for (const sections of this.riverCache) {
      c.fillStyle = '#397f8b';
      for (let i = 1; i < sections.length; i++) {
        const a = sections[i - 1], b = sections[i]; if (!a.wet || !b.wet) continue;
        c.beginPath(); c.moveTo(px(a.left.x), py(a.left.y)); c.lineTo(px(a.right.x), py(a.right.y)); c.lineTo(px(b.right.x), py(b.right.y)); c.lineTo(px(b.left.x), py(b.left.y)); c.closePath(); c.fill();
        c.strokeStyle = '#9adbd95a'; c.lineWidth = Math.max(.5, z * Math.min(a.width, b.width) * .09); c.setLineDash([5 * z, 16 * z]); c.lineDashOffset = -(time * .012 - a.along) * z;
        c.beginPath(); c.moveTo(px(a.x), py(a.y)); c.lineTo(px(b.x), py(b.y)); c.stroke();
      }
    }
    c.setLineDash([]); c.lineDashOffset = 0;
    if (this.roadPreview.length > 1) { c.strokeStyle = '#e2c897aa'; c.lineWidth = Math.max(2, (this.roadPreviewWidth || 12) * z); c.setLineDash([5, 4]); c.beginPath(); this.roadPreview.forEach((p, i) => i ? c.lineTo(px(p.x), py(p.y)) : c.moveTo(px(p.x), py(p.y))); c.stroke(); c.setLineDash([]); }
  }
}
