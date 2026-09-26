import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { brushId, brushCategory, prepareHeightmap } from './brush-library.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'app/brushes');
await mkdir(output, { recursive: true });
const manifest = [], used = new Set(['round']);
for (const filename of (await readdir(path.join(root, 'Heightmaps'))).filter(n => path.extname(n).toLowerCase() === '.png').sort((a, b) => a.localeCompare(b))) {
  const name = path.basename(filename, path.extname(filename)), base = brushId(filename);
  let id = base, suffix = 2;
  while (used.has(id)) id = base + '-' + suffix++;
  used.add(id);
  const result = prepareHeightmap(await readFile(path.join(root, 'Heightmaps', filename)), { id, name, category: brushCategory(name) });
  await writeFile(path.join(output, id + '.bin'), result.mask);
  await writeFile(path.join(output, id + '.png'), result.thumbnail);
  manifest.push(result.entry);
}
await writeFile(path.join(output, 'manifest.json'), JSON.stringify(manifest));
console.log('Prepared ' + manifest.length + ' brushes at their original PNG dimensions; only thumbnails are reduced.');
