import fs from 'node:fs';
import path from 'node:path';
import {
  UPLOADS_DIR,
  executeSqliteQuery,
  getAuthKv,
  setAuthKv,
  getDatabaseStats,
  exportSqliteBinaryBuffer,
} from './sqlite-db.mjs';

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      // Allow up to 15MB payload for base64 product image uploads
      if (raw.length > 15 * 1024 * 1024) {
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

const MIME_BY_EXT = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
};

export async function handleSqliteApiAndUploads(req, res, next) {
  const urlObj = new URL(req.url || '/', 'http://localhost');
  const pathname = urlObj.pathname;

  // Serve uploaded product images from data/uploads/
  if (pathname.startsWith('/uploads/') && req.method === 'GET') {
    const safeName = path.basename(pathname);
    const filePath = path.join(UPLOADS_DIR, safeName);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(safeName).toLowerCase();
      const mime = MIME_BY_EXT[ext] || 'application/octet-stream';
      res.writeHead(200, {
        'Content-Type': mime,
        'Cache-Control': 'public, max-age=31536000, immutable',
      });
      fs.createReadStream(filePath).pipe(res);
      return true;
    }
    res.writeHead(404);
    res.end('Not found');
    return true;
  }

  if (!pathname.startsWith('/api/sqlite/')) {
    if (next) next();
    return false;
  }

  try {
    if (pathname === '/api/sqlite/status' && req.method === 'GET') {
      const stats = getDatabaseStats();
      sendJson(res, 200, { ok: true, ...stats });
      return true;
    }

    if (pathname === '/api/sqlite/query' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const data = executeSqliteQuery(body);
      sendJson(res, 200, { data, error: null });
      return true;
    }

    if (pathname === '/api/sqlite/auth' && req.method === 'GET') {
      const users = getAuthKv('users');
      const roles = getAuthKv('roles');
      const auditLogs = getAuthKv('audit_logs');
      sendJson(res, 200, { ok: true, users, roles, auditLogs });
      return true;
    }

    if (pathname === '/api/sqlite/auth' && req.method === 'POST') {
      const body = await readJsonBody(req);
      if (body.users !== undefined) setAuthKv('users', body.users);
      if (body.roles !== undefined) setAuthKv('roles', body.roles);
      if (body.auditLogs !== undefined) setAuthKv('audit_logs', body.auditLogs);
      sendJson(res, 200, { ok: true });
      return true;
    }

    if (pathname === '/api/sqlite/migrate' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const tables = body.tables || {};
      let migratedCount = 0;

      for (const [tableName, rows] of Object.entries(tables)) {
        if (!Array.isArray(rows) || rows.length === 0) continue;
        const existing = executeSqliteQuery({ table: tableName, action: 'select' });
        if (Array.isArray(existing) && existing.length === 0) {
          executeSqliteQuery({ table: tableName, action: 'insert', payload: rows });
          migratedCount += rows.length;
        }
      }

      if (body.auth) {
        if (body.auth.users && !getAuthKv('users')) {
          setAuthKv('users', body.auth.users);
        }
        if (body.auth.roles && !getAuthKv('roles')) {
          setAuthKv('roles', body.auth.roles);
        }
        if (body.auth.auditLogs && !getAuthKv('audit_logs')) {
          setAuthKv('audit_logs', body.auth.auditLogs);
        }
      }

      sendJson(res, 200, { ok: true, migratedCount });
      return true;
    }

    if (pathname === '/api/sqlite/backup' && req.method === 'GET') {
      const dateStr = new Date().toISOString().slice(0, 10);
      const buffer = exportSqliteBinaryBuffer();
      res.writeHead(200, {
        'Content-Type': 'application/x-sqlite3',
        'Content-Disposition': `attachment; filename="lucentia-backup-${dateStr}.sqlite"`,
        'Content-Length': buffer.length,
      });
      res.end(buffer);
      return true;
    }

    sendJson(res, 404, { error: { message: 'Unknown SQLite endpoint' } });
    return true;
  } catch (err) {
    sendJson(res, 500, {
      data: null,
      error: { message: err instanceof Error ? err.message : 'Internal SQLite Error' },
    });
    return true;
  }
}

