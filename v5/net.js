// Online play: how the server sends its game to each page, and what each Master may see.
// The server runs the one real Game (game.js). Each page keeps a copy of it, rebuilt from the
// messages here, so main.js draws it the same way it draws a game played against bots.
// Shared by the server (server/room.mjs) and the page (online.js); no DOM code.
//
// A message is the object graph flattened into numbered nodes, so shared objects stay shared
// (the player whose turn it is is the same object as in the players list). The fixed card and
// Master data in data.js is not sent: both sides find it by its path in the module.
import { T, TX } from './i18n.js';
import * as DATA from './data.js';
import { Game } from './game.js';

// ---------- the fixed data, by path ----------
const STATIC = new Map(); // object → path, e.g. 'MASTERS.0'
const BY_PATH = new Map(); // path → object
(() => {
  const seen = new Set();
  const walk = (v, path) => {
    if (!v || typeof v !== 'object' || seen.has(v)) return;
    seen.add(v);
    STATIC.set(v, path); BY_PATH.set(path, v);
    if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}.${i}`));
    else if (Object.getPrototypeOf(v) === Object.prototype) for (const k of Object.keys(v)) walk(v[k], `${path}.${k}`);
  };
  for (const k of Object.keys(DATA).sort()) walk(DATA[k], k);
})();

const kindOf = (v) => (v instanceof Game ? 'G' : Array.isArray(v) ? 'a' : v instanceof Set ? 'S' : v instanceof Map ? 'M' : 'o');

// ---------- the server side ----------
// One Encoder per game, so an object keeps its number from message to message.
export class Encoder {
  constructor() { this.ids = new WeakMap(); this.next = 1; }
  // swap: object → what to send in its place (a hidden card, a Servant whose name is hidden);
  // the number stays the original's, so the page's object turns into the real one when shown
  encode(root, swap = new Map()) {
    const nodes = {};
    const val = (v) => {
      if (typeof v === 'function' || v === undefined) return undefined;
      if (typeof v === 'number' && !Number.isFinite(v)) return { $n: String(v) };
      if (v === null || typeof v !== 'object') return v;
      const sv = swap.get(v);
      if (!sv && STATIC.has(v)) return { $s: STATIC.get(v) };
      let id = this.ids.get(v);
      if (!id) { id = this.next++; this.ids.set(v, id); }
      if (!(id in nodes)) {
        nodes[id] = null; // claimed first: a loop back to it is just a reference
        const src = sv || v;
        const k = kindOf(v);
        let body;
        if (k === 'a') body = src.map((x) => { const y = val(x); return y === undefined ? null : y; });
        else if (k === 'S') body = [...src].map(val);
        else if (k === 'M') body = [...src].map(([a, b]) => [val(a), val(b)]);
        else { body = {}; for (const key of Object.keys(src)) { const y = val(src[key]); if (y !== undefined) body[key] = y; } }
        nodes[id] = { k, v: body };
      }
      return { $r: id };
    };
    const r = val(root);
    return { nodes, root: r };
  }
}

// Only what changed since the last message to the same page: the nodes that differ, and the
// numbers that are gone. sent: Map number → the node as last sent (one per page; a new Map for a full message).
export function delta({ nodes, root }, sent) {
  const out = {}, drop = [];
  const now = new Map();
  for (const [id, n] of Object.entries(nodes)) {
    const j = JSON.stringify(n);
    now.set(id, j);
    if (sent.get(id) !== j) out[id] = n;
  }
  for (const id of sent.keys()) if (!now.has(id)) drop.push(+id);
  sent.clear();
  for (const [id, j] of now) sent.set(id, j);
  return { nodes: out, drop, root };
}

const hiddenCard = (c) => ({ uid: c.uid, hidden: true, down: true, name: '', type: c.skill ? 'N' : 'S', power: 0, mana: 0, skill: !!c.skill, gone: false, resident: false });

// What viewer (a player of g, or null to see everything) may not see, as a swap map for encode.
// Hidden: the others' hands and decks, cards laid face down, an NP/skill card not shown yet while
// the true name is hidden, a hidden Servant (Kirei the Supervisor still sees its class [FD]), the
// unused Servants, the coming situation and event cards, and the Shinto events before they open.
export function viewSwap(g, viewer) {
  const swap = new Map();
  for (const p of g.players) swap.set(p, { ...p, isHuman: p === viewer });
  swap.set(g, { ...g, human: viewer || g.human });
  if (!viewer || g.over) return swap;
  const kirei = viewer.m.key === 'kirei' && !viewer.revealed && !viewer.out;
  const hideSv = (sv, cls) => swap.set(sv, { key: '?', name: T("ชื่อจริงซ่อน"), cls: cls || '?', deck: [], skills: [], hidden: true });
  for (const q of g.players) {
    if (q === viewer) continue;
    for (const c of [...q.hand, ...q.deck]) swap.set(c, hiddenCard(c));
    for (const c of [...q.trash, ...(q.play?.cards || [])]) if (c.down) swap.set(c, hiddenCard(c));
    if (!q.revealed) {
      hideSv(q.sv, kirei ? q.sv.cls : null);
      const shown = new Set((q.play?.cards || []).filter((c) => !c.down).map((c) => c.uid));
      for (const c of q.skills) if (!c.resident && !c.gone && !shown.has(c.uid)) swap.set(c, hiddenCard(c));
    }
  }
  for (const sv of g.unused || []) hideSv(sv);
  for (const s of g.sits || []) if (s !== g.sit && !(g.sitUsed || []).includes(s)) swap.set(s, { name: '?', text: '', fx: {}, hidden: true });
  for (const e of g.evDeck || []) swap.set(e, { name: '?', vp: 0, fx: {}, hidden: true });
  if (!g.shintoOpen && viewer.peek !== g.round) for (const e of g.evs?.shinto || []) swap.set(e, { name: '?', vp: 0, fx: {}, hidden: true });
  return swap;
}

// ---------- the page side ----------
// The page's copy. Objects are changed in place, so what main.js holds on to stays current.
export class Mirror {
  constructor() { this.objs = new Map(); this.kinds = new Map(); }
  // full: true when the message has every node (the first one); otherwise nodes not in it are kept
  apply({ nodes, root, drop = [] }, full = false) {
    const fresh = full ? new Map() : new Map(this.objs);
    for (const id of drop) fresh.delete(String(id));
    for (const [id, n] of Object.entries(nodes)) {
      let o = this.objs.get(id);
      if (!o || this.kinds.get(id) !== n.k) {
        o = n.k === 'G' ? Object.create(Game.prototype) : n.k === 'a' ? [] : n.k === 'S' ? new Set() : n.k === 'M' ? new Map() : {};
      }
      fresh.set(id, o);
    }
    // the server writes its texts in Thai: each page shows them in its own language (i18n.js)
    const val = (v) => {
      if (typeof v === 'string') return TX(v);
      if (v === null || typeof v !== 'object') return v;
      if ('$r' in v) return fresh.get(String(v.$r));
      if ('$s' in v) return BY_PATH.get(v.$s);
      if ('$n' in v) return Number(v.$n);
      return v;
    };
    for (const [id, n] of Object.entries(nodes)) {
      const o = fresh.get(id);
      if (n.k === 'a') { o.length = 0; for (const x of n.v) o.push(val(x)); }
      else if (n.k === 'S') { o.clear(); for (const x of n.v) o.add(val(x)); }
      else if (n.k === 'M') { o.clear(); for (const [a, b] of n.v) o.set(val(a), val(b)); }
      else {
        const keys = new Set(Object.keys(n.v).map(TX)); // keys too: p.uses is by card name
        for (const key of Object.keys(o)) if (!keys.has(key)) delete o[key];
        for (const [key, x] of Object.entries(n.v)) o[TX(key)] = val(x);
        if (n.k === 'G') { o.rng = Math.random; o.decide = () => new Promise(() => {}); o.onEvent = () => {}; } // the copy never runs on its own
      }
    }
    this.objs = fresh;
    if (full) this.kinds = new Map();
    for (const id of drop) this.kinds.delete(String(id));
    for (const [id, n] of Object.entries(nodes)) this.kinds.set(id, n.k);
    return val(root);
  }
}
