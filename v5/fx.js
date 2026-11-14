// Animations and effects (paper 4.6 item 27, B 8 Nov 2026): phase banners, pieces that fly and
// land, cards laid, clashes, VP and mana numbers, a Master knocked out, a True Name revealed and
// the winner's grail light.
//
// The board is redrawn often (innerHTML), so nothing here animates the board itself: after each
// drawing fxFrame() compares the game with the last drawing and plays the effects on a layer of
// its own (#fx) laid over the page, at the places the board shows. This works the same for a
// game played here and for the copy an online game draws (net.js), which only sees the state.
//
// Settings: 'full' · 'lite' (no flying pieces, shaking or sparks, only light fades) · 'off'.

let level = 'full';
export function setFxLevel(l) {
  level = ['full', 'lite', 'off'].includes(l) ? l : 'full';
  try { document.documentElement.classList.toggle('no-anim', level === 'off'); } catch { /* no page */ }
}
export const fxLevel = () => level;

// two layers: #fx under the pop-ups (effects at places on the board), #fx-top over everything
// but the your-turn banner (the phase bands, the screen's edges, the grail)
let layer = null, top = null, hideCss = null;
function root(up = false) {
  if (!layer?.isConnected) {
    layer = document.createElement('div'); layer.id = 'fx';
    top = document.createElement('div'); top.id = 'fx-top';
    for (const l of [layer, top]) { l.className = 'fx-layer'; l.setAttribute('aria-hidden', 'true'); document.body.append(l); }
    hideCss = document.createElement('style');
    document.head.append(hideCss);
  }
  return up ? top : layer;
}
const UP = /^fx-(ban|vignette|gold)/;
const mk = (cls, html = '', style = {}) => {
  const el = document.createElement('div');
  el.className = cls;
  if (html) el.innerHTML = html;
  Object.assign(el.style, style);
  root(UP.test(cls)).append(el);
  return el;
};
// play keyframes on an element of the layer and take it away at the end
function run(el, frames, o) {
  const a = el.animate(frames, { fill: 'both', easing: 'ease-out', ...o });
  a.onfinish = () => el.remove();
  a.oncancel = () => el.remove();
  setTimeout(() => el.remove(), (o.duration || 0) + (o.delay || 0) + 400); // a tab in the background may never finish
  return a;
}
const mid = (r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
const at = (el, r, w = r.width, h = r.height) => Object.assign(el.style, { left: `${mid(r).x - w / 2}px`, top: `${mid(r).y - h / 2}px`, width: `${w}px`, height: `${h}px` });
const rectOf = (sel) => { const el = document.querySelector(sel); const r = el?.getBoundingClientRect(); return r && r.width ? r : null; };

// pieces in flight stay hidden on the board until they land
const hidden = new Map(); // pid → until (ms)
function hideTok(pid, ms) {
  hidden.set(pid, performance.now() + ms);
  writeHide();
  setTimeout(writeHide, ms + 20);
}
function writeHide() {
  const now = performance.now();
  for (const [k, t] of hidden) if (t <= now) hidden.delete(k);
  if (hideCss) hideCss.textContent = [...hidden.keys()].map((k) => `#board .map .tok[data-pid="${k}"]`).join(',') + (hidden.size ? '{visibility:hidden}' : '');
}

// ---------- the effects ----------
// a band across the board with the phase or the round: "เฟส 3 · ปฏิบัติการ"
// One band at a time: a round's band and its first phase come one after the other (the bots
// can get through a phase faster than its band shows; then only the newest waits).
let bannerEl = null, banQ = [], banUntil = 0, banTimer = null;
export function banner(title, sub = '', cls = '') {
  if (level === 'off') return;
  banQ = [...banQ, { title, sub, cls }].slice(-2);
  pump();
}
function pump() {
  clearTimeout(banTimer);
  const wait = banUntil - performance.now();
  if (wait > 0) { banTimer = setTimeout(pump, wait); return; }
  const b = banQ.shift();
  if (b) showBanner(b.title, b.sub, b.cls);
  if (banQ.length) banTimer = setTimeout(pump, banUntil - performance.now());
}
function showBanner(title, sub, cls) {
  banUntil = performance.now() + (cls.includes('round') || cls.includes('climax') ? 1100 : 800);
  bannerEl?.remove();
  const b = rectOf('#board') || { left: 0, top: 0, width: innerWidth, height: innerHeight };
  const el = mk(`fx-ban ${cls}`, `<i class="fx-streak"></i><b>${title}</b>${sub ? `<small>${sub}</small>` : ''}`);
  el.style.top = `${Math.max(b.top + 8, b.top + b.height * 0.36)}px`;
  bannerEl = el;
  const lite = level === 'lite';
  run(el, lite
    ? [{ opacity: 0 }, { opacity: 1, offset: 0.15 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }]
    : [{ opacity: 0, transform: 'translateX(-50%) scaleX(.2)', filter: 'blur(6px)' }, { opacity: 1, transform: 'translateX(-50%) scaleX(1.04)', filter: 'blur(0)', offset: 0.14 },
      { opacity: 1, transform: 'translateX(-50%) scaleX(1)', offset: 0.22 }, { opacity: 1, transform: 'translateX(-50%) scaleX(1)', offset: 0.8 }, { opacity: 0, transform: 'translateX(-50%) scaleX(1.02) translateY(-8px)' }],
  { duration: lite ? 1300 : 1500, easing: 'cubic-bezier(.2,.8,.3,1)' });
  if (!lite) run(el.querySelector('.fx-streak'), [{ transform: 'translateX(-120%)' }, { transform: 'translateX(320%)' }], { duration: 900, delay: 120, easing: 'ease-in-out' });
  if (cls.includes('fight') && !lite) slashes(b, 180, false, true);
}
// two light slashes crossing a box (the combat phase, a fight's result)
function slashes(r, delay = 0, small = false, up = false) {
  for (const [i, rot] of [[0, -32], [1, 32]]) {
    const el = mk(`fx-slash${small ? ' sm' : ''}`);
    if (up) root(true).append(el);
    const w = Math.hypot(r.width, r.height) * (small ? 0.8 : 0.9);
    Object.assign(el.style, { left: `${mid(r).x - w / 2}px`, top: `${mid(r).y}px`, width: `${w}px` });
    run(el, [{ transform: `rotate(${rot}deg) scaleX(0)`, opacity: 1, transformOrigin: i ? 'right' : 'left' }, { transform: `rotate(${rot}deg) scaleX(1)`, opacity: 1, offset: 0.45 }, { transform: `rotate(${rot}deg) scaleX(1)`, opacity: 0 }],
      { duration: small ? 420 : 560, delay: delay + i * 110, easing: 'cubic-bezier(.5,0,.2,1)' });
  }
}
// a ring that opens out (a piece landing, a Command Spell)
function ring(r, cls = '', delay = 0, size = 1) {
  const s = Math.max(r.width, r.height) * size;
  const el = mk(`fx-ring ${cls}`);
  at(el, r, s, s);
  run(el, [{ transform: 'scale(.5)', opacity: 0.95 }, { transform: 'scale(2.1)', opacity: 0 }], { duration: 620, delay });
}
// a number that rises from a place and fades: "+3 VP", "มานา +2"
export function float(r, text, cls = '', delay = 0) {
  if (level === 'off' || !r) return;
  const el = mk(`fx-num ${cls}`, text);
  el.style.left = `${mid(r).x}px`; el.style.top = `${r.top}px`;
  run(el, [{ opacity: 0, transform: 'translate(-50%, 4px) scale(.6)' }, { opacity: 1, transform: 'translate(-50%, -10px) scale(1.15)', offset: 0.18 },
    { opacity: 1, transform: 'translate(-50%, -18px) scale(1)', offset: 0.7 }, { opacity: 0, transform: 'translate(-50%, -34px) scale(1)' }], { duration: 1300, delay });
}
// sparks out of a point (a win, the true name, the grail)
function sparks(r, cls = '', n = 10, delay = 0, reach = 46) {
  if (level !== 'full') return;
  const c = mid(r);
  for (let i = 0; i < n; i += 1) {
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.5, d = reach * (0.6 + Math.random() * 0.6);
    const el = mk(`fx-spark ${cls}`, '', { left: `${c.x}px`, top: `${c.y}px` });
    run(el, [{ transform: 'translate(-50%,-50%) scale(1)', opacity: 1 }, { transform: `translate(calc(-50% + ${Math.cos(a) * d}px), calc(-50% + ${Math.sin(a) * d}px)) scale(.3)`, opacity: 0 }],
      { duration: 650 + Math.random() * 300, delay, easing: 'cubic-bezier(.1,.7,.3,1)' });
  }
}
// a glow over a box: gold (won), red (hit), purple (Command Spell)
function flash(r, cls, delay = 0, dur = 700) {
  if (!r) return;
  const el = mk(`fx-flash ${cls}`);
  at(el, r);
  run(el, [{ opacity: 0 }, { opacity: 1, offset: 0.25 }, { opacity: 0 }], { duration: dur, delay });
}
function shake(sel, delay = 0) {
  if (level !== 'full') return;
  setTimeout(() => document.querySelector(sel)?.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-5px)' }, { transform: 'translateX(5px)' }, { transform: 'translateX(-3px)' }, { transform: 'translateX(0)' }], { duration: 320 }), delay);
}
// a copy of a piece flying from one place to another, then landing with a ring
function flyTok(pid, html, from, to, delay = 0) {
  const s = to.width;
  if (level !== 'full' || !from) { ring(to, 'land', delay); return; }
  const el = mk('fx-tok', html);
  at(el, from, s, s);
  const dx = mid(to).x - mid(from).x, dy = mid(to).y - mid(from).y;
  const lift = Math.min(70, 24 + Math.hypot(dx, dy) * 0.18);
  const dur = Math.min(720, 380 + Math.hypot(dx, dy) * 0.6);
  hideTok(pid, dur + delay);
  run(el, [{ transform: 'translate(0,0) scale(1)' }, { transform: `translate(${dx / 2}px, ${dy / 2 - lift}px) scale(1.3)`, offset: 0.5 }, { transform: `translate(${dx}px, ${dy}px) scale(1)`, offset: 0.88 }, { transform: `translate(${dx}px, ${dy}px) scale(1.12, .86)` }],
    { duration: dur, delay, easing: 'ease-in-out' });
  ring(to, 'land', delay + dur * 0.85);
}
// a piece put down from above (the outpost phase)
function dropTok(pid, html, to, delay = 0) {
  if (level !== 'full') { ring(to, 'land', delay); return; }
  const el = mk('fx-tok', html);
  at(el, to);
  hideTok(pid, 420 + delay);
  run(el, [{ transform: 'translateY(-46px) scale(1.6)', opacity: 0 }, { transform: 'translateY(0) scale(1)', opacity: 1, offset: 0.75 }, { transform: 'scale(1.14, .84)' }], { duration: 420, delay, easing: 'cubic-bezier(.5,0,.8,.6)' });
  ring(to, 'land', delay + 360);
}
// cards laid: card backs flying to the piece (yours from the hand)
function cardsTo(n, from, to, mine, delay = 0) {
  if (!to) return;
  if (level !== 'full') { flash(to, 'card', delay, 500); return; }
  const w = 26, h = 36;
  for (let i = 0; i < Math.min(n, 5); i += 1) {
    const el = mk(`fx-card${mine ? ' mine' : ''}`);
    const src = from ? { x: mid(from).x + (i - n / 2) * 24, y: mid(from).y } : { x: mid(to).x + (i - n / 2) * 14, y: to.top - 54 };
    Object.assign(el.style, { left: `${src.x - w / 2}px`, top: `${src.y - h / 2}px`, width: `${w}px`, height: `${h}px` });
    const dx = mid(to).x - src.x + (i - (n - 1) / 2) * 6, dy = mid(to).y - src.y;
    run(el, [{ transform: `translate(0,0) rotate(${(i - 1) * 14}deg) scale(${from ? 1.2 : 0.8})`, opacity: from ? 1 : 0 },
      { transform: `translate(${dx * 0.55}px, ${dy * 0.55 - 26}px) rotate(${i * 90}deg) scale(1)`, opacity: 1, offset: 0.55 },
      { transform: `translate(${dx}px, ${dy}px) rotate(${(i - 1) * 8 + 180}deg) scale(.55)`, opacity: 0 }], { duration: 560, delay: delay + i * 90, easing: 'ease-in-out' });
  }
  flash(to, 'card', delay + 480, 500);
}
// a Master out of the war: the piece breaks up in red
function shatter(html, r, mine, delay = 0) {
  if (!r) return;
  flash(r, 'hit', delay, 900);
  if (level === 'full') {
    const el = mk('fx-tok dead', html);
    at(el, r);
    run(el, [{ transform: 'scale(1)', opacity: 1, filter: 'grayscale(0)' }, { transform: 'scale(1.35) rotate(-8deg)', opacity: 1, filter: 'grayscale(1) brightness(1.6)', offset: 0.3 }, { transform: 'scale(.4) rotate(25deg) translateY(30px)', opacity: 0, filter: 'grayscale(1)' }], { duration: 900, delay });
    sparks(r, 'red', 12, delay + 200, 54);
  }
  float(r, '✖', 'dead', delay + 150);
  if (mine) {
    const v = mk('fx-vignette red');
    run(v, [{ opacity: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 0 }], { duration: level === 'full' ? 1600 : 900, delay });
  }
}
// the winner: light from above and gold falling (also the true name revealed, smaller)
function grail(mine) {
  const v = mk(`fx-vignette ${mine ? 'gold' : 'dim'}`);
  run(v, [{ opacity: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 1, offset: 0.6 }, { opacity: 0 }], { duration: 2600 });
  if (level !== 'full' || !mine) return;
  for (let i = 0; i < 46; i += 1) {
    const el = mk('fx-gold', '', { left: `${Math.random() * 100}vw`, top: '-12px' });
    const dur = 1800 + Math.random() * 1600;
    run(el, [{ transform: `translateY(0) rotate(0)`, opacity: 1 }, { transform: `translate(${(Math.random() - 0.5) * 120}px, ${innerHeight * (0.7 + Math.random() * 0.4)}px) rotate(${Math.random() * 720}deg)`, opacity: 0 }],
      { duration: dur, delay: Math.random() * 900, easing: 'cubic-bezier(.3,.1,.6,1)' });
  }
}

// ---------- what changed since the last drawing ----------
let prev = null, prevG = null;
const resSeen = new Map(); // "round:area" → when the result first showed (the board staggers your own fight)

function snapshot(g) {
  const ps = new Map();
  for (const p of g.players) {
    const el = document.querySelector(`#board .map .tok[data-pid="${p.id}"]`);
    const any = el || document.querySelector(`#board .strip .tok[data-pid="${p.id}"]`) || document.querySelector(`#standings li[data-id="${p.id}"] .chip`);
    const r = any?.getBoundingClientRect();
    ps.set(p.id, { at: p.at, slot: p.slot, vp: p.vp, mana: p.mana, cs: p.cs, out: !!p.out, revealed: !!p.revealed, played: !!p.play, n: p.play?.cards?.length || 0, rect: r && r.width ? r : null, onMap: !!el, html: (el || any)?.outerHTML || '' });
  }
  return { phase: g.phase, round: g.round, over: !!g.over, ps, res: new Set((g.results || []).filter((r) => !r.alone).map((r) => `${g.round}:${r.f}`)) };
}

// o: { started, skip, meId, myF, resStep, banners: { prep, outpost, action, combat } → [title, sub], roundTitle, roundSub, climax }
export function fxFrame(g, o) {
  if (!g || typeof document === 'undefined') return;
  const fresh = g !== prevG;
  if (fresh) { resSeen.clear(); prevG = g; prev = null; }
  if (!o.started) { prev = null; return; }
  const now = snapshot(g);
  const was = prev;
  prev = now;
  if (!was || level === 'off' || o.skip || document.hidden) return;
  root();

  // phase and round
  if (now.phase !== was.phase && now.phase && !now.over) {
    if (now.round !== was.round) banner(o.roundTitle, o.roundSub, o.climax ? 'climax' : 'round');
    if (o.banners[now.phase]) banner(...o.banners[now.phase], `ph-${now.phase === 'combat' ? 'fight' : now.phase === 'action' ? 'move' : 'place'}`);
    if (now.phase === 'combat') { // every battlefield with a fight shakes as the fight starts
      const busy = new Set([...now.ps.values()].filter((p) => !p.out && p.played).map((p) => p.at));
      for (const f of busy) {
        if ([...now.ps.values()].filter((p) => p.at === f && !p.out).length < 2) continue;
        const r = rectOf(`#board .area[data-to="${f}"]`);
        if (r) { setTimeout(() => { const rr = rectOf(`#board .area[data-to="${f}"]`) || r; sparks({ left: mid(rr).x - 10, top: mid(rr).y - 10, width: 20, height: 20 }, 'gold', 8, 0, 40); }, 650); shake(`#board .area[data-to="${f}"]`, 650); }
      }
    }
  }

  // a fight's result: slashes over the area; the winners shine, the defeated go red
  const fightDelay = (f) => {
    const t = resSeen.get(`${g.round}:${f}`);
    if (t == null) return 0;
    const n = (g.results.find((r) => r.f === f)?.ents.length) || 0;
    return f === o.myF ? Math.max(0, t + n * o.resStep - performance.now()) : Math.max(0, t + 300 - performance.now());
  };
  for (const key of now.res) {
    if (was.res.has(key) || resSeen.has(key)) continue;
    resSeen.set(key, performance.now());
    const f = key.split(':')[1];
    const r = (g.results || []).find((x) => x.f === f);
    const ar = rectOf(`#board .area[data-to="${f}"]`);
    if (!r || !ar) continue;
    if (level === 'full') slashes(ar, 0, true);
    flash(ar, 'clash', 0, 500);
    const d = fightDelay(f);
    for (const e of r.ents) {
      const tr = rectOf(`#board .map .tok[data-pid="${e.id}"]`);
      if (!tr) continue;
      if (e.won && !e.defeated) { flash(tr, 'won', d, 900); sparks(tr, 'gold', 10, d); }
      else if (e.defeated) { flash(tr, 'hit', d, 800); float(tr, '☠', 'dead', d); shake(`#board .area[data-to="${f}"]`, d); }
    }
  }

  for (const [id, p] of now.ps) {
    const q = was.ps.get(id);
    if (!q) continue;
    const mine = id === o.meId;
    const r = p.rect || q.rect;
    // knocked out of the war
    if (p.out && !q.out) { shatter(q.html || p.html, q.rect || p.rect, mine); continue; }
    if (p.out) continue;
    // a piece put down or moved
    if (p.onMap && p.rect && (p.at !== q.at || (p.slot !== q.slot && p.at === q.at && p.at === 'workshop'))) {
      if (q.at && q.onMap) flyTok(id, p.html, q.rect, p.rect);
      else if (!q.at) dropTok(id, p.html, p.rect);
    }
    // cards laid
    if (p.played && !q.played && p.rect) cardsTo(p.n || 2, mine ? rectOf('#board .hand .cards') : null, p.rect, mine, p.at !== q.at ? 500 : 0);
    // the true name
    if (p.revealed && !q.revealed && r) { flash(r, 'reveal', 0, 1000); ring(r, 'reveal', 0, 1.4); sparks(r, 'gold', 14, 100, 60); }
    // VP: gold up, red down; during your fight it waits for the result on the board
    const dv = p.vp - q.vp;
    if (dv && r) {
      const d = g.phase === 'combat' && p.at ? fightDelay(p.at) : 0;
      float(r, `${dv > 0 ? '+' : '−'}${Math.abs(dv)} VP`, dv > 0 ? 'vp' : 'neg', d);
      if (mine) float(rectOf('#hud .mystat .v'), `${dv > 0 ? '+' : '−'}${Math.abs(dv)}`, dv > 0 ? 'vp' : 'neg', d);
    }
    // a Command Spell spent: a purple seal
    if (p.cs < q.cs && r) { ring(r, 'cs', 0, 1.2); if (mine) { flash(rectOf('#hud .mystat .c'), 'cs', 0, 700); float(rectOf('#hud .mystat .c'), `◆ −${q.cs - p.cs}`, 'cs'); } }
    // your mana
    if (mine && p.mana !== q.mana) {
      const dm = p.mana - q.mana;
      float(rectOf('#hud .mystat .m'), `${dm > 0 ? '+' : '−'}${Math.abs(dm)}`, dm > 0 ? 'mana' : 'neg sm');
    }
  }

  // the end of the war
  if (now.over && !was.over) grail(g.winner?.id === o.meId);
}
