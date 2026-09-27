import * as THREE from 'three';
import { TILE, FLOOR, keyOf } from './world.js';
import { waterColor } from './water-colors.js';
import { attachScaleGrid } from './scale-grid.js';

export const WATER_SURFACE_OFFSET = .12;

// Stream small color textures with the terrain window; no full-world water texture.
export class OceanView {
  constructor(scene, world) {
    this.scene = scene; this.world = world; this.tiles = new Map(); this.pending = new Set();
    this.geometry = new THREE.PlaneGeometry(1, 1);
    this.gridVisible = true; this.gridSpacing = 128;
    // This fallback draws after terrain and before colored water tiles. It must not
    // write depth: even a small height gap loses precision at a distance and causes
    // rectangular dark patches / streaks when the tile competes with this plane.
    // Keep depth testing so visible land still occludes the fallback.
    const material = new THREE.MeshBasicMaterial({ color: '#07152f', side: THREE.DoubleSide, toneMapped: false, depthWrite: false });
    this.base = new THREE.Mesh(this.geometry, material); this.base.rotation.x = -Math.PI / 2; this.base.renderOrder = 1; scene.add(this.base);
    this.baseGrid = attachScaleGrid(material);
  }
  setGrid(visible, spacing) {
    this.gridVisible = visible; this.gridSpacing = spacing;
    for (const control of [this.baseGrid, ...[...this.tiles.values()].map(tile => tile.grid)]) { control.visible.value = visible ? 1 : 0; control.spacing.value = spacing; }
  }
  invalidate() { for (const key of this.tiles.keys()) this.pending.add(key); }
  retain(keys) {
    for (const [key, tile] of this.tiles) if (!keys.has(key)) {
      this.scene.remove(tile.mesh); tile.texture.dispose(); tile.mesh.material.dispose(); this.tiles.delete(key); this.pending.delete(key);
    }
  }
  build(key, tx, ty, relief) {
    const world = this.world, size = TILE + 1;
    let tile = this.tiles.get(key);
    if (!tile) {
      const texture = new THREE.DataTexture(new Uint8Array(size * size * 4), size, size, THREE.RGBAFormat);
      // Align edge vertices to texel centers so neighboring tiles share the same border color.
      texture.repeat.set(TILE / size, TILE / size); texture.offset.set(.5 / size, .5 / size);
      texture.colorSpace = THREE.SRGBColorSpace; texture.flipY = false; texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearFilter;
      const material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide, toneMapped: false });
      const mesh = new THREE.Mesh(this.geometry, material); mesh.rotation.x = -Math.PI / 2; mesh.renderOrder = 2; mesh.scale.set(TILE, TILE, 1);
      tile = { mesh, texture, grid: attachScaleGrid(material), tx, ty };
      tile.grid.visible.value = this.gridVisible ? 1 : 0; tile.grid.spacing.value = this.gridSpacing;
      this.tiles.set(key, tile); this.scene.add(mesh);
    }
    // Plane UVs run south-to-north; store rows in that order without upload-time flipping.
    const bytes = tile.texture.image.data;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const wx = Math.min(world.bounds.maxX - 1, tx * TILE + x), wy = Math.min(world.bounds.maxY - 1, ty * TILE + y);
      const px = Math.floor(wx / TILE), py = Math.floor(wy / TILE), offset = ((wy - py * TILE) * TILE + wx - px * TILE) * 4;
      const rgb = waterColor(world.sea - world.get(wx, wy), world.waterStyle, world.waterPaint.get(keyOf(px, py)), offset), i = ((TILE - y) * size + x) * 4;
      bytes[i] = Math.round(rgb[0]); bytes[i + 1] = Math.round(rgb[1]); bytes[i + 2] = Math.round(rgb[2]); bytes[i + 3] = 255;
    }
    tile.texture.needsUpdate = true;
    tile.mesh.position.set(tx * TILE + TILE / 2, world.sea * relief + WATER_SURFACE_OFFSET, ty * TILE + TILE / 2);
    tile.mesh.visible = world.ocean; this.pending.delete(key);
  }
  update(relief) {
    const world = this.world, signature = JSON.stringify([world.waterStyle, world.sea, world.ocean, relief, world.bounds]);
    let changed = signature !== this.signature;
    if (changed) {
      this.signature = signature; this.invalidate();
      const rgb = waterColor(world.sea - FLOOR, world.waterStyle);
      this.base.material.color.setRGB(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, THREE.SRGBColorSpace);
      // Both surfaces share sea level; render order and depthWrite separate them.
      this.base.position.y = world.sea * relief + WATER_SURFACE_OFFSET; this.base.visible = world.ocean;
      for (const tile of this.tiles.values()) { tile.mesh.visible = world.ocean; tile.mesh.position.y = world.sea * relief + WATER_SURFACE_OFFSET; }
    }
    const started = performance.now(); let count = 0;
    for (const key of this.pending) {
      if (count >= 2 || (count && performance.now() - started > 8)) break;
      const tile = this.tiles.get(key); if (tile) { this.build(key, tile.tx, tile.ty, relief); count++; changed = true; } else this.pending.delete(key);
    }
    return changed;
  }
}
