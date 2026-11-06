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

export const LANGS = { th: 'ไทย', en: 'English', zh: '中文', ja: '日本語' };
export const STRINGS = { th: {}, en: { ...en }, zh: { ...zh }, ja: { ...ja } };

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
// A text is matched against every template of PATTERNS; where values sit side by side ("{1}{2}")
// or a template is loose ("{0} {1} VP"), every way to cut the text is tried, and the one that
// leaves the least Thai wins. Values are turned the same way, so names and areas inside change too.
const THAI = /[฀-๿]/g;
const thaiCount = (s) => (s.match(THAI) || []).length;
let compiled = null;
function compile() {
  const trim = (t) => t.replace(/^[\s·]+|[\s·]+$/g, '');
  const one = (k, src, cut) => {
    const parts = k.split(/\{\d+\}/);
    const ids = [...k.matchAll(/\{(\d+)\}/g)].map((m) => +m[1]);
    return { k: src, cut, parts, ids, len: parts.join('').length };
  };
  // a piece written after " · " also comes alone, once the pieces are split
  compiled = PATTERNS.flatMap((k) => (trim(k) !== k ? [one(k, k, false), one(trim(k), k, true)] : [one(k, k, false)]))
    .filter((p) => p.ids.length && p.len).sort((a, b) => b.len - a.len);
}
// every way to cut s into the values of p (at most 40)
function cuts(p, s) {
  const out = [];
  if (!s.startsWith(p.parts[0])) return out;
  const last = p.parts[p.parts.length - 1];
  if (!s.endsWith(last) || s.length < p.parts[0].length + last.length) return out;
  const go = (pos, i, vals) => {
    if (out.length >= 40) return;
    const next = p.parts[i + 1];
    if (i === p.ids.length - 1) { const end = s.length - last.length; if (end >= pos) out.push([...vals, s.slice(pos, end)]); return; }
    for (let j = pos; j <= s.length; j++) {
      if (next && !s.startsWith(next, j)) continue;
      go(j + next.length, i + 1, [...vals, s.slice(pos, j)]);
      if (out.length >= 40) return;
    }
  };
  go(p.parts[0].length, 0, []);
  return out;
}
// the cost of a way: Thai left counts most, then empty values and loose templates ("{0} {1}")
const cache = new Map();
function tx(s, depth) {
  if (!thaiCount(s)) return [s, 0];
  if (depth > 5) return [s, thaiCount(s) * 100 + 1]; // too deep: not kept, a shallower try may do better
  const ck = `${cur}\u0001${s}`;
  if (cache.has(ck)) return cache.get(ck);
  let best = [s, thaiCount(s) * 100 + 1];
  if (STRINGS[cur]?.[s] != null || STRINGS.th[s] != null) best = [look(s), 0];
  else {
    if (!compiled) compile();
    for (const p of compiled) {
      for (const vals of cuts(p, s)) {
        const a = [];
        let c = p.len <= 2 ? 6 : 1;
        p.ids.forEach((id, i) => { const [o, k] = vals[i] === '' ? ['', 3] : tx(vals[i], depth + 1); a[id] = o; c += k; });
        if (c < best[1]) best = [fill(p.cut ? look(p.k).replace(/^[\s·]+|[\s·]+$/g, '') : look(p.k), a), c];
      }
      if (best[1] <= 1) break;
    }
    // joined pieces: "a · b", "a, b", "a + b"
    for (const sep of [' · ', ', ', ' + ', ' → ']) {
      if (!s.includes(sep)) continue;
      let c = 2;
      const j = s.split(sep).map((x) => { const [o, k] = tx(x, depth + 1); c += k; return o; }).join(sep);
      if (c < best[1]) best = [j, c];
      break;
    }
  }
  if (cache.size > 8000) cache.clear();
  cache.set(ck, best);
  return best;
}
export function TX(s) {
  if (s == null) return s;
  s = String(s);
  if (cur === 'th' && !Object.keys(STRINGS.th).length) return s;
  if (!thaiCount(s)) return s;
  return tx(s, 0)[0];
}

// ---------- texts turned into icons (icons.js, main.js) ----------
export const rxEsc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// a regular expression from the current language's text of a template: {0} becomes group,
// a space may be left out (Chinese and Japanese often write none), letters in any case
export const tplRe = (key, group = '', flags = 'g') => new RegExp(T(key).split(/\{0\}/).map((x) => rxEsc(x).replace(/ /g, '\\s?')).join(group), cur === 'en' ? `${flags}i` : flags);
// the texts in the current language, the longest first, as one alternation
export const anyRe = (keys, flags = 'g') => new RegExp([...new Set(keys.map((k) => T(k)))].sort((a, b) => b.length - a.length).map(rxEsc).join('|'), cur === 'en' ? `${flags}i` : flags);
