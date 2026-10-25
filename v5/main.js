// One-page UI for the v5.0 demo (the Dominate Grail War manual, one stage). The rules live in
// game.js; this file only draws the state and turns clicks into the answers game.decide() waits for.
// The board always fits the window. Tapping an area opens a pop-up with its details and the
// actions you can take there; what does not fit on the screen (event texts, your cards on a
// phone, the standings, the log) opens from a button. Counters show their current value only.
import {
  Game, AREAS, PATH, TYPES, MASTERS, TERRAIN, WORKSHOP, RECON_VP, SKILL_MANA, MANA_MAX, REGULAR, PLAY,
  CS_MANA, CS_POWER, CS_VP, STEP_COST, GEM_GAND, GEM_SWAP, TSUBAME, SAKURA_FROM,
} from './game.js';
import { botDecide } from './bot.js';
import { SV_ART, MAP_ART } from './art.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const PHASES = [['prep', 'เตรียมการ'], ['outpost', 'ตั้งมั่น'], ['action', 'ปฏิบัติการ'], ['combat', 'ต่อสู้'], ['end', 'จบรอบ']];
const BOT_DELAY = 260; // a short pause on each bot choice so the board can be followed
const SUN = '★';
const wide = () => window.matchMedia('(min-width: 1100px)').matches; // the side column fits

let g = null, wait = null, draft = null, skip = false, overShown = false, outShown = false, info = null, started = false;
let pop = null; // the open pop-up: { k: 'act' | 'opts' | 'area' | 'me' | 'rank' | 'log' | 'sit' | 'menu', f, min }
let popBack = null; // the action pop-up to return to after looking at something else
const swapSel = new Set(); // hand cards Rin marked for a jewel swap
const setup = { master: 'shirou' };

document.documentElement.style.setProperty('--map', `url("${MAP_ART.night}")`);

// ---------- game flow ----------
function startGame() {
  skip = false; overShown = false; outShown = false; wait = null; draft = null; info = null; started = true; logCount = 0; pop = null; popBack = null;
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
    if (skip || kind === 'combatEnd') return a;
    return new Promise((res) => setTimeout(() => res(a), BOT_DELAY));
  }
  if (kind === 'combatEnd' && skip) return null;
  return new Promise((res) => {
    wait = { kind, ctx, res };
    draft = firstDraft(kind, ctx);
    info = null;
    if (kind === 'cards') { pop = { k: 'act' }; popBack = null; } // playing cards is the action at your own area
    render();
    if (kind === 'combatEnd') showResults(ctx.results);
  });
}
function answer(v) {
  const w = wait; wait = null; draft = null; info = null; swapSel.clear();
  if (pop && ['act', 'opts', 'area'].includes(pop.k)) pop = null;
  popBack = null;
  closeSheet(); w.res(v); render();
}

function firstDraft(kind, ctx) {
  const me = g.human;
  if (kind === 'move') return { cs4: false };
  if (kind === 'cards' && !ctx.field) return { ids: [...me.hand].sort((a, b) => a.power - b.power).slice(0, PLAY).map((c) => c.uid) };
  if (kind === 'cards') {
    // start from what a bot would play, without Command Spells or a swap; the player can change everything
    const b = botDecide(g, me, 'cards', { ...ctx, noSwap: true, noCs: true }) || {};
    return { ids: b.ids || [], down: b.down || [], cs4: false, cs2: 0, gemMana: b.gemMana || 0, moveTo: null, csMove: null };
  }
  return {};
}

let queued = false;
function onEvent(e) {
  if (e.type === 'log' && ['death', 'reveal', 'grail'].includes(e.entry.cls) && !skip) toast(e.entry.text, e.entry.cls);
  later();
}
function later() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => { queued = false; render(); });
}
window.addEventListener('resize', later);

// ---------- small pieces ----------
const me = () => g.human;
const myTurn = () => !!wait && wait.kind !== 'combatEnd';
const seen = (p) => p.isHuman || p.revealed || g.over;
const svLabel = (p) => (seen(p) ? `${p.sv.cls} · ${p.sv.name}` : 'ชื่อจริงซ่อน');
function chip(p, extra = '') {
  const face = seen(p) ? `<img src="${SV_ART[p.sv.key]}" alt="">` : `<i>${esc(p.m.tok)}</i>`;
  const cls = `chip${p.isHuman ? ' me' : ''}${g.turn === p ? ' turn' : ''}${p.out ? ' out' : ''}`;
  return `<span class="${cls}" style="--c:${p.m.color}" title="${esc(`${p.m.name} · ${svLabel(p)}`)}">${face}<b>${esc(p.name)}${p.isHuman ? ' (คุณ)' : ''}</b>${extra}</span>`;
}
// a round Master piece for the board
function tok(p, note = '') {
  const cls = `tok${p.isHuman ? ' me' : ''}${g.turn === p ? ' turn' : ''}`;
  return `<span class="${cls}" style="--c:${p.m.color}" title="${esc(`${p.m.name}${p.isHuman ? ' (คุณ)' : ''}${note}`)}">${esc(p.m.tok)}</span>`;
}
const csDots = (n) => '◆'.repeat(Math.max(0, n)) || '–';

const TAG = {
  reveal: 'เปิดชื่อจริง', once: 'ครั้งเดียวต่อเกม', residual: 'ค้าง', petrify: 'ดวงตาศิลา', duel: '1 ต่อ 1 ชนะ',
  ruleBreaker: 'Rule Breaker', cancel: 'ยกเลิกผลคู่ต่อสู้', zeroOpp: (t) => `${TYPES[t]}คู่ต่อสู้ = 0`,
  ubw: 'ทั้งสำรับขึ้นมือ', riding: 'ลงเพิ่มกี่ใบก็ได้', move: 'ถอนตัวได้', bell: 'ย้าย + ยึดพื้นที่', guard: 'ชนิดพิเศษ',
  extra: 'ลงเพิ่ม 1 ใบ', sword: (n) => `ดาบ ${n}/3`, needMana: `มานา ${SKILL_MANA}+`, gand: 'อัญมณี 1',
  playVP: (n) => `ลงแล้ว +${n} VP`, win: (n) => `ชนะ +${n} VP`, perFoe: () => 'ชนะ +1 VP ต่อคู่ต่อสู้',
  godHand: (n) => `แพ้ได้ ${n} VP`, terrainMul: (n) => `พื้นที่ ×${n}`, mana: (n) => `ได้มานา +${n}`,
};
const tags = (c) => Object.entries(c.fx || {}).filter(([k]) => TAG[k]).map(([k, v]) => (typeof TAG[k] === 'function' ? TAG[k](v) : TAG[k]));
const cardName = (c) => c.name || `${TYPES[c.type]} ${c.power}`;
const clean = (t) => t.replace(/\s*\[(p\.\d+(–\d+)?|4G|GZ|NW|ฟามิซือ)\]/g, ''); // source tags belong to the paper, not the table
const cardText = (c) => (c.text ? clean(c.text) : [`${TYPES[c.type]} พลัง ${c.power} มานา ${c.mana}`, ...tags(c)].join(' · '));

// a card tile. o: { btn, act, sel, down, back, lock, power, cost, mini, sm, note }
function tile(c, o = {}) {
  const size = o.mini ? ' mini' : o.sm ? ' sm' : '';
  if (o.back) return `<div class="card back${size}" title="การ์ดคว่ำ"><span class="ty">คว่ำ</span><span class="pw">?</span></div>`;
  const down = o.down ?? c.down;
  const cls = ['card', `t${c.type}`, c.skill ? 'skill' : '', c.keep || c.special ? 'sp' : '', o.sel ? 'sel' : '', down ? 'down' : '', o.lock ? 'lock' : '', c.gone ? 'gone' : '', c.resident ? 'res' : ''].filter(Boolean).join(' ') + size;
  const pw = o.power ?? c.power;
  const up = pw > c.power ? `<sup>+${pw - c.power}</sup>` : '';
  const fx = o.note ?? (c.gone ? 'ใช้แล้ว' : c.resident ? 'ค้างอยู่' : tags(c).slice(0, 2).join(' · '));
  const body = `<span class="ty">${down ? 'คว่ำ · ' : ''}${TYPES[c.type]}</span><span class="pw">${down ? 0 : Math.min(pw, c.power)}${down ? '' : up}</span>`
    + `<span class="mn" title="มานา">${o.cost ?? c.mana}</span>`
    + `<span>${c.name ? `<span class="nm">${esc(c.name)}</span>` : ''}${fx ? `<span class="fx">${esc(fx)}</span>` : ''}</span>`;
  const title = esc(cardText(c));
  if (o.btn) return `<button class="${cls}" data-act="${o.act || 'pick'}" data-uid="${c.uid}" title="${title}" aria-pressed="${!!o.sel}">${body}</button>`;
  return `<div class="${cls}" title="${title}">${body}</div>`;
}

const bonusOf = (f) => AREAS[f].bonus + g.sfx('bonusUp');
function prizeText(f) {
  if (!g.evs[f].length) return '';
  if (f === 'shinto' && !g.shintoOpen) return `อีเวนต์คว่ำ · ชนะได้ VP การ์ด + ${bonusOf(f)}`;
  return `คนเดียว ${g.eventVP(f)} VP · ชนะคู่ต่อสู้ ${g.fieldVP(f)} VP`;
}

// who would be out if the cut happened now (paper section 12)
function cutInfo() {
  if (g.over || !g.round) return null;
  const left = [...g.alive()].sort((a, b) => b.vp - a.vp);
  const climax = g.climax();
  const target = !climax ? (left.length >= 5 ? 4 : left.length - 1) : g.sit?.size === 2 ? 1 : 2;
  if (left.length <= target) return null;
  const line = left[target].vp;
  return { target, line, when: climax ? `จบไคลแมกซ์ ${g.climaxNo()}` : `จบรอบ ${REGULAR}`, allOut: !left.some((p) => p.vp > line), show: climax || g.round >= 6 };
}

function roundLabel() {
  if (!g.round) return 'ก่อนเริ่มเกม';
  return g.climax() ? `ไคลแมกซ์ ${g.climaxNo()} · รอบ ${g.round}` : `รอบ ${g.round}/${REGULAR}`;
}
const phaseName = () => (g.phase && !g.over ? PHASES.find(([k]) => k === g.phase)?.[1] || '' : '');

// ---------- drawing ----------
function render() {
  if (!g) return;
  drawHud();
  drawBar();
  drawBoard();
  drawDock();
  drawStandings();
  drawLog();
  drawNav();
  drawPop();
  if (me().out && !outShown && !g.over) { outShown = true; showOut(); }
  if (g.over && !overShown && !wait) { overShown = true; showOver(); }
}

function drawHud() {
  const steps = PHASES.map(([k, t]) => `<li class="${g.phase === k && !g.over ? 'now' : ''}">${t}</li>`).join('');
  const p = me();
  const stats = started ? `<div class="mystat" aria-label="ของคุณ"><span class="m">มานา <b>${p.mana}</b></span><span class="c" title="Command Spell">◆ <b>${p.cs}</b></span><span class="v"><b>${p.vp}</b> VP</span></div>` : '';
  const ph = phaseName();
  $('#hud').innerHTML = `<span class="crest">DOMINATE GRAIL WAR</span>
    <div class="track"><b class="rl">${esc(roundLabel())}${ph ? `<span class="ph"> · ${ph}</span>` : ''}</b><ol class="steps" aria-label="ขั้นของรอบ">${steps}</ol></div>
    ${stats}
    <div class="hud-btns"><button class="btn sm ghost w-only" data-act="rules">กติกา</button><button class="btn sm ghost w-only" data-act="new">เกมใหม่</button><button class="btn sm ghost n-only" data-act="pop" data-k="menu">เมนู</button></div>`;
}

// one status line: whose turn it is and what to do; pop-ups open from here too
function orderToks() {
  const ord = g.order();
  const done = (p) => (g.phase === 'outpost' ? p.at != null : g.phase === 'action' ? ord.indexOf(p) < ord.indexOf(g.turn) : false);
  return `<span class="order" aria-label="ลำดับเล่น">${ord.map((p) => `<span class="${done(p) ? 'done' : ''}">${tok(p)}</span>`).join('')}</span>`;
}
function drawBar() {
  const el = $('#bar');
  const p = me();
  let html;
  if (!started) html = '<span class="dim">เลือก Master เพื่อเริ่มสงคราม</span>';
  else if (g.over) {
    html = `<span class="who">GAME OVER</span><b>${esc(g.winner ? `${g.winner.name} ชนะสงครามจอกศักดิ์สิทธิ์` : 'ไม่มีผู้ชนะ')}</b>
      <span class="acts"><button class="btn sm" data-act="showover">ดูอันดับ</button><button class="btn sm primary" data-act="again">เล่นอีกครั้ง</button></span>`;
  } else if (myTurn()) {
    const k = wait.kind;
    const what = k === 'place' ? 'ตั้งมั่น · วางหมาก' : k === 'move' ? 'ปฏิบัติการ · ย้ายหรืออยู่ที่เดิม' : wait.ctx.field ? `ลงการ์ดที่${AREAS[p.at].name}` : `ทิ้งการ์ดคว่ำ ${Math.min(PLAY, p.hand.length)} ใบ`;
    const hint = k === 'cards' ? '' : '<span class="hint">แตะพื้นที่ที่เรืองแสงบนกระดาน</span>';
    const cs4 = k === 'move' && p.cs > 0 && p.mana < MANA_MAX
      ? `<button class="btn sm${draft.cs4 ? ' on' : ''}" data-act="mvcs4" aria-pressed="${!!draft.cs4}">◆ มานา +${CS_MANA} ก่อนย้าย</button>` : '';
    const btn = k === 'cards' ? `<button class="btn sm primary" data-act="openact">${wait.ctx.field ? 'เปิดหน้าลงการ์ด' : 'เปิดหน้าทิ้งการ์ด'}</button>` : '<button class="btn sm" data-act="pop" data-k="opts">ดูตัวเลือกทั้งหมด</button>';
    html = `<span class="yourturn">ตาของคุณ</span><b>${esc(what)}</b>${hint}<span class="acts">${cs4}${btn}</span>`;
  } else {
    const t = g.turn;
    const what = !g.round ? 'กำลังเรียก Servant…' : t ? `${t.name} กำลังเลือก` : g.phase === 'combat' ? 'กำลังตัดสินผลการต่อสู้' : 'กำลังเตรียมรอบ';
    html = `<span class="who">${p.out ? 'คุณตกรอบแล้ว' : 'รอคู่แข่ง'}</span><b>${esc(what)}</b>${g.round ? orderToks() : ''}
      ${p.out && !skip ? '<span class="acts"><button class="btn sm" data-act="skip">ข้ามไปผลสุดท้าย</button></span>' : ''}`;
  }
  el.classList.toggle('act', myTurn());
  el.innerHTML = html;
}

// which board areas the human can choose right now
function boardChoices() {
  if (!wait) return {};
  const out = {};
  if (wait.kind === 'place') for (const k of wait.ctx.opts) out[k] = true;
  if (wait.kind === 'move') for (const o of moveOpts()) out[o.to] = true;
  if (wait.kind === 'cards') out[me().at] = true;
  return out;
}
const moveOpts = () => g.moveOptions(me(), Math.min(MANA_MAX, me().mana + (draft?.cs4 ? CS_MANA : 0)), me().cs - (draft?.cs4 ? 1 : 0));

function drawBoard() {
  const can = boardChoices();
  const arrow = (i) => {
    const kz = me().m.key === 'kuzuki' && i === 0 && started;
    return `<div class="arrow a${i + 1}" aria-hidden="true"><i>➜</i><span class="cost" title="${kz ? 'คุซุกิเดินช่องนี้ฟรี' : 'มานาที่ใช้เดิน'}">${kz ? 0 : STEP_COST[i]}</span></div>`;
  };
  $('#board').innerHTML = `${sitLine()}
    <div class="map">${workshop(can)}${arrow(0)}${field('miyama', can)}${arrow(1)}${field('shinto', can)}${arrow(2)}${recon(can)}</div>
    ${strip()}${handStrip()}`;
}

// the situation card in one line; the full text opens from it
function sitLine() {
  const s = g.sit;
  const body = s
    ? `<span class="lab">สถานการณ์</span><b>${esc(s.name)}</b><span class="mana">จ่ายมานา +${s.mana}</span><span class="rule">${esc(s.text)}</span>`
    : '<span class="lab">สถานการณ์</span><span class="rule">เปิดรอบละใบตอนเตรียมการ</span>';
  return `<button class="sit${g.climax() ? ' climax' : ''}" data-act="pop" data-k="sit">${body}<span class="more">ดูเพิ่ม</span></button>`;
}

// every Master still in the war, ranked by VP, with the cut line (phones; the side shows it on a computer)
function strip() {
  if (!started) return '';
  const alive = [...g.alive()].sort((a, b) => b.vp - a.vp);
  const cut = cutInfo();
  const line = cut?.show && !cut.allOut ? alive.findIndex((p) => p.vp <= cut.line) : -1;
  let s = '';
  alive.forEach((p, i) => {
    if (i === line) s += '<i class="cut" title="เส้นตัด"></i>';
    s += `<span class="sp${p.isHuman ? ' me' : ''}">${tok(p, ` · ${p.vp} VP`)}<b>${p.vp}</b></span>`;
  });
  return `<button class="strip" data-act="pop" data-k="rank" aria-label="อันดับ VP ของทุกคน"><span class="lab">VP</span>${s}</button>`;
}

// your cards along the bottom of the board (computer; phones open them from a button)
function handStrip() {
  if (!started) return '';
  const p = me();
  const hand = p.hand.map((c) => tile(c, { sm: true })).join('') + p.specials.map((c) => tile(c, { sm: true, note: specialNote(c) })).join('');
  const skills = p.skills.map((c) => tile(c, { sm: true, note: skillNote(c), lock: skillLocked(c) })).join('');
  return `<div class="hand"><span class="lab">การ์ดของคุณ</span><div class="cards">${hand || '<span class="dim">ยังไม่มีการ์ด</span>'}</div><i class="sep"></i><div class="cards">${skills}</div></div>`;
}
const skillNote = (c) => {
  const p = me();
  if (c.gone) return 'ใช้แล้ว · ครั้งเดียว';
  if (c.resident) return c.residentFrom > g.round ? 'ค้าง · มีผลรอบหน้า' : 'ค้างอยู่';
  if (p.uses[c.name]) return 'ใช้แล้ว · หงายไว้';
  return g.round && !g.over ? g.skillState(p, c) || 'พร้อมใช้' : 'คว่ำไว้';
};
const skillLocked = (c) => !c.gone && !c.resident && !!(g.round && !g.over && g.skillState(me(), c));
const specialNote = (c) => (g.round && !g.over ? g.specialState(me(), c) || 'การ์ดพิเศษ' : 'การ์ดพิเศษ');

function areaAttrs(k, can) {
  return ` data-act="area" data-to="${k}" role="button" tabindex="0" aria-label="${esc(`${AREAS[k].name}${can[k] ? ' · เลือกได้' : ''} · ดูรายละเอียด`)}"`;
}
const areaCls = (k, can) => `${can[k] ? ' can' : ''}${me().at === k && !me().out && started ? ' here' : ''}`;

function workshop(can) {
  const here = g.here('workshop');
  const kz = me().m.key === 'kuzuki' && started;
  const slots = WORKSHOP.map((n, i) => {
    const p = here.find((q) => q.slot === i);
    return `<span class="slot${p ? ' full' : ''}">${p ? tok(p) : ''}<i>+${n}</i></span>`;
  }).join('');
  return `<div class="area ws${areaCls('workshop', can)}"${areaAttrs('workshop', can)}>
    <div class="ah"><h3>${AREAS.workshop.name}</h3><span class="kind">รับ 4 คน</span></div>
    <div class="slots">${slots}</div><span class="rule">${kz ? 'คุณได้ VP ตามช่องแทนมานา' : 'ได้มานาตามช่อง'}</span></div>`;
}

function recon(can) {
  const p = g.here('recon')[0];
  return `<div class="area rc${areaCls('recon', can)}"${areaAttrs('recon', can)}>
    <div class="ah"><h3>${AREAS.recon.name}</h3><span class="kind">รับ 1 คน</span></div>
    <div class="slots"><span class="slot${p ? ' full' : ''}">${p ? tok(p) : '<i>ว่าง</i>'}</span></div>
    <span class="prize">ย้ายเข้า <b>+${RECON_VP} VP</b></span><span class="rule">ตั้งมั่นวางไม่ได้</span></div>`;
}

// a Master on a battlefield: piece, advantage token and power once the cards are down
function occ(p) {
  const note = `${p.terrain ? ` · ได้เปรียบ +${p.terrain}` : ''}${p.play ? ` · พลัง ${p.play.pre}` : ''}`;
  return `<span class="occ${p.play ? ' played' : ''}">${tok(p, note)}${p.terrain ? `<i class="tr">+${p.terrain}</i>` : ''}${p.play ? `<b class="pw">${p.play.pre}</b>` : ''}</span>`;
}
function field(f, can) {
  const A = AREAS[f];
  const here = g.here(f);
  const early = !g.round || g.phase === 'prep' || g.phase === 'outpost';
  const free = early ? TERRAIN.filter((_, i) => !here.some((q) => q.slot === i)).map((t) => `<span class="slot"><i>+${t}</i></span>`).join('') : '';
  const engaged = g.phase === 'action' && g.engagedAt(f) ? '<span class="tag-engaged" title="มี 2 คนขึ้นไป เดินออกตามปกติไม่ได้">ติดพัน</span>' : '';
  const vp = g.evs[f].length ? `<span class="prize">${f === 'shinto' && !g.shintoOpen ? `ชนะ <b>VP การ์ด + ${bonusOf(f)}</b>` : `ชนะ <b>${g.fieldVP(f)} VP</b> · คนเดียว ${g.eventVP(f)}`}</span>` : '';
  return `<div class="area field f-${f}${areaCls(f, can)}${here.length >= 3 ? ' crowd' : ''}${here.length >= 4 ? ' packed' : ''}"${areaAttrs(f, can)}>
    <div class="ah"><h3>${A.name}</h3><span class="kind">สนามรบ</span>${engaged}</div>
    <div class="evs">${evCards(f, true)}</div>${vp}
    <div class="slots">${here.map(occ).join('')}${free}</div></div>`;
}

// event cards of a battlefield: Miyama face up, Shinto face down until the action phase [p.3]
function evCards(f, onBoard) {
  const hidden = f === 'shinto' && !g.shintoOpen;
  if (!g.evs[f].length) return `<div class="ev empty">การ์ดอีเวนต์วางตอนเตรียมการ</div>`;
  return g.evs[f].map((e) => (hidden
    ? `<div class="ev back"><b>อีเวนต์คว่ำ</b><small>เปิดตอนปฏิบัติการ</small></div>`
    : `<div class="ev"${onBoard ? ` title="${esc(e.text)}"` : ''}><span class="vpc">${e.vp}</span><span class="tx"><b>${esc(e.name)}</b><small>${esc(e.text)}</small></span></div>`)).join('');
}

function drawNav() {
  $('#nav').innerHTML = started
    ? `<button class="btn" data-act="pop" data-k="me">การ์ดของคุณ</button><button class="btn" data-act="pop" data-k="rank">อันดับ</button><button class="btn" data-act="pop" data-k="log">บันทึก</button>`
    : '';
}

// ---------- the side (computer): you, every Master, the log ----------
function meHead(p) {
  return `<div class="me-head"><img src="${SV_ART[p.sv.key]}" alt=""><div class="nm"><b>${esc(p.m.name)} <small>(คุณ) · ระดับ${esc(p.m.level)}</small></b>
    <small>${esc(p.sv.cls)} · ${esc(p.sv.name)} · ${p.revealed ? '<span class="open">ชื่อจริงเปิดแล้ว</span>' : 'ชื่อจริงซ่อน'}</small></div>${p.out ? '<span class="bad">ตกรอบ</span>' : ''}</div>`;
}
function meStats(p) {
  const seals = Array.from({ length: 3 }, (_, i) => `<i class="seal${i < p.cs ? ' on' : i >= p.m.cs ? ' gone' : ''}" title="${i < p.cs ? 'ใช้ได้' : i >= p.m.cs ? 'ขาดตั้งแต่เริ่ม' : 'ใช้แล้ว'}">◆</i>`).join('');
  return `<div class="me-stats"><span>มานา <b class="m">${p.mana}</b><small>/${MANA_MAX}</small></span><span>Command Spell <span class="seals">${seals}</span></span><span><b class="v">${p.vp}</b> VP</span>${p.m.key === 'rin' ? `<span>อัญมณี <b class="gm">${p.gems}</b></span>` : ''}</div>`;
}
function mePiles(p) {
  const last = p.trash[p.trash.length - 1];
  return `<p class="me-piles">สำรับ ${p.deck.length} ใบ · กองทิ้ง ${p.trash.length} ใบ${last ? ` · ล่าสุด ${last.down ? 'คว่ำ · ' : ''}${esc(cardName(last))}` : ''}</p>`;
}
function drawDock() {
  if (!started) { $('#dock').innerHTML = '<p class="dim">เลือก Master แล้วข้อมูลของคุณจะอยู่ตรงนี้</p>'; return; }
  const p = me();
  $('#dock').innerHTML = `${meHead(p)}${meStats(p)}<div class="me-row">${mePiles(p)}<button class="btn sm ghost" data-act="pop" data-k="me">กระดาน Master</button></div>`;
}

function topTrash(p) {
  const c = p.trash[p.trash.length - 1];
  if (!c) return 'ว่าง';
  if (c.down && !p.isHuman) return 'คว่ำ';
  return `${c.down ? 'คว่ำ · ' : ''}${cardName(c)}`;
}
function standingsHtml() {
  const alive = [...g.alive()].sort((a, b) => b.vp - a.vp);
  const out = g.players.filter((p) => p.out).sort((a, b) => b.outRound - a.outRound || b.vp - a.vp);
  const cut = cutInfo();
  const sun = g.order()[0];
  const line = cut?.show && !cut.allOut ? alive.findIndex((p) => p.vp <= cut.line) : -1;
  const row = (p, i) => {
    const used = p.skills.filter((c) => p.uses[c.name]).map((c) => c.name);
    return `<li class="${p.isHuman ? 'me' : ''}${p.out ? ' out' : ''}" title="${esc(`ทิ้งล่าสุด: ${topTrash(p)}`)}"><span class="rk">${p.out ? '✖' : i + 1}</span>
      <span class="who">${chip(p, p === sun && !p.out && !g.over ? `<span class="t" title="ผู้เริ่มรอบนี้">${SUN}</span>` : '')}</span>
      <span class="mini">มานา <span class="m">${p.mana}</span> <span class="cs" title="Command Spell">${csDots(p.cs)}</span></span><span class="vp">${p.vp}</span>
      <span class="pub">${p.m.key === 'rin' ? `อัญมณี ${p.gems} · ` : ''}${p.out ? `ตกรอบหลังรอบ ${p.outRound}` : p.at ? esc(AREAS[p.at].name) : 'ยังไม่วางหมาก'} · <span class="sv">${esc(svLabel(p))}</span>${used.length ? ` · NP หงาย: ${esc(used.join(', '))}` : ''}</span></li>`;
  };
  let rows = '';
  alive.forEach((p, i) => { if (i === line) rows += `<li class="cutline">เส้นตัด ${cut.target} คน · ใต้เส้นตกรอบถ้า${cut.when}ตอนนี้</li>`; rows += row(p, i); });
  rows += out.map((p) => row(p, 0)).join('');
  const sub = g.over ? 'จบเกม' : cut?.show && cut.allOut ? 'ทุกคนเสมอที่เส้นตัด จะไม่มีใครออก' : !g.climax() ? `จบรอบ ${REGULAR} เหลือ 4 คน · เสมอที่เส้นตัดออกหมด` : 'คัดออกจนเหลือคนสุดท้าย';
  return { sub, html: `<ol class="st">${rows}</ol>` };
}
function drawStandings() {
  if (!wide()) return;
  const s = standingsHtml();
  $('#standings').innerHTML = `<div class="st-head"><h2>อันดับ VP</h2><button class="btn ghost" data-act="pop" data-k="rank">ดูเพิ่ม</button><small>${s.sub}</small></div>${s.html}`;
}

let logCount = 0;
const logHtml = () => g.logs.map((l) => `<p class="${l.cls}">${esc(l.text)}</p>`).join('');
function drawLog() {
  const el = $('#log');
  if (!wide() || (g.logs.length === logCount && el.childElementCount)) return;
  const nearEnd = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  el.innerHTML = logHtml();
  logCount = g.logs.length;
  if (nearEnd || logCount < 5) el.scrollTop = el.scrollHeight;
}

function toast(text, cls) {
  const el = document.createElement('div');
  el.className = `toast ${cls}`;
  el.textContent = text;
  $('#toasts').append(el);
  setTimeout(() => el.remove(), 4200);
  while ($('#toasts').childElementCount > 3) $('#toasts').firstElementChild.remove();
}

// ---------- pop-ups ----------
// The frame of a pop-up is built once when it opens; later renders only replace the parts whose
// content changed, so the window stays put (no re-opening) while you pick cards. Folded, it
// shrinks to its title bar at the bottom and the board can be used again.
function drawPop() {
  const el = $('#pop');
  const b = pop && started ? popBody() : null;
  if (!b) {
    if (pop && started) pop = null;
    el.hidden = true; el.innerHTML = ''; delete el.dataset.k; el.classList.remove('min');
    return;
  }
  const key = `${pop.k}:${pop.f || ''}`;
  let dlg = el.querySelector('.pop-dlg');
  if (el.dataset.k !== key || !dlg) {
    el.innerHTML = `<div class="pop-dlg" role="dialog"><div class="pop-head"><div class="pop-title"><h2></h2><span class="sub"></span><span class="mini"></span></div>
      <button class="x fold" data-act="popmin"></button><button class="x" data-act="popclose" aria-label="ปิด">✕</button></div><div class="pop-body"></div><div class="pop-foot"></div></div>`;
    el.dataset.k = key;
    dlg = el.querySelector('.pop-dlg');
    drawPop.last = {};
  }
  const last = drawPop.last;
  const set = (sel, html) => { if (last[sel] !== html) { last[sel] = html; dlg.querySelector(sel).innerHTML = html; } };
  const body = dlg.querySelector('.pop-body');
  const top = body.scrollTop;
  const nearEnd = body.scrollHeight - body.scrollTop - body.clientHeight < 60;
  const min = !!pop.min;
  el.classList.toggle('min', min);
  dlg.classList.toggle('wide', !!b.wide);
  dlg.setAttribute('aria-modal', String(!min));
  dlg.setAttribute('aria-label', b.title);
  set('h2', esc(b.title));
  set('.sub', b.sub || '');
  set('.mini', b.mini || '');
  set('.pop-body', b.html);
  set('.pop-foot', b.foot || '');
  dlg.querySelector('.pop-foot').hidden = !b.foot;
  const fold = dlg.querySelector('.fold');
  fold.textContent = min ? '▴' : '▾';
  fold.title = min ? 'ขยายหน้าต่าง' : 'พับหน้าต่าง';
  fold.setAttribute('aria-label', fold.title);
  el.hidden = false;
  if (min) return;
  if (pop.scroll != null) { body.scrollTop = pop.scroll; pop.scroll = null; } // back from folded
  else body.scrollTop = pop.k === 'log' && nearEnd ? body.scrollHeight : top;
}
function foldPop(on) {
  if (!pop) return;
  if (on) pop.scroll = $('#pop .pop-body')?.scrollTop ?? 0;
  pop.min = on;
  render();
}
// open another pop-up; an action pop-up waits behind it and comes back when that one closes
function openPop(next) {
  if (pop && ['act', 'opts'].includes(pop.k) && !['act', 'opts'].includes(next.k)) popBack = { ...pop, scroll: pop.min ? pop.scroll : $('#pop .pop-body')?.scrollTop };
  pop = next;
  render();
}
function closePop() {
  pop = popBack;
  popBack = null;
  render();
}

function popBody() {
  const k = pop.k;
  if (k === 'act') return myTurn() && wait.kind === 'cards' ? (wait.ctx.field ? cardsPop() : discardPop()) : null;
  if (k === 'opts') return myTurn() && wait.kind === 'place' ? placeOpts() : myTurn() && wait.kind === 'move' ? moveOptsPop() : null;
  if (k === 'area') return areaPop(pop.f);
  if (k === 'me') return mePop();
  if (k === 'rank') { const s = standingsHtml(); return { title: 'อันดับ VP ของทุกคน', sub: esc(s.sub), html: s.html }; }
  if (k === 'log') return { title: 'บันทึกสงคราม', html: `<div class="loglist">${logHtml()}</div>` };
  if (k === 'sit') return sitPop();
  if (k === 'menu') return { title: 'เมนู', html: '<div class="menu"><button class="btn" data-act="rules">กติกา</button><button class="btn" data-act="new">เกมใหม่ · เปลี่ยน Master</button></div>' };
  return null;
}

function sitPop() {
  const s = g.sit;
  const cut = cutInfo();
  const left = REGULAR - Math.min(g.round, REGULAR);
  const ev = (f) => `<div class="pop-sec"><p class="row-lab">อีเวนต์${AREAS[f].name}</p><div class="evlist">${evCards(f, false)}</div></div>`;
  return {
    title: s ? s.name : 'การ์ดสถานการณ์',
    sub: s ? `${esc(roundLabel())} · จ่ายมานา +${s.mana}` : '',
    html: `${s ? `<p class="lede">${esc(s.text)}</p>` : '<p class="lede">เปิดรอบละใบตอนเตรียมการ</p>'}
      <p class="p-text">กองสถานการณ์เหลือ ${left} ใบ · ไคลแมกซ์ 3 ใบแยกไว้ · กองอีเวนต์เหลือ ${g.evDeck.length} ใบ (ใช้แล้ว ${g.evUsed.length})</p>
      ${cut?.show ? `<p class="p-text warnline">${cut.allOut ? 'ทุกคนเสมอที่เส้นตัด ถ้าคัดตอนนี้จะไม่มีใครออก' : `ถ้าคัดตอนนี้ (${cut.when} เหลือ ${cut.target} คน) คนที่มี ${cut.line} VP ลงไปตกรอบ`}</p>` : ''}
      ${ev('miyama')}${ev('shinto')}`,
  };
}

// an area: its details, who is there, and what you can do there right now
function areaPop(f) {
  const A = AREAS[f];
  const p = me();
  const here = g.here(f);
  const i = PATH.indexOf(f);
  const next = PATH[i + 1];
  const kz = p.m.key === 'kuzuki' && i === 0;
  let html = '';
  if (A.field) {
    html += `<div class="evlist">${evCards(f, false)}</div>`;
    if (g.evs[f].length) html += `<p class="p-text">${esc(prizeText(f))} · แพ้ไม่เสียอะไร</p>`;
    html += `<p class="p-text">ได้เปรียบพื้นที่: คนแรกที่วางตอนตั้งมั่น +${TERRAIN[0]} · คนที่สอง +${TERRAIN[1]} · ย้ายออกแล้วหาย · มี 2 คนขึ้นไปติดพัน เดินออกตามปกติไม่ได้</p>`;
  } else if (f === 'workshop') {
    html += `<p class="p-text">${p.m.key === 'kuzuki' ? 'คุณ (Calm) ได้ VP ตามช่องแทนมานา' : 'วางตอนตั้งมั่นแล้วได้มานาตามช่อง'}: คนแรก +${WORKSHOP[0]} · คนต่อไป +${WORKSHOP[1]} · รับ 4 คน · ไม่ได้สู้ · ตอนปฏิบัติการเดินต่อไปได้</p>`;
  } else {
    html += `<p class="p-text">รับ 1 คน · ย้ายเข้าตอนปฏิบัติการได้ ${RECON_VP} VP ทันที · วางตอนตั้งมั่นไม่ได้ · ไม่ได้สู้</p>`;
  }
  if (next) html += `<p class="p-text">ทางออก: ไป${AREAS[next].name} มานา ${kz ? '0 (คุณเดินฟรี)' : STEP_COST[i]} · ทางเดียว</p>`;
  const rows = here.map((q) => {
    const cards = q.play ? q.play.cards.map((c) => (c.down && !q.isHuman ? tile(c, { back: true, mini: true }) : tile(c, { mini: true }))).join('') : '';
    return `<div class="foe">${chip(q)}<span>${q.terrain ? `ได้เปรียบ +${q.terrain}` : 'ไม่มีได้เปรียบ'}${q.play ? ` · พลัง <b class="pw">${q.play.pre}</b>` : ''}</span>${cards ? `<div class="cards">${cards}</div>` : ''}</div>`;
  }).join('');
  html += `<div class="pop-sec"><p class="row-lab">อยู่ที่นี่ ${here.length} คน</p>${rows ? `<div class="foes">${rows}</div>` : '<p class="p-text">ยังไม่มีใคร</p>'}</div>`;
  return { title: A.name, sub: A.field ? 'สนามรบ' : f === 'workshop' ? 'เก็บมานา' : 'เก็บ VP', mini: `อยู่ที่นี่ ${here.length} คน${A.field && g.evs[f].length ? ` · ${esc(prizeText(f))}` : ''}`, html, foot: areaActs(f) };
}

function areaActs(f) {
  if (!myTurn()) return '';
  const p = me();
  if (wait.kind === 'place') {
    if (!wait.ctx.opts.includes(f)) return '<span class="dim">ตอนนี้วางหมากที่นี่ไม่ได้</span>';
    return `<button class="btn primary" data-act="place" data-to="${f}">วางหมากที่นี่ · ${placeGain(f)}</button>`;
  }
  if (wait.kind === 'move') {
    const os = moveOpts().filter((o) => o.to === f);
    const cs4 = p.cs > 0 && p.mana < MANA_MAX ? `<label class="check"><input type="checkbox" id="mv-cs4"${draft.cs4 ? ' checked' : ''}> ◆ ใช้ Command Spell รับมานา +${CS_MANA} ก่อนย้าย</label>` : '';
    if (!os.length) return `${cs4}<span class="dim">ตอนนี้ไปที่นี่ไม่ได้ (ทางเดียว มานาไม่พอ หรือเต็ม)</span>`;
    return `${cs4}<div class="acts">${os.map((o) => moveBtn(o, true)).join('')}</div>`;
  }
  if (wait.kind === 'cards' && f === p.at) return `<button class="btn primary" data-act="openact">${wait.ctx.field ? 'ลงการ์ดที่นี่' : 'ทิ้งการ์ดคว่ำ'}</button>`;
  return '';
}

function placeGain(k) {
  const p = me();
  const here = g.here(k);
  if (k === 'workshop') { const n = WORKSHOP[here.length]; return p.m.key === 'kuzuki' ? `${n} VP` : `มานา +${Math.min(n, MANA_MAX - p.mana)}`; }
  const t = here.length < TERRAIN.length ? TERRAIN[here.length] : 0;
  return t ? `ได้เปรียบ +${t}` : 'ไม่มีได้เปรียบ';
}

function placeOpts() {
  const p = me();
  const opts = wait.ctx.opts.map((k) => {
    const here = g.here(k);
    let sub;
    if (k === 'workshop') {
      const res = p.skills.find((c) => c.resident && c.fx.workshopVP && c.residentFrom <= g.round);
      sub = `<span>ช่อง ${here.length + 1} · <span class="gain">${placeGain(k)}${p.m.key === 'kuzuki' ? ' (Calm)' : ''}</span>${res ? ` · ${esc(res.name)} +${res.fx.workshopVP} VP` : ''}</span><span>ไม่ได้สู้ · ตอนปฏิบัติการเดินต่อไปได้</span>`;
    } else {
      sub = `<span><span class="gain">${placeGain(k)}</span>${k === 'miyama' && p.m.key === 'shinji' ? ' · มานา +1' : ''} · ${esc(prizeText(k))}</span><span>${here.length ? `อยู่แล้ว: ${here.map((q) => esc(q.name)).join(', ')}` : 'ยังไม่มีใคร'}</span>`;
    }
    return `<button class="opt" data-act="place" data-to="${k}"><b>${esc(AREAS[k].name)}</b>${sub}</button>`;
  }).join('');
  return { title: 'ตั้งมั่น · วางหมาก Master', sub: 'โรงฝึกเวทให้มานา · สนามรบให้ได้เปรียบพื้นที่ 2 คนแรก · ลาดตระเวนวางตอนนี้ไม่ได้', mini: 'ตาของคุณ · เลือกจุดวางหมาก', html: `<div class="opts">${opts}</div>` };
}

function moveBtn(o, short) {
  const p = me();
  const A = AREAS[o.to];
  const fieldTxt = (k) => {
    const foes = g.here(k).filter((q) => q !== p);
    return foes.length ? `สู้กับ ${foes.map((q) => esc(q.name)).join(', ')} · ${esc(prizeText(k))}` : `ยังไม่มีคู่ต่อสู้ · ${esc(prizeText(k))}`;
  };
  const where = (k) => (AREAS[k].field ? fieldTxt(k) : k === 'recon' ? `ได้ ${RECON_VP} VP ทันที` : '');
  let b, sub;
  if (o.how === 'stay') { b = short ? 'อยู่ที่นี่' : `อยู่ที่${A.name}`; sub = A.field ? fieldTxt(o.to) : 'ไม่สู้ · ทิ้งการ์ดคว่ำ 2 ใบ'; }
  else if (o.how === 'walk') { b = short ? 'เดินมาที่นี่' : `เดินไป${A.name}`; sub = `<span class="gain">มานา ${o.cost}</span> · ${where(o.to)}${o.to === 'miyama' && p.m.key === 'shinji' ? ' · มานา +1' : ''}`; }
  else if (o.how === 'kirei') { b = 'Supervisor: ไปลาดตระเวน'; sub = `<span class="gain">มานา 2</span> · ไม่สนการติดพัน · ได้ ${RECON_VP} VP ทันที`; }
  else { b = short ? 'ย้ายมาด้วย Command Spell' : `ย้ายไป${A.name}`; sub = `Command Spell 1 ดวง · ไม่สนการติดพัน · ${where(o.to)}`; }
  return `<button class="opt${o.how === 'cs' ? ' cs' : ''}" data-act="move" data-to="${o.to}" data-how="${o.how}"><b>${esc(b)}</b><span>${sub}</span></button>`;
}

function moveOptsPop() {
  const p = me();
  const mana = Math.min(MANA_MAX, p.mana + (draft.cs4 ? CS_MANA : 0));
  const engaged = g.engagedAt(p.at) ? `<p class="p-text warnline">${esc(AREAS[p.at].name)}ติดพัน (มี 2 คนขึ้นไป) เดินออกตามปกติไม่ได้</p>` : '';
  return {
    title: 'ปฏิบัติการ · ย้ายหรืออยู่ที่เดิม',
    sub: `เดินตามลูกศรได้ทางเดียว จ่ายมานาตามลูกศร · มานาคุณ ${p.mana}${draft.cs4 ? ` → ${mana}` : ''}`,
    mini: `ตาของคุณ · มานา ${mana}`,
    html: `${engaged}${p.cs > 0 && p.mana < MANA_MAX ? `<label class="check"><input type="checkbox" id="mv-cs4"${draft.cs4 ? ' checked' : ''}> ◆ ใช้ Command Spell 1 ดวงรับมานา +${CS_MANA} ก่อนย้าย (สูงสุด ${MANA_MAX})</label>` : ''}
      <div class="opts">${moveOpts().map((o) => moveBtn(o, false)).join('')}</div>`,
  };
}

// Rin's jewel swap, in her own action turn before the cards are chosen
function swapBox() {
  const p = me();
  if (!g.canSwap(p)) return '';
  return `<div class="swap"><p class="row-lab">อัญมณี: แลกการ์ดในมือ · ใช้ ${GEM_SWAP} อัน รอบละครั้ง (เหลือ ${p.gems})</p><div class="cards">${p.hand.map((c) => tile(c, { btn: true, act: 'swappick', mini: true, sel: swapSel.has(c.uid) })).join('')}
    <button class="btn sm" data-act="swap"${swapSel.size ? '' : ' disabled'}>${swapSel.size ? `ทิ้ง ${swapSel.size} ใบ แล้วจั่วใหม่` : 'เลือกใบที่จะทิ้ง'}</button></div></div>`;
}

function discardPop() {
  const p = me();
  const ids = draft.ids;
  const n = Math.min(PLAY, p.hand.length);
  return {
    title: `ทิ้งการ์ดคว่ำ ${n} ใบ`,
    sub: `คุณอยู่${esc(AREAS[p.at].name)} ไม่ได้สู้ · ลงการ์ด ${PLAY} ใบแบบคว่ำไปกองทิ้ง ไม่เสียมานา · เก็บใบดีไว้รอบหน้า`,
    mini: `เลือกแล้ว ${ids.length}/${n} ใบ`,
    html: `<div class="cards">${p.hand.map((c) => tile(c, { btn: true, sel: ids.includes(c.uid) })).join('')}</div>${swapBox()}`,
    foot: `<span class="dim">เลือกแล้ว ${ids.length}/${n}</span><button class="btn primary" data-act="discard"${ids.length === n ? '' : ' disabled'}>ทิ้งการ์ดคว่ำ</button>`,
  };
}

const allCards = (p) => [...p.hand, ...p.skills, ...p.specials, ...p.deck];

// the play the engine would make from the draft, for the preview
function preview() {
  const p = me();
  const a = g.cleanCards(p, draft, true);
  const pool = allCards(p);
  const cards = a.ids.map((id) => { const c = pool.find((x) => x.uid === id); return { ...c, down: a.down.includes(id) }; });
  const dest = a.moveTo || a.csMove;
  const off = dest && !AREAS[dest].field;
  const f = dest && !off ? dest : p.at;
  const who = dest ? { ...p, terrain: 0 } : p; // the advantage stays behind
  const revealing = !p.revealed && (cards.some((c) => !c.down && c.fx?.reveal) || g.tsubame(cards));
  const pw = g.powerOf(who, { cards, cs2: a.cs2 }, { f });
  return { a, cards, pw, revealing, f, off, dest };
}

function cardsPop() {
  const p = me();
  const { a, cards, pw, revealing, f, off, dest } = preview();
  const mana = a.cs4 ? Math.min(MANA_MAX, p.mana + CS_MANA) : p.mana;
  const foes = g.here(p.at).filter((q) => q !== p).map((q) => `<div class="foe">${chip(q)}${q.play
    ? `<span>พลัง <b class="pw">${q.play.pre}</b></span><div class="cards">${q.play.cards.map((c) => (c.down ? tile(c, { back: true, mini: true }) : tile(c, { mini: true }))).join('')}</div>`
    : `<span>ยังไม่ลงการ์ด${q.terrain ? ` · ได้เปรียบ +${q.terrain}` : ''}</span>`}</div>`).join('');
  const sel = new Set(draft.ids);
  const down = new Set(draft.down);
  const ctx = { f };
  const pick = (c) => {
    const s = sel.has(c.uid);
    const isDown = s && down.has(c.uid);
    const t = tile(c, { btn: true, sel: s, down: isDown, power: g.cardPower(p, { ...c, down: false }, ctx) });
    const flip = s && g.canFlip(c) ? `<button class="flip${isDown ? ' down' : ''}" data-act="flip" data-uid="${c.uid}">${isDown ? 'คว่ำอยู่ · กดหงาย' : 'หงาย · กดคว่ำ'}</button>` : '';
    return `<div class="pickcol">${t}${flip}</div>`;
  };
  const locked = (c, why) => `<div class="pickcol">${tile(c, { lock: true, note: why })}</div>`;
  const skills = p.skills.map((c) => { const why = g.skillState(p, c, mana); return why ? locked(c, why) : pick(c); }).join('');
  const specials = p.specials.map((c) => { const why = g.specialState(p, c, mana); return why ? locked(c, why) : pick(c); }).join('');
  const ubw = cards.find((c) => c.fx?.ubw);
  const deckRow = ubw ? `<div class="pop-sec"><p class="row-lab">สำรับ (Unlimited Blade Works ลงการ์ดโจมตีได้ถึง ${ubw.fx.ubw} ใบ)</p><div class="cards">${p.deck.map((c) => pick(c)).join('')}</div></div>` : '';

  // Command Spells and jewels (paper section 10, Rin in section 5)
  const csLeft = p.cs - (a.cs4 ? 1 : 0);
  const ctrl = [];
  if (p.cs > 0 && p.mana < MANA_MAX) ctrl.push(`<button class="btn sm${draft.cs4 ? ' on' : ''}" data-act="cs4" aria-pressed="${!!draft.cs4}">◆ มานา +${CS_MANA} ก่อนจ่าย</button>`);
  if (csLeft > 0) ctrl.push(stepper('cs2', `◆ พลัง +${CS_POWER} (ชนะได้ VP +${CS_VP})`, a.cs2, csLeft));
  if (p.m.key === 'rin' && p.gems > 0) ctrl.push(stepper('gemMana', 'อัญมณีจ่ายแทนมานา', draft.gemMana || 0, p.gems - (a.gand ? GEM_GAND : 0)));
  const mover = cards.find((c) => !c.down && (c.fx?.bell || c.fx?.move));
  const dests = PATH.slice(1).filter((k) => k !== p.at && (k !== 'recon' || g.reconFree(p)));
  if (mover) ctrl.push(`<span class="stepper">${esc(mover.name)} ย้ายไป: ${['', ...dests].map((k) => `<button class="btn sm${(draft.moveTo || '') === k ? ' on' : ''}" data-act="moveTo" data-to="${k}">${k ? esc(AREAS[k].name) : 'ไม่ย้าย'}</button>`).join('')}</span>`);
  else if (csLeft - a.cs2 > 0) ctrl.push(`<span class="stepper">◆ หลังลงการ์ดย้ายไป: ${['', ...dests].map((k) => `<button class="btn sm${(draft.csMove || '') === k ? ' on' : ''}" data-act="csMove" data-to="${k}">${k ? esc(AREAS[k].name) : 'ไม่ย้าย'}</button>`).join('')}</span>`);

  // what the engine changed from the draft
  const notes = [];
  for (const id of a.ids) if (!sel.has(id)) notes.push(`เติม ${esc(cardName(cards.find((c) => c.uid === id)))} แบบคว่ำให้ครบ ${PLAY} ใบ`);
  for (const id of a.down) if (sel.has(id) && !down.has(id)) notes.push(`คว่ำ ${esc(cardName(cards.find((c) => c.uid === id)))} เพราะมานาไม่พอ`);
  for (const id of draft.ids) if (!a.ids.includes(id)) { const c = allCards(p).find((x) => x.uid === id); if (c) notes.push(`ไม่ได้ลง ${esc(cardName(c))} (เกินจำนวน มานาหรืออัญมณีไม่พอ)`); }
  if (g.tsubame(cards)) notes.push(`ลงดาบครบ 3 ใบ: Tsubame Gaeshi พลัง +${TSUBAME}`);
  if (revealing) notes.push(`ลงชุดนี้แล้วชื่อจริงจะเปิด: ${esc(p.sv.name)}`);
  if (dest) notes.push(off ? `ย้ายไป${esc(AREAS[dest].name)}หลังลงการ์ด: การ์ดลงกองทิ้ง ได้ ${RECON_VP} VP` : `ย้ายไป${esc(AREAS[dest].name)}หลังลงการ์ด: การ์ดตามไป ได้เปรียบพื้นที่เดิมหายไป`);
  if (a.ids.length && a.ids.every((id) => a.down.includes(id))) notes.push('คว่ำทั้ง 2 ใบ: พลังจากการ์ดเป็น 0 แต่ไม่เสียมานา');
  const left = mana - a.cost;
  const gemsLeft = p.gems - a.gemMana - (a.gand ? GEM_GAND : 0);
  const parts = pw.parts.filter(([, n]) => n).map(([t, n]) => `${esc(t)} ${n}`).join(' + ') || 'การ์ด 0';
  const infoLine = info ? `<div class="info"><b>${esc(cardName(info))}</b> · ${esc(cardText(info))}</div>` : '';
  const max = g.maxCards(p);

  return {
    title: `ลงการ์ดที่${AREAS[p.at].name}`,
    sub: `${esc(prizeText(p.at))}${prizeText(p.at) ? ' · ' : ''}เลือก ${max} ใบ${g.infinite(p) ? ' (Hidden Secret: มานาไม่จำกัด)' : ''} · หงาย = จ่ายมานาและมีพลัง · คว่ำ = พลัง 0 มานา 0 · NP/สกิลต้องมีมานา ${SKILL_MANA}+`,
    mini: `${off ? 'ย้ายไปลาดตระเวน' : `พลังรวม ${pw.total}`} · มานาเหลือ ${left} · เลือกแล้ว ${a.ids.length} ใบ`,
    wide: true,
    html: `${foes ? `<div class="foes">${foes}</div>` : '<p class="p-text">ยังไม่มีคู่ต่อสู้ที่นี่ (คนที่ยังไม่เล่นอาจย้ายเข้ามา)</p>'}
      <div class="cgroups"><div class="cg"><p class="row-lab">การ์ดในมือ${p.specials.length ? ' · การ์ดพิเศษสีเขียวอยู่ในมือตลอด' : ''}</p><div class="cards">${p.hand.map((c) => pick(c)).join('')}${specials}</div></div>
        <div class="cg"><p class="row-lab">การ์ด NP/สกิล · ${esc(p.sv.cls)}</p><div class="cards">${skills}</div></div></div>
      ${deckRow}${infoLine}${swapBox()}
      ${ctrl.length ? `<div class="ctrl"><span class="row-lab">Command Spell (เหลือ ${p.cs})</span>${ctrl.join('')}</div>` : ''}
      <div class="sum"><div class="parts">${parts}</div>${notes.map((n) => `<div class="warn">${n}</div>`).join('')}</div>`,
    foot: `<div class="tot"><span class="dim">พลังรวม${dest && !off ? `ที่${esc(AREAS[f].name)}` : ''}</span><b>${off ? '–' : pw.total}</b></div>
      <div class="num"><div>มานา ${mana} − ${a.cost} = <b style="color:var(--mana)">${left}</b></div><div class="dim">${p.m.key === 'rin' ? `อัญมณีเหลือ ${gemsLeft} · ` : ''}Command Spell เหลือ ${csLeft - a.cs2 - (a.csMove ? 1 : 0)}</div></div>
      <div class="acts"><button class="btn ghost" data-act="reset">ใช้ชุดที่แนะนำ</button><button class="btn primary" data-act="play">ลงการ์ด${off ? '' : ` · พลัง ${pw.total}`}</button></div>`,
  };
}

function stepper(key, label, v, max) {
  return `<span class="stepper"><span>${label}</span><button data-act="step" data-key="${key}" data-d="-1" aria-label="ลด"${v <= 0 ? ' disabled' : ''}>−</button><b>${v}</b><button data-act="step" data-key="${key}" data-d="1" aria-label="เพิ่ม"${v >= max ? ' disabled' : ''}>+</button></span>`;
}

// my Master board in full: tarot, abilities, resources, cards, piles (paper section 4.2)
function mePop() {
  const p = me();
  const hand = p.hand.map((c) => tile(c)).join('') + p.specials.map((c) => tile(c, { note: specialNote(c) })).join('');
  const skills = p.skills.map((c) => tile(c, { note: skillNote(c), lock: skillLocked(c) })).join('');
  const trash = p.trash.slice(-5).map((c) => tile(c, { mini: true })).join('') || '<span class="dim">ว่าง</span>';
  return {
    title: 'กระดาน Master ของคุณ',
    wide: true,
    html: `${meHead(p)}${meStats(p)}
      <div class="cgroups"><div class="cg"><p class="row-lab">การ์ดในมือ ${p.hand.length}${p.specials.length ? ' + การ์ดพิเศษ' : ''}</p><div class="cards">${hand || '<span class="dim">ยังไม่มีการ์ด</span>'}</div></div>
        <div class="cg"><p class="row-lab">การ์ด NP/สกิล · คว่ำจนกว่าจะใช้</p><div class="cards">${skills}</div></div></div>
      <div class="pop-sec"><p class="row-lab">ความสามารถ Master</p><ul class="abil">${p.m.abil.map(([t, d]) => `<li><b>${esc(t)}</b>${d ? `<span>${esc(d)}</span>` : ''}</li>`).join('')}</ul></div>
      <div class="pop-sec"><p class="row-lab">กองทิ้ง ${p.trash.length} ใบ · 5 ใบล่าสุด · วางตามด้านที่ลง คนอื่นเห็นแค่ใบหงาย · สำรับเหลือ ${p.deck.length} ใบ</p><div class="cards">${trash}</div></div>
      <p class="p-text">${p.revealed ? 'ไพ่ทาโรต์หงายแล้ว ทุกคนเห็นว่าคุณเป็นใคร' : 'ไพ่ทาโรต์คว่ำ คู่แข่งไม่รู้ว่าคุณเป็นใคร'}</p>`,
  };
}

// ---------- overlays ----------
function openModal(html) { $('#modal').innerHTML = html; $('#modal').hidden = false; }
function closeModal() { $('#modal').hidden = true; $('#modal').innerHTML = ''; }
function closeSheet() { $('#sheet').hidden = true; $('#sheet').innerHTML = ''; }

function showStart() {
  const ms = MASTERS.map((m) => `<button class="mcard${setup.master === m.key ? ' sel' : ''}" style="--c:${m.color}" data-act="master" data-m="${m.key}" aria-pressed="${setup.master === m.key}">
      <span class="en">${esc(m.en.toUpperCase())} · ระดับ${esc(m.level)}</span><b>${esc(m.name)}</b><span class="st2">มานาเริ่ม ${m.mana} · Command Spell ${m.cs}${m.gems ? ` · อัญมณี ${m.gems}` : ''}</span>
      <ul>${m.abil.map(([t, d]) => `<li>${esc(t)}${d ? `: ${esc(d)}` : ''}</li>`).join('')}</ul></button>`).join('');
  openModal(`<div class="dlg"><span class="eyebrow">เดโม 1 ด่าน · เมืองฟุยุกิ · กติกาตามคู่มือ</span><div class="title-crest">DOMINATE GRAIL WAR</div>
    <p class="lede">สงครามจอกศักดิ์สิทธิ์ 7 Master กับ 7 Servant ของ Fate/stay night · เก็บ VP 8 รอบ แล้วเข้าไคลแมกซ์ คนที่ VP น้อยถูกคัดออก 4 → 2 → 1 · คนสุดท้ายที่เหลือชนะ</p>
    <ol class="how"><li>ตั้งมั่น: วางหมากที่โรงฝึกเวทเพื่อเก็บมานา หรือที่สนามรบเพื่อรับได้เปรียบพื้นที่</li><li>ปฏิบัติการ: ย้ายตามลูกศร แล้วลงการ์ด 2 ใบ หงายเพื่อสู้ คว่ำเพื่อหลอก</li><li>มีมานา ${SKILL_MANA} ขึ้นไปใช้การ์ด NP/สกิลได้ · มานาสูงสุด ${MANA_MAX}</li><li>Command Spell 3 ดวง ใช้ในตาของตัวเอง: มานา +${CS_MANA} · พลัง +${CS_POWER} · ย้ายไม่สนติดพัน</li></ol>
    <h2>เลือก Master ของคุณ</h2><div class="masters">${ms}</div>
    <p class="lede">Servant สุ่มให้ และเป็นความลับจนกว่าจะเปิดชื่อจริง · แตะพื้นที่บนกระดานเพื่อดูรายละเอียดและเลือกทำแอคชั่น · ตัวเลขการ์ด การ์ดสถานการณ์ และการ์ดอีเวนต์เป็นค่าแทน</p>
    <div class="acts">${started && !g.over ? '<button class="btn ghost" data-act="close">กลับไปเล่นต่อ</button>' : ''}<button class="btn" data-act="rules">อ่านกติกา</button><button class="btn primary" data-act="start">${started ? 'เริ่มเกมใหม่' : 'เริ่มสงคราม'}</button></div></div>`);
}

let summonGo = null;
function showSummon(go) {
  summonGo = go;
  const p = me();
  const sk = p.skills.map((c) => `<li><b>${esc(c.name)}</b>${esc(cardText(c))}</li>`).join('');
  const sp = p.specials.map((c) => `<li class="sp"><b>${esc(c.name)} · การ์ดพิเศษของ Master</b>${esc(cardText(c))}</li>`).join('');
  const deck = p.sv.deck;
  const byType = Object.keys(TYPES).map((t) => [t, deck.filter((c) => c.type === t).length]).filter(([, n]) => n).map(([t, n]) => `${TYPES[t]} ${n}`).join(' · ');
  openModal(`<div class="dlg"><span class="eyebrow">การอัญเชิญสำเร็จ</span><div class="summon"><img src="${SV_ART[p.sv.key]}" alt="${esc(p.sv.name)}">
    <div style="display:grid;gap:12px;min-width:0"><span class="cls">${esc(p.sv.cls.toUpperCase())}</span><h2>${esc(p.sv.name)}</h2>
    <p class="lede">Master ${esc(p.m.name)} · ไพ่ทาโรต์คว่ำไว้ คู่แข่งไม่รู้ว่าคุณเป็นใครจนกว่าจะเปิดชื่อจริง</p>
    <p class="row-lab">การ์ด NP/สกิล</p><ul class="skills">${sk}${sp}</ul>
    <p class="dim" style="margin:0;font-size:13px">สำรับโจมตี ${deck.length + (p.m.key === 'kuzuki' ? 2 : 0)} ใบ: ${byType}${p.m.key === 'kuzuki' ? ' + Snake 2' : ''}</p></div></div>
    <div class="acts"><button class="btn primary" data-act="go">เริ่มรอบ 1</button></div></div>`);
}

function showRules() {
  const back = !started ? 'back-start' : summonGo ? 'go-summon' : 'close';
  openModal(`<div class="dlg narrow"><span class="eyebrow">กติกาแบบย่อ · ตามคู่มือ</span><h2>วิธีเล่น</h2><div class="rules">
    <div><h3>เป้าหมาย</h3><p>เก็บ VP จากการชนะในสนามรบและการลาดตระเวน · รอบปกติ ${REGULAR} รอบ แล้วเล่นรอบไคลแมกซ์จนเหลือคนเดียว · จบรอบ ${REGULAR} เหลือ 4 คน · จบไคลแมกซ์แรกเหลือ 2 คน · จบไคลแมกซ์ "เหลือ 2 คน" เหลือ 1 คน = ผู้ชนะ · <b>แต้มเท่ากันที่เส้นตัด ออกทุกคน</b></p></div>
    <div><h3>หนึ่งรอบ</h3><ol>
      <li><b>เตรียมการ:</b> จั่วให้ครบ 3 ใบ · เปิดการ์ดสถานการณ์ ทุกคนได้มานาตาม "จ่าย" และมีกฎเพิ่มทั้งรอบ · วางการ์ดอีเวนต์ที่มิยามะแบบหงาย และที่ชินโตะแบบคว่ำ</li>
      <li><b>ตั้งมั่น:</b> วางหมากที่โรงฝึกเวท (มานา ${WORKSHOP.join(' / ')} ตามลำดับ รับ 4 คน) หรือสนามรบ (คนแรกได้เปรียบพื้นที่ +${TERRAIN[0]} คนที่สอง +${TERRAIN[1]}) · ลาดตระเวนวางไม่ได้</li>
      <li><b>ปฏิบัติการ:</b> เปิดอีเวนต์ชินโตะ แล้วทีละคน ① ย้ายตามลูกศรทางเดียว (มานา ${STEP_COST.join(' / ')}) · สนามรบที่มี 2 คนขึ้นไปติดพัน เดินออกไม่ได้ · เข้าลาดตระเวน (รับ 1 คน) ได้ ${RECON_VP} VP ทันที ② ลงการ์ด 2 ใบ หงายหรือคว่ำทีละใบ · หงาย = ใช้ค่าบนการ์ด · คว่ำ = พลัง 0 มานา 0 ไม่มีผล</li>
      <li><b>ต่อสู้:</b> ผล "ตอนปะทะ" ทำตามลำดับที่นั่ง · พลังรวมสูงสุดที่ไม่ [แพ้] ชนะ ได้ VP การ์ดอีเวนต์ + ${AREAS.miyama.bonus} (มิยามะ) หรือ + ${AREAS.shinto.bonus} (ชินโตะ) · เสมอแบ่งกันปัดขึ้น · อยู่คนเดียวได้แค่ VP การ์ดอีเวนต์ · แพ้ไม่เสียอะไร</li>
      <li><b>จบรอบ:</b> การ์ดลงกองทิ้งตามด้านที่ลง · การ์ด NP/สกิลกลับข้างไพ่ทาโรต์แบบหงาย · ผู้เริ่ม (${SUN}) เลื่อนไปคนถัดไป</li></ol></div>
    <div><h3>มานาและการ์ด NP/สกิล</h3><p>มานา 0–${MANA_MAX} · การ์ด NP/สกิลเลือกได้เมื่อมีมานา ${SKILL_MANA} ขึ้นไป แล้วจ่ายตามการ์ด · ใช้แล้วใช้ซ้ำได้ ยกเว้น "ครั้งเดียวต่อเกม" · การ์ดที่มี "เปิดชื่อจริง" หงายไพ่ทาโรต์ของคุณ</p></div>
    <div><h3>Command Spell</h3><p>ใช้ได้เฉพาะในตาปฏิบัติการของตัวเอง ก่อนย้าย ระหว่างย้ายกับลงการ์ด หรือหลังลงการ์ด · 1 ดวงต่อ 1 ผล: มานา +${CS_MANA} · พลังรวม +${CS_POWER} และถ้าชนะได้ VP +${CS_VP} · ย้ายไปที่ไหนก็ได้ยกเว้นโรงฝึกเวท ไม่สนการติดพัน</p></div>
    <div><h3>ข้อยกเว้นของ Master</h3><p>ชิโร่ไม่ตกรอบตอนคัดหลังรอบ ${REGULAR} (Avalon) · ชินจิอยู่อันดับสุดท้ายคนเดียวตอนจบรอบ ${REGULAR} ชนะทันที (Clown) · ซากุระตั้งแต่รอบ ${SAKURA_FROM} ถูกบังคับเสียมานา 2 ได้ 2 VP และในไคลแมกซ์ถ้าไม่ได้อันดับ 1 มานาไม่จำกัด</p></div>
    <div><h3>หน้าจอ</h3><p>แตะพื้นที่บนกระดานเพื่อดูรายละเอียดและเลือกทำแอคชั่นที่นั่น · ตอนลงการ์ดหน้าลงการ์ดจะเปิดเอง · ข้อความที่ยาวเกินกระดานกด "ดูเพิ่ม" · บนมือถือการ์ดของคุณ อันดับ และบันทึกอยู่ที่ปุ่มด้านล่าง</p></div>
    <p class="dim">อ้างอิงกระดาษออกแบบ v5.0 · ตัวเลขการ์ดทุกใบ การ์ดสถานการณ์ และการ์ดอีเวนต์เป็นค่าแทน</p></div>
    <div class="acts"><button class="btn primary" data-act="${back}">ปิด</button></div></div>`);
}

function showResults(results) {
  const ents = (r) => {
    const sorted = [...r.ents].sort((a, b) => (a.defeated - b.defeated) || (b.won - a.won) || (b.power ?? 0) - (a.power ?? 0));
    return sorted.map((e, i) => {
      const p = g.players[e.id];
      const cards = (e.cards || []).map((c) => (c.down ? tile(c, { back: true, mini: true }) : tile(c, { mini: true }))).join('');
      const res = r.alone ? `อยู่คนเดียว +${e.gain} VP` : e.defeated ? '[แพ้]' : e.won ? `ชนะ +${e.gain} VP` : e.gain ? `แพ้ +${e.gain} VP` : 'แพ้';
      const parts = (e.parts || []).filter(([, n]) => n).map(([t, n]) => `${esc(t)} ${n}`).join(' + ');
      return `<div class="ent${e.won ? ' won' : ' lost'}" style="animation-delay:${i * 120}ms"><div class="who">${chip(p)}<div class="cards">${cards}</div></div>
        <div><div class="tot">${r.alone ? '–' : e.power}</div><div class="res${e.defeated ? ' def' : ''}">${res}</div></div>
        ${parts ? `<div class="parts">${parts}</div>` : ''}${e.notes?.length ? `<div class="notes">${e.notes.map(esc).join(' · ')}</div>` : ''}</div>`;
    }).join('');
  };
  const cut = g.round >= REGULAR ? cutInfo() : null;
  const body = results.length
    ? results.map((r) => `<section class="bt"><h3>${esc(AREAS[r.f].name)}<small>${r.alone ? `การ์ดอีเวนต์ ${r.pool} VP` : `ผู้ชนะได้ ${r.pool} VP`}</small></h3>${ents(r)}</section>`).join('')
    : '<p class="lede">รอบนี้ไม่มีใครอยู่ในสนามรบ</p>';
  const cutTxt = cut ? (cut.allOut ? 'จบรอบนี้ทุกคนเสมอกันที่เส้นตัด ไม่มีใครออก' : `จบรอบนี้คัดออก เหลือไม่เกิน ${cut.target} คน`) : '';
  $('#sheet').innerHTML = `<div class="dlg"><span class="eyebrow">${esc(roundLabel())} · ${esc(g.sit.name)}</span><h2>ผลการต่อสู้</h2>${body}
    ${cutTxt ? `<p class="lede" style="color:var(--seal)">${cutTxt}</p>` : ''}
    <div class="acts"><button class="btn ghost" data-act="skipall">ข้ามผลการต่อสู้ที่เหลือ</button><button class="btn primary" data-act="cont">จบรอบ</button></div></div>`;
  $('#sheet').hidden = false;
  $('#sheet').scrollTop = 0;
}

function showOut() {
  openModal(`<div class="dlg narrow"><span class="eyebrow">ถูกคัดออก</span><h2>${esc(me().name)} ตกรอบหลังรอบ ${me().outRound}</h2>
    <p class="lede">คุณมี ${me().vp} VP อยู่ใต้เส้นตัด · บอทจะเล่นต่อจนเหลือคนสุดท้าย</p>
    <div class="acts"><button class="btn" data-act="close">ดูต่อ</button><button class="btn primary" data-act="skip">ข้ามไปผลสุดท้าย</button></div></div>`);
}

function showOver() {
  const rows = g.standing().map((p, i) => `<li class="${p.isHuman ? 'me' : ''}"><span class="rk">${p === g.winner ? '★' : i + 1}</span><span class="who">${chip(p)}</span>
    <span class="vp">${p.vp}</span><span class="pub">${p.out ? `ตกรอบหลังรอบ ${p.outRound}` : p === g.winner ? 'ผู้ชนะ' : 'อยู่ถึงจบ'} · ${esc(`${p.sv.cls} · ${p.sv.name}`)}</span></li>`).join('');
  const meWon = g.winner === me();
  openModal(`<div class="dlg narrow"><span class="eyebrow">Heaven's Feel · จบเกม</span>
    <h2>${meWon ? 'คุณชนะสงครามจอกศักดิ์สิทธิ์' : `${esc(g.winner ? g.winner.name : 'ไม่มีใคร')} ชนะ`}</h2>
    <p class="lede">${esc(g.how)}</p><ol class="st">${rows}</ol>
    <div class="acts"><button class="btn" data-act="pickmaster">เปลี่ยน Master</button><button class="btn" data-act="close">ดูกระดาน</button><button class="btn primary" data-act="again">เล่นอีกครั้ง</button></div></div>`);
}

// ---------- clicks ----------
document.addEventListener('click', (ev) => {
  if (ev.target.id === 'pop') { closePop(); return; } // a tap outside the pop-up closes it
  if (pop?.min && ev.target.closest('#pop .pop-title')) { foldPop(false); return; } // a tap on a folded title opens it again
  const t = ev.target.closest('[data-act]');
  if (!t) return;
  const act = t.dataset.act;
  const d = draft;
  switch (act) {
    case 'rules': pop = null; popBack = null; drawPop(); showRules(); break;
    case 'new': case 'pickmaster': pop = null; popBack = null; drawPop(); showStart(); break;
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
    case 'pop': openPop({ k: t.dataset.k }); break;
    case 'popclose': closePop(); break;
    case 'popmin': foldPop(!pop?.min); break;
    case 'area': if (started) openPop({ k: 'area', f: t.dataset.to }); break;
    case 'openact':
      if (myTurn() && wait.kind === 'cards') { if (pop?.k === 'act') foldPop(false); else { pop = { k: 'act' }; popBack = null; render(); } }
      break;
    case 'mvcs4': if (wait?.kind === 'move') { d.cs4 = !d.cs4; render(); } break;
    case 'place': if (wait?.kind === 'place') answer({ to: t.dataset.to }); break;
    case 'move': if (wait?.kind === 'move') answer({ to: t.dataset.to, how: t.dataset.how, cs4: d.cs4 }); break;
    case 'pick': {
      if (wait?.kind !== 'cards') break;
      const uid = +t.dataset.uid;
      const p = me();
      info = allCards(p).find((c) => c.uid === uid) || null;
      if (!wait.ctx.field) {
        d.ids = d.ids.includes(uid) ? d.ids.filter((x) => x !== uid) : [...d.ids, uid].slice(-PLAY);
      } else if (d.ids.includes(uid)) {
        d.ids = d.ids.filter((x) => x !== uid);
        d.down = d.down.filter((x) => x !== uid);
        // dropping UBW also drops the deck cards it brought
        if (info?.fx?.ubw) d.ids = d.ids.filter((x) => !p.deck.some((c) => c.uid === x));
      } else {
        const test = g.cleanCards(p, { ...d, ids: [...d.ids, uid] }, true);
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
    case 'csMove': d.csMove = t.dataset.to || null; render(); break;
    case 'reset': draft = firstDraft('cards', wait.ctx); info = null; render(); break;
    case 'swappick': { const uid = +t.dataset.uid; if (swapSel.has(uid)) swapSel.delete(uid); else swapSel.add(uid); render(); break; }
    case 'swap': if (wait?.kind === 'cards' && swapSel.size) answer({ swap: [...swapSel] }); break;
    case 'play': if (wait?.kind === 'cards') answer({ ...d }); break;
    case 'discard': if (wait?.kind === 'cards') answer({ ids: d.ids }); break;
    default: break;
  }
});
document.addEventListener('change', (ev) => {
  if (ev.target.id === 'mv-cs4' && wait?.kind === 'move') { draft.cs4 = ev.target.checked; render(); }
});
document.addEventListener('keydown', (ev) => {
  if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.matches?.('.area[data-act]')) { ev.preventDefault(); ev.target.click(); }
  if (ev.key === 'Escape' && pop && $('#modal').hidden && $('#sheet').hidden) closePop();
});

// first screen: an empty board behind the Master picker
g = new Game({ decide: () => new Promise(() => {}), onEvent: () => {}, humanMaster: setup.master });
render();
showStart();
