// Editing on the game itself (opened from the admin page: /v5/?edit=1 in the same tab session).
// A small bar at the bottom: with "แก้ไข" on, a tap on any text asks for its new text (for the
// page's language), a tap on a picture asks for a new picture. Everything is saved on the server
// with the admin key, which server/admin.mjs checks; the game's own taps are held while it is on.
import { OVR, applyTexts, sourceOf, attrSourceOf } from './custom.js';

const lang = () => document.documentElement.lang || 'th';
const LANG_NAME = { th: 'ไทย', en: 'English', zh: '中文', ja: '日本語' };
let key = '', on = false, bar = null, box = null, hoverEl = null;

async function call(method, url, body, type = 'application/json') {
  const r = await fetch(url, { method, headers: { 'x-admin-key': key, ...(body != null ? { 'Content-Type': type } : {}) }, body: body == null ? undefined : type === 'application/json' ? JSON.stringify(body) : body });
  if (r.status === 404) throw new Error('รหัสแอดมินใช้ไม่ได้ (เปิดหน้าแอดมินใหม่ด้วยลิงก์ที่มีรหัส)');
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `ผิดพลาด ${r.status}`);
  return j;
}

const css = `
[data-admin-ui]{font:14px/1.4 'IBM Plex Sans Thai',system-ui,sans-serif;color:#1d1a16}
#adm-bar{position:fixed;left:8px;bottom:8px;z-index:2147483000;display:flex;gap:6px;align-items:center;background:#fffaf0;border:2px solid #b8860b;border-radius:999px;padding:5px 8px;box-shadow:0 4px 18px #0006;max-width:calc(100vw - 16px);flex-wrap:wrap}
#adm-bar.top{bottom:auto;top:8px}
@media (max-width:520px){#adm-bar{flex-wrap:nowrap;font-size:13px}#adm-bar .msg{display:none}#adm-bar button{padding:4px 9px}}
#adm-bar button,#adm-box button{font:inherit;border:1px solid #8a6d3b;background:#fff;border-radius:999px;padding:4px 12px;cursor:pointer}
#adm-bar button.on{background:#b8860b;color:#fff;border-color:#b8860b}
#adm-bar .msg{padding:0 6px;font-size:13px}
.adm-hover{outline:2px dashed #e0a100 !important;outline-offset:1px;cursor:text !important}
#adm-box{position:fixed;inset:0;z-index:2147483001;background:#0007;display:flex;align-items:center;justify-content:center;padding:16px}
#adm-box .card{background:#fffaf0;border-radius:12px;padding:14px;width:min(520px,100%);max-height:90vh;overflow:auto;box-shadow:0 8px 30px #000a}
#adm-box h3{margin:0 0 8px;font-size:16px}
#adm-box .orig{background:#f1e9d8;border-radius:8px;padding:6px 8px;white-space:pre-wrap;font-size:13px;margin-bottom:8px}
#adm-box textarea{width:100%;box-sizing:border-box;min-height:90px;font:inherit;padding:8px;border-radius:8px;border:1px solid #8a6d3b}
#adm-box .row{display:flex;gap:6px;justify-content:flex-end;margin-top:10px;flex-wrap:wrap}
#adm-box .primary{background:#b8860b;color:#fff;border-color:#b8860b}
#adm-box img{max-width:100%;max-height:200px;display:block;margin:0 auto 8px;border-radius:6px}
#adm-box small{color:#6b5a3a}
`;

export function start(k) {
  key = k;
  const st = document.createElement('style');
  st.textContent = css;
  document.head.appendChild(st);
  bar = document.createElement('div');
  bar.id = 'adm-bar';
  bar.dataset.adminUi = '';
  bar.innerHTML = `<button data-a="toggle">✏️ แก้ไข: ปิด</button><span class="msg">ภาษา ${LANG_NAME[lang()] || lang()}</span><button data-a="admin">⚙️ แอดมิน</button><button data-a="move" title="ย้ายแถบนี้ขึ้น/ลง">⇅</button><button data-a="quit" title="ออกจากโหมดแก้ไข">✕</button>`;
  document.body.appendChild(bar);
  bar.addEventListener('click', (e) => {
    const a = e.target.closest('button')?.dataset.a;
    if (a === 'toggle') setOn(!on);
    if (a === 'admin') location.href = `/admin?key=${encodeURIComponent(key)}`;
    if (a === 'move') bar.classList.toggle('top');
    if (a === 'quit') { const q = new URLSearchParams(location.search); q.delete('edit'); location.search = q.toString(); }
  });
  // the game's own taps are caught first while editing
  for (const t of ['pointerdown', 'mousedown', 'touchstart', 'pointerup', 'mouseup', 'click', 'dblclick', 'contextmenu']) {
    window.addEventListener(t, (e) => {
      if (!on || e.target.closest?.('[data-admin-ui]')) return;
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      if (t === 'click') pick(e);
    }, { capture: true, passive: false });
  }
  window.addEventListener('pointerover', (e) => {
    if (!on) return;
    hoverEl?.classList.remove('adm-hover');
    hoverEl = e.target.closest?.('[data-admin-ui]') ? null : e.target;
    hoverEl?.classList?.add('adm-hover');
  }, true);
}
function setOn(v) {
  on = v;
  const b = bar.querySelector('[data-a=toggle]');
  b.textContent = on ? '✏️ แก้ไข: เปิด' : '✏️ แก้ไข: ปิด';
  b.classList.toggle('on', on);
  if (!on) { hoverEl?.classList.remove('adm-hover'); hoverEl = null; }
}
function note(t) { const m = bar.querySelector('.msg'); m.textContent = t; clearTimeout(note.t); note.t = setTimeout(() => { m.textContent = `ภาษา ${LANG_NAME[lang()] || lang()}`; }, 4000); }

// the text node under the finger
function textAt(x, y, el) {
  let n = null;
  if (document.caretPositionFromPoint) n = document.caretPositionFromPoint(x, y)?.offsetNode;
  else if (document.caretRangeFromPoint) n = document.caretRangeFromPoint(x, y)?.startContainer;
  if (n && n.nodeType === 3 && n.nodeValue.trim() && el.contains(n)) return n;
  const it = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let t = it.nextNode(); t; t = it.nextNode()) if (t.nodeValue.trim()) return t;
  return null;
}
// a picture's address on this site (an <img>, an <image> in an SVG, or a CSS background)
function pictureAt(el) {
  for (let e = el, i = 0; e && e.nodeType === 1 && i < 4; e = e.parentElement, i++) {
    const src = e.tagName === 'IMG' ? e.currentSrc || e.src : e.tagName === 'image' ? e.getAttribute('href') || e.getAttribute('xlink:href') : null;
    const bg = getComputedStyle(e).backgroundImage;
    const u = src || (bg && bg !== 'none' ? (bg.match(/url\(["']?([^"')]+)["']?\)/) || [])[1] : null);
    if (u && !u.startsWith('data:')) {
      try { const p = new URL(u, location.href); if (p.origin === location.origin) return { path: p.pathname, url: p.href, el: e }; } catch { /* not an address */ }
    }
  }
  return null;
}

function pick(e) {
  const el = e.target;
  hoverEl?.classList.remove('adm-hover');
  const pic = pictureAt(el);
  const t = textAt(e.clientX, e.clientY, el);
  const title = !t && ['title', 'placeholder', 'aria-label'].map((a) => [a, el.getAttribute?.(a)]).find(([, v]) => v);
  if (pic && (!t || el.tagName === 'IMG')) return editPicture(pic, t);
  if (t) return editText(sourceOf(t).trim());
  if (title) return editText(attrSourceOf(el, title[0]).trim());
  if (pic) return editPicture(pic, null);
  note('ตรงนี้ไม่มีข้อความหรือรูปให้แก้');
}

function dialog(html, wire) {
  box?.remove();
  box = document.createElement('div');
  box.id = 'adm-box';
  box.dataset.adminUi = '';
  box.innerHTML = `<div class="card">${html}</div>`;
  document.body.appendChild(box);
  box.addEventListener('click', (e) => { if (e.target === box || e.target.dataset.a === 'cancel') close(); });
  wire(box);
}
const close = () => { box?.remove(); box = null; };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function editText(src) {
  const l = lang();
  const map = (OVR.dom[l] ||= {});
  const cur = Object.prototype.hasOwnProperty.call(map, src) ? map[src] : src;
  dialog(`<h3>แก้ข้อความ (${esc(LANG_NAME[l] || l)})</h3><div class="orig">${esc(src)}</div>
    <textarea>${esc(cur)}</textarea>
    <small>เปลี่ยนทุกที่ที่ข้อความนี้ขึ้นแบบตรงทั้งก้อน ในภาษานี้ ข้อความที่มีตัวเลขเปลี่ยนไปเรื่อยๆ แก้ที่แท็บ "ข้อความ" ในหน้าแอดมิน</small>
    <div class="row">${map[src] != null ? '<button data-a="reset">คืนค่าเดิม</button>' : ''}<button data-a="cancel">ยกเลิก</button><button class="primary" data-a="save">บันทึก</button></div>`, (b) => {
    const ta = b.querySelector('textarea');
    ta.focus();
    b.querySelector('[data-a=save]').onclick = () => saveText(l, src, ta.value === src ? null : ta.value);
    const r = b.querySelector('[data-a=reset]');
    if (r) r.onclick = () => saveText(l, src, null);
  });
}
async function saveText(l, src, value) {
  try {
    await call('POST', '/admin/api/text', { part: 'dom', lang: l, key: src, value });
    if (value == null) delete OVR.dom[l][src]; else OVR.dom[l][src] = value;
    applyTexts();
    close();
    note('บันทึกแล้ว');
  } catch (err) { alertIn(err.message); }
}
function alertIn(t) { const c = box?.querySelector('.card'); if (c) { let p = c.querySelector('.err'); if (!p) { p = document.createElement('p'); p.className = 'err'; p.style.color = '#a11'; c.appendChild(p); } p.textContent = t; } else note(t); }

function editPicture(pic, t) {
  dialog(`<h3>เปลี่ยนรูป</h3><img src="${esc(pic.url)}" alt=""><div class="orig">${esc(pic.path)}</div>
    <input type="file" accept="image/webp,image/png,image/jpeg,image/gif,image/svg+xml">
    <small>รูปใหม่ขึ้นแทนรูปนี้ทุกที่ในเกม ควรใช้สัดส่วนเดียวกับรูปเดิม ไม่เกิน 8 MB</small>
    <div class="row">${t ? '<button data-a="text">แก้ข้อความตรงนี้แทน</button>' : ''}<button data-a="reset">คืนรูปเดิม</button><button data-a="cancel">ยกเลิก</button><button class="primary" data-a="save">บันทึก</button></div>`, (b) => {
    const inp = b.querySelector('input');
    inp.onchange = () => { const f = inp.files[0]; if (f) b.querySelector('img').src = URL.createObjectURL(f); };
    b.querySelector('[data-a=save]').onclick = async () => {
      const f = inp.files[0];
      if (!f) { alertIn('เลือกไฟล์รูปก่อน'); return; }
      try { await call('PUT', `/admin/api/image?path=${encodeURIComponent(pic.path)}&name=${encodeURIComponent(f.name)}`, f, f.type); refresh(pic); close(); note('เปลี่ยนรูปแล้ว'); } catch (err) { alertIn(err.message); }
    };
    b.querySelector('[data-a=reset]').onclick = async () => {
      try { await call('DELETE', `/admin/api/image?path=${encodeURIComponent(pic.path)}`); refresh(pic); close(); note('คืนรูปเดิมแล้ว'); } catch (err) { alertIn(err.message); }
    };
    const tx = b.querySelector('[data-a=text]');
    if (tx) tx.onclick = () => editText(sourceOf(t).trim());
  });
}
// show the new picture now: every <img> with this address gets a fresh one
function refresh(pic) {
  const v = `v=${Date.now()}`;
  for (const im of document.querySelectorAll('img')) {
    try { const p = new URL(im.src); if (p.pathname === pic.path) { p.search = v; im.src = p.href; } } catch { /* skip */ }
  }
  if (pic.el.tagName !== 'IMG') note('รูปพื้นหลังจะเปลี่ยนเมื่อเปิดหน้าใหม่');
}
