import { createReadStream } from 'node:fs';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { basename, extname, join, normalize, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const root = process.cwd();
const storageDirectory = join(root, 'storage');
const importsDirectory = join(storageDirectory, 'imports');
const distDirectory = join(root, 'dist');
await mkdir(importsDirectory, { recursive: true });

const database = new DatabaseSync(join(storageDirectory, 'abidi-dashboard.sqlite'));
database.exec(`
  CREATE TABLE IF NOT EXISTS dashboard_state (
    state_key TEXT PRIMARY KEY,
    value_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS import_archive (
    id INTEGER PRIMARY KEY,
    dashboard_key TEXT NOT NULL,
    source_key TEXT NOT NULL,
    file_name TEXT NOT NULL,
    stored_path TEXT NOT NULL,
    imported_at TEXT NOT NULL
  );
`);

const readBody = (request, maxBytes = 100 * 1024 * 1024) => new Promise((resolveBody, reject) => {
  const chunks = [];
  let size = 0;
  request.on('data', (chunk) => {
    size += chunk.length;
    if (size > maxBytes) {
      reject(new Error('Fichier trop volumineux (maximum 100 Mo).'));
      request.destroy();
      return;
    }
    chunks.push(chunk);
  });
  request.on('end', () => resolveBody(Buffer.concat(chunks)));
  request.on('error', reject);
});

const safeKey = (value) => /^[a-zA-Z0-9_-]+$/.test(value || '') ? value : null;
const safeFileName = (value) => basename(value || 'import').replace(/[^a-zA-Z0-9._-]/g, '_');
const sendJson = (response, status, value) => {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(value));
};

const serveStatic = async (request, response, pathname) => {
  const requested = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const candidate = resolve(distDirectory, normalize(requested));
  if (!candidate.startsWith(resolve(distDirectory))) return sendJson(response, 403, { error: 'Accès refusé.' });
  try {
    await access(candidate);
    const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' };
    response.writeHead(200, { 'Content-Type': types[extname(candidate)] || 'application/octet-stream' });
    createReadStream(candidate).pipe(response);
  } catch {
    try {
      const index = await readFile(join(distDirectory, 'index.html'));
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end(index);
    } catch {
      sendJson(response, 404, { error: 'Application non construite. Lancez npm run build.' });
    }
  }
};

const server = createServer(async (request, response) => {
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
  const parts = url.pathname.split('/').filter(Boolean);
  try {
    if (request.method === 'GET' && url.pathname === '/api/health') return sendJson(response, 200, { ok: true });
    if (parts[0] === 'api' && parts[1] === 'state' && parts.length === 3) {
      const stateKey = safeKey(parts[2]);
      if (!stateKey) return sendJson(response, 400, { error: 'Clé invalide.' });
      if (request.method === 'GET') {
        const row = database.prepare('SELECT value_json, updated_at FROM dashboard_state WHERE state_key = ?').get(stateKey);
        return row ? sendJson(response, 200, { value: JSON.parse(row.value_json), updatedAt: row.updated_at }) : sendJson(response, 404, { error: 'Aucune donnée enregistrée.' });
      }
      if (request.method === 'PUT') {
        const body = await readBody(request, 25 * 1024 * 1024);
        const value = JSON.parse(body.toString('utf8'));
        const updatedAt = new Date().toISOString();
        database.prepare('INSERT INTO dashboard_state (state_key, value_json, updated_at) VALUES (?, ?, ?) ON CONFLICT(state_key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at').run(stateKey, JSON.stringify(value), updatedAt);
        return sendJson(response, 200, { ok: true, updatedAt });
      }
    }
    if (parts[0] === 'api' && parts[1] === 'imports' && parts.length === 4 && request.method === 'POST') {
      const dashboardKey = safeKey(parts[2]);
      const sourceKey = safeKey(parts[3]);
      if (!dashboardKey || !sourceKey) return sendJson(response, 400, { error: 'Source invalide.' });
      const fileName = safeFileName(decodeURIComponent(request.headers['x-file-name'] || 'import'));
      const importedAt = new Date().toISOString();
      const targetDirectory = join(importsDirectory, dashboardKey, sourceKey);
      await mkdir(targetDirectory, { recursive: true });
      const storedPath = join(targetDirectory, `${importedAt.replace(/[:.]/g, '-')}_${fileName}`);
      await writeFile(storedPath, await readBody(request));
      database.prepare('INSERT INTO import_archive (dashboard_key, source_key, file_name, stored_path, imported_at) VALUES (?, ?, ?, ?, ?)').run(dashboardKey, sourceKey, fileName, storedPath, importedAt);
      return sendJson(response, 201, { ok: true, fileName, importedAt });
    }
    return serveStatic(request, response, url.pathname);
  } catch (error) {
    return sendJson(response, 500, { error: error.message || 'Erreur serveur.' });
  }
});

const port = Number(process.env.PORT || 4175);
server.listen(port, '0.0.0.0', () => console.log(`ABIDI dashboard server running on http://127.0.0.1:${port}`));
