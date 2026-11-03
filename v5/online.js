// Online play, the page side (B, 3 Nov 2026: "เพิ่มระบบออนไลน์"). The server (server/) runs the one
// real game; this page keeps a copy (net.js) and main.js draws it as it draws a game against bots.
// A room has up to 7 people, one per Master; seats nobody takes are bots. Questions the game asks
// you arrive here and go to main.js's decide(), and your answer goes back to the server.
import { MASTERS } from './game.js';
import { Mirror } from './net.js';

const SAVE = 'dgw-v5-online'; // { code, token, name }: come back to your seat after a reload
const load = () => { try { return JSON.parse(localStorage.getItem(SAVE)) || {}; } catch { return {}; } };
const save = (v) => { try { localStorage.setItem(SAVE, JSON.stringify(v)); } catch { /* a private window forgets */ } };

export const online = {
  on: false, // in a room
  hooks: null, // set by main.js
  ws: null, code: null, token: null, room: null, gameNo: 0, mirror: null, me: null,
  asked: null, // the question main.js is answering: { id, kind }
  turn: null, turnAt: 0, people: {}, note: '', tries: 0, wantLobby: false,
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
  ws.addEventListener('open', () => { online.tries = 0; first(); });
  ws.addEventListener('message', (ev) => { let m; try { m = JSON.parse(ev.data); } catch { return; } onMsg(m); });
  ws.addEventListener('close', () => {
    if (online.ws !== ws) return;
    online.ws = null;
    if (online.on && online.token) { // try again: 1, 2, 4… seconds, the seat waits on the server
      online.note = 'หลุดจากเซิร์ฟเวอร์ กำลังต่อใหม่…';
      badge();
      setTimeout(() => connect(() => send({ t: 'resume', code: online.code, token: online.token })), Math.min(8000, 1000 * 2 ** online.tries++));
    } else if (!online.on) fail();
  });
}
function fail() {
  online.note = 'ต่อเซิร์ฟเวอร์เกมไม่ได้ · เล่นออนไลน์ได้เมื่อเปิดเกมจากเว็บของเซิร์ฟเวอร์ (ดู server/README.md)';
  if (!$m().hidden && $m().querySelector('.online')) lobby();
}
const $m = () => document.querySelector('#modal');
// the address shows ?room=CODE while in a room, so it can be shared or reloaded
function setUrl(code) {
  const q = new URLSearchParams(location.search);
  if (code) q.set('room', code); else q.delete('room');
  history.replaceState(null, '', `${location.pathname}${q.size ? `?${q}` : ''}`);
}

function onMsg(m) {
  if (m.t === 'error') {
    online.note = m.msg;
    // a room that is gone (closed, or the server restarted): forget it
    if (m.gone) { if (m.code === online.code) { online.code = null; online.token = null; online.on = false; badge(); } if (String(m.code || '').toUpperCase() === load().code) save({ name: load().name }); setUrl(null); }
    lobby();
    return;
  }
  if (m.t === 'joined') {
    online.on = true; online.code = m.code; online.token = m.token; online.note = '';
    save({ code: m.code, token: m.token, name: load().name });
    setUrl(m.code);
    return;
  }
  if (m.t === 'lobby') {
    online.room = m;
    badge();
    // the lobby shows before the first game, or when you asked to see it
    if (online.wantLobby || (!m.playing && !m.over)) lobby();
    return;
  }
  if (m.t === 'state') onState(m);
}

function onState(m) {
  const fresh = m.game !== online.gameNo;
  if (fresh) { online.gameNo = m.game; online.mirror = new Mirror(); online.asked = null; online.wantLobby = false; }
  const root = online.mirror.apply(m.data, m.full);
  online.me = m.me; online.turn = m.turn; online.turnAt = Date.now(); online.people = m.people || {};
  if (fresh) H().begin(root.g); else H().render();
  for (const e of m.events || []) H().event(e.type === 'book' ? { type: 'book', p: root.g.players[e.pid] } : e);
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

// ---------- the lobby ----------
export function openOnline() {
  online.wantLobby = true;
  const s = load();
  const code = new URLSearchParams(location.search).get('room');
  if (online.on) { lobby(); return; }
  if (s.code && s.token && (!code || code.toUpperCase() === s.code)) { lobby('กำลังกลับเข้าห้อง…'); connect(() => send({ t: 'resume', code: s.code, token: s.token })); return; }
  lobby();
}
function lobby(wait = '') {
  const r = online.room;
  const s = load();
  let body;
  if (!online.on || !r) {
    const code = new URLSearchParams(location.search).get('room') || '';
    body = `<h2>เล่นออนไลน์</h2>
      <p class="lede">ห้องละไม่เกิน 7 คน คนละ 1 Master · ที่นั่งที่ไม่มีคนเป็นบอท · เวลาคิด 1 นาทีทุกคำถาม (หมดเวลาเกมเลือกแบบปลอดภัยให้ตามกระดาษข้อ 21)</p>
      <label class="onf">ชื่อของคุณ <input id="on-name" maxlength="16" value="${esc(s.name || '')}" placeholder="เช่น B"></label>
      <div class="onrow"><button class="btn primary" data-act="on-create">สร้างห้องใหม่</button></div>
      <div class="onrow"><label class="onf">รหัสห้อง <input id="on-code" maxlength="4" value="${esc(code.toUpperCase())}" placeholder="ABCD" style="text-transform:uppercase"></label><button class="btn" data-act="on-join">เข้าห้อง</button></div>`;
  } else {
    const host = r.you === 'host';
    const link = `${location.origin}${location.pathname}?room=${r.code}`;
    const mine = r.seats.find((q) => q.you);
    const taken = new Map(r.seats.filter((q) => q.master).map((q) => [q.master, q]));
    const ms = MASTERS.map((m) => {
      const q = taken.get(m.key);
      const dis = q && !q.you;
      return `<button class="mcard${q?.you ? ' sel' : ''}" style="--c:${m.color}" data-act="on-pick" data-m="${m.key}"${dis || r.playing ? ' disabled' : ''} aria-pressed="${!!q?.you}">
        <span class="en">${esc(m.en.toUpperCase())} · ระดับ${esc(m.level)}</span><b>${esc(m.name)}</b>${q ? `<span class="st2">${esc(q.name)}${q.you ? ' (คุณ)' : ''}</span>` : ''}</button>`;
    }).join('');
    const ppl = r.seats.map((q) => `<li>${q.host ? '👑 ' : ''}${esc(q.name)}${q.you ? ' (คุณ)' : ''} · ${q.master ? esc(MASTERS.find((m) => m.key === q.master).short) : 'สุ่ม Master'}${q.on ? '' : ' · หลุด'}</li>`).join('');
    body = `<h2>ห้อง <span class="oncode">${esc(r.code)}</span></h2>
      <p class="lede">ส่งรหัสห้อง หรือลิงก์นี้ให้เพื่อน: <a href="${esc(link)}">${esc(link)}</a> <button class="btn sm" data-act="on-copy" data-v="${esc(link)}">คัดลอก</button></p>
      <h2>คนในห้อง ${r.seats.length}/7</h2><ul class="onppl">${ppl}</ul>
      <h2>เลือก Master <small class="dim">ไม่เลือกก็ได้ เริ่มเกมแล้วสุ่มให้ · Servant สุ่มแบบเกมจริง</small></h2><div class="masters">${ms}</div>
      ${mine?.master ? '<div class="onrow"><button class="btn sm ghost" data-act="on-pick" data-m="">ไม่เลือก (สุ่ม)</button></div>' : ''}
      <label class="check"><input type="checkbox" id="on-timer"${r.timer ? ' checked' : ''}${host && !r.playing ? '' : ' disabled'}> จำกัดเวลาคิด 1 นาที${host ? '' : ' (หัวห้องตั้ง)'}</label>
      ${r.playing ? '<p class="lede">เกมกำลังเล่นอยู่</p>' : host ? '' : '<p class="lede">รอหัวห้องเริ่มเกม…</p>'}`;
  }
  const acts = online.on && r
    ? `<button class="btn ghost" data-act="on-leave">ออกจากห้อง</button>${r.playing || (r.over && online.gameNo) ? '<button class="btn" data-act="on-back">ดูกระดาน</button>' : ''}${r.you === 'host' && !r.playing ? `<button class="btn primary" data-act="on-start">${r.over ? 'เริ่มเกมใหม่' : 'เริ่มเกม'}</button>` : ''}`
    : `<button class="btn ghost" data-act="on-offline">กลับ (เล่นกับบอท)</button>`;
  const note = wait || online.note;
  H().openModal(`<div class="dlg online"><span class="eyebrow">DOMINATE GRAIL WAR · ออนไลน์</span>${body}
    ${note ? `<p class="lede onnote">${esc(note)}</p>` : ''}<div class="acts">${acts}</div></div>`);
}

const nameNow = () => (document.querySelector('#on-name')?.value || load().name || '').trim();
document.addEventListener('click', (ev) => {
  const t = ev.target.closest('[data-act^="on-"]');
  if (!t || t.disabled) return;
  const act = t.dataset.act;
  if (act === 'on-create' || act === 'on-join') {
    const name = nameNow();
    save({ ...load(), name });
    const code = (document.querySelector('#on-code')?.value || '').trim().toUpperCase();
    if (act === 'on-join' && !code) { online.note = 'ใส่รหัสห้อง 4 ตัวก่อน'; lobby(); return; }
    online.note = '';
    lobby('กำลังต่อเซิร์ฟเวอร์…');
    connect(() => send(act === 'on-create' ? { t: 'create', name } : { t: 'join', code, name }));
  }
  if (act === 'on-pick') send({ t: 'pick', master: t.dataset.m || null });
  if (act === 'on-start') { online.wantLobby = false; send({ t: 'start' }); }
  if (act === 'on-copy') navigator.clipboard?.writeText(t.dataset.v).then(() => { t.textContent = 'คัดลอกแล้ว'; }, () => {});
  if (act === 'on-back') { online.wantLobby = false; H().closeModal(); }
  if (act === 'on-offline') { online.wantLobby = false; H().offline(); }
  if (act === 'on-leave') {
    send({ t: 'leave' });
    online.on = false; online.code = null; online.token = null; online.room = null; online.gameNo = 0; online.asked = null; online.wantLobby = false;
    save({ name: load().name });
    setUrl(null);
    badge(); H().offline();
  }
});
document.addEventListener('change', (ev) => { if (ev.target.id === 'on-timer') send({ t: 'timer', on: ev.target.checked }); });

// back to the lobby from the end of the game ("เล่นอีกครั้ง")
export function onlineAgain() { online.wantLobby = true; lobby(); }

// ---------- the room badge and the thinking clock ----------
// In the bar at the top (main.js drawBar): 🌐 room code, who is thinking, and ⏱ 0:42 — the same
// clock for everyone (paper 4.6 item 21), red in the last 10 seconds.
function badgeInner() {
  const t = online.turn;
  const left = t?.left != null ? Math.max(0, t.left - (Date.now() - online.turnAt)) : null;
  const g = H().game();
  const who = t?.kind === 'combatEnd' ? (t.waiting?.length ? `รออ่านผล: ${t.waiting.map(esc).join(', ')}` : '')
    : t && g?.players?.[t.pid] && t.pid !== online.me ? `${esc(online.people[t.pid]?.name || '')} กำลังคิด` : '';
  const sec = left != null ? Math.ceil(left / 1000) : 0;
  const clock = left != null ? `<b class="onclock${sec <= 10 ? ' low' : ''}">⏱ ${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}</b>` : '';
  const off = online.ws?.readyState !== 1;
  return `<button data-act="on-lobby" title="ห้องออนไลน์ · คนในห้อง">🌐 ${esc(online.code || '')}</button>${who ? `<span>${who}</span>` : ''}${clock}${off ? '<span class="low">หลุด · กำลังต่อใหม่</span>' : ''}`;
}
export const barHtml = () => (online.on ? `<span class="onbar">${badgeInner()}</span>` : '');
function badge() {
  const el = document.querySelector('#bar .onbar');
  if (el) el.innerHTML = badgeInner();
}
setInterval(() => { if (online.on) badge(); }, 250);
document.addEventListener('click', (ev) => { if (ev.target.closest('[data-act="on-lobby"]')) { online.wantLobby = true; lobby(); } });

// opened with ?room=CODE: straight to that room
export function onlineAuto() {
  const code = new URLSearchParams(location.search).get('room');
  if (code) { openOnline(); return true; }
  return false;
}
