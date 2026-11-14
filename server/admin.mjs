// The admin page (B, 6 Nov 2026: "เพิ่มหน้าแอดมิน สามารถแก้ไขรูป ข้อความ เสียง ทุกอย่างในเว็บได้
// หน้าแอดมินเข้าผ่านวิธีพิเศษ ต้องใส่โค้ด รหัสผ่าน ผ่าน url").
// - Hidden: /admin?key=<ADMIN_KEY> opens it; any other key (or no ADMIN_KEY set) is a plain 404.
// - Every change is checked here against ADMIN_KEY, so the page alone can change nothing.
// - The edits are one JSON (texts per language, CSS, which picture/sound replaces which) plus the
//   uploaded files, kept in DATA_DIR and, when GITHUB_TOKEN is set, in a branch of the repo, because
//   Render's free plan forgets its disk whenever the server sleeps or restarts.
// - Players get the edits with the page: the JSON goes inline into v5/index.html, a replaced
//   picture is sent at the original picture's address, a replaced sound is played by v5/sound.js.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { SFX_NAMES } from '../v5/sound.js';
import { BG_PLACES, THEME_COLORS } from '../v5/custom.js';
import { SERVANTS, applyGameEdits, plainCard } from '../v5/data.js';

const KEY = (process.env.ADMIN_KEY || '').trim(); // a space pasted around the key on Render does not count
const DIR = path.resolve(process.env.DATA_DIR || fileURLToPath(new URL('./data', import.meta.url)));
const MEDIA = path.join(DIR, 'media');
const FILE = path.join(DIR, 'overrides.json');
const GH = { token: process.env.GITHUB_TOKEN || '', repo: process.env.GITHUB_REPO || '', branch: process.env.GITHUB_BRANCH || 'admin-data' };
export const ghOn = () => !!(GH.token && GH.repo);
const LANGS = ['th', 'en', 'zh', 'ja'];
const IMG = { '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml' };
const AUD = { 'audio/mpeg': '.mp3', 'audio/mp3': '.mp3', 'audio/wav': '.wav', 'audio/x-wav': '.wav', 'audio/wave': '.wav', 'audio/ogg': '.ogg', 'audio/webm': '.webm', 'audio/mp4': '.m4a', 'audio/x-m4a': '.m4a', 'audio/aac': '.aac', 'audio/flac': '.flac' };
const MAX_FILE = 8 << 20; // one picture or sound
const MAX_JSON = 2 << 20; // texts and CSS
const MAX_BACKUP = 120 << 20; // a backup with all its files

const blank = () => ({ v: 1, strings: {}, dom: {}, css: '', images: {}, sounds: {}, theme: {}, game: {}, updated: null });
let data = blank();
let lastGood = null; // the GitHub copy's file id (sha), needed to replace it

// ---------- the key ----------
const digest = (s) => crypto.createHash('sha256').update(String(s)).digest();
const fails = new Map(); // ip -> { n, since, until }: 8 wrong keys in 15 minutes closes that address for 15 minutes
const WINDOW = 15 * 60_000;
const ipOf = (req) => String(req.headers['x-forwarded-for'] || '').split(',').pop().trim() || req.socket.remoteAddress || '?'; // the last one: added by Render's own proxy, not by the browser
function keyOk(req, given) {
  if (!KEY) return false;
  const ip = ipOf(req), now = Date.now();
  let f = fails.get(ip);
  if (f && f.until > now) return false;
  if (!f || now - f.since > WINDOW) f = { n: 0, since: now, until: 0 };
  const ok = crypto.timingSafeEqual(digest(String(given || '').trim()), digest(KEY));
  if (ok) { fails.delete(ip); return true; }
  f.n += 1;
  if (f.n >= 8) f.until = now + WINDOW;
  if (fails.size > 5000) fails.clear();
  fails.set(ip, f);
  return false;
}

// ---------- keeping the data ----------
const okJson = (d) => d && typeof d === 'object' && !Array.isArray(d);
function clean(d) { // only the known parts, of the right shapes
  const out = blank();
  if (!okJson(d)) return out;
  for (const part of ['strings', 'dom']) {
    if (!okJson(d[part])) continue;
    for (const l of LANGS) {
      if (!okJson(d[part][l])) continue;
      const m = {};
      for (const [k, v] of Object.entries(d[part][l])) if (typeof v === 'string' && k) m[k] = v;
      if (Object.keys(m).length) out[part][l] = m;
    }
  }
  if (typeof d.css === 'string') out.css = d.css;
  for (const part of ['images', 'sounds']) {
    if (!okJson(d[part])) continue;
    for (const [k, v] of Object.entries(d[part])) if (okJson(v) && /^[0-9a-f]{40}\.[a-z0-9]+$/.test(v.id || '')) out[part][k] = { id: v.id, type: String(v.type || ''), name: String(v.name || '').slice(0, 200) };
  }
  out.theme = cleanTheme(d.theme);
  out.game = cleanGame(d.game);
  out.updated = typeof d.updated === 'string' ? d.updated : null;
  return out;
}
// backgrounds and colours: only known places and plain values (v5/custom.js turns them into CSS)
const HEX = /^#[0-9a-f]{3,8}$/i;
const IMG_URL = /^\/(media\/[0-9a-f]{40}\.[a-z0-9]+|src\/art\/[\w./-]+\.(webp|png|jpe?g|gif|svg))$/i;
function cleanTheme(t) {
  const out = {};
  if (!okJson(t)) return out;
  if (okJson(t.colors)) {
    const c = {};
    for (const k of THEME_COLORS) if (HEX.test(t.colors[k] || '')) c[k] = t.colors[k];
    if (Object.keys(c).length) out.colors = c;
  }
  if (okJson(t.bg)) {
    const bg = {};
    for (const k of Object.keys(BG_PLACES)) {
      const b = t.bg[k];
      if (!okJson(b)) continue;
      const o = {};
      if (HEX.test(b.color || '')) o.color = b.color;
      if (HEX.test(b.color2 || '')) o.color2 = b.color2;
      if (IMG_URL.test(b.image || '') && !b.image.includes('..')) o.image = b.image;
      if (Number.isFinite(+b.dim) && +b.dim > 0) o.dim = Math.min(95, Math.round(+b.dim));
      if (Number.isFinite(+b.angle) && b.angle !== '') o.angle = Math.round(+b.angle) % 360;
      if (['cover', 'contain', 'tile'].includes(b.fit)) o.fit = b.fit;
      if (['top', 'center', 'bottom'].includes(b.pos)) o.pos = b.pos;
      if (b.fixed === true) o.fixed = true;
      if (o.color || o.color2 || o.image) bg[k] = o;
    }
    if (Object.keys(bg).length) out.bg = bg;
  }
  return out;
}
// the Servants: a name, and the numbers of the NP/skill cards and of the plain deck cards (v5/data.js)
const int = (v, lo, hi) => (v !== '' && v != null && Number.isFinite(+v) ? Math.max(lo, Math.min(hi, Math.round(+v))) : null);
function cleanServant(sv, e) {
  if (!okJson(e)) return null;
  const o = {};
  if (typeof e.name === 'string' && e.name.trim()) o.name = e.name.trim().slice(0, 40);
  if (okJson(e.skills)) {
    const sk = {};
    sv.skills.forEach((_, j) => {
      const x = e.skills[j];
      if (!okJson(x)) return;
      const y = {};
      const p = int(x.power, 0, 30), m = int(x.mana, 0, 12);
      if (p != null) y.power = p;
      if (m != null) y.mana = m;
      if (Object.keys(y).length) sk[j] = y;
    });
    if (Object.keys(sk).length) o.skills = sk;
  }
  if (okJson(e.deck)) {
    const dk = {};
    sv.deck.forEach((c, j) => { const p = plainCard(c) ? int(e.deck[j], 0, 15) : null; if (p != null) dk[j] = p; });
    if (Object.keys(dk).length) o.deck = dk;
  }
  return Object.keys(o).length ? o : null;
}
function cleanGame(g) {
  const out = {};
  if (!okJson(g) || !okJson(g.servants)) return out;
  const svs = {};
  for (const sv of SERVANTS) { const e = cleanServant(sv, g.servants[sv.key]); if (e) svs[sv.key] = e; }
  if (Object.keys(svs).length) out.servants = svs;
  return out;
}
export const ready = (async () => {
  fs.mkdirSync(MEDIA, { recursive: true });
  if (ghOn()) {
    try {
      const f = await ghGet('overrides.json');
      if (f) { data = clean(JSON.parse(f.buf.toString('utf8'))); lastGood = f.sha; fs.writeFileSync(FILE, JSON.stringify(data)); applyGameEdits(data.game); return; }
    } catch (e) { console.error('admin: reading the GitHub copy failed:', e.message); }
  }
  try { data = clean(JSON.parse(fs.readFileSync(FILE, 'utf8'))); } catch { /* nothing edited yet */ }
  applyGameEdits(data.game);
})();

function save() {
  applyGameEdits(data.game); // the online games started from now on use the new numbers
  data.updated = new Date().toISOString();
  fs.writeFileSync(FILE, JSON.stringify(data));
  pushLater();
}
function mediaFile(id) { return path.join(MEDIA, id); }
async function readMedia(id) {
  const f = mediaFile(id);
  try { return fs.readFileSync(f); } catch { /* not on this disk: the GitHub copy */ }
  if (!ghOn()) return null;
  try {
    const g = await ghGet(`media/${id}`, true);
    if (!g) return null;
    fs.writeFileSync(f, g.buf);
    return g.buf;
  } catch { return null; }
}
async function addMedia(buf, ext) {
  const id = crypto.createHash('sha1').update(buf).digest('hex') + ext;
  const f = mediaFile(id);
  if (!fs.existsSync(f)) fs.writeFileSync(f, buf);
  if (ghOn()) await ghPutNew(`media/${id}`, buf).catch((e) => console.error('admin: GitHub upload failed:', e.message));
  return id;
}

// ---------- the GitHub copy (contents API on its own branch, so the game's branch never changes) ----------
async function gh(method, url, body, raw = false) {
  const r = await fetch(`${process.env.GITHUB_API || 'https://api.github.com'}/repos/${GH.repo}${url}`, {
    method,
    headers: { Authorization: `Bearer ${GH.token}`, Accept: raw ? 'application/vnd.github.raw' : 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'fdnc-admin', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return r;
}
let branchOk = false;
async function ensureBranch() {
  if (branchOk) return;
  const r = await gh('GET', `/git/ref/heads/${GH.branch}`);
  if (r.ok) { branchOk = true; return; }
  if (r.status !== 404) throw new Error(`branch check ${r.status}`);
  const repo = await (await gh('GET', '')).json();
  const head = await (await gh('GET', `/git/ref/heads/${repo.default_branch}`)).json();
  const c = await gh('POST', '/git/refs', { ref: `refs/heads/${GH.branch}`, sha: head.object.sha });
  if (!c.ok && c.status !== 422) throw new Error(`branch create ${c.status}`);
  branchOk = true;
}
export async function ghGet(p, raw = false) {
  const url = `/contents/admin-data/${p}?ref=${encodeURIComponent(GH.branch)}`;
  const r = await gh('GET', url, null, raw);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`GET ${p} ${r.status}`);
  if (raw) return { buf: Buffer.from(await r.arrayBuffer()) };
  const j = await r.json();
  return { sha: j.sha, buf: Buffer.from(j.content || '', 'base64') };
}
export async function ghPut(p, buf, sha) {
  await ensureBranch();
  return gh('PUT', `/contents/admin-data/${p}`, { message: `admin: ${p}`, content: buf.toString('base64'), branch: GH.branch, ...(sha ? { sha } : {}) });
}
async function ghPutNew(p, buf) { // a file named by its content: already there means already right
  const r = await ghPut(p, buf);
  if (!r.ok && r.status !== 422) throw new Error(`PUT ${p} ${r.status}`);
}
let pushing = null, again = false, pushTimer = null;
export const sync = { state: 'off', at: null, error: '' };
if (ghOn()) sync.state = 'ok';
function pushLater() {
  if (!ghOn()) return;
  sync.state = 'waiting';
  clearTimeout(pushTimer);
  pushTimer = setTimeout(pushNow, 1500);
}
async function pushNow() {
  if (pushing) { again = true; return; }
  pushing = (async () => {
    try {
      const buf = Buffer.from(JSON.stringify(data, null, 1));
      let r = await ghPut('overrides.json', buf, lastGood);
      if (r.status === 409 || r.status === 422) { // the id moved on: read it again and replace it
        const cur = await ghGet('overrides.json');
        r = await ghPut('overrides.json', buf, cur?.sha);
      }
      if (!r.ok) throw new Error(`GitHub ${r.status}`);
      lastGood = (await r.json()).content.sha;
      Object.assign(sync, { state: 'ok', at: new Date().toISOString(), error: '' });
    } catch (e) {
      Object.assign(sync, { state: 'error', error: e.message });
      console.error('admin: saving to GitHub failed:', e.message);
    }
  })();
  await pushing;
  pushing = null;
  if (again) { again = false; pushNow(); }
}

// ---------- what the game reads ----------
const safeJson = (o) => JSON.stringify(o).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
const pub = () => ({ strings: data.strings, dom: data.dom, css: data.css, theme: data.theme, game: data.game, sounds: Object.fromEntries(Object.entries(data.sounds).map(([k, v]) => [k, `/media/${v.id}`])), updated: data.updated });
// v5/index.html with the edits inline, read by v5/custom.js before anything is drawn
export function injectPage(html) {
  return html.replace('<script type="module"', `<script>window.__OVR=${safeJson(pub())};</script>\n    <script type="module"`);
}
// a replaced picture: what to send instead of the file at this address
export async function imageFor(urlPath) {
  const o = data.images[urlPath];
  if (!o) return null;
  const buf = await readMedia(o.id);
  return buf ? { buf, type: o.type || IMG[path.extname(o.id)] || 'application/octet-stream' } : null;
}

// ---------- requests ----------
const send = (res, code, body, type = 'application/json; charset=utf-8') => {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};
const notFound = (res) => { res.writeHead(404); res.end('not found'); };
function body(req, max) {
  return new Promise((resolve, reject) => {
    const parts = []; let n = 0;
    req.on('data', (c) => { n += c.length; if (n > max) { reject(Object.assign(new Error('ไฟล์ใหญ่เกินไป'), { code: 413 })); req.destroy(); } else parts.push(c); });
    req.on('end', () => resolve(Buffer.concat(parts)));
    req.on('error', reject);
  });
}
const json = async (req, max = MAX_JSON) => JSON.parse((await body(req, max)).toString('utf8'));

function walk(root, rel, out) {
  for (const e of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
    const r = path.posix.join(rel, e.name);
    if (e.isDirectory()) walk(root, r, out);
    else if (IMG[path.extname(e.name).toLowerCase()]) out.push({ path: `/${r}`, size: fs.statSync(path.join(root, r)).size });
  }
}
function pictures(root) {
  const out = [];
  for (const d of ['src/art', 'v5']) { try { walk(root, d, out); } catch { /* not there */ } }
  return out;
}

// Returns true when it answered the request (an admin address), false to let the normal pages run.
export async function handle(req, res, url, root) {
  const p = url.pathname;
  if (p === '/overrides.json') { await ready; send(res, 200, pub()); return true; }
  const m = p.match(/^\/media\/([0-9a-f]{40}\.[a-z0-9]+)$/);
  if (m) {
    await ready;
    const buf = await readMedia(m[1]);
    if (!buf) { notFound(res); return true; }
    const ext = path.extname(m[1]);
    const type = IMG[ext] || Object.entries(AUD).find(([, e]) => e === ext)?.[0] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'public, max-age=31536000, immutable' });
    res.end(buf);
    return true;
  }
  if (p === '/admin' || p === '/admin/') {
    if (!keyOk(req, url.searchParams.get('key'))) { notFound(res); return true; }
    send(res, 200, fs.readFileSync(new URL('./admin.html', import.meta.url)), 'text/html; charset=utf-8');
    return true;
  }
  if (!p.startsWith('/admin/api/')) return false;
  if (!keyOk(req, req.headers['x-admin-key'])) { notFound(res); return true; }
  await ready;
  try {
    await api(req, res, url, p.slice('/admin/api/'.length), root);
  } catch (e) {
    send(res, e.code === 413 ? 413 : 400, { error: e.message || 'ผิดพลาด' });
  }
  return true;
}

// more admin addresses from other parts of the server (accounts.mjs: the members), so this file
// does not import them: each is (req, res, what, method, query, { json, send }) → true when it answered
export const plugins = [];
async function api(req, res, url, what, root) {
  const q = url.searchParams;
  const M = req.method;
  for (const f of plugins) if (await f(req, res, what, M, q, { json, send })) return;
  if (what === 'state' && M === 'GET') {
    send(res, 200, { data, pictures: pictures(root), sounds: SFX_NAMES, langs: LANGS, storage: { dir: DIR, github: ghOn() ? `${GH.repo} (branch ${GH.branch})` : '', sync } });
    return;
  }
  if (what === 'text' && M === 'POST') { // one text: { part: 'strings' | 'dom', lang, key, value } (value null = back to the original)
    const b = await json(req);
    if (!['strings', 'dom'].includes(b.part) || !LANGS.includes(b.lang) || typeof b.key !== 'string' || !b.key) throw new Error('ข้อมูลไม่ถูกต้อง');
    const m = (data[b.part][b.lang] ||= {});
    if (typeof b.value === 'string') m[b.key] = b.value; else delete m[b.key];
    if (!Object.keys(m).length) delete data[b.part][b.lang];
    save();
    send(res, 200, { ok: true, updated: data.updated });
    return;
  }
  if (what === 'css' && M === 'POST') {
    const b = await json(req);
    if (typeof b.css !== 'string') throw new Error('ข้อมูลไม่ถูกต้อง');
    data.css = b.css;
    save();
    send(res, 200, { ok: true });
    return;
  }
  if (what === 'theme' && M === 'POST') { // { theme }: backgrounds and colours, all at once
    const b = await json(req);
    data.theme = cleanTheme(b.theme);
    save();
    send(res, 200, { ok: true, theme: data.theme });
    return;
  }
  if (what === 'servant' && M === 'POST') { // { key, edit }: one Servant's name and numbers (edit null = back to the original)
    const b = await json(req);
    const sv = SERVANTS.find((x) => x.key === b.key);
    if (!sv) throw new Error('ไม่มี Servant นี้');
    const e = cleanServant(sv, b.edit);
    const all = { ...(data.game.servants || {}) };
    if (e) all[sv.key] = e; else delete all[sv.key];
    data.game = Object.keys(all).length ? { servants: all } : {};
    save();
    send(res, 200, { ok: true, edit: e });
    return;
  }
  if (what === 'upload' && M === 'PUT') { // a picture of its own (a background), not in place of one of the site's
    const type = String(req.headers['content-type'] || '').split(';')[0].trim();
    const ext = Object.entries(IMG).find(([, t]) => t === type)?.[0];
    if (!ext) throw new Error('ใช้ได้เฉพาะรูป webp png jpg gif svg');
    const buf = await body(req, MAX_FILE);
    if (!buf.length) throw new Error('ไฟล์ว่าง');
    const id = await addMedia(buf, ext === '.jpeg' ? '.jpg' : ext);
    send(res, 200, { ok: true, url: `/media/${id}` });
    return;
  }
  if (what === 'image') {
    const target = q.get('path') || '';
    if (!pictures(root).some((x) => x.path === target)) throw new Error('ไม่มีรูปนี้ในเว็บ');
    if (M === 'DELETE') { delete data.images[target]; save(); send(res, 200, { ok: true }); return; }
    if (M === 'PUT') {
      const type = String(req.headers['content-type'] || '').split(';')[0].trim();
      const ext = Object.entries(IMG).find(([, t]) => t === type)?.[0];
      if (!ext) throw new Error('ใช้ได้เฉพาะรูป webp png jpg gif svg');
      const buf = await body(req, MAX_FILE);
      if (!buf.length) throw new Error('ไฟล์ว่าง');
      const id = await addMedia(buf, ext === '.jpeg' ? '.jpg' : ext);
      data.images[target] = { id, type, name: q.get('name') || '' };
      save();
      send(res, 200, { ok: true, id });
      return;
    }
  }
  if (what === 'sound') {
    const name = q.get('name') || '';
    if (!SFX_NAMES.includes(name)) throw new Error('ไม่มีเสียงนี้');
    if (M === 'DELETE') { delete data.sounds[name]; save(); send(res, 200, { ok: true }); return; }
    if (M === 'PUT') {
      const type = String(req.headers['content-type'] || '').split(';')[0].trim();
      const ext = AUD[type];
      if (!ext) throw new Error('ใช้ได้เฉพาะไฟล์เสียง mp3 wav ogg m4a webm');
      const buf = await body(req, MAX_FILE);
      if (!buf.length) throw new Error('ไฟล์ว่าง');
      const id = await addMedia(buf, ext);
      data.sounds[name] = { id, type, name: q.get('fname') || '' };
      save();
      send(res, 200, { ok: true, id, url: `/media/${id}` });
      return;
    }
  }
  if (what === 'backup' && M === 'GET') { // everything in one file, the pictures and sounds inside
    const files = {};
    const ids = [...Object.values(data.images), ...Object.values(data.sounds)].map((o) => o.id);
    for (const b of Object.values(data.theme.bg || {})) if (b.image?.startsWith('/media/')) ids.push(b.image.slice(7)); // backgrounds
    for (const id of new Set(ids)) {
      const buf = await readMedia(id);
      if (buf) files[id] = buf.toString('base64');
    }
    res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename="fdnc-admin-${new Date().toISOString().slice(0, 10)}.json"`, 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ kind: 'fdnc-admin-backup', data, files }));
    return;
  }
  if (what === 'restore' && M === 'POST') {
    const b = await json(req, MAX_BACKUP);
    if (b?.kind !== 'fdnc-admin-backup') throw new Error('ไม่ใช่ไฟล์สำรองของหน้าแอดมิน');
    const d = clean(b.data);
    for (const [id, b64] of Object.entries(okJson(b.files) ? b.files : {})) {
      if (!/^[0-9a-f]{40}\.[a-z0-9]+$/.test(id) || typeof b64 !== 'string') continue;
      const buf = Buffer.from(b64, 'base64');
      if (crypto.createHash('sha1').update(buf).digest('hex') + path.extname(id) !== id) continue; // a file that does not match its name
      await addMedia(buf, path.extname(id));
    }
    data = d;
    save();
    send(res, 200, { ok: true });
    return;
  }
  if (what === 'reset' && M === 'POST') { // back to the original site (the uploaded files stay in the backup branch)
    data = blank();
    save();
    send(res, 200, { ok: true });
    return;
  }
  send(res, 404, { error: 'ไม่มีคำสั่งนี้' });
}
