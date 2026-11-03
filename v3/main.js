// One-page UI for the v3.0 demo (Dominate Grail War). The rules live in game.js; this
// file only draws the state and turns clicks into the answers game.decide() waits for.
import { Game, AREAS, PATH, TYPES, MASTERS, TERRAIN, WORKSHOP_MANA, NP_MANA, CS_MANA, CS_POWER, CS_RES, KANSHOU, CASUAL, RECON_RES } from './game.js';
import { botDecide } from './bot.js';
import { SV_ART, MAP_ART } from './art.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const PHASE = { prep: 'เตรียมการ', outpost: 'ตั้งมั่น', action: 'ปฏิบัติการ', combat: 'ต่อสู้', end: 'จบรอบ' };

let g = null, wait = null, draft = null, skip = false, overShown = false, peek = false;
const setup = { master: null, mode: 'full' };

// ---------- game flow ----------
function startGame() {
  skip = false; overShown = false; peek = false; wait = null; draft = null;
  closeModal();
  const game = new Game({ decide, onEvent, mode: setup.mode, humanMaster: setup.master });
  g = game;
  game.run().catch((e) => { console.error(e); if (game === g) { game.log(`เกิดข้อผิดพลาด: ${e.message}`, 'death'); render(); } });
  render();
}

function decide(game, pl, kind, ctx) {
  if (!pl.isHuman) return botDecide(game, pl, kind, ctx);
  if (game !== g) return new Promise(() => {}); // a game that was replaced stops here
  if (kind === 'combatEnd' && skip) return null;
  return new Promise((res) => { wait = { kind, ctx, res }; draft = firstDraft(kind, ctx); peek = false; render(); });
}
function answer(v) { const w = wait; wait = null; draft = null; peek = false; w.res(v); render(); }

function firstDraft(kind, ctx) {
  const me = g.human;
  if (kind === 'place') return { to: null };
  if (kind === 'move') return { to: me.at, how: 'stay', cs4: false };
  if (kind === 'cards' && !ctx.field) return { ids: [...me.hand].sort((a, b) => a.power - b.power).slice(0, 2).map((c) => c.uid) };
  if (kind === 'cards') {
    // start from what a bot would play (cards only); the player can change everything
    const b = botDecide(g, me, 'cards', ctx) || {};
    return { ids: b.ids || [], down: b.down || [], cs4: false, cs2: 0, gems: 0, kb: false, bellTo: null };
  }
  return null;
}

let queued = false;
function onEvent() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => { queued = false; render(); });
}

// ---------- small pieces ----------
const seals = (n, max) => `<span class="cs">${'◆'.repeat(Math.max(0, n))}<i>${'◇'.repeat(Math.max(0, max - n))}</i></span>`;
const dot = (p, size = '') => `<span class="dot ${size}" style="background:${p.m.color}">${esc(p.name[0])}</span>`;
const findCard = (p, uid) => [...p.hand, ...p.np, ...p.deck].find((c) => c.uid === uid);

const FX = {
  reveal: () => 'เปิดชื่อจริง', climax: (n) => `ไคลแมกซ์ +${n}`, zeroOpp: () => 'การ์ดกำลังคู่ต่อสู้ = 0',
  cancel: (v) => (v === 'all' ? 'ยกเลิกผลการ์ดคู่ต่อสู้' : 'ยกเลิกผลคนที่ลงทีหลัง'), ubw: () => 'ทั้งสำรับขึ้นมือ ลงได้ 4 ใบ',
  once: () => 'ครั้งเดียวต่อเกม', terrainMul: (n) => `ได้เปรียบพื้นที่ ×${n}`, win: (n) => `ชนะ แต้ม +${n}`,
  ignoreTerrain: () => 'ไม่สนได้เปรียบพื้นที่คู่ต่อสู้', sure1v1: () => 'ชนะแน่ถ้า 1 ต่อ 1', perFoe: () => 'ชนะ แต้ม +จำนวนคู่ต่อสู้',
  cont: (n) => `แพ้ได้แต้ม ${n}`, ruleBreaker: (n) => `คู่ต่อสู้ CS ≤1 แพ้ · พลัง +${n}`, mana: (n) => `ได้มานา +${n}`,
  linger: (n) => `รอบหน้ามานา +${n}`, bell: () => 'ย้ายไปที่ไหนก็ได้', petrify: () => 'คู่ต่อสู้ไม่มีการ์ดพิเศษแพ้',
  riding: (n) => `ลงการ์ดพลัง ≤${n} เพิ่มได้`, godHand: (n) => `แพ้: ผู้ชนะ −${n} ตัวเอง +${n}`, tsubame: (n) => `ครบดาบ 1 และ 2: พลัง +${n}`,
  allTypes: () => 'นับเป็นทุกชนิด', freeMana: () => 'อีกใบไม่ต้องจ่ายมานา', guard: () => 'การ์ดพิเศษ',
  hidden: () => 'ใช้ได้ตอนชื่อจริงซ่อน', doubleRes: () => 'ชนะ: แต้มผลงาน ×2', rehide: () => 'ซ่อนชื่อจริงกลับ',
};
const fxText = (c) => Object.entries(c.fx || {}).filter(([k]) => FX[k]).map(([k, v]) => FX[k](v)).join(' · ');

// a card tile; o.btn makes it a button (data-pick), o.secret hides a face-down card's face
function tile(c, o = {}) {
  const down = o.down ?? c.down;
  const cls = `ct t${down && o.secret ? 'X' : c.type}${c.np ? ' np' : ''}${o.sel ? ' sel' : ''}${down ? ' down' : ''}${o.lock ? ' lock' : ''}${c.gone ? ' gone' : ''}`;
  let body;
  if (o.back) return `<div class="ct tX back" title="การ์ดที่ยังไม่เปิด"><span class="ty">ยังไม่เปิด</span><span class="pw">?</span></div>`;
  if (down && o.secret) body = '<span class="ty">คว่ำ</span><span class="pw">0</span>';
  else if (down) body = `<span class="ty">คว่ำไว้</span><span class="pw">0</span><span class="mn">${TYPES[c.type]} ${c.power} · ไม่จ่ายมานา</span>`;
  else {
    const pw = o.power ?? c.power;
    const fx = fxText(c);
    body = `<span class="ty">${TYPES[c.type]}</span><span class="pw">${pw}</span><span class="mn">มานา ${c.mana}</span>`
      + (c.name ? `<span class="nm">${esc(c.name)}</span>` : '') + (fx ? `<span class="fx">${esc(fx)}</span>` : '')
      + (c.gone ? '<span class="fx">ใช้หมดแล้ว</span>' : c.np && c.used && o.showUsed ? '<span class="fx">เคยใช้แล้ว</span>' : '');
  }
  const title = esc(c.text || fxText(c) || `${TYPES[c.type]} พลัง ${c.power} มานา ${c.mana}`);
  if (o.btn) return `<button class="${cls}" data-pick="${c.uid}" title="${title}" ${o.disabled ? 'disabled' : ''}>${body}</button>`;
  return `<div class="${cls}" title="${title}">${body}</div>`;
}

function prize(f) {
  if (g.mode === 'casual') return `${CASUAL.win[f]}`;
  if (f === 'shinto' && !g.shintoOpen) return `อีเวนต์ + ${AREAS[f].bonus}`;
  return `${g.fieldEv[f].reduce((s, e) => s + e.v, 0) + AREAS[f].bonus}`;
}
const evHtml = (f, e) => (f === 'shinto' && !g.shintoOpen
  ? '<span class="ev hid">อีเวนต์คว่ำ (เปิดตอนปฏิบัติการ)</span>'
  : `<span class="ev"><b>${esc(e.name)}</b> แต้ม ${e.v}${e.text ? ` · ${esc(e.text)}` : ''}</span>`);

function rules(k) {
  const A = AREAS[k];
  if (k === 'workshop') return `รับ ${A.cap} คน · คนแรกมานา +${WORKSHOP_MANA[0]} คนต่อไป +${WORKSHOP_MANA[1]} · ช่วงปฏิบัติการย้ายเข้าไม่ได้`;
  if (k === 'recon') return `รับ ${A.cap} คน · ไปได้ด้วยการย้ายเท่านั้น · แต้มผลงาน +${RECON_RES + g.fx('recon')}`;
  if (g.mode === 'casual') return `สนามรบ · ชนะได้แต้ม ${CASUAL.win[k]} · อยู่คนเดียวได้ ${CASUAL.alone}`;
  return k === 'miyama' ? `สนามรบ · อีเวนต์หงาย · ชนะได้แต้มอีเวนต์ +${A.bonus}` : `สนามรบ · อีเวนต์เปิดตอนปฏิบัติการ · ชนะได้แต้มอีเวนต์ +${A.bonus}`;
}

// ---------- drawing ----------
function render() {
  if (!g) return;
  drawTop();
  drawMe();
  drawMap();
  drawPanel();
  drawPlayers();
  drawLog();
  drawBattle();
  if (g.over && !overShown && !wait) { overShown = true; showOver(); }
}

function drawTop() {
  const when = g.climax ? 'ไคลแมกซ์' : `รอบ ${Math.max(1, g.round)}/${g.sits.length}`;
  const s = g.sit;
  $('#top').innerHTML = `<b>Fate Battle Royale v3</b><span class="when">${when} · ช่วง${PHASE[g.phase] || 'เริ่มเกม'}</span>
    ${s ? `<span class="sit">การ์ดสถานการณ์ <b>${esc(s.name)}</b> ${esc(s.text)}</span>` : ''}
    <span>เหลือ ${g.alive().length}/${g.players.length} คน · ${g.mode === 'casual' ? 'แบบสั้น' : 'เต็ม'}</span>
    <span class="btns"><button id="rules">กติกา</button><button id="restart">เกมใหม่</button></span>`;
  $('#rules').onclick = showRules;
  $('#restart').onclick = showStart;
}

function drawMe() {
  const me = g.human; const m = me.m; const s = me.sv;
  const usable = g.usableNp(me);
  $('#me').innerHTML = `<div class="box">
      <div class="mhead">${dot(me)}<div><b>${esc(m.name)} (คุณ)</b><span>Master · ความยาก ${m.level}${me.out ? ' · ตกรอบแล้ว' : ''}</span></div></div>
      <div class="stats"><div><b>${me.mana}</b><small>มานา</small></div><div><b>${seals(me.cs, m.cs)}</b><small>Command Spell</small></div><div><b>${me.res}</b><small>แต้มผลงาน</small></div></div>
      ${m.key === 'rin' ? `<div class="tip">อัญมณีเหลือ ${me.gems} · Jewel Magecraft ${me.jewel ? 'เริ่มแล้ว' : 'ยังไม่เริ่ม'}</div>` : ''}
      <ul class="abil">${m.abil.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>
    </div>
    <div class="box">
      <img class="svimg" src="${SV_ART[s.key]}" alt="${esc(s.name)}" />
      <div class="svname"><b>${esc(s.name)}</b><span>${s.cls} · ชื่อจริง${me.revealed ? 'เปิดแล้ว ทุกคนรู้' : 'ยังซ่อนอยู่'}</span></div>
      <h4>การ์ด NP / สกิล <span class="tip">ใช้ได้เมื่อมีมานา ${NP_MANA} ขึ้นไป</span></h4>
      <div class="hand">${me.np.map((c) => tile(c, { lock: !usable.includes(c), showUsed: true })).join('')}</div>
      <ul class="abil">${me.np.map((c) => `<li><b>${esc(c.name)}</b> ${esc(c.text)}</li>`).join('')}</ul>
      <h4>มือ ${me.hand.length} ใบ <span class="tip">สำรับ ${me.deck.length} · กองทิ้ง ${me.trash.length}</span></h4>
      <div class="hand">${me.hand.map((c) => tile(c)).join('') || '<span class="tip">ยังไม่มีการ์ดในมือ</span>'}</div>
    </div>`;
}

function moveOpts() {
  const me = g.human;
  return g.moveOptions(me, me.mana + (draft.cs4 ? CS_MANA : 0), me.cs - (draft.cs4 ? 1 : 0));
}

function drawMap() {
  const me = g.human;
  const night = g.climax || g.phase === 'action' || g.phase === 'combat';
  const choosing = wait && !peek ? wait.kind : null;
  const can = choosing === 'place' ? wait.ctx.opts : choosing === 'move' ? moveOpts().map((o) => o.to) : [];
  const html = [];
  PATH.forEach((k, i) => {
    if (i) html.push(`<div class="arrow" aria-hidden="true">→<small>มานา ${g.stepCost(me, i - 1)}</small></div>`);
    const A = AREAS[k];
    const here = g.here(k);
    const sel = (choosing === 'place' || choosing === 'move') && draft?.to === k;
    const eng = g.phase === 'action' && g.engaged.has(k);
    let extra = '';
    if (A.field) {
      if (g.mode === 'full') extra += g.fieldEv[k].map((e) => evHtml(k, e)).join('');
      if (g.phase && g.phase !== 'end') extra += `<em>รางวัลผู้ชนะ ${prize(k)}</em>`;
    } else if (k === 'workshop') extra = `<em>มีคน ${here.length}/${A.cap}</em>`;
    if (eng) extra += '<em>ติดพัน: เดินออกไม่ได้</em>';
    const pieces = here.map((p) => `<span class="pc ${p.isHuman ? 'me' : ''}">${dot(p)}${esc(p.name)}${p.isHuman ? ' (คุณ)' : ''}<span class="tg">${p.terrain ? `<span class="badge" title="ได้เปรียบพื้นที่">+${p.terrain}</span>` : ''}${p.play ? `<span class="badge pw" title="พลังที่ประกาศ">⚔ ${p.play.pre}</span>` : ''}</span></span>`).join('');
    html.push(`<button class="area ${A.field ? 'field' : ''} ${eng ? 'eng' : ''} ${sel ? 'sel' : ''}" data-area="${k}" ${can.includes(k) ? '' : 'disabled'}>
      <b>${A.name}</b><span class="jp">${A.jp}</span><span class="rule">${rules(k)}</span>${extra}<div class="pieces">${pieces}</div></button>`);
  });
  $('#map').style.backgroundImage = `url(${night ? MAP_ART.night : MAP_ART.day})`;
  $('#map').innerHTML = html.join('');
  for (const b of document.querySelectorAll('#map .area')) b.onclick = () => pickArea(b.dataset.area);
}

function pickArea(k) {
  if (wait?.kind === 'place') draft.to = k;
  if (wait?.kind === 'move') {
    const rank = { stay: 0, walk: 1, kirei: 2, cs: 3 };
    const o = moveOpts().filter((x) => x.to === k).sort((a, b) => rank[a.how] - rank[b.how])[0];
    if (o) { draft.to = o.to; draft.how = o.how; }
  }
  render();
}

function placeInfo(k) {
  const me = g.human;
  const here = g.here(k);
  const names = here.length ? ` · ตอนนี้มี ${here.map((p) => esc(p.name)).join(', ')}` : '';
  if (k === 'workshop') {
    const n = (here.length === 0 ? WORKSHOP_MANA[0] : WORKSHOP_MANA[1]) + g.fx('workshop');
    return `${me.m.key === 'kuzuki' ? 'แต้มผลงาน' : 'มานา'} +${n}${names}`;
  }
  const t = here.length < TERRAIN.length ? TERRAIN[here.length] : 0;
  return `${t ? `ได้เปรียบพื้นที่ +${t}` : 'ไม่ได้เปรียบพื้นที่ (มี 2 คนวางก่อนแล้ว)'} · รางวัลผู้ชนะ ${prize(k)}${k === 'miyama' && me.m.key === 'shinji' ? ' · ชินจิ: มานา +1 แต้ม +1' : ''}${names}`;
}

function moveLabel(o) {
  const me = g.human;
  const to = AREAS[o.to].name;
  if (o.how === 'stay') return [`อยู่ที่${to}`, 'ไม่เสียมานา'];
  if (o.how === 'walk') return [`เดินไป${to}`, o.cost ? `มานา ${o.cost}` : 'ไม่เสียมานา'];
  if (o.how === 'kirei') return [`Supervisor ไป${to}`, 'มานา 2 · ได้เฉพาะตอนชื่อจริงยังซ่อน'];
  return [`Command Spell ย้ายไป${to}`, `ใช้ 1 ดวง (เหลือ ${me.cs - (draft.cs4 ? 1 : 0) - 1}) · ไม่สนการติดพัน`];
}

function drawPanel() {
  const P = $('#panel');
  const me = g.human;
  if (g.over) {
    P.innerHTML = `<h3>จบเกมแล้ว</h3><p>${esc(g.how)}</p><button class="go" id="again">เล่นใหม่</button> <button id="rank">ดูอันดับ</button>`;
    $('#again').onclick = showStart;
    $('#rank').onclick = showOver;
    return;
  }
  if (!wait) { P.innerHTML = me.out ? '<p>คุณตกรอบแล้ว กำลังดูบอทเล่นต่อ…</p>' : '<p class="tip">รอผู้เล่นคนอื่น…</p>'; return; }
  if (peek) {
    P.innerHTML = `<p>${wait.kind === 'combatEnd' ? 'กำลังดูกระดานระหว่างดูผลต่อสู้' : 'กำลังดูกระดานระหว่างลงการ์ด'}</p><button class="go" id="back">กลับไป${wait.kind === 'combatEnd' ? 'ดูผลต่อสู้' : 'ลงการ์ด'}</button>`;
    $('#back').onclick = () => { peek = false; render(); };
    return;
  }
  if (wait.kind === 'place') {
    const rows = wait.ctx.opts.map((k) => `<button class="opt ${draft.to === k ? 'on' : ''}" data-to="${k}"><span><b>${AREAS[k].name}</b><br><small>${placeInfo(k)}</small></span></button>`).join('');
    P.innerHTML = `<h3>ช่วงตั้งมั่น: วางหมาก Master</h3>
      <p class="tip">วางทีละคนตามลำดับที่นั่ง คนแรกในสนามรบได้เปรียบพื้นที่ +${TERRAIN[0]} คนที่สอง +${TERRAIN[1]} เลือกจากรายการหรือแตะที่แผนที่</p>
      <div class="opts">${rows}</div><button class="go" id="ok" ${draft.to ? '' : 'disabled'}>วางที่นี่</button>`;
    for (const b of P.querySelectorAll('[data-to]')) b.onclick = () => pickArea(b.dataset.to);
    $('#ok').onclick = () => answer({ to: draft.to });
    return;
  }
  if (wait.kind === 'move') {
    const opts = moveOpts();
    if (!opts.some((o) => o.to === draft.to && o.how === draft.how)) { draft.to = me.at; draft.how = 'stay'; }
    const rows = opts.map((o, i) => { const [a, b] = moveLabel(o); return `<button class="opt ${o.to === draft.to && o.how === draft.how ? 'on' : ''}" data-i="${i}"><span><b>${a}</b><br><small>${b}</small></span></button>`; }).join('');
    const eng = g.engaged.has(me.at);
    P.innerHTML = `<h3>ช่วงปฏิบัติการ: ตาของคุณ</h3>
      <p class="tip">ย้ายไปข้างหน้าตามเส้นทาง (เสียมานาตามลูกศร) หรืออยู่ที่เดิม แล้วลงการ์ด${eng ? ` · ${AREAS[me.at].name}ติดพัน (มี 2 คนขึ้นไป) เดินออกไม่ได้ ใช้ Command Spell ย้ายได้` : ''}</p>
      <div class="opts">${rows}</div>
      <div class="opts"><button class="opt ${draft.cs4 ? 'on' : ''}" id="cs4" ${me.cs > 0 ? '' : 'disabled'}><span><b>Command Spell: มานา +${CS_MANA}</b><br><small>ใช้ 1 ดวงตอนนี้ (มานา ${me.mana} → ${me.mana + CS_MANA})</small></span></button></div>
      <button class="go" id="ok">ยืนยัน แล้วไปลงการ์ด</button>`;
    for (const b of P.querySelectorAll('[data-i]')) b.onclick = () => { const o = opts[+b.dataset.i]; draft.to = o.to; draft.how = o.how; render(); };
    $('#cs4').onclick = () => { draft.cs4 = !draft.cs4; render(); };
    $('#ok').onclick = () => answer({ to: draft.to, how: draft.how, cs4: draft.cs4 });
    return;
  }
  if (wait.kind === 'cards' && !wait.ctx.field) {
    const n = Math.min(2, me.hand.length);
    P.innerHTML = `<h3>${AREAS[me.at].name}: ทิ้งการ์ดคว่ำ ${n} ใบ</h3>
      <p class="tip">อยู่นอกสนามรบ ต้องทิ้งการ์ดคว่ำ 2 ใบ (ไม่มีผล) เลือกใบที่ไม่อยากเก็บไว้</p>
      <div class="hand">${me.hand.map((c) => tile(c, { btn: true, sel: draft.ids.includes(c.uid) })).join('')}</div>
      <button class="go" id="ok" ${draft.ids.length === n ? '' : 'disabled'}>ทิ้ง ${n} ใบนี้</button>`;
    for (const b of P.querySelectorAll('[data-pick]')) b.onclick = () => {
      const id = +b.dataset.pick;
      if (draft.ids.includes(id)) draft.ids = draft.ids.filter((x) => x !== id);
      else { draft.ids.push(id); if (draft.ids.length > n) draft.ids.shift(); }
      render();
    };
    $('#ok').onclick = () => answer({ ids: [...draft.ids] });
    return;
  }
  P.innerHTML = '<p class="tip">กำลังเลือก…</p>';
}

function drawPlayers() {
  const n = g.players.length;
  const seat = [...Array(n)].map((_, i) => g.players[(g.start + i) % n]);
  $('#players').innerHTML = '<h4>ลำดับที่นั่ง (★ คนเริ่มรอบ)</h4>' + seat.map((p, i) => {
    const show = p.isHuman || p.revealed;
    const used = p.np.filter((c) => c.used).map((c) => c.name).join(', ');
    return `<div class="pl ${p.out ? 'out' : ''} ${p.isHuman ? 'me' : ''} ${g.turn === p ? 'turn' : ''}">
      ${show ? `<img src="${SV_ART[p.sv.key]}" alt="" />` : `<span class="q" style="background:${p.m.color}">?</span>`}
      <div class="who"><b>${i === 0 && !p.out ? '★ ' : ''}${esc(p.name)}${p.isHuman ? ' (คุณ)' : ''}</b><br>
        <span>${show ? `${esc(p.sv.name)} · ${p.sv.cls}` : 'Servant ยังไม่เปิด'}${p.out ? ' · ตกรอบ' : p.at ? ` · ${AREAS[p.at].name}` : ''}</span>
        ${used ? `<div class="used">ใช้แล้ว: ${esc(used)}</div>` : ''}</div>
      <div class="num"><b>${p.res}</b><small>แต้ม · มานา ${p.mana} · CS ${p.cs}</small></div></div>`;
  }).join('');
}

function drawLog() {
  const L = $('#log');
  L.innerHTML = '<h4>บันทึก</h4>' + g.logs.slice(-150).map((l) => `<div class="l-${l.cls}">${esc(l.text)}</div>`).join('');
  L.scrollTop = L.scrollHeight;
}

// ---------- battle screen: the card step in a battlefield, then the results ----------
function svCard(p, e = null, r = null) {
  const me = g.human;
  const show = p.isHuman || p.revealed;
  let foot;
  if (e) {
    const won = r.alone || e.won;
    const parts = (e.parts || []).filter(([, n]) => n).map(([t, n]) => `${t} ${n}`).join(' + ');
    foot = `<div class="cards">${(e.cards || []).map((c) => tile(c, { secret: !p.isHuman })).join('')}</div>`
      + (r.alone ? '' : `<div class="atk"><b>${e.power}</b> พลัง</div><div class="parts">${esc(parts)}</div>`)
      + `<div class="fate ${won ? 'good' : 'bad'}">${r.alone ? `อยู่คนเดียว +${e.gain} แต้ม` : won ? `${r.winners.length > 1 ? 'เสมอ ' : ''}ชนะ +${e.gain} แต้ม` : `แพ้${e.gain ? ` +${e.gain} แต้ม` : ''}`}</div>`
      + (e.notes?.length ? `<div class="parts">${esc(e.notes.join(' · '))}</div>` : '');
  } else {
    const state = p === me ? 'กำลังเลือกการ์ด' : p.play ? `ลงแล้ว พลังที่ประกาศ ${p.play.pre}` : 'ยังไม่ถึงตา';
    const cards = p.play ? `<div class="cards">${p.play.cards.map((c) => tile(c, { back: !c.np })).join('')}</div>` : '';
    foot = `<div class="parts">มานา ${p.mana} · CS ${p.cs} · แต้ม ${p.res}${p.terrain ? ` · ได้เปรียบพื้นที่ +${p.terrain}` : ''}</div>${cards}<div class="fate">${state}</div>`;
  }
  const won = e && (r.alone || e.won);
  return `<div class="sv ${p.isHuman ? 'mine' : ''} ${won ? 'winner' : ''}">
    <div class="pic">${show ? `<img src="${SV_ART[p.sv.key]}" alt="" />` : '?'}</div>
    <div class="nm"><b>${p.isHuman ? `คุณ (${esc(p.name)})` : esc(p.name)}</b><span>${show ? `${esc(p.sv.name)} · ${p.sv.cls}` : 'Servant ยังไม่เปิดชื่อจริง'}</span></div>${foot}</div>`;
}

function drawBattle() {
  const B = $('#battle');
  const kind = wait?.kind;
  if (peek || !(kind === 'combatEnd' || (kind === 'cards' && wait.ctx.field))) { B.hidden = true; B.innerHTML = ''; return; }
  const top = B.scrollTop;
  B.innerHTML = `<div class="bt" style="--btbg:url(${MAP_ART.night})">${kind === 'cards' ? prepHtml() : resultsHtml()}</div>`;
  B.hidden = false;
  B.scrollTop = top;
  if (kind === 'cards') bindPrep(); else bindResults();
}

function prepView() {
  const me = g.human;
  const a = g.cleanCards(me, draft, true);
  const cards = a.ids.map((id) => ({ ...findCard(me, id), down: a.down.includes(id) }));
  if (a.kb) cards.push({ ...KANSHOU, down: false });
  const pw = g.powerOf(me, { cards, cs2: a.cs2, gems: a.gems }, { events: g.fieldEv[me.at] });
  return { a, cards, pw };
}

function prepHtml() {
  const me = g.human;
  const f = me.at;
  const people = g.order().filter((p) => p.at === f);
  const { a, pw } = prepView();
  const manaNow = me.mana + (a.cs4 ? CS_MANA : 0);
  const usable = g.usableNp(me, manaNow);
  const ubw = a.ubw;
  const limit = ubw ? 4 : g.maxCards(me);
  const csLeft = me.cs - (a.cs4 ? 1 : 0) - (a.jewel ? 1 : 0);
  const pick = (c, o = {}) => tile(c, { btn: true, sel: draft.ids.includes(c.uid), ...o });
  const notes = [];
  const nameOf = (id) => { const c = findCard(me, id); return c.name || `${TYPES[c.type]} ${c.power}`; };
  const autoDown = a.ids.filter((id) => draft.ids.includes(id) && a.down.includes(id) && !draft.down.includes(id));
  const filler = a.ids.filter((id) => !draft.ids.includes(id));
  const dropped = draft.ids.filter((id) => !a.ids.includes(id));
  if (autoDown.length) notes.push(`มานาไม่พอ คว่ำให้อัตโนมัติ: ${autoDown.map(nameOf).join(', ')}`);
  if (filler.length) notes.push(`ต้องลงให้ครบ 2 ใบ เติมการ์ดคว่ำให้: ${filler.map(nameOf).join(', ')}`);
  if (dropped.length) notes.push(`ลงไม่ได้ (เกินจำนวนหรือมานาไม่ถึง ${NP_MANA}): ${dropped.map(nameOf).join(', ')}`);
  if (a.jewel) notes.push('ใช้ Command Spell 1 ดวงเริ่ม Jewel Magecraft');
  const bell = a.ids.some((id) => findCard(me, id)?.fx?.bell);
  if (bell) notes.push('Bellerophon: ย้ายแล้วพลังที่แสดงยังไม่รวมโทเคนที่ยึดมา');
  const alone = people.length === 1;
  const slots = a.ids.map((id) => {
    const c = findCard(me, id);
    const d = a.down.includes(id);
    return `<div class="slot">${tile(c, { down: d, power: d ? 0 : g.cardPower(me, c, { events: g.fieldEv[f] }) })}${c.np ? '' : `<button data-flip="${id}">${d ? 'หงาย' : 'คว่ำ'}</button>`}</div>`;
  }).join('') + (a.kb ? `<div class="slot">${tile({ ...KANSHOU })}</div>` : '');
  const cs4 = wait.ctx.cs4used
    ? `<span class="tip">ใช้ Command Spell มานา +${CS_MANA} ไปแล้วตอนย้าย</span>`
    : `<button id="pcs4" class="${draft.cs4 ? 'on' : ''}" ${me.cs > 0 ? '' : 'disabled'}>Command Spell: มานา +${CS_MANA}</button>`;
  const ctl = [cs4,
    `<span>Command Spell พลัง +${CS_POWER} (ชนะแต้ม +${CS_RES}) <button data-cs2="-1" ${a.cs2 > 0 ? '' : 'disabled'}>−</button> <b>${a.cs2}</b> <button data-cs2="1" ${a.cs2 < csLeft ? '' : 'disabled'}>+</button></span>`];
  if (me.m.key === 'rin') ctl.push(`<span>อัญมณี พลัง +1 ต่ออัน (เหลือ ${me.gems}${me.jewel ? '' : ' · ครั้งแรกจ่าย CS 1 ดวง'}) <button data-gem="-1" ${a.gems > 0 ? '' : 'disabled'}>−</button> <b>${a.gems}</b> <button data-gem="1" ${a.gems < Math.min(3, me.gems) && (me.jewel || a.jewel || csLeft > a.cs2) ? '' : 'disabled'}>+</button></span>`);
  if (me.m.key === 'shirou') ctl.push(`<button id="pkb" class="${a.kb ? 'on' : ''}" ${g.infinite(me) || manaNow >= NP_MANA ? '' : 'disabled'}>Projection: Kanshou &amp; Bakuya (มานา ${KANSHOU.mana} พลัง ${KANSHOU.power})</button>`);
  if (bell) ctl.push(`<span>Bellerophon ย้ายไป ${['', ...PATH.slice(1)].map((k) => `<button data-bell="${k}" class="${(a.bellTo || '') === k ? 'on' : ''}" ${!k || k !== 'recon' || g.reconFree(me) ? '' : 'disabled'}>${k ? AREAS[k].name : 'อยู่ที่เดิม'}</button>`).join(' ')}</span>`);
  const parts = pw.parts.filter(([, n]) => n).map(([t, n]) => `${t} ${n}`).join(' + ');
  return `<header><h2>⚔ ลงการ์ดที่${AREAS[f].name}</h2>
      <span>${alone ? 'ตอนนี้อยู่คนเดียว ถ้าไม่มีใครย้ายมาจะได้แต้มโดยไม่ต้องสู้' : `${people.length} คน · พลังรวมสูงสุดชนะ`} · รางวัลผู้ชนะ ${prize(f)}${g.sit?.text && g.sit.text !== 'ไม่มีผล' ? ` · ${esc(g.sit.name)}: ${esc(g.sit.text)}` : ''}</span>
      <div>${g.fieldEv[f].map((e) => evHtml(f, e)).join('')}</div></header>
    <div class="field">${people.map((p) => svCard(p)).join('')}</div>
    <div class="prep">
      <h4>มือ: เลือก ${limit} ใบ <span class="tip">แตะเพื่อเลือก คว่ำการ์ด = พลัง 0 ไม่จ่ายมานา · มานาตอนนี้ ${manaNow}</span></h4>
      <div class="hand">${me.hand.map((c) => pick(c)).join('')}</div>
      <h4>NP / สกิล <span class="tip">ต้องมีมานา ${NP_MANA} ขึ้นไป แล้วจ่ายค่าการ์ด${usable.length ? '' : ' · ตอนนี้ยังใช้ไม่ได้'}</span></h4>
      <div class="hand">${me.np.map((c) => pick(c, { lock: !usable.includes(c), disabled: !usable.includes(c), showUsed: true })).join('')}</div>
      ${ubw ? `<h4>สำรับ (Unlimited Blade Works ลงได้ถึง 4 ใบ)</h4><div class="hand">${me.deck.map((c) => pick(c)).join('')}</div>` : ''}
      <h4>การ์ดที่จะลง</h4>
      <div class="hand">${slots || '<span class="tip">ยังไม่ได้เลือก</span>'}</div>
      ${notes.map((t) => `<p class="notes">${esc(t)}</p>`).join('')}
      <h4>Command Spell เหลือ ${me.cs} ดวง</h4>
      <div class="ctl">${ctl.join('')}</div>
      <div class="goline"><span>พลังของคุณ <b>${pw.total}</b> <small>${esc(parts)}</small> · จ่ายมานา ${a.cost} เหลือ ${manaNow - a.cost}</span>
        <span><button id="pclear">ล้าง</button> <button id="peek">ดูกระดาน</button> <button class="go big" id="playgo">ลงการ์ด</button></span></div>
      <p class="tip">พลังที่แสดงยังไม่รวมผลการ์ดของคู่ต่อสู้ (เช่น ยกเลิกผล ไม่สนได้เปรียบพื้นที่) และอีเวนต์ที่ช่วยคนแต้มน้อยสุด</p>
    </div>`;
}

function bindPrep() {
  const me = g.human;
  const B = $('#battle');
  for (const b of B.querySelectorAll('[data-pick]')) b.onclick = () => {
    const id = +b.dataset.pick;
    const i = draft.ids.indexOf(id);
    if (i >= 0) { draft.ids.splice(i, 1); draft.down = draft.down.filter((x) => x !== id); render(); return; }
    const c = findCard(me, id);
    const picked = draft.ids.map((x) => findCard(me, x));
    const ubw = c.fx?.ubw || picked.some((x) => x?.fx?.ubw);
    const limit = ubw ? 4 : g.maxCards(me);
    const riding = picked.find((x) => x?.fx?.riding);
    if (draft.ids.length >= limit && !(riding && !c.np && c.power <= riding.fx.riding)) {
      const out = draft.ids.shift();
      draft.down = draft.down.filter((x) => x !== out);
    }
    draft.ids.push(id);
    // leaving UBW: deck cards go back
    if (!draft.ids.some((x) => findCard(me, x)?.fx?.ubw)) draft.ids = draft.ids.filter((x) => !me.deck.some((d) => d.uid === x));
    render();
  };
  for (const b of B.querySelectorAll('[data-flip]')) b.onclick = () => {
    const id = +b.dataset.flip;
    const { a } = prepView();
    if (!draft.ids.includes(id)) draft.ids.push(id);
    if (a.down.includes(id)) draft.down = draft.down.filter((x) => x !== id); else draft.down.push(id);
    render();
  };
  for (const b of B.querySelectorAll('[data-cs2]')) b.onclick = () => { draft.cs2 = Math.max(0, prepView().a.cs2 + +b.dataset.cs2); render(); };
  for (const b of B.querySelectorAll('[data-gem]')) b.onclick = () => { draft.gems = Math.max(0, prepView().a.gems + +b.dataset.gem); render(); };
  for (const b of B.querySelectorAll('[data-bell]')) b.onclick = () => { draft.bellTo = b.dataset.bell || null; render(); };
  if ($('#pcs4')) $('#pcs4').onclick = () => { draft.cs4 = !draft.cs4; render(); };
  if ($('#pkb')) $('#pkb').onclick = () => { draft.kb = !draft.kb; render(); };
  $('#pclear').onclick = () => { Object.assign(draft, { ids: [], down: [], cs2: 0, gems: 0, kb: false, bellTo: null }); render(); };
  $('#peek').onclick = () => { peek = true; render(); };
  $('#playgo').onclick = () => answer({ ...draft, ids: [...draft.ids], down: [...draft.down] });
}

function resultsHtml() {
  const me = g.human;
  const rs = [...wait.ctx.results].sort((a, b) => b.ents.some((e) => e.id === me.id) - a.ents.some((e) => e.id === me.id));
  const mine = rs.find((r) => r.ents.some((e) => e.id === me.id));
  let verdict = 'คุณไม่ได้อยู่ในสนามรบรอบนี้';
  if (me.out) verdict = 'คุณตกรอบแล้ว';
  else if (mine) {
    const e = mine.ents.find((x) => x.id === me.id);
    const where = AREAS[mine.f].name;
    verdict = mine.alone ? `คุณอยู่${where}คนเดียว ได้แต้ม ${e.gain}` : e.won ? `🏆 คุณชนะที่${where} ได้แต้ม ${e.gain}` : `คุณแพ้ที่${where}${e.gain ? ` ได้แต้ม ${e.gain}` : ''}`;
  }
  const blocks = rs.map((r) => `<section class="rfield"><h3>${AREAS[r.f].name}${r.alone ? ' · อยู่คนเดียว' : ` · รางวัล ${r.pool}`}</h3>
      <div>${(g.fieldEv[r.f] || []).map((e) => evHtml(r.f, e)).join('')}</div>
      <div class="field">${r.ents.map((e) => svCard(g.players[e.id], e, r)).join('')}</div></section>`).join('');
  return `<header><h2>ผลการต่อสู้ ${g.climax ? 'รอบไคลแมกซ์' : `รอบ ${g.round}`}</h2><span>${verdict} · แต้มผลงานของคุณตอนนี้ ${me.res}</span></header>
    ${blocks || '<p class="verdict">ไม่มีใครอยู่ในสนามรบ</p>'}
    <div class="prep"><h3 class="verdict">${verdict}</h3>
      <div class="goline"><span></span><span>${me.out ? '<button id="skipall">ข้ามไปดูตอนจบ</button> ' : ''}<button id="peek">ดูกระดาน</button> <button class="go big" id="next">ถัดไป</button></span></div></div>`;
}

function bindResults() {
  $('#next').onclick = () => answer(null);
  $('#peek').onclick = () => { peek = true; render(); };
  if ($('#skipall')) $('#skipall').onclick = () => { skip = true; answer(null); };
}

// ---------- modals ----------
function openModal(html) { $('#modal .sheet').innerHTML = html; $('#modal').hidden = false; }
function closeModal() { $('#modal').hidden = true; }

function showStart() {
  const tiles = MASTERS.map((m) => `<button class="mpick ${setup.master === m.key ? 'on' : ''}" data-m="${m.key}">
      <span class="mhead"><span class="dot" style="background:${m.color}">${esc(m.short[0])}</span><span><b>${esc(m.name)}</b><span>ความยาก ${m.level} · มานาเริ่ม ${m.mana}${m.manaPh ? '*' : ''} · CS ${m.cs}</span></span></span>
      <small>${m.abil.map(esc).join('<br>')}</small></button>`).join('')
    + `<button class="mpick ${setup.master ? '' : 'on'}" data-m=""><b>สุ่ม</b><small>สุ่ม Master ให้</small></button>`;
  openModal(`<h3>Fate Battle Royale v3 · Dominate Grail War</h3>
    <p class="tip">เดโมตามกระดาษออกแบบ v3.0: คุณ 1 คน กับบอท 6 ตัว ทุกคนได้ Servant แบบสุ่มและเป็นความลับ ตัวเลขการ์ด อีเวนต์ และการ์ดสถานการณ์เป็นค่าแทน ไม่ใช่ของจริง</p>
    <h4>เลือก Master</h4><div class="masters">${tiles}</div>
    <h4>โหมด</h4><div class="modes">
      <button data-mode="full" class="${setup.mode === 'full' ? 'on' : ''}">เต็ม: 8 รอบ แล้วไคลแมกซ์</button>
      <button data-mode="casual" class="${setup.mode === 'casual' ? 'on' : ''}">แบบสั้น: 4 รอบ ไม่มีอีเวนต์</button></div>
    <p class="tip">* มานาเริ่มต้นเป็นค่าแทน (แหล่งข้อมูลบอกแค่ 2–4)</p>
    <button class="go" id="startgo">เริ่มเกม</button> ${g && !g.over ? '<button id="cancelstart">กลับไปเกมเดิม</button>' : ''}`);
  for (const b of document.querySelectorAll('[data-m]')) b.onclick = () => { setup.master = b.dataset.m || null; showStart(); };
  for (const b of document.querySelectorAll('[data-mode]')) b.onclick = () => { setup.mode = b.dataset.mode; showStart(); };
  $('#startgo').onclick = startGame;
  if ($('#cancelstart')) $('#cancelstart').onclick = closeModal;
}

function showOver() {
  const w = g.winner;
  const rank = [...g.players].sort((a, b) => (w ? (b === w) - (a === w) : 0) || a.out - b.out || b.res - a.res);
  const title = w ? (w.isHuman ? '🏆 คุณชนะสงครามจอกศักดิ์สิทธิ์!' : `🏆 ${esc(w.name)} ชนะสงครามจอกศักดิ์สิทธิ์`) : `🏆 ${esc(g.how)}`;
  openModal(`<h3>${title}</h3><p>${w ? `${esc(w.m.name)} กับ ${esc(w.sv.name)} (${w.sv.cls}) · ${esc(g.how)}` : ''}</p>
    <div class="rank">${rank.map((p, i) => `<div><b>${i + 1}. ${esc(p.m.name)}${p.isHuman ? ' (คุณ)' : ''}</b> · ${esc(p.sv.name)} (${p.sv.cls}) · แต้มผลงาน ${p.res}${p.out ? ' · ตกรอบ' : ''}</div>`).join('')}</div>
    <button class="go" id="again2">เล่นใหม่</button> <button id="closeover">ดูกระดาน</button>`);
  $('#again2').onclick = showStart;
  $('#closeover').onclick = closeModal;
}

function showRules() {
  openModal(`<h3>กติกาโดยย่อ (กระดาษ v3.0)</h3><ul>
    <li>Master 7 คน (คุณ 1 กับบอท 6) แต่ละคนมี Servant ลับ 1 ตัว ชื่อจริงเปิดเมื่อใช้การ์ดบางใบ</li>
    <li>เล่น 8 รอบ (แบบสั้น 4 รอบ) แต่ละรอบมี 4 ช่วง: <b>เตรียมการ</b> จั่วให้มือมี 3 ใบ เปิดการ์ดสถานการณ์และอีเวนต์ → <b>ตั้งมั่น</b> วางหมากทีละคนตามลำดับที่นั่ง → <b>ปฏิบัติการ</b> ทีละคน ย้ายแล้วลงการ์ด → <b>ต่อสู้</b></li>
    <li>เส้นทางทางเดียว: โรงฝึกเวท → ย่านมิยามะ → ย่านชินโตะ → ลาดตระเวน ค่าย้าย 1 / 2 / 2 มานา</li>
    <li>โรงฝึกเวท: คนแรกมานา +2 คนต่อไป +1 (รับ 4 คน) · ลาดตระเวน: ไปได้ด้วยการย้ายเท่านั้น ได้แต้มผลงาน 2 (รับ 1 คน)</li>
    <li>สนามรบ: คนแรกที่วางได้เปรียบพื้นที่ +3 คนที่สอง +1 · ถ้ามี 2 คนขึ้นไปตอนเริ่มปฏิบัติการ สนามรบนั้นติดพัน เดินออกไม่ได้</li>
    <li>ลงการ์ด 2 ใบ จากมือ หรือการ์ด NP/สกิล (ต้องมีมานา 8 ขึ้นไป แล้วจ่ายค่าการ์ด) · คว่ำการ์ด = พลัง 0 ไม่จ่ายมานา · อยู่นอกสนามรบต้องทิ้งการ์ดคว่ำ 2 ใบ</li>
    <li>พลังรวมสูงสุดชนะ ได้แต้มผลงาน = แต้มอีเวนต์ + 2 (มิยามะ) หรือ + 3 (ชินโตะ) เสมอแบ่งกันปัดขึ้น คนแพ้ไม่ได้อะไร · อยู่คนเดียวได้แต้มอีเวนต์</li>
    <li>Command Spell 1 ดวง ทำได้ 1 อย่าง: มานา +4 / พลัง +2 และถ้าชนะแต้ม +2 / ย้ายไปที่ไหนก็ได้ยกเว้นโรงฝึกเวท ไม่สนการติดพัน</li>
    <li>จบรอบ 8: เหลือ 5 คนขึ้นไปคัดเหลือ 4 คน ถ้าน้อยกว่านั้นคัดออก 1 คน (แต้มผลงานน้อยสุด เสมอออกพร้อมกัน) แล้วเข้าไคลแมกซ์ คัดออกทุกรอบจนเหลือคนสุดท้าย</li>
    <li>แบบสั้น: 4 รอบ ไม่มีอีเวนต์ เริ่มมานา +2 ชนะได้ 4 (มิยามะ) / 5 (ชินโตะ) อยู่คนเดียวได้ 2</li></ul>
    <p class="tip">ค่าที่ใช้ตามคำแนะนำในกระดาษข้อ 13: 7 คน · ลำดับตามที่นั่ง · ยึดรายงานญี่ปุ่นก่อนวิกิ · NP ต้องมีมานา 8 · มีโหมดแบบสั้น ตัวเลขการ์ดโจมตี NP อีเวนต์ 20 ใบ และการ์ดสถานการณ์ทั้งหมดเป็น<b>ค่าแทน ไม่ใช่ของจริง</b> ความสามารถ Master ที่ยังไม่มีข้อมูล และการชนะพิเศษของชินจิยังไม่ได้ทำ</p>
    <button class="go" id="closer">ปิด</button>`);
  $('#closer').onclick = closeModal;
}

showStart();
