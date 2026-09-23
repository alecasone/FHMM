import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { OBJECT_TYPES, objectGroundHeight } from './objects.js';

// A few shared low-poly models, with per-instance size, yaw and color variation.
export function createObjectGeometry(type) {
  const parts = [];
  function part(geometry, color, x, y, z, sx = 1, sy = 1, sz = 1) {
    const source = geometry;
    if (geometry.index) { geometry = geometry.toNonIndexed(); source.dispose(); }
    geometry.deleteAttribute('uv'); geometry.scale(sx, sy, sz); geometry.translate(x, y, z);
    const rgb = new THREE.Color(color), colors = new Float32Array(geometry.attributes.position.count * 3);
    for (let i = 0; i < colors.length; i += 3) { colors[i] = rgb.r; colors[i + 1] = rgb.g; colors[i + 2] = rgb.b; }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3)); parts.push(geometry);
  }
  if (type === 'pine') {
    part(new THREE.CylinderGeometry(.48, .8, 8, 5), '#785b3d', 0, 3.6, 0);
    part(new THREE.ConeGeometry(3.8, 8, 7), '#345e42', 0, 7, 0);
    part(new THREE.ConeGeometry(3.1, 7, 7), '#3d7049', 0, 10.5, 0);
    part(new THREE.ConeGeometry(2.1, 6, 7), '#517b50', 0, 14, 0);
  } else if (type === 'oak') {
    part(new THREE.CylinderGeometry(.65, 1.05, 9, 6), '#7f6246', 0, 4, 0);
    part(new THREE.IcosahedronGeometry(4.6, 1), '#5a7d43', -.9, 9.5, .2, 1, .9, 1);
    part(new THREE.IcosahedronGeometry(3.8, 1), '#6d8b49', 2.3, 10.6, -.5, 1, .95, 1);
    part(new THREE.IcosahedronGeometry(3.5, 1), '#74974f', -.6, 12.5, .4, 1.1, 1, 1);
  } else if (type === 'shrub') {
    part(new THREE.IcosahedronGeometry(2.7, 1), '#76894c', 0, 1.6, 0, 1, .85, .9);
    part(new THREE.IcosahedronGeometry(1.8, 0), '#8a9a53', 1.9, 1, .7, 1, .9, 1);
    part(new THREE.IcosahedronGeometry(1.8, 0), '#647b40', -1.5, 1, .3, 1, .8, 1);
  } else if (type === 'rock') {
    const stone = new THREE.IcosahedronGeometry(3.2, 0); stone.rotateY(.4); stone.rotateZ(.18);
    part(stone, '#919488', 0, 1.15, 0, 1.15, .8, .9);
    part(new THREE.IcosahedronGeometry(1.5, 0), '#aaab98', 2.2, .45, 1, 1, .7, .85);
  }
  const geometry = mergeGeometries(parts); parts.forEach(p => p.dispose());
  geometry.computeBoundingSphere(); return geometry;
}

export class ObjectView {
  constructor(scene, world) {
    this.scene = scene; this.world = world; this.revision = -1; this.meshes = new Map();
    this.geometries = new Map(OBJECT_TYPES.map(t => [t.id, createObjectGeometry(t.id)]));
    this.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true });
    this.transform = new THREE.Object3D(); this.color = new THREE.Color();
  }
  update(relief, bounds, step = 2) {
    const world = this.world, signature = [relief, step, world.sea, world.objectsVisible, bounds.minX, bounds.minY, bounds.maxX, bounds.maxY].join(',');
    if (this.revision === world.revision && this.signature === signature) return false;
    this.revision = world.revision; this.signature = signature;
    const groups = new Map(OBJECT_TYPES.map(t => [t.id, []]));
    if (world.objectsVisible) for (const o of world.objects) {
      if (!world.inside(o.x, o.y) || o.x < bounds.minX || o.x >= bounds.maxX || o.y < bounds.minY || o.y >= bounds.maxY || world.sample(o.x, o.y) <= world.sea + .002) continue;
      groups.get(o.type).push(o);
    }
    for (const [type, objects] of groups) {
      let mesh = this.meshes.get(type);
      if (!objects.length) {
        if (mesh) { this.scene.remove(mesh); mesh.dispose(); this.meshes.delete(type); }
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
        this.transform.rotation.set(0, o.rotation, 0); this.transform.scale.setScalar(o.scale); this.transform.updateMatrix();
        mesh.setMatrixAt(i, this.transform.matrix);
        const tint = .83 + o.tint * .3; this.color.setRGB(tint, tint, tint * .96); mesh.setColorAt(i, this.color);
      });
      mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
    return true;
  }
}
