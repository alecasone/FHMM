import { world, history, map, scene, refresh, toast, endStroke, fit, resetViews } from './main.js';
import { World, History, TILE } from './world.js';
import { encodeWorld, decodeWorld } from './file-format.js';
const $ = s => document.querySelector(s);
let db, recoveryTimer, dirty = false, saving = false, generation = 0;
const database = new Promise((resolve, reject) => { const req = indexedDB.open('fmm-terrain-studio', 1); req.onupgradeneeded = () => req.result.createObjectStore('worlds'); req.onsuccess = () => { db = req.result; resolve(db); }; req.onerror = () => reject(req.error); });
function transact(mode, action) { return new Promise((resolve, reject) => { const tx = db.transaction('worlds', mode), request = action(tx.objectStore('worlds')); tx.oncomplete = () => resolve(request?.result); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); }); }
function download(blob, name) { const a = document.createElement('a'); const url = URL.createObjectURL(blob); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 30000); }
function filename() { return world.name.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '') || 'world'; }
async function recoverSave() {
  if (!dirty || saving || !db) return;
  const version = generation; saving = true;
  try { await transact('readwrite', s => s.put(encodeWorld(world, history), 'recovery')); if (version === generation) { dirty = false; $('#save-status').textContent = 'Recovery saved locally'; } }
  catch { $('#save-status').textContent = 'Recovery unavailable · save a .fmm file'; }
  finally { saving = false; if (dirty && generation !== version) schedule(); }
}
function schedule() { clearTimeout(recoveryTimer); recoveryTimer = setTimeout(recoverSave, 1800); }
window.addEventListener('world-changed', () => { dirty = true; generation++; schedule(); });
window.addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
document.addEventListener('visibilitychange', () => { if (document.hidden) recoverSave(); });
function replace(loaded) {
  endStroke(); world.rivers = loaded.world.rivers; world.riversVisible = loaded.world.riversVisible;
  world.objects = loaded.world.objects; world.objectsVisible = loaded.world.objectsVisible; world.objectsRevision++;
  endStroke(); world.tiles = loaded.world.tiles; world.biomes = loaded.world.biomes; world.biomesVisible = loaded.world.biomesVisible; world.bounds = loaded.world.bounds; world.sea = loaded.world.sea; world.ocean = loaded.world.ocean; world.name = loaded.world.name; world.dirty.clear(); world.invalidate();
  history.entries = loaded.history.entries; history.cursor = loaded.history.cursor; history.bytes = loaded.history.bytes; history.trimmed = loaded.history.trimmed;
  resetViews(false); refresh();
}
$('#save').onclick = () => { endStroke(); download(encodeWorld(world, history), `${filename()}.fmm`); $('#save-status').textContent = 'World file saved'; dirty = true; generation++; recoverSave(); toast('World saved, including undo and redo history.'); };
$('#open').onclick = () => $('#file-input').click();
$('#file-input').onchange = async e => {
  const file = e.target.files[0]; if (!file) return;
  try { const loaded = await decodeWorld(file); if (!confirm('Open this world? Your current world will be downloaded as a backup first.')) return; download(encodeWorld(world, history), `${filename()}-backup.fmm`); replace(loaded); dirty = true; generation++; schedule(); toast('World opened. Retained history is ready to use.'); }
  catch (error) { toast(error.message); }
  finally { e.target.value = ''; }
};
$('#blank').onclick = () => $('#reset-world').click();
$('#export').onclick = () => {
  endStroke(); const b = world.bounds, w = b.maxX - b.minX, h = b.maxY - b.minY;
  if (w * h > 16 * 1024 * 1024) { toast('Heightmap export is limited to 16 million samples. Save the tiled .fmm world for larger maps.'); return; }
  const header = new TextEncoder().encode(`P5\n# FMM heights: -1 to 2; sea level ${world.sea}; origin ${b.minX},${b.minY}\n${w} ${h}\n65535\n`), pixels = new Uint8Array(w * h * 2), view = new DataView(pixels.buffer);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) view.setUint16((y * w + x) * 2, Math.round((world.get(b.minX + x, b.minY + y) + 1) / 3 * 65535), false);
  download(new Blob([header, pixels], { type: 'image/x-portable-graymap' }), `${filename()}-16bit.pgm`); toast('Exported a lossless 16-bit PGM heightmap.');
};
database.then(async () => {
  const version = generation, revision = world.revision; const saved = await transact('readonly', s => s.get('recovery'));
  // Do not replace a stroke the user started while IndexedDB was opening.
  if (saved && version === generation && revision === world.revision && !dirty) {
    try { const loaded = await decodeWorld(saved); if (version !== generation || revision !== world.revision || dirty) return; replace(loaded); $('#save-status').textContent = 'Recovered local workspace'; toast('Your previous workspace has been restored.'); }
    catch { $('#save-status').textContent = 'Recovery could not load · open a .fmm file'; }
  }
}).catch(() => { $('#save-status').textContent = 'Browser recovery unavailable · use Save world'; });
