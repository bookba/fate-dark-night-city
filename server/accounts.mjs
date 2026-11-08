// Members (B, 8 Nov 2026: "ทำระบบสมาชิก โปรไฟล์ ล็อบบี้ ห้อง และอย่างอื่นที่เห็นว่าจำเป็น").
// - Sign up with a username and password (no e-mail): the password is kept only as a scrypt hash.
// - A login gives the page a token (kept in its localStorage); the server keeps only its hash.
// - Profile: display name, picture (a Servant's art or a Master's colour), a short text, the
//   numbers of every game played online, and the last 30 games.
// - Friends: a request, accepted by the other; friends see who is online and in which room, and
//   can be invited to a room.
// - Everything is one JSON. It is kept in DATA_DIR and, when GITHUB_TOKEN is set (as for the admin
//   page), in the admin-data branch as admin-data/accounts.bin, ENCRYPTED (AES-256-GCM) with
//   ACCOUNTS_KEY, because the repo is public and Render's free disk is wiped when the server sleeps.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { T } from '../v5/i18n.js';
import { MASTERS, SERVANTS } from '../v5/data.js';
import { ghOn, ghGet, ghPut } from './admin.mjs';

const scrypt = promisify(crypto.scrypt);
const DIR = path.resolve(process.env.DATA_DIR || fileURLToPath(new URL('./data', import.meta.url)));
const FILE = path.join(DIR, 'accounts.json');
const GH_FILE = 'accounts.bin';
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();
// the key of the GitHub copy: ACCOUNTS_KEY (render.yaml makes one), or one made from GITHUB_TOKEN
const KEYS = [process.env.ACCOUNTS_KEY?.trim() && sha(`fdnc-accounts:${process.env.ACCOUNTS_KEY.trim()}`), process.env.GITHUB_TOKEN?.trim() && sha(`fdnc-accounts-token:${process.env.GITHUB_TOKEN.trim()}`)].filter(Boolean);
const SESSION_DAYS = 60;
const HIST = 30; // games kept in each profile
const MATCHES = 300; // games kept in all
export const AVATARS = [...SERVANTS.map((s) => `sv:${s.key}`), ...MASTERS.map((m) => `m:${m.key}`)];

const blank = () => ({ v: 1, users: {}, sessions: {}, matches: [] });
let db = blank();
const byName = new Map(); // username (lower case) → uid

// ---------- keeping it ----------
function seal(buf) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', KEYS[0], iv);
  const out = Buffer.concat([c.update(buf), c.final()]);
  return Buffer.concat([Buffer.from('FDNC1'), iv, c.getAuthTag(), out]);
}
function unseal(buf) {
  if (buf.subarray(0, 5).toString() !== 'FDNC1') throw new Error('not an accounts file');
  for (const k of KEYS) {
    try {
      const d = crypto.createDecipheriv('aes-256-gcm', k, buf.subarray(5, 17));
      d.setAuthTag(buf.subarray(17, 33));
      return Buffer.concat([d.update(buf.subarray(33)), d.final()]);
    } catch { /* the other key */ }
  }
  throw new Error('the accounts file does not open with ACCOUNTS_KEY (was it changed?)');
}
const ghUse = () => ghOn() && KEYS.length > 0;
let ghSha = null;
let readOnlyGh = false; // the GitHub copy could not be read: it is not overwritten
export const store = { state: 'disk', error: '', at: null, loaded: false };

function index() {
  byName.clear();
  for (const u of Object.values(db.users)) byName.set(u.user.toLowerCase(), u.id);
}
function okDb(d) { return d && typeof d === 'object' && d.users && typeof d.users === 'object'; }
export const ready = (async () => {
  fs.mkdirSync(DIR, { recursive: true });
  let disk = null;
  try { disk = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { /* none yet */ }
  if (ghUse()) {
    try {
      let f = await ghGet(GH_FILE);
      if (f && !f.buf.length) { const raw = await ghGet(GH_FILE, true); f = { sha: f.sha, buf: raw?.buf || Buffer.alloc(0) }; } // over 1 MB: the contents API gives the file only raw
      if (f) {
        ghSha = f.sha;
        const d = JSON.parse(unseal(f.buf).toString('utf8'));
        // the newer of the two (a disk that outlived a restart may be ahead of GitHub)
        db = okDb(disk) && (disk.saved || '') > (d.saved || '') ? disk : d;
      } else if (okDb(disk)) db = disk;
      store.state = 'github';
    } catch (e) {
      console.error('accounts: reading the GitHub copy failed:', e.message);
      Object.assign(store, { state: 'error', error: e.message });
      if (okDb(disk)) db = disk;
      readOnlyGh = true; // never overwrite a copy that could not be read
    }
  } else if (okDb(disk)) db = disk;
  if (!okDb(db)) db = blank();
  db.sessions ||= {}; db.matches ||= [];
  for (const u of Object.values(db.users)) { u.friends ||= []; u.reqIn ||= []; u.reqOut ||= []; u.hist ||= []; u.stats ||= newStats(); }
  index();
  store.loaded = true;
})();

let diskT = null, ghT = null, ghFirst = 0, pushing = null, againPush = false;
function save() {
  db.saved = new Date().toISOString();
  clearTimeout(diskT);
  diskT = setTimeout(() => { try { fs.writeFileSync(FILE, JSON.stringify(db)); } catch (e) { console.error('accounts: disk', e.message); } }, 300);
  if (!ghUse() || readOnlyGh) return;
  // to GitHub 10 s after the last change, at most 60 s after the first one
  const now = Date.now();
  if (!ghT) ghFirst = now;
  clearTimeout(ghT);
  ghT = setTimeout(push, Math.max(0, Math.min(10_000, ghFirst + 60_000 - now)));
}
async function push() {
  ghT = null;
  if (pushing) { againPush = true; return pushing; }
  pushing = (async () => {
    try {
      const buf = seal(Buffer.from(JSON.stringify(db)));
      let r = await ghPut(GH_FILE, buf, ghSha);
      if (r.status === 409 || r.status === 422) { const cur = await ghGet(GH_FILE); r = await ghPut(GH_FILE, buf, cur?.sha); }
      if (!r.ok) throw new Error(`GitHub ${r.status}`);
      ghSha = (await r.json()).content.sha;
      Object.assign(store, { state: 'github', error: '', at: new Date().toISOString() });
    } catch (e) {
      Object.assign(store, { state: 'error', error: e.message });
      console.error('accounts: saving to GitHub failed:', e.message);
    }
  })();
  await pushing;
  pushing = null;
  if (againPush) { againPush = false; await push(); }
}
// Render stops the server with SIGTERM (sleeping, a new deploy): what is waiting is saved first
export async function flush() {
  clearTimeout(diskT);
  try { fs.writeFileSync(FILE, JSON.stringify(db)); } catch { /* the disk is going anyway */ }
  if (ghT) { clearTimeout(ghT); await push(); } else if (pushing) await pushing;
}

// ---------- the rules of names ----------
const USER_RX = /^[A-Za-z0-9_]{3,16}$/;
export const cleanText = (s, n) => String(s ?? '').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, n);
const newStats = () => ({ games: 0, wins: 0, vp: 0, best: 0, top3: 0, masters: {} });

// ---------- too many tries ----------
const tries = new Map(); // `${kind}:${ip}` → { n, since }
function limited(kind, ip, max, ms) {
  const k = `${kind}:${ip}`, now = Date.now();
  let t = tries.get(k);
  if (!t || now - t.since > ms) t = { n: 0, since: now };
  t.n += 1;
  if (tries.size > 20000) tries.clear();
  tries.set(k, t);
  return t.n > max;
}
const err = (msg) => ({ error: msg });

// ---------- signing up, logging in ----------
async function hashPass(pass, salt = crypto.randomBytes(16)) {
  const h = await scrypt(String(pass).normalize('NFKC'), salt, 32, { N: 16384, r: 8, p: 1 });
  return `s1$${salt.toString('base64')}$${h.toString('base64')}`;
}
async function passOk(pass, stored) {
  const [, salt, h] = String(stored || '').split('$');
  if (!salt || !h) return false;
  const again = (await hashPass(pass, Buffer.from(salt, 'base64'))).split('$')[2];
  return crypto.timingSafeEqual(Buffer.from(again), Buffer.from(h));
}
function newSession(u) {
  const token = crypto.randomBytes(24).toString('base64url');
  db.sessions[sha(token).toString('hex')] = { uid: u.id, exp: Date.now() + SESSION_DAYS * 864e5 };
  // old sessions out
  const now = Date.now();
  for (const [k, s] of Object.entries(db.sessions)) if (s.exp < now || !db.users[s.uid]) delete db.sessions[k];
  return token;
}

export async function signup(ip, { user, pass, name }) {
  await ready;
  user = String(user || '').trim();
  if (!USER_RX.test(user)) return err(T("ชื่อผู้ใช้ต้องเป็นตัวอังกฤษ ตัวเลข หรือ _ ยาว 3–16 ตัว"));
  if (typeof pass !== 'string' || pass.length < 6 || pass.length > 100) return err(T("รหัสผ่านต้องยาว 6 ตัวขึ้นไป"));
  if (byName.has(user.toLowerCase())) return err(T("ชื่อผู้ใช้นี้มีคนใช้แล้ว"));
  if (limited('signup', ip, 6, 60 * 60_000)) return err(T("สมัครจากเครื่องนี้บ่อยเกินไป ลองใหม่ภายหลัง"));
  const id = crypto.randomUUID();
  const u = {
    id, user, name: cleanText(name, 16) || user, pass: await hashPass(pass), avatar: `sv:${SERVANTS[crypto.randomInt(SERVANTS.length)].key}`, bio: '',
    created: new Date().toISOString(), last: new Date().toISOString(), friends: [], reqIn: [], reqOut: [], stats: newStats(), hist: [],
  };
  db.users[id] = u; byName.set(user.toLowerCase(), id);
  const token = newSession(u);
  save();
  return { token, user: u };
}
export async function login(ip, { user, pass }) {
  await ready;
  if (limited('login', ip, 10, 15 * 60_000)) return err(T("ใส่รหัสผิดบ่อยเกินไป รอ 15 นาทีแล้วลองใหม่"));
  const u = db.users[byName.get(String(user || '').trim().toLowerCase())];
  if (!u || !(await passOk(pass, u.pass))) return err(T("ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง"));
  if (u.banned) return err(T("บัญชีนี้ถูกระงับ"));
  tries.delete(`login:${ip}`);
  u.last = new Date().toISOString();
  const token = newSession(u);
  save();
  return { token, user: u };
}
export function byToken(token) {
  if (typeof token !== 'string' || !token) return null;
  const k = sha(token).toString('hex');
  const s = db.sessions[k];
  if (!s || s.exp < Date.now()) return null;
  const u = db.users[s.uid];
  if (!u || u.banned) return null;
  if (s.exp - Date.now() < (SESSION_DAYS - 1) * 864e5) { s.exp = Date.now() + SESSION_DAYS * 864e5; u.last = new Date().toISOString(); save(); } // kept alive by use, once a day
  return u;
}
export function logout(token) {
  if (typeof token !== 'string') return;
  if (delete db.sessions[sha(token).toString('hex')]) save();
}
export async function changePass(u, { old, pass }) {
  if (!(await passOk(old, u.pass))) return err(T("รหัสผ่านเดิมไม่ถูกต้อง"));
  if (typeof pass !== 'string' || pass.length < 6 || pass.length > 100) return err(T("รหัสผ่านต้องยาว 6 ตัวขึ้นไป"));
  u.pass = await hashPass(pass);
  for (const [k, s] of Object.entries(db.sessions)) if (s.uid === u.id) delete db.sessions[k]; // every other device logs out
  const token = newSession(u);
  save();
  return { token };
}

// ---------- profiles ----------
export const getUser = (uid) => db.users[uid] || null;
export const findUser = (name) => db.users[byName.get(String(name || '').trim().toLowerCase())] || null;
// what anybody may see of a member
export const card = (u) => (u ? { uid: u.id, user: u.user, name: u.name, avatar: u.avatar } : null);
export function me(u) {
  return { ...card(u), bio: u.bio, created: u.created, stats: u.stats };
}
export function profile(u, viewer) {
  if (!u) return null;
  const rel = !viewer ? '' : viewer.id === u.id ? 'me' : u.friends.includes(viewer.id) ? 'friend' : u.reqIn.includes(viewer.id) ? 'sent' : u.reqOut.includes(viewer.id) ? 'asked' : '';
  return { ...card(u), bio: u.bio, created: u.created, stats: u.stats, hist: u.hist, rel };
}
export function update(u, { name, avatar, bio }) {
  if (name !== undefined) u.name = cleanText(name, 16) || u.name;
  if (avatar !== undefined && AVATARS.includes(avatar)) u.avatar = avatar;
  if (bio !== undefined) u.bio = cleanText(bio, 140);
  save();
}

// ---------- friends ----------
const drop = (a, x) => { const i = a.indexOf(x); if (i >= 0) a.splice(i, 1); };
export function friendAdd(u, name) {
  const v = findUser(name);
  if (!v) return err(T("ไม่พบชื่อผู้ใช้นี้"));
  if (v.id === u.id) return err(T("เพิ่มตัวเองเป็นเพื่อนไม่ได้"));
  if (u.friends.includes(v.id)) return err(T("เป็นเพื่อนกันอยู่แล้ว"));
  if (u.friends.length >= 200) return err(T("มีเพื่อนครบ 200 คนแล้ว"));
  if (u.reqIn.includes(v.id)) return friendAccept(u, v.id); // they asked first: now friends
  if (!u.reqOut.includes(v.id)) { u.reqOut.push(v.id); v.reqIn.push(u.id); }
  if (v.reqIn.length > 100) { const old = v.reqIn.shift(); drop(db.users[old]?.reqOut || [], v.id); }
  save();
  return { ok: true, other: v };
}
export function friendAccept(u, uid) {
  const v = db.users[uid];
  if (!v || !u.reqIn.includes(uid)) return err(T("ไม่พบคำขอนี้"));
  drop(u.reqIn, uid); drop(v.reqOut, u.id);
  if (!u.friends.includes(uid)) u.friends.push(uid);
  if (!v.friends.includes(u.id)) v.friends.push(u.id);
  save();
  return { ok: true, other: v };
}
export function friendRemove(u, uid) { // unfriend, decline, or take back a request
  const v = db.users[uid];
  drop(u.friends, uid); drop(u.reqIn, uid); drop(u.reqOut, uid);
  if (v) { drop(v.friends, u.id); drop(v.reqIn, u.id); drop(v.reqOut, u.id); }
  save();
  return { ok: true, other: v };
}

// ---------- games ----------
// players: [{ uid|null, name, master, servant, vp, out, outRound, winner }] in the order they finished
export function recordMatch({ code, rounds, how, players }) {
  const at = new Date().toISOString();
  const id = crypto.randomUUID().slice(0, 8);
  const humans = players.filter((p) => p.uid).length;
  db.matches.push({ id, at, code, rounds, how, players });
  if (db.matches.length > MATCHES) db.matches.splice(0, db.matches.length - MATCHES);
  players.forEach((p, i) => {
    const u = p.uid && db.users[p.uid];
    if (!u) return;
    const s = u.stats;
    s.games += 1; s.vp += p.vp; s.best = Math.max(s.best, p.vp);
    if (p.winner) s.wins += 1;
    if (i < 3) s.top3 += 1;
    const ms = (s.masters[p.master] ||= { g: 0, w: 0 });
    ms.g += 1; if (p.winner) ms.w += 1;
    u.hist.unshift({ id, at, rounds, place: i + 1, n: players.length, humans, master: p.master, servant: p.servant, vp: p.vp, win: !!p.winner, with: players.filter((q) => q !== p && q.uid).map((q) => q.name).slice(0, 6) });
    if (u.hist.length > HIST) u.hist.length = HIST;
  });
  save();
}
// the ranking: most wins, then the best share of wins, then most games
export function top(n = 50) {
  return Object.values(db.users).filter((u) => u.stats.games > 0 && !u.banned)
    .sort((a, b) => b.stats.wins - a.stats.wins || b.stats.wins / b.stats.games - a.stats.wins / a.stats.games || b.stats.games - a.stats.games)
    .slice(0, n).map((u) => ({ ...card(u), games: u.stats.games, wins: u.stats.wins, best: u.stats.best }));
}

// ---------- the admin page: the members tab ----------
let kick = () => {}; // set by hub.mjs: log a member out everywhere now
export const setKick = (f) => { kick = f; };
export async function adminApi(req, res, what, M, q, { json, send }) {
  if (!what.startsWith('users')) return false;
  await ready;
  if (what === 'users' && M === 'GET') {
    const f = String(q.get('q') || '').toLowerCase();
    const list = Object.values(db.users).filter((u) => !f || u.user.toLowerCase().includes(f) || u.name.toLowerCase().includes(f))
      .sort((a, b) => (b.last || '').localeCompare(a.last || '')).slice(0, 300)
      .map((u) => ({ uid: u.id, user: u.user, name: u.name, created: u.created, last: u.last, games: u.stats.games, wins: u.stats.wins, friends: u.friends.length, banned: !!u.banned }));
    send(res, 200, { total: Object.keys(db.users).length, list, store: { ...store, github: ghUse(), key: !!process.env.ACCOUNTS_KEY?.trim() }, matches: db.matches.slice(-30).reverse() });
    return true;
  }
  if (what === 'users/act' && M === 'POST') {
    const b = await json(req);
    const u = db.users[b.uid];
    if (!u) { send(res, 400, { error: 'ไม่พบสมาชิกนี้' }); return true; }
    const out = { ok: true };
    if (b.act === 'ban' || b.act === 'unban') { u.banned = b.act === 'ban'; if (u.banned) { for (const [k, s] of Object.entries(db.sessions)) if (s.uid === u.id) delete db.sessions[k]; kick(u.id); } }
    else if (b.act === 'reset') { // a new password, shown once on the admin page, for a member who forgot theirs
      const pass = crypto.randomBytes(6).toString('base64url');
      u.pass = await hashPass(pass);
      for (const [k, s] of Object.entries(db.sessions)) if (s.uid === u.id) delete db.sessions[k];
      kick(u.id);
      out.pass = pass;
    } else if (b.act === 'rename') u.name = cleanText(b.name, 16) || u.name;
    else if (b.act === 'delete') {
      for (const v of Object.values(db.users)) { drop(v.friends, u.id); drop(v.reqIn, u.id); drop(v.reqOut, u.id); }
      for (const [k, s] of Object.entries(db.sessions)) if (s.uid === u.id) delete db.sessions[k];
      delete db.users[u.id]; byName.delete(u.user.toLowerCase());
      kick(u.id);
    } else { send(res, 400, { error: 'ไม่มีคำสั่งนี้' }); return true; }
    save();
    send(res, 200, out);
    return true;
  }
  return false;
}
