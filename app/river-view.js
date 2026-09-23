import * as THREE from 'three';
import { riverSections } from './rivers.js';

export class RiverView {
  constructor(scene, world) {
    this.world = world; this.revision = -1; this.time = { value: 0 }; this.lastFrame = 0;
    const material = new THREE.MeshStandardMaterial({ color: '#428f9f', roughness: .68, metalness: .02, transparent: true, opacity: .94, side: THREE.DoubleSide, depthWrite: false });
    material.onBeforeCompile = shader => {
      shader.uniforms.riverTime = this.time;
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 riverFlow; varying vec2 vRiverFlow;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvRiverFlow = riverFlow;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform float riverTime; varying vec2 vRiverFlow;').replace('#include <color_fragment>', '#include <color_fragment>\nfloat ripple = sin(vRiverFlow.y * 1.7 - riverTime * 3.5 + sin(vRiverFlow.x * 7.0)) * 0.5 + 0.5;\nfloat glint = pow(ripple, 12.0) * (0.3 + 0.7 * (1.0 - abs(vRiverFlow.x)));\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.6, 0.85, 0.86), glint * 0.24);');
    };
    material.customProgramCacheKey = () => 'fmm-river-flow-v1';
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), material); this.mesh.receiveShadow = true; this.mesh.renderOrder = 3; scene.add(this.mesh);
    this.preview = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: '#90dfed', depthTest: false })); this.preview.renderOrder = 11; this.preview.visible = false; scene.add(this.preview);
  }
  setPreview(points, relief) {
    this.preview.geometry.dispose(); this.preview.geometry = new THREE.BufferGeometry().setFromPoints(points.map(p => new THREE.Vector3(p.x, Math.max(this.world.sample(p.x, p.y), this.world.ocean ? this.world.sea : -1) * relief + 2, p.y))); this.preview.visible = points.length > 1;
  }
  update(relief, bounds) {
    const signature = [relief, bounds.minX, bounds.minY, bounds.maxX, bounds.maxY].join(','); let changed = false;
    if (this.revision !== this.world.revision || signature !== this.signature) {
      this.revision = this.world.revision; this.signature = signature; changed = true;
      const positions = [], normals = [], flow = [];
      const vertex = (p, edge, side) => { positions.push(edge.x, p.water * relief + .13, edge.y); flow.push(side, p.along); const nx = p.normalX * relief, nz = p.normalY * relief, length = Math.hypot(nx, 1, nz); normals.push(nx / length, 1 / length, nz / length); };
      for (const river of this.world.rivers) {
        const sections = riverSections(this.world, river);
        for (let i = 1; i < sections.length; i++) {
          const a = sections[i - 1], b = sections[i];
          if (!a.wet || !b.wet || Math.max(a.x, b.x) < bounds.minX || Math.min(a.x, b.x) > bounds.maxX || Math.max(a.y, b.y) < bounds.minY || Math.min(a.y, b.y) > bounds.maxY) continue;
          vertex(a, a.left, -1); vertex(a, a.right, 1); vertex(b, b.left, -1);
          vertex(b, b.left, -1); vertex(a, a.right, 1); vertex(b, b.right, 1);
        }
      }
      this.mesh.geometry.dispose(); this.mesh.geometry = new THREE.BufferGeometry();
      this.mesh.geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); this.mesh.geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3)); this.mesh.geometry.setAttribute('riverFlow', new THREE.Float32BufferAttribute(flow, 2)); this.mesh.geometry.computeBoundingSphere();
    }
    const visible = this.world.riversVisible && this.mesh.geometry.attributes.position?.count > 0;
    if (this.mesh.visible !== visible) { this.mesh.visible = visible; changed = true; }
    const now = performance.now();
    if (visible && now - this.lastFrame >= 33) { this.time.value = now / 1000; this.lastFrame = now; changed = true; }
    return changed;
  }
}
