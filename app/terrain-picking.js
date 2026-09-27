import * as THREE from 'three';

// Terrain is a regular X/Z grid. Visit the cells crossed by the ray instead of
// testing all 32,768 triangles in every tile; keep the actual rendered triangles.
export class TerrainPicker {
  constructor() {
    this.ray = new THREE.Ray();
    this.inverse = new THREE.Matrix4();
    this.a = new THREE.Vector3();
    this.b = new THREE.Vector3();
    this.c = new THREE.Vector3();
    this.hit = new THREE.Vector3();
    this.best = new THREE.Vector3();
    this.grids = new WeakMap();
    this.candidates = [];
    this.fallback = new THREE.Raycaster();
  }
  grid(geometry) {
    const position = geometry.attributes.position, index = geometry.index;
    const columns = geometry.parameters?.widthSegments, rows = geometry.parameters?.heightSegments;
    if (!position || position.isInterleavedBufferAttribute || !index ||
      !Number.isInteger(columns) || !Number.isInteger(rows) || columns < 1 || rows < 1 ||
      position.count !== (columns + 1) * (rows + 1) || index.count !== columns * rows * 6 ||
      geometry.groups.length || geometry.drawRange.start !== 0 || geometry.drawRange.count < index.count ||
      geometry.morphAttributes.position?.length) return null;
    let grid = this.grids.get(geometry);
    if (grid?.position === position && grid.version === position.version) return grid;
    const x0 = position.getX(0), z0 = position.getZ(0);
    const x1 = position.getX(columns), z1 = position.getZ(rows * (columns + 1));
    if (!(x1 > x0 && z1 > z0)) return null;
    grid = { position, version: position.version, columns, rows, x0, z0, x1, z1,
      dx: (x1 - x0) / columns, dz: (z1 - z0) / rows };
    this.grids.set(geometry, grid);
    return grid;
  }
  localRay(ray, mesh) {
    this.inverse.copy(mesh.matrixWorld).invert();
    this.ray.origin.copy(ray.origin).applyMatrix4(this.inverse);
    const m = this.inverse.elements, d = ray.direction;
    this.ray.direction.set(m[0] * d.x + m[4] * d.y + m[8] * d.z,
      m[1] * d.x + m[5] * d.y + m[9] * d.z, m[2] * d.x + m[6] * d.y + m[10] * d.z);
    const scale = this.ray.direction.length();
    this.ray.direction.multiplyScalar(1 / scale);
    return scale;
  }
  range(geometry, grid, limit) {
    const { origin: o, direction: d } = this.ray;
    let start = 0, end = limit;
    for (const axis of ['x', 'z']) {
      const low = grid[axis + '0'], high = grid[axis + '1'];
      if (d[axis] === 0) { if (o[axis] < low || o[axis] > high) return false; }
      else {
        let a = (low - o[axis]) / d[axis], b = (high - o[axis]) / d[axis];
        if (a > b) [a, b] = [b, a];
        start = Math.max(start, a); end = Math.min(end, b);
        if (start > end) return false;
      }
    }
    // SceneView refreshes this sphere after each height-buffer rebuild.
    if (!geometry.boundingSphere) geometry.computeBoundingSphere();
    const sphere = geometry.boundingSphere;
    const x = sphere.center.x - o.x, y = sphere.center.y - o.y, z = sphere.center.z - o.z;
    const projection = x * d.x + y * d.y + z * d.z;
    const discriminant = sphere.radius ** 2 - (x * x + y * y + z * z - projection ** 2);
    if (discriminant < 0) return false;
    const half = Math.sqrt(discriminant);
    start = Math.max(start, projection - half); end = Math.min(end, projection + half);
    if (start > end) return false;
    this.start = start; this.end = end;
    return true;
  }
  cell(mesh, grid, x, z) {
    if (x < 0 || z < 0 || x >= grid.columns || z >= grid.rows) return;
    const geometry = mesh.geometry, position = geometry.attributes.position, index = geometry.index;
    const offset = (z * grid.columns + x) * 6, side = mesh.material.side;
    for (let triangle = offset; triangle < offset + 6; triangle += 3) {
      this.a.fromBufferAttribute(position, index.getX(triangle));
      this.b.fromBufferAttribute(position, index.getX(triangle + 1));
      this.c.fromBufferAttribute(position, index.getX(triangle + 2));
      const hit = side === THREE.BackSide
        ? this.ray.intersectTriangle(this.c, this.b, this.a, true, this.hit)
        : this.ray.intersectTriangle(this.a, this.b, this.c, side !== THREE.DoubleSide, this.hit);
      if (!hit) continue;
      const distance = hit.distanceTo(this.ray.origin);
      if (distance <= this.closest) { this.closest = distance; this.best.copy(hit); this.found = true; }
    }
  }
  traverse(mesh, grid, limit) {
    if (!this.range(mesh.geometry, grid, limit)) return false;
    const { origin: o, direction: d } = this.ray, start = this.start, end = this.end;
    let x = Math.max(0, Math.min(grid.columns - 1, Math.floor((o.x + d.x * start - grid.x0) / grid.dx)));
    let z = Math.max(0, Math.min(grid.rows - 1, Math.floor((o.z + d.z * start - grid.z0) / grid.dz)));
    const sx = Math.sign(d.x), sz = Math.sign(d.z);
    const stepX = sx ? grid.dx / Math.abs(d.x) : Infinity;
    const stepZ = sz ? grid.dz / Math.abs(d.z) : Infinity;
    let crossX = sx ? (grid.x0 + (x + (sx > 0 ? 1 : 0)) * grid.dx - o.x) / d.x : Infinity;
    let crossZ = sz ? (grid.z0 + (z + (sz > 0 ? 1 : 0)) * grid.dz - o.z) / d.z : Infinity;
    // A ray exactly on a grid edge may belong to either adjacent cell.
    const ux = (o.x - grid.x0) / grid.dx, uz = (o.z - grid.z0) / grid.dz;
    const peerX = !sx && Math.abs(ux - Math.round(ux)) < 1e-9 ? (x === Math.round(ux) ? x - 1 : x + 1) : null;
    const peerZ = !sz && Math.abs(uz - Math.round(uz)) < 1e-9 ? (z === Math.round(uz) ? z - 1 : z + 1) : null;
    this.closest = limit; this.found = false;
    while (x >= 0 && z >= 0 && x < grid.columns && z < grid.rows) {
      this.cell(mesh, grid, x, z);
      if (peerX !== null) this.cell(mesh, grid, peerX, z);
      if (peerZ !== null) this.cell(mesh, grid, x, peerZ);
      if (peerX !== null && peerZ !== null) this.cell(mesh, grid, peerX, peerZ);
      const next = Math.min(crossX, crossZ);
      if (!Number.isFinite(next) || next > end || next > this.closest) break;
      const corner = Number.isFinite(crossX) && Number.isFinite(crossZ) &&
        Math.abs(crossX - crossZ) <= 1e-10 * Math.max(1, Math.abs(next));
      if (corner) {
        // Supercover corner crossings, including numerical near-ties.
        this.cell(mesh, grid, x + sx, z); this.cell(mesh, grid, x, z + sz);
        x += sx; z += sz; crossX += stepX; crossZ += stepZ;
      } else if (crossX < crossZ) { x += sx; crossX += stepX; }
      else { z += sz; crossZ += stepZ; }
    }
    return this.found;
  }
  // ray.direction is normalized, as produced by THREE.Raycaster. Only mesh
  // buffers are sampled: edits waiting for a render rebuild cannot move a hit.
  intersect(ray, meshes, maxDistance = Infinity, target = new THREE.Vector3()) {
    if (!(maxDistance >= 0)) return null;
    const candidates = this.candidates; candidates.length = 0;
    let closest = maxDistance, found = false;
    for (const mesh of meshes) {
      // A new streaming tile can be picked before its first renderer traversal.
      mesh.updateWorldMatrix(true, false);
      const grid = this.grid(mesh.geometry);
      if (!grid || Array.isArray(mesh.material)) {
        this.fallback.ray.copy(ray); this.fallback.near = 0; this.fallback.far = closest;
        const hit = this.fallback.intersectObject(mesh, false)[0];
        if (hit && hit.distance <= closest) { closest = hit.distance; target.copy(hit.point); found = true; }
        continue;
      }
      const scale = this.localRay(ray, mesh);
      if (Number.isFinite(scale) && scale > 0 && this.range(mesh.geometry, grid, closest * scale)) {
        candidates.push({ mesh, grid, near: this.start / scale });
      }
    }
    candidates.sort((a, b) => a.near - b.near);
    for (const { mesh, grid, near } of candidates) {
      if (near > closest) break;
      const scale = this.localRay(ray, mesh);
      if (!this.traverse(mesh, grid, closest * scale)) continue;
      target.copy(this.best).applyMatrix4(mesh.matrixWorld);
      closest = target.distanceTo(ray.origin); found = true;
    }
    return found ? target : null;
  }
}

