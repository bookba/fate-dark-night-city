// A room: up to 7 people (one per Master), the rest of the seats played by bots, and the one real
// Game. The rules are game.js as it is; this file only decides who answers each question.
//
// Thinking time (paper 4.6 item 21): 30 seconds for every question the game asks a person, the
// same for everyone; when it runs out the game takes the safe answer of item 21 and the war log
// says "หมดเวลา". A person who drops out is played by a bot until they come back.
import crypto from 'node:crypto';
import { Game, MASTERS } from '../v5/game.js';
import { botDecide } from '../v5/bot.js';
import { Encoder, viewSwap, delta } from '../v5/net.js';

export const THINK_MS = +process.env.THINK_MS || 30_000; // B 3 Nov 2026: 30 s (was 60) · env THINK_MS only to test quickly
const BOT_DELAY = 260; // the same short pause as against bots on one page, so the board can be followed
const RESULTS_MS = 15_000; // B 3 Nov 2026: the fight results wait for everyone's "จบรอบ" at most 15 s
const FLUSH_MS = 60; // state messages are sent at most this often
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const clean = (s, n = 16) => String(s || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n);

export class Rooms {
  constructor() { this.rooms = new Map(); setInterval(() => this.sweep(), 60_000).unref(); }
  create() {
    let code;
    do code = Array.from({ length: 4 }, () => CODE_CHARS[crypto.randomInt(CODE_CHARS.length)]).join(''); while (this.rooms.has(code));
    const r = new Room(code);
    this.rooms.set(code, r);
    return r;
  }
  get(code) { return this.rooms.get(String(code || '').toUpperCase()); }
  // a room nobody has been connected to for 15 minutes is closed
  sweep() {
    for (const [code, r] of this.rooms) if (!r.seats.some((s) => s.ws) && Date.now() - r.idleSince > 15 * 60_000) { r.closed = true; this.rooms.delete(code); }
  }
}

class Room {
  constructor(code) {
    this.code = code;
    this.seats = []; // { token, name, master, ws }
    this.timer = true; // thinking time on (paper 4.6 item 21: on by default)
    this.game = null; this.gameNo = 0; this.enc = null;
    this.ask = null; // the question waiting for a person: { id, seat, pid, kind, ctx, res, deadline, draft, t }
    this.ends = null; // the fight results everyone is reading: { id, ctx, left: Set(seat), res, deadline }
    this.askNo = 0;
    this.flushT = null;
    this.idleSince = Date.now();
  }
  host() { return this.seats[0] || null; }

  // ---------- people ----------
  join(ws, name) {
    if (this.seats.length >= MASTERS.length) return { error: 'ห้องเต็มแล้ว (7 คน)' };
    if (this.game && !this.game.over) return { error: 'ห้องนี้เริ่มเกมไปแล้ว' };
    const seat = { token: crypto.randomUUID(), name: clean(name) || `ผู้เล่น ${this.seats.length + 1}`, master: null, ws: null };
    this.seats.push(seat);
    this.attach(seat, ws);
    return { seat };
  }
  resume(ws, token) {
    const seat = this.seats.find((s) => s.token === token);
    if (!seat) return { error: 'ไม่พบที่นั่งของคุณในห้องนี้' };
    this.attach(seat, ws);
    return { seat };
  }
  attach(seat, ws) {
    if (seat.ws && seat.ws !== ws) seat.ws.close();
    seat.ws = ws;
    ws.send(JSON.stringify({ t: 'joined', code: this.code, token: seat.token }));
    this.lobby();
    if (this.game) this.sendState(seat);
  }
  detach(seat) {
    if (seat.ws) seat.ws = null;
    if (!this.seats.some((s) => s.ws)) this.idleSince = Date.now();
    if (!this.game || this.game.over) {
      // before the game a seat that left is freed (the host passes to the next person)
      if (!this.game) this.seats = this.seats.filter((s) => s !== seat);
    } else {
      // in the game a bot answers for them until they come back
      if (this.ask?.seat === seat) this.answer(seat, this.ask.id, undefined, 'bot');
      if (this.ends?.left.has(seat)) this.endsDone(seat);
    }
    this.lobby();
  }
  leave(seat) {
    if (this.game && !this.game.over) { if (seat.ws) { const w = seat.ws; seat.ws = null; w.close(); } this.detach(seat); return; }
    this.seats = this.seats.filter((s) => s !== seat);
    if (seat.ws) { const w = seat.ws; seat.ws = null; w.close(); }
    this.lobby();
  }
  pick(seat, master) {
    if (this.game && !this.game.over) return;
    if (master && !MASTERS.some((m) => m.key === master)) return;
    if (master && this.seats.some((s) => s !== seat && s.master === master)) return; // one person per Master
    seat.master = master || null;
    this.lobby();
  }
  rename(seat, name) { seat.name = clean(name) || seat.name; this.lobby(); }
  setTimer(seat, on) { if (seat === this.host() && !(this.game && !this.game.over)) { this.timer = !!on; this.lobby(); } }
  lobby() {
    for (const s of this.seats) {
      if (!s.ws) continue;
      s.ws.send(JSON.stringify({
        t: 'lobby', code: this.code, you: s.token === this.host()?.token ? 'host' : 'guest', timer: this.timer,
        playing: !!(this.game && !this.game.over), over: !!this.game?.over,
        seats: this.seats.map((q) => ({ name: q.name, master: q.master, on: !!q.ws, you: q === s, host: q === this.host() })),
      }));
    }
  }

  // ---------- the game ----------
  start(seat) {
    if (seat !== this.host() || (this.game && !this.game.over)) return;
    // Masters nobody picked are dealt at random to those who did not pick
    const free = MASTERS.map((m) => m.key).filter((k) => !this.seats.some((s) => s.master === k));
    for (const s of this.seats) if (!s.master) s.master = free.splice(crypto.randomInt(free.length), 1)[0];
    const game = new Game({ decide: (g, p, kind, ctx) => this.decide(g, p, kind, ctx), onEvent: (e) => this.onEvent(game, e), humanMaster: null });
    for (const p of game.players) p.isHuman = false; // nobody is "the" human on the server; each page sees itself as one
    this.game = game; this.gameNo++; this.enc = new Encoder(); this.ask = null; this.ends = null; this.events = [];
    this.lobby();
    this.flush();
    game.run().catch((e) => { console.error(e); game.log(`เกิดข้อผิดพลาด: ${e.message}`, 'death'); game.over = true; this.flush(); })
      .finally(() => { if (game === this.game) { this.flush(); this.lobby(); } });
  }
  seatOf(p) { return this.seats.find((s) => s.master === p.m.key) || null; }
  live(game) { return game === this.game && !this.closed; }

  async decide(game, p, kind, ctx) {
    if (!this.live(game)) return new Promise(() => {}); // a replaced game stops here
    if (kind === 'combatEnd') return this.combatEnd(game, ctx);
    const seat = this.seatOf(p);
    if (!seat || !seat.ws) {
      await wait(BOT_DELAY);
      return botDecide(game, p, kind, ctx);
    }
    return new Promise((res) => {
      const id = ++this.askNo;
      const deadline = this.timer ? Date.now() + THINK_MS : null;
      const t = deadline ? setTimeout(() => this.answer(seat, id, undefined, 'time'), THINK_MS + 1500) : null; // a little grace for the page's own clock
      this.ask = { id, seat, pid: p.id, kind, ctx, res, deadline, draft: null, t };
      this.flush(true);
    });
  }
  // how: 'me' (the person), 'time' (thinking time ran out, paper 4.6 item 21), 'bot' (they left)
  answer(seat, id, v, how = 'me') {
    const a = this.ask;
    if (!a || a.id !== id || a.seat !== seat) return;
    this.ask = null;
    clearTimeout(a.t);
    const p = this.game.players[a.pid];
    let out = v;
    if (how === 'time') { out = timeoutAnswer(this.game, p, a.kind, a.ctx, a.draft); this.game.log(`${p.name} หมดเวลา`, ''); }
    if (how === 'bot') out = botDecide(this.game, p, a.kind, a.ctx);
    a.res(out);
    this.flush(true);
  }
  draft(seat, id, v) { if (this.ask && this.ask.id === id && this.ask.seat === seat) this.ask.draft = v; }

  // the fight results: every person still connected reads them, then the round ends
  combatEnd(game, ctx) {
    const left = new Set(this.seats.filter((s) => s.ws));
    if (!left.size) return null;
    return new Promise((res) => {
      const id = ++this.askNo;
      const t = setTimeout(() => this.endsFinish(id), RESULTS_MS);
      this.ends = { id, ctx, left, res, t, deadline: Date.now() + RESULTS_MS };
      this.flush(true);
    });
  }
  endsDone(seat, id = this.ends?.id) {
    const e = this.ends;
    if (!e || e.id !== id) return;
    e.left.delete(seat);
    if (!e.left.size) this.endsFinish(id); else this.flush(true);
  }
  endsFinish(id) {
    const e = this.ends;
    if (!e || e.id !== id) return;
    this.ends = null; clearTimeout(e.t);
    e.res(null);
    this.flush(true);
  }

  // ---------- sending ----------
  onEvent(game, e) {
    if (!this.live(game)) return;
    if (e.type === 'log' && ['death', 'reveal', 'grail'].includes(e.entry.cls)) this.events.push({ type: 'log', entry: { ...e.entry } });
    if (e.type === 'book') this.events.push({ type: 'book', pid: e.p.id });
    this.flush();
  }
  flush(now = false) {
    if (now) { clearTimeout(this.flushT); this.flushT = null; this.sendAll(); return; }
    if (this.flushT) return;
    this.flushT = setTimeout(() => { this.flushT = null; this.sendAll(); }, FLUSH_MS);
  }
  sendAll() {
    const evs = this.events || []; this.events = [];
    for (const s of this.seats) this.sendState(s, evs);
  }
  sendState(seat, evs = []) {
    const g = this.game;
    if (!seat.ws || !g) return;
    const me = g.players.find((p) => p.m.key === seat.master) || null;
    const a = this.ask, e = this.ends;
    const mine = a && a.seat === seat ? a : e && e.left.has(seat) ? { id: e.id, kind: 'combatEnd', ctx: e.ctx } : null;
    // a page gets everything once per game (and after it reconnects), then only what changed
    const full = seat.sentGame !== this.gameNo || seat.sentWs !== seat.ws;
    if (full) { seat.sent = new Map(); seat.sentGame = this.gameNo; seat.sentWs = seat.ws; }
    const data = delta(this.enc.encode({ g, ctx: mine?.ctx ?? null }, viewSwap(g, me)), seat.sent);
    const turn = a ? { pid: a.pid, left: a.deadline ? Math.max(0, a.deadline - Date.now()) : null, kind: a.kind } : e ? { pid: null, left: Math.max(0, e.deadline - Date.now()), kind: 'combatEnd', waiting: [...e.left].map((s) => s.name) } : null;
    seat.ws.send(JSON.stringify({
      t: 'state', game: this.gameNo, full, me: me?.id ?? null, data, timer: this.timer,
      ask: mine ? { id: mine.id, kind: mine.kind } : null, turn,
      events: evs.filter((x) => x.type !== 'book' || x.pid === me?.id),
      people: Object.fromEntries(this.seats.map((s) => [g.players.find((p) => p.m.key === s.master)?.id, { name: s.name, on: !!s.ws }])),
    }));
  }

  message(seat, m) {
    switch (m.t) {
      case 'pick': this.pick(seat, m.master); break;
      case 'name': this.rename(seat, m.name); break;
      case 'timer': this.setTimer(seat, m.on); break;
      case 'start': this.start(seat); break;
      case 'answer': if (this.ends && m.id === this.ends.id) this.endsDone(seat, m.id); else this.answer(seat, m.id, m.v); break;
      case 'draft': this.draft(seat, m.id, m.v); break;
      case 'leave': this.leave(seat); break;
      default: break;
    }
  }
}

// The safe answer when thinking time runs out (paper 4.6 item 21): the first place on the list,
// stay put, pass a window, 1st Strike's preselected cards; for the cards, what was picked already,
// filled face down from the hand (no mana) up to the cards to lay, and Command Spells and gems
// that were not pressed are not used.
export function timeoutAnswer(g, p, kind, ctx, draft) {
  if (kind === 'place') return { to: ctx.opts[0] };
  if (kind === 'move') return { to: p.at, how: 'stay' };
  if (kind === 'window') return null;
  if (kind === 'strike1') return {};
  if (kind !== 'cards') return null;
  const d = draft && typeof draft === 'object' ? draft : {};
  const ids = (Array.isArray(d.ids) ? d.ids : []).filter((id) => Number.isInteger(id));
  const down = new Set((Array.isArray(d.down) ? d.down : []).filter((id) => ids.includes(id)));
  const need = g.maxCards(p);
  const slots = Math.max(0, need - ids.length);
  const rest = p.hand.filter((c) => !ids.includes(c.uid) && g.canFlip(c)).sort((x, y) => x.power - y.power).slice(0, slots);
  for (const c of rest) { ids.push(c.uid); down.add(c.uid); }
  return { ...d, ids, down: [...down], swap: undefined };
}
