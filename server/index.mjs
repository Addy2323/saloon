import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleSqliteApiAndUploads } from './api-middleware.mjs';
import { DB_PATH } from './sqlite-db.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.resolve(__dirname, '../dist');
const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || '0.0.0.0';

const STATIC_MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

const server = http.createServer(async (req, res) => {
  const handled = await handleSqliteApiAndUploads(req, res);
  if (handled) return;

  const urlObj = new URL(req.url || '/', 'http://localhost');
  let reqPath = decodeURIComponent(urlObj.pathname);
  if (reqPath === '/') reqPath = '/index.html';

  const safeTarget = path.normalize(path.join(DIST_DIR, reqPath));
  if (safeTarget.startsWith(DIST_DIR) && fs.existsSync(safeTarget) && fs.statSync(safeTarget).isFile()) {
    const ext = path.extname(safeTarget).toLowerCase();
    const mime = STATIC_MIME[ext] || 'application/octet-stream';
    const isHashedAsset = reqPath.startsWith('/assets/');
    res.writeHead(200, {
      'Content-Type': mime,
      'Cache-Control': isHashedAsset ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    fs.createReadStream(safeTarget).pipe(res);
    return;
  }

  // SPA fallback to dist/index.html
  const indexHtml = path.join(DIST_DIR, 'index.html');
  if (fs.existsSync(indexHtml)) {
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache',
    });
    fs.createReadStream(indexHtml).pipe(res);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Frontend build not found. Run "npm run build" first.');
});

server.listen(PORT, HOST, () => {
  console.log(`=============================================================`);
  console.log(` Lucentia Beauty & Salon — Production SQLite Server`);
  console.log(` Listening on: http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
  console.log(` SQLite DB:    ${DB_PATH}`);
  console.log(`=============================================================`);
});

