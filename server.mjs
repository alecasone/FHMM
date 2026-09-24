import http from 'node:http';
import { createReadStream } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBrushLibrary } from './scripts/brush-library.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const app = path.join(root, 'app');
const port = Number(process.env.FMM_PORT || 4173);
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.bin': 'application/octet-stream' };
const brushes = createBrushLibrary({
  sourceDirectory: path.join(root, 'Heightmaps'),
  builtInDirectory: path.join(app, 'brushes'),
  generatedDirectory: path.join(root, '.runtime', 'brushes'),
});

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/health') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end('{"app":"fmm-terrain-studio"}'); }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }

    if (url.pathname === '/brushes/manifest.json') {
      const manifest = await brushes.manifest();
      const body = JSON.stringify(manifest);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      return req.method === 'HEAD' ? res.end() : res.end(body);
    }

    const pathname = decodeURIComponent(url.pathname);
    const dynamicAsset = pathname.startsWith('/brushes/') ? brushes.resolveAsset(pathname.slice('/brushes/'.length)) : null;
    const base = pathname.startsWith('/vendor/') ? path.join(root, 'node_modules/three') : app;
    const relative = dynamicAsset ? null : pathname.startsWith('/vendor/') ? pathname.slice(8) : pathname.slice(1);
    const file = dynamicAsset || path.resolve(base, relative || 'index.html');
    if (!dynamicAsset && (!file.startsWith(base + path.sep) || pathname.includes('\\'))) { res.writeHead(403); return res.end(); }
    const info = await stat(file);
    if (!info.isFile()) throw new Error('Not a file');
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Content-Length': info.size, 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
    if (req.method === 'HEAD') return res.end();
    createReadStream(file).pipe(res);
  } catch { res.writeHead(404); res.end('Not found'); }
});
await mkdir(path.join(root, '.runtime'), { recursive: true });
server.listen(port, '127.0.0.1', () => console.log('FMM Terrain Studio: http://127.0.0.1:' + port));
server.on('error', error => { console.error(error.message); process.exit(1); });