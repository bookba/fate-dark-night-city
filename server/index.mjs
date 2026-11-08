// The online game server: serves the v5 demo page and runs the rooms over a WebSocket at /ws.
// Start: node server/index.mjs (PORT from the host, 8080 by default). No packages to install.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { upgrade } from './ws.mjs';
import * as hub from './hub.mjs';
import * as accounts from './accounts.mjs';
import * as admin from './admin.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVE = ['v5', 'src/art']; // only the demo and its card pictures are served
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.json': 'application/json' };

// art.js imports its pictures the bundler way; for the browser they become plain URLs
const asBrowser = (file, text) => (path.basename(file) === 'art.js'
  ? text.replace(/^import (\w+) from '([^']+\.(?:webp|png|jpg|svg))';$/gm, "const $1 = new URL('$2', import.meta.url).href;")
  : text);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try { if (await admin.handle(req, res, url, ROOT)) return; } catch (e) { console.error(e); if (!res.headersSent) { res.writeHead(500); res.end('error'); } return; }
  if (url.pathname === '/') { res.writeHead(302, { Location: '/v5/' + url.search }); res.end(); return; }
  if (url.pathname === '/health') { res.writeHead(200); res.end('ok'); return; }
  let rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
  if (rel.endsWith('/') || rel === 'v5') rel = rel.replace(/\/?$/, '/index.html');
  const file = path.resolve(ROOT, rel);
  if (!SERVE.some((d) => file.startsWith(path.join(ROOT, d) + path.sep))) { res.writeHead(404); res.end('not found'); return; }
  const swap = await admin.imageFor('/' + path.relative(ROOT, file).split(path.sep).join('/')); // a picture replaced on the admin page
  if (swap) { res.writeHead(200, { 'Content-Type': swap.type, 'Cache-Control': 'no-cache' }); res.end(swap.buf); return; }
  if (file === path.join(ROOT, 'v5', 'index.html')) await admin.ready;
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    const ext = path.extname(file);
    const body = ext === '.js' ? asBrowser(file, buf.toString('utf8'))
      : file === path.join(ROOT, 'v5', 'index.html') ? admin.injectPage(buf.toString('utf8')) // the admin page's edits, inline
        : buf;
    res.writeHead(200, { 'Content-Type': TYPES[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(body);
  });
});

// every page's connection: hub.mjs (members, the lobby, friends, chat) and its room (room.mjs)
server.on('upgrade', (req, sock) => {
  if (new URL(req.url, 'http://x').pathname !== '/ws') { sock.destroy(); return; }
  const ws = upgrade(req, sock);
  if (ws) hub.connect(ws, req);
});
admin.plugins.push(accounts.adminApi); // the members tab of the admin page

const PORT = +process.env.PORT || 8080;
server.listen(PORT, () => console.log(`Dominate Grail War online: http://localhost:${PORT}/`));
// Render stops the server with SIGTERM (it sleeps, or a new version starts): the members' data is saved first
for (const sig of ['SIGTERM', 'SIGINT']) process.once(sig, () => { accounts.flush().finally(() => process.exit(0)); setTimeout(() => process.exit(0), 8000).unref(); });
