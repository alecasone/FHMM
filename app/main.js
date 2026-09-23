import { World, History, seedWorld, dab, TILE } from './world.js';
import { MapView } from './map-view.js';
import { SceneView } from './scene-view.js';

const $ = s => document.querySelector(s);
const world = new World(); seedWorld(world);
const history = new History(world);
const map = new MapView($('#map'), world);
let scene;
try { scene = new SceneView($('#scene'), world); } catch (error) { console.error(error); $('.scene-error').hidden = false; }
let tool = 'raise', radius = 56, strength = .45, rotation = 0, mask = null, stroke = null, lastPoint = null, currentPoint = null, space = false, pan = null;
let modifiers = { shift: false, alt: false }, lastTime = 0, toastTimer;
const labels = { raise: 'Raise terrain', lower: 'Lower terrain', flatten: 'Flatten terrain', smooth: 'Smooth terrain', stamp: 'Stamp terrain', pan: 'Pan view' };
function toast(message) { $('#toast').textContent = message; $('#toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').hidden = true, 3500); }
function selectTool(next) { tool = next; document.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('active', b.dataset.tool === tool)); $('#stroke-hint').textContent = tool === 'pan' ? 'Drag to move the view' : tool === 'stamp' ? 'Click to place a heightmap stamp' : `Click and drag to ${tool} terrain`; $('#map').style.cursor = tool === 'pan' ? 'grab' : 'crosshair'; }
document.querySelectorAll('[data-tool]').forEach(b => b.onclick = () => selectTool(b.dataset.tool));
$('#radius').oninput = e => { radius = +e.target.value; $('#radius-value').textContent = radius * 2; };
$('#strength').oninput = e => { strength = +e.target.value / 100; $('#strength-value').textContent = `${e.target.value}%`; };
$('#rotation').oninput = e => { rotation = +e.target.value / 180 * Math.PI; $('#rotation-value').textContent = `${e.target.value}°`; };
function refresh() {
  $('#undo').disabled = !history.cursor; $('#redo').disabled = history.cursor === history.entries.length;
  $('#history-count').textContent = `${history.entries.length.toLocaleString()} / 2,000`;
  $('#history-memory').textContent = `${(history.bytes / 1048576).toFixed(1)} MB of 256 MB${history.trimmed ? ` · ${history.trimmed} oldest steps retired` : ' history budget'}`;
  const list = $('#history-list'); list.replaceChildren();
  const first = Math.max(0, history.cursor - 70), last = Math.min(history.entries.length, first + 140);
  const row = (cursor, title, detail) => { const b = document.createElement('button'); b.className = `history-entry${history.cursor === cursor ? ' current' : ''}${cursor > history.cursor ? ' future' : ''}`; b.dataset.cursor = cursor; const icon = document.createElement('span'); icon.textContent = cursor ? '↳' : '◈'; const body = document.createElement('div'); body.textContent = title; const small = document.createElement('small'); small.textContent = detail; body.append(small); const dot = document.createElement('span'); dot.textContent = cursor === history.cursor ? '●' : ''; b.append(icon, body, dot); b.onclick = () => { history.goTo(cursor); afterHistory(); }; list.append(b); };
  if (!first) row(0, history.trimmed ? 'Oldest retained state' : 'World created', history.trimmed ? 'Earlier steps exceeded the budget' : 'Starting landscape');
  else row(0, 'Go to oldest retained state', 'Jump to the beginning of history');
  for (let i = first; i < last; i++) row(i + 1, history.entries[i].label, `Step ${(i + 1 + history.trimmed).toLocaleString()}`);
  if (last < history.entries.length) row(history.entries.length, 'Go to latest state', `${history.entries.length - last} more steps`);
  const selectedRow = list.querySelector('.current');
  if (selectedRow) list.scrollTop = Math.max(0, selectedRow.offsetTop - list.offsetTop - list.clientHeight + selectedRow.offsetHeight);
  const b = world.bounds; $('#world-size').textContent = `${(b.maxX - b.minX).toLocaleString()} × ${(b.maxY - b.minY).toLocaleString()}`;
  $('#world-stats').textContent = `${world.tiles.size} terrain tiles · ${(world.tiles.size * TILE * TILE * 4 / 1048576).toFixed(1)} MB`;
  $('#sea').value = Math.round(world.sea * 1000); $('#sea-value').textContent = `${Math.round(world.sea * 1000)} m`; $('#ocean').checked = world.ocean; $('#world-name').value = world.name;
}
function changed() { $('#save-status').textContent = 'Unsaved changes'; refresh(); window.dispatchEvent(new Event('world-changed')); }
function afterHistory() { map.invalidate(); scene?.invalidate(); changed(); }
$('#undo').onclick = () => { endStroke(); if (history.undo()) afterHistory(); };
$('#redo').onclick = () => { endStroke(); if (history.redo()) afterHistory(); };
function cursor(point) { currentPoint = point; map.cursor = point && { ...point, radius }; map.needsDraw = true; scene?.cursor(point, radius); if (point) $('#coordinates').textContent = `X ${Math.round(point.x)} · Y ${Math.round(point.y)} · ${Math.round(world.sample(point.x, point.y) * 1000)} m`; }
function paint(point, dt = 1) {
  if (!point || !stroke) return;
  let activeTool = modifiers.shift ? 'smooth' : tool;
  if (modifiers.alt) activeTool = activeTool === 'raise' ? 'lower' : activeTool === 'lower' ? 'raise' : activeTool;
  dab(world, stroke, point.x, point.y, { tool: activeTool, radius, strength, rotation, mask, target: stroke.target, dt });
}
function startStroke(point) { if (!point || !world.inside(point.x, point.y)) return; stroke = history.begin(modifiers.shift ? labels.smooth : labels[tool]); stroke.target = world.sample(point.x, point.y); lastPoint = point; paint(point); }
function endStroke() { if (stroke) { if (history.commit(stroke)) changed(); stroke = null; lastPoint = null; } pan = null; if (scene) scene.controls.enabled = true; }
function bindCanvas(canvas, pointFor, is3D = false) {
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('pointerdown', e => {
    if (e.button !== 0 && !(e.button === 1 && !is3D)) return;
    modifiers = { shift: e.shiftKey, alt: e.altKey }; canvas.setPointerCapture(e.pointerId);
    if (space || tool === 'pan' || e.button === 1) { pan = { x: e.clientX, y: e.clientY, is3D }; if (scene && is3D) scene.controls.enabled = false; return; }
    if (is3D && scene) scene.controls.enabled = false;
    const p = pointFor(e); cursor(p); startStroke(p);
  });
  canvas.addEventListener('pointermove', e => {
    modifiers = { shift: e.shiftKey, alt: e.altKey };
    if (pan) {
      const dx = e.clientX - pan.x, dy = e.clientY - pan.y;
      if (is3D) { const scale = scene.camera.position.distanceTo(scene.controls.target) / 650; scene.focus(scene.controls.target.x - dx * scale, scene.controls.target.z - dy * scale); }
      else { map.center.x -= dx / map.zoom; map.center.y -= dy / map.zoom; map.needsDraw = true; }
      pan.x = e.clientX; pan.y = e.clientY; return;
    }
    const p = pointFor(e); cursor(p);
    if (stroke && p && lastPoint && tool !== 'stamp') {
      const distance = Math.hypot(p.x - lastPoint.x, p.y - lastPoint.y), spacing = Math.max(2, radius * .16), steps = Math.ceil(distance / spacing);
      for (let i = 1; i <= Math.min(steps, 160); i++) paint({ x: lastPoint.x + (p.x - lastPoint.x) * i / Math.min(steps, 160), y: lastPoint.y + (p.y - lastPoint.y) * i / Math.min(steps, 160) }, .65);
      lastPoint = p;
    }
  });
  canvas.addEventListener('pointerup', endStroke); canvas.addEventListener('pointercancel', endStroke); canvas.addEventListener('lostpointercapture', endStroke);
  canvas.addEventListener('pointerleave', () => { if (!stroke) cursor(null); });
}
bindCanvas($('#map'), e => map.point(e)); if (scene) bindCanvas(scene.renderer.domElement, e => scene.point(e), true);
$('#map').addEventListener('wheel', e => { e.preventDefault(); const before = map.point(e); map.zoom = Math.max(.008, Math.min(16, map.zoom * Math.exp(-e.deltaY * .001))); const after = map.point(e); map.center.x += before.x - after.x; map.center.y += before.y - after.y; map.needsDraw = true; }, { passive: false });
function fit() { map.fit(); const b = world.bounds; scene?.focus((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, true); }
$('#fit').onclick = fit; $('#focus').onclick = () => scene?.focus(map.center.x, map.center.y);
document.querySelectorAll('[data-layout]').forEach(b => b.onclick = () => { $('.viewports').dataset.layout = b.dataset.layout; document.querySelectorAll('[data-layout].active').forEach(el => el.classList.remove('active')); b.classList.add('active'); requestAnimationFrame(() => { map.resize(); scene?.resize(); }); });
$('#contours').onchange = e => { map.contours = e.target.checked; map.invalidate(); };
let seaBefore = null;
$('#sea').oninput = e => { seaBefore ??= world.sea; world.sea = +e.target.value / 1000; $('#sea-value').textContent = `${e.target.value} m`; map.invalidate(); scene?.invalidate(); };
$('#sea').onchange = () => { history.metadata('Change sea level', { sea: seaBefore ?? world.sea }, { sea: world.sea }); seaBefore = null; changed(); };
$('#ocean').onchange = e => { const before = world.ocean; world.ocean = e.target.checked; history.metadata(world.ocean ? 'Show ocean' : 'Hide ocean', { ocean: before }, { ocean: world.ocean }); map.invalidate(); scene?.invalidate(); changed(); };
$('#relief').onchange = e => { if (scene) { scene.relief = +e.target.value; scene.invalidate(); } };
$('#expand').onclick = () => { const before = structuredClone(world.bounds); world.expand($('#expand-direction').value); history.metadata('Expand world borders', { bounds: before }, { bounds: structuredClone(world.bounds) }); scene?.syncBounds(); fit(); changed(); toast('Borders expanded. New terrain is ready to paint.'); };
$('#world-name').onchange = e => { world.name = e.target.value.trim() || 'Untitled world'; changed(); };
$('#help').onclick = () => $('#help-dialog').showModal();
window.addEventListener('keydown', e => {
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName) || $('dialog[open]')) return;
  if (e.code === 'Space') { e.preventDefault(); space = true; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); (e.shiftKey ? $('#redo') : $('#undo')).click(); }
  else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); $('#redo').click(); }
  else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); $('#save').click(); }
  else if (!e.ctrlKey && !e.metaKey) { const shortcuts = { r: 'raise', l: 'lower', f: 'flatten', s: 'smooth', t: 'stamp', h: 'pan' }; if (shortcuts[e.key.toLowerCase()]) selectTool(shortcuts[e.key.toLowerCase()]); if (e.key === 'Home') { e.preventDefault(); fit(); } if (e.key === '[' || e.key === ']') { $('#radius').value = radius + (e.key === ']' ? 4 : -4); $('#radius').dispatchEvent(new Event('input')); } }
});
window.addEventListener('keyup', e => { if (e.code === 'Space') space = false; }); window.addEventListener('blur', () => { space = false; endStroke(); });

async function loadBrushes() {
  const response = await fetch('/brushes/manifest.json'); if (!response.ok) throw new Error('Brush library could not load'); const brushes = await response.json();
  $('#brush-count').textContent = `${brushes.length} + 1`;
  for (const category of new Set(brushes.map(b => b.category))) { const option = document.createElement('option'); option.value = category; option.textContent = category; $('#brush-category').append(option); }
  for (const brush of brushes) { const button = document.createElement('button'); button.className = 'brush'; button.dataset.brush = brush.id; button.dataset.category = brush.category; button.title = brush.name; const img = document.createElement('img'); img.src = `/brushes/${brush.id}.png`; img.alt = ''; img.loading = 'lazy'; const label = document.createElement('span'); label.textContent = brush.name; button.append(img, label); $('#brush-grid').append(button); }
  let selection = 0;
  $('#brush-grid').onclick = async e => {
    const button = e.target.closest('[data-brush]'); if (!button) return; const version = ++selection;
    try { let nextMask = null; const brush = brushes.find(b => b.id === button.dataset.brush); if (brush) { const res = await fetch(`/brushes/${brush.id}.bin`); if (!res.ok) throw new Error('Brush could not load'); nextMask = { size: brush.size, data: new Uint16Array(await res.arrayBuffer()) }; } if (version !== selection) return; mask = nextMask; $('#current-brush').textContent = brush?.name ?? 'Soft round'; document.querySelectorAll('[data-brush]').forEach(b => b.classList.toggle('active', b === button)); } catch (error) { toast(error.message); }
  };
  $('#brush-category').onchange = e => document.querySelectorAll('[data-brush]').forEach(b => { b.hidden = b.dataset.brush !== 'round' && e.target.value !== 'all' && b.dataset.category !== e.target.value; });
}
await loadBrushes().catch(e => toast(e.message));
requestAnimationFrame(() => { fit(); refresh(); $('#status').textContent = 'Ready to sculpt'; });
function frame(time) {
  if (stroke && currentPoint && tool !== 'stamp' && time - lastTime > 45) { paint(currentPoint, .7); lastTime = time; }
  if (world.dirty.size) { const keys = [...world.dirty]; world.dirty.clear(); map.invalidate(keys); scene?.invalidate(keys); }
  map.draw(); scene?.draw(); requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
// Persistence and file interchange are initialized separately from the painting loop.
export { world, history, map, scene, refresh, changed, toast, endStroke, fit, afterHistory };
import('./persistence.js').catch(error => toast(`File storage unavailable: ${error.message}`));
