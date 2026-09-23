import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TILE, keyOf, terrainColor, clamp } from './world.js';
export class SceneView {
  constructor(container, world) {
    this.world = world; this.container = container; this.relief = 180; this.meshes = new Map(); this.pending = new Set(); this.needsDraw = true;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false }); this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75)); this.renderer.setClearColor('#12232e'); this.renderer.outputColorSpace = THREE.SRGBColorSpace; container.appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene(); this.scene.fog = new THREE.Fog('#12232e', 1800, 4200);
    this.camera = new THREE.PerspectiveCamera(40, 1, 1, 15000); this.camera.position.set(850, 950, 1000);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement); this.controls.target.set(0, 0, 0); this.controls.enableDamping = false; this.controls.minDistance = 60; this.controls.maxDistance = 4500; this.controls.maxPolarAngle = Math.PI * .47; this.controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE }; this.controls.touches = { ONE: null, TWO: THREE.TOUCH.DOLLY_PAN }; this.controls.addEventListener('change', () => { this.needsDraw = true; }); this.controls.update();
    this.scene.add(new THREE.HemisphereLight('#e0efff', '#4a5944', 2.0)); const sun = new THREE.DirectionalLight('#fff3d2', 2.3); sun.position.set(-400, 900, -350); this.scene.add(sun);
    this.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .96, metalness: 0, side: THREE.DoubleSide });
    this.water = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({ color: '#347887', transparent: true, opacity: .78, roughness: .33, metalness: .15, depthWrite: false, side: THREE.DoubleSide })); this.water.rotation.x = -Math.PI / 2; this.water.renderOrder = 2; this.scene.add(this.water);
    this.outline = new THREE.LineLoop(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: '#8bb2ad', transparent: true, opacity: .28 })); this.scene.add(this.outline);
    const ringPositions = new Float32Array(97 * 3); this.ring = new THREE.Line(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(ringPositions, 3)), new THREE.LineBasicMaterial({ color: '#edffc0', depthTest: false, transparent: true, opacity: .95 })); this.ring.frustumCulled = false; this.ring.renderOrder = 10; this.ring.visible = false; this.scene.add(this.ring);
    this.ray = new THREE.Raycaster(); this.pointer = new THREE.Vector2(); this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(container); this.resize(); this.syncBounds();
  }
  resize() { const w = this.container.clientWidth, h = this.container.clientHeight; if (!w || !h) return; this.renderer.setSize(w, h); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.needsDraw = true; }
  syncBounds() {
    const b = this.world.bounds, x = (b.minX + b.maxX) / 2, z = (b.minY + b.maxY) / 2;
    this.water.position.set(x, this.world.sea * this.relief + .12, z); this.water.scale.set(b.maxX - b.minX, b.maxY - b.minY, 1); this.water.visible = this.world.ocean;
    const y = this.world.sea * this.relief + .4;
    this.outline.geometry.dispose(); this.outline.geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(b.minX, y, b.minY), new THREE.Vector3(b.maxX, y, b.minY), new THREE.Vector3(b.maxX, y, b.maxY), new THREE.Vector3(b.minX, y, b.maxY)]); this.needsDraw = true;
  }
  focus(x, y, fit = false) {
    const old = this.controls.target.clone(), b = this.world.bounds;
    this.controls.target.set(x, 0, y);
    if (fit) { const size = Math.min(1536, Math.max(b.maxX - b.minX, b.maxY - b.minY)); this.camera.position.set(x + size * .72, size * .82, y + size * .87); }
    else this.camera.position.add(this.controls.target.clone().sub(old));
    this.controls.update(); this.needsDraw = true;
  }
  invalidate(keys) { for (const key of keys ?? this.meshes.keys()) if (this.meshes.has(key)) this.pending.add(key); this.syncBounds(); }
  build(key, tx, ty) {
    let mesh = this.meshes.get(key); const step = 4, count = TILE / step + 1;
    if (!mesh) {
      const geo = new THREE.PlaneGeometry(TILE, TILE, count - 1, count - 1); geo.rotateX(-Math.PI / 2); geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(count * count * 3), 3));
      mesh = new THREE.Mesh(geo, this.material); mesh.position.set(tx * TILE + TILE / 2, 0, ty * TILE + TILE / 2); this.meshes.set(key, mesh); this.scene.add(mesh);
    }
    const pos = mesh.geometry.attributes.position, col = mesh.geometry.attributes.color; const color = new THREE.Color();
    for (let y = 0; y < count; y++) for (let x = 0; x < count; x++) {
      const wx = Math.min(this.world.bounds.maxX - 1, tx * TILE + x * step), wy = Math.min(this.world.bounds.maxY - 1, ty * TILE + y * step), h = this.world.get(wx, wy), i = y * count + x;
      pos.setY(i, h * this.relief);
      const rgb = terrainColor(h, this.world.sea, this.world.ocean); color.setRGB(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, THREE.SRGBColorSpace); col.setXYZ(i, color.r, color.g, color.b);
    }
    pos.needsUpdate = true; col.needsUpdate = true; mesh.geometry.computeVertexNormals(); mesh.geometry.computeBoundingSphere(); this.pending.delete(key);
  }
  point(event) {
    const r = this.renderer.domElement.getBoundingClientRect(); this.pointer.set((event.clientX - r.left) / r.width * 2 - 1, -(event.clientY - r.top) / r.height * 2 + 1); this.ray.setFromCamera(this.pointer, this.camera);
    const hits = this.ray.intersectObjects([...this.meshes.values()], false);
    const p = hits[0]?.point || this.ray.ray.intersectPlane(this.plane, new THREE.Vector3());
    return p ? { x: p.x, y: p.z } : null;
  }
  cursor(point, radius) {
    this.ring.visible = !!point;
    if (point) { const pos = this.ring.geometry.attributes.position; for (let i = 0; i < pos.count; i++) { const a = i / (pos.count - 1) * Math.PI * 2, x = point.x + Math.cos(a) * radius, z = point.y + Math.sin(a) * radius; pos.setXYZ(i, x, Math.max(this.world.sample(x, z) * this.relief, this.world.ocean ? this.world.sea * this.relief : -Infinity) + 1, z); } pos.needsUpdate = true; }
    this.needsDraw = true;
  }
  draw() {
    if (!this.container.clientWidth) return;
    const b = this.world.bounds;
    const tx = Math.floor(clamp(this.controls.target.x, b.minX, b.maxX - 1) / TILE), ty = Math.floor(clamp(this.controls.target.z, b.minY, b.maxY - 1) / TILE);
    const wanted = new Set(); let updated = 0;
    for (let y = Math.max(b.minY / TILE, ty - 6); y < Math.min(b.maxY / TILE, ty + 6); y++) for (let x = Math.max(b.minX / TILE, tx - 6); x < Math.min(b.maxX / TILE, tx + 6); x++) {
      const key = keyOf(x, y); wanted.add(key);
      if ((!this.meshes.has(key) || this.pending.has(key)) && updated < 8) { this.build(key, x, y); updated++; this.needsDraw = true; }
    }
    for (const [key, mesh] of this.meshes) if (!wanted.has(key)) { this.scene.remove(mesh); mesh.geometry.dispose(); this.meshes.delete(key); this.pending.delete(key); this.needsDraw = true; }
    if (this.needsDraw) { this.renderer.render(this.scene, this.camera); this.needsDraw = false; }
  }
}
