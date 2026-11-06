// Languages (B 6 Nov 2026): Thai, the source, plus English, Chinese and Japanese.
// Every text of the page is written in Thai in the code and goes through T(); the Thai text itself
// is the key (gettext style), with {0}, {1}, … where a value is put in. STRINGS holds the texts of
// each language: a key missing there falls back to Thai, so STRINGS.th is empty unless the admin
// page changes a Thai text. STRINGS is read at every call, so overrides merged in before the
// first drawing take effect everywhere. Texts the rules write (game.js: the war log, the notes of
// a fight, why a card cannot be used) stay Thai, also on the server; TX() turns a finished Thai
// text into the current language by matching it against the templates of game.js.
import en from './lang/en.js';
import zh from './lang/zh.js';
import ja from './lang/ja.js';
import { PATTERNS } from './lang/patterns.js';
import { OVR } from './custom.js';

export const LANGS = { th: 'ไทย', en: 'English', zh: '中文', ja: '日本語' };
export const STRINGS = { th: {}, en: { ...en }, zh: { ...zh }, ja: { ...ja } };
// texts changed on the admin page (server/admin.mjs), here before any module reads them
for (const l of Object.keys(STRINGS)) Object.assign(STRINGS[l], OVR.strings?.[l] || {});

const pick = () => {
  try {
    const q = new URLSearchParams(location.search).get('lang');
    if (q && LANGS[q]) return q;
  } catch { /* no page: the server */ }
  try { const s = localStorage.getItem('dgw-lang'); if (s && LANGS[s]) return s; } catch { /* no storage */ }
  return 'th';
};
let cur = pick();
const mark = () => { try { document.documentElement.lang = cur; } catch { /* no page */ } };
mark();
export const lang = () => cur;
// the card and area texts are worked out when the modules load, so a new language reloads the page
export function setLang(l, reload = true) {
  if (!LANGS[l]) return;
  cur = l;
  try { localStorage.setItem('dgw-lang', l); } catch { /* not kept */ }
  mark();
  if (reload) {
    try {
      const u = new URL(location.href);
      if (u.searchParams.has('lang')) { u.searchParams.set('lang', l); location.replace(u.href); return; }
    } catch { /* keep going */ }
    location.reload();
  }
}

const fill = (s, a) => (a.length ? String(s).replace(/\{(\d+)\}/g, (m, i) => (a[+i] ?? '')) : String(s));
const look = (k) => STRINGS[cur]?.[k] ?? STRINGS.th[k] ?? k;
// T('ใช้ {0} ได้ {1} VP', name, n)
export const T = (k, ...a) => fill(look(k), a);

// ---------- finished Thai texts (the rules' texts, also from the server) ----------
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
let compiled = null;
function compile() {
  // the longest fixed text first, so a narrow template wins over a loose one
  compiled = PATTERNS.map((k) => {
    const parts = k.split(/\{\d+\}/);
    const ids = [...k.matchAll(/\{(\d+)\}/g)].map((m) => +m[1]);
    return { k, ids, len: parts.join('').length, re: new RegExp(`^${parts.map(reEsc).join('([\\s\\S]*?)')}$`) };
  }).filter((p) => p.ids.length).sort((a, b) => b.len - a.len);
}
const THAI = /[฀-๿]/;
const cache = new Map();
export function TX(s, depth = 0) {
  if (s == null) return s;
  s = String(s);
  if (cur === 'th' && !Object.keys(STRINGS.th).length) return s;
  if (!THAI.test(s) || depth > 6) return s;
  const ck = `${cur}\u0001${s}`;
  if (depth === 0 && cache.has(ck)) return cache.get(ck);
  let out = null;
  if (STRINGS[cur]?.[s] != null || STRINGS.th[s] != null) out = look(s);
  if (out == null) {
    if (!compiled) compile();
    for (const p of compiled) {
      const m = p.re.exec(s);
      if (!m) continue;
      const a = [];
      p.ids.forEach((id, i) => { a[id] = TX(m[i + 1], depth + 1); });
      out = fill(look(p.k), a);
      break;
    }
  }
  if (out == null) {
    // joined pieces: "a · b", "a, b"
    for (const sep of [' · ', ', ', ' + ']) {
      if (s.includes(sep)) { out = s.split(sep).map((x) => TX(x, depth + 1)).join(sep); break; }
    }
  }
  if (out == null) {
    // leading/trailing spaces and marks around a known text
    const m = /^([\s✸✖📖🏆⚔─·:(]*)([\s\S]*?)([\s)·:─]*)$/.exec(s);
    if (m && (m[1] || m[3]) && m[2] && (STRINGS[cur]?.[m[2]] != null)) out = m[1] + look(m[2]) + m[3];
  }
  if (out == null) out = s;
  if (depth === 0) { if (cache.size > 4000) cache.clear(); cache.set(ck, out); }
  return out;
}
