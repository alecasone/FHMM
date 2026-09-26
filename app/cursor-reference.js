import * as THREE from 'three';
import { createObjectGeometry } from './object-view.js';
import { objectGroundHeight } from './objects.js';

import { REFERENCE_TYPES } from './cursor-scale.js';
function makeReference(kind) {
  const group = new THREE.Group(), materials = new Map();
  function add(geometry, color, x = 0, y = 0, z = 0) {
    if (!materials.has(color)) materials.set(color, new THREE.MeshStandardMaterial({ color, roughness: 1, transparent: true, opacity: 1, depthTest: false, depthWrite: false }));
    const mesh = new THREE.Mesh(geometry, materials.get(color)); mesh.position.set(x, y, z); mesh.renderOrder = 13; group.add(mesh); return mesh;
  }
  if (kind === 'person') {
    add(new THREE.CylinderGeometry(.16, .22, .65, 8), '#aec7c5', 0, 1.2, 0);
    add(new THREE.SphereGeometry(.18, 10, 8), '#e2c0a0', 0, 1.78, 0);
    for (const side of [-1, 1]) {
      add(new THREE.CylinderGeometry(.075, .09, .8, 6), '#51636b', side * .11, .45, 0);
      add(new THREE.BoxGeometry(.17, .12, .29), '#353d40', side * .11, .07, .055);
      const arm = add(new THREE.CylinderGeometry(.055, .075, .65, 6), '#9fb8b5', side * .25, 1.16, 0); arm.rotation.z = side * .16;
      add(new THREE.SphereGeometry(.065, 8, 6), '#e2c0a0', side * .3, .83, 0);
    }
  } else if (kind === 'house') {
    add(new THREE.BoxGeometry(10, .5, 8), '#7c8581', 0, .25, 0);
    add(new THREE.BoxGeometry(9.5, 4.5, 7.5), '#e2d7b9', 0, 2.75, 0);
    const roof = new THREE.BufferGeometry();
    roof.setAttribute('position', new THREE.Float32BufferAttribute([
      -5,5,-4, 0,8,-4, 0,8,4, -5,5,-4, 0,8,4, -5,5,4,
      0,8,-4, 5,5,-4, 5,5,4, 0,8,-4, 5,5,4, 0,8,4,
      -5,5,4, 0,8,4, 5,5,4, -5,5,-4, 5,5,-4, 0,8,-4,
    ], 3)); roof.computeVertexNormals();
    add(roof, '#88604c').material.side = THREE.DoubleSide;
    add(new THREE.BoxGeometry(1.6, 2.7, .1), '#705a43', -1.7, 1.85, 3.8);
    for (const x of [1.2, 3.2]) add(new THREE.BoxGeometry(1.25, 1.35, .12), '#567d89', x, 3, 3.8);
    for (const z of [-1.8, 1.8]) add(new THREE.BoxGeometry(.12, 1.35, 1.5), '#567d89', 4.8, 3, z);
  } else {
    const mesh = new THREE.Mesh(createObjectGeometry('pine', 'summer', 'adult'), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, transparent: true, opacity: 1, depthTest: false, depthWrite: false }));
    mesh.renderOrder = 13; group.add(mesh);
  }
  // References have fixed sample dimensions, independent of brush/object size.
  const box = new THREE.Box3().setFromObject(group), size = box.getSize(new THREE.Vector3()), spec = REFERENCE_TYPES[kind];
  group.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
  const anchor = new THREE.Group(); anchor.add(group);
  anchor.scale.set(spec.width / size.x, spec.height / size.y, spec.depth / size.z);
  return anchor;
}
export class CursorReference {
  constructor(scene, world, container) {
    this.scene = scene; this.world = world; this.container = container; this.cache = new Map();
    this.enabled = true; this.kind = 'house'; this.point = null;
    this.label = document.createElement('div'); this.label.className = 'cursor-scale-label'; this.label.hidden = true; this.label.setAttribute('aria-hidden', 'true'); container.append(this.label);
    this.projected = new THREE.Vector3();
  }
  configure(enabled, kind) { this.enabled = enabled; this.kind = REFERENCE_TYPES[kind] ? kind : 'house'; }
  update(camera, relief, step) {
    for (const model of this.cache.values()) model.visible = false;
    this.label.hidden = true;
    const p = this.point;
    if (!this.enabled || !p || !this.world.inside(p.x, p.y)) return;
    let model = this.cache.get(this.kind);
    if (!model) { model = makeReference(this.kind); this.cache.set(this.kind, model); this.scene.add(model); }
    const floor = Math.max(objectGroundHeight(this.world, p.x, p.y, step), this.world.ocean ? this.world.sea : -Infinity);
    model.position.set(p.x, floor * relief + .18, p.y); model.visible = true;
    camera.updateMatrixWorld();
    this.projected.set(p.x, model.position.y + REFERENCE_TYPES[this.kind].height, p.y).project(camera);
    if (this.projected.z < -1 || this.projected.z > 1 || Math.abs(this.projected.x) > 1 || Math.abs(this.projected.y) > 1) return;
    if (this.label.textContent !== REFERENCE_TYPES[this.kind].label) this.label.textContent = REFERENCE_TYPES[this.kind].label;
    this.label.hidden = false;
    this.label.style.left = Math.max(8, Math.min(this.container.clientWidth - 8, (this.projected.x + 1) / 2 * this.container.clientWidth)) + 'px';
    this.label.style.top = Math.max(30, (1 - this.projected.y) / 2 * this.container.clientHeight - 8) + 'px';
  }
}
