// One page's connection (B, 8 Nov 2026: members, profiles, the lobby, rooms). A page keeps one
// WebSocket while it is open: logging in, the room list, the lobby chat, friends, invitations, and
// its room (room.mjs) all go over it. Leaving a room keeps the connection.
import { T } from '../v5/i18n.js';
import { Rooms } from './room.mjs';
import * as A from './accounts.mjs';

const conns = new Set(); // { ws, ip, user, token, room, seat, lobby, said: [times] }
const byUid = new Map(); // uid → Set(conn)
const byWs = new Map();
const lobbyChat = []; // the last 80 messages of the lobby chat (not kept when the server restarts)
const say = (c, m) => { if (c.ws.open !== false) c.ws.send(JSON.stringify(m)); };
const toUid = (uid, m) => { for (const c of byUid.get(uid) || []) say(c, m); };

export const rooms = new Rooms({
  changed: () => roomsLater(),
  left: (ws, seat) => { const c = byWs.get(ws); if (c && c.seat === seat) { c.room = null; c.seat = null; if (c.user) presence(c.user); } },
  ended: (room, game, players) => {
    if (!players.some((p) => p.uid)) return; // only guests and bots: not kept
    A.recordMatch({ code: room.code, rounds: game.round, how: game.how || '', players });
    for (const p of players) if (p.uid) { const u = A.getUser(p.uid); if (u) toUid(u.id, { t: 'me', me: A.me(u) }); }
  },
});

// ---------- the room list, to every page looking at the lobby ----------
let roomsT = null;
function roomsLater() {
  if (roomsT) return;
  roomsT = setTimeout(() => { roomsT = null; const list = rooms.list(); for (const c of conns) if (c.lobby) say(c, { t: 'rooms', list }); }, 400);
}

// ---------- friends: who is online, and in which room ----------
function friendsOf(u) {
  const one = (uid) => {
    const v = A.getUser(uid);
    if (!v) return null;
    const at = rooms.seatOf(uid);
    const here = at && at.seat.ws ? { code: at.room.code, title: at.room.title, playing: !!(at.room.game && !at.room.game.over), n: at.room.seats.length } : null;
    return { ...A.card(v), on: byUid.has(uid), room: here };
  };
  return {
    t: 'friends',
    list: u.friends.map(one).filter(Boolean).sort((a, b) => b.on - a.on || !!b.room - !!a.room || a.name.localeCompare(b.name)),
    in: u.reqIn.map((id) => A.card(A.getUser(id))).filter(Boolean),
    out: u.reqOut.map((id) => A.card(A.getUser(id))).filter(Boolean),
  };
}
const sendFriends = (u) => { if (byUid.has(u.id)) toUid(u.id, friendsOf(u)); };
// u came, went, or moved: their friends' lists change
let presT = new Map();
function presence(u) {
  if (presT.has(u.id)) return;
  presT.set(u.id, setTimeout(() => { presT.delete(u.id); for (const f of u.friends) { const v = A.getUser(f); if (v) sendFriends(v); } }, 300));
}

function signIn(c, u, token) {
  signOut(c, false);
  c.user = u; c.token = token;
  if (!byUid.has(u.id)) byUid.set(u.id, new Set());
  const first = !byUid.get(u.id).size;
  byUid.get(u.id).add(c);
  const at = rooms.seatOf(u.id);
  say(c, { t: 'me', me: A.me(u), token, back: at && !(c.room === at.room) ? { code: at.room.code, title: at.room.title, playing: !!(at.room.game && !at.room.game.over) } : null });
  say(c, friendsOf(u));
  if (first) presence(u);
}
function signOut(c, tell = true) {
  const u = c.user;
  if (!u) return;
  const set = byUid.get(u.id);
  set?.delete(c);
  if (set && !set.size) { byUid.delete(u.id); presence(u); }
  c.user = null; c.token = null;
  if (tell) say(c, { t: 'me', me: null });
}
// the admin page banned, deleted, or reset a member: logged out everywhere now
A.setKick((uid) => {
  for (const c of [...(byUid.get(uid) || [])]) { signOut(c); say(c, { t: 'autherr', msg: T("ออกจากระบบแล้ว (แอดมินเปลี่ยนบัญชีนี้)") }); }
});

// ---------- the chat ----------
const CHAT_MAX = 200;
function chatOk(c) { // at most 1 message a second and 15 a minute
  const now = Date.now();
  c.said = (c.said || []).filter((t) => now - t < 60_000);
  if (c.said.length >= 15 || now - (c.said[c.said.length - 1] || 0) < 900) { say(c, { t: 'note', msg: T("ส่งข้อความเร็วเกินไป รอสักครู่") }); return false; }
  c.said.push(now);
  return true;
}
function chat(c, m) {
  const text = A.cleanText(m.text, CHAT_MAX);
  if (!text || !chatOk(c)) return;
  if (m.ch === 'room') { if (c.room && c.seat) c.room.say(c.seat, text); return; }
  if (!c.user) { say(c, { t: 'note', msg: T("เข้าสู่ระบบก่อนจึงคุยในล็อบบี้ได้") }); return; }
  const msg = { from: A.card(c.user), text, at: Date.now() };
  lobbyChat.push(msg);
  if (lobbyChat.length > 80) lobbyChat.shift();
  for (const x of conns) if (x.lobby) say(x, { t: 'chat', ch: 'lobby', msg });
}

// ---------- the connection ----------
const ipOf = (req) => String(req.headers['x-forwarded-for'] || '').split(',').pop().trim() || req.socket.remoteAddress || '?';
export function connect(ws, req) {
  const c = { ws, ip: ipOf(req), user: null, token: null, room: null, seat: null, lobby: false, q: Promise.resolve() };
  conns.add(c); byWs.set(ws, c);
  ws.on('message', (text) => {
    let m;
    try { m = JSON.parse(text); } catch { return; }
    if (!m || typeof m !== 'object' || typeof m.t !== 'string') return;
    // one after another, in the order sent (a sign-up still hashing its password comes before the room it creates)
    c.q = c.q.then(() => message(c, m)).catch((e) => { console.error(e); say(c, { t: 'note', msg: T("เกิดข้อผิดพลาด ลองใหม่อีกครั้ง") }); });
  });
  ws.on('close', () => {
    if (c.room && c.seat && c.seat.ws === ws) c.room.detach(c.seat);
    signOut(c, false);
    conns.delete(c); byWs.delete(ws);
  });
}

function enter(c, r, out) {
  if (out.error) return false;
  c.room = r; c.seat = out.seat;
  if (c.user) presence(c.user);
  return true;
}
function leaveRoom(c) {
  if (!c.seat) return;
  const r0 = c.room, s0 = c.seat;
  c.room = null; c.seat = null;
  if (s0.ws === c.ws) r0.detach(s0);
}

async function message(c, m) {
  const u = c.user;
  switch (m.t) {
    // ----- members -----
    case 'hello': { // { token }: the page's saved login
      const v = A.byToken(m.token);
      if (v) signIn(c, v, m.token); else { if (m.token) say(c, { t: 'me', me: null, expired: true }); else say(c, { t: 'me', me: null }); }
      return;
    }
    case 'signup': case 'login': {
      const out = m.t === 'signup' ? await A.signup(c.ip, m) : await A.login(c.ip, m);
      if (out.error) { say(c, { t: 'autherr', msg: out.error }); return; }
      signIn(c, out.user, out.token);
      return;
    }
    case 'logout': A.logout(c.token); signOut(c); return;
    case 'passwd': {
      if (!u) return;
      const out = await A.changePass(u, m);
      if (out.error) { say(c, { t: 'autherr', msg: out.error }); return; }
      for (const x of [...(byUid.get(u.id) || [])]) if (x !== c) { signOut(x); say(x, { t: 'autherr', msg: T("รหัสผ่านถูกเปลี่ยน เข้าสู่ระบบใหม่") }); }
      c.token = out.token;
      say(c, { t: 'me', me: A.me(u), token: out.token });
      say(c, { t: 'note', msg: T("เปลี่ยนรหัสผ่านแล้ว"), ok: true });
      return;
    }
    case 'profile.set': {
      if (!u) return;
      A.update(u, m);
      toUid(u.id, { t: 'me', me: A.me(u) });
      const at = rooms.seatOf(u.id);
      if (at) at.room.profile(u.id, u);
      presence(u);
      return;
    }
    case 'profile': { // { user } or { uid }
      const v = m.uid ? A.getUser(m.uid) : A.findUser(m.user);
      say(c, { t: 'profile', p: A.profile(v, u), q: m.user || m.uid || '' });
      return;
    }
    case 'top': say(c, { t: 'top', list: A.top() }); return;
    // ----- friends -----
    case 'friends': if (u) say(c, friendsOf(u)); return;
    case 'friend.add': case 'friend.ok': case 'friend.del': {
      if (!u) return;
      const out = m.t === 'friend.add' ? A.friendAdd(u, m.user) : m.t === 'friend.ok' ? A.friendAccept(u, m.uid) : A.friendRemove(u, m.uid);
      if (out.error) { say(c, { t: 'note', msg: out.error }); return; }
      sendFriends(u);
      if (out.other) {
        sendFriends(out.other);
        if (m.t === 'friend.add' && out.other.reqIn.includes(u.id)) toUid(out.other.id, { t: 'friendreq', from: A.card(u) });
      }
      return;
    }
    case 'invite': { // { uid }: a friend, to the room you are in
      if (!u || !c.room || !u.friends.includes(m.uid)) return;
      if (!byUid.has(m.uid)) { say(c, { t: 'note', msg: T("เพื่อนคนนี้ไม่ได้ออนไลน์อยู่") }); return; }
      toUid(m.uid, { t: 'invited', from: A.card(u), code: c.room.code, title: c.room.title });
      say(c, { t: 'note', msg: T("ส่งคำเชิญแล้ว"), ok: true });
      return;
    }
    // ----- the lobby -----
    case 'rooms': // { on }: this page shows the lobby (the room list and the lobby chat come as they change)
      c.lobby = m.on !== false;
      if (c.lobby) { say(c, { t: 'rooms', list: rooms.list() }); say(c, { t: 'chatlog', ch: 'lobby', list: lobbyChat }); }
      return;
    case 'chat': chat(c, m); return;
    // ----- rooms -----
    case 'create': case 'join': case 'resume': case 'quick': {
      leaveRoom(c);
      let r;
      if (m.t === 'create') r = rooms.create({ title: m.title, pub: m.pub !== false });
      else if (m.t === 'quick') r = rooms.quick() || rooms.create({ pub: true });
      else r = rooms.get(m.code);
      if (!r) { say(c, { t: 'error', msg: T("ไม่พบห้องนี้ (รหัสผิด หรือห้องปิดไปแล้ว)"), code: m.code, gone: true }); return; }
      const out = m.t === 'resume' ? r.resume(c.ws, m.token) : r.join(c.ws, m.name, A.card(u));
      if (out.error) {
        // a member whose saved seat is gone, but who still sits in this room (another device): back to it
        if (m.t === 'resume' && u && r.seats.some((s) => s.uid === u.id)) { enter(c, r, r.join(c.ws, m.name, A.card(u))); return; }
        say(c, { t: 'error', msg: out.error, code: m.code, gone: m.t === 'resume' });
        return;
      }
      enter(c, r, out);
      return;
    }
    default:
      if (c.room && c.seat && c.seat.ws === c.ws) c.room.message(c.seat, m);
  }
}
