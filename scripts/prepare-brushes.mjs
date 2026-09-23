import { PNG } from 'pngjs';
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'app/brushes');
await mkdir(output, { recursive: true });
const manifest = [];
for (const name of (await readdir(path.join(root, 'Heightmaps'))).filter(n => n.endsWith('.png')).sort()) {
  const png = PNG.sync.read(await readFile(path.join(root, 'Heightmaps', name)), { skipRescale: true });
  const id = name.replace('.png', '').toLowerCase().replaceAll(' ', '-');
  const size = 256, data = Buffer.alloc(size * size * 2), thumb = new PNG({ width: 96, height: 96 });
  const max = png.depth === 16 ? 65535 : 255;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const sx = Math.min(png.width - 1, Math.floor((x + .5) * png.width / size));
    const sy = Math.min(png.height - 1, Math.floor((y + .5) * png.height / size));
    data.writeUInt16LE(Math.round(png.data[(sy * png.width + sx) * 4] / max * 65535), (y * size + x) * 2);
  }
  for (let y = 0; y < 96; y++) for (let x = 0; x < 96; x++) {
    const value = data.readUInt16LE((Math.floor(y * size / 96) * size + Math.floor(x * size / 96)) * 2) / 65535;
    const i = (y * 96 + x) * 4;
    thumb.data[i] = 28 + value * 199; thumb.data[i + 1] = 38 + value * 198; thumb.data[i + 2] = 42 + value * 192; thumb.data[i + 3] = 255;
  }
  await writeFile(path.join(output, id + '.bin'), data);
  await writeFile(path.join(output, id + '.png'), PNG.sync.write(thumb));
  manifest.push({ id, name: name.replace('.png', ''), category: name.replace(/ \d+\.png$/, ''), size });
}
await writeFile(path.join(output, 'manifest.json'), JSON.stringify(manifest));
console.log(`Prepared ${manifest.length} brushes at 256 × 256, preserving 16-bit height precision.`);
