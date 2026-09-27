import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { objectGroundHeight, objectsInBounds } from './objects.js';
import { detailedTree } from './detailed-scenery.js';
import { variantKey, objectLife, objectSeason, lifeScale, isLivingType } from './object-variants.js';
import { addSceneryParts } from './scenery-models.js';

// Detailed shared models, allocated only for variants present in the visible world.
export function createObjectGeometry(type, season = 'summer', lifecycle = 'adult') {
  const parts = [];
  function part(geometry, color, x, y, z, sx = 1, sy = 1, sz = 1) {
    const source = geometry;
    if (geometry.index) { geometry = geometry.toNonIndexed(); source.dispose(); }
    geometry.deleteAttribute('uv'); geometry.scale(sx, sy, sz); geometry.translate(x, y, z);
    const rgb = new THREE.Color(color);
    if (!['pine', 'oak', 'spruce', 'birch', 'willow', 'autumn', 'dead-tree', 'shrub'].includes(type) && isLivingType(type)) {
      const foliage = rgb.g > rgb.r * .9 && rgb.g > rgb.b * 1.12;
      if (lifecycle === 'dead') { rgb.lerp(new THREE.Color('#88745a'), .85); geometry.scale(1, .72, 1); }
      else if (foliage) {
        if (season === 'spring') rgb.lerp(new THREE.Color('#a4ba6b'), .28);
        if (season === 'fall' && !['palm', 'cactus', 'yucca'].includes(type)) rgb.lerp(new THREE.Color('#bc9256'), .65);
        if (season === 'winter' && !['palm', 'cactus', 'yucca'].includes(type)) rgb.lerp(new THREE.Color('#c2c6af'), .7);
      }
    }
    const colors = new Float32Array(geometry.attributes.position.count * 3);
    const snow = new THREE.Color('#d9e2e2');
    for (let i = 0; i < colors.length; i += 3) {
      const vertex = i / 3, normal = geometry.attributes.normal.getY(vertex);
      // Snow coats upward faces of the actual rock shape, rather than floating above it.
      const coverage = season === 'winter' && !isLivingType(type) && geometry.attributes.position.getY(vertex) > .1 ? Math.max(0, (normal - .4) / .6) * .9 : 0;
      colors[i] = rgb.r + (snow.r - rgb.r) * coverage; colors[i + 1] = rgb.g + (snow.g - rgb.g) * coverage; colors[i + 2] = rgb.b + (snow.b - rgb.b) * coverage;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3)); parts.push(geometry);
  }
  if (!detailedTree(type, part, season, lifecycle)) {
    if (type === 'rock') {
      part(new THREE.IcosahedronGeometry(3.2, 1), '#919488', 0, 1.15, 0, 1.15, .8, .9);
      for (let i = 0; i < 7; i++) {
        const a = i * 2.4, r = 2 + (i % 3) * .3;
        part(new THREE.IcosahedronGeometry(.45 + i % 3 * .2, 1), i % 2 ? '#737b72' : '#aaab98', Math.cos(a) * r, .3, Math.sin(a) * r, 1, .7, 1);
      }
    } else addSceneryParts(type, part);
  }
  const geometry = mergeGeometries(parts); parts.forEach(p => p.dispose());
  geometry.computeBoundingSphere(); return geometry;
}

export class ObjectView {
  constructor(scene, world) {
    this.scene = scene; this.world = world; this.terrainRevision = -1; this.objectsRevision = -1; this.meshes = new Map();
    this.geometries = new Map(); this.groups = new Map();
    this.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true });
    this.transform = new THREE.Object3D(); this.color = new THREE.Color();
  }
  update(relief, bounds, step = 2) {
    const world = this.world, wb = world.bounds;
    const signature = [relief, step, world.sea, world.objectsVisible, bounds.minX, bounds.minY, bounds.maxX, bounds.maxY, wb.minX, wb.minY, wb.maxX, wb.maxY].join(',');
    if (this.terrainRevision === world.terrainRevision && this.objectsRevision === world.objectsRevision && this.objects === world.objects && this.signature === signature) return false;
    const objectsChanged = this.objectsRevision !== world.objectsRevision || this.objects !== world.objects;
    this.terrainRevision = world.terrainRevision; this.objectsRevision = world.objectsRevision; this.objects = world.objects; this.signature = signature;
    const groups = new Map(); let changed = false;
    if (world.objectsVisible) for (const o of objectsInBounds(world, bounds)) {
      if (world.sample(o.x, o.y) <= world.sea + .002) continue;
      const key = variantKey(o); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(o);
    }
    for (const [key, mesh] of this.meshes) if (!groups.has(key)) {
      this.scene.remove(mesh); mesh.dispose(); this.meshes.delete(key);
      this.geometries.get(key)?.dispose(); this.geometries.delete(key); changed = true;
    }
    for (const [type, objects] of groups) {
      if (!this.geometries.has(type)) this.geometries.set(type, createObjectGeometry(objects[0].type, objectSeason(objects[0]), objectLife(objects[0])));
      let mesh = this.meshes.get(type);
      const prior = this.groups.get(type);
      if (mesh && !objectsChanged && prior?.length === objects.length && objects.every((o, i) => o === prior[i])) {
        // Heights do not change an object's rotation, size, or tint. Reuse those
        // attributes and upload only the matrix interval containing changed Y's.
        const matrices = mesh.instanceMatrix.array; let first = Infinity, last = -1;
        objects.forEach((o, i) => {
          const offset = i * 16 + 13, height = Math.fround(objectGroundHeight(world, o.x, o.y, step) * relief);
          if (matrices[offset] === height) return;
          matrices[offset] = height; first = Math.min(first, offset); last = offset;
        });
        if (last >= 0) {
          mesh.instanceMatrix.addUpdateRange(first, last - first + 1); mesh.instanceMatrix.needsUpdate = true;
          mesh.computeBoundingSphere(); changed = true;
        }
        continue;
      }
      if (!mesh || mesh.instanceMatrix.count < objects.length) {
        if (mesh) { this.scene.remove(mesh); mesh.dispose(); }
        const capacity = 2 ** Math.ceil(Math.log2(Math.max(32, objects.length)));
        mesh = new THREE.InstancedMesh(this.geometries.get(type), this.material, capacity);
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.castShadow = true; mesh.receiveShadow = true;
        this.meshes.set(type, mesh); this.scene.add(mesh);
      }
      mesh.count = objects.length;
      objects.forEach((o, i) => {
        this.transform.position.set(o.x, objectGroundHeight(world, o.x, o.y, step) * relief, o.y);
        this.transform.rotation.set(0, o.rotation, 0); this.transform.scale.setScalar(o.scale * lifeScale(o)); this.transform.updateMatrix();
        mesh.setMatrixAt(i, this.transform.matrix);
        const tint = .83 + o.tint * .3; this.color.setRGB(tint, tint, tint * .96); mesh.setColorAt(i, this.color);
      });
      mesh.instanceMatrix.clearUpdateRanges(); mesh.instanceMatrix.addUpdateRange(0, objects.length * 16);
      mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere(); changed = true;
    }
    this.groups = groups;
    return changed;
  }
}
