import { World, History, TILE } from './world.js';
const encoder = new TextEncoder(), decoder = new TextDecoder();
const MAGIC = 'FMM1';
const MAX_FILE_BYTES = 1024 * 1024 * 1024;
export function encodeWorld(world, history) {
  const chunks = []; let offset = 0;
  const append = array => { const ref = { offset, length: array.length }; chunks.push(new Uint8Array(array.buffer, array.byteOffset, array.byteLength)); offset += array.byteLength; return ref; };
  const metadata = { version: 1, tileSize: TILE, name: world.name, bounds: world.bounds, sea: world.sea, ocean: world.ocean,
    tiles: [...world.tiles].map(([key, data]) => ({ key, data: append(data) })),
    history: { cursor: history.cursor, trimmed: history.trimmed, entries: history.entries.map(entry => entry.patches ? { label: entry.label, time: entry.time, patches: entry.patches.map(p => ({ key: p.key, indices: append(p.indices), before: append(p.before), after: append(p.after) })) } : { label: entry.label, time: entry.time, before: entry.before, after: entry.after }) }
  };
  const json = encoder.encode(JSON.stringify(metadata)); const header = new Uint8Array(8); header.set(encoder.encode(MAGIC)); new DataView(header.buffer).setUint32(4, json.length, true);
  return new Blob([header, json, ...chunks], { type: 'application/x-fmm' });
}
function validateBounds(b) { return b && ['minX', 'minY', 'maxX', 'maxY'].every(k => Number.isSafeInteger(b[k]) && b[k] % TILE === 0 && Math.abs(b[k]) <= 2 ** 24) && b.minX < b.maxX && b.minY < b.maxY; }
function validKey(key) { return typeof key === 'string' && /^-?\d+,-?\d+$/.test(key) && key.split(',').every(n => Math.abs(Number(n)) < 2 ** 17); }
function validateMeta(value) {
  if (!value || typeof value !== 'object' || Object.keys(value).some(k => !['bounds', 'sea', 'ocean'].includes(k))) throw new Error('Invalid history metadata');
  if ('bounds' in value && !validateBounds(value.bounds)) throw new Error('Invalid history bounds');
  if ('sea' in value && (!Number.isFinite(value.sea) || value.sea < -.3 || value.sea > .7)) throw new Error('Invalid sea level');
  if ('ocean' in value && typeof value.ocean !== 'boolean') throw new Error('Invalid ocean layer');
}
export async function decodeWorld(blob) {
  if (blob.size > MAX_FILE_BYTES || blob.size < 8) throw new Error('World file is too large or incomplete');
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (decoder.decode(bytes.subarray(0, 4)) !== MAGIC) throw new Error('This is not an FMM world file');
  const length = new DataView(bytes.buffer).getUint32(4, true), start = 8 + length;
  if (length > 64 * 1024 * 1024 || start > bytes.length) throw new Error('World file header is damaged');
  const meta = JSON.parse(decoder.decode(bytes.subarray(8, start)));
  if (meta.version !== 1 || meta.tileSize !== TILE || !validateBounds(meta.bounds) || !Array.isArray(meta.tiles) || meta.tiles.length > 16000) throw new Error('Unsupported or invalid world file');
  validateMeta({ sea: meta.sea, ocean: meta.ocean });
  const world = new World(); world.name = String(meta.name || 'Untitled world').slice(0, 70); world.bounds = meta.bounds; world.sea = meta.sea; world.ocean = meta.ocean;
  const read = (ref, Type, maxLength) => {
    if (!ref || !Number.isSafeInteger(ref.offset) || !Number.isSafeInteger(ref.length) || ref.offset < 0 || ref.length < 0 || ref.length > maxLength || ref.offset + ref.length * Type.BYTES_PER_ELEMENT > bytes.length - start) throw new Error('World contains damaged terrain data');
    return new Type(bytes.slice(start + ref.offset, start + ref.offset + ref.length * Type.BYTES_PER_ELEMENT).buffer);
  };
  const readHeights = (ref, maxLength) => { const data = read(ref, Float32Array, maxLength); if (data.some(n => !Number.isFinite(n) || n < -1 || n > 2)) throw new Error('Invalid terrain heights'); return data; };
  for (const tile of meta.tiles) { if (!validKey(tile.key) || world.tiles.has(tile.key)) throw new Error('Invalid terrain tile'); const values = readHeights(tile.data, TILE * TILE); if (values.length !== TILE * TILE) throw new Error('Incomplete terrain tile'); world.tiles.set(tile.key, values); }
  const history = new History(world), h = meta.history;
  if (!h || !Array.isArray(h.entries) || h.entries.length > 2000 || !Number.isInteger(h.cursor) || h.cursor < 0 || h.cursor > h.entries.length) throw new Error('Invalid undo history');
  for (const entry of h.entries) {
    const next = { label: String(entry.label).slice(0, 100), time: Number(entry.time) || 0, bytes: 512 };
    if (entry.patches) {
      if (!Array.isArray(entry.patches) || entry.patches.length > 16000) throw new Error('Invalid history patches');
      next.bytes = 0;
      next.patches = entry.patches.map(p => {
        if (!validKey(p.key)) throw new Error('Invalid history tile');
        const indices = read(p.indices, Uint16Array, TILE * TILE), before = readHeights(p.before, TILE * TILE), after = readHeights(p.after, TILE * TILE);
        if (indices.length !== before.length || indices.length !== after.length || indices.some(i => i >= TILE * TILE)) throw new Error('Invalid history samples');
        next.bytes += indices.length * 10; return { key: p.key, indices, before, after };
      });
    } else { validateMeta(entry.before); validateMeta(entry.after); next.before = entry.before; next.after = entry.after; }
    history.entries.push(next); history.bytes += next.bytes;
    if (history.bytes + world.tiles.size * TILE * TILE * 4 > MAX_FILE_BYTES) throw new Error('World exceeds the supported import memory budget');
  }
  history.cursor = h.cursor; history.trimmed = Number.isSafeInteger(h.trimmed) && h.trimmed >= 0 ? h.trimmed : 0; world.invalidate();
  return { world, history };
}
