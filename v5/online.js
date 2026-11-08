// Online play, the page side (B, 3 Nov 2026: "เพิ่มระบบออนไลน์"). The server (server/) runs the one
// real game; this page keeps a copy (net.js) and main.js draws it as it draws a game against bots.
// A room has up to 7 people, one per Master; seats nobody takes are bots. Questions the game asks
// you arrive here and go to main.js's decide(), and your answer goes back to the server.
//
// Members, profiles, the lobby, rooms (B, 8 Nov 2026: "ทำระบบสมาชิก โปรไฟล์ ล็อบบี้ ห้อง และอย่างอื่นที่
// เห็นว่าจำเป็น"): sign up / log in (or play as a guest), a profile with the numbers and the last
// games, the room list with quick join, the lobby chat, the room chat (also during the game, 💬 in
// the bar), friends (online, in which room, invite), and the ranking. The server side is
// server/hub.mjs and server/accounts.mjs.
import { T, TX } from './i18n.js';
// the server's texts come in Thai (errors, default names, the war log of the events): shown in the page's language
const txDeep = (v) => (typeof v === 'string' ? TX(v) : Array.isArray(v) ? v.map(txDeep) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, txDeep(x)])) : v);
import { MASTERS, SERVANTS } from './game.js';
import { SV_ART } from './art.js';
import { Mirror } from './net.js';

const SAVE = 'dgw-v5-online'; // { code, token, name }: come back to your seat after a reload
const load = () => { try { return JSON.parse(localStorage.getItem(SAVE)) || {}; } catch { return {}; } };
const save = (v) => { try { localStorage.setItem(SAVE, JSON.stringify(v)); } catch { /* a private window forgets */ } };
const ACC = 'dgw-account'; // the login token of this browser
const accToken = () => { try { return localStorage.getItem(ACC) || ''; } catch { return ''; } };
const accSave = (t) => { try { if (t) localStorage.setItem(ACC, t); else localStorage.removeItem(ACC); } catch { /* not kept */ } };

export const online = {
  on: false, // in a room
  hooks: null, // set by main.js
  ws: null, code: null, token: null, room: null, gameNo: 0, mirror: null, me: null,
  asked: null, // the question main.js is answering: { id, kind }
  turn: null, turnAt: 0, people: {}, note: '', tries: 0, wantLobby: false,
};
// the member side: who you are, the lobby, friends, chat
const acc = {
  me: null, known: false, // known: the server answered "hello"
  view: 'rooms', // rooms | chat | friends | top | profile | auth
  authMode: 'login', authErr: '', busy: false,
  rooms: null, friends: { list: [], in: [], out: [] }, top: null,
  prof: null, profQ: '', edit: false,
  back: null, // your seat in a room, open on another page or device
  chat: { lobby: [], room: [] }, unread: 0, chatOpen: false,
  opened: false, // the connection has worked once (so it is worth reconnecting)
};
const H = () => online.hooks;
const esc = (s) => H().esc(s);
const send = (m) => { if (online.ws?.readyState === 1) online.ws.send(JSON.stringify(m)); };

// ---------- the connection ----------
function wsUrl() {
  const q = new URLSearchParams(location.search).get('server'); // ?server=wss://… when the page is hosted elsewhere
  if (q) return q;
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
}
function connect(first) {
  if (online.ws && online.ws.readyState <= 1) { if (online.ws.readyState === 1) first(); else online.ws.addEventListener('open', first, { once: true }); return; }
  let ws;
  try { ws = new WebSocket(wsUrl()); } catch { fail(); return; }
  online.ws = ws;
  ws.addEventListener('open', () => {
    online.tries = 0; acc.opened = true;
    ws.send(JSON.stringify({ t: 'hello', token: accToken() })); // who you are, first
    if (!online.on) ws.send(JSON.stringify({ t: 'rooms', on: true }));
    first();
  });
  ws.addEventListener('message', (ev) => { let m; try { m = JSON.parse(ev.data); } catch { return; } onMsg(m); });
  ws.addEventListener('close', () => {
    if (online.ws !== ws) return;
    online.ws = null;
    const again = (go) => setTimeout(() => connect(go), Math.min(8000, 1000 * 2 ** online.tries++));
    if (online.on && online.token) { // try again: 1, 2, 4… seconds, the seat waits on the server
      online.note = T("หลุดจากเซิร์ฟเวอร์ กำลังต่อใหม่…");
      badge();
      again(() => send({ t: 'resume', code: online.code, token: online.token }));
    } else if (acc.opened && (acc.me || showing())) again(() => {}); // logged in or looking at the lobby: keep the friends and invitations coming
    else if (!online.on) fail();
  });
}
function fail() {
  online.note = T("ต่อเซิร์ฟเวอร์เกมไม่ได้ · เล่นออนไลน์ได้เมื่อเปิดเกมจากเว็บของเซิร์ฟเวอร์ (ดู server/README.md)");
  if (showing()) lobby();
}
const $m = () => document.querySelector('#modal');
const showing = () => !$m().hidden && !!$m().querySelector('.dlg.online');
// the address shows ?room=CODE while in a room, so it can be shared or reloaded
function setUrl(code) {
  const q = new URLSearchParams(location.search);
  if (code) q.set('room', code); else q.delete('room');
  history.replaceState(null, '', `${location.pathname}${q.size ? `?${q}` : ''}`);
}
const redraw = () => { if (showing()) lobby(); };

function onMsg(m) {
  if (m.t === 'error' || m.t === 'autherr' || m.t === 'note') m = { ...m, msg: TX(m.msg) };
  if (m.t === 'lobby') { const title = m.title; m = txDeep(m); m.title = title; } // the room's name is the host's own words
  if (m.t === 'error') {
    online.note = m.msg;
    // a room that is gone (closed, the server restarted, opened on another device): forget it
    if (m.gone) { if (m.code === online.code) { leftRoom(); } if (String(m.code || '').toUpperCase() === load().code) save({ name: load().name }); setUrl(null); }
    lobby();
    return;
  }
  if (m.t === 'joined') {
    if (online.code && online.code !== m.code) leftRoom(true); // another room: the last one's game is not this one
    online.on = true; online.code = m.code; online.token = m.token; online.note = '';
    acc.back = null; acc.chat.room = []; acc.unread = 0; acc.view = 'room';
    save({ code: m.code, token: m.token, name: load().name });
    setUrl(m.code);
    send({ t: 'rooms', on: false });
    return;
  }
  if (m.t === 'lobby') {
    online.room = m;
    badge();
    // the lobby shows before the first game, or when you asked to see it
    if (online.wantLobby || (!m.playing && !m.over)) lobby();
    return;
  }
  if (m.t === 'state') { onState(m); return; }
  // ----- members -----
  if (m.t === 'me') {
    const was = acc.me;
    acc.known = true; acc.me = m.me; acc.busy = false;
    if (m.token) accSave(m.token);
    if (!m.me && (m.expired || was)) accSave('');
    if (m.back !== undefined) acc.back = m.back && m.back.code !== online.code ? m.back : null;
    if (m.me && acc.view === 'auth') { acc.view = 'rooms'; acc.authErr = ''; }
    if (!m.me && ['friends', 'profile'].includes(acc.view) && acc.prof?.rel === 'me') acc.view = 'rooms';
    if (acc.prof && m.me && acc.prof.uid === m.me.uid) acc.prof = { ...acc.prof, ...m.me };
    redraw();
    return;
  }
  if (m.t === 'autherr') { acc.authErr = m.msg; acc.busy = false; if (!acc.me && acc.view !== 'auth' && showing()) acc.view = 'auth'; redraw(); return; }
  if (m.t === 'note') { H().toast(m.msg, m.ok ? 'reveal' : ''); return; }
  if (m.t === 'rooms') { acc.rooms = m.list; if (acc.view === 'rooms' && !online.on) redraw(); return; }
  if (m.t === 'friends') { acc.friends = m; if (acc.view === 'friends' || online.on) redraw(); return; }
  if (m.t === 'top') { acc.top = m.list; if (acc.view === 'top') redraw(); return; }
  if (m.t === 'profile') { if (m.q === acc.profQ) { acc.prof = m.p || { missing: true }; redraw(); } return; }
  if (m.t === 'chatlog') { acc.chat[m.ch] = m.list || []; redraw(); drawChat(); return; }
  if (m.t === 'chat') {
    const list = acc.chat[m.ch];
    list.push(m.msg);
    if (list.length > 80) list.shift();
    if (m.ch === 'room' && !acc.chatOpen && !(showing() && online.on) && m.msg.from?.uid !== acc.me?.uid) { acc.unread++; badge(); }
    addChatLine(m.ch, m.msg);
    return;
  }
  if (m.t === 'friendreq') { notice(T("{0} ขอเป็นเพื่อนกับคุณ", m.from.name), [[T("ดูคำขอ"), () => { acc.view = 'friends'; openOnline(); }]]); return; }
  if (m.t === 'invited') {
    if (m.code === online.code) return;
    notice(T("{0} ชวนคุณเข้าห้อง {1}", m.from.name, m.title || m.code), [[T("เข้าห้อง"), () => joinRoom(m.code)]]);
  }
}
// you are out of the room (left, the room is gone, or another room): the board's game is over for this page
function leftRoom(keepBoard = false) {
  if (online.asked) { H().drop(); online.asked = null; }
  online.on = false; online.code = null; online.token = null; online.room = null; online.gameNo = 0; online.mirror = null; online.wantLobby = false;
  acc.chat.room = []; acc.unread = 0; acc.chatOpen = false; drawChat();
  badge();
  if (!keepBoard) send({ t: 'rooms', on: true });
}

function onState(m) {
  const fresh = m.game !== online.gameNo;
  if (fresh) { online.gameNo = m.game; online.mirror = new Mirror(); online.asked = null; online.wantLobby = false; }
  const root = online.mirror.apply(m.data, m.full);
  online.me = m.me; online.turn = m.turn; online.turnAt = Date.now(); online.people = m.people || {};
  if (fresh) H().begin(root.g); else H().render();
  for (const e of m.events || []) H().event(e.type === 'book' ? { type: 'book', p: root.g.players[e.pid] } : txDeep(e));
  // a question for you: main.js asks it; one you were answering that the server closed (time ran out) goes away
  if (online.asked && online.asked.id !== m.ask?.id) { H().drop(); online.asked = null; }
  if (m.ask && !online.asked) {
    const a = { id: m.ask.id, kind: m.ask.kind };
    online.asked = a;
    H().ask(a.kind, root.ctx).then((v) => {
      if (online.asked !== a) return;
      online.asked = null;
      send({ t: 'answer', id: a.id, v: v ?? null });
    });
  }
  badge();
}

// the cards you have picked so far, so a timeout uses them (paper 4.6 item 21)
setInterval(() => {
  if (online.asked?.kind === 'cards') { const d = H().draft(); if (d) send({ t: 'draft', id: online.asked.id, v: { ids: d.ids, down: d.down, cs4: d.cs4, cs2: d.cs2, gemMana: d.gemMana, gandr: d.gandr, gate: d.gate, moveTo: d.moveTo, mover: d.mover, csMove: d.csMove, rbTarget: d.rbTarget } }); }
}, 1500);

// ---------- pictures of people ----------
// a member's picture: "sv:<Servant>" (its art, or its class crest) or "m:<Master>" (the Master's colour and letters)
export function avatar(a, size = 32) {
  const [k, key] = String(a || '').split(':');
  const st = `width:${size}px;height:${size}px`;
  if (k === 'sv') {
    const sv = SERVANTS.find((s) => s.key === key);
    if (sv && SV_ART[sv.key]) return `<img class="onav" style="${st}" src="${SV_ART[sv.key]}" alt="">`;
    if (sv) return `<span class="onav" style="${st};--c:#4a3f6b;font-size:${Math.round(size * 0.36)}px" aria-hidden="true">${esc(sv.cls.slice(0, 2).toUpperCase())}</span>`;
  }
  const m = MASTERS.find((x) => x.key === key);
  return `<span class="onav" style="${st};--c:${m ? m.color : '#3a4466'};font-size:${Math.round(size * 0.4)}px" aria-hidden="true">${esc(m ? m.tok : '?')}</span>`;
}
const avatars = () => [...SERVANTS.map((s) => `sv:${s.key}`), ...MASTERS.map((m) => `m:${m.key}`)];
const who = (p) => `<button class="onwho" data-act="on-prof" data-u="${esc(p.user || '')}"${p.user ? '' : ' disabled'}>${avatar(p.avatar, 22)}<span>${esc(p.name)}</span></button>`;
const mName = (k) => MASTERS.find((m) => m.key === k)?.short || k;
const svName = (k) => SERVANTS.find((s) => s.key === k)?.name || k;
const when = (iso) => { try { return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }); } catch { return ''; } };
const clock = (t) => { try { return new Date(t).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };
const pct = (a, b) => (b ? `${Math.round((100 * a) / b)}%` : '–');

// ---------- the lobby ----------
export function openOnline() {
  online.wantLobby = true;
  const s = load();
  const code = new URLSearchParams(location.search).get('room');
  if (online.on) { lobby(); return; }
  if (s.code && s.token && (!code || code.toUpperCase() === s.code)) { lobby(T("กำลังกลับเข้าห้อง…")); connect(() => send({ t: 'resume', code: s.code, token: s.token })); return; }
  online.note = '';
  lobby(online.ws?.readyState === 1 ? '' : T("กำลังต่อเซิร์ฟเวอร์…"));
  connect(() => { if (code) joinRoom(code.toUpperCase()); else redraw(); });
}
function joinRoom(code) {
  online.wantLobby = true;
  online.note = '';
  const name = nameNow();
  connect(() => send({ t: 'join', code, name }));
}

// Draws the modal again, keeping what was being typed, the focus and the scroll (the lobby is
// drawn again whenever the room, the list or the chat changes).
function paint(html) {
  const m = $m();
  const keep = {};
  let focus = null, sel = null, top = 0;
  const logs = {};
  if (showing()) {
    for (const i of m.querySelectorAll('input[id]:not([type=checkbox]), textarea[id]')) keep[i.id] = i.value;
    const pub = m.querySelector('#on-pub'); if (pub) keep.pubChecked = pub.checked; // the new room's choice (the others come from the server)
    const a = document.activeElement;
    if (a?.id && m.contains(a)) { focus = a.id; try { sel = [a.selectionStart, a.selectionEnd]; } catch { /* no selection */ } }
    top = m.scrollTop;
    for (const l of m.querySelectorAll('.onlog[id]')) logs[l.id] = l.scrollHeight - l.scrollTop - l.clientHeight < 30;
  }
  H().openModal(html);
  for (const [id, v] of Object.entries(keep)) { if (id === 'pubChecked') continue; const i = m.querySelector(`#${id}`); if (i) i.value = v; }
  if (keep.pubChecked !== undefined && m.querySelector('#on-pub')) m.querySelector('#on-pub').checked = keep.pubChecked;
  if (focus) { const f = m.querySelector(`#${focus}`); if (f) { f.focus({ preventScroll: true }); try { if (sel) f.setSelectionRange(sel[0], sel[1]); } catch { /* not a text box */ } } }
  m.scrollTop = top;
  for (const l of m.querySelectorAll('.onlog')) if (logs[l.id] !== false) l.scrollTop = l.scrollHeight;
}

// what the modal shows: the room you are in, or the lobby (rooms, chat, friends, ranking); a
// profile, the friends, the ranking or logging in, asked from inside a room, open over it with
// "กลับไปที่ห้อง"
const OVER = ['profile', 'friends', 'top', 'auth'];
function lobby(wait = '') {
  if (online.on && online.room && OVER.includes(acc.view)) { over(); return; }
  const note = wait || online.note;
  const body = online.on && online.room ? roomView() : homeView();
  const acts = online.on && online.room
    ? `<button class="btn ghost" data-act="on-leave">${T("ออกจากห้อง")}</button>${online.room.playing || (online.room.over && online.gameNo) ? `<button class="btn" data-act="on-back">${T("ดูกระดาน")}</button>` : ''}${online.room.you === 'host' && !online.room.playing ? `<button class="btn primary" data-act="on-start">${online.room.over ? T("เริ่มเกมใหม่") : T("เริ่มเกม")}</button>` : ''}`
    : `<button class="btn ghost" data-act="on-offline">${T("กลับ (เล่นกับบอท)")}</button>`;
  paint(`<div class="dlg online"><span class="eyebrow">${T("DOMINATE GRAIL WAR · ออนไลน์")}</span>${body}
    ${note ? `<p class="lede onnote">${esc(note)}</p>` : ''}<div class="acts">${acts}</div></div>`);
}

// who you are, at the top of the lobby
function accountBar() {
  const me = acc.me;
  if (me) {
    return `<div class="onacct">${avatar(me.avatar, 40)}<div class="nm"><b>${esc(me.name)}</b><small>@${esc(me.user)} · ${T("ชนะ {0} จาก {1} เกม", me.stats.wins, me.stats.games)}</small></div>
      <button class="btn sm" data-act="on-view" data-v="profile" data-u="${esc(me.user)}">${T("โปรไฟล์")}</button><button class="btn sm ghost" data-act="on-logout">${T("ออกจากระบบ")}</button></div>`;
  }
  return `<div class="onacct guest"><div class="nm"><b>${T("ยังไม่ได้เข้าสู่ระบบ")}</b><small>${T("เล่นแบบไม่สมัครได้ · สมาชิกเก็บสถิติ ประวัติการเล่น มีเพื่อน และคุยในล็อบบี้ได้")}</small></div>
    <button class="btn sm primary" data-act="on-auth" data-v="signup">${T("สมัครสมาชิก")}</button><button class="btn sm" data-act="on-auth" data-v="login">${T("เข้าสู่ระบบ")}</button></div>`;
}
function tabs() {
  const n = acc.friends.in.length;
  const t = (v, label) => `<button class="btn sm${acc.view === v ? ' on' : ''}" data-act="on-view" data-v="${v}" aria-pressed="${acc.view === v}">${label}</button>`;
  return `<nav class="ontabs">${t('rooms', T("🏠 ห้อง"))}${t('chat', T("💬 แชต"))}${t('friends', `${T("👥 เพื่อน")}${n ? ` <span class="onnum">${n}</span>` : ''}`)}${t('top', T("🏆 อันดับ"))}</nav>`;
}
function homeView() {
  if (!['rooms', 'chat', 'friends', 'top', 'profile', 'auth'].includes(acc.view)) acc.view = 'rooms';
  const back = acc.back ? `<div class="onback">${T("คุณยังมีที่นั่งในห้อง {0}", esc(acc.back.title || acc.back.code))}${acc.back.playing ? T(" (กำลังเล่น)") : ''} <button class="btn sm primary" data-act="on-join" data-code="${esc(acc.back.code)}">${T("กลับเข้าห้อง")}</button></div>` : '';
  let main;
  if (acc.view === 'auth') main = authView();
  else if (acc.view === 'profile') main = profileView();
  else if (acc.view === 'friends') main = friendsView();
  else if (acc.view === 'top') main = topView();
  else if (acc.view === 'chat') main = chatView('lobby');
  else main = roomsView();
  return `<h2>${T("เล่นออนไลน์")}</h2>${acc.known || online.ws?.readyState === 1 ? accountBar() : ''}${back}${acc.view === 'auth' ? '' : tabs()}${main}`;
}

function roomsView() {
  const s = load();
  const code = new URLSearchParams(location.search).get('room') || '';
  const guest = acc.me ? '' : `<label class="onf">${T("ชื่อของคุณ (ผู้เล่นทั่วไป)")} <input id="on-name" maxlength="16" value="${esc(s.name || '')}" placeholder="${T("เช่น B")}"></label>`;
  const list = acc.rooms;
  const rows = !list ? `<p class="dim">${T("กำลังโหลดรายชื่อห้อง…")}</p>`
    : !list.length ? `<p class="dim">${T("ยังไม่มีห้องที่เปิดอยู่ สร้างห้องใหม่ได้เลย")}</p>`
      : `<ul class="onrooms">${list.map((r) => {
        const full = r.n >= r.max;
        return `<li><div class="rt">${r.host ? avatar(r.host.avatar, 34) : ''}<div><b>${esc(r.title || T("ห้องของ {0}", r.host?.name || ''))}</b>
          <small><span class="oncode">${esc(r.code)}</span> · ${T("{0}/{1} คน", r.n, r.max)} · ${r.playing ? T("กำลังเล่น รอบ {0}", r.round) : T("รอเริ่มเกม")}${r.timer ? ' · ⏱' : ''}</small></div></div>
          <button class="btn sm${r.playing || full ? '' : ' primary'}" data-act="on-join" data-code="${esc(r.code)}"${r.playing || full ? ' disabled' : ''}>${full ? T("เต็ม") : r.playing ? T("เล่นอยู่") : T("เข้า")}</button></li>`;
      }).join('')}</ul>`;
  return `<p class="lede">${T("ห้องละไม่เกิน 7 คน คนละ 1 Master · ที่นั่งที่ไม่มีคนเป็นบอท · เวลาคิด 30 วินาทีทุกคำถาม (หมดเวลาเกมเลือกแบบปลอดภัยให้ตามกระดาษข้อ 21) · ดูผลการต่อสู้ 15 วินาที")}</p>
    ${guest}
    <div class="onrow"><button class="btn primary" data-act="on-quick">${T("⚡ เข้าห้องด่วน")}</button><span class="dim">${T("เข้าห้องที่รอคนอยู่ หรือเปิดห้องใหม่ให้")}</span></div>
    <h3>${T("ห้องที่เปิดอยู่")}${list ? ` <small class="dim">${list.length}</small>` : ''}</h3>${rows}
    <div class="onbox"><h3>${T("สร้างห้องใหม่")}</h3>
      <div class="onrow"><label class="onf">${T("ชื่อห้อง (ไม่ใส่ก็ได้)")} <input id="on-title" maxlength="30" placeholder="${T("เช่น ห้องมือใหม่")}"></label>
      <label class="check"><input type="checkbox" id="on-pub" checked> ${T("แสดงในรายชื่อห้อง")}</label>
      <button class="btn" data-act="on-create">${T("สร้างห้อง")}</button></div>
      <div class="onrow"><label class="onf">${T("รหัสห้อง")} <input id="on-code" maxlength="4" value="${esc(code.toUpperCase())}" placeholder="ABCD" style="text-transform:uppercase"></label><button class="btn" data-act="on-join">${T("เข้าห้องด้วยรหัส")}</button></div>
    </div>`;
}

function authView() {
  const up = acc.authMode === 'signup';
  return `<div class="onbox onauth"><div class="ontabs"><button class="btn sm${up ? '' : ' on'}" data-act="on-auth" data-v="login">${T("เข้าสู่ระบบ")}</button><button class="btn sm${up ? ' on' : ''}" data-act="on-auth" data-v="signup">${T("สมัครสมาชิก")}</button></div>
    <form id="on-authf" class="onform" autocomplete="on">
      <label class="onf">${T("ชื่อผู้ใช้")} <input id="on-user" name="username" maxlength="16" autocomplete="username" autocapitalize="off" spellcheck="false" placeholder="${T("ตัวอังกฤษ ตัวเลข _ 3–16 ตัว")}"></label>
      ${up ? `<label class="onf">${T("ชื่อที่แสดง")} <input id="on-dname" maxlength="16" placeholder="${T("ชื่อที่คนอื่นเห็น (ภาษาไหนก็ได้)")}"></label>` : ''}
      <label class="onf">${T("รหัสผ่าน")} <input id="on-pass" type="password" maxlength="100" autocomplete="${up ? 'new-password' : 'current-password'}" placeholder="${up ? T("6 ตัวขึ้นไป") : ''}"></label>
      ${up ? `<label class="onf">${T("รหัสผ่านอีกครั้ง")} <input id="on-pass2" type="password" maxlength="100" autocomplete="new-password"></label>` : ''}
      ${acc.authErr ? `<p class="onnote">${esc(acc.authErr)}</p>` : ''}
      <div class="onrow"><button class="btn primary" type="submit"${acc.busy ? ' disabled' : ''}>${up ? T("สมัครสมาชิก") : T("เข้าสู่ระบบ")}</button><button class="btn ghost" type="button" data-act="on-view" data-v="rooms">${T("ยกเลิก")}</button></div>
      <p class="dim">${up ? T("ไม่ต้องใช้อีเมล · จำรหัสผ่านไว้ให้ดี ถ้าลืม ให้แอดมินตั้งรหัสใหม่ให้") : T("ลืมรหัสผ่าน: ติดต่อแอดมินให้ตั้งรหัสใหม่")}</p>
    </form></div>`;
}

function profileView() {
  const p = acc.prof;
  if (!p) return `<p class="dim">${T("กำลังโหลด…")}</p>`;
  if (p.missing) return `<p class="dim">${T("ไม่พบสมาชิกนี้")}</p>`;
  const s = p.stats || { games: 0, wins: 0, vp: 0, best: 0, top3: 0, masters: {} };
  const mine = acc.me && p.uid === acc.me.uid;
  const rel = mine ? '' : !acc.me ? '' : p.rel === 'friend' ? `<button class="btn sm ghost" data-act="on-fdel" data-uid="${esc(p.uid)}">${T("เลิกเป็นเพื่อน")}</button>`
    : p.rel === 'sent' ? `<span class="dim">${T("ส่งคำขอแล้ว")}</span> <button class="btn sm ghost" data-act="on-fdel" data-uid="${esc(p.uid)}">${T("ยกเลิกคำขอ")}</button>`
      : p.rel === 'asked' ? `<button class="btn sm primary" data-act="on-fok" data-uid="${esc(p.uid)}">${T("รับเป็นเพื่อน")}</button>`
        : `<button class="btn sm primary" data-act="on-fadd" data-u="${esc(p.user)}">${T("เพิ่มเพื่อน")}</button>`;
  const tile = (n, label) => `<div class="onstat"><b>${n}</b><small>${label}</small></div>`;
  const ms = Object.entries(s.masters || {}).sort((a, b) => b[1].g - a[1].g).slice(0, 7)
    .map(([k, v]) => `<li><span>${esc(mName(k))}</span><span class="dim">${T("{0} เกม · ชนะ {1}", v.g, v.w)}</span></li>`).join('');
  const hist = (p.hist || []).map((h) => `<li class="${h.win ? 'win' : ''}"><b>${h.win ? '🏆' : `#${h.place}`}</b><div><span>${esc(mName(h.master))} · ${esc(svName(h.servant))} · ${h.vp} VP</span>
    <small class="dim">${esc(when(h.at))} · ${T("อันดับ {0}/{1} · {2} รอบ", h.place, h.n, h.rounds)}${h.with?.length ? ` · ${T("เล่นกับ {0}", h.with.map(esc).join(', '))}` : ''}</small></div></li>`).join('');
  const edit = mine && acc.edit ? `<div class="onbox"><h3>${T("แก้ไขโปรไฟล์")}</h3>
      <label class="onf">${T("ชื่อที่แสดง")} <input id="on-pname" maxlength="16" value="${esc(p.name)}"></label>
      <label class="onf">${T("แนะนำตัว")} <input id="on-pbio" maxlength="140" value="${esc(p.bio || '')}" placeholder="${T("เช่น ชอบเล่นริน")}"></label>
      <div class="onf">${T("รูปโปรไฟล์")}</div><div class="onavs">${avatars().map((a) => `<button class="${a === p.avatar ? 'sel' : ''}" data-act="on-pav" data-a="${a}" aria-pressed="${a === p.avatar}">${avatar(a, 44)}</button>`).join('')}</div>
      <div class="onrow"><button class="btn primary" data-act="on-psave">${T("บันทึก")}</button><button class="btn ghost" data-act="on-pedit">${T("ยกเลิก")}</button></div>
      <h3>${T("เปลี่ยนรหัสผ่าน")}</h3>
      <div class="onrow"><label class="onf">${T("รหัสผ่านเดิม")} <input id="on-old" type="password" maxlength="100" autocomplete="current-password"></label>
      <label class="onf">${T("รหัสผ่านใหม่")} <input id="on-new" type="password" maxlength="100" autocomplete="new-password"></label><button class="btn" data-act="on-passwd">${T("เปลี่ยนรหัสผ่าน")}</button></div>
      ${acc.authErr ? `<p class="onnote">${esc(acc.authErr)}</p>` : ''}</div>` : '';
  return `<div class="onprof">${avatar(p.avatar, 72)}<div class="nm"><h2>${esc(p.name)}</h2><small class="dim">@${esc(p.user)} · ${T("สมาชิกตั้งแต่ {0}", esc(when(p.created)))}</small>
    ${p.bio ? `<p>${esc(p.bio)}</p>` : ''}<div class="onrow">${mine && !acc.edit ? `<button class="btn sm" data-act="on-pedit">${T("แก้ไขโปรไฟล์")}</button>` : ''}${rel}</div></div></div>
    ${edit}
    <div class="onstats">${tile(s.games, T("เกม"))}${tile(s.wins, T("ชนะ"))}${tile(pct(s.wins, s.games), T("อัตราชนะ"))}${tile(s.top3, T("ติด 3 อันดับแรก"))}${tile(s.best, T("VP สูงสุด"))}${tile(s.games ? (s.vp / s.games).toFixed(1) : '–', T("VP เฉลี่ย"))}</div>
    ${ms ? `<h3>${T("Master ที่เล่นบ่อย")}</h3><ul class="onlist">${ms}</ul>` : ''}
    <h3>${T("ประวัติการเล่น")}</h3>${hist ? `<ul class="onhist">${hist}</ul>` : `<p class="dim">${T("ยังไม่มีเกมออนไลน์ที่เล่นจบ")}</p>`}
    ${online.on ? '' : `<div class="onrow"><button class="btn ghost sm" data-act="on-view" data-v="rooms">${T("← กลับไปล็อบบี้")}</button></div>`}`;
}

function friendsView() {
  if (!acc.me) return `<p class="dim">${T("เข้าสู่ระบบก่อนจึงเพิ่มเพื่อนได้")}</p><div class="onrow"><button class="btn primary" data-act="on-auth" data-v="signup">${T("สมัครสมาชิก")}</button><button class="btn" data-act="on-auth" data-v="login">${T("เข้าสู่ระบบ")}</button></div>`;
  const f = acc.friends;
  const ins = f.in.length ? `<h3>${T("คำขอเป็นเพื่อน")}</h3><ul class="onfriends">${f.in.map((p) => `<li>${who(p)}<span><button class="btn sm primary" data-act="on-fok" data-uid="${esc(p.uid)}">${T("รับ")}</button><button class="btn sm ghost" data-act="on-fdel" data-uid="${esc(p.uid)}">${T("ปฏิเสธ")}</button></span></li>`).join('')}</ul>` : '';
  const list = f.list.length ? `<ul class="onfriends">${f.list.map((p) => `<li>${who(p)}<span class="st"><i class="ondot${p.on ? ' on' : ''}"></i>${p.room ? T("อยู่ห้อง {0}", esc(p.room.title || p.room.code)) + (p.room.playing ? T(" (กำลังเล่น)") : '') : p.on ? T("ออนไลน์") : T("ออฟไลน์")}</span>
      <span>${p.room && !p.room.playing && p.room.code !== online.code ? `<button class="btn sm" data-act="on-join" data-code="${esc(p.room.code)}">${T("ไปห้องนี้")}</button>` : ''}</span></li>`).join('')}</ul>` : `<p class="dim">${T("ยังไม่มีเพื่อน เพิ่มด้วยชื่อผู้ใช้ หรือกดชื่อคนในห้อง/อันดับเพื่อดูโปรไฟล์")}</p>`;
  const outs = f.out.length ? `<h3>${T("รอตอบรับ")}</h3><ul class="onfriends">${f.out.map((p) => `<li>${who(p)}<span><button class="btn sm ghost" data-act="on-fdel" data-uid="${esc(p.uid)}">${T("ยกเลิกคำขอ")}</button></span></li>`).join('')}</ul>` : '';
  return `<div class="onrow"><label class="onf">${T("เพิ่มเพื่อนด้วยชื่อผู้ใช้")} <input id="on-fuser" maxlength="16" autocapitalize="off" spellcheck="false" placeholder="username"></label><button class="btn" data-act="on-fadd">${T("ส่งคำขอ")}</button></div>
    ${ins}<h3>${T("เพื่อน")} <small class="dim">${f.list.filter((p) => p.on).length}/${f.list.length} ${T("ออนไลน์")}</small></h3>${list}${outs}`;
}

function topView() {
  const l = acc.top;
  if (!l) return `<p class="dim">${T("กำลังโหลด…")}</p>`;
  if (!l.length) return `<p class="dim">${T("ยังไม่มีสมาชิกที่เล่นจบเกม")}</p>`;
  return `<p class="dim">${T("เรียงตามจำนวนครั้งที่ชนะ แล้วอัตราชนะ · นับเฉพาะเกมออนไลน์ของสมาชิก")}</p>
    <table class="ontop"><thead><tr><th>#</th><th>${T("ผู้เล่น")}</th><th>${T("ชนะ")}</th><th>${T("เกม")}</th><th>${T("อัตราชนะ")}</th></tr></thead><tbody>
    ${l.map((p, i) => `<tr${acc.me && p.uid === acc.me.uid ? ' class="me"' : ''}><td>${i + 1}</td><td>${who(p)}</td><td>${p.wins}</td><td>${p.games}</td><td>${pct(p.wins, p.games)}</td></tr>`).join('')}</tbody></table>`;
}

// the chat: the lobby's (members) or the room's (everyone in it)
function chatLine(m) {
  const mine = acc.me && m.from?.uid && m.from.uid === acc.me.uid;
  return `<li class="${mine ? 'mine' : ''}">${m.from?.user ? who(m.from) : `<span class="onwho">${m.from?.avatar ? avatar(m.from.avatar, 22) : ''}<span>${esc(m.from?.name || '')}</span></span>`}<span class="tx">${esc(m.text)}</span><small>${clock(m.at)}</small></li>`;
}
function chatView(ch) {
  const list = acc.chat[ch] || [];
  const can = ch === 'room' || acc.me;
  return `<div class="onchatbox"><ul class="onlog" id="on-log-${ch}">${list.length ? list.map(chatLine).join('') : `<li class="dim empty">${ch === 'room' ? T("ยังไม่มีใครพิมพ์ ทักทายคนในห้องได้เลย") : T("ยังไม่มีข้อความ")}</li>`}</ul>
    ${can ? `<form class="onsay" data-ch="${ch}"><input id="on-say-${ch}" maxlength="200" autocomplete="off" placeholder="${T("พิมพ์ข้อความ…")}"><button class="btn sm primary" type="submit">${T("ส่ง")}</button></form>`
    : `<p class="dim">${T("เข้าสู่ระบบก่อนจึงคุยในล็อบบี้ได้")} <button class="btn sm" data-act="on-auth" data-v="login">${T("เข้าสู่ระบบ")}</button></p>`}</div>`;
}
// a new chat line without drawing everything again (the text being typed stays)
function addChatLine(ch, m) {
  for (const log of document.querySelectorAll(`#on-log-${ch}, #onchat .onlog[data-ch="${ch}"]`)) {
    const end = log.scrollHeight - log.scrollTop - log.clientHeight < 30;
    log.querySelector('.empty')?.remove();
    log.insertAdjacentHTML('beforeend', chatLine(m));
    while (log.childElementCount > 80) log.firstElementChild.remove();
    if (end) log.scrollTop = log.scrollHeight;
  }
}

function roomView() {
  const r = online.room;
  const host = r.you === 'host';
  const link = `${location.origin}${location.pathname}?room=${r.code}`;
  const mine = r.seats.find((q) => q.you);
  const taken = new Map(r.seats.filter((q) => q.master).map((q) => [q.master, q]));
  const ms = MASTERS.map((m) => {
    const q = taken.get(m.key);
    const dis = q && !q.you;
    return `<button class="mcard${q?.you ? ' sel' : ''}" style="--c:${m.color}" data-act="on-pick" data-m="${m.key}"${dis || r.playing ? ' disabled' : ''} aria-pressed="${!!q?.you}">
      <span class="en">${esc(m.en.toUpperCase())} ${T("· ระดับ")}${esc(m.level)}</span><b>${esc(m.name)}</b>${q ? `<span class="st2">${esc(q.name)}${q.you ? T(" (คุณ)") : ''}</span>` : ''}</button>`;
  }).join('');
  const ppl = r.seats.map((q, i) => `<li>${q.host ? '👑 ' : ''}${q.user ? who(q) : `<span class="onwho"><span>${esc(q.name)}</span></span>`}<span class="dim">${q.you ? T(" (คุณ)") : ''}${q.user ? '' : T(" · ผู้เล่นทั่วไป")} · ${q.master ? esc(MASTERS.find((m) => m.key === q.master).short) : T("สุ่ม Master")}${q.on ? '' : T(" · หลุด")}</span>
    ${host && !q.you && !r.playing ? `<button class="btn sm ghost" data-act="on-kick" data-i="${i}" title="${T("เชิญออกจากห้อง")}">✕</button>` : ''}</li>`).join('');
  const inRoom = new Set(r.seats.map((q) => q.uid).filter(Boolean));
  const inv = acc.me ? acc.friends.list.filter((f) => f.on && !inRoom.has(f.uid)) : [];
  const invite = acc.me && !r.playing ? `<div class="onbox"><h3>${T("ชวนเพื่อน")}</h3>${inv.length ? `<ul class="onfriends">${inv.map((f) => `<li>${who(f)}<span class="st">${f.room ? T("อยู่ห้อง {0}", esc(f.room.title || f.room.code)) : T("ออนไลน์")}</span><span><button class="btn sm" data-act="on-invite" data-uid="${esc(f.uid)}">${T("เชิญ")}</button></span></li>`).join('')}</ul>` : `<p class="dim">${T("ไม่มีเพื่อนที่ออนไลน์อยู่ตอนนี้")}</p>`}</div>` : '';
  const title = host && !r.playing
    ? `<div class="onrow"><label class="onf">${T("ชื่อห้อง")} <input id="on-rtitle" maxlength="30" value="${esc(r.title || '')}" placeholder="${T("ห้องของ {0}", esc(r.seats.find((q) => q.host)?.name || ''))}"></label><label class="check"><input type="checkbox" id="on-rpub"${r.pub ? ' checked' : ''}> ${T("แสดงในรายชื่อห้อง")}</label><button class="btn sm" data-act="on-rset">${T("บันทึก")}</button></div>`
    : '';
  return `<h2>${esc(r.title || T("ห้อง"))} <span class="oncode">${esc(r.code)}</span>${r.pub ? '' : ` <small class="dim">${T("🔒 ไม่แสดงในรายชื่อ")}</small>`}</h2>
    <p class="lede">${T("ส่งรหัสห้อง หรือลิงก์นี้ให้เพื่อน:")} <a href="${esc(link)}">${esc(link)}</a> <button class="btn sm" data-act="on-copy" data-v="${esc(link)}">${T("คัดลอก")}</button></p>
    ${title}
    <div class="oncols"><div><h2>${T("คนในห้อง {0}/7", r.seats.length)}</h2><ul class="onppl">${ppl}</ul></div>
    <div><h3>${T("แชตในห้อง")}</h3>${chatView('room')}</div></div>
    <h2>${T("เลือก Master")} <small class="dim">${T("ไม่เลือกก็ได้ เริ่มเกมแล้วสุ่มให้ · Servant สุ่มแบบเกมจริง")}</small></h2><div class="masters">${ms}</div>
    ${mine?.master ? `<div class="onrow"><button class="btn sm ghost" data-act="on-pick" data-m="">${T("ไม่เลือก (สุ่ม)")}</button></div>` : ''}
    <label class="check"><input type="checkbox" id="on-timer"${r.timer ? ' checked' : ''}${host && !r.playing ? '' : ' disabled'}> ${T("จำกัดเวลาคิด 30 วินาที")}${host ? '' : T(" (หัวห้องตั้ง)")}</label>
    ${invite}
    ${r.playing ? `<p class="lede">${T("เกมกำลังเล่นอยู่")}</p>` : host ? '' : `<p class="lede">${T("รอหัวห้องเริ่มเกม…")}</p>`}`;
}

const nameNow = () => (document.querySelector('#on-name')?.value || load().name || '').trim();
const val = (id) => (document.querySelector(`#${id}`)?.value || '').trim();
function view(v, u) {
  acc.view = v; acc.authErr = ''; acc.edit = false;
  if (v === 'top') send({ t: 'top' });
  if (v === 'friends') send({ t: 'friends' });
  if (v === 'profile') { acc.profQ = u || acc.me?.user || ''; acc.prof = null; send({ t: 'profile', user: acc.profQ }); }
  if (online.on) online.wantLobby = true;
  lobby();
}
function over() {
  const body = acc.view === 'profile' ? profileView() : acc.view === 'friends' ? friendsView() : acc.view === 'top' ? topView() : authView();
  paint(`<div class="dlg online"><span class="eyebrow">${T("DOMINATE GRAIL WAR · ออนไลน์")}</span>${body}<div class="acts"><button class="btn" data-act="on-lobby">${T("กลับไปที่ห้อง")}</button></div></div>`);
}
const refreshProf = () => { if (acc.view === 'profile' && acc.profQ) setTimeout(() => send({ t: 'profile', user: acc.profQ }), 150); };

document.addEventListener('submit', (ev) => {
  const f = ev.target;
  if (f.id === 'on-authf') {
    ev.preventDefault();
    const user = val('on-user'), pass = document.querySelector('#on-pass')?.value || '';
    if (acc.authMode === 'signup') {
      if (pass !== (document.querySelector('#on-pass2')?.value || '')) { acc.authErr = T("รหัสผ่านสองช่องไม่ตรงกัน"); redraw(); return; }
      acc.busy = true; acc.authErr = ''; redraw();
      connect(() => send({ t: 'signup', user, pass, name: val('on-dname') }));
    } else {
      acc.busy = true; acc.authErr = ''; redraw();
      connect(() => send({ t: 'login', user, pass }));
    }
    return;
  }
  if (f.classList.contains('onsay')) {
    ev.preventDefault();
    const i = f.querySelector('input');
    const text = i.value.trim();
    if (!text) return;
    send({ t: 'chat', ch: f.dataset.ch, text });
    i.value = '';
  }
});

document.addEventListener('click', (ev) => {
  const t = ev.target.closest('[data-act^="on-"]');
  if (!t || t.disabled) return;
  const act = t.dataset.act;
  if (act === 'on-create' || act === 'on-join' || act === 'on-quick') {
    const name = nameNow();
    save({ ...load(), name });
    const code = (t.dataset.code || document.querySelector('#on-code')?.value || '').trim().toUpperCase();
    if (act === 'on-join' && !code) { online.note = T("ใส่รหัสห้อง 4 ตัวก่อน"); lobby(); return; }
    online.note = '';
    online.wantLobby = true;
    const title = val('on-title'), pub = document.querySelector('#on-pub')?.checked !== false;
    lobby(T("กำลังต่อเซิร์ฟเวอร์…"));
    connect(() => send(act === 'on-create' ? { t: 'create', name, title, pub } : act === 'on-quick' ? { t: 'quick', name } : { t: 'join', code, name }));
  }
  if (act === 'on-pick') send({ t: 'pick', master: t.dataset.m || null });
  if (act === 'on-start') { online.wantLobby = false; send({ t: 'start' }); }
  if (act === 'on-copy') navigator.clipboard?.writeText(t.dataset.v).then(() => { t.textContent = T("คัดลอกแล้ว"); }, () => {});
  if (act === 'on-back') { online.wantLobby = false; H().closeModal(); }
  if (act === 'on-offline') { online.wantLobby = false; send({ t: 'rooms', on: false }); H().offline(); }
  if (act === 'on-leave') {
    send({ t: 'leave' });
    leftRoom();
    save({ name: load().name });
    setUrl(null);
    acc.view = 'rooms';
    H().offline(); // the board against bots behind, the lobby in front
    online.wantLobby = true;
    lobby();
  }
  // ----- members -----
  if (act === 'on-view') view(t.dataset.v, t.dataset.u);
  if (act === 'on-prof') { if (t.dataset.u) view('profile', t.dataset.u); }
  if (act === 'on-auth') { acc.authMode = t.dataset.v; acc.view = 'auth'; acc.authErr = ''; if (online.on) online.wantLobby = true; lobby(); connect(() => {}); }
  if (act === 'on-logout') { send({ t: 'logout' }); accSave(''); acc.me = null; acc.friends = { list: [], in: [], out: [] }; acc.view = 'rooms'; redraw(); }
  if (act === 'on-pedit') { acc.edit = !acc.edit; acc.authErr = ''; acc.pickAv = null; lobby(); }
  if (act === 'on-pav') { acc.pickAv = t.dataset.a; for (const b of $m().querySelectorAll('.onavs button')) { b.classList.toggle('sel', b === t); b.setAttribute('aria-pressed', b === t); } }
  if (act === 'on-psave') { send({ t: 'profile.set', name: val('on-pname'), bio: val('on-pbio'), ...(acc.pickAv ? { avatar: acc.pickAv } : {}) }); acc.edit = false; acc.pickAv = null; acc.prof = null; send({ t: 'profile', user: acc.profQ }); lobby(); }
  if (act === 'on-passwd') { const old = document.querySelector('#on-old')?.value || '', pass = document.querySelector('#on-new')?.value || ''; if (pass.length < 6) { acc.authErr = T("รหัสผ่านต้องยาว 6 ตัวขึ้นไป"); lobby(); return; } send({ t: 'passwd', old, pass }); }
  if (act === 'on-fadd') { const u = t.dataset.u || val('on-fuser'); if (!u) return; send({ t: 'friend.add', user: u }); const i = document.querySelector('#on-fuser'); if (i) i.value = ''; refreshProf(); }
  if (act === 'on-fok') { send({ t: 'friend.ok', uid: t.dataset.uid }); refreshProf(); }
  if (act === 'on-fdel') { send({ t: 'friend.del', uid: t.dataset.uid }); refreshProf(); }
  if (act === 'on-invite') { send({ t: 'invite', uid: t.dataset.uid }); t.disabled = true; t.textContent = T("เชิญแล้ว"); }
  if (act === 'on-kick') send({ t: 'kick', i: +t.dataset.i });
  if (act === 'on-rset') send({ t: 'settings', title: val('on-rtitle'), pub: !!document.querySelector('#on-rpub')?.checked });
  if (act === 'on-chat') { acc.chatOpen = !acc.chatOpen; if (acc.chatOpen) acc.unread = 0; drawChat(); badge(); if (acc.chatOpen) document.querySelector('#onchat input')?.focus(); }
});
document.addEventListener('change', (ev) => { if (ev.target.id === 'on-timer') send({ t: 'timer', on: ev.target.checked }); });
// back to the lobby from the end of the game ("เล่นอีกครั้ง")
export function onlineAgain() { online.wantLobby = true; acc.view = 'room'; lobby(); }

// ---------- a notice with buttons (an invitation, a friend request) ----------
function notice(text, buttons) {
  let box = document.querySelector('#onnotice');
  if (!box) { box = document.createElement('div'); box.id = 'onnotice'; document.body.append(box); }
  const el = document.createElement('div');
  el.className = 'onnote-card';
  el.innerHTML = `<span>${esc(text)}</span>`;
  for (const [label, go] of buttons) {
    const b = document.createElement('button');
    b.className = 'btn sm primary'; b.textContent = label;
    b.onclick = () => { el.remove(); go(); };
    el.append(b);
  }
  const x = document.createElement('button');
  x.className = 'btn sm ghost'; x.textContent = '✕'; x.setAttribute('aria-label', T("ปิด"));
  x.onclick = () => el.remove();
  el.append(x);
  box.append(el);
  while (box.childElementCount > 3) box.firstElementChild.remove();
  setTimeout(() => el.remove(), 30_000);
}

// ---------- the room chat during the game: 💬 in the bar opens it ----------
function drawChat() {
  let box = document.querySelector('#onchat');
  if (!acc.chatOpen || !online.on) { if (box) box.hidden = true; return; }
  if (!box) { box = document.createElement('div'); box.id = 'onchat'; document.body.append(box); }
  box.hidden = false;
  const list = acc.chat.room;
  box.innerHTML = `<div class="hd"><b>${T("แชตในห้อง")} <span class="oncode">${esc(online.code || '')}</span></b><button class="btn sm ghost" data-act="on-chat" aria-label="${T("ปิด")}">✕</button></div>
    <ul class="onlog" data-ch="room">${list.length ? list.map(chatLine).join('') : `<li class="dim empty">${T("ยังไม่มีใครพิมพ์ ทักทายคนในห้องได้เลย")}</li>`}</ul>
    <form class="onsay" data-ch="room"><input maxlength="200" autocomplete="off" placeholder="${T("พิมพ์ข้อความ…")}"><button class="btn sm primary" type="submit">${T("ส่ง")}</button></form>`;
  const log = box.querySelector('.onlog');
  log.scrollTop = log.scrollHeight;
}

// ---------- the room badge and the thinking clock ----------
// In the bar at the top (main.js drawBar): 🌐 room code, who is thinking, and ⏱ 0:42 — the same
// clock for everyone (paper 4.6 item 21), red in the last 10 seconds.
function badgeInner() {
  const t = online.turn;
  const left = t?.left != null ? Math.max(0, t.left - (Date.now() - online.turnAt)) : null;
  const g = H().game();
  const who2 = t?.kind === 'combatEnd' ? (t.waiting?.length ? T("รออ่านผล: {0}", t.waiting.map(esc).join(', ')) : '')
    : t && g?.players?.[t.pid] && t.pid !== online.me ? T("{0} กำลังคิด", esc(online.people[t.pid]?.name || '')) : '';
  const sec = left != null ? Math.ceil(left / 1000) : 0;
  const clk = left != null ? `<b class="onclock${sec <= 10 ? ' low' : ''}">⏱ ${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}</b>` : '';
  const off = online.ws?.readyState !== 1;
  const chatBtn = `<button data-act="on-chat" class="onchatbtn${acc.chatOpen ? ' on' : ''}" title="${T("แชตในห้อง")}" aria-label="${T("แชตในห้อง")}">💬${acc.unread ? `<span class="onnum">${acc.unread > 9 ? '9+' : acc.unread}</span>` : ''}</button>`;
  return `<button data-act="on-lobby" title="${T("ห้องออนไลน์ · คนในห้อง")}">🌐<span class="code"> ${esc(online.code || '')}</span></button>${chatBtn}${who2 ? `<span>${who2}</span>` : ''}${clk}${off ? `<span class="low">${T("หลุด · กำลังต่อใหม่")}</span>` : ''}`;
}
export const barHtml = () => (online.on ? `<span class="onbar">${badgeInner()}</span>` : '');
function badge() {
  const el = document.querySelector('#bar .onbar');
  if (!el) return;
  const h = badgeInner();
  if (el.dataset.h !== h) { el.innerHTML = h; el.dataset.h = h; } // the same: left alone, so a press on it is not lost
}
setInterval(() => { if (online.on) badge(); }, 250);
document.addEventListener('click', (ev) => { if (ev.target.closest('[data-act="on-lobby"]')) { online.wantLobby = true; if (online.on) acc.view = 'room'; lobby(); } });

// opened with ?room=CODE: straight to that room
export function onlineAuto() {
  const code = new URLSearchParams(location.search).get('room');
  if (code) { openOnline(); return true; }
  // logged in on this browser: connect now, so friends see you and invitations arrive
  if (accToken() && /^https?:$/.test(location.protocol)) connect(() => {});
  return false;
}
