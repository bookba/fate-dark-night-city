// One-page UI for the v4.1 demo (Fate/Domination, one stage). The rules live in game.js;
// this file only draws the state and turns clicks into the answers game.decide() waits for.
import {
  Game, AREAS, PATH, TYPES, MASTERS, TERRAIN, WORKSHOP, RECON_VP, SKILL_MANA, ROUNDS, REGULAR, CUT,
  CS_MANA, CS_POWER, CS_VP, FIELDS, STEP_COST, GEM_GAND, GEM_SWAP,
} from './game.js';
import { botDecide } from './bot.js';
import { SV_ART, MAP_ART } from './art.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const PHASES = [['prep', 'เตรียมการ'], ['outpost', 'ตั้งมั่น'], ['action', 'ปฏิบัติการ'], ['combat', 'ต่อสู้'], ['end', 'จบรอบ']];
const BOT_DELAY = 260; // a short pause on each bot choice so the board can be followed
const SUN = '☀︎';

let g = null, wait = null, draft = null, skip = false, overShown = false, outShown = false, info = null, started = false;
const swapSel = new Set(); // hand cards Rin marked for a jewel swap
const setup = { master: 'shirou' };

document.documentElement.style.setProperty('--map', `url("${MAP_ART.night}")`);

// ---------- game flow ----------
function startGame() {
  skip = false; overShown = false; outShown = false; wait = null; draft = null; info = null; started = true; logCount = 0;
  closeSheet();
  const game = new Game({ decide, onEvent, humanMaster: setup.master });
  g = game;
  $('#log').innerHTML = '';
  render();
  showSummon(() => {
    game.run().catch((e) => { console.error(e); if (game === g) { game.log(`เกิดข้อผิดพลาด: ${e.message}`, 'death'); render(); } });
  });
}

function decide(game, pl, kind, ctx) {
  if (game !== g) return new Promise(() => {}); // a game that was replaced stops here
  if (!pl.isHuman) {
    const a = botDecide(game, pl, kind, ctx);
    if (skip || kind === 'combatEnd' || (kind === 'ability' && !a)) return a;
    return new Promise((res) => setTimeout(() => res(a), BOT_DELAY));
  }
  if (kind === 'combatEnd' && skip) return null;
  // ability windows (paper section 7): the screen asks only in the combat window. The windows before
  // placing, moving and playing cards are offered inside those panels; the prep and after-placing
  // windows hold nothing that cannot be done later, so they pass.
  if (kind === 'ability' && (skip || ctx.stage !== 'combat' || !ctx.opts.some((o) => o.kind === 'csPower' || o.kind === 'csMove'))) return { kind: 'pass' };
  return new Promise((res) => {
    wait = { kind, ctx, res };
    draft = firstDraft(kind, ctx);
    info = null;
    render();
    if (kind === 'combatEnd') showResults(ctx.results);
    else if (window.matchMedia('(max-width: 1020px)').matches) $('#panel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
}
function answer(v) { const w = wait; wait = null; draft = null; info = null; swapSel.clear(); closeSheet(); w.res(v); render(); }

function firstDraft(kind, ctx) {
  const me = g.human;
  if (kind === 'move') return { cs4: false };
  if (kind === 'cards' && !ctx.field) return { ids: [...me.hand].sort((a, b) => a.power - b.power).slice(0, 2).map((c) => c.uid) };
  if (kind === 'cards') {
    // start from what a bot would play; the player can change everything
    const b = botDecide(g, me, 'cards', { ...ctx, cs4used: true }) || {}; // a suggestion that spends no Command Spell
    return { ids: b.ids || [], down: b.down || [], cs4: false, cs2: 0, gemMana: b.gemMana || 0, moveTo: null };
  }
  return {};
}

let queued = false;
function onEvent(e) {
  if (e.type === 'log' && ['death', 'reveal', 'grail'].includes(e.entry.cls) && !skip) toast(e.entry.text, e.entry.cls);
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => { queued = false; render(); });
}

// ---------- small pieces ----------
const me = () => g.human;
const seen = (p) => p.isHuman || p.revealed || g.over;
const kireiEye = () => me().m.key === 'kirei' && !me().revealed && !g.over; // Kirei sees every class while hidden
function svLabel(p) {
  if (seen(p)) return `${p.sv.cls} · ${p.sv.name}`;
  if (kireiEye()) return `${p.sv.cls} · ชื่อจริงซ่อน`;
  return 'ชื่อจริงซ่อน';
}
function chip(p, extra = '') {
  const face = seen(p) ? `<img src="${SV_ART[p.sv.key]}" alt="">` : `<i>${esc(p.m.en[0])}</i>`;
  const cls = `chip${p.isHuman ? ' me' : ''}${g.turn === p ? ' turn' : ''}${p.out ? ' out' : ''}`;
  return `<span class="${cls}" style="--c:${p.m.color}" title="${esc(`${p.m.name} · ${svLabel(p)}`)}">${face}<b>${esc(p.name)}${p.isHuman ? ' (คุณ)' : ''}</b>${extra}</span>`;
}
function sigil(n, max) {
  const d = ['M20 5 C10 9 6 20 12 33', 'M20 5 C30 9 34 20 28 33', 'M20 14 L24.5 22 L20 34 L15.5 22 Z'];
  return `<svg class="sigil" viewBox="0 0 40 40" role="img" aria-label="Command Spell ${n} จาก ${max}">${d.map((x, i) => `<path class="${i < n ? 'on' : 'off'}" d="${x}"/>`).join('')}</svg>`;
}
const csDots = (n) => '◆'.repeat(Math.max(0, n)) || '–';

const TAG = {
  reveal: 'เปิดชื่อจริง', once: 'ใช้ครั้งเดียว', constant: 'ถาวร', residual: 'วางค้าง', petrify: 'ดวงตาศิลา',
  defeatOne: 'ทำให้แพ้ 1 คน', ruleBreaker: 'เผา Command Spell', cancel: 'ยกเลิกสกิลคู่ต่อสู้', zeroOpp: 'กำลังคู่ต่อสู้ = 0',
  ubw: 'ทั้งสำรับขึ้นมือ', riding: 'ลงเพิ่มได้ 2 ใบ', move: 'ย้ายได้', bell: 'ย้าย + ยึดพื้นที่', saberVP: 'ใช้ NP ได้ VP',
  tsubame: 'Tsubame Gaeshi', returnRB: 'แพ้: คืน Rule Breaker', guard: 'การ์ดพิเศษ',
  playVP: (n) => `ลงแล้ว +${n} VP`, win: (n) => `ชนะ +${n} VP`, perFoe: () => 'ชนะ +1 VP ต่อคู่ต่อสู้',
  godHand: () => 'แพ้: ขโมย 3 VP', terrainMul: (n) => `พื้นที่ ×${n}`, mana: (n) => `ได้มานา +${n}`, agiExtra: (n) => `ว่องไว 2 ใบ +${n}`,
};
const tags = (c) => Object.entries(c.fx || {}).filter(([k]) => TAG[k]).map(([k, v]) => (typeof TAG[k] === 'function' ? TAG[k](v) : TAG[k]));
const cardName = (c) => c.name || `${TYPES[c.type]} ${c.power}`;
const clean = (t) => t.replace(/\s*\[(NW|v3|RK|ST|FD)\]/g, ''); // source tags belong to the paper, not the table
const cardText = (c) => (c.text ? clean(c.text) : [`${TYPES[c.type]} พลัง ${c.power} มานา ${c.mana}`, ...tags(c)].join(' · '));

// a card tile. o: { btn, sel, down, secret, back, lock, power, cost, mini, note }
function tile(c, o = {}) {
  if (o.back) return `<div class="card back${o.mini ? ' mini' : ''}"><span class="ty">คว่ำ</span><span class="pw">?</span></div>`;
  const down = o.down ?? c.down;
  const cls = ['card', `t${c.type}`, c.skill ? 'skill' : '', o.sel ? 'sel' : '', down ? 'down' : '', o.lock ? 'lock' : '', c.gone ? 'gone' : '', c.resident ? 'res' : '', o.mini ? 'mini' : ''].filter(Boolean).join(' ');
  let body;
  if (down && o.secret) body = '<span class="ty">คว่ำ</span><span class="pw">0</span>';
  else {
    const pw = o.power ?? c.power;
    const up = pw > c.power ? `<sup>+${pw - c.power}</sup>` : '';
    const fx = o.note ?? (c.gone ? 'ใช้หมดแล้ว' : c.resident ? 'วางค้างอยู่' : tags(c).slice(0, 2).join(' · '));
    body = `<span class="ty">${down ? 'คว่ำ · ' : ''}${TYPES[c.type]}</span><span class="pw">${down ? 0 : Math.min(pw, c.power)}${down ? '' : up}</span>`
      + `<span class="mn" title="มานา">${o.cost ?? c.mana}</span>`
      + `<span>${c.name ? `<span class="nm">${esc(c.name)}</span>` : ''}${fx ? `<span class="fx">${esc(fx)}</span>` : ''}</span>`;
  }
  const title = esc(cardText(c));
  if (o.btn) return `<button class="${cls}" data-act="${o.act || 'pick'}" data-uid="${c.uid}" title="${title}" aria-pressed="${!!o.sel}">${body}</button>`;
  return `<div class="${cls}" title="${title}">${body}</div>`;
}

function prizeText(f) {
  if (!g.objs[f].length) return '';
  if (f === 'shinto' && !g.shintoOpen) return `ออบเจกต์คว่ำ + โบนัส ${AREAS[f].bonus + g.efx('bonusUp')}`;
  return `ชนะได้ ${g.fieldVP(f)} VP`;
}

// ---------- drawing ----------
function render() {
  if (!g) return;
  drawHud();
  drawEvent();
  drawBoard();
  drawPanel();
  drawDock();
  drawStandings();
  drawLog();
  if (me().out && !outShown && !g.over) { outShown = true; showOut(); }
  if (g.over && !overShown && !wait) { overShown = true; showOver(); }
}

function drawHud() {
  const r = g.round;
  let pips = '';
  for (let i = 1; i <= ROUNDS; i++) {
    const cls = [i > REGULAR ? 'cl' : '', i < r || (g.over && i <= r) ? 'done' : '', i === r && !g.over ? 'now' : ''].filter(Boolean).join(' ');
    pips += `<li class="${cls}" title="รอบ ${i}${i > REGULAR ? ' · ไคลแมกซ์' : ''}"><span>${i}</span></li>`;
    if (CUT[i]) pips += `<li class="cut" title="จบรอบ ${i} เหลือ ${CUT[i]} คน">✂${CUT[i]}</li>`;
  }
  const steps = PHASES.map(([k, t]) => `<li class="${g.phase === k && !g.over ? 'now' : ''}">${t}</li>`).join('');
  $('#hud').innerHTML = `<div class="brand"><span class="crest">FATE/DOMINATION</span><span class="sub">สงครามจอกศักดิ์สิทธิ์ฟุยุกิ · เดโม 1 ด่าน</span></div>
    <div class="track"><ol class="rounds" aria-label="รอบ">${pips}</ol><ol class="steps" aria-label="ขั้นของรอบ">${steps}</ol></div>
    <div class="hud-btns"><button class="btn ghost" data-act="rules">กติกา</button><button class="btn ghost" data-act="new">เกมใหม่</button></div>`;
}

function drawEvent() {
  const e = g.event;
  if (!e) { $('#eventbar').innerHTML = ''; return; }
  const cl = g.climax();
  $('#eventbar').innerHTML = `<div class="event${cl ? ' climax' : ''}"><span class="lab">${cl ? `ไคลแมกซ์ · รอบ ${g.round}` : `อีเวนต์ · รอบ ${g.round}/${ROUNDS}`}</span>
    <b>${esc(e.name)}</b><span class="mana">ทุกคนมานา +${e.mana}</span><span class="dim">${esc(e.text)}</span></div>`;
}

// which board areas the human can click right now, and what a click does
function boardChoices() {
  if (!wait) return {};
  const out = {};
  if (wait.kind === 'place') for (const k of wait.ctx.opts) out[k] = { to: k };
  if (wait.kind === 'move') {
    for (const o of moveOpts()) {
      const cur = out[o.to];
      const rank = (x) => (x.how === 'stay' ? 0 : x.how === 'cs' ? 2 : 1);
      if (!cur || rank(o) < rank(cur) || (rank(o) === rank(cur) && o.cost < cur.cost)) out[o.to] = o;
    }
  }
  return out;
}
const moveOpts = () => g.moveOptions(me(), me().mana + (draft?.cs4 ? CS_MANA : 0), me().cs - (draft?.cs4 ? 1 : 0));

function drawBoard() {
  const can = boardChoices();
  const arrows = [0, 1, 2].map((i) => {
    const cost = me().m.key === 'kuzuki' && i === 0 ? 'ฟรี' : STEP_COST[i];
    return `<div class="arrow" aria-hidden="true"><i>➜</i><span>มานา <b>${cost}</b></span></div>`;
  });
  $('#board').innerHTML = [area('workshop', can), arrows[0], area('miyama', can), arrows[1], area('shinto', can), arrows[2], area('recon', can)].join('');
}

function area(k, can) {
  const A = AREAS[k];
  const here = g.alive().filter((p) => p.at === k);
  const c = can[k];
  const mine = me().at === k && !me().out;
  const attrs = c ? ` data-act="area" data-to="${k}" role="button" tabindex="0" aria-label="${esc(`เลือก${A.name}`)}"` : '';
  let body = '';
  if (k === 'workshop') {
    body += '<span class="rule">ได้มานาตามช่อง · เต็ม 4 คนแล้วเข้าไม่ได้</span><div class="slots">';
    for (let i = 0; i < WORKSHOP.length; i++) {
      const p = here.find((q) => q.slot === i);
      body += p ? `<span class="slot full">${chip(p)}</span>` : `<span class="slot"><span class="v">+${WORKSHOP[i]}</span></span>`;
    }
    body += '</div>';
  } else if (k === 'recon') {
    const p = here[0];
    body += `<span class="rule">รับ 1 คน · ไปได้ด้วยการย้ายเท่านั้น</span><span class="prize">+${RECON_VP} VP ตอนจบรอบ</span>
      <div class="slots">${p ? `<span class="slot full">${chip(p)}</span>` : '<span class="slot"><span class="v">ว่าง</span></span>'}</div>`;
  } else {
    const objs = g.objs[k];
    const hidden = k === 'shinto' && !g.shintoOpen;
    body += `<span class="prize">${esc(prizeText(k) || `โบนัสสนามรบ +${A.bonus}`)}</span>`;
    if (objs.length) body += `<div class="objs">${objs.map((o) => (hidden ? '<div class="obj hid">ออบเจกต์คว่ำ · เปิดตอนปฏิบัติการ</div>' : `<div class="obj" title="${esc(o.text)}"><b>${esc(o.name)}</b><span class="vp">${o.vp} VP</span>${o.fx && Object.keys(o.fx).length ? `<br><span class="dim">${esc(o.text)}</span>` : ''}</div>`)).join('')}</div>`;
    body += '<div class="slots">';
    for (let i = 0; i < TERRAIN.length; i++) {
      const p = here.find((q) => q.slot === i);
      body += p ? `<span class="slot full">${chip(p, p.terrain ? `<span class="t">+${p.terrain}</span>` : '')}</span>` : `<span class="slot terr" title="ช่องได้เปรียบพื้นที่"><span class="v">+${TERRAIN[i]}</span></span>`;
    }
    for (const p of here.filter((q) => q.slot == null || q.slot >= TERRAIN.length)) body += `<span class="slot full">${chip(p, p.terrain ? `<span class="t">+${p.terrain}</span>` : '')}</span>`;
    body += '</div>';
  }
  const engaged = g.phase === 'action' && g.engaged.has(k) ? '<span class="tag-engaged" title="มี 2 คนขึ้นไปตอนเริ่มปฏิบัติการ เดินออกไม่ได้">ติดพัน</span>' : '';
  return `<div class="area${c ? ' can' : ''}${mine ? ' here' : ''}"${attrs}><h3>${esc(A.name)}<small>${A.en.toUpperCase()}</small>${engaged}</h3>${body}</div>`;
}

// ---------- the action panel ----------
function orderStrip() {
  const ord = g.order();
  const done = (p) => (g.phase === 'outpost' ? p.at != null : g.phase === 'action' ? ord.indexOf(p) < ord.indexOf(g.turn) : false);
  return `<div class="order"><span>ลำดับเล่น</span>${ord.map((p, i) => `<span class="${done(p) ? 'done' : ''}">${i === 0 ? `${SUN} ` : ''}${chip(p)}</span>`).join('')}</div>`;
}

function drawPanel() {
  const el = $('#panel');
  el.classList.toggle('act', !!wait && wait.kind !== 'combatEnd');
  if (g.over) {
    el.innerHTML = `<div class="p-head"><span class="who">GAME OVER</span><h2>${esc(g.winner ? `${g.winner.name} ชนะสงครามจอกศักดิ์สิทธิ์` : 'ชนะร่วม')}</h2></div>
      <p class="p-text">${esc(g.how || '')}</p><div class="go-row"><button class="btn" data-act="showover">ดูอันดับ</button><button class="btn primary" data-act="again">เล่นอีกครั้ง</button></div>`;
    return;
  }
  if (!wait || wait.kind === 'combatEnd') {
    const t = g.turn;
    const what = !g.round ? 'กำลังเรียก Servant…' : t ? `${t.name} กำลังเลือก` : g.phase === 'outpost' ? 'ทุกคนกำลังวางหมาก' : g.phase === 'combat' ? 'ช่วงใช้ความสามารถก่อนตัดสินผล' : 'กำลังเตรียมรอบ';
    el.innerHTML = `<div class="p-head"><span class="who">${me().out ? 'คุณตกรอบแล้ว · ดูต่อ' : 'รอคู่แข่ง'}</span><h2>${esc(what)}</h2></div>${g.round ? orderStrip() : ''}
      ${me().out && !skip ? '<div class="go-row"><span class="dim">บอทเล่นต่อจนจบรอบ 11</span><button class="btn" data-act="skip">ข้ามไปผลสุดท้าย</button></div>' : ''}`;
    return;
  }
  if (wait.kind === 'place') el.innerHTML = placePanel();
  else if (wait.kind === 'move') el.innerHTML = movePanel();
  else if (wait.kind === 'cards') el.innerHTML = wait.ctx.field ? cardsPanel() : discardPanel();
  else if (wait.kind === 'ability') el.innerHTML = abilityPanel();
}

// Rin's jewel swap, offered in the windows before placing, moving and playing cards
function swapBox() {
  const p = me();
  if (!g.abilityOpts(p).some((o) => o.kind === 'gemSwap')) return '';
  return `<div><p class="row-lab">อัญมณี: แลกการ์ดในมือ · ใช้ ${GEM_SWAP} อัน รอบละครั้ง (เหลือ ${p.gems})</p><div class="cards">${p.hand.map((c) => tile(c, { btn: true, act: 'swappick', mini: true, sel: swapSel.has(c.uid) })).join('')}
    <button class="btn sm" data-act="swap"${swapSel.size ? '' : ' disabled'}>${swapSel.size ? `ทิ้ง ${swapSel.size} ใบ แล้วจั่วใหม่` : 'เลือกใบที่จะทิ้ง'}</button></div></div>`;
}

// the combat window: everyone has played, Command Spells can still tip a fight or leave it
function abilityPanel() {
  const p = me();
  const opts = wait.ctx.opts;
  const field = (f) => {
    const ps = g.here(f);
    if (!ps.length) return '';
    return `<div class="foe fieldnow"><b>${esc(AREAS[f].name)}</b><span class="dim">${esc(prizeText(f))}</span>${ps.map((q) => `<div class="abrow">${chip(q)}<span class="pw">${q.play ? g.powerOf(q, q.play).total : 0}</span></div>`).join('')}</div>`;
  };
  const btns = [];
  if (opts.some((o) => o.kind === 'csPower')) btns.push(`<button class="opt cs" data-act="ab" data-kind="csPower"><b>Command Spell: พลัง +${CS_POWER}</b><span>ถ้าชนะได้ VP +${CS_VP} เพิ่ม · ใช้ซ้ำได้ถ้ายังเหลือ</span></button>`);
  for (const o of opts.filter((x) => x.kind === 'csMove')) btns.push(`<button class="opt cs" data-act="ab" data-kind="csMove" data-to="${o.to}"><b>Command Spell: ย้ายไป${esc(AREAS[o.to].name)}</b><span>${o.to === 'recon' ? `ออกจากการต่อสู้ ได้ ${RECON_VP} VP ตอนจบรอบ · การ์ดที่ลงไปกองทิ้ง` : 'การ์ดที่ลงตามไปด้วย · เสียได้เปรียบพื้นที่'}</span></button>`);
  return `<div class="p-head"><span class="who">ตาของคุณ</span><h2>ก่อนตัดสินผล · ช่วงใช้ความสามารถ</h2></div>
    <p class="p-text">ทุกคนลงการ์ดครบแล้ว พลังด้านล่างคือที่ประกาศ (การ์ดคว่ำนับ 0) · ใช้ Command Spell ได้ตามลำดับที่นั่ง คนที่ตามหลังคุณยังตอบโต้ได้ · คุณเหลือ ${p.cs} ดวง</p>
    <div class="foes">${FIELDS.map(field).join('')}</div><div class="opts">${btns.join('')}</div>
    <div class="go-row"><span class="dim">ผลพิเศษอย่าง [แพ้] คิดตอนตัดสินผล</span><button class="btn primary" data-act="abpass">ผ่าน · ตัดสินผล</button></div>`;
}

function placePanel() {
  const p = me();
  const opts = wait.ctx.opts.map((k) => {
    const here = g.here(k);
    let sub = '';
    if (k === 'workshop') {
      const n = p.m.key === 'kuzuki' ? 0 : WORKSHOP[here.length];
      const res = p.skills.find((c) => c.resident && c.fx.workshopVP);
      sub = `<span>ช่อง ${here.length + 1} · <span class="gain">มานา +${n}</span>${p.m.key === 'kuzuki' ? ' (หมาป่าเดียวดาย)' : ''}${res ? ` · ${esc(res.name)} +${res.fx.workshopVP} VP` : ''}</span><span>ไม่ได้สู้รอบนี้ ช่วงปฏิบัติการเดินออกไปได้</span>`;
    } else {
      const t = here.length < TERRAIN.length ? TERRAIN[here.length] : 0;
      sub = `<span>${t ? `<span class="gain">ได้เปรียบพื้นที่ +${t}</span>` : 'ช่องได้เปรียบเต็มแล้ว'} · ${esc(prizeText(k))}</span><span>${here.length ? `อยู่แล้ว: ${here.map((q) => esc(q.name)).join(', ')}` : 'ยังไม่มีใคร'}</span>`;
    }
    return `<button class="opt" data-act="place" data-to="${k}"><b>${esc(AREAS[k].name)}</b>${sub}</button>`;
  }).join('');
  return `<div class="p-head"><span class="who">ตาของคุณ</span><h2>ตั้งมั่น · วางหมาก Master</h2></div>
    <p class="p-text">เลือกจุดวางหมาก (กดที่กระดานก็ได้) · โรงฝึกเวทให้มานา สนามรบให้ได้เปรียบพื้นที่กับคนที่มาก่อน · ลาดตระเวนต้องย้ายไปตอนปฏิบัติการ</p>
    ${orderStrip()}<div class="opts">${opts}</div>${swapBox()}`;
}

function movePanel() {
  const p = me();
  const fieldTxt = (k) => {
    const foes = g.here(k).filter((q) => q !== p);
    return foes.length ? `สู้กับ ${foes.map((q) => esc(q.name)).join(', ')} · ${esc(prizeText(k))}` : `ยังไม่มีคู่ต่อสู้ · ${esc(prizeText(k))}`;
  };
  const opts = moveOpts().map((o) => {
    const A = AREAS[o.to];
    let b, sub;
    if (o.how === 'stay') {
      b = `อยู่ที่${A.name}`;
      sub = A.field ? fieldTxt(o.to) : o.to === 'recon' ? `ได้ ${RECON_VP} VP ตอนจบรอบ` : 'ไม่สู้ · ลงการ์ดคว่ำ 2 ใบ';
    } else if (o.how === 'walk') {
      b = `เดินไป${A.name}`;
      sub = `<span class="gain">มานา ${o.cost}</span> · ${A.field ? fieldTxt(o.to) : `ได้ ${RECON_VP} VP ตอนจบรอบ`}`;
    } else if (o.how === 'kirei') {
      b = 'ผู้ควบคุม: ไปลาดตระเวน';
      sub = `<span class="gain">มานา 2</span> · ได้ ${RECON_VP} VP ตอนจบรอบ`;
    } else {
      b = `ย้ายไป${A.name}`;
      sub = `ใช้ Command Spell 1 ดวง · ${A.field ? fieldTxt(o.to) : `ได้ ${RECON_VP} VP ตอนจบรอบ`}`;
    }
    return `<button class="opt${o.how === 'cs' ? ' cs' : ''}" data-act="move" data-to="${o.to}" data-how="${o.how}"><b>${esc(b)}</b><span>${sub}</span></button>`;
  }).join('');
  const engaged = g.engaged.has(p.at) ? `<p class="p-text">${esc(AREAS[p.at].name)}ติดพัน (มี 2 คนขึ้นไป) เดินออกไม่ได้ ย้ายได้ด้วย Command Spell เท่านั้น</p>` : '';
  return `<div class="p-head"><span class="who">ตาของคุณ</span><h2>ปฏิบัติการ · ย้ายหรืออยู่ที่เดิม</h2></div>
    <p class="p-text">ย้ายตามลูกศรได้รอบละครั้ง จ่ายมานาตามลูกศร แล้วค่อยลงการ์ด · คุณมีมานา ${p.mana}${draft.cs4 ? ` (+${CS_MANA} = ${p.mana + CS_MANA})` : ''}</p>${engaged}
    ${p.cs > 0 ? `<label class="check"><input type="checkbox" id="mv-cs4" data-act="mvcs4"${draft.cs4 ? ' checked' : ''}> ใช้ Command Spell 1 ดวงรับมานา +${CS_MANA} ก่อนย้าย</label>` : ''}
    ${orderStrip()}<div class="opts">${opts}</div>${swapBox()}`;
}

function discardPanel() {
  const p = me();
  const ids = draft.ids;
  return `<div class="p-head"><span class="who">ตาของคุณ</span><h2>ลงการ์ดคว่ำ 2 ใบ</h2></div>
    <p class="p-text">คุณอยู่${esc(AREAS[p.at].name)} ไม่ได้สู้ · ยังต้องลงการ์ด 2 ใบแบบคว่ำ (ไม่มีผล) การ์ดไปกองทิ้ง เก็บใบดีไว้รอบหน้า</p>
    <div class="cards">${p.hand.map((c) => tile(c, { btn: true, sel: ids.includes(c.uid) })).join('')}</div>
    <div class="go-row"><span class="dim">เลือกแล้ว ${ids.length}/2</span><button class="btn primary" data-act="discard"${ids.length === Math.min(2, p.hand.length) ? '' : ' disabled'}>ลงการ์ดคว่ำ</button></div>`;
}

const allCards = (p) => [...p.hand, ...p.skills, ...p.deck, ...(p.gand ? [p.gand] : [])];

// the play the engine would make from the draft, for the preview
function preview() {
  const p = me();
  const a = g.cleanCards(p, { ...draft, cs4: draft.cs4 && !wait.ctx.cs4used }, true);
  const pool = allCards(p);
  const cards = a.ids.map((id) => { const c = pool.find((x) => x.uid === id); return { ...c, down: a.down.includes(id) }; });
  const revealing = !p.revealed && cards.some((c) => !c.down && (c.fx?.reveal || g.tsubame(p, c)));
  const f = a.moveTo && AREAS[a.moveTo].field ? a.moveTo : p.at;
  const pw = g.powerOf(p, { cards, cs2: a.cs2, revealing }, { f });
  return { a, cards, pw, revealing };
}

function cardsPanel() {
  const p = me();
  const f = p.at;
  const { a, cards, pw, revealing } = preview();
  const mana = p.mana + (a.cs4 ? CS_MANA : 0);
  const foes = g.here(f).filter((q) => q !== p).map((q) => `<div class="foe">${chip(q)}${q.play
    ? `<span>ประกาศพลัง</span><span class="pw">${q.play.pre}</span><div class="cards">${q.play.cards.map((c) => (c.down ? tile(c, { back: true, mini: true }) : tile(c, { mini: true }))).join('')}</div>`
    : `<span>ยังไม่ลงการ์ด${q.terrain ? ` · ได้เปรียบ +${q.terrain}` : ''}</span>`}</div>`).join('');
  const sel = new Set(draft.ids);
  const down = new Set(draft.down);
  const ctx = { f };
  const pick = (c, extra = {}) => {
    const s = sel.has(c.uid);
    const isDown = s && down.has(c.uid);
    const power = g.cardPower(p, { ...c, down: false }, ctx);
    const t = tile(c, { btn: true, sel: s, down: isDown, power, cost: g.costOf(p, c), ...extra });
    const flip = s && !c.skill ? `<button class="flip${isDown ? ' down' : ''}" data-act="flip" data-uid="${c.uid}">${isDown ? 'คว่ำอยู่ · กดหงาย' : 'หงาย · กดคว่ำ'}</button>` : '';
    return `<div class="pickcol">${t}${flip}</div>`;
  };
  const skillMana = mana;
  const skills = p.skills.map((c) => {
    const why = g.skillState(p, c, skillMana);
    if (why) return `<div class="pickcol">${tile(c, { lock: true, note: why, cost: g.costOf(p, c) })}</div>`;
    return pick(c);
  }).join('');
  const gandFree = p.gand && !p.roundUse.gand && p.gems >= GEM_GAND;
  const gandRow = p.gand ? `<div><p class="row-lab">การ์ดนอกสำรับ · ใช้อัญมณี ${GEM_GAND} อัน รอบละครั้ง</p><div class="cards">${gandFree || sel.has(p.gand.uid) ? pick(p.gand) : `<div class="pickcol">${tile(p.gand, { lock: true, note: p.roundUse.gand ? 'ใช้แล้วรอบนี้' : 'อัญมณีไม่พอ' })}</div>`}</div></div>` : '';
  const ubw = cards.some((c) => c.fx?.ubw);
  const deckRow = ubw ? `<div><p class="row-lab">สำรับ (Unlimited Blade Works เลือกเพิ่มได้ ${cards.find((c) => c.fx?.ubw).fx.ubw} ใบ)</p><div class="cards">${p.deck.map((c) => pick(c)).join('')}</div></div>` : '';

  // controls
  const csLeft = p.cs - (a.cs4 ? 1 : 0);
  const ctrl = [];
  if (!wait.ctx.cs4used && p.cs > 0) ctrl.push(`<button class="btn${draft.cs4 ? ' on' : ''}" data-act="cs4" aria-pressed="${!!draft.cs4}">◆ Command Spell: มานา +${CS_MANA}</button>`);
  if (csLeft > 0) ctrl.push(stepper('cs2', `◆ Command Spell: พลัง +${CS_POWER} (ชนะได้ VP +${CS_VP})`, a.cs2, csLeft));
  if (p.m.key === 'rin' && p.gems > 0) ctrl.push(stepper('gemMana', 'อัญมณีจ่ายแทนมานา', draft.gemMana || 0, p.gems - (a.gand ? GEM_GAND : 0)));
  const mover = cards.find((c) => !c.down && (c.fx?.bell || c.fx?.move));
  if (mover) {
    const dests = PATH.slice(1).filter((k) => k !== p.at && (k !== 'recon' || g.reconFree(p)));
    ctrl.push(`<span class="stepper">${esc(mover.name)} ย้ายไป: ${['', ...dests].map((k) => `<button class="btn sm${(draft.moveTo || '') === k ? ' on' : ''}" data-act="moveTo" data-to="${k}">${k ? esc(AREAS[k].name) : 'ไม่ย้าย'}</button>`).join('')}</span>`);
  }

  // what the engine changed from the draft
  const notes = [];
  for (const id of a.ids) if (!sel.has(id)) notes.push(`เติม ${esc(cardName(cards.find((c) => c.uid === id)))} แบบคว่ำให้ครบ 2 ใบ`);
  for (const id of a.down) if (sel.has(id) && !down.has(id)) notes.push(`คว่ำ ${esc(cardName(cards.find((c) => c.uid === id)))} เพราะมานาไม่พอ`);
  for (const id of draft.down) if (a.ids.includes(id) && !a.down.includes(id)) notes.push(`หงาย ${esc(cardName(cards.find((c) => c.uid === id)))} เพราะในสนามรบต้องหงายอย่างน้อย 1 ใบ`);
  for (const id of draft.ids) if (!a.ids.includes(id)) { const c = allCards(p).find((x) => x.uid === id); if (c) notes.push(`ไม่ได้ลง ${esc(cardName(c))} (เกินจำนวน มานาหรืออัญมณีไม่พอ)`); }
  if (revealing) notes.push(`ใช้การ์ดนี้แล้วชื่อจริงจะเปิด: ${esc(p.sv.name)}`);
  const left = mana - a.cost;
  const gemsLeft = p.gems - a.gemMana - (a.gand ? GEM_GAND : 0);
  const parts = pw.parts.filter(([, n]) => n).map(([t, n]) => `${esc(t)} ${n}`).join(' + ') || 'การ์ด 0';
  const infoLine = info ? `<div class="info"><b>${esc(cardName(info))}</b> · ${esc(cardText(info))}</div>` : '';

  return `<div class="p-head"><span class="who">ตาของคุณ</span><h2>ลงการ์ดที่${esc(AREAS[f].name)}</h2><span class="prize" style="color:var(--grail)">${esc(prizeText(f))}</span></div>
    <p class="p-text">เลือก ${g.maxCards(p)} ใบ · หงาย = จ่ายมานาและมีพลัง · คว่ำ = ฟรีแต่พลัง 0 · ต้องหงายอย่างน้อย 1 ใบ · การ์ดสกิลใช้ได้เมื่อมีมานา ${SKILL_MANA} ขึ้นไป</p>
    ${foes ? `<div class="foes">${foes}</div>` : '<p class="p-text">ยังไม่มีคู่ต่อสู้ที่นี่ (คนที่ยังไม่เล่นอาจย้ายเข้ามา)</p>'}
    <div><p class="row-lab">การ์ดในมือ</p><div class="cards">${p.hand.map((c) => pick(c)).join('')}</div></div>
    <div><p class="row-lab">ช่องสกิล ${esc(p.sv.cls)}</p><div class="cards">${skills}</div></div>
    ${gandRow}${deckRow}${infoLine}${swapBox()}
    ${ctrl.length ? `<div class="ctrl">${ctrl.join('')}</div>` : ''}
    <div class="sum"><div class="go-row"><div><span class="dim">พลังที่ประกาศ</span><div class="big">${pw.total}</div></div>
      <div class="num" style="text-align:right"><div>มานา ${mana} − ${a.cost} = <b style="color:var(--mana)">${left}</b></div>${p.m.key === 'rin' ? `<div class="dim">อัญมณีเหลือ ${gemsLeft}</div>` : ''}<div class="dim">Command Spell เหลือ ${csLeft - a.cs2}</div></div></div>
      <div class="parts">${parts}</div>${notes.map((n) => `<div class="warn">${n}</div>`).join('')}</div>
    <div class="go-row"><button class="btn ghost" data-act="reset">ใช้ชุดที่แนะนำ</button><button class="btn primary" data-act="play">ลงการ์ด · พลัง ${pw.total}</button></div>`;
}

function stepper(key, label, v, max) {
  return `<span class="stepper"><span>${label}</span><button data-act="step" data-key="${key}" data-d="-1" aria-label="ลด"${v <= 0 ? ' disabled' : ''}>−</button><b>${v}</b><button data-act="step" data-key="${key}" data-d="1" aria-label="เพิ่ม"${v >= max ? ' disabled' : ''}>+</button></span>`;
}

// ---------- my dock ----------
function drawDock() {
  const p = me();
  if (!started) { $('#dock').innerHTML = '<p class="p-text">เลือก Master แล้ว Servant ของคุณจะมาอยู่ตรงนี้</p>'; return; }
  const meter = Array.from({ length: Math.max(12, p.mana) }, (_, i) => `<i class="${i < p.mana ? 'on' : ''}${i === SKILL_MANA - 1 ? ' gate' : ''}"></i>`).join('');
  const skills = p.skills.map((c) => {
    const why = g.round && !g.over ? g.skillState(p, c) : '';
    return tile(c, { lock: !!why && !c.gone && !c.resident, note: c.gone ? 'ใช้หมดแล้ว' : why || undefined, cost: g.costOf(p, c) });
  }).join('');
  $('#dock').innerHTML = `<div class="me-sv"><img src="${SV_ART[p.sv.key]}" alt="${esc(p.sv.name)}">
      <div class="who"><span class="cls">${esc(p.sv.cls.toUpperCase())}</span><b>${esc(p.sv.name)}</b><span>Master: ${esc(p.m.name)} (คุณ)</span>
      <span class="hide${p.revealed ? ' open' : ''}">${p.revealed ? 'ชื่อจริงเปิดแล้ว ทุกคนเห็น' : 'ชื่อจริงยังซ่อน คู่แข่งไม่รู้ว่าคุณเป็นใคร'}</span>
      ${p.out ? '<span style="color:var(--bad)">ตกรอบแล้ว</span>' : ''}</div></div>
    <div class="stats">
      <div class="stat vp"><small>VP</small><span class="v">${p.vp}</span></div>
      <div class="stat mana"><small>มานา · ถึง ${SKILL_MANA} ใช้การ์ดสกิลได้</small><span class="v">${p.mana}</span><span class="meter" aria-hidden="true">${meter}</span></div>
      <div class="stat"><small>Command Spell ${p.cs}/${p.m.cs}</small>${sigil(p.cs, Math.max(3, p.m.cs))}</div>
      ${p.m.key === 'rin' ? `<div class="stat"><small>อัญมณี</small><span class="v" style="color:#e88">${p.gems}</span></div>` : ''}
      <div class="stat"><small>สำรับ · กองทิ้ง</small><span class="num">${p.deck.length} · ${p.trash.length}</span></div>
    </div>
    <div class="mycards"><div><p class="row-lab">การ์ดในมือ</p><div class="cards">${p.hand.map((c) => tile(c)).join('') || '<span class="dim">ยังไม่มีการ์ด</span>'}</div></div>
      <div><p class="row-lab">ช่องสกิล</p><div class="cards">${skills}</div></div></div>
    <details class="abil"><summary>ความสามารถของ${esc(p.m.short)}</summary><ul>${p.m.abil.map(([t, d]) => `<li><b>${esc(t)}</b>${d ? `: ${esc(d)}` : ''}</li>`).join('')}</ul></details>`;
}

// ---------- side ----------
function nextCut() {
  for (let r = Math.max(1, g.round); r <= ROUNDS; r++) if (CUT[r]) return [r, CUT[r]];
  return null;
}
function drawStandings() {
  const alive = [...g.alive()].sort((a, b) => b.vp - a.vp);
  const out = g.players.filter((p) => p.out).sort((a, b) => b.outRound - a.outRound || b.vp - a.vp);
  const cut = g.over ? null : nextCut();
  const sun = g.order()[0];
  let line = -1;
  if (cut && alive.length > cut[1]) { const v = alive[cut[1] - 1].vp; line = alive.filter((p) => p.vp >= v).length; }
  const row = (p, i) => `<li class="${p.isHuman ? 'me' : ''}${p.out ? ' out' : ''}"><span class="rk">${p.out ? '✖' : i + 1}</span>
      <span>${chip(p, p === sun && !p.out && !g.over ? `<span class="t">${SUN}</span>` : '')}</span>
      <span class="nums"><span class="vp">${p.vp}</span><span><span class="m">มานา ${p.mana}</span> · <span class="cs" title="Command Spell">${csDots(p.cs)}</span></span></span>
      <span class="sv">${esc(svLabel(p))}${p.out ? ` · ตกรอบหลังรอบ ${p.outRound}` : p.at ? ` · ${esc(AREAS[p.at].name)}` : ''}</span></li>`;
  let rows = '';
  alive.forEach((p, i) => { if (i === line) rows += `<li class="cutline">เส้นตัดหลังรอบ ${cut[0]}</li>`; rows += row(p, i); });
  rows += out.map((p) => row(p, 0)).join('');
  $('#standings').innerHTML = `<div class="st-head"><h2>อันดับ VP</h2><small>${cut ? `จบรอบ ${cut[0]} เหลือ ${cut[1]} คน · เสมอที่เส้นรอดหมด` : g.over ? 'จบเกม' : `รอบสุดท้าย VP มากสุดชนะ`}</small></div><ol class="st">${rows}</ol>`;
}

let logCount = 0;
function drawLog() {
  const el = $('#log');
  if (g.logs.length === logCount && el.childElementCount) return;
  const nearEnd = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  el.innerHTML = g.logs.map((l) => `<p class="${l.cls}">${esc(l.text)}</p>`).join('');
  logCount = g.logs.length;
  if (nearEnd || logCount < 5) el.scrollTop = el.scrollHeight;
}

function toast(text, cls) {
  const el = document.createElement('div');
  el.className = `toast ${cls}`;
  el.textContent = text;
  $('#toasts').append(el);
  setTimeout(() => el.remove(), 4200);
  while ($('#toasts').childElementCount > 4) $('#toasts').firstElementChild.remove();
}

// ---------- overlays ----------
function openModal(html) { $('#modal').innerHTML = html; $('#modal').hidden = false; }
function closeModal() { $('#modal').hidden = true; $('#modal').innerHTML = ''; }
function closeSheet() { $('#sheet').hidden = true; $('#sheet').innerHTML = ''; }

function showStart() {
  const ms = MASTERS.map((m) => `<button class="mcard${setup.master === m.key ? ' sel' : ''}" style="--c:${m.color}" data-act="master" data-m="${m.key}" aria-pressed="${setup.master === m.key}">
      <span class="en">${esc(m.en.toUpperCase())}</span><b>${esc(m.name)}</b><span class="st2">มานาเริ่ม ${m.mana} · Command Spell ${m.cs}${m.gems ? ` · อัญมณี ${m.gems}` : ''}</span>
      <ul>${m.abil.map(([t, d]) => `<li>${esc(t)}${d ? `: ${esc(d)}` : ''}</li>`).join('')}</ul></button>`).join('');
  openModal(`<div class="dlg"><span class="eyebrow">เดโม 1 ด่าน · เมืองฟุยุกิ</span><div class="title-crest">FATE/DOMINATION</div>
    <p class="lede">สงครามจอกศักดิ์สิทธิ์ 7 Master กับ 7 Servant ของ Fate/stay night · เก็บ VP ให้ถึงรอบ 11 · จบรอบ 8, 9, 10 คนที่ VP ต่ำถูกคัดออกจนเหลือ 2 คนสุดท้าย</p>
    <ol class="how"><li>วางหมากที่โรงฝึกเวทเพื่อเก็บมานา หรือที่สนามรบเพื่อแย่ง VP</li><li>ย้ายได้รอบละครั้ง แล้วลงการ์ด 2 ใบ หงายเพื่อสู้ คว่ำเพื่อหลอก</li><li>มีมานา ${SKILL_MANA} ขึ้นไปถึงใช้การ์ดสกิลและ NP ของ Servant ได้</li><li>Command Spell 3 ดวง: มานา +4 · พลัง +2 · หรือย้ายฉุกเฉิน ใช้ได้ทุกช่วง แม้แต่ก่อนตัดสินผลต่อสู้</li></ol>
    <h2>เลือก Master ของคุณ</h2><div class="masters">${ms}</div>
    <p class="lede">Servant จะสุ่มให้ และเป็นความลับจนกว่าจะเปิดชื่อจริง · ตัวเลขการ์ดหลายใบเป็นค่าแทน</p>
    <div class="acts">${started && !g.over ? '<button class="btn ghost" data-act="close">กลับไปเล่นต่อ</button>' : ''}<button class="btn" data-act="rules">อ่านกติกา</button><button class="btn primary" data-act="start">${started ? 'เริ่มเกมใหม่' : 'เริ่มสงคราม'}</button></div></div>`);
}

let summonGo = null;
function showSummon(go) {
  summonGo = go;
  const p = me();
  const sk = [...p.skills, ...(p.gand ? [p.gand] : [])].map((c) => `<li><b>${esc(c.name)}${c.master || c.fx?.gand ? ' (การ์ดของ Master)' : ''}</b>${esc(cardText(c))}</li>`).join('');
  const deck = p.sv.deck;
  const byType = Object.keys(TYPES).map((t) => [t, deck.filter((c) => c.type === t).length]).filter(([, n]) => n).map(([t, n]) => `${TYPES[t]} ${n}`).join(' · ');
  openModal(`<div class="dlg"><span class="eyebrow">การอัญเชิญสำเร็จ</span><div class="summon"><img src="${SV_ART[p.sv.key]}" alt="${esc(p.sv.name)}">
    <div style="display:grid;gap:12px;min-width:0"><span class="cls">${esc(p.sv.cls.toUpperCase())}</span><h2>${esc(p.sv.name)}</h2>
    <p class="lede">Master ${esc(p.m.name)} · คู่แข่งยังไม่รู้ว่าคุณเป็นใครจนกว่าคุณจะใช้การ์ดเปิดชื่อจริง</p>
    <p class="row-lab">ช่องสกิล</p><ul class="skills">${sk}</ul>
    <p class="dim" style="margin:0;font-size:13px">สำรับโจมตี ${deck.length + (p.m.key === 'kuzuki' ? 2 : 0)} ใบ: ${byType}${p.m.key === 'kuzuki' ? ' + Snake 2' : ''}</p></div></div>
    <div class="acts"><button class="btn primary" data-act="go">เริ่มรอบ 1</button></div></div>`);
}

function showRules() {
  const back = !started ? 'back-start' : summonGo ? 'go-summon' : 'close';
  openModal(`<div class="dlg narrow"><span class="eyebrow">กติกาแบบย่อ</span><h2>วิธีเล่น</h2><div class="rules">
    <div><h3>เป้าหมาย</h3><p>เก็บ VP ให้มากที่สุดภายใน ${ROUNDS} รอบ (ปกติ ${REGULAR} + ไคลแมกซ์ 3) · จบรอบ 8 เหลือ 4 คน · จบรอบ 9 เหลือ 3 · จบรอบ 10 เหลือ 2 · เสมอที่เส้นรอดหมด · จบรอบ 11 คน VP มากสุดชนะ</p></div>
    <div><h3>หนึ่งรอบ</h3><ol>
      <li><b>เตรียมการ:</b> จั่วให้ครบ 3 ใบ · อีเวนต์ให้มานาทุกคนและมีผลทั้งรอบ · ออบเจกต์ลงที่มิยามะและชินโตะ (ชินโตะคว่ำไว้)</li>
      <li><b>ตั้งมั่น:</b> วางหมากที่โรงฝึกเวท (มานา +${WORKSHOP.join('/')} ตามลำดับ) หรือสนามรบ (คนแรกได้เปรียบพื้นที่ +${TERRAIN[0]} คนที่สอง +${TERRAIN[1]})</li>
      <li><b>ปฏิบัติการ:</b> ย้ายได้ 1 ครั้งตามลูกศร (มานา ${STEP_COST.join(' / ')}) แล้วลงการ์ด 2 ใบ · หงาย = จ่ายมานาและมีพลัง · คว่ำ = ฟรีแต่พลัง 0 · ในสนามรบต้องหงายอย่างน้อย 1 ใบ · สนามที่มี 2 คนขึ้นไปติดพัน เดินออกไม่ได้</li>
      <li><b>ต่อสู้:</b> พลังสูงสุดที่ไม่ [แพ้] ชนะ ได้ VP ของออบเจกต์ + โบนัสสนามรบ (มิยามะ +${AREAS.miyama.bonus} ชินโตะ +${AREAS.shinto.bonus}) · เสมอแบ่งกัน · อยู่คนเดียวได้แค่ VP ออบเจกต์</li>
      <li><b>จบรอบ:</b> คนที่ลาดตระเวนได้ ${RECON_VP} VP · การ์ดโจมตีไปกองทิ้ง การ์ดสกิลกลับช่องสกิล · ดวงอาทิตย์ (คนเริ่ม) เลื่อนไปคนถัดไป</li></ol></div>
    <div><h3>การ์ดสกิลและ NP</h3><p>ใช้ได้เมื่อมีมานา ${SKILL_MANA} ขึ้นไปก่อนจ่าย · ใช้แล้วกลับช่องสกิล ยกเว้นใบที่ "ใช้ครั้งเดียว" · บางใบเปิดชื่อจริงของ Servant</p></div>
    <div><h3>ช่วงใช้ความสามารถ</h3><p>ทุกขั้นยกเว้นจบรอบมีจังหวะให้ใช้ความสามารถตามลำดับที่นั่ง: เตรียมการ · ก่อนและหลังวางหมาก · ก่อนย้าย หลังย้าย และหลังลงการ์ด · ก่อนตัดสินผลต่อสู้ · หน้าจอนี้รวมจังหวะส่วนใหญ่ไว้ในหน้าวางหมาก ย้าย และลงการ์ด และมีหน้าแยกก่อนตัดสินผล</p></div>
    <div><h3>Command Spell</h3><p>ใช้ได้ทุกช่วงใช้ความสามารถ 1 ดวงต่ออย่าง: มานา +${CS_MANA} · พลัง +${CS_POWER} และถ้าชนะได้ VP +${CS_VP} · ย้ายจากสนามรบไปที่ไหนก็ได้ (ไม่สนการติดพัน การ์ดที่ลงแล้วตามไปด้วย)</p></div>
    <div><h3>[แพ้]</h3><p>สถานะจากการ์ดอย่างดวงตาศิลาหรือ Gáe Bolg · คนที่ [แพ้] ชนะสนามรบนั้นไม่ได้ ไม่ว่าพลังเท่าไหร่</p></div>
    <p class="dim">อ้างอิงกระดาษออกแบบ v4.0 · ตัวเลขการ์ดโจมตี อีเวนต์ และออบเจกต์บางใบเป็นค่าแทน</p></div>
    <div class="acts"><button class="btn primary" data-act="${back}">ปิด</button></div></div>`);
}

function showResults(results) {
  const ents = (r) => {
    const sorted = [...r.ents].sort((a, b) => (a.defeated - b.defeated) || (b.won - a.won) || (b.power ?? 0) - (a.power ?? 0));
    return sorted.map((e, i) => {
      const p = g.players[e.id];
      const cards = (e.cards || []).map((c) => (c.down ? tile(c, { back: true, mini: true }) : tile(c, { mini: true }))).join('');
      const res = r.alone ? `อยู่คนเดียว +${e.gain} VP` : e.defeated ? '[แพ้]' : e.won ? `ชนะ +${e.gain} VP` : e.gain ? `แพ้ ${e.gain > 0 ? '+' : ''}${e.gain} VP` : 'แพ้';
      const parts = (e.parts || []).filter(([, n]) => n).map(([t, n]) => `${esc(t)} ${n}`).join(' + ');
      return `<div class="ent${e.won ? ' won' : ' lost'}" style="animation-delay:${i * 120}ms"><div class="who">${chip(p)}<div class="cards">${cards}</div></div>
        <div><div class="tot">${r.alone ? '–' : e.power}</div><div class="res${e.defeated ? ' def' : ''}">${res}</div></div>
        ${parts ? `<div class="parts">${parts}</div>` : ''}${e.notes?.length ? `<div class="notes">${e.notes.map(esc).join(' · ')}</div>` : ''}</div>`;
    }).join('');
  };
  const recon = g.alive().find((p) => p.at === 'recon');
  const cut = CUT[g.round];
  const body = results.length
    ? results.map((r) => `<section class="bt"><h3>${esc(AREAS[r.f].name)}<small>${r.alone ? `ออบเจกต์ ${r.pool} VP` : `เดิมพัน ${r.pool} VP`}</small></h3>${ents(r)}</section>`).join('')
    : '<p class="lede">รอบนี้ไม่มีใครอยู่ในสนามรบ</p>';
  $('#sheet').innerHTML = `<div class="dlg"><span class="eyebrow">รอบ ${g.round} · ${esc(g.event.name)}</span><h2>ผลการต่อสู้</h2>${body}
    ${recon ? `<p class="lede">${esc(recon.name)} อยู่ลาดตระเวน จะได้ ${RECON_VP} VP ตอนจบรอบ</p>` : ''}
    ${cut ? `<p class="lede" style="color:var(--seal)">จบรอบนี้คัดออก เหลือ ${cut} คนที่ VP สูงสุด</p>` : ''}
    <div class="acts"><button class="btn ghost" data-act="skipall">ข้ามผลการต่อสู้ที่เหลือ</button><button class="btn primary" data-act="cont">${g.round === ROUNDS ? 'ดูผลสุดท้าย' : 'จบรอบ'}</button></div></div>`;
  $('#sheet').hidden = false;
  $('#sheet').scrollTop = 0;
}

function showOut() {
  openModal(`<div class="dlg narrow"><span class="eyebrow">ถูกคัดออก</span><h2>${esc(me().name)} ตกรอบหลังรอบ ${me().outRound}</h2>
    <p class="lede">คุณมี ${me().vp} VP ไม่ติดกลุ่มที่รอด · บอทจะเล่นต่อจนจบรอบ ${ROUNDS}</p>
    <div class="acts"><button class="btn" data-act="close">ดูต่อ</button><button class="btn primary" data-act="skip">ข้ามไปผลสุดท้าย</button></div></div>`);
}

function showOver() {
  const rank = [...g.players].sort((a, b) => (a.out - b.out) || (b.outRound - a.outRound) || b.vp - a.vp);
  const win = new Set(g.winners);
  const rows = rank.map((p, i) => `<li class="${p.isHuman ? 'me' : ''}"><span class="rk">${win.has(p) ? '★' : i + 1}</span><span>${chip(p)}</span>
    <span class="nums"><span class="vp">${p.vp}</span><span>${p.out ? `ตกรอบหลังรอบ ${p.outRound}` : 'อยู่ถึงจบ'}</span></span><span class="sv">${esc(`${p.sv.cls} · ${p.sv.name}`)}</span></li>`).join('');
  const meWon = win.has(me());
  openModal(`<div class="dlg narrow"><span class="eyebrow">Heaven's Feel · จบเกม</span>
    <h2>${meWon ? (g.winner ? 'คุณชนะสงครามจอกศักดิ์สิทธิ์' : 'คุณชนะร่วม') : `${esc(g.winners.map((p) => p.name).join(', '))} ชนะ`}</h2>
    <p class="lede">${esc(g.how)}</p><ol class="st">${rows}</ol>
    <div class="acts"><button class="btn" data-act="pickmaster">เปลี่ยน Master</button><button class="btn" data-act="close">ดูกระดาน</button><button class="btn primary" data-act="again">เล่นอีกครั้ง</button></div></div>`);
}

// ---------- clicks ----------
document.addEventListener('click', (ev) => {
  const t = ev.target.closest('[data-act]');
  if (!t) return;
  const act = t.dataset.act;
  const d = draft;
  switch (act) {
    case 'rules': showRules(); break;
    case 'new': case 'pickmaster': showStart(); break;
    case 'master': setup.master = t.dataset.m; showStart(); break;
    case 'start': case 'again': closeModal(); startGame(); break;
    case 'go': { closeModal(); const go = summonGo; summonGo = null; go?.(); break; }
    case 'go-summon': showSummon(summonGo); break;
    case 'back-start': showStart(); break;
    case 'close': closeModal(); break;
    case 'showover': showOver(); break;
    case 'skip': skip = true; closeModal(); if (wait?.kind === 'combatEnd') answer(null); render(); break;
    case 'skipall': skip = true; answer(null); break;
    case 'cont': if (wait?.kind === 'combatEnd') answer(null); break;
    case 'area': {
      const c = boardChoices()[t.dataset.to];
      if (!c) break;
      if (wait.kind === 'place') answer({ to: c.to });
      else answer({ to: c.to, how: c.how, cs4: d.cs4 });
      break;
    }
    case 'place': if (wait?.kind === 'place') answer({ to: t.dataset.to }); break;
    case 'move': if (wait?.kind === 'move') answer({ to: t.dataset.to, how: t.dataset.how, cs4: d.cs4 }); break;
    case 'pick': {
      if (wait?.kind !== 'cards') break;
      const uid = +t.dataset.uid;
      const p = me();
      info = allCards(p).find((c) => c.uid === uid) || null;
      if (!wait.ctx.field) {
        d.ids = d.ids.includes(uid) ? d.ids.filter((x) => x !== uid) : [...d.ids, uid].slice(-2);
      } else if (d.ids.includes(uid)) {
        d.ids = d.ids.filter((x) => x !== uid);
        d.down = d.down.filter((x) => x !== uid);
        // dropping UBW also drops the deck cards it brought
        if (info?.fx?.ubw) d.ids = d.ids.filter((x) => !p.deck.some((c) => c.uid === x));
      } else {
        const test = g.cleanCards(p, { ...d, ids: [...d.ids, uid], cs4: d.cs4 && !wait.ctx.cs4used }, true);
        if (test.ids.includes(uid)) d.ids = [...d.ids, uid];
        else toast(`ลง ${cardName(info)} เพิ่มไม่ได้ · เต็มจำนวนหรือมานาไม่พอ เอาใบอื่นออกก่อน`, '');
      }
      render();
      break;
    }
    case 'flip': {
      const uid = +t.dataset.uid;
      d.down = d.down.includes(uid) ? d.down.filter((x) => x !== uid) : [...d.down, uid];
      render();
      break;
    }
    case 'cs4': d.cs4 = !d.cs4; render(); break;
    case 'step': { const k = t.dataset.key; d[k] = Math.max(0, (d[k] || 0) + +t.dataset.d); render(); break; }
    case 'moveTo': d.moveTo = t.dataset.to || null; render(); break;
    case 'reset': draft = firstDraft('cards', wait.ctx); info = null; render(); break;
    case 'swappick': { const uid = +t.dataset.uid; if (swapSel.has(uid)) swapSel.delete(uid); else swapSel.add(uid); render(); break; }
    case 'swap':
      if (wait && swapSel.size && g.useAbility(me(), { kind: 'gemSwap', ids: [...swapSel] })) {
        swapSel.clear();
        if (wait.kind === 'cards') { draft = firstDraft('cards', wait.ctx); info = null; }
      }
      render();
      break;
    case 'ab': if (wait?.kind === 'ability') answer({ kind: t.dataset.kind, to: t.dataset.to || undefined }); break;
    case 'abpass': if (wait?.kind === 'ability') answer({ kind: 'pass' }); break;
    case 'play': if (wait?.kind === 'cards') answer({ ...d, cs4: d.cs4 && !wait.ctx.cs4used }); break;
    case 'discard': if (wait?.kind === 'cards') answer({ ids: d.ids }); break;
    default: break;
  }
});
document.addEventListener('change', (ev) => {
  if (ev.target.id === 'mv-cs4' && wait?.kind === 'move') { draft.cs4 = ev.target.checked; render(); }
});
document.addEventListener('keydown', (ev) => {
  if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.matches?.('.area[data-act]')) { ev.preventDefault(); ev.target.click(); }
});

// first screen: an empty board behind the Master picker
g = new Game({ decide: () => new Promise(() => {}), onEvent: () => {}, humanMaster: setup.master });
render();
showStart();
