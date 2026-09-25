import { objectIcon } from './object-icons.js';
import { World, History, seedWorld, dab, TILE, resetWorld } from './world.js';
import { BIOMES, BIOME_COUNT } from './biomes.js';
import { pickBiome, nearestBiome } from './biome-picker.js';
import { renderViews } from './render-loop.js';
import { StrokePath, accumulatesWhileHeld } from './brush-stroke.js';
import { MapView } from './map-view.js';
import { SceneView } from './scene-view.js';
import { addRiver, carveRiver } from './rivers.js';
import { initWorkspaceUI } from './workspace-ui.js';
import { OBJECT_TYPES, objectLimit, objectType, isObjectTool, scatterObjects, placeObject, eraseObjects } from './objects.js';

const $ = s => document.querySelector(s);
const world = new World(); seedWorld(world);
const history = new History(world);
const map = new MapView($('#map'), world);
let scene;
try { scene = new SceneView($('#scene'), world); } catch (error) { console.error(error); $('.scene-error').hidden = false; }
let tool = 'raise', biome = 0, radius = 56, strength = .45, rotation = 0, brushMode = 'blend', strokeHeight = .3, mask = null, stroke = null, strokePath = null, currentPoint = null, space = false, pan = null;
let modifiers = { shift: false, alt: false }, lastTime = 0, toastTimer;
let rotateBrushHeld = false, rotateBrushUsed = false;
let syncWorkspaceLimits = () => {};
let customColor = null;
const colorHex = rgb => '#' + rgb.map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
const paintName = () => customColor ? 'custom ' + colorHex(customColor) : BIOMES[biome].name.toLowerCase();
let brushPreviewEnabled = true, previewOpacity = .36, pickingBiome = false;
try { const saved = localStorage.getItem("fmm-preview-opacity"); if (saved !== null && Number.isFinite(+saved)) previewOpacity = Math.max(0, Math.min(1, +saved)); } catch {}
try { brushPreviewEnabled = localStorage.getItem('fmm-brush-preview-v1') !== 'false'; } catch { /* Preview remains enabled when browser storage is unavailable. */ }
let riverGuide = null, riverWidth = 18, riverDepth = .03, riverNatural = true;
let objectKind = 'pine', objectRadius = 56, objectDensity = .5, objectScale = 1, objectVariation = .25, objectEraseFilter = 'all';
const labels = { raise: 'Raise terrain', lower: 'Lower terrain', flatten: 'Flatten terrain', smooth: 'Smooth terrain', meld: 'Meld terrain', stamp: 'Stamp terrain', pan: 'Pan view', paint: 'Paint biome', erase: 'Restore natural color', river: 'Carve river', scatter: 'Scatter objects', 'place-object': 'Place object', 'erase-object': 'Erase objects' };
function toast(message) { $('#toast').textContent = message; $('#toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').hidden = true, 3500); }
function brushSettings() {
  const sculpt = ['raise', 'lower', 'stamp'].includes(tool), blend = brushMode === 'blend';
  const objects = isObjectTool(tool);
  $('#river-settings').hidden = tool !== 'river'; $('#standard-settings').hidden = tool === 'river' || objects;
  $('#object-settings').hidden = !objects; $('#object-radius-control').hidden = tool === 'place-object';
  $('#object-placement-settings').hidden = tool === 'erase-object'; $('#object-density-control').hidden = tool !== 'scatter'; $('#object-erase-control').hidden = !objects;
  $('#object-brush-note').textContent = tool === 'place-object' ? 'One object per click, centered on the cursor. Hold Shift to use the area eraser.' : tool === 'erase-object' ? 'Drag to erase object anchors inside the circle. Terrain and biome paint stay intact.' : 'Drag to splatter objects on land. Overlap stays spaced. Hold Shift to erase.';
  $('.brush-section').hidden = tool === 'river' || tool === 'meld' || objects; $('.brush-current').hidden = tool === 'river' || tool === 'meld' || objects;
  $('#panel-brush-advanced').hidden = tool === 'meld'; $('#meld-note').hidden = tool !== 'meld'; $('.canvas-bottom').classList.toggle('river-mode', tool === 'river'); $('.canvas-bottom').classList.toggle('objects-mode', objects);
  $('#buildup-settings').hidden = !sculpt; $('#stroke-height-control').hidden = !blend;
  $('#buildup-note').textContent = blend ? `Up to ${+(strokeHeight * strength * 1000).toFixed(2)} m per stroke at this strength. Overlap stays even; release to build another layer.` : tool === 'stamp' ? 'Each click places one heightmap from the sampled height. Blend applies a gentler layer.' : 'Height keeps building as you drag or hold. Use Blend for controlled layers.';
}
function selectTool(next) {
  endStroke(); setBiomePicking(false); tool = next; const painting = tool === 'paint' || tool === 'erase', objects = isObjectTool(tool);
  $('#sculpt-tools').hidden = painting || objects; $('#biome-tools').hidden = !painting; $('#object-tools').hidden = !objects;
  $('#modifier-hint').textContent = objects ? 'Erase objects temporarily' : painting ? 'Erase paint temporarily' : 'Smooth temporarily';
  document.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('active', b.dataset.mode === (objects ? 'objects' : painting ? 'paint' : 'sculpt')));
  document.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('active', b.dataset.tool === tool));
  $('#stroke-hint').textContent = tool === 'river' ? 'Sketch from source to outlet · release to carve' : tool === 'paint' ? `Paint ${paintName()} · Shift to erase` : tool === 'erase' ? 'Remove biome paint to restore natural coloring' : tool === 'pan' ? 'Drag to move the view' : tool === 'stamp' ? 'Click to place a heightmap stamp' : `Click and drag to ${tool} terrain`;
  if (objects) $('#stroke-hint').textContent = tool === 'erase-object' ? 'Drag to erase objects in the circle' : `${tool === 'scatter' ? 'Drag to scatter' : 'Click to place one'} · ${objectType(objectKind).name.toLowerCase()}`;
  $('#map').style.cursor = tool === 'pan' ? 'grab' : 'crosshair';
  brushSettings();
  $('#panel-brush').open = true;
  cursor(currentPoint);
}
document.querySelectorAll('[data-tool]').forEach(b => b.onclick = () => selectTool(b.dataset.tool));
document.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => selectTool(b.dataset.mode === 'objects' ? 'scatter' : b.dataset.mode === 'paint' ? 'paint' : 'raise'));
for (const type of OBJECT_TYPES) {
  const button = document.createElement('button'); button.className = `object-swatch${type.id === objectKind ? ' active' : ''}`; button.dataset.object = type.id; button.dataset.category = type.category; button.title = type.name + ' · ' + type.category; button.setAttribute('aria-pressed', String(type.id === objectKind));
  button.innerHTML = `<svg viewBox="0 0 48 42" aria-hidden="true">${objectIcon(type)}</svg><span>${type.name}</span>`;
  button.onclick = () => { endStroke(); objectKind = type.id; document.querySelectorAll('[data-object]').forEach(b => { b.classList.toggle('active', b === button); b.setAttribute('aria-pressed', String(b === button)); }); selectTool(isObjectTool(tool) ? tool : 'scatter'); };
  $('#object-palette').append(button);
}
for (const category of [...new Set(OBJECT_TYPES.map(type => type.category))]) {
  const option = document.createElement('option'); option.value = category; option.textContent = category;
  $('#object-category').append(option);
}
$('#object-category').onchange = e => {
  document.querySelectorAll('[data-object]').forEach(button => { button.hidden = e.target.value !== 'all' && button.dataset.category !== e.target.value; });
}
for (const field of ['radius', 'density', 'scale', 'variation']) $(`#object-${field}`).oninput = e => {
  endStroke(); const value = +e.target.value;
  if (field === 'radius') objectRadius = value; else if (field === 'density') objectDensity = value / 100; else if (field === 'scale') objectScale = value / 100; else objectVariation = value / 100;
  $(`#object-${field}-value`).textContent = field === 'radius' ? value * 2 : `${value}%`; cursor(currentPoint);
};
$('#object-erase-filter').onchange = e => { endStroke(); objectEraseFilter = e.target.value; };
BIOMES.forEach((preset, index) => { const button = document.createElement('button'); button.dataset.biome = preset.id; button.className = `biome-swatch${index === biome ? ' active' : ''}`; button.title = preset.id === 'water' ? 'Paint water or river surfaces' : 'Paint ' + preset.name.toLowerCase(); const swatch = document.createElement('i'); swatch.style.backgroundColor = preset.color; const label = document.createElement('span'); label.textContent = preset.name; button.append(swatch, label); button.onclick = () => chooseBiome(index); $('#biome-palette').append(button); });
function setBiomePicking(enabled) {
  pickingBiome = enabled;
  cursor(currentPoint);
  $('#pick-biome').classList.toggle('active', enabled);
  $('#pick-biome').setAttribute('aria-pressed', String(enabled));
  $('#pick-biome').textContent = enabled ? 'Click terrain · Esc cancels' : 'Pick from terrain';
}
function chooseBiome(index, { syncColor = true } = {}) {
  customColor = null; biome = index; selectTool('paint');
  document.querySelectorAll('[data-biome]').forEach(button => button.classList.toggle('active', button.dataset.biome === BIOMES[index].id));
  if (syncColor) $('#biome-color-match').value = BIOMES[index].color;
  $('#biome-color-result').textContent = 'Painting biome: ' + BIOMES[index].name;
}
$('#pick-biome').onclick = () => { endStroke(); setBiomePicking(!pickingBiome); };
function chooseCustomColor(rgb) {
  endStroke(); customColor = rgb.slice(); selectTool('paint');
  document.querySelectorAll('[data-biome]').forEach(button => button.classList.remove('active'));
  $('#biome-color-result').textContent = 'Painting custom color ' + colorHex(customColor);
}
$('#biome-color-match').onchange = e => {
  const hex = e.target.value;
  chooseCustomColor([1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)));
};
$('#use-custom-color').onclick = () => {
  const hex = $('#biome-color-match').value;
  chooseCustomColor([1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)));
};
$('#match-biome').onclick = () => {
  const hex = $('#biome-color-match').value;
  chooseBiome(nearestBiome([1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))), { syncColor: false });
};
$('#preview-opacity').value = Math.round(previewOpacity * 100);
$('#preview-opacity-value').textContent = Math.round(previewOpacity * 100) + '%';
$('#preview-opacity').oninput = e => {
  previewOpacity = +e.target.value / 100; $('#preview-opacity-value').textContent = e.target.value + '%';
  try { localStorage.setItem('fmm-preview-opacity', String(previewOpacity)); } catch {}
  cursor(currentPoint);
};
$('#radius').oninput = e => { endStroke(); radius = +e.target.value; $('#radius-value').textContent = radius * 2; cursor(currentPoint); };
$('#strength').oninput = e => { endStroke(); strength = +e.target.value / 100; $('#strength-value').textContent = `${e.target.value}%`; brushSettings(); };
$('#rotation').oninput = e => { endStroke(); rotation = +e.target.value / 180 * Math.PI; cursor(currentPoint); $('#rotation-value').textContent = `${e.target.value}°`; };
$('#brush-preview').checked = brushPreviewEnabled; $('#brush-preview').onchange = e => { brushPreviewEnabled = e.target.checked; try { localStorage.setItem('fmm-brush-preview-v1', String(brushPreviewEnabled)); } catch { /* Preference remains active for this session. */ } cursor(currentPoint); };
$('#brush-mode').onchange = e => { endStroke(); brushMode = e.target.value; brushSettings(); };
$('#stroke-height').oninput = e => { endStroke(); strokeHeight = +e.target.value / 1000; $('#stroke-height-value').textContent = `${e.target.value} m`; brushSettings(); };
brushSettings();
$('#river-width').oninput = e => { endStroke(); riverWidth = +e.target.value; $('#river-width-value').textContent = `${riverWidth} samples`; };
$('#river-depth').oninput = e => { endStroke(); riverDepth = +e.target.value / 1000; $('#river-depth-value').textContent = `${e.target.value} m`; };
$('#river-natural').onchange = e => { endStroke(); riverNatural = e.target.checked; };
$('#recarve-rivers').onclick = () => { endStroke(); if (!world.rivers.length) return; const edit = history.begin('Recarve river channels'); for (const river of world.rivers) carveRiver(world, edit, river); if (history.commit(edit)) changed(); toast('River channels recarved. Undo restores your previous terrain.'); };
function refresh() {
  syncWorkspaceLimits();
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
  revealHistoryCursor();
  const b = world.bounds; $('#world-size').textContent = `${(b.maxX - b.minX).toLocaleString()} × ${(b.maxY - b.minY).toLocaleString()}`;
  $('#world-stats').textContent = `${world.tiles.size} terrain tiles · ${((world.tiles.size * 4 + world.biomes.size * BIOME_COUNT + world.colors.size * 4) * TILE * TILE / 1048576).toFixed(1)} MB`;
  $('#sea').value = Math.round(world.sea * 1000); $('#sea-value').textContent = `${Math.round(world.sea * 1000)} m`; $('#ocean').checked = world.ocean; $('#world-name').value = world.name;
  $('#biomes-visible').checked = world.biomesVisible;
  $('#objects-visible').checked = world.objectsVisible; $('#object-count').textContent = `${world.objects.length.toLocaleString()} / ${objectLimit(world).toLocaleString()}`;
  $('#rivers-visible').checked = world.riversVisible; $('#river-count').textContent = `${world.rivers.length} ${world.rivers.length === 1 ? 'river' : 'rivers'}`; $('#recarve-rivers').disabled = !world.rivers.length;
}
function revealHistoryCursor() {
  const list = $('#history-list'), selectedRow = list.querySelector('.current');
  if (selectedRow && $('#panel-history').open) list.scrollTop = Math.max(0, selectedRow.offsetTop - list.offsetTop - list.clientHeight + selectedRow.offsetHeight);
}
$('#panel-history').addEventListener('toggle', revealHistoryCursor);
function changed() { $('#save-status').textContent = 'Unsaved changes'; refresh(); window.dispatchEvent(new Event('world-changed')); }
function afterHistory() { map.invalidate(); scene?.invalidate(); if (history.entries[history.cursor]?.reset || history.entries[history.cursor - 1]?.reset) resetViews(false); changed(); }
$('#undo').onclick = () => { endStroke(); if (history.undo()) afterHistory(); };
$('#redo').onclick = () => { endStroke(); if (history.redo()) afterHistory(); };
function cursor(point) { const size = isObjectTool(tool) ? (activeTool() === 'place-object' ? objectType(objectKind).radius * objectScale : objectRadius) : tool === 'river' ? riverWidth / 2 : radius; const preview = brushPreviewEnabled && !pickingBiome && !isObjectTool(tool) && tool !== 'river' && tool !== 'pan' ? { mask: tool === 'meld' ? null : mask, rotation, opacity: previewOpacity } : null; currentPoint = point; map.cursor = point && { ...point, radius: size }; map.setBrushPreview(point ? preview : null); map.needsDraw = true; scene?.cursor(point, size, point ? preview : null); if (point) $('#coordinates').textContent = `X ${Math.round(point.x)} · Y ${Math.round(point.y)} · ${Math.round(world.sample(point.x, point.y) * 1000)} m`; }
function activeTool() {
  if (isObjectTool(tool)) return modifiers.shift ? 'erase-object' : tool;
  if (tool === 'river') return 'river';
  let activeTool = modifiers.shift ? (tool === 'paint' || tool === 'erase' ? 'erase' : 'smooth') : tool;
  if (modifiers.alt) activeTool = activeTool === 'raise' ? 'lower' : activeTool === 'lower' ? 'raise' : activeTool;
  return activeTool;
}
function paint(point, dt = 1) {
  if (!point || !stroke) return;
  if (isObjectTool(tool)) {
    const selected = activeTool(), options = { type: objectKind, scale: objectScale, variation: objectVariation, radius: objectRadius, density: objectDensity };
    if (selected === 'erase-object') eraseObjects(world, stroke, point.x, point.y, objectRadius, objectEraseFilter === 'selected' ? objectKind : 'all');
    else if (selected === 'scatter') scatterObjects(world, stroke, point.x, point.y, options);
    else if (!stroke.objectPlaced) { stroke.objectPlaced = true; placeObject(world, stroke, point.x, point.y, options); }
    $('#object-count').textContent = `${world.objects.length.toLocaleString()} / ${objectLimit(world).toLocaleString()}`;
    return;
  }
  if (riverGuide) { if (world.inside(point.x, point.y) && riverGuide.length < 4096 && Math.hypot(point.x - riverGuide.at(-1).x, point.y - riverGuide.at(-1).y) > .5) riverGuide.push({ ...point }); return; }
  dab(world, stroke, point.x, point.y, { tool: activeTool(), radius, strength, rotation, mask: tool === 'meld' ? null : mask, target: stroke.target, dt, biome, customColor, mode: brushMode, strokeHeight });
}
function startStroke(point) {
  if (!point || !world.inside(point.x, point.y)) return;
  const painting = tool === 'paint' || tool === 'erase';
  if (painting && !world.biomesVisible) { toast('Show the Biomes layer before painting.'); return; }
  if (isObjectTool(tool) && !world.objectsVisible) { toast('Show the Objects layer before editing objects.'); return; }
  if (tool === 'river' && !world.riversVisible) { toast('Show the River water layer before drawing a river.'); return; }
  const selected = activeTool(), label = selected === 'paint' ? `Paint ${paintName()}` : selected === 'scatter' || selected === 'place-object' ? `${selected === 'scatter' ? 'Scatter' : 'Place'} ${objectType(objectKind).name.toLowerCase()}` : labels[selected];
  stroke = history.begin(`${label}${brushMode === 'blend' && ['raise', 'lower', 'stamp'].includes(selected) ? ' · Blend' : ''}`); stroke.target = world.sample(point.x, point.y);
  if (tool === 'river') riverGuide = [{ ...point }];
  strokePath = new StrokePath(point, isObjectTool(tool) ? Math.max(1, objectRadius * .2) : tool === 'river' ? Math.max(3, riverWidth * .25) : Math.max(2, radius * .16)); lastTime = performance.now(); paint(point);
}
function showRiverPreview() { map.riverPreview = riverGuide || []; map.needsDraw = true; if (scene) { scene.rivers.setPreview(riverGuide || [], scene.relief); scene.needsDraw = true; } }
function endStroke() {
  if (stroke) {
    if (isObjectTool(tool) && activeTool() !== 'place-object' && currentPoint) paint(currentPoint);
    if (riverGuide) {
      if (currentPoint) paint(currentPoint);
      try { addRiver(world, stroke, riverGuide, { width: riverWidth, depth: riverDepth, natural: riverNatural }); toast('River carved downhill, with water and natural banks. Undo restores the landscape.'); } catch (error) { toast(error.message); }
      riverGuide = null; showRiverPreview();
    }
    const committed = history.commit(stroke);
    if (committed) changed();
    if (isObjectTool(tool) && activeTool() !== 'erase-object') {
      if (world.objects.length >= objectLimit(world)) toast('Object limit reached (' + objectLimit(world).toLocaleString() + '). Expand the world or erase objects to make room.');
      else if (!committed) {
        if (stroke.objectLandCandidates) toast('No room at this scatter spacing. Increase density, reduce brush size, or use Detail to place one object.');
        else if (stroke.objectRejections?.water) toast('The sampled placement points are below the land threshold. Place objects more than 2 m above sea level.');
        else toast('No placement points found inside the world. Move the brush farther inside the map.');
      }
    }
    stroke = null; strokePath = null;
  }
  pan = null; if (scene) scene.controls.enabled = true;
}
function bindCanvas(canvas, pointFor, is3D = false) {
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('pointerdown', e => {
    if (e.button !== 0 && !(e.button === 1 && !is3D)) return;
    if (pickingBiome && e.button === 0) {
      const point = pointFor(e), index = point ? pickBiome(world, point.x, point.y) : null;
      if (index !== null) {
        if (Array.isArray(index)) { chooseCustomColor(index); $('#biome-color-match').value = colorHex(index); toast('Picked custom color ' + colorHex(index)); }
        else { chooseBiome(index); toast('Picked ' + BIOMES[index].name.toLowerCase()); }
      }
      else toast('Pick a point inside the world.');
      return;
    }
    modifiers = { shift: e.shiftKey, alt: e.altKey }; canvas.setPointerCapture(e.pointerId);
    if (space || tool === 'pan' || e.button === 1) { pan = { x: e.clientX, y: e.clientY, is3D }; if (scene && is3D) scene.controls.enabled = false; return; }
    if (is3D && scene) scene.controls.enabled = false;
    const p = pointFor(e); cursor(p); startStroke(p);
  });
  canvas.addEventListener('pointermove', e => {
    modifiers = { shift: e.shiftKey, alt: e.altKey };
    if (pan) {
      const dx = e.clientX - pan.x, dy = e.clientY - pan.y;
      if (is3D) scene.pan(dx, dy);
      else { const delta = map.screenDelta(dx, dy); map.center.x -= delta.x; map.center.y -= delta.y; map.needsDraw = true; }
      pan.x = e.clientX; pan.y = e.clientY; return;
    }
    const p = pointFor(e); cursor(p);
    if (stroke && p && strokePath && !['stamp', 'place-object'].includes(activeTool()) && strokePath.move(p, point => paint(point, .65))) lastTime = performance.now();
    if (riverGuide) showRiverPreview();
  });
  canvas.addEventListener('pointerup', endStroke); canvas.addEventListener('pointercancel', endStroke); canvas.addEventListener('lostpointercapture', endStroke);
  canvas.addEventListener('pointerleave', () => { if (!stroke) cursor(null); });
}
bindCanvas($('#map'), e => map.point(e)); if (scene) bindCanvas(scene.renderer.domElement, e => scene.point(e), true);
function rotateBrushFromWheel(e) {
  if (!rotateBrushHeld || !e.deltaY) return;
  e.preventDefault(); e.stopImmediatePropagation(); rotateBrushUsed = true; endStroke();
  rotation = (rotation + e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 800 : 1) * .0025) % (Math.PI * 2);
  if (rotation < 0) rotation += Math.PI * 2;
  const degrees = Math.round(rotation * 180 / Math.PI) % 360;
  $('#rotation').value = degrees; $('#rotation-value').textContent = degrees + '°'; cursor(currentPoint);
}
for (const canvas of [$('#map'), scene?.renderer.domElement].filter(Boolean)) canvas.addEventListener('wheel', rotateBrushFromWheel, { capture: true, passive: false });
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
$('#rivers-visible').onchange = e => { endStroke(); const before = world.riversVisible; world.riversVisible = e.target.checked; history.metadata(world.riversVisible ? 'Show river water' : 'Hide river water', { riversVisible: before }, { riversVisible: world.riversVisible }); world.invalidate(); map.invalidate(); scene?.invalidate(); changed(); };
$('#objects-visible').onchange = e => { endStroke(); const before = world.objectsVisible; world.objectsVisible = e.target.checked; history.metadata(world.objectsVisible ? 'Show objects' : 'Hide objects', { objectsVisible: before }, { objectsVisible: world.objectsVisible }); world.revision++; map.needsDraw = true; changed(); };
for (const field of ['sun-elevation', 'sun-azimuth']) $(`#${field}`).oninput = e => { $(`#${field}-value`).textContent = `${e.target.value}°`; const property = field === 'sun-elevation' ? 'sunElevation' : 'sunAzimuth'; map[property] = +e.target.value; map.invalidate(); if (scene) { scene[property] = +e.target.value; scene.updateSun(); } };
$('#map-rotation').oninput = e => { endStroke(); map.setRotation(+e.target.value); $('#map-rotation-value').textContent = `${e.target.value}°`; $('.map-compass').style.transform = `rotate(${e.target.value}deg)`; };
$('#scene-rotation').oninput = e => { endStroke(); scene?.setRotation(+e.target.value); $('#scene-rotation-value').textContent = `${e.target.value}°`; };
function syncOrbit() { if (scene) { const angle = Math.round(scene.getRotation()); $('#scene-rotation').value = angle; $('#scene-rotation-value').textContent = `${angle}°`; } }
scene?.controls.addEventListener('change', syncOrbit); syncOrbit();
$('#reset-angles').onclick = () => { endStroke(); map.setRotation(0); $('#map-rotation').value = 0; $('#map-rotation-value').textContent = '0°'; $('.map-compass').style.transform = ''; scene?.setRotation(140); };
$('#shadows').onchange = e => { if (scene) { scene.sun.castShadow = e.target.checked; scene.renderer.shadowMap.needsUpdate = true; scene.needsDraw = true; } };
$('#relief').onchange = e => { if (scene) { scene.relief = +e.target.value; scene.invalidate(); } };
syncWorkspaceLimits = initWorkspaceUI(distance => { scene?.setRenderDistance(distance); }, () => world.bounds);
if (!scene) $('#render-distance').disabled = true;
$('#expand').onclick = () => { endStroke(); const before = structuredClone(world.bounds); world.expand($('#expand-direction').value); history.metadata('Expand world borders', { bounds: before }, { bounds: structuredClone(world.bounds) }); scene?.syncBounds(); fit(); changed(); toast('Borders expanded. New terrain is ready to paint.'); };
$('#world-name').onchange = e => { world.name = e.target.value.trim() || 'Untitled world'; changed(); };
$('#help').onclick = () => $('#help-dialog').showModal();
window.addEventListener('keydown', e => {
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName) || $('dialog[open]')) return;
  if (e.key === 'Escape' && pickingBiome) { setBiomePicking(false); return; }
  if (e.code === 'KeyR' && !e.ctrlKey && !e.metaKey && !e.altKey) { rotateBrushHeld = true; return; }
  if (e.key === 'Shift') { modifiers.shift = true; cursor(currentPoint); }
  if (e.code === 'Space') { if (['SUMMARY', 'BUTTON'].includes(document.activeElement.tagName)) return; e.preventDefault(); space = true; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); (e.shiftKey ? $('#redo') : $('#undo')).click(); }
  else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); $('#redo').click(); }
  else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); $('#save').click(); }
  else if (!e.ctrlKey && !e.metaKey) { const shortcuts = { r: 'raise', l: 'lower', f: 'flatten', s: 'smooth', m: 'meld', t: 'stamp', h: 'pan', b: 'paint', o: 'scatter', e: isObjectTool(tool) ? 'erase-object' : 'erase' }; if (shortcuts[e.key.toLowerCase()]) selectTool(shortcuts[e.key.toLowerCase()]); if (e.key === 'Home') { e.preventDefault(); fit(); } if (e.key === '[' || e.key === ']') { const slider = $(isObjectTool(tool) ? '#object-radius' : '#radius'); slider.value = +slider.value + (e.key === ']' ? 4 : -4); slider.dispatchEvent(new Event('input')); } }
});
window.addEventListener('keyup', e => { if (e.code === 'Space') space = false; if (e.code === 'KeyR' && rotateBrushHeld) { rotateBrushHeld = false; if (!rotateBrushUsed) selectTool('raise'); rotateBrushUsed = false; } if (e.key === 'Shift') { modifiers.shift = false; cursor(currentPoint); } }); window.addEventListener('blur', () => { space = false; rotateBrushHeld = false; rotateBrushUsed = false; modifiers = { shift: false, alt: false }; endStroke(); });

let brushCatalog = [], brushManifestRequest = 0, brushSelectionRequest = 0, activeBrush = 'round';
async function loadBrushes() {
  const request = ++brushManifestRequest, selectedCategory = $('#brush-category').value, preserveBrush = activeBrush, selectionVersion = brushSelectionRequest;
  const response = await fetch('/brushes/manifest.json', { cache: 'no-store' });
  if (!response.ok) throw new Error('Brush library could not load');
  const brushes = await response.json();
  if (request !== brushManifestRequest) return;
  brushCatalog = brushes;
  $('#brush-count').textContent = brushes.length + ' + 1';
  const categories = [...new Set(brushes.map(brush => brush.category))];
  const categorySelect = $('#brush-category');
  categorySelect.querySelectorAll('option[data-heightmap-category]').forEach(option => option.remove());
  for (const category of categories) {
    const option = document.createElement('option');
    option.value = category; option.textContent = category; option.dataset.heightmapCategory = 'true';
    categorySelect.append(option);
  }
  categorySelect.value = categories.includes(selectedCategory) ? selectedCategory : 'all';

  const grid = $('#brush-grid');
  grid.querySelectorAll('[data-heightmap-brush]').forEach(button => button.remove());
  for (const brush of brushes) {
    const button = document.createElement('button');
    button.className = 'brush'; button.dataset.brush = brush.id; button.dataset.category = brush.category; button.dataset.heightmapBrush = 'true'; button.title = brush.name;
    const img = document.createElement('img'); img.src = '/brushes/' + brush.id + '.png'; img.alt = ''; img.loading = 'lazy';
    const label = document.createElement('span'); label.textContent = brush.name;
    button.append(img, label); grid.append(button);
  }
  const stillAvailable = preserveBrush === 'round' || brushes.some(brush => brush.id === preserveBrush);
  if (stillAvailable && preserveBrush !== 'round') {
    const result = await fetch('/brushes/' + preserveBrush + '.bin', { cache: 'no-store' });
    if (!result.ok) throw new Error('Selected heightmap brush could not load');
    const data = new Uint16Array(await result.arrayBuffer());
    if (request !== brushManifestRequest) return;
    if (selectionVersion === brushSelectionRequest && activeBrush === preserveBrush) { mask = { size: 256, data }; cursor(currentPoint); }
  } else if (!stillAvailable && selectionVersion === brushSelectionRequest && activeBrush === preserveBrush) {
    activeBrush = 'round'; mask = null; $('#current-brush').textContent = 'Soft round'; cursor(currentPoint);
  }
  document.querySelectorAll('[data-brush]').forEach(button => {
    button.classList.toggle('active', button.dataset.brush === activeBrush);
    button.hidden = button.dataset.brush !== 'round' && categorySelect.value !== 'all' && button.dataset.category !== categorySelect.value;
  });
  grid.onclick = async event => {
    const button = event.target.closest('[data-brush]');
    if (!button) return;
    endStroke();
    const version = ++brushSelectionRequest, brush = brushCatalog.find(item => item.id === button.dataset.brush);
    try {
      let nextMask = null;
      if (brush) {
        const result = await fetch('/brushes/' + brush.id + '.bin');
        if (!result.ok) throw new Error('Brush could not load');
        nextMask = { size: brush.size, data: new Uint16Array(await result.arrayBuffer()) };
      }
      if (version !== brushSelectionRequest) return;
      mask = nextMask; activeBrush = button.dataset.brush; cursor(currentPoint);
      $('#current-brush').textContent = brush?.name ?? 'Soft round';
      document.querySelectorAll('[data-brush]').forEach(item => item.classList.toggle('active', item === button));
    } catch (error) { toast(error.message); }
  };
  categorySelect.onchange = event => document.querySelectorAll('[data-brush]').forEach(button => {
    button.hidden = button.dataset.brush !== 'round' && event.target.value !== 'all' && button.dataset.category !== event.target.value;
  });
}
$('#refresh-brushes').onclick = async event => {
  const button = event.currentTarget, oldCount = brushCatalog.length;
  endStroke(); button.disabled = true;
  try {
    await loadBrushes();
    const added = Math.max(0, brushCatalog.length - oldCount);
    toast(added ? added + ' new heightmap' + (added === 1 ? '' : 's') + ' found.' : 'Heightmap folder scanned. Brush library is up to date.');
  } catch (error) { toast(error.message); }
  finally { button.disabled = false; }
};
await loadBrushes().catch(error => toast(error.message));
requestAnimationFrame(() => { fit(); refresh(); $('#status').textContent = 'Ready to sculpt'; });
function frame(time) {
  requestAnimationFrame(frame);
  if (stroke && currentPoint && tool !== 'river' && accumulatesWhileHeld(activeTool(), brushMode) && time - lastTime > 45) { paint(currentPoint, .7); lastTime = time; }
  if (world.dirty.size) { const keys = [...world.dirty]; world.dirty.clear(); map.invalidate(keys); scene?.invalidate(keys); }
  renderViews([['2D', map], ['3D', scene]], (name, error) => { console.error(`${name} view:`, error); $('#status').textContent = `${name} paused · use Reset views`; toast(`${name} view paused. Use Reset views to rebuild it; your work is retained.`); });
}
requestAnimationFrame(frame);
// Persistence and file interchange are initialized separately from the painting loop.
$('#scene').addEventListener('view-error', e => { $('.scene-error').hidden = false; $('.scene-error').textContent = e.detail; });
export { world, history, map, scene, refresh, changed, toast, endStroke, fit, afterHistory, resetViews };
import('./persistence.js').catch(error => toast(`File storage unavailable: ${error.message}`));
