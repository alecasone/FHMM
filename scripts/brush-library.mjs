import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PNG } from 'pngjs';

const THUMB_SIZE = 96;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

export function brushId(filename) {
  const id = path.basename(filename, path.extname(filename)).normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return id || 'heightmap';
}

export function brushCategory(name) {
  return name.replace(/[_-]+/g, ' ').replace(/\s+\d+$/, '').trim() || 'Heightmaps';
}

export function prepareHeightmap(source, { id = brushId('heightmap.png'), name = 'Heightmap', category = 'Heightmaps' } = {}) {
  if (source.length < 33 || !source.subarray(0, 8).equals(PNG_SIGNATURE) || source.readUInt32BE(8) !== 13) throw new Error('not a valid PNG image');
  const width = source.readUInt32BE(16), height = source.readUInt32BE(20);
  if (!width || !height || !Number.isSafeInteger(width * height * 2)) throw new Error('Invalid PNG dimensions');
  const image = PNG.sync.read(source, { skipRescale: true });
  const maxSample = image.depth === 16 ? 65535 : 255;
  const mask = Buffer.alloc(width * height * 2);
  const sample = (x, y) => {
    const offset = (y * image.width + x) * 4;
    return Math.round((.2126 * image.data[offset] + .7152 * image.data[offset + 1] + .0722 * image.data[offset + 2]) / maxSample * 65535);
  };
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    mask.writeUInt16LE(sample(x, y), (y * width + x) * 2);
  }

  const thumbnail = new PNG({ width: THUMB_SIZE, height: THUMB_SIZE });
  for (let y = 0; y < THUMB_SIZE; y++) for (let x = 0; x < THUMB_SIZE; x++) {
    const value = mask.readUInt16LE((Math.floor(y * height / THUMB_SIZE) * width + Math.floor(x * width / THUMB_SIZE)) * 2) / 65535;
    const offset = (y * THUMB_SIZE + x) * 4;
    thumbnail.data[offset] = 28 + value * 199;
    thumbnail.data[offset + 1] = 38 + value * 198;
    thumbnail.data[offset + 2] = 42 + value * 192;
    thumbnail.data[offset + 3] = 255;
  }
  return { entry: { id, name, category, size: width, width, height }, mask, thumbnail: PNG.sync.write(thumbnail) };
}

export function createBrushLibrary({ sourceDirectory, builtInDirectory, generatedDirectory }) {
  let scanInProgress = null;
  const prepared = new Map();
  let dynamicIds = new Set();

  async function scan() {
    const builtIns = JSON.parse(await readFile(path.join(builtInDirectory, 'manifest.json'), 'utf8'));
    const reservedIds = new Set([...builtIns.map(brush => brush.id), 'round']);
    let files = [];
    try { files = await readdir(sourceDirectory); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    files = files.filter(file => path.extname(file).toLowerCase() === '.png').sort((a, b) => a.localeCompare(b));
    await mkdir(generatedDirectory, { recursive: true });
    const found = [];
    for (const filename of files) {
      const displayName = path.basename(filename, path.extname(filename));
      const baseId = brushId(filename);
      let id = baseId, suffix = 2;
      while (reservedIds.has(id)) id = baseId + '-' + suffix++;
      reservedIds.add(id);
      const sourcePath = path.join(sourceDirectory, filename);
      try {
        const info = await stat(sourcePath);
        if (!info.isFile()) continue;
        const signature = filename + ':' + info.size + ':' + info.mtimeMs;
        if (prepared.get(id)?.signature !== signature) {
          const result = prepareHeightmap(await readFile(sourcePath), { id, name: displayName, category: brushCategory(displayName) });
          await Promise.all([
            writeFile(path.join(generatedDirectory, id + '.bin'), result.mask),
            writeFile(path.join(generatedDirectory, id + '.png'), result.thumbnail),
          ]);
          prepared.set(id, { signature, entry: result.entry });
        }
        found.push(prepared.get(id).entry);
      } catch (error) {
        console.warn('Skipping heightmap ' + filename + ': ' + error.message);
      }
    }
    dynamicIds = new Set(found.map(brush => brush.id));
    return [...builtIns, ...found];
  }

  return {
    async manifest() {
      if (!scanInProgress) scanInProgress = scan().finally(() => { scanInProgress = null; });
      return scanInProgress;
    },
    resolveAsset(filename) {
      const match = /^([a-z0-9-]+)\.(bin|png)$/.exec(filename);
      return match && dynamicIds.has(match[1]) ? path.join(generatedDirectory, filename) : null;
    },
  };
}