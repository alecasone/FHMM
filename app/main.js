import { World, History, seedWorld, dab, TILE, resetWorld } from './world.js';
import { BIOMES, BIOME_COUNT } from './biomes.js';
import { renderViews } from './render-loop.js';
import { StrokePath, accumulatesWhileHeld } from './brush-stroke.js';
import { MapView } from './map-view.js';
import { SceneView } from './scene-view.js';

const $ = s => document.querySelector(s);
const world = new World(); seedWorld(world);
const history = new History(world);
const map = new MapView($('#map'), world);
let scene;
try { scene = new SceneView($('#scene'), world); } catch (error) { console.error(error); $('.scene-error').hidden = false; }
let tool = 'raise', biome = 0, radius = 56, strength = .45, rotation = 0, brushMode = 'blend', strokeHeight = .3, mask = null, stroke = null, strokePath = null, currentPoint = null, space = false, pan = null;
let modifiers = { shift: false, alt: false }, lastTime = 0, toastTimer;
const labels = { raise: 'Raise terrain', lower: 'Lower terrain', flatten: 'Flatten terrain', smooth: 'Smooth terrain', stamp: 'Stamp terrain', pan: 'Pan view', paint: 'Paint biome', erase: 'Restore natural color' };
function toast(message) { $('#toast').textContent = message; $('#toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').hidden = true, 3500); }
function brushSettings() {
  const sculpt = ['raise', 'lower', 'stamp'].includes(tool), blend = brushMode === 'blend';
  $('#buildup-settings').hidden = !sculpt; $('#stroke-height-control').hidden = !blend;
  $('#buildup-note').textContent = blend ? `Up to ${Math.round(strokeHeight * strength * 1000)} m per stroke at this strength. Overlap stays even; release to build another layer.` : tool === 'stamp' ? 'Each click places one heightmap from the sampled height. Blend applies a gentler layer.' : 'Height keeps building as you drag or hold. Use Blend for controlled layers.';
}
function selectTool(next) {
  endStroke(); tool = next; const painting = tool === 'paint' || tool === 'erase';
  $('#sculpt-tools').hidden = painting; $('#biome-tools').hidden = !painting;
  $('#modifier-hint').textContent = painting ? 'Erase paint temporarily' : 'Smooth temporarily';
  document.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('active', b.dataset.mode === (painting ? 'paint' : 'sculpt')));
  document.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('active', b.dataset.tool === tool));
  $('#stroke-hint').textContent = tool === 'paint' ? `Paint ${BIOMES[biome].name.toLowerCase()} · Shift to erase` : tool === 'erase' ? 'Remove biome paint to restore natural coloring' : tool === 'pan' ? 'Drag to move the view' : tool === 'stamp' ? 'Click to place a heightmap stamp' : `Click and drag to ${tool} terrain`;
  $('#map').style.cursor = tool === 'pan' ? 'grab' : 'crosshair';
  brushSettings();
}
document.querySelectorAll('[data-tool]').forEach(b => b.onclick = () => selectTool(b.dataset.tool));
document.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => selectTool(b.dataset.mode === 'paint' ? 'paint' : 'raise'));
BIOMES.forEach((preset, index) => { const button = document.createElement('button'); button.dataset.biome = preset.id; button.className = `biome-swatch${index === biome ? ' active' : ''}`; button.title = `Paint ${preset.name.toLowerCase()}`; const swatch = document.createElement('i'); swatch.style.backgroundColor = preset.color; const label = document.createElement('span'); label.textContent = preset.name; button.append(swatch, label); button.onclick = () => { biome = index; selectTool('paint'); document.querySelectorAll('[data-biome]').forEach(b => b.classList.toggle('active', b === button)); }; $('#biome-palette').append(button); });
$('#radius').oninput = e => { endStroke(); radius = +e.target.value; $('#radius-value').textContent = radius * 2; };
$('#strength').oninput = e => { endStroke(); strength = +e.target.value / 100; $('#strength-value').textContent = `${e.target.value}%`; brushSettings(); };
$('#rotation').oninput = e => { endStroke(); rotation = +e.target.value / 180 * Math.PI; $('#rotation-value').textContent = `${e.target.value}°`; };
$('#brush-mode').onchange = e => { endStroke(); brushMode = e.target.value; brushSettings(); };
$('#stroke-height').oninput = e => { endStroke(); strokeHeight = +e.target.value / 1000; $('#stroke-height-value').textContent = `${e.target.value} m`; brushSettings(); };
brushSettings();
function refresh() {
  $('#undo').disabled = !history.cursor; $('#redo').disabled = history.cursor === history.entries.length;
  $('#history-count').textContent = `${history.entries.length.toLocaleString()} / 2,000`;
  $('#history-memory').textContent = `${(history.bytes / 1048576).toFixed(1)} MB of 256 MB${history.trimmed ? ` · ${history.trimmed} oldest steps retired` : ' history budget'}`;
  const list = $('#history-list'); list.replaceChildren();
  const first = Math.max(0, history.cursor - 70), last = Math.min(history.entries.length, first + 140);
  const row = (cursor, title, detail) => { const b = document.createElement('button'); b.className = `history-entry${history.cursor === cursor ? ' current' : ''}${cursor > history.cursor ? ' future' : ''}`; b.dataset.cursor = cursor; const icon = document.createElement('span'); icon.textContent = cursor ? '↳' : '◈'; const body = document.createElement('div'); body.textContent = title; const small = document.createElement('small'); small.textContent = detail; body.append(small); const dot = document.createElement('span'); dot.textContent = cursor === history.cursor ? '●' : ''; b.append(icon, body, dot); b.onclick = () => { endStroke(); history.goTo(cursor); afterHistory(); }; list.append(b); };
  if (!first) row(0, history.trimmed ? 'Oldest retained state' : 'World created', history.trimmed ? 'Earlier steps exceeded the budget' : 'Starting landscape');
  else row(0, 'Go to oldest retained state', 'Jump to the beginning of history');
  for (let i = first; i < last; i++) row(i + 1, history.entries[i].label, `Step ${(i + 1 + history.trimmed).toLocaleString()}`);
  if (last < history.entries.length) row(history.entries.length, 'Go to latest state', `${history.entries.length - last} more steps`);
  const selectedRow = list.querySelector('.current');
  if (selectedRow) list.scrollTop = Math.max(0, selectedRow.offsetTop - list.offsetTop - list.clientHeight + selectedRow.offsetHeight);
  const b = world.bounds; $('#world-size').textContent = `${(b.maxX - b.minX).toLocaleString()} × ${(b.maxY - b.minY).toLocaleString()}`;
  $('#world-stats').textContent = `${world.tiles.size} terrain tiles · ${((world.tiles.size * 4 + world.biomes.size * BIOME_COUNT) * TILE * TILE / 1048576).toFixed(1)} MB`;
  $('#sea').value = Math.round(world.sea * 1000); $('#sea-value').textContent = `${Math.round(world.sea * 1000)} m`; $('#ocean').checked = world.ocean; $('#world-name').value = world.name;
  $('#biomes-visible').checked = world.biomesVisible;
}
function changed() { $('#save-status').textContent = 'Unsaved changes'; refresh(); window.dispatchEvent(new Event('world-changed')); }
function afterHistory() { map.invalidate(); scene?.invalidate(); if (history.entries[history.cursor]?.reset || history.entries[history.cursor - 1]?.reset) resetViews(false); changed(); }
$('#undo').onclick = () => { endStroke(); if (history.undo()) afterHistory(); };
$('#redo').onclick = () => { endStroke(); if (history.redo()) afterHistory(); };
function cursor(point) { currentPoint = point; map.cursor = point && { ...point, radius }; map.needsDraw = true; scene?.cursor(point, radius); if (point) $('#coordinates').textContent = `X ${Math.round(point.x)} · Y ${Math.round(point.y)} · ${Math.round(world.sample(point.x, point.y) * 1000)} m`; }
function activeTool() {
  let activeTool = modifiers.shift ? (tool === 'paint' || tool === 'erase' ? 'erase' : 'smooth') : tool;
  if (modifiers.alt) activeTool = activeTool === 'raise' ? 'lower' : activeTool === 'lower' ? 'raise' : activeTool;
  return activeTool;
}
function paint(point, dt = 1) {
  if (!point || !stroke) return;
  dab(world, stroke, point.x, point.y, { tool: activeTool(), radius, strength, rotation, mask, target: stroke.target, dt, biome, mode: brushMode, strokeHeight });
}
function startStroke(point) { if (!point || !world.inside(point.x, point.y)) return; const painting = tool === 'paint' || tool === 'erase'; if (painting && !world.biomesVisible) { toast('Show the Biomes layer before painting.'); return; } const label = modifiers.shift ? labels[painting ? 'erase' : 'smooth'] : tool === 'paint' ? `Paint ${BIOMES[biome].name.toLowerCase()}` : labels[tool]; stroke = history.begin(`${label}${brushMode === 'blend' && ['raise', 'lower', 'stamp'].includes(activeTool()) ? ' · Blend' : ''}`); stroke.target = world.sample(point.x, point.y); strokePath = new StrokePath(point, Math.max(2, radius * .16)); lastTime = performance.now(); paint(point); }
function endStroke() { if (stroke) { if (history.commit(stroke)) changed(); stroke = null; strokePath = null; } pan = null; if (scene) scene.controls.enabled = true; }
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
    if (stroke && p && strokePath && activeTool() !== 'stamp' && strokePath.move(p, point => paint(point, .65))) lastTime = performance.now();
  });
  canvas.addEventListener('pointerup', endStroke); canvas.addEventListener('pointercancel', endStroke); canvas.addEventListener('lostpointercapture', endStroke);
  canvas.addEventListener('pointerleave', () => { if (!stroke) cursor(null); });
}
bindCanvas($('#map'), e => map.point(e)); if (scene) bindCanvas(scene.renderer.domElement, e => scene.point(e), true);
$('#map').addEventListener('wheel', e => { e.preventDefault(); const before = map.point(e); if (!before) return; map.zoom = Math.max(.000001, Math.min(16, map.zoom * Math.exp(-e.deltaY * .001))); const after = map.point(e); map.center.x += before.x - after.x; map.center.y += before.y - after.y; map.needsDraw = true; }, { passive: false });
function fit() { map.resize(); map.fit(); const b = world.bounds; scene?.resize(); scene?.focus((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, true); }
function resetViews(notify = true) { endStroke(); currentPoint = null; map.reset(); scene?.reset(); fit(); $('.scene-error').hidden = !!scene && !scene.contextLost; $('#coordinates').textContent = 'X 0 · Y 0'; $('#status').textContent = 'Ready to sculpt'; if (notify) toast('Views rebuilt. Your terrain and paint are unchanged.'); }
$('#reset-views').onclick = () => resetViews();
$('#reset-world').onclick = () => { endStroke(); $('#reset-dialog').showModal(); };
document.querySelectorAll('[data-reset]').forEach(button => button.onclick = () => { endStroke(); resetWorld(world, history, button.dataset.reset); $('#reset-dialog').close(); resetViews(false); changed(); toast('World reset. Undo restores the previous terrain and paint.'); });
$('#fit').onclick = fit; $('#focus').onclick = () => scene?.focus(map.center.x, map.center.y);
document.querySelectorAll('[data-layout]').forEach(b => b.onclick = () => { endStroke(); cursor(null); $('.viewports').dataset.layout = b.dataset.layout; document.querySelectorAll('[data-layout].active').forEach(el => el.classList.remove('active')); b.classList.add('active'); requestAnimationFrame(() => { map.resize(); scene?.resize(); }); });
$('#contours').onchange = e => { map.contours = e.target.checked; map.invalidate(); };
let seaBefore = null;
$('#sea').oninput = e => { seaBefore ??= world.sea; world.sea = +e.target.value / 1000; $('#sea-value').textContent = `${e.target.value} m`; map.invalidate(); scene?.invalidate(); };
$('#sea').onchange = () => { history.metadata('Change sea level', { sea: seaBefore ?? world.sea }, { sea: world.sea }); seaBefore = null; changed(); };
$('#ocean').onchange = e => { const before = world.ocean; world.ocean = e.target.checked; history.metadata(world.ocean ? 'Show ocean' : 'Hide ocean', { ocean: before }, { ocean: world.ocean }); map.invalidate(); scene?.invalidate(); changed(); };
$('#biomes-visible').onchange = e => { const before = world.biomesVisible; world.biomesVisible = e.target.checked; history.metadata(world.biomesVisible ? 'Show biome paint' : 'Hide biome paint', { biomesVisible: before }, { biomesVisible: world.biomesVisible }); map.invalidate(); scene?.invalidate(); changed(); };
for (const field of ['sun-elevation', 'sun-azimuth']) $(`#${field}`).oninput = e => { $(`#${field}-value`).textContent = `${e.target.value}°`; if (scene) { scene[field === 'sun-elevation' ? 'sunElevation' : 'sunAzimuth'] = +e.target.value; scene.updateSun(); } };
$('#shadows').onchange = e => { if (scene) { scene.sun.castShadow = e.target.checked; scene.needsDraw = true; } };
$('#relief').onchange = e => { if (scene) { scene.relief = +e.target.value; scene.invalidate(); } };
$('#expand').onclick = () => { endStroke(); const before = structuredClone(world.bounds); world.expand($('#expand-direction').value); history.metadata('Expand world borders', { bounds: before }, { bounds: structuredClone(world.bounds) }); scene?.syncBounds(); fit(); changed(); toast('Borders expanded. New terrain is ready to paint.'); };
$('#world-name').onchange = e => { world.name = e.target.value.trim() || 'Untitled world'; changed(); };
$('#help').onclick = () => $('#help-dialog').showModal();
window.addEventListener('keydown', e => {
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName) || $('dialog[open]')) return;
  if (e.code === 'Space') { e.preventDefault(); space = true; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); (e.shiftKey ? $('#redo') : $('#undo')).click(); }
  else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); $('#redo').click(); }
  else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); $('#save').click(); }
  else if (!e.ctrlKey && !e.metaKey) { const shortcuts = { r: 'raise', l: 'lower', f: 'flatten', s: 'smooth', t: 'stamp', h: 'pan', b: 'paint', e: 'erase' }; if (shortcuts[e.key.toLowerCase()]) selectTool(shortcuts[e.key.toLowerCase()]); if (e.key === 'Home') { e.preventDefault(); fit(); } if (e.key === '[' || e.key === ']') { $('#radius').value = radius + (e.key === ']' ? 4 : -4); $('#radius').dispatchEvent(new Event('input')); } }
});
window.addEventListener('keyup', e => { if (e.code === 'Space') space = false; }); window.addEventListener('blur', () => { space = false; endStroke(); });

async function loadBrushes() {
  const response = await fetch('/brushes/manifest.json'); if (!response.ok) throw new Error('Brush library could not load'); const brushes = await response.json();
  $('#brush-count').textContent = `${brushes.length} + 1`;
  for (const category of new Set(brushes.map(b => b.category))) { const option = document.createElement('option'); option.value = category; option.textContent = category; $('#brush-category').append(option); }
  for (const brush of brushes) { const button = document.createElement('button'); button.className = 'brush'; button.dataset.brush = brush.id; button.dataset.category = brush.category; button.title = brush.name; const img = document.createElement('img'); img.src = `/brushes/${brush.id}.png`; img.alt = ''; img.loading = 'lazy'; const label = document.createElement('span'); label.textContent = brush.name; button.append(img, label); $('#brush-grid').append(button); }
  let selection = 0;
  $('#brush-grid').onclick = async e => {
    const button = e.target.closest('[data-brush]'); if (!button) return; endStroke(); const version = ++selection;
    try { let nextMask = null; const brush = brushes.find(b => b.id === button.dataset.brush); if (brush) { const res = await fetch(`/brushes/${brush.id}.bin`); if (!res.ok) throw new Error('Brush could not load'); nextMask = { size: brush.size, data: new Uint16Array(await res.arrayBuffer()) }; } if (version !== selection) return; mask = nextMask; $('#current-brush').textContent = brush?.name ?? 'Soft round'; document.querySelectorAll('[data-brush]').forEach(b => b.classList.toggle('active', b === button)); } catch (error) { toast(error.message); }
  };
  $('#brush-category').onchange = e => document.querySelectorAll('[data-brush]').forEach(b => { b.hidden = b.dataset.brush !== 'round' && e.target.value !== 'all' && b.dataset.category !== e.target.value; });
}
await loadBrushes().catch(e => toast(e.message));
requestAnimationFrame(() => { fit(); refresh(); $('#status').textContent = 'Ready to sculpt'; });
function frame(time) {
  requestAnimationFrame(frame);
  if (stroke && currentPoint && accumulatesWhileHeld(activeTool(), brushMode) && time - lastTime > 45) { paint(currentPoint, .7); lastTime = time; }
  if (world.dirty.size) { const keys = [...world.dirty]; world.dirty.clear(); map.invalidate(keys); scene?.invalidate(keys); }
  renderViews([['2D', map], ['3D', scene]], (name, error) => { console.error(`${name} view:`, error); $('#status').textContent = `${name} paused · use Reset views`; toast(`${name} view paused. Use Reset views to rebuild it; your work is retained.`); });
}
requestAnimationFrame(frame);
// Persistence and file interchange are initialized separately from the painting loop.
$('#scene').addEventListener('view-error', e => { $('.scene-error').hidden = false; $('.scene-error').textContent = e.detail; });
export { world, history, map, scene, refresh, changed, toast, endStroke, fit, afterHistory, resetViews };
import('./persistence.js').catch(error => toast(`File storage unavailable: ${error.message}`));
