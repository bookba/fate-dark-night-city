// What the admin page changed (server/admin.mjs): the server writes it into index.html as
// window.__OVR, so it is here before anything is drawn. Without the server (the Claude artifact,
// vite, the server's own imports) it is empty and the game is the original.
// - OVR.strings[lang][key]: the language dictionary's texts (v5/i18n.js merges them in)
// - OVR.dom[lang][shown text]: any other text on the page, swapped where it shows
// - OVR.css: extra CSS · OVR.sounds[name]: a sound file (v5/sound.js) · pictures: swapped by the server
const W = typeof window !== 'undefined' ? window : null;
export const OVR = (W && W.__OVR && typeof W.__OVR === 'object') ? W.__OVR : {};
OVR.strings ||= {}; OVR.dom ||= {}; OVR.sounds ||= {};

const doc = W && W.document;
const lang = () => (doc && doc.documentElement.lang) || 'th';
const ATTRS = ['title', 'placeholder', 'aria-label'];
// a text node or attribute -> { src, shown }: its own text, and what is on the screen now
const seen = new WeakMap();
const attrSeen = new WeakMap();

function swap(src, map) {
  const k = src.trim();
  if (!k || !Object.prototype.hasOwnProperty.call(map, k)) return src;
  return src.replace(k, () => map[k]);
}
function fixText(n, map) {
  const cur = n.nodeValue;
  const r = seen.get(n);
  if (r && r.shown === cur) { // ours: still what we put there, but the edit itself may have changed
    const want = swap(r.src, map);
    if (want !== cur) { r.shown = want; n.nodeValue = want; }
    return;
  }
  const want = swap(cur, map);
  seen.set(n, { src: cur, shown: want });
  if (want !== cur) n.nodeValue = want;
}
function fixAttrs(el, map) {
  let rs = attrSeen.get(el);
  for (const a of ATTRS) {
    if (!el.hasAttribute(a)) continue;
    const cur = el.getAttribute(a);
    rs ||= {};
    const r = rs[a];
    const src = r && r.shown === cur ? r.src : cur;
    const want = swap(src, map);
    rs[a] = { src, shown: want };
    if (want !== cur) el.setAttribute(a, want);
  }
  if (rs) attrSeen.set(el, rs);
}
function walk(root, map) {
  if (root.nodeType === 3) { fixText(root, map); return; }
  if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;
  if (root.nodeType === 1) {
    if (root.tagName === 'SCRIPT' || root.tagName === 'STYLE' || root.closest?.('[data-admin-ui]')) return;
    fixAttrs(root, map);
  }
  const it = doc.createTreeWalker(root, 5 /* elements and texts */, {
    acceptNode: (n) => (n.nodeType === 1 && (n.tagName === 'SCRIPT' || n.tagName === 'STYLE' || n.hasAttribute('data-admin-ui')) ? 2 : 1),
  });
  for (let n = it.nextNode(); n; n = it.nextNode()) { if (n.nodeType === 3) fixText(n, map); else fixAttrs(n, map); }
}
let observer = null;
// (re)apply the page texts everywhere, and from now on to whatever the game draws
export function applyTexts() {
  if (!doc || !doc.body) return;
  const map = OVR.dom[lang()] || {};
  const any = Object.keys(map).length > 0;
  if (!any && !observer) return; // nothing changed: no watching at all
  walk(doc.body, map);
  if (observer) return;
  observer = new MutationObserver((list) => {
    const m = OVR.dom[lang()] || {};
    for (const r of list) {
      if (r.type === 'characterData') fixText(r.target, m);
      else if (r.type === 'attributes') { if (!r.target.closest?.('[data-admin-ui]')) fixAttrs(r.target, m); }
      else for (const n of r.addedNodes) walk(n, m);
    }
  });
  observer.observe(doc.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}
// the text as the game wrote it, under any swap (the in-game editor asks for this)
export const sourceOf = (n) => seen.get(n)?.src ?? n.nodeValue;
export const attrSourceOf = (el, a) => attrSeen.get(el)?.[a]?.src ?? el.getAttribute(a);

let cssEl = null;
export function applyCss() {
  if (!doc) return;
  if (!cssEl) { if (!OVR.css) return; cssEl = doc.createElement('style'); cssEl.id = 'admin-css'; doc.head.appendChild(cssEl); }
  cssEl.textContent = OVR.css || '';
}

if (doc) {
  const start = () => {
    applyCss();
    applyTexts();
    // the admin page's "edit on the game" button: ?edit=1 with the admin key in this tab
    let key = null;
    try { key = W.sessionStorage.getItem('fdnc-admin-key'); } catch { /* no storage */ }
    if (key && new URLSearchParams(W.location.search).has('edit')) import('./admin-edit.js').then((m) => m.start(key));
  };
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start, { once: true }); else start();
}
