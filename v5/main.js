// One-page UI for the v5.2 demo (the Dominate Grail War manual, one stage; Masters and Servants
// of Fate/Domination). The rules live in
// game.js; this file only draws the state and turns clicks into the answers game.decide() waits for.
// The board always fits the window. Tapping an area opens a pop-up with its details and the
// actions you can take there; what does not fit on the screen (event texts, your cards on a
// phone, the standings, the log) opens from a button. Counters show their current value only.
import {
  Game, AREAS, PATH, TYPES, MASTERS, TERRAIN, WORKSHOP, RECON_VP, SKILL_MANA, MANA_MAX, REGULAR, PLAY,
  CS_MANA, CS_POWER, CS_VP, STEP_COST, TSUBAME, UBW_PLAY, RIDE_MAX, GANDR, SERVANTS, SAMPLE, SNAKE,
  STEPS, WINDOWS, WHEN_NAME, WHERE, COND, cardLines,
} from './game.js';
import { botDecide, destValue, gateTypes } from './bot.js';
import { SV_ART, MAP_ART } from './art.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const PHASES = [['prep', 'เตรียมการ'], ['outpost', 'ตั้งมั่น'], ['action', 'ปฏิบัติการ'], ['combat', 'ต่อสู้'], ['end', 'จบรอบ']];
const BOT_DELAY = 260; // a short pause on each bot choice so the board can be followed
const SUN = '★';
const wide = () => window.matchMedia('(min-width: 1100px)').matches; // the side column fits

let g = null, wait = null, draft = null, skip = false, overShown = false, outShown = false, info = null, started = false;
let pop = null; // the open pop-up: { k: 'act' | 'opts' | 'win' | 'area' | 'me' | 'deck' | 'card' | 'player' | 'pcard' | 'rank' | 'log' | 'sit' | 'menu', f, min, back }
let popBack = null; // the action pop-up to return to after looking at something else
const swapSel = new Set(); // hand cards Rin marked for a gem swap (1–3)
const openDrops = new Set(); // power-table dropdowns left open (data-dk), so a redraw keeps them open
let choice = null; // the skill-choice pop-up over the card step (paper 4.6 item 8): { k, uid, sel, re }
const setup = { master: 'shirou', sample: false };

document.documentElement.style.setProperty('--map', `url("${MAP_ART.night}")`);

// ---------- game flow ----------
// tutorial: the guided game of paper 4.6 item 12 (the same deal every time)
function startGame(tutorial = false) {
  skip = false; overShown = false; outShown = false; wait = null; draft = null; info = null; started = true; logCount = 0; pop = null; popBack = null; choice = null;
  closeSheet();
  letGo();
  tut = tutorial ? { i: 0 } : null;
  hints = null;
  const opts = tutorial ? { humanMaster: 'shirou', sample: false, rng: seeded(TUT.seed), servants: TUT.servants, start: 0 } : { humanMaster: setup.master, sample: setup.sample };
  const game = new Game({ decide, onEvent, ...opts });
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
    const held = holdBots(); // the bots wait while you read a step of the tutorial
    if (held) return held.then(() => decide(game, pl, kind, ctx));
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
    if (kind === 'window') { pop = { k: 'win' }; popBack = null; } // a card window: asked only when a card can be used
    if (kind === 'strike1') choice = { k: 'strike1', sel: strikeStart(ctx) }; // 1st Strike's cards, in the fight (paper 4.6 item 8)
    render();
    if (kind === 'combatEnd' && !myBattle()) showResults(ctx.results); // your own fight plays out on the board first
  });
}
function answer(v) {
  const w = wait; wait = null; draft = null; info = null; choice = null; swapSel.clear();
  if (pop && ['act', 'opts', 'area', 'win'].includes(pop.k)) pop = null;
  popBack = null;
  closeSheet(); w.res(v); render();
}

function firstDraft(kind, ctx) {
  const me = g.human;
  if (kind === 'move') return { cs4: false };
  if (kind === 'cards') {
    // start from what a bot would play, without Command Spells or a swap; the player can change everything
    const b = botDecide(g, me, 'cards', { ...ctx, noSwap: true, noCs: true }) || {};
    return { ids: b.ids || [], down: b.down || [], cs4: false, cs2: 0, gemMana: b.gemMana || 0, gandr: b.gandr || 0, gate: b.gate || [], moveTo: b.moveTo || null, mover: null, csMove: null, rbTarget: null };
  }
  return {};
}

let queued = false;
function onEvent(e) {
  if (e.type === 'log' && ['death', 'reveal', 'grail'].includes(e.entry.cls) && !skip) toast(e.entry.text, e.entry.cls);
  if (e.type === 'book' && e.p.isHuman && !skip) toast(`Servant ใหม่ของคุณ: ${e.p.sv.cls} · ${e.p.sv.name}`, 'reveal');
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
// Supervisor: while Kirei's true name is hidden, he alone sees every Servant's class [FD]
const kireiSees = () => started && me().m.key === 'kirei' && !me().revealed && !me().out && !g.over;
const svLabel = (p) => (seen(p) ? `${p.sv.cls} · ${p.sv.name}` : kireiSees() ? `คลาส ${p.sv.cls} · คุณเห็น (Supervisor)` : 'ชื่อจริงซ่อน');
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
// permanent cards still in play (paper 4.6 item 11): laid face up, so public; UBW goes when the hand runs out
const lasting = (q) => (q.out ? [] : q.skills.filter((c) => c.resident));
const PERM_SHORT = { 'Unlimited Blade Works': 'UBW', 'Saber Class': 'Saber', 'Caster Class': 'Caster', Metamorphosis: 'Meta' };
const permTitle = (c, q) => `${c.name} · ${q.name} · ถาวรตั้งแต่รอบ ${c.residentFrom}${c.fx?.ubw ? ` · การ์ดในมือเหลือ ${q.hand.length} ใบ หมดแล้ว UBW ปิด` : ''} · ${cardText(c)}`;
// one tag per card: a button in the lists (opens the card), a plain tag by the piece on the map
function permTags(q, { btn = false } = {}) {
  const cs = lasting(q);
  if (!cs.length) return '';
  const one = (c) => {
    const nm = esc(c.fx?.ubw ? 'UBW' : c.name);
    return btn
      ? `<button class="pchip t${c.type}" data-act="permcard" data-id="${q.id}" data-uid="${c.uid}" title="${esc(permTitle(c, q))}" aria-label="${esc(`${c.name} ถาวร · ดูการ์ด`)}">${nm}</button>`
      : `<span class="pchip t${c.type}" title="${esc(permTitle(c, q))}">${nm}</span>`;
  };
  return `<span class="${btn ? 'perms' : 'ptags'}">${cs.map(one).join('')}</span>`;
}

const TAG = {
  reveal: 'เปิดชื่อจริง', once: 'ครั้งเดียวต่อเกม', permanent: 'ถาวร', petrify: 'ไม่มีชนิดพิเศษ [แพ้]', duel: '1 ต่อ 1 [แพ้]',
  ruleBreaker: 'Command Spell −1', zeroOpp: (t) => `${TYPES[t]}คู่ต่อสู้ = 0`, hiddenDisc: (n) => `ชื่อซ่อน มานา −${n}`,
  ubw: 'ทั้งสำรับขึ้นมือ', riding: (n) => `ลงเพิ่มพลัง ≤${RIDE_MAX} ได้ ${n} ใบ`, riderDraw: 'จั่ว 1', move: (v) => (v === 'next' ? 'ย้ายช่องถัดไป' : 'ย้ายได้ทุกที่'),
  bell: 'ย้าย + ยึดพื้นที่', extra: 'ลงเพิ่มนอก 2 ใบ', strike3: 'ลงเพิ่มถ้ามีว่องไว 2', sword: (n) => `ดาบ ${n}/3`, needMana: `มานา ${SKILL_MANA}+`,
  no8: `ไม่ต้องมานา ${SKILL_MANA}`, strike1: 'ลงการ์ดกำลังแทน', block: 'ปิดผลคนอื่นที่นี่', playVP: (n) => `+${n} VP`, win: (n) => `ชนะ +${n} VP`,
  strike: 'VP ตามคู่ต่อสู้', godHand: (n) => `แพ้ได้ ${n} VP`, terrainMul: (n) => `พื้นที่ ×${n}`, mana: (n) => `ได้มานา +${n}`,
  zab: 'ชนะ VP ×2', hiddenOnly: 'ชื่อจริงซ่อนเท่านั้น', hide: 'ซ่อนชื่อจริงกลับ', excal: (n) => `ไคลแมกซ์ +${n}`, npTop: 'NP มานาสูงสุด +VP',
  pierce: (n) => `ใช้แล้วมานา +${n}`, rain: 'แพ้ Rule Breaker กลับ', workshop: 'โรงฝึก +1 มานา +2 VP', manaX: 'มานา 16−รอบ×2', gate: 'เลือกชนิด',
  enuma: 'สกิลพิเศษ [แพ้]', archer: (n) => `+${n} VP · แพ้ −5`, presence: 'ล้มคนพลังสูงสุด', luck: 'ไม่สน [แพ้]',
};
// what an effect line of a window card does, in short (paper section 9)
const useFx = (fx) => [fx.mana && `มานา +${fx.mana}`, fx.vp && `${fx.vp} VP`, fx.peek && 'ดูอีเวนต์ชินโตะ', fx.freeMove && 'ย้ายแม้ติดพัน'].filter(Boolean).join(' · ');
const tags = (c) => [...(c.use || []).map((u) => `${WHEN_NAME[u.when]}: ${useFx(u.fx)}`), ...Object.entries(c.fx || {}).filter(([k]) => TAG[k]).map(([k, v]) => (typeof TAG[k] === 'function' ? TAG[k](v) : TAG[k]))];
const typeName = (c) => (c.types ? c.types.map((t) => TYPES[t]).join(' · ') : TYPES[c.type]); // e.g. Excalibur: NP · กำลัง
// the same words in each type's colour, for card faces and card lists (NP · กำลัง: gold, then red)
const typeHtml = (c) => (c.types || [c.type]).map((t) => `<span class="tw tw-${t}">${TYPES[t]}</span>`).join(' · ');
const cardName = (c) => c.name || `${typeName(c)} ${c.power}`;
const clean = (t) => t.replace(/\s*\[(p\.\d+(–\d+)?|4G|GZ|NW|FD|ฟามิซือ)\]/g, ''); // source tags belong to the paper, not the table
const cardText = (c) => (c.text ? clean(c.text) : [`${typeName(c)} พลัง ${c.power} มานา ${c.mana}`, ...tags(c)].join(' · '));
// the label of each effect line: window · where · condition (paper section 9)
const lineText = (l) => [WHEN_NAME[l.when], l.where && WHERE[l.where], l.cond && COND[l.cond]].filter(Boolean).join(' · ');
const pills = (c) => cardLines(c).map((l) => `<span class="when w-${l.when}">${esc(lineText(l))}</span>`).join('');

// where a card comes from (paper 4.6): a Servant's skill slot, or a Master's ability
// (Kanshou & Bakuya, Gandr Shot, Black Shadow, Snake). NP cards keep their NP label.
const MASTER_CARD = { 'Kanshou & Bakuya': 'shirou', 'Gandr Shot': 'rin', 'Black Shadow': 'sakura', Snake: 'kuzuki' };
const srcOf = (c) => (c.skill && c.type !== 'N' ? 'sv' : c.special ? 'ms' : '');
const masterOf = (c) => MASTERS.find((m) => m.key === MASTER_CARD[c.name])?.short || '';
function srcText(c, owner) {
  const s = srcOf(c);
  if (s === 'sv') return `สกิลของ ${owner && seen(owner) ? owner.sv.cls : 'Servant'}`;
  if (s === 'ms') return `สกิลของ Master ${masterOf(c)}`;
  return c.skill ? `NP ของ ${owner && seen(owner) ? owner.sv.cls : 'Servant'}` : '';
}
const srcBand = (s) => (s ? `<b class="src ${s}">สกิล<span class="who"> ${s === 'sv' ? 'Servant' : 'Master'}</span></b>` : '');

// a card tile. o: { btn, act, sel, down, back, lock, glow, power, cost, mini, sm, hd, note, key }
function tile(c, o = {}) {
  const size = o.mini ? ' mini' : o.sm ? ' sm' : o.hd ? ' hd' : '';
  if (o.back) return `<div class="card back${size}" title="การ์ดคว่ำ"><span class="ty">คว่ำ</span><span class="pw">?</span></div>`;
  const down = o.down ?? c.down;
  const src = srcOf(c);
  const cls = ['card', `t${c.type}`, c.types?.length > 1 ? `multi m${c.types.find((t) => t !== c.type)}` : '', c.skill ? 'skill' : '', c.keep || c.special ? 'sp' : '', src ? 'has-src' : '', o.sel ? 'sel' : '', down || c.off ? 'down' : '', o.lock ? 'lock' : '', o.glow ? 'glow' : '', c.gone ? 'gone' : '', c.resident ? 'res' : ''].filter(Boolean).join(' ') + size;
  const pw = o.power ?? c.power;
  const zero = down || c.off;
  const up = pw > c.power ? `<sup>+${pw - c.power}</sup>` : '';
  const fx = o.note ?? (c.gone ? 'ใช้แล้ว' : c.resident ? 'ถาวรอยู่' : tags(c).slice(0, 2).join(' · '));
  const body = `${srcBand(src)}<span class="ty">${down ? 'คว่ำ · ' : c.off ? 'ปิด · ' : ''}${typeHtml(c)}</span><span class="pw">${zero ? 0 : Math.min(pw, c.power)}${zero ? '' : up}</span>`
    + `<span class="mn" title="มานา">${o.cost ?? (c.fx?.manaX || c.fx?.gate ? 'X' : c.mana)}</span>`
    + `<span>${c.name ? `<span class="nm">${esc(c.name)}</span>` : ''}${fx ? `<span class="fx">${esc(fx)}</span>` : ''}</span>`;
  const title = esc([srcText(c), cardText(c)].filter(Boolean).join(' · '));
  if (o.btn) return `<button class="${cls}" data-act="${o.act || 'pick'}" data-uid="${o.key ?? c.uid}" title="${title}" aria-pressed="${!!o.sel}">${body}</button>`;
  return `<div class="${cls}" title="${title}">${body}</div>`;
}

const bonusOf = (f) => AREAS[f].bonus + g.sfx('bonusUp');
// the Shinto event lies face down until the action phase; a card can let you look first (paper 9)
const peeked = () => started && me().peek === g.round;
const evHidden = (f) => f === 'shinto' && !g.shintoOpen && !peeked();
function prizeText(f) {
  if (!g.evs[f].length) return '';
  if (evHidden(f)) return `อีเวนต์คว่ำ · ชนะได้ VP การ์ด + ${bonusOf(f)}`;
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
  drawChoice();
  if (me().out && !outShown && !g.over) { outShown = true; showOut(); }
  if (g.over && !overShown && !wait) { overShown = true; showOver(); }
  tutKick();
}

const stepNow = () => (g.step && g.phase && !g.over ? g.step : '');
function drawHud() {
  const st = stepNow();
  const steps = PHASES.map(([k, t]) => `<li class="${g.phase === k && !g.over ? 'now' : ''}">${t}${g.phase === k && st ? `<small class="stp" title="ขั้นของรอบ (กระดาษข้อ 8.0)"><b>${st}</b><span class="sn"> ${esc(STEPS[st])}</span></small>` : ''}</li>`).join('');
  const p = me();
  const stats = started ? `<div class="mystat" aria-label="ของคุณ"><span class="m">มานา <b>${p.mana}</b></span><span class="c" title="Command Spell">◆ <b>${p.cs}</b></span><span class="v"><b>${p.vp}</b> VP</span></div>` : '';
  const ph = phaseName();
  $('#hud').innerHTML = `<span class="crest">DOMINATE GRAIL WAR</span>
    <div class="track"><b class="rl">${esc(roundLabel())}${ph ? `<span class="ph"> · ${ph}${st ? `<span class="stc"> ${st}</span>` : ''}</span>` : ''}</b><ol class="steps" aria-label="ขั้นของรอบ">${steps}</ol></div>
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
    const w = k === 'window' ? WINDOWS[wait.ctx.w] : null;
    const what = k === 'strike1' ? 'ต่อสู้ · 1st Strike เลือกการ์ด' : k === 'place' ? 'ตั้งมั่น · วางหมาก' : k === 'move' ? 'ปฏิบัติการ · ย้ายหรืออยู่ที่เดิม' : w ? `ช่วง${w.name} · ใช้การ์ดได้` : `ลงการ์ดที่${AREAS[p.at].name}${AREAS[p.at].field ? '' : ' · ไม่คิดพลัง'}`;
    const hint = k === 'cards' ? '' : k === 'strike1' ? '<span class="hint">ขั้น 4.1 · ผล "ตอนปะทะ" ของคุณ</span>' : w ? `<span class="hint">ขั้น ${w.code} · การ์ดที่ใช้ได้เรืองแสงในแถบการ์ด</span>` : '<span class="hint">แตะพื้นที่ที่เรืองแสงบนกระดาน</span>';
    const cs4 = k === 'move' && p.cs > 0 && p.mana < MANA_MAX
      ? `<button class="btn sm${draft.cs4 ? ' on' : ''}" data-act="mvcs4" aria-pressed="${!!draft.cs4}">◆ มานา +${CS_MANA} ก่อนย้าย</button>` : '';
    const btn = k === 'strike1' ? '<button class="btn sm primary" data-act="copen" data-k="strike1">เปิดหน้าเลือก</button>'
      : k === 'cards' ? '<button class="btn sm primary" data-act="openact">เปิดหน้าลงการ์ด</button>'
      : w ? '<button class="btn sm" data-act="winpass">ผ่าน</button><button class="btn sm primary" data-act="openwin">เปิดหน้าใช้การ์ด</button>'
      : '<button class="btn sm" data-act="pop" data-k="opts">ดูตัวเลือกทั้งหมด</button>';
    html = `<span class="yourturn">ตาของคุณ</span><b>${esc(what)}</b>${hint}<span class="acts">${cs4}${btn}</span>`;
  } else if (wait?.kind === 'combatEnd') {
    const bt = myBattle();
    const r = bt?.res;
    const mine = r?.ents.find((e) => e.id === p.id);
    const how = !mine ? '' : mine.defeated ? ' · คุณ [แพ้]' : mine.won ? ` · คุณชนะ ${pm(mine.gain)} VP` : ' · คุณแพ้';
    html = `<span class="who">ผลการต่อสู้</span><b>${esc(bt ? `${AREAS[bt.f].name}${how}` : 'ทุกสนามรบ')}</b>
      <span class="acts"><button class="btn sm" data-act="allres">ดูผลทุกสนามรบ</button><button class="btn sm primary" data-act="cont">จบรอบ</button></span>`;
  } else {
    const t = g.turn;
    const st = stepNow();
    const what = !g.round ? 'กำลังเรียก Servant…' : t ? `${t.name} กำลังเลือก${st ? ` · ${st} ${STEPS[st]}` : ''}` : g.phase === 'combat' ? 'กำลังตัดสินผลการต่อสู้' : 'กำลังเตรียมรอบ';
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
  const bt = myBattle();
  $('#board').innerHTML = `${sitLine()}
    <div class="map${bt ? ` big-${bt.f}` : ''}">${workshop(can)}${arrow(0)}${field('miyama', can, bt)}${arrow(1)}${field('shinto', can, bt)}${arrow(2)}${recon(can)}</div>
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

// your cards along the bottom of the board, on every screen (paper 4.6); the deck opens from its end
function handStrip() {
  if (!started) return '';
  const p = me();
  const o = { hd: true, btn: true, act: 'cardinfo' }; // a tap opens the card's details (paper 4.6 item 5)
  const can = winCan(); // cards usable in the window being asked glow (paper 8.0 rule 7)
  const hand = p.hand.map((c) => tile(c, { ...o, glow: can.has(c.uid) })).join('') + p.specials.map((c) => tile(c, { ...o, note: specialNote(c), glow: can.has(c.uid) })).join('');
  const skills = p.skills.map((c) => tile(c, { ...o, note: skillNote(c), lock: skillLocked(c), glow: can.has(c.uid), cost: costNow(c) })).join('');
  return `<div class="hand"><span class="lab">การ์ดในมือ</span><div class="cards">${hand || '<span class="dim">ยังไม่มีการ์ด</span>'}</div><i class="sep"></i><div class="cards">${skills}</div>
    <button class="deckbtn" data-act="pop" data-k="deck">${p.deck.length ? '<i class="dk" aria-hidden="true"></i>' : ''}<b>ดูเดค</b><small>สำรับ ${p.deck.length} ใบ</small></button></div>`;
}
const winCan = () => new Set(wait?.kind === 'window' ? wait.ctx.cards : []);
// the mana a card costs now (Caster Class X, Gate of Babylon X, Invisible Air while hidden)
const costNow = (c, p = me()) => (c.fx?.gate ? 'X' : g.round && !g.over ? g.costOf(p, c) : c.fx?.manaX ? 'X' : c.mana);
const skillNote = (c) => {
  const p = me();
  if (c.gone) return c.fx?.godHand ? 'ออกจากเกม' : 'ใช้แล้ว · ครั้งเดียว';
  if (c.resident) return c.fx?.ubw ? 'ถาวร · จั่วไม่ได้' : 'ถาวรอยู่ในสนาม';
  if (p.uses[c.name]) return 'ใช้แล้ว · หงายไว้';
  return g.round && !g.over ? g.skillState(p, c) || 'พร้อมใช้' : 'คว่ำไว้';
};
const skillLocked = (c) => !c.gone && !c.resident && !!(g.round && !g.over && g.skillState(me(), c));
const specialNote = (c) => (c.windowOnly ? 'ใช้ช่วงเตรียมการ' : c.temp ? 'ใช้รอบเดียว' : (g.round && !g.over && g.specialState(me(), c)) || 'ช่องสกิล · ลงเพิ่ม');

function areaAttrs(k, can) {
  return ` data-act="area" data-to="${k}" role="button" tabindex="0" aria-label="${esc(`${AREAS[k].name}${can[k] ? ' · เลือกได้' : ''} · ดูรายละเอียด`)}"`;
}
const areaCls = (k, can) => `${can[k] ? ' can' : ''}${me().at === k && !me().out && started ? ' here' : ''}`;

function workshop(can) {
  const here = g.here('workshop');
  const kz = me().m.key === 'kuzuki' && started;
  const slots = WORKSHOP.map((n, i) => {
    const p = here.find((q) => q.slot === i);
    return `<span class="slot${p ? ' full' : ''}">${p ? tok(p) + permTags(p) : ''}<i>+${n}</i></span>`;
  }).join('');
  return `<div class="area ws${areaCls('workshop', can)}"${areaAttrs('workshop', can)}>
    <div class="ah"><h3>${AREAS.workshop.name}</h3><span class="kind">รับ 4 คน</span></div>
    <div class="slots">${slots}</div><span class="rule">${kz ? 'คุณไม่ได้มานาที่นี่ · เดินออกถูกลง 1' : 'ได้มานาตามช่อง'}</span></div>`;
}

function recon(can) {
  const p = g.here('recon')[0];
  return `<div class="area rc${areaCls('recon', can)}"${areaAttrs('recon', can)}>
    <div class="ah"><h3>${AREAS.recon.name}</h3><span class="kind">รับ 1 คน</span></div>
    <div class="slots"><span class="slot${p ? ' full' : ''}">${p ? tok(p) + permTags(p) : '<i>ว่าง</i>'}</span></div>
    <span class="prize">ย้ายเข้า <b>+${RECON_VP} VP</b></span><span class="rule">ตั้งมั่นวางไม่ได้</span></div>`;
}

// a Master on a battlefield: piece, advantage token and power once the cards are down
function occ(p) {
  const note = `${p.terrain ? ` · ได้เปรียบ +${p.terrain}` : ''}${p.play ? ` · พลัง ${p.play.pre}` : ''}`;
  return `<span class="occ${p.play ? ' played' : ''}${p.isHuman ? ' mine' : ''}">${tok(p, note)}${p.terrain ? `<i class="tr">+${p.terrain}</i>` : ''}${p.play ? `<b class="pw">${p.play.pre}</b>` : ''}${permTags(p)}</span>`;
}
function field(f, can, bt) {
  const A = AREAS[f];
  const here = g.here(f);
  if (bt?.f === f) { // your fight, drawn inside the area (paper 4.6)
    return `<div class="area field f-${f}${areaCls(f, can)} fighting"${areaAttrs(f, can)}>
      <div class="ah"><h3>${A.name}</h3><span class="kind">${bt.res ? 'ผลการต่อสู้' : 'ต่อสู้'}</span><span class="bprize">${esc(bt.res ? `ผู้ชนะได้ ${bt.res.pool} VP` : prizeText(f))}</span></div>
      <div class="battle n${Math.min(here.length, 5)}${here.length >= 5 ? ' dense' : ''}">${battleRows(f, bt.res, false)}</div></div>`;
  }
  const early = !g.round || g.phase === 'prep' || g.phase === 'outpost';
  const free = early ? TERRAIN.filter((_, i) => !here.some((q) => q.slot === i)).map((t) => `<span class="slot"><i>+${t}</i></span>`).join('') : '';
  const engaged = g.phase === 'action' && g.engagedAt(f) ? '<span class="tag-engaged" title="มี 2 คนขึ้นไป เดินออกตามปกติไม่ได้">ติดพัน</span>' : '';
  const vp = g.evs[f].length ? `<span class="prize">${evHidden(f) ? `ชนะ <b>VP การ์ด + ${bonusOf(f)}</b>` : `ชนะ <b>${g.fieldVP(f)} VP</b> · คนเดียว ${g.eventVP(f)}`}</span>` : '';
  return `<div class="area field f-${f}${areaCls(f, can)}${here.length >= 3 ? ' crowd' : ''}${here.length >= 4 ? ' packed' : ''}"${areaAttrs(f, can)}>
    <div class="ah"><h3>${A.name}</h3><span class="kind">สนามรบ</span>${engaged}</div>
    <div class="evs">${evCards(f, true)}</div>${vp}
    <div class="slots">${here.map(occ).join('')}${free}</div></div>`;
}

// ---------- your fight (paper 4.6) ----------
// From the first card laid on your battlefield until the fight's result, that area shows who is
// there, the cards they laid and their power. In the combat phase the on-clash results come in
// one Master at a time in seat order.
function myBattle() {
  if (!started || g.over || !g.round) return null;
  const p = me();
  if (p.out || !p.at || !AREAS[p.at].field) return null;
  const f = p.at;
  const here = g.here(f);
  if (here.length < 2) return null;
  if (g.phase === 'action' && here.some((q) => q.play)) return { f, res: null };
  if (g.phase === 'combat') {
    const res = g.results.find((r) => r.f === f);
    if (res && !res.alone) return { f, res };
    if (!res && here.some((q) => q.play)) return { f, res: null }; // an on-clash choice before the result (1st Strike)
  }
  return null;
}
const RES_STEP = 450; // ms between the Masters' results
let resAnim = null; // { res, t0 }: when the result first showed, so redraws carry on the animation
function bcard(c, q) {
  if (c.down && !q.isHuman) return '<span class="bc back" title="การ์ดคว่ำ">?</span>';
  const s = srcOf(c);
  const title = esc(`${c.down ? 'ลงคว่ำ · ' : ''}${cardName(c)} · ${[srcText(c, q), cardText(c)].filter(Boolean).join(' · ')}`);
  return `<span class="bc t${c.type}${c.down || c.off ? ' down' : ''}${s ? ` src-${s}` : ''}" title="${title}"><b>${c.down || c.off ? 0 : c.power}</b><small>${c.down ? 'คว่ำ' : c.off ? 'ปิด' : c.fx?.permanent ? 'ถาวร' : s ? 'สกิล' : TYPES[c.type]}</small></span>`;
}
// a permanent card from an earlier round: its effects work in this fight, its power counted only once (paper 4.6 item 11)
const permCard = (c, q) => `<span class="bc t${c.type} perm" title="${esc(permTitle(c, q))}"><b class="nm">${esc(PERM_SHORT[c.name] || c.name)}</b><small>ถาวร</small></span>`;
// the short line under a power: "การ์ด 6 · พื้นที่ +3 · CS +2" (paper 4.6 item 9)
const PART_SHORT = { 'ได้เปรียบพื้นที่': 'พื้นที่', 'Command Spell': 'CS', 'Tsubame Gaeshi': 'Tsubame', 'การ์ดชนิดเดียวกัน': 'ชนิดเดียวกัน', 'Excalibur ไคลแมกซ์': 'Excalibur', 'ชื่อจริงยังซ่อน': 'ชื่อซ่อน' };
const sgn = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');
const pm = (n) => (n < 0 ? `−${-n}` : `+${n}`); // a VP change, +0 included
const shortParts = (parts) => parts.filter(([, n], i) => i === 0 || n).map(([t, n], i) => (i === 0 ? `การ์ด ${n}` : `${PART_SHORT[t] || t} ${sgn(n)}`)).join(' · ');
// what the clash changed, by name ("Executor", "Invisible Air", "1st Strike"); a bonus already in
// the power before the fight is left out
function clashNames(e) {
  const had = (t, n) => (e.preParts || []).some(([k, v]) => k === t && v === n);
  const out = [];
  for (const r of e.rows || []) {
    if (r.k === 'part' && r.clash && !had(r.label, r.n)) out.push(PART_SHORT[r.label] || r.label);
    if (r.k === 'card') { if (r.clashIn) out.push('1st Strike'); for (const m of r.mods) if (m.clash) out.push(m.s || m.t); }
  }
  return [...new Set(out)].join(' · ');
}
function battleRows(f, res, full) {
  const people = g.order().filter((q) => q.at === f);
  const ents = res ? new Map(res.ents.map((e) => [e.id, e])) : null;
  if (res && resAnim?.res !== res) resAnim = { res, t0: performance.now() };
  const since = res ? performance.now() - resAnim.t0 : 0;
  const top = Math.max(0, ...people.map((q) => q.play?.pre ?? 0));
  return people.map((q, i) => {
    const e = ents?.get(q.id);
    const perm = g.perm(q);
    const n = (q.play?.cards.length || 0) + perm.length;
    const cards = (q.play
      ? q.play.cards.map((c) => (full ? (c.down && !q.isHuman ? tile(c, { back: true, mini: true }) : tile(c, { mini: true })) : bcard(c, q))).join('')
      : '<span class="bwait">ยังไม่ลงการ์ด</span>') + perm.map((c) => (full ? tile(c, { mini: true, note: 'ถาวร' }) : permCard(c, q))).join('');
    const lead = !res && q.play && q.play.pre === top && top > 0;
    let out = '';
    let note = '';
    let short = ''; // the result under the power, for narrow areas
    let pw = q.play ? q.play.pre : '–';
    let sub = q.terrain ? `<i class="tr" title="ได้เปรียบพื้นที่">${full ? 'ได้เปรียบ ' : ''}+${q.terrain}</i>` : '';
    const parts = e ? e.parts : q.play?.preParts || [];
    if (e) {
      const vp = (t, k) => `${t}${k ? ` ${pm(k)}<small> VP</small>` : ''}`;
      const what = e.defeated ? '[แพ้]' : e.won ? vp('ชนะ', e.gain) : vp('แพ้', e.gain);
      const d = q.play && !e.defeated ? e.power - q.play.pre : 0;
      const names = clashNames(e);
      const dl = d ? `${sgn(d)}${names ? ` ${names}` : ''}` : ''; // what the clash added, popping up by the power
      note = [dl, ...e.notes.filter((x) => x !== '[แพ้]')].filter(Boolean).join(' · ');
      pw = e.defeated ? '–' : e.power;
      sub = dl ? `<i class="dl${d < 0 ? ' neg' : ''}" title="${esc(note)}">${esc(dl)}</i>` : '';
      out = `<span class="bres${e.won ? ' won' : e.defeated ? ' def' : ''}">${what}</span>`;
      short = e.defeated ? '[แพ้]' : e.won ? `ชนะ${e.gain ? ` ${pm(e.gain)}` : ''}` : 'แพ้';
    }
    const delay = res ? `style="--d:${i * RES_STEP - since}ms;--dw:${people.length * RES_STEP - since}ms"` : '';
    const cls = `brow${q.isHuman ? ' me' : ''}${lead ? ' lead' : ''}${e ? ` res${e.won ? ' won' : ' lost'}` : ''}${n >= 4 ? ' c4' : n === 3 ? ' c3' : ''}`;
    const fx = !full ? '' : (q.play?.cards || []).filter((c) => !(c.down && !q.isHuman) && (c.text || tags(c).length))
      .map((c) => `<li><b>${esc(cardName(c))}</b> ${esc([c.down ? 'ลงคว่ำ ไม่มีผล' : '', srcText(c, q), cardText(c)].filter(Boolean).join(' · '))}</li>`).join('')
      + perm.map((c) => `<li><b>${esc(c.name)}</b> ${esc(`ถาวรตั้งแต่รอบ ${c.residentFrom} · ${cardText(c)}`)}</li>`).join('');
    // the full table in the pop-up; on the board a tap on the row opens it (paper 4.6 item 9)
    const table = full && q.play ? `<div class="bpwt">${pwDrop(e ? { rows: e.rows || [], total: e.power, parts: e.parts || [] } : g.powerOf(q, q.play, { detail: true }), q, { dk: `a:${g.round}:${f}:${q.id}` })}</div>` : '';
    const bar = !full && parts.length ? `<small class="bsum">${esc(shortParts(parts))}</small>` : '';
    const tap = !full && q.play ? ` data-act="pwrow" data-id="${q.id}" role="button" tabindex="0" aria-label="${esc(`พลังของ ${q.name} · แตะดูที่มา`)}"` : '';
    return `<div class="${cls}" ${delay}${tap}><span class="bwho">${full ? chip(q) : `${tok(q)}<b>${esc(q.name)}</b>`}</span>
      <span class="bcards">${cards}</span>${out ? `<span class="bout">${out}</span>` : ''}
      <span class="bpw${e?.won ? ' won' : ''}"${short ? ` data-res="${esc(short)}"` : ''}><b>${pw}</b>${sub}${bar}</span>${note ? `<span class="bnote">${esc(note)}</span>` : ''}
      ${table}${fx ? `<ul class="bfx">${fx}</ul>` : ''}</div>`;
  }).join('');
}

// event cards of a battlefield: Miyama face up, Shinto face down until the action phase [p.3]
function evCards(f, onBoard) {
  const hidden = evHidden(f);
  const peek = f === 'shinto' && !g.shintoOpen && peeked(); // only you see it
  if (!g.evs[f].length) return `<div class="ev empty">การ์ดอีเวนต์วางตอนเตรียมการ</div>`;
  return g.evs[f].map((e) => (hidden
    ? `<div class="ev back"><b>อีเวนต์คว่ำ</b><small>เปิดตอนปฏิบัติการ</small></div>`
    : `<div class="ev${peek ? ' peek' : ''}"${onBoard ? ` title="${esc(`${peek ? 'คุณแอบดู คนอื่นยังไม่เห็น · ' : ''}${e.text}`)}"` : ''}><span class="vpc">${e.vp}</span><span class="tx"><b>${esc(e.name)}</b><small>${esc(`${peek ? 'คุณแอบดู · ' : ''}${e.text}`)}</small></span></div>`)).join('');
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
    const used = p.skills.filter((c) => p.uses[c.name] && !c.resident).map((c) => c.name); // the permanent ones have their own tags
    return `<li class="${p.isHuman ? 'me' : ''}${p.out ? ' out' : ''}" data-act="player" data-id="${p.id}" role="button" tabindex="0" title="${esc(`แตะดูรายละเอียด · ทิ้งล่าสุด: ${topTrash(p)}`)}"><span class="rk">${p.out ? '✖' : i + 1}</span>
      <span class="who">${chip(p, p === sun && !p.out && !g.over ? `<span class="t" title="ผู้เริ่มรอบนี้">${SUN}</span>` : '')}${permTags(p, { btn: true })}</span>
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
  const key = ['card', 'player', 'pcard', 'pw'].includes(pop.k) ? pop.k : `${pop.k}:${pop.f || ''}`; // stepping through cards or players keeps the window
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
  // folded: sit just above the hand bar so its cards stay tappable (paper 4.6 item 5)
  const hand = min && $('.hand')?.getBoundingClientRect();
  if (hand?.height) el.style.setProperty('--minb', `${Math.max(0, Math.round(innerHeight - hand.top + 6))}px`);
  else el.style.removeProperty('--minb');
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
  if (pop?.back) { pop = pop.back; render(); return; } // a card of a player goes back to that player
  pop = popBack;
  popBack = null;
  render();
}

function popBody() {
  const k = pop.k;
  if (k === 'act') return myTurn() && wait.kind === 'cards' ? cardsPop() : null;
  if (k === 'win') return myTurn() && wait.kind === 'window' ? winPop() : null;
  if (k === 'player') return playerPop(pop.f);
  if (k === 'pcard') return pcardPop(pop.f, pop.c);
  if (k === 'pw') return pwPop(pop.f, pop.id);
  if (k === 'opts') return myTurn() && wait.kind === 'place' ? placeOpts() : myTurn() && wait.kind === 'move' ? moveOptsPop() : null;
  if (k === 'area') return areaPop(pop.f);
  if (k === 'me') return mePop();
  if (k === 'deck') return deckPop();
  if (k === 'card') return cardPop(pop.f);
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
    html += `<p class="p-text">วางตอนตั้งมั่นแล้วได้มานาตามช่อง: คนแรก +${WORKSHOP[0]} · คนต่อไป +${WORKSHOP[1]} · รับ 4 คน · ไม่ได้สู้ · ตอนปฏิบัติการเดินต่อไปได้${p.m.key === 'kuzuki' ? ' · คุณ (คุซุกิ) ไม่ได้มานาที่นี่ แต่เดินออกจ่ายน้อยลง 1' : ''}</p>`;
  } else {
    html += `<p class="p-text">รับ 1 คน · ย้ายเข้าตอนปฏิบัติการได้ ${RECON_VP} VP ทันที · วางตอนตั้งมั่นไม่ได้ · ไม่ได้สู้</p>`;
  }
  if (next) html += `<p class="p-text">ทางออก: ไป${AREAS[next].name} มานา ${kz ? `${Math.max(0, STEP_COST[i] - 1)} (คุณจ่ายน้อยลง 1)` : STEP_COST[i]} · ทางเดียว</p>`;
  const bt = myBattle();
  if (bt?.f === f) {
    html += `<div class="pop-sec"><p class="row-lab">${bt.res ? 'ผลการต่อสู้ · ผล "ตอนปะทะ" ตามลำดับที่นั่ง' : `ต่อสู้ · อยู่ที่นี่ ${here.length} คน ตามลำดับที่นั่ง`}</p><div class="battle full">${battleRows(f, bt.res, true)}</div></div>`;
    return { title: A.name, sub: bt.res ? `ผลการต่อสู้ · ผู้ชนะได้ ${bt.res.pool} VP` : 'สนามรบ · กำลังต่อสู้', mini: `ต่อสู้ ${here.length} คน`, html, foot: areaActs(f) };
  }
  const rows = here.map((q) => {
    const cards = q.play ? q.play.cards.map((c) => (c.down && !q.isHuman ? tile(c, { back: true, mini: true }) : tile(c, { mini: true }))).join('') : '';
    return `<div class="foe">${chip(q)}${permTags(q, { btn: true })}<span>${q.terrain ? `ได้เปรียบ +${q.terrain}` : 'ไม่มีได้เปรียบ'}${q.play ? ` · พลัง <b class="pw">${q.play.pre}</b>` : ''}</span>${cards ? `<div class="cards">${cards}</div>` : ''}</div>`;
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
  if (wait.kind === 'cards' && f === p.at) return '<button class="btn primary" data-act="openact">ลงการ์ดที่นี่</button>';
  if (wait.kind === 'window' && f === p.at) return '<button class="btn primary" data-act="openwin">ใช้การ์ด</button>';
  return '';
}

function placeGain(k) {
  const p = me();
  const here = g.here(k);
  if (k === 'workshop') { const n = WORKSHOP[here.length]; return p.m.key === 'kuzuki' ? 'ไม่ได้มานา' : `มานา +${Math.min(n, MANA_MAX - p.mana)}`; }
  const t = here.length < TERRAIN.length ? TERRAIN[here.length] : 0;
  return t ? `ได้เปรียบ +${t}` : 'ไม่มีได้เปรียบ';
}

function placeOpts() {
  const p = me();
  const opts = wait.ctx.opts.map((k) => {
    const here = g.here(k);
    let sub;
    if (k === 'workshop') {
      const tc = p.skills.find((c) => c.resident && c.fx?.workshop); // Caster Class
      sub = `<span>ช่อง ${here.length + 1} · <span class="gain">${placeGain(k)}</span>${tc ? ` · ${esc(tc.name)} มานา +${tc.fx.workshop.mana} ได้ ${tc.fx.workshop.vp} VP` : ''}</span><span>ไม่ได้สู้ · ตอนปฏิบัติการเดินต่อไปได้</span>`;
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
  if (o.how === 'stay') { b = short ? 'อยู่ที่นี่' : `อยู่ที่${A.name}`; sub = A.field ? fieldTxt(o.to) : 'ไม่สู้ · ยังลงการ์ดได้ ผล "ตอนใช้" ทำงาน ไม่คิดพลัง'; }
  else if (o.how === 'walk') { b = short ? 'เดินมาที่นี่' : `เดินไป${A.name}`; sub = `<span class="gain">มานา ${o.cost}</span> · ${where(o.to)}${o.to === 'miyama' && p.m.key === 'shinji' ? ' · มานา +1' : ''}`; }
  else if (o.how === 'kirei') { b = 'Impartial: ไปลาดตระเวน'; sub = `<span class="gain">มานา 2</span> · ไม่สนการติดพัน · ได้ ${RECON_VP} VP ทันที`; }
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

const allCards = (p) => [...p.hand, ...p.skills, ...p.specials, ...p.deck, ...p.trash];

// the play the engine would make from the draft, for the preview
// picked cards the engine lays face down although the draft has them face up (not enough mana)
const forcedDown = (a, d = draft) => new Set(a.down.filter((id) => d.ids.includes(id) && !d.down.includes(id)));

function preview(d = draft) {
  const p = me();
  const a = g.cleanCards(p, d);
  const pool = allCards(p);
  const cards = a.ids.map((id) => {
    const c = pool.find((x) => x.uid === id);
    return { ...c, down: a.down.includes(id), ...(c.fx?.gate && a.gate.length ? { types: ['N', ...a.gate] } : {}) };
  });
  for (let k = 0; k < a.gandr; k++) cards.push({ ...GANDR, keep: true, uid: -1 - k }); // Rin's gem cards, for this fight only
  const dest = a.moveTo && a.moveTo !== p.at ? a.moveTo : a.csMove;
  const f = a.moveTo || a.csMove || p.at; // where the cards end up
  const off = !AREAS[f].field; // off a battlefield no power counts (paper 8.3)
  // the advantage stays behind; Bellerophon takes both advantage spaces of its battlefield [FD]
  const bell = a.mover != null && !off ? cards.find((c) => c.uid === a.mover && c.fx?.bell) : null;
  const stolen = bell ? TERRAIN.reduce((s, t) => s + t, 0) : 0;
  const who = dest || bell ? { ...p, terrain: stolen, seized: bell ? { by: bell.name, f } : null } : p;
  const revealing = !p.revealed && (cards.some((c) => !c.down && c.fx?.reveal) || g.tsubame(cards));
  const rbQ = a.rbTarget != null ? g.players[a.rbTarget] : null;
  const pw = g.powerOf(who, { cards, cs2: a.cs2, blocked: a.blocked, rb: rbQ && rbQ.cs <= 1 ? 10 : 0 }, { f, detail: true });
  return { a, cards, pw, revealing, f, off, dest, stolen, rbQ };
}

function cardsPop() {
  const p = me();
  const { a, cards, pw, revealing, f, off, dest, stolen, rbQ } = preview();
  const here = AREAS[p.at].field;
  const inf = g.infinite(p);
  const mana = inf ? p.mana : a.budget;
  const foes = (AREAS[f].field ? g.here(f) : []).filter((q) => q !== p).map((q) => `<div class="foe">${chip(q)}${q.play
    ? `<span>พลัง <b class="pw">${q.play.pre}</b></span><div class="cards">${q.play.cards.map((c) => (c.down ? tile(c, { back: true, mini: true }) : tile(c, { mini: true }))).join('')}</div>`
    : `<span>ยังไม่ลงการ์ด${q.terrain ? ` · ได้เปรียบ +${q.terrain}` : ''}</span>`}</div>`).join('');
  const sel = new Set(draft.ids.filter((id) => a.ids.includes(id)));
  const down = new Set(a.down); // the engine's sides, so a card the mana cannot pay for shows face down
  const forced = forcedDown(a);
  const ctx = { f };
  // mana still free now, and what is left for an NP/skill card if every attack card went face down
  const fixed = cards.filter((c) => !g.canFlip(c)).reduce((s, c) => s + g.costOf(p, c, a.gate.length), 0);
  const free = a.budget - a.cost;
  const pick = (c) => {
    const s = sel.has(c.uid);
    const isDown = s && down.has(c.uid);
    const m = g.costOf(p, c, a.gate.length);
    const note = !s && g.canFlip(c) && m > free ? 'มานาไม่พอ · ลงคว่ำได้' : undefined;
    const t = tile(c, { btn: true, sel: s, down: isDown, note, power: g.cardPower(p, { ...c, down: false }, ctx), cost: c.fx?.gate ? m : costNow(c) });
    const flip = !s || !g.canFlip(c) ? ''
      : forced.has(c.uid) ? `<button class="flip down" disabled>คว่ำอยู่ · มานาไม่พอหงาย</button>`
      : `<button class="flip${isDown ? ' down' : ''}" data-act="flip" data-uid="${c.uid}">${isDown ? 'คว่ำอยู่ · กดหงาย' : 'หงาย · กดคว่ำ'}</button>`;
    return `<div class="pickcol">${t}${flip}${choiceTag(c, a)}</div>`;
  };
  const locked = (c, why) => `<div class="pickcol">${tile(c, { lock: true, note: why })}</div>`;
  const short = (c) => { const m = g.costOf(p, c); return !inf && !sel.has(c.uid) && m > a.budget - fixed ? `มานาไม่พอ (เหลือ ${Math.max(0, a.budget - fixed)} ใช้ ${m})` : ''; };
  const skills = p.skills.map((c) => { const why = g.skillState(p, c, mana) || short(c); return why ? locked(c, why) : pick(c); }).join('');
  const specials = p.specials.map((c) => { const why = c.windowOnly ? 'ใช้ช่วงเตรียมการ' : g.specialState(p, c, mana) || short(c); return why ? locked(c, why) : pick(c); }).join('')
    + (p.m.key === 'rin' ? gemTile(a) : '');
  const handCards = p.hand.map((c) => (c.fx?.luck && p.roundUse.defeated ? locked(c, 'แพ้ไปแล้ว ลง Luck ไม่ได้') : pick(c))).join('');
  const ubw = cards.find((c) => c.fx?.ubw);
  const deckRow = ubw ? `<div class="pop-sec"><p class="row-lab">สำรับและกองทิ้ง (Unlimited Blade Works ลงการ์ดเพิ่มได้ถึง ${ubw.fx.ubw} ใบ · ที่เหลือขึ้นมือ)</p><div class="cards">${[...p.deck, ...p.trash].map((c) => pick(c)).join('')}</div></div>` : '';

  // Command Spells only (paper section 10): the skills' choices open their own pop-ups (paper 4.6
  // item 8); none in a battlefield held by 2nd Strike
  const csLeft = p.cs - (a.cs4 ? 1 : 0);
  const ctrl = [];
  if (!a.blocked && p.cs > 0 && p.mana < MANA_MAX) ctrl.push(`<button class="btn sm${draft.cs4 ? ' on' : ''}" data-act="cs4" aria-pressed="${!!draft.cs4}">◆ มานา +${CS_MANA} ก่อนจ่าย</button>`);
  if (!a.blocked && csLeft > 0 && !off) ctrl.push(stepper('cs2', `◆ พลัง +${CS_POWER} (ชนะได้ VP +${CS_VP})`, a.cs2, csLeft - (a.csMove ? 1 : 0)));
  const csDests = PATH.slice(1).filter((k) => k !== p.at && (k !== 'recon' || g.reconFree(p)));
  if (!a.blocked && csLeft > 0 && csDests.length) {
    // one move a play: a move card already takes you, so this one greys out
    const why = a.moveTo ? 'การ์ดย้ายแล้ว' : csLeft - a.cs2 <= 0 ? 'Command Spell ใช้กับพลังหมดแล้ว' : '';
    ctrl.push(`<span class="stepper${why ? ' off' : ''}">◆ หลังลงการ์ดย้ายไป: ${['', ...csDests].map((k) => `<button class="btn sm${!why && (a.csMove || '') === k ? ' on' : ''}" data-act="csMove" data-to="${k}"${why ? ' disabled' : ''}>${k ? esc(AREAS[k].name) : 'ไม่ย้าย'}</button>`).join('')}${why ? `<em class="why">${why}</em>` : ''}</span>`);
  }

  // what the engine changed from the draft
  const notes = [];
  if (a.blocked) notes.push(`2nd Strike ของ ${esc(g.block[p.at].name)}: ที่นี่ผล "ตอนใช้" "ตอนปะทะ" Command Spell และอัญมณีของคุณใช้ไม่ได้รอบนี้`);
  for (const id of a.ids) if (!sel.has(id) && id > 0) notes.push(`เติม ${esc(cardName(cards.find((c) => c.uid === id)))} แบบคว่ำให้ครบ ${PLAY} ใบ`);
  for (const id of forced) if (sel.has(id)) notes.push(`คว่ำ ${esc(cardName(cards.find((c) => c.uid === id)))} เพราะมานาไม่พอ`);
  for (const id of draft.ids) if (!a.ids.includes(id)) { const c = allCards(p).find((x) => x.uid === id); if (c) notes.push(`ไม่ได้ลง ${esc(cardName(c))} (เกินจำนวนหรือมานาไม่พอ)`); }
  if (a.temper) notes.push('Short Temper: รอบ 1 ต้องใช้ Command Spell 1 ดวง · คุณยังไม่ได้ใช้ กด "ลงการ์ด" แล้วเลือกว่าใช้แบบไหน');
  if (g.tsubame(cards)) notes.push(`ลงดาบครบ 3 ใบ: Tsubame Gaeshi พลัง +${TSUBAME} และเปิดชื่อจริง`);
  if (revealing) notes.push(`ลงชุดนี้แล้วชื่อจริงจะเปิด: ${esc(p.sv.name)}`);
  const extras = cards.filter((c) => c.fx?.extra || c.temp).map((c) => cardName(c));
  if (extras.length) notes.push(`ลงเพิ่มนอกเหนือ ${PLAY} ใบ: ${esc(extras.join(', '))}`);
  if (rbQ && !a.blocked) notes.push(`Rule Breaker: ${esc(rbQ.name)} ${rbQ.cs ? 'เสีย Command Spell 1 ดวง' : 'ไม่มี Command Spell'}${rbQ.cs <= 1 ? ' · เหลือ 0 จึง [แพ้] · คุณพลังรวม +10' : ''}`);
  // on-use effects work wherever you are; on-clash ones only on a battlefield (paper 8.3, v5.1)
  for (const c of cards.filter((x) => !x.down)) {
    const fx = c.fx || {};
    if (fx.mana) notes.push(`${esc(cardName(c))}: ได้มานา +${fx.mana} ทันที`);
    if (fx.permanent) notes.push(`${esc(cardName(c))}: ถาวร อยู่ในสนามต่อ มีผลตั้งแต่รอบนี้ · พลังนับรอบนี้รอบเดียว`);
    if (fx.ubw) notes.push(`${esc(cardName(c))}: การ์ดที่ไม่ได้ลงขึ้นมือทั้งหมด · รอบต่อไปจั่วไม่ได้ ลงได้ 0–${UBW_PLAY} ใบ จนการ์ดในมือหมด`);
    if (fx.hide) notes.push(p.revealed || revealing ? `${esc(cardName(c))}: ชื่อจริงกลับไปซ่อน · ได้ ${fx.playVP} VP` : `${esc(cardName(c))}: ชื่อจริงยังซ่อนอยู่ · ได้ ${fx.playVP} VP`);
    if (fx.archer) notes.push(`${esc(cardName(c))}: ได้ ${fx.archer} VP ทันที · ถ้าแพ้การต่อสู้รอบนี้เสีย ${fx.archerLose} VP`);
    if (fx.pierce) notes.push(`${esc(cardName(c))}: ใช้แล้วครั้งต่อไปมานา +${fx.pierce}`);
    if (fx.block && !off) notes.push(`${esc(cardName(c))}: คนอื่นที่${esc(AREAS[f].name)}ใช้ผล "ตอนใช้" "ตอนปะทะ" และ Command Spell ไม่ได้รอบนี้`);
    if (off && cardLines(c).some((l) => l.when === 'clash')) notes.push(`${esc(cardName(c))}: ผล "ตอนปะทะ" ไม่มีผลนอกสนามรบ`);
  }
  if (dest) {
    const from = here ? ' ได้เปรียบพื้นที่เดิมหายไป' : '';
    notes.push(!AREAS[dest].field ? `ย้ายไป${esc(AREAS[dest].name)}หลังลงการ์ด: ได้ ${RECON_VP} VP การ์ดลงกองทิ้ง`
      : `ย้ายไป${esc(AREAS[dest].name)}หลังลงการ์ด: การ์ดตามไป คิดพลังที่นั่น${from}${stolen ? ` · ยึดได้เปรียบพื้นที่ +${stolen}` : ''}`);
  }
  if (off && !dest) notes.push(`อยู่${esc(AREAS[p.at].name)} ไม่ได้สู้: ไม่คิดพลัง การ์ดลงกองทิ้งตามด้านที่ลง`);
  if (a.ids.length && a.ids.every((id) => a.down.includes(id))) notes.push(off ? 'คว่ำทั้ง 2 ใบ: ไม่เสียมานา คนอื่นไม่รู้ว่าทิ้งอะไร' : 'คว่ำทั้ง 2 ใบ: พลังจากการ์ดเป็น 0 แต่ไม่เสียมานา');
  const left = inf ? p.mana : mana - a.cost;
  const gemsLeft = p.gems - a.gemMana - a.gandr;
  const infoLine = info ? `<div class="info"><b>${esc(cardName(info))}</b> · ${esc(cardText(info))}</div>` : '';
  const max = g.maxCards(p);

  return {
    title: `ลงการ์ดที่${AREAS[p.at].name}`,
    sub: `${here ? `${esc(prizeText(p.at))}${prizeText(p.at) ? ' · ' : ''}` : 'ไม่ได้อยู่สนามรบ: ผล "ตอนใช้" ทำงาน ไม่คิดพลัง · การ์ดย้ายพาเข้าสนามรบได้ · '}${g.ubwOn(p) ? `ลง 0–${max} ใบ (Unlimited Blade Works)` : `เลือก ${max} ใบ`}${inf ? ' (The Tainted Grail: มานาไม่จำกัด)' : ''} · หงาย = จ่ายมานาและมีพลัง · คว่ำ = พลัง 0 มานา 0 · NP/สกิลต้องมีมานา ${SKILL_MANA}+`,
    mini: `${off ? (dest ? `ย้ายไป${esc(AREAS[dest].name)}` : 'ไม่คิดพลัง') : `พลังรวม ${pw.total}`} · มานาเหลือ ${left} · เลือกแล้ว ${a.ids.length} ใบ`,
    wide: true,
    html: `${foes ? `<div class="foes">${foes}</div>` : AREAS[f].field ? '<p class="p-text">ยังไม่มีคู่ต่อสู้ที่นี่ (คนที่ยังไม่เล่นอาจย้ายเข้ามา)</p>' : ''}
      <div class="cgroups"><div class="cg"><p class="row-lab">การ์ดในมือ${p.specials.length ? ' · สกิล Master (กรอบเขียว)' : ''}</p><div class="cards">${handCards}${specials}</div></div>
        <div class="cg"><p class="row-lab">การ์ด NP/สกิล · ${esc(p.sv.cls)}</p><div class="cards">${skills}</div></div></div>
      ${deckRow}${infoLine}
      ${ctrl.length ? `<div class="ctrl"><span class="row-lab">Command Spell (เหลือ ${p.cs})</span>${ctrl.join('')}</div>` : ''}
      <div class="sum">${off ? `<div class="parts">${dest ? `ย้ายไป${esc(AREAS[dest].name)}` : `อยู่${esc(AREAS[p.at].name)}`} · ไม่คิดพลัง</div>` : pwDrop(pw, p, { label: `ที่มาของพลังรวม${dest ? `ที่${esc(AREAS[f].name)}` : ''}`, dk: 'cards' })}${notes.map((n) => `<div class="warn">${n}</div>`).join('')}</div>`,
    foot: `<div class="tot"><span class="dim">${off ? 'ไม่คิดพลัง' : `พลังรวม${dest ? `ที่${esc(AREAS[f].name)}` : ''}`}</span><b>${off ? '–' : pw.total}</b></div>
      <div class="num"><div>${inf ? 'มานาไม่จำกัด' : `มานา ${mana} − ${a.cost} = <b style="color:var(--mana)">${left}</b>`}</div><div class="dim">${p.m.key === 'rin' ? `อัญมณีเหลือ ${gemsLeft} · ` : ''}Command Spell เหลือ ${csLeft - a.cs2 - (a.csMove ? 1 : 0) - (a.temper === 'mana' ? 1 : 0)}</div></div>
      <div class="acts"><button class="btn ghost" data-act="clear" title="เอาการ์ดที่เลือกออกทั้งหมด ล้าง Command Spell อัญมณี และตัวเลือกของสกิล">รีเซ็ตทั้งหมด</button><button class="btn ghost" data-act="reset">ใช้ชุดที่แนะนำ</button><button class="btn primary" data-act="play">ลงการ์ด${off ? '' : ` · พลัง ${pw.total}`}</button></div>`,
  };
}

// ---------- skill choices (paper 4.6 item 8) ----------
// A small pop-up over the card step asks one thing: where a move card goes, Gate of Babylon's
// types, Rule Breaker's target, which gem to use, how Short Temper's Command Spell is used; in the
// fight, 1st Strike's two cards. The suggested answer comes picked; nothing changes before ยืนยัน.
// Bots never see it and choose as before.
const cardOf = (uid) => allCards(me()).find((c) => c.uid === uid) || null;
const rbF = (a) => a.moveTo || a.csMove || me().at; // where the cards end up
const rbTargets = (a) => (AREAS[rbF(a)].field ? g.here(rbF(a)).filter((q) => q !== me()) : []);
// which choice a picked card asks for: where it moves, Gate of Babylon's types, Rule Breaker's target
function choiceKind(c, a) {
  if (!c || a.blocked || !a.ids.includes(c.uid) || a.down.includes(c.uid)) return '';
  if ((c.fx?.move || c.fx?.bell) && g.cardDests(me(), c).length) return 'move';
  if (c.fx?.gate) return 'gate';
  if (c.fx?.ruleBreaker && rbTargets(a).length) return 'rb';
  return '';
}
// the tag under a picked card that made a choice; a tap opens the pop-up again
function choiceTag(c, a) {
  const k = choiceKind(c, a);
  if (!k) return '';
  const p = me();
  const short = (f) => AREAS[f].name.replace(/^ย่าน/, '');
  const txt = k === 'move' ? (a.mover === c.uid && a.moveTo ? (a.moveTo === p.at ? 'อยู่ที่นี่ · ยึดพื้นที่' : `→ ${short(a.moveTo)}`) : 'ไม่ย้าย')
    : k === 'gate' ? `${a.gate.length ? a.gate.map((t) => TYPES[t]).join(' ') : 'NP อย่างเดียว'} · X=${a.gate.length}`
    : `เป้าหมาย: ${g.players[a.rbTarget]?.name || '–'}`;
  return `<button class="ctag" data-act="copen" data-k="${k}" data-uid="${c.uid}" title="แตะเพื่อเปลี่ยน">${esc(txt)} ▾</button>`;
}
// Rin's gems: a tile in the Master card row opens the gem pop-up; chips show what this play uses
function gemTile(a) {
  const p = me();
  const left = p.gems - a.gemMana - a.gandr;
  const why = a.blocked ? '2nd Strike ใช้ไม่ได้' : p.gems <= 0 ? 'อัญมณีหมด' : '';
  const chip1 = (k, t) => `<button class="ctag" data-act="gemoff" data-g="${k}" title="แตะเพื่อเอาออก">${t} ✕</button>`;
  const chips = (a.gemMana ? chip1('gemMana', `มานา +${a.gemMana}`) : '') + (a.gandr ? chip1('gandr', `Gandr Shot ${a.gandr} ใบ`) : '');
  return `<div class="pickcol"><button class="card tM sp has-src gem${why ? ' lock' : ''}" data-act="copen" data-k="gem"${why ? ' disabled' : ''} title="อัญมณีของริน: มานา +1 · Gandr Shot · ทิ้งแล้วจั่ว">
    <b class="src ms">สกิล<span class="who"> Master</span></b><span class="ty">อัญมณี</span><span class="pw">◈</span><span><span class="nm">Gem</span><span class="fx">${why || `เหลือ ${left} · แตะเลือก`}</span></span></button>${chips}</div>`;
}
const foesAt = (k) => {
  const qs = g.here(k).filter((q) => q !== me());
  return `${qs.length ? `อยู่ ${qs.length} คน: ${qs.map((q) => esc(q.name)).join(', ')}` : 'ยังไม่มีใคร'} · ${esc(prizeText(k))}`;
};

function openChoice(k, uid = null, re = false) {
  if (k === 'strike1') { if (wait?.kind === 'strike1' && !choice) { choice = { k, sel: strikeStart(wait.ctx) }; render(); } return; }
  if (wait?.kind !== 'cards') return;
  choice = { k, uid, re, sel: null };
  choice.sel = choiceStart();
  if (k === 'gem') swapSel.clear();
  render();
}
// the answer picked when the pop-up opens: the current one when it was opened from its tag, else the suggestion
function choiceStart() {
  const { k, uid, re } = choice;
  const p = me();
  const a = g.cleanCards(p, draft);
  if (k === 'move') {
    const opts = cardMoveOpts(cardOf(uid));
    const now = a.mover === uid ? a.moveTo || '' : '';
    return re && opts.some((o) => o.v === now && !o.dis) ? now : moveRec(opts);
  }
  if (k === 'gate') {
    if (re) return [...a.gate];
    const sel = [];
    for (const t of gateTypes(g, rbF(a))) if (gateFits([...sel, t])) sel.push(t);
    return sel;
  }
  if (k === 'rb') return re && a.rbTarget != null ? a.rbTarget : g.rbAuto(rbTargets(a))?.id ?? null;
  if (k === 'gem') return gemRec(a);
  if (k === 'temper') return a.temper === 'power' ? 'power' : 'mana';
  return null;
}
const strikeStart = (ctx) => ({ mine: ctx.mine[0], foe: ctx.foes[0]?.uid ?? null }); // the strongest of each

function choiceBody() {
  const ch = choice;
  if (ch.k === 'strike1') return myTurn() && wait.kind === 'strike1' ? strikeChoice() : null;
  if (!myTurn() || wait.kind !== 'cards') return null;
  if (ch.k === 'gem') return me().m.key === 'rin' ? gemChoice() : null;
  if (ch.k === 'temper') return temperChoice();
  const c = cardOf(ch.uid);
  if (!c || !draft.ids.includes(c.uid)) return null;
  if (ch.k === 'move') return moveChoice(c);
  if (ch.k === 'gate') return gateChoice(c);
  if (ch.k === 'rb') return rbChoice(c);
  return null;
}
// one answer: what it is, what it gives, and why it cannot be picked now
function copt(v, label, sub, o = {}) {
  const on = o.on ?? String(choice.sel) === String(v);
  return `<button class="copt${on ? ' on' : ''}${o.multi ? ' multi' : ''}" data-act="${o.act || 'cpick'}" data-v="${esc(v)}"${o.g ? ` data-g="${o.g}"` : ''} aria-pressed="${on}"${o.dis ? ' disabled' : ''}>
    <b>${label}${o.rec ? '<em class="rec">แนะนำ</em>' : ''}</b>${sub ? `<span>${sub}</span>` : ''}${o.dis ? `<span class="why">${esc(o.dis)}</span>` : ''}</button>`;
}
const cFoot = (ok, no = 'ยกเลิก · เอาการ์ดออก', okDis = false) => `${no ? `<button class="btn ghost" data-act="cno">${no}</button>` : ''}<button class="btn primary" data-act="cok"${okDis ? ' disabled' : ''}>${ok}</button>`;

// Lancer Class, Bellerophon (may stay to take the advantage) and Surveil (the next area only)
function cardMoveOpts(c) {
  const p = me();
  const reach = new Set(g.cardDests(p, c));
  const next = PATH[PATH.indexOf(p.at) + 1];
  const named = c.fx.move === 'next' ? [next].filter(Boolean) : PATH.slice(1).filter((k) => k !== p.at || (c.fx.bell && AREAS[k].field));
  const opts = named.map((k) => ({ v: k, r: preview({ ...draft, moveTo: k, mover: c.uid }), dis: reach.has(k) ? '' : k === 'recon' ? 'มีคนอยู่ลาดตระเวนแล้ว (รับ 1 คน)' : 'ไปไม่ได้' }));
  // Bellerophon staying in a battlefield seizes the terrain, so it needs no "don't move" as well
  if (!(c.fx.bell && reach.has(p.at))) opts.push({ v: '', r: preview({ ...draft, moveTo: null, mover: null }) });
  return opts;
}
function moveRec(opts) {
  const p = me();
  let best = null;
  for (const o of opts) {
    if (o.dis) continue;
    const at = o.v || (AREAS[o.r.f].field ? o.r.f : null);
    const v = destValue(g, p, at, o.r.pw.total) + (!o.v || o.v === p.at ? 0.01 : 0); // a tie stays put
    if (!best || v > best.v) best = { v, k: o.v };
  }
  return best ? best.k : '';
}
function moveChoice(c) {
  const p = me();
  const opts = cardMoveOpts(c);
  const rec = moveRec(opts);
  const rows = opts.map((o) => {
    const { r } = o;
    let label, sub;
    if (!o.v) {
      label = 'ไม่ย้าย';
      sub = AREAS[r.f].field ? `สู้ที่${esc(AREAS[r.f].name)} · ${foesAt(r.f)} · พลังรวม ${r.pw.total}` : `อยู่${esc(AREAS[r.f].name)} · ไม่คิดพลัง`;
    } else if (o.v === p.at) {
      label = `อยู่${esc(AREAS[o.v].name)} · ยึดได้เปรียบพื้นที่`;
      sub = `${foesAt(o.v)} · ยึดทั้ง 2 ช่อง +${TERRAIN.reduce((s2, t) => s2 + t, 0)} · คนอื่นที่นี่เสียได้เปรียบ · พลังรวม ${r.pw.total}`;
    } else if (!AREAS[o.v].field) {
      label = `ย้ายไป${esc(AREAS[o.v].name)}`;
      sub = `ได้ ${RECON_VP} VP ทันที · ไม่ได้สู้ การ์ดลงกองทิ้ง`;
    } else {
      label = `ย้ายไป${esc(AREAS[o.v].name)}`;
      sub = `${foesAt(o.v)} · พลังรวม ${r.pw.total}${r.stolen ? ` · ยึดได้เปรียบ +${r.stolen}` : ''}${p.terrain && AREAS[p.at].field ? ` · ได้เปรียบเดิม +${p.terrain} หายไป` : ''}`;
    }
    return copt(o.v, label, sub, { dis: o.dis, rec: !o.dis && o.v === rec });
  }).join('');
  return { title: c.name, sub: esc(cardText(c)), html: `<div class="copts">${rows}</div>`, foot: cFoot('ยืนยัน') };
}

// Gate of Babylon: the types it counts as besides NP (not Special), X mana = how many [FD]
function gateFits(sel) {
  const p = me();
  const base = forcedDown(g.cleanCards(p, { ...draft, gate: [] }));
  const a = g.cleanCards(p, { ...draft, gate: sel });
  return a.gate.length === sel.length && !a.down.some((id) => draft.ids.includes(id) && !draft.down.includes(id) && !base.has(id)); // filled-in face-down cards don't count
}
function gateChoice(c) {
  const sel = choice.sel;
  const now = preview({ ...draft, gate: sel });
  const rec = new Set(gateTypes(g, now.f));
  const rows = ['S', 'A', 'M'].map((t) => {
    const on = sel.includes(t);
    const other = preview({ ...draft, gate: on ? sel.filter((x) => x !== t) : [...sel, t] });
    const [withT, without] = on ? [now, other] : [other, now];
    const gain = withT.pw.total - without.pw.total;
    // what the type brings: situation or event cards for it, or the same-type bonus
    const row = withT.pw.rows?.find((x) => x.k === 'card' && x.uid === c.uid);
    const why = (row?.mods || []).filter((m) => m.n > 0 && m.t.includes(TYPES[t])).map((m) => m.t);
    const uni = (r) => r.pw.rows?.find((x) => x.k === 'part' && x.label === 'การ์ดชนิดเดียวกัน');
    if (uni(withT) && !uni(without)) why.push(`การ์ดชนิดเดียวกัน +${uni(withT).n}`);
    const sub = `${now.off ? 'ไม่ได้อยู่สนามรบ ไม่คิดพลัง' : gain ? `พลังรวม +${gain}` : 'พลังรวมไม่เปลี่ยน'}${why.length ? ` · ${esc(why.join(' · '))}` : ''} · มานา +1`;
    return copt(t, `นับเป็น${typeHtml({ type: t })}`, sub, { act: 'ctog', multi: true, on, rec: rec.has(t), dis: on || gateFits([...sel, t]) ? '' : 'มานาไม่พอ' });
  }).join('');
  const left = now.a.budget === Infinity ? 'ไม่จำกัด' : now.a.budget - now.a.cost;
  return {
    title: c.name,
    sub: esc(cardText(c)),
    html: `<p class="p-text">เลือกได้หลายชนิด หรือไม่เลือกเลย · มานา X = จำนวนชนิดที่เลือก</p><div class="copts">${rows}</div>
      <p class="cnow">มานา X = <b>${sel.length}</b> · มานาเหลือหลังจ่าย ${left}${now.off ? '' : ` · พลังรวม ${now.pw.total}`}</p>`,
    foot: cFoot('ยืนยัน'),
  };
}

function rbChoice(c) {
  const a = g.cleanCards(me(), draft);
  const qs = rbTargets(a);
  const rec = g.rbAuto(qs);
  const what = (q) => (q.cs >= 2 ? `เสีย Command Spell 1 ดวง (เหลือ ${q.cs - 1})` : q.cs === 1 ? 'เสีย Command Spell ดวงสุดท้าย · เขา [แพ้] · คุณพลังรวม +10' : 'ไม่มี Command Spell · เขา [แพ้] · คุณพลังรวม +10');
  const rows = qs.map((q) => copt(q.id, `${esc(q.name)} · ◆ ${q.cs}`, `${what(q)} · ${q.play ? `พลัง ${q.play.pre}` : 'ยังไม่ลงการ์ด'} · ${q.vp} VP`, { rec: q === rec })).join('');
  return { title: c.name, sub: esc(cardText(c)), html: `<p class="p-text">เลือก Master 1 คนใน${esc(AREAS[rbF(a)].name)}</p><div class="copts">${rows}</div>`, foot: cFoot('ยืนยัน') };
}

// Rin's gem [FD]: one gem for one of mana +1, Gandr Shot, or discard 1–3 and draw; each once a round
// (up to 3 times in the climax)
function gemState(a) {
  const p = me();
  const lim = g.gemLimit();
  const left = p.gems - a.gemMana - a.gandr;
  const block = a.blocked ? '2nd Strike: ใช้อัญมณีที่นี่ไม่ได้' : left <= 0 ? 'อัญมณีหมด' : '';
  const used = lim > 1 ? `ครบ ${lim} ครั้งแล้วรอบนี้` : 'เลือกแล้วรอบนี้';
  return {
    mana: block || (a.gemMana >= lim ? used : a.budget >= MANA_MAX ? 'มานาเต็มแล้ว' : ''),
    gandr: block || (a.gandr >= lim ? used : ''),
    swap: (a.blocked ? block : p.gems <= 0 ? 'อัญมณีหมด' : '') || ((p.roundUse.swaps || 0) >= lim ? used : g.ubwOn(p) ? 'Unlimited Blade Works: ทิ้งจั่วไม่ได้' : !p.hand.length ? 'ไม่มีการ์ดในมือ' : ''),
  };
}
function gemRec(a) {
  const st = gemState(a);
  const order = forcedDown(a).size ? ['mana', 'gandr', 'swap'] : !AREAS[rbF(a)].field ? ['mana', 'swap', 'gandr'] : ['gandr', 'mana', 'swap'];
  return order.find((k) => !st[k]) || null;
}
function gemChoice() {
  const p = me();
  const r = preview();
  const { a } = r;
  const st = gemState(a);
  const sel = choice.sel;
  const rec = gemRec(a);
  const g1 = !r.off && !st.gandr ? preview({ ...draft, gandr: a.gandr + 1 }) : null;
  const lim = g.gemLimit();
  const rows = copt('mana', 'มานา +1', `มานา ${a.budget === Infinity ? 'ไม่จำกัด' : `${a.budget} → ${Math.min(MANA_MAX, a.budget + 1)}`}${forcedDown(a).size ? ' · หงายการ์ดที่มานาไม่พอได้' : ''}`, { dis: st.mana, rec: rec === 'mana' })
    + copt('gandr', 'Gandr Shot', `การ์ดเวทพลัง ${GANDR.power} ลงเพิ่มนอก ${PLAY} ใบ · ${r.off ? 'ไม่ได้อยู่สนามรบ ไม่คิดพลัง' : g1 ? `พลังรวม ${r.pw.total} → ${g1.pw.total}` : 'ใช้รอบเดียว'}`, { dis: st.gandr, rec: rec === 'gandr' })
    + copt('swap', 'ทิ้ง 1–3 ใบแล้วจั่วใหม่', 'การ์ดที่ทิ้งลงกองทิ้งแบบคว่ำ แล้วจั่วเท่ากัน · หน้าลงการ์ดเริ่มชุดแนะนำใหม่', { dis: st.swap, rec: rec === 'swap' });
  const hand = sel === 'swap' ? `<div class="pop-sec"><p class="row-lab">เลือกการ์ดที่จะทิ้ง 1–3 ใบ</p><div class="cards">${p.hand.map((c) => tile(c, { btn: true, act: 'swappick', mini: true, sel: swapSel.has(c.uid) })).join('')}</div></div>` : '';
  const ok = sel === 'swap' ? (swapSel.size ? `ทิ้ง ${swapSel.size} ใบแล้วจั่วใหม่` : 'เลือกใบที่จะทิ้ง') : 'ยืนยัน · ใช้อัญมณี 1 ใบ';
  return {
    title: 'Gem · อัญมณีของริน',
    sub: `เหลือ ${p.gems - a.gemMana - a.gandr} ใบ · 1 ใบต่อ 1 อย่าง · ${lim > 1 ? `ไคลแมกซ์เลือกอย่างเดิมได้ถึง ${lim} ครั้ง` : 'แต่ละอย่างรอบละครั้ง'}`,
    html: `<div class="copts">${rows}</div>${hand}`,
    foot: cFoot(ok, 'ยกเลิก', !sel || !!st[sel] || (sel === 'swap' && !swapSel.size)),
  };
}

// Short Temper [FD]: in round 1 Rin must use a Command Spell; she picks how when she lays the cards
function temperChoice() {
  const p = me();
  const r = preview();
  const { a } = r;
  if (!a.temper) return null;
  const base = r.pw.total - (a.temper === 'power' ? CS_POWER : 0);
  const fieldOk = AREAS[r.f].field && !g.blocked(p, r.f);
  const csDests = PATH.slice(1).filter((k) => k !== p.at && (k !== 'recon' || g.reconFree(p)));
  const rows = copt('power', `◆ พลัง +${CS_POWER}`, fieldOk ? `พลังรวม ${base} → ${base + CS_POWER} · ชนะได้ VP +${CS_VP}` : '', { dis: fieldOk ? '' : 'ไม่ได้อยู่สนามรบ', rec: a.temper === 'power' })
    + copt('mana', `◆ มานา +${CS_MANA}`, `ได้มานาตอนนี้ · หลังต่อสู้เสียมานา ${CS_MANA} (Short Temper)`, { rec: a.temper === 'mana' })
    + csDests.map((k) => {
      const m = preview({ ...draft, csMove: k });
      return copt(`move:${k}`, `◆ ย้ายไป${esc(AREAS[k].name)}หลังลงการ์ด`, AREAS[k].field ? `การ์ดตามไป · ${foesAt(k)} · พลังรวม ${m.pw.total}` : `ได้ ${RECON_VP} VP ทันที · การ์ดลงกองทิ้ง`, { dis: a.moveTo ? 'การ์ดย้ายแล้ว' : '' });
    }).join('');
  return { title: 'Short Temper · ริน', sub: `รอบ 1 ต้องใช้ Command Spell 1 ดวง (เหลือ ${p.cs}) · เลือกว่าใช้แบบไหน แล้วลงการ์ด`, html: `<div class="copts">${rows}</div>`, foot: cFoot('ยืนยันแล้วลงการ์ด', 'ยกเลิก') };
}

// 1st Strike in the fight (step 4.1): the Strength card it lays from the hand, and the foe's card it turns off
function strikeChoice() {
  const p = me();
  const { f, mine, foes, card } = wait.ctx;
  const s1 = p.play?.cards.find((c) => c.uid === card);
  const pw = (q, c) => g.cardPower(q, c, { f });
  const sel = choice.sel;
  const my = mine.map((uid) => p.hand.find((c) => c.uid === uid)).filter(Boolean).map((c) => ({ ...c, down: false })); // laid face up
  const theirs = foes.map(({ id, uid }) => ({ q: g.players[id], c: g.players[id].play?.cards.find((x) => x.uid === uid) })).filter((x) => x.c);
  const a = my.map((c, i) => copt(c.uid, `${bcard(c, p)}<span>${esc(cardName(c))} · พลัง ${pw(p, c)}</span>`, '', { g: 'mine', on: sel.mine === c.uid, rec: i === 0 })).join('');
  const b = theirs.map(({ q, c }, i) => copt(c.uid, `${bcard(c, q)}<span>${esc(q.name)}: ${esc(cardName(c))} · พลัง ${pw(q, c)}</span>`, '', { g: 'foe', on: sel.foe === c.uid, rec: i === 0 })).join('');
  return {
    title: '1st Strike · ตอนปะทะ',
    sub: `${esc(AREAS[f].name)} · ขั้น 4.1 · ใบนี้ปิดตัวเอง ลงการ์ดกำลังพื้นฐานจากมือ 1 ใบโดยไม่จ่ายมานา · ได้มานา +${s1?.fx?.strike1 ?? 2}`,
    html: `<div class="pop-sec"><p class="row-lab">ลงการ์ดกำลังพื้นฐานจากมือ</p><div class="copts">${a}</div></div>
      ${b ? `<div class="pop-sec"><p class="row-lab">ปิดการ์ดพื้นฐานของคู่ต่อสู้ 1 ใบ (พลังเป็น 0 และไม่มีผล)</p><div class="copts">${b}</div></div>` : '<p class="p-text">คู่ต่อสู้ไม่มีการ์ดพื้นฐานหงายอยู่ ไม่มีใบที่ถูกปิด</p>'}`,
    foot: cFoot('ยืนยัน', ''),
  };
}

function choiceOk() {
  const ch = choice;
  if (!ch) return;
  if (ch.k === 'strike1') { if (wait?.kind === 'strike1') answer({ card: ch.sel.mine, target: ch.sel.foe }); return; }
  if (wait?.kind !== 'cards') { choice = null; render(); return; }
  const d = draft;
  const p = me();
  if (ch.k === 'move') {
    if (ch.sel) { d.moveTo = ch.sel; d.mover = ch.uid; d.csMove = null; } // one move a play
    else if (g.cleanCards(p, d).mover === ch.uid) { d.moveTo = null; d.mover = null; }
  }
  if (ch.k === 'gate') d.gate = [...ch.sel];
  if (ch.k === 'rb') d.rbTarget = ch.sel;
  if (ch.k === 'gem') {
    if (ch.sel === 'swap') { if (swapSel.size) answer({ swap: [...swapSel] }); return; }
    if (ch.sel === 'mana') d.gemMana = (d.gemMana || 0) + 1;
    if (ch.sel === 'gandr') d.gandr = (d.gandr || 0) + 1;
  }
  if (ch.k === 'temper') {
    d.down = [...new Set([...d.down, ...forcedDown(g.cleanCards(p, d))])]; // keep the sides the card step showed
    if (ch.sel === 'power') d.cs2 = 1;
    else if (ch.sel === 'mana') d.cs4 = true;
    else if (ch.sel?.startsWith('move:')) d.csMove = ch.sel.slice(5);
    answer({ ...d });
    return;
  }
  choice = null;
  render();
}
// ยกเลิก: a card's choice takes the card out of the play; the gem and Short Temper just close
function choiceNo() {
  const ch = choice;
  if (!ch || ch.k === 'strike1') return;
  choice = null;
  swapSel.clear();
  if (['move', 'gate', 'rb'].includes(ch.k) && wait?.kind === 'cards') dropPick(ch.uid);
  render();
}
// take a picked card out of the draft, with what it chose
function dropPick(uid) {
  const d = draft;
  const p = me();
  const c = cardOf(uid);
  if (g.cleanCards(p, d).mover === uid || d.mover === uid) { d.moveTo = null; d.mover = null; }
  d.ids = d.ids.filter((x) => x !== uid);
  d.down = d.down.filter((x) => x !== uid);
  if (c?.fx?.ubw) d.ids = d.ids.filter((x) => !p.deck.some((k) => k.uid === x)); // dropping UBW also drops the deck cards it brought
  if (c?.fx?.gate) d.gate = [];
  if (c?.fx?.ruleBreaker) d.rbTarget = null;
}
// a card just picked (or turned face up) that needs a choice opens its pop-up
function autoChoice(uid) {
  const k = choiceKind(cardOf(uid), g.cleanCards(me(), draft));
  if (k) openChoice(k, uid, false);
}
// รีเซ็ตทั้งหมด (paper 4.6 item 10): nothing picked, every card face up, no Command Spell, gem or skill choice
function clearDraft() {
  draft = { ids: [], down: [], cs4: false, cs2: 0, gemMana: 0, gandr: 0, gate: [], moveTo: null, mover: null, csMove: null, rbTarget: null };
  info = null; choice = null; swapSel.clear();
  render();
}

// drawn like the main pop-up: the frame once per question, then only the parts that changed
function drawChoice() {
  const el = $('#cpop');
  const b = choice && started ? choiceBody() : null;
  if (!b) {
    if (choice && started) choice = null;
    el.hidden = true; el.innerHTML = ''; delete el.dataset.k;
    return;
  }
  const key = `${choice.k}:${choice.uid ?? ''}`;
  let dlg = el.querySelector('.pop-dlg');
  if (el.dataset.k !== key || !dlg) {
    el.innerHTML = '<div class="pop-dlg choice" role="dialog" aria-modal="true"><div class="pop-head"><div class="pop-title"><h2></h2><span class="sub"></span></div></div><div class="pop-body"></div><div class="pop-foot"></div></div>';
    el.dataset.k = key;
    dlg = el.querySelector('.pop-dlg');
    drawChoice.last = {};
  }
  const last = drawChoice.last;
  const set = (sel, html) => { if (last[sel] !== html) { last[sel] = html; dlg.querySelector(sel).innerHTML = html; } };
  dlg.setAttribute('aria-label', b.title);
  set('h2', esc(b.title));
  set('.sub', b.sub || '');
  set('.pop-body', b.html);
  set('.pop-foot', b.foot || '');
  el.hidden = false;
}

// ---------- where the power comes from (paper 4.6 item 9) ----------
// One line per card and bonus, then the total. Gains are green, losses red, on-clash lines tagged.
// Someone else's face-down card shows only "การ์ดคว่ำ 0" (paper 4.3).
function pwTable(pw, q) {
  const CL = '<em class="clash">ตอนปะทะ</em>';
  const mod = (m) => `<span class="pm">${m.mul ? `<b class="up">×${m.mul}</b>` : m.zero ? '<b class="dn">→ 0</b>' : `<b class="${m.n < 0 ? 'dn' : m.n ? 'up' : ''}">${m.n ? sgn(m.n) : '·'}</b>`} ${esc(m.t)}${m.clash ? CL : ''}</span>`;
  const tr = (cls, lab, mods, v) => `<tr class="${cls}"><th scope="row">${lab}</th><td>${mods}</td><td class="v">${v}</td></tr>`;
  const rows = (pw.rows || []).map((r) => {
    if (r.k === 'card') {
      if (r.down && !q.isHuman) return tr('down', 'การ์ดคว่ำ', '', 0);
      const lab = `${r.down ? 'คว่ำ · ' : ''}${r.name ? `${esc(r.name)} · ` : ''}${typeHtml(r)} ${r.base}${r.clashIn ? CL : ''}`;
      return tr(r.down ? 'down' : '', lab, r.down ? '<span class="pm dim">ลงคว่ำ พลัง 0</span>' : r.mods.map(mod).join(''), r.val);
    }
    if (r.k === 'terrain') return tr('ter', r.base ? `ได้เปรียบพื้นที่ +${r.base}` : 'ได้เปรียบพื้นที่', r.base ? r.mods.map(mod).join('') : `<span class="pm dim">${esc(r.none)}</span>`, sgn(r.val));
    return tr(r.clash ? 'pw-clash' : '', `${esc(r.label)}${r.clash ? CL : ''}`, r.note ? `<span class="pm dim">${esc(r.note)}</span>` : '', sgn(r.n));
  }).join('');
  return `<table class="pwt"><tbody>${rows}${tr('pw-total', 'พลังรวม', '', pw.total)}</tbody></table>`;
}
// the table folded into a dropdown: one short line ("การ์ด 6 · พื้นที่ +3 ▾"), a tap opens the table
// (B 30 ต.ค. 2026: "ข้อมูลเยอะไปให้ทำดรอปดาว"); dk names it so a redraw keeps it open
function pwDrop(pw, q, { label = 'ที่มาของพลัง', dk = '' } = {}) {
  const open = dk && openDrops.has(dk);
  return `<details class="pwd"${dk ? ` data-dk="${esc(dk)}"` : ''}${open ? ' open' : ''}><summary><span class="pwd-l">${label}</span><span class="pwd-s">${esc(shortParts(pw.parts || []))}</span></summary>${pwTable(pw, q)}</details>`;
}
// one Master's power in a fight, from a tap on their row in the battle window; ‹ › step through the fight
function pwPop(f, id) {
  const res = g.phase === 'combat' ? g.results.find((r) => r.f === f && !r.alone) : null;
  const people = res ? res.ents.map((e) => g.players[e.id]) : g.order().filter((q) => q.at === f && q.play);
  const i = people.findIndex((q) => q.id === id);
  if (i < 0) return null;
  const q = people[i];
  const e = res?.ents.find((x) => x.id === id);
  const pw = e ? { rows: e.rows || [], total: e.power } : g.powerOf(q, q.play, { detail: true });
  const cards = (e?.cards || q.play.cards).map((c) => (c.down && !q.isHuman ? tile(c, { back: true, mini: true }) : tile(c, { mini: true }))).join('');
  const what = !e ? 'ก่อนต่อสู้ · ผล "ตอนปะทะ" ยังไม่ทำงาน' : e.defeated ? '[แพ้]' : e.won ? `ชนะ ${pm(e.gain)} VP` : `แพ้${e.gain ? ` ${pm(e.gain)} VP` : ''}`;
  const step = (dd, label) => { const n = people[(i + dd + people.length) % people.length]; return `<button class="btn" data-act="pwrow" data-id="${n.id}" aria-label="${label}">${dd < 0 ? '‹' : '›'}</button>`; };
  return {
    title: `พลังของ ${q.name}${q.isHuman ? ' (คุณ)' : ''}`,
    sub: `${esc(AREAS[f].name)} · ${esc(what)}`,
    mini: `${esc(q.name)} · พลัง ${pw.total}`,
    html: `<div class="foe">${chip(q)}<div class="cards">${cards}</div></div>${pwTable(pw, q)}${e?.notes?.length ? `<p class="p-text pw-notes">${e.notes.map(esc).join(' · ')}</p>` : ''}`,
    foot: people.length > 1 ? `<div class="acts cv-nav">${step(-1, 'คนก่อนหน้า')}<span class="dim">${i + 1} / ${people.length}</span>${step(1, 'คนถัดไป')}</div>` : '',
  };
}

// a card window (paper 8.0): the cards you can use now; using one asks again while more can be used
function winPop() {
  const p = me();
  const w = WINDOWS[wait.ctx.w];
  const cards = wait.ctx.cards.map((uid) => barCards(p).find((c) => c.uid === uid)).filter(Boolean);
  const rows = cards.map((c) => {
    const u = g.useLine(p, c, wait.ctx.w);
    return `<div class="dk wuse">${tile({ ...c, down: false }, { note: '' })}<div class="dk-tx"><b>${esc(cardName(c))}</b>
      <span class="dk-meta"><span class="when w-${u.when}">${esc(lineText({ when: u.when, where: u.where || 'any', cond: u.cond }))}</span> ${typeHtml(c)} · พลัง ${c.power} · มานา ${g.costOf(p, c)}</span>
      <span>${esc(cardText(c))}</span><span class="acts"><button class="btn sm primary" data-act="winuse" data-uid="${c.uid}">ใช้ใบนี้${g.costOf(p, c) ? ` · มานา ${g.costOf(p, c)}` : ''}</button></span></div></div>`;
  }).join('');
  return {
    title: `ช่วง${w.name} · ขั้น ${w.code}`,
    sub: `การ์ดที่ใช้ในช่วงนี้ไม่นับเป็น ${PLAY} ใบที่ลงตอนลงการ์ด · จ่ายมานาตามการ์ด · มานาคุณ ${p.mana}`,
    mini: `ช่วง${w.name} · ใช้ได้ ${cards.length} ใบ`,
    html: `<div class="dkl">${rows}</div><p class="p-text">ใช้แล้วหงายให้ทุกคนเห็น · การ์ดโจมตีลงกองทิ้ง · การ์ด NP/สกิลหงายกลับข้างไพ่ทาโรต์ · Black Shadow ใช้แล้วหายไป · ใช้หลายใบติดกันได้ถ้ามานาพอ</p>`,
    foot: `<span class="dim">ไม่ใช้ก็ผ่านได้</span><button class="btn" data-act="winpass">ผ่าน</button>`,
  };
}

function stepper(key, label, v, max) {
  return `<span class="stepper"><span>${label}</span><button data-act="step" data-key="${key}" data-d="-1" aria-label="ลด"${v <= 0 ? ' disabled' : ''}>−</button><b>${v}</b><button data-act="step" data-key="${key}" data-d="1" aria-label="เพิ่ม"${v >= max ? ' disabled' : ''}>+</button></span>`;
}

// my Master board in full: tarot, abilities, resources, cards, piles (paper section 4.2)
function mePop() {
  const p = me();
  const hand = p.hand.map((c) => tile(c)).join('') + p.specials.map((c) => tile(c, { note: specialNote(c) })).join('');
  const skills = p.skills.map((c) => tile(c, { note: skillNote(c), lock: skillLocked(c), cost: costNow(c) })).join('');
  const trash = p.trash.slice(-5).map((c) => tile(c, { mini: true })).join('') || '<span class="dim">ว่าง</span>';
  return {
    title: 'กระดาน Master ของคุณ',
    wide: true,
    html: `${meHead(p)}${meStats(p)}
      <div class="me-row"><span class="p-text">สำรับ ${p.deck.length} ใบ · กองทิ้ง ${p.trash.length} ใบ</span><button class="btn sm" data-act="pop" data-k="deck">ดูเดค · รายละเอียดการ์ดทุกใบ</button></div>
      <div class="cgroups"><div class="cg"><p class="row-lab">การ์ดในมือ ${p.hand.length}${p.specials.length ? ' + สกิล Master' : ''}</p><div class="cards">${hand || '<span class="dim">ยังไม่มีการ์ด</span>'}</div></div>
        <div class="cg"><p class="row-lab">การ์ด NP/สกิล · คว่ำจนกว่าจะใช้ · ถาวรอยู่ในสนามจนจบเกม</p><div class="cards">${skills}</div></div></div>
      <div class="pop-sec"><p class="row-lab">ความสามารถ Master</p><ul class="abil">${p.m.abil.map(([t, d]) => `<li><b>${esc(t)}</b>${d ? `<span>${esc(d)}</span>` : ''}</li>`).join('')}</ul></div>
      <div class="pop-sec"><p class="row-lab">กองทิ้ง ${p.trash.length} ใบ · 5 ใบล่าสุด · วางตามด้านที่ลง คนอื่นเห็นแค่ใบหงาย · สำรับเหลือ ${p.deck.length} ใบ</p><div class="cards">${trash}</div></div>
      <p class="p-text">${p.revealed ? 'ไพ่ทาโรต์หงายแล้ว ทุกคนเห็นว่าคุณเป็นใคร' : 'ไพ่ทาโรต์คว่ำ คู่แข่งไม่รู้ว่าคุณเป็นใคร'}</p>`,
  };
}

// every card of your Servant deck, NP/skill slot and Master skills, with full details (paper 4.6).
// "Still in the deck" is everything minus your hand, the field and the discard pile, which you know
// anyway, so it shows no secret. The deck's order stays hidden.
const TYPE_ORDER = 'NSAMXZ';
const byType = (a) => [...a].sort((x, y) => TYPE_ORDER.indexOf(x.type) - TYPE_ORDER.indexOf(y.type) || y.power - x.power);
function deckItem(c, note, o = {}) {
  const p = o.owner || me();
  const fx = c.text ? clean(c.text) : tags(c).join(' · ');
  const src = srcText(c, p);
  const cost = o.owner ? (c.fx?.manaX || c.fx?.gate ? 'X' : c.mana) : costNow(c, p);
  const t = tile({ ...c, down: false }, { note, lock: o.lock, cost, ...(o.key ? { btn: true, act: 'pcard', key: o.key } : {}) });
  return `<div class="dk${o.dim ? ' dim-card' : ''}">${t}<div class="dk-tx"><b>${esc(cardName(c))}</b>
    <span class="dk-meta">${pills(c)}${src ? `<em class="${srcOf(c) || 'np'}">${esc(src)}</em> · ` : ''}${typeHtml(c)} · พลัง ${c.power} · มานา ${cost}${c.down ? ' · <span class="dn">ลงคว่ำ</span>' : ''}</span>
    <span>${esc(fx || 'ไม่มีผลพิเศษ')}</span></div></div>`;
}
function deckPop() {
  const p = me();
  const onField = (p.play?.cards || []).filter((c) => !c.skill && !c.keep);
  const all = p.hand.length + p.deck.length + p.trash.length + onField.length;
  const grp = (lab, items) => `<div class="pop-sec"><p class="row-lab">${lab}</p>${items ? `<div class="dkl">${items}</div>` : '<p class="p-text">ไม่มี</p>'}</div>`;
  return {
    title: `เดคของคุณ · ${p.sv.cls}`,
    sub: `${esc(p.sv.name)} · สำรับโจมตี ${all} ใบ: ในมือ ${p.hand.length} · ยังอยู่ในสำรับ ${p.deck.length} · กองทิ้ง ${p.trash.length}${onField.length ? ` · ลงอยู่ ${onField.length}` : ''}`,
    mini: `สำรับ ${p.deck.length} · ในมือ ${p.hand.length} · กองทิ้ง ${p.trash.length}`,
    wide: true,
    html: grp(`ในมือ ${p.hand.length} ใบ${p.specials.length ? ' + สกิล Master' : ''}`, [...p.hand.map((c) => deckItem(c)), ...p.specials.map((c) => deckItem(c, specialNote(c)))].join(''))
      + (onField.length ? grp(`ลงอยู่ในสนามรบรอบนี้ ${onField.length} ใบ`, onField.map((c) => deckItem(c, c.down ? 'ลงคว่ำ' : 'ลงหงาย')).join('')) : '')
      + grp(`การ์ด NP/สกิล · ${esc(p.sv.cls)} · คว่ำไว้ข้างไพ่ทาโรต์`, p.skills.map((c) => deckItem(c, skillNote(c), { lock: skillLocked(c), dim: c.gone })).join(''))
      + grp(`ยังอยู่ในสำรับ ${p.deck.length} ใบ · เรียงตามชนิด ไม่บอกลำดับ`, byType(p.deck).map((c) => deckItem(c)).join(''))
      + grp(`กองทิ้ง ${p.trash.length} ใบ · ล่าสุดก่อน`, [...p.trash].reverse().map((c) => deckItem(c, c.down ? 'ลงคว่ำ' : 'ลงหงาย')).join('')),
  };
}

// one card of your hand bar in full, read only; ‹ › step along the bar (paper 4.6 item 5)
const barCards = (p) => [...p.hand, ...p.specials, ...p.skills];
function cardState(c, p) {
  if (winCan().has(c.uid)) return `ใช้ได้ตอนนี้ · ช่วง${WINDOWS[wait.ctx.w].name}`;
  if (c.skill) return skillNote(c);
  if (c.keep) return specialNote(c);
  if (!g.round || g.over) return 'อยู่ในมือ';
  if (c.fx?.luck && p.roundUse.defeated) return 'อยู่ในมือ · แพ้ไปแล้ว ลง Luck ไม่ได้รอบนี้';
  return g.infinite(p) || p.mana >= c.mana ? `อยู่ในมือ · มานาพอลงหงาย (มี ${g.infinite(p) ? 'ไม่จำกัด' : p.mana})` : `อยู่ในมือ · มานาไม่พอลงหงาย (มี ${p.mana}) ลงคว่ำได้`;
}
function cardPop(uid) {
  const p = me();
  const list = barCards(p);
  const i = list.findIndex((c) => c.uid === uid);
  if (i < 0) return null; // the card left the bar (played or discarded)
  const c = list[i];
  const fx = c.text ? clean(c.text) : tags(c).join(' · ');
  const src = srcText(c, p);
  const step = (d, label) => { const n = list[(i + d + list.length) % list.length]; return `<button class="btn" data-act="cardinfo" data-uid="${n.uid}" aria-label="${label}">${d < 0 ? '‹' : '›'}</button>`; };
  const use = winCan().has(c.uid) ? `<button class="btn primary" data-act="winuse" data-uid="${c.uid}">ใช้ใบนี้${c.mana ? ` · มานา ${c.mana}` : ''}</button>` : '';
  return {
    title: cardName(c),
    sub: `${src ? `${esc(src)} · ` : ''}${typeHtml(c)} · พลัง ${c.power} · มานา ${costNow(c)}`,
    mini: `${esc(cardName(c))} · ใบที่ ${i + 1}/${list.length}`,
    html: cardView(c, cardState(c, p), `${c.skill ? `<p class="p-text">${c.fx?.no8 ? 'ใบนี้ไม่ต้องมีมานา 8' : `การ์ด NP/สกิลใช้ได้เมื่อมีมานา ${SKILL_MANA} ขึ้นไป`} แล้วจ่ายมานาตามการ์ด</p>` : c.consume ? '<p class="p-text">ใช้ช่วงเตรียมการ (ขั้น 1.4) ใช้แล้วหายไป</p>' : c.keep ? '<p class="p-text">สกิล Master อยู่ในช่องสกิล ลงเพิ่มนอกเหนือการ์ด 2 ใบ ใช้แล้วกลับที่เดิม</p>' : ''}
      <p class="p-text">${use ? 'ใช้ได้ในช่วงนี้ หรือเก็บไว้ลงตอนลงการ์ด' : 'อ่านอย่างเดียว · เลือกลงการ์ดในหน้าลงการ์ด'}</p>`),
    foot: `<div class="acts cv-nav">${step(-1, 'ใบก่อนหน้า')}<span class="dim">${i + 1} / ${list.length}</span>${step(1, 'ใบถัดไป')}</div>${use}<button class="btn" data-act="pop" data-k="deck">ดูเดค</button>`,
  };
}
// a card in full: big tile, state, timing labels and text (paper 4.6 item 5, labels paper 9)
function cardView(c, state, extra = '') {
  const fx = c.text ? clean(c.text) : tags(c).join(' · ');
  const when = pills(c);
  return `<div class="cardview">${tile({ ...c, down: false }, { note: '' })}
    <div class="cv-tx">${state ? `<p class="cv-state">${esc(state)}</p>` : ''}${when ? `<p class="cv-when">${when}</p>` : ''}<p class="cv-fx">${esc(fx || 'ไม่มีผลพิเศษ')}</p>${extra}</div></div>`;
}

// ---------- another Master in detail (paper 4.6 item 6) ----------
// Only what is public: the Master, the counters, how many cards, what was laid face up and the
// NP/skill cards used. The Servant part (art, name, all 3 NP/skill cards, the deck list printed on
// the tarot card) opens with the true name, and closes again if it goes back into hiding.
const rankList = () => [...[...g.alive()].sort((a, b) => b.vp - a.vp), ...g.players.filter((p) => p.out).sort((a, b) => b.outRound - a.outRound || b.vp - a.vp)];
function abilState(q, t) {
  const S = {
    Avalon: () => (q.avalonUsed ? 'ใช้แล้ว' : 'ยังไม่ใช้'),
    Gem: () => `อัญมณีเหลือ ${q.gems}`,
    'Short Temper': () => (g.round > 1 ? 'หมดช่วงแล้ว' : 'รอบนี้'),
    'Broken Vessel': () => (q.grail ? 'หมดช่วงแล้ว' : `Black Shadow ${q.specials.filter((c) => c.consume).length} ใบ`),
    'The Tainted Grail': () => (q.grail ? 'ได้แล้ว' : g.round > REGULAR ? 'ไม่ได้' : `รอจบรอบ ${REGULAR}`),
    'Dress of Heaven': () => (g.round >= REGULAR ? 'ทำงานอยู่' : `เริ่มรอบ ${REGULAR}`),
    Unworthy: () => (q.bookUsed ? 'เปลี่ยน Servant แล้ว' : `Command Spell เหลือ ${q.cs}`),
    Supervisor: () => (q.revealed ? 'ไม่ทำงาน ชื่อจริงเปิดแล้ว' : 'ทำงานอยู่'),
    Executor: () => (q.revealed ? 'ทำงานอยู่' : 'รอเปิดชื่อจริง'),
  };
  return g.round && S[t] ? S[t]() : '';
}
// the cards of q anyone can read, in the order the pop-up shows them; key → card
function pubCards(q) {
  const open = seen(q);
  const out = [];
  for (const c of q.skills) if (open || q.uses[c.name]) out.push({ key: `s${c.uid}`, c, state: c.gone ? (c.fx?.godHand ? 'ออกจากเกมแล้ว' : 'ใช้แล้ว · ครั้งเดียวต่อเกม') : c.resident ? 'ใช้แล้ว · ถาวรอยู่ในสนาม' : q.uses[c.name] ? 'ใช้แล้ว · หงายไว้' : 'ยังไม่ใช้' });
  q.shown.forEach((c, i) => { if (!c.down) out.push({ key: `h${i}`, c, state: `ลงหงายรอบ ${c.round}${c.w !== 'onUse' ? ` · ใช้ช่วง${WINDOWS[c.w].name}` : ''}` }); });
  if (open) {
    const deck = [...q.sv.deck, ...(q.m.key === 'kuzuki' ? SNAKE : []), ...(g.sample ? SAMPLE : [])];
    byType(deck).forEach((c, i) => out.push({ key: `d${i}`, c, state: 'การ์ดในสำรับ Servant (ไม่บอกว่าอยู่ในมือหรือในสำรับ)' }));
  }
  return out;
}
function playerPop(id) {
  const q = g.players[id];
  if (!q || q.isHuman) return null;
  const list = rankList().filter((x) => !x.isHuman);
  const i = list.indexOf(q);
  const open = seen(q);
  const pub = pubCards(q);
  const sun = g.order()[0];
  const where = q.out ? `ตกรอบหลังรอบ ${q.outRound}` : q.at ? AREAS[q.at].name : 'ยังไม่วางหมาก';
  const seat = q.out || !g.round ? '' : ` · ที่นั่ง ${g.order().indexOf(q) + 1}${q === sun ? ` ${SUN} ผู้เริ่มรอบ` : ''}`;
  const cardTile = (x, o = {}) => tile({ ...x.c, down: false }, { sm: true, btn: true, act: 'pcard', key: x.key, note: o.note ?? '' });
  const back = (label) => `<div class="card back sm" title="${esc(label)}"><span class="ty">คว่ำ</span><span class="pw">?</span></div>`;
  const svHead = open
    ? `<div class="pl-sv"><img src="${SV_ART[q.sv.key]}" alt=""><div class="nm"><b>${esc(q.sv.cls)} · ${esc(q.sv.name)}</b><small>${q.revealed ? 'ไพ่ทาโรต์หงายแล้ว' : 'จบเกมแล้ว เปิดทุกอย่าง'}</small><p class="p-text">${esc(q.sv.note || '')}</p></div></div>`
    : kireiSees() ? `<div class="pl-sv hidden"><span class="tarot" aria-hidden="true">?</span><div class="nm"><b>คลาส ${esc(q.sv.cls)} · ยังไม่เปิดชื่อจริง</b><small>คุณเห็นคลาสเพราะ Supervisor · ไม่รู้ชื่อ รูป หรือการ์ด</small></div></div>`
    : '<div class="pl-sv hidden"><span class="tarot" aria-hidden="true">?</span><div class="nm"><b>ยังไม่เปิดชื่อจริง</b><small>ไพ่ทาโรต์คว่ำอยู่ ไม่รู้คลาส ชื่อ หรือรูป</small></div></div>';
  // NP/skill cards: used ones lie face up by the tarot card; all three show once the name is open
  const skills = q.skills.map((c) => {
    const x = pub.find((y) => y.key === `s${c.uid}`);
    return x ? `<div class="pl-h">${cardTile(x)}<small class="${q.uses[c.name] ? 'used' : ''}">${esc(x.state.split(' · ')[0])}</small></div>` : `<div class="pl-h">${back('การ์ด NP/สกิลที่ยังไม่ใช้')}<small>คว่ำอยู่</small></div>`;
  }).join('');
  const hist = [...q.shown.map((c, i) => ({ c, i }))].reverse().slice(0, 16).map(({ c, i }) => `<div class="pl-h">${c.down ? back('ลงคว่ำ') : cardTile({ key: `h${i}`, c })}<small>รอบ ${c.round}${c.w !== 'onUse' ? ` · ช่วง${esc(WINDOWS[c.w].name)}` : c.down ? ' · คว่ำ' : ''}</small></div>`).join('');
  const deck = open ? pub.filter((x) => x.key[0] === 'd').map((x) => deckItem(x.c, '', { owner: q, key: x.key })).join('') : '';
  const step = (d, label) => { const n = list[(i + d + list.length) % list.length]; return `<button class="btn" data-act="player" data-id="${n.id}" aria-label="${label}">${d < 0 ? '‹' : '›'}</button>`; };
  return {
    title: `${q.m.name}`,
    sub: `อันดับ ${q.out ? '✖' : g.rank(q)} · ${esc(where)}${seat} · ${esc(svLabel(q))}`,
    mini: `${esc(q.name)} · ${q.vp} VP`,
    wide: true,
    html: `<div class="me-stats"><span>มานา <b class="m">${q.mana}</b><small>/${MANA_MAX}</small></span><span>Command Spell <b style="color:var(--seal)">${csDots(q.cs)}</b></span><span><b class="v">${q.vp}</b> VP</span>${q.m.key === 'rin' ? `<span>อัญมณี <b class="gm">${q.gems}</b></span>` : ''}</div>
      <p class="p-text">การ์ดในมือ ${q.hand.length} ใบ · สำรับ ${q.deck.length} ใบ · กองทิ้ง ${q.trash.length} ใบ (บอกแค่จำนวน)</p>
      <div class="pop-sec"><p class="row-lab">Master · ระดับ${esc(q.m.level)}</p><ul class="abil">${q.m.abil.map(([t, d]) => { const st = abilState(q, t); return `<li><b>${esc(t)}${st ? ` <em class="ab-st">${esc(st)}</em>` : ''}</b>${d ? `<span>${esc(d)}</span>` : ''}</li>`; }).join('')}</ul></div>
      <div class="pop-sec"><p class="row-lab">Servant</p>${svHead}</div>
      <div class="pop-sec"><p class="row-lab">การ์ด NP/สกิล · ${open ? 'เปิดชื่อจริงแล้ว อ่านได้ทุกใบ' : 'ใบที่ใช้แล้วหงายไว้ ใบที่ยังไม่ใช้คว่ำ'}</p><div class="pl-hist">${skills}</div></div>
      <div class="pop-sec"><p class="row-lab">การ์ดที่ลงในเกมนี้ · ล่าสุดก่อน${q.shown.length > 16 ? ' · 16 ใบล่าสุด' : ''} · ใบคว่ำไม่รู้ว่าเป็นอะไร</p>${hist ? `<div class="pl-hist">${hist}</div>` : '<p class="p-text">ยังไม่ได้ลงการ์ด</p>'}</div>
      ${open ? `<div class="pop-sec"><p class="row-lab">การ์ดในสำรับ Servant ตามไพ่ทาโรต์ · เรียงตามชนิด · ไม่บอกว่าใบไหนอยู่ในมือหรือในสำรับ</p><div class="dkl">${deck}</div></div>` : ''}`,
    foot: `<div class="acts cv-nav">${step(-1, 'คนก่อนหน้า')}<span class="dim">${i + 1} / ${list.length}</span>${step(1, 'คนถัดไป')}</div>`,
  };
}
// one public card of another Master; ‹ › step through that Master's public cards
function pcardPop(id, key) {
  const q = g.players[id];
  const list = q ? pubCards(q) : [];
  const i = list.findIndex((x) => x.key === key);
  if (i < 0) return null;
  const { c, state } = list[i];
  const src = srcText(c, q);
  const step = (d, label) => { const n = list[(i + d + list.length) % list.length]; return `<button class="btn" data-act="pcard" data-uid="${n.key}" aria-label="${label}">${d < 0 ? '‹' : '›'}</button>`; };
  return {
    title: cardName(c),
    sub: `${esc(q.name)} · ${src ? `${esc(src)} · ` : ''}${typeHtml(c)} · พลัง ${c.power} · มานา ${c.mana}`,
    mini: `${esc(cardName(c))} · ${esc(q.name)}`,
    html: cardView(c, state, '<p class="p-text">ข้อมูลเปิด ทุกคนเห็น · อ่านอย่างเดียว</p>'),
    foot: `<div class="acts cv-nav">${step(-1, 'ใบก่อนหน้า')}<span class="dim">${i + 1} / ${list.length}</span>${step(1, 'ใบถัดไป')}</div><button class="btn" data-act="player" data-id="${q.id}">กลับไปที่ ${esc(q.name)}</button>`,
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
  openModal(`<div class="dlg"><span class="eyebrow">เดโม 1 ด่าน · เมืองฟุยุกิ · กติกาตามคู่มือ · Master และ Servant ตาม Fate/Domination</span><div class="title-crest">DOMINATE GRAIL WAR</div>
    <p class="lede">สงครามจอกศักดิ์สิทธิ์ 7 Master ของ Fate/stay night · Servant ${SERVANTS.length} ตน สุ่มให้คนละตน อีก ${SERVANTS.length - MASTERS.length} ตนไม่ได้ใช้ · เก็บ VP 8 รอบ แล้วเข้าไคลแมกซ์ คนที่ VP น้อยถูกคัดออก 4 → 2 → 1 · คนสุดท้ายที่เหลือชนะ</p>
    <ol class="how"><li>ตั้งมั่น: วางหมากที่โรงฝึกเวทเพื่อเก็บมานา หรือที่สนามรบเพื่อรับได้เปรียบพื้นที่</li><li>ปฏิบัติการ: ย้ายตามลูกศร แล้วลงการ์ด 2 ใบ หงายเพื่อสู้ คว่ำเพื่อหลอก · ผล "ตอนใช้" ทำงานทุกที่</li><li>มีมานา ${SKILL_MANA} ขึ้นไปใช้การ์ด NP/สกิลได้ · มานาสูงสุด ${MANA_MAX}</li><li>Command Spell 3 ดวง ใช้ในตาของตัวเอง: มานา +${CS_MANA} · พลัง +${CS_POWER} · ย้ายไม่สนติดพัน</li><li>การ์ด "ถาวร" อยู่ในสนามต่อจนจบเกม · การ์ด "ปิด" พลัง 0 ไม่มีผล</li></ol>
    <h2>เลือก Master ของคุณ</h2><div class="masters">${ms}</div>
    <p class="lede">Servant สุ่มให้ และเป็นความลับจนกว่าจะเปิดชื่อจริง · แตะพื้นที่บนกระดานเพื่อดูรายละเอียดและเลือกทำแอคชั่น · แตะชื่อในอันดับเพื่อดูผู้เล่นคนนั้น · ความสามารถและพลังการ์ดตาม Fate/Domination ตัวเลขที่วิกิไม่บอก การ์ดสถานการณ์ และการ์ดอีเวนต์เป็นค่าแทน</p>
    <label class="check opt-sample"><input type="checkbox" id="opt-sample"${setup.sample ? ' checked' : ''}> ใส่การ์ดตัวอย่าง ${SAMPLE.length + 1} ใบให้ทุกคน (ทดลองช่วงใช้การ์ดของกระดาษข้อ 9 · ไม่ใช่การ์ดจริง)</label>
    <div class="acts">${started && !g.over ? '<button class="btn ghost" data-act="close">กลับไปเล่นต่อ</button>' : ''}<button class="btn" data-act="rules">อ่านกติกา</button><button class="btn${tutDone() ? '' : ' tut-new'}" data-act="tutorial" title="เล่นรอบแรกเป็นชิโร่กับ Saber พร้อมผู้สอนทีละขั้น">สอนเล่น</button><button class="btn primary" data-act="start">${started ? 'เริ่มเกมใหม่' : 'เริ่มสงคราม'}</button></div></div>`);
}

let summonGo = null;
function showSummon(go) {
  summonGo = go;
  const p = me();
  const sk = p.skills.map((c) => `<li><b>${esc(c.name)}</b>${esc(cardText(c))}</li>`).join('');
  const sp = p.specials.map((c) => `<li class="sp"><b>${esc(c.name)} · สกิล Master</b>${esc(cardText(c))}</li>`).join('')
    + (p.m.key === 'rin' ? `<li class="sp"><b>Gem ×${p.gems} · สกิล Master</b>${esc(cardText(GANDR))}</li>` : '');
  const deck = p.deck; // the whole attack deck before the first draw, Snake and example cards included
  const byType = Object.keys(TYPES).map((t) => [t, deck.filter((c) => c.type === t).length]).filter(([, n]) => n).map(([t, n]) => `${TYPES[t]} ${n}`).join(' · ');
  openModal(`<div class="dlg"><span class="eyebrow">${tut ? 'สอนเล่น · ' : ''}การอัญเชิญสำเร็จ</span><div class="summon"><img src="${SV_ART[p.sv.key]}" alt="${esc(p.sv.name)}">
    <div style="display:grid;gap:12px;min-width:0"><span class="cls">${esc(p.sv.cls.toUpperCase())}</span><h2>${esc(p.sv.name)}</h2>
    <p class="lede">Master ${esc(p.m.name)} · ไพ่ทาโรต์คว่ำไว้ คู่แข่งไม่รู้ว่าคุณเป็นใครจนกว่าจะเปิดชื่อจริง</p>
    ${tut ? '<p class="lede tut-lede">สอนเล่นจัดเหมือนกันทุกครั้ง: คุณเป็นชิโร่กับ Saber · ผู้สอนจะพาเล่นรอบที่ 1 ทีละขั้น · กด "ข้ามการสอน" ได้ตลอด</p>' : ''}
    <p class="row-lab">การ์ด NP/สกิล</p><ul class="skills">${sk}${sp}</ul>
    <p class="dim" style="margin:0;font-size:13px">สำรับโจมตี ${deck.length} ใบ: ${byType}${p.m.key === 'kuzuki' ? ' (รวม Snake 2)' : ''}${g.sample ? ` (รวมการ์ดตัวอย่าง ${SAMPLE.length})` : ''}</p></div></div>
    <div class="acts"><button class="btn primary" data-act="go">เริ่มรอบ 1</button></div></div>`);
}

function showRules() {
  const back = !started ? 'back-start' : summonGo ? 'go-summon' : 'close';
  openModal(`<div class="dlg narrow"><span class="eyebrow">กติกาแบบย่อ · ตามคู่มือ</span><h2>วิธีเล่น</h2><div class="rules">
    <div><h3>เป้าหมาย</h3><p>เก็บ VP จากการชนะในสนามรบและการลาดตระเวน · รอบปกติ ${REGULAR} รอบ แล้วเล่นรอบไคลแมกซ์จนเหลือคนเดียว · จบรอบ ${REGULAR} เหลือ 4 คน · จบไคลแมกซ์แรกเหลือ 2 คน · จบไคลแมกซ์ "เหลือ 2 คน" เหลือ 1 คน = ผู้ชนะ · <b>แต้มเท่ากันที่เส้นตัด ออกทุกคน</b></p></div>
    <div><h3>หนึ่งรอบ</h3><ol>
      <li><b>เตรียมการ:</b> จั่วให้ครบ 3 ใบ · เปิดการ์ดสถานการณ์ ทุกคนได้มานาตาม "จ่าย" และมีกฎเพิ่มทั้งรอบ · วางการ์ดอีเวนต์ที่มิยามะแบบหงาย และที่ชินโตะแบบคว่ำ</li>
      <li><b>ตั้งมั่น:</b> วางหมากที่โรงฝึกเวท (มานา ${WORKSHOP.join(' / ')} ตามลำดับ รับ 4 คน) หรือสนามรบ (คนแรกได้เปรียบพื้นที่ +${TERRAIN[0]} คนที่สอง +${TERRAIN[1]}) · ลาดตระเวนวางไม่ได้</li>
      <li><b>ปฏิบัติการ:</b> เปิดอีเวนต์ชินโตะ แล้วทีละคน ① ย้ายตามลูกศรทางเดียว (มานา ${STEP_COST.join(' / ')}) · สนามรบที่มี 2 คนขึ้นไปติดพัน เดินออกไม่ได้ · เข้าลาดตระเวน (รับ 1 คน) ได้ ${RECON_VP} VP ทันที ② ทุกคนลงการ์ด 2 ใบ หงายหรือคว่ำทีละใบ · หงาย = ใช้ค่าบนการ์ด · คว่ำ = พลัง 0 มานา 0 ไม่มีผล · ผล "ตอนใช้" ทำงานทุกที่ รวมถึงโรงฝึกเวทและลาดตระเวน แต่คิดพลังแค่ในสนามรบ · การ์ดย้าย (Bellerophon · Lancer Class · Surveil) พาเข้าสนามรบได้ ไม่สนการติดพัน · Surveil ไปได้แค่ช่องถัดไป</li>
      <li><b>ต่อสู้:</b> ผล "ตอนปะทะ" ทำตามลำดับที่นั่ง · พลังรวมสูงสุดที่ไม่ [แพ้] ชนะ ได้ VP การ์ดอีเวนต์ + ${AREAS.miyama.bonus} (มิยามะ) หรือ + ${AREAS.shinto.bonus} (ชินโตะ) · เสมอแบ่งกันปัดขึ้น · อยู่คนเดียวได้แค่ VP การ์ดอีเวนต์ · แพ้ไม่เสียอะไร</li>
      <li><b>จบรอบ:</b> การ์ดลงกองทิ้งตามด้านที่ลง · การ์ด NP/สกิลกลับข้างไพ่ทาโรต์แบบหงาย · ผู้เริ่ม (${SUN}) เลื่อนไปคนถัดไป</li></ol></div>
    <div><h3>ผังเฟส · ขั้นและช่วงใช้การ์ด</h3><p>ขั้นที่ตัวหนาคือช่วงใช้การ์ด · การ์ดที่มีป้ายช่วงนั้นใช้จากมือได้ ไม่นับเป็น 2 ใบที่ลง · หน้าจอถามเฉพาะตอนคุณมีการ์ดที่ใช้ได้ · Command Spell ใช้ได้ช่วง 3.1 3.3 และ 3.5 (อยู่ในหน้าย้ายและหน้าลงการ์ด)</p>
      <ol class="phases">${Object.entries(STEPS).map(([k, t]) => `<li${Object.values(WINDOWS).some((w) => w.code === k) ? ' class="win"' : ''}><b>${k}</b> ${esc(t)}</li>`).join('')}</ol>
      <p>ป้ายบนการ์ดเขียนว่าใช้ช่วงไหน ที่ไหน และเงื่อนไข เช่น "ตอนใช้ · ทุกที่" "ตอนปะทะ · สนามรบ" "ก่อนย้าย · สนามรบ · ติดพัน" · ยังไม่มีการ์ดจริงที่ใช้ช่วงใหม่ ติ๊ก "ใส่การ์ดตัวอย่าง" ที่หน้าเริ่มเกมเพื่อลองระบบนี้</p></div>
    <div><h3>มานาและการ์ด NP/สกิล</h3><p>มานา 0–${MANA_MAX} · การ์ด NP/สกิลเลือกได้เมื่อมีมานา ${SKILL_MANA} ขึ้นไป แล้วจ่ายตามการ์ด · ใช้แล้วใช้ซ้ำได้ ยกเว้น "ครั้งเดียวต่อเกม" · การ์ดที่มี "เปิดชื่อจริง" หงายไพ่ทาโรต์ของคุณ · การ์ด "ถาวร" อยู่ในสนามต่อจนจบเกม ผลทำงานทุกรอบตั้งแต่รอบที่ลง พลังนับแค่รอบที่ลง · "ปิด" = การ์ด NP/สกิลกลับช่องสกิล การ์ดอื่นพลัง 0 ไม่มีผล · บางใบลงเพิ่มนอกเหนือ 2 ใบได้ เช่น Kanshou & Bakuya · Gandr Shot · 3rd Strike</p></div>
    <div><h3>Command Spell</h3><p>ใช้ได้เฉพาะในตาปฏิบัติการของตัวเอง ก่อนย้าย ระหว่างย้ายกับลงการ์ด หรือหลังลงการ์ด · 1 ดวงต่อ 1 ผล: มานา +${CS_MANA} · พลังรวม +${CS_POWER} และถ้าชนะได้ VP +${CS_VP} · ย้ายไปที่ไหนก็ได้ยกเว้นโรงฝึกเวท ไม่สนการติดพัน</p></div>
    <div><h3>ข้อยกเว้นของ Master</h3><p>ชิโร่ครั้งแรกที่จะตกรอบเสียมานาทั้งหมดแทน (Avalon) · ซากุระจบรอบ ${REGULAR} ถ้าไม่ได้อันดับ 1 มานาไม่จำกัดและลงเพิ่มได้ 1 ใบจนจบเกม (The Tainted Grail) · ชินจิ Command Spell หมดครั้งแรก เปลี่ยนเป็น Servant ที่ไม่มีใครได้ ชื่อจริงซ่อน (Unworthy) · Excalibur ชนะในรอบไคลแมกซ์ "เหลือ 2 คน" = ชนะเกมทันที · ความสามารถทั้งหมดอยู่ในกระดาน Master</p></div>
    <div><h3>หน้าจอ</h3><p>แตะพื้นที่บนกระดานเพื่อดูรายละเอียดและเลือกทำแอคชั่นที่นั่น · ตอนลงการ์ดหน้าลงการ์ดจะเปิดเอง กด ▾ พับหน้าต่างเพื่อดูกระดาน · ตอนสู้ พื้นที่ของคุณกลายเป็นหน้าต่างต่อสู้ที่บอกว่าใครอยู่ ลงการ์ดอะไร และพลังเท่าไร · การ์ดในมืออยู่ใต้กระดานเสมอ ปุ่ม "ดูเดค" ท้ายแถบเปิดรายละเอียดการ์ดทุกใบ · แตะชื่อในอันดับ VP เพื่อดูข้อมูลเปิดของคนนั้น เปิดชื่อจริงแล้วเห็นความสามารถและการ์ดในสำรับ Servant ทั้งหมด · ป้าย "สกิล Servant" และ "สกิล Master" บอกว่าการ์ดมาจากช่องสกิลของใคร · ข้อความที่ยาวเกินกระดานกด "ดูเพิ่ม" · บนมือถือการ์ดของคุณ อันดับ และบันทึกอยู่ที่ปุ่มด้านล่าง</p></div>
    <p class="dim">อ้างอิงกระดาษออกแบบ v5.2 · ความสามารถ Master และการ์ด Servant ตาม Fate/Domination · ตัวเลขที่วิกิไม่บอก การ์ดสถานการณ์ และการ์ดอีเวนต์เป็นค่าแทน</p></div>
    <div class="acts"><button class="btn primary" data-act="${back}">ปิด</button></div></div>`);
}

function showResults(results) {
  const ents = (r) => {
    const sorted = [...r.ents].sort((a, b) => (a.defeated - b.defeated) || (b.won - a.won) || (b.power ?? 0) - (a.power ?? 0));
    return sorted.map((e, i) => {
      const p = g.players[e.id];
      const cards = (e.cards || []).map((c) => (c.down ? tile(c, { back: true, mini: true }) : tile(c, { mini: true }))).join('');
      const res = r.alone ? `อยู่คนเดียว ${pm(e.gain)} VP` : e.defeated ? '[แพ้]' : e.won ? `ชนะ ${pm(e.gain)} VP` : e.gain ? `แพ้ ${pm(e.gain)} VP` : 'แพ้';
      const table = r.alone ? '' : `<div class="bpwt">${pwDrop({ rows: e.rows || [], total: e.power, parts: e.parts || [] }, p, { dk: `r:${g.round}:${r.f}:${e.id}` })}</div>`; // paper 4.6 item 9, folded
      return `<div class="ent${e.won ? ' won' : ' lost'}" style="animation-delay:${i * 120}ms"><div class="who">${chip(p)}<div class="cards">${cards}</div></div>
        <div><div class="tot">${r.alone ? '–' : e.power}</div><div class="res${e.defeated ? ' def' : ''}">${res}</div></div>
        ${table}${e.notes?.length ? `<div class="notes">${e.notes.map(esc).join(' · ')}</div>` : ''}</div>`;
    }).join('');
  };
  const cut = g.round >= REGULAR ? cutInfo() : null;
  const body = results.length
    ? results.map((r) => `<section class="bt"><h3>${esc(AREAS[r.f].name)}<small>${r.alone ? `การ์ดอีเวนต์ ${r.pool} VP` : `ผู้ชนะได้ ${r.pool} VP`}</small></h3>${ents(r)}</section>`).join('')
    : '<p class="lede">รอบนี้ไม่มีใครอยู่ในสนามรบ</p>';
  const cutTxt = cut ? (cut.allOut ? 'จบรอบนี้ทุกคนเสมอกันที่เส้นตัด ไม่มีใครออก' : `จบรอบนี้คัดออก เหลือไม่เกิน ${cut.target} คน`) : '';
  $('#sheet').innerHTML = `<div class="dlg"><span class="eyebrow">${esc(roundLabel())} · ${esc(g.sit.name)}</span><h2>ผลการต่อสู้</h2>${body}
    ${cutTxt ? `<p class="lede" style="color:var(--seal)">${cutTxt}</p>` : ''}
    <div class="acts">${tut ? '' : '<button class="btn ghost" data-act="skipall">ข้ามผลการต่อสู้ที่เหลือ</button>'}<button class="btn primary" data-act="cont">จบรอบ</button></div></div>`;
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

// ---------- the tutorial (paper 4.6 item 12) ----------
// A real game with a coach beside it. The deal is the same every time (you are Shirou with Saber,
// the bots have the Servants of the story, the decks come out in the same order), so round 1 goes
// the same way and the coach can talk about the cards you hold. Round 1 is taught step by step
// along the phase chart: a step to read waits for "ต่อไป" (the bots wait too), a step to try lets
// you tap only the lit part. Played on, the game gives a few one-time hints.
const TUT = { seed: 271, servants: { shirou: 'artoria', rin: 'emiya', sakura: 'hassan', illya: 'heracles', shinji: 'medusa', kuzuki: 'medea', kirei: 'cu' } };
const TUT_KEY = 'dgw-v5-tutorial-done'; // finished once in this browser: the button stops standing out
function seeded(a) { // mulberry32: a fixed deal for the tutorial
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const tutDone = () => { try { return localStorage.getItem(TUT_KEY) === '1'; } catch { return false; } };
const tutSave = () => { try { localStorage.setItem(TUT_KEY, '1'); } catch { /* a private window forgets: the button stays lit */ } };

let tut = null; // the guided round 1: { i } the step shown
let hints = null; // played on after it: { seen, now, who, round }
let held = null; // the bots wait on this while you read: { p, res }

// the moments of round 1 the steps belong to, in order
const AT = ['place', 'placed', 'move', 'cards', 'battle', 'combatEnd', 'sheet', 'round2'];
function tutAt() {
  if (g.round >= 2 || g.over || me().out) return 7;
  const k = wait?.kind;
  if (k === 'place') return 0;
  if (k === 'move') return 2;
  if (k === 'cards') return 3;
  if (k === 'combatEnd') return $('#sheet').hidden ? 5 : 6;
  if (k) return -1; // a card window or 1st Strike is yours to answer: the coach steps aside
  if (me().play) return myBattle() ? 4 : -1;
  return me().at ? 1 : -1;
}
const myEnt = () => (wait?.kind === 'combatEnd' ? wait.ctx.results.flatMap((r) => r.ents).find((e) => e.id === me().id) : null);
const RANK = '#standings | .strip | #nav [data-k="rank"]';
// lit: what is lit ("a | b" takes the first one on screen); on a step to try, that is all you can tap.
// ring: what glows (default lit). only: the one answer a step to try takes.
const TUT_STEPS = [
  { at: 'place', t: 'เป้าหมาย', lit: [RANK], x: () => `เก็บ VP ให้มากที่สุด · จบรอบ ${REGULAR} เหลือ 4 คน แล้วรอบไคลแมกซ์คัดออกจนเหลือ 2 และ 1 · คนสุดท้ายชนะสงคราม · อันดับ VP ของทุกคนอยู่ตรงที่เรืองแสง` },
  { at: 'place', t: 'Master ของคุณ', lit: ['#dock | #hud .mystat'],
    x: () => `คุณคือชิโร่ · มานาตอนนี้ ${me().mana} ใช้เดินและจ่ายค่าการ์ด · Command Spell (◆) ${me().cs} ดวง · Servant ของคุณคือ Saber แต่คนอื่นไม่รู้จนกว่าคุณจะเปิดชื่อจริง${wide() ? '' : ' · กระดาน Master เต็มเปิดจากปุ่ม "การ์ดของคุณ"'}` },
  { at: 'place', t: 'การ์ดในมือ', lit: ['.hand'], x: () => `การ์ดโจมตี ${me().hand.length} ใบ สีบอกชนิด (กำลัง · ว่องไว · เวท) เลขใหญ่คือพลัง เลขในเม็ดมุมการ์ดคือมานา · ท้ายแถบคือการ์ด NP/สกิลของ Saber ใช้ได้เมื่อมีมานา ${SKILL_MANA} ขึ้นไป · แตะการ์ดเพื่ออ่านรายละเอียดได้ทุกเมื่อ` },
  { at: 'place', t: 'เตรียมการ', lit: ['.sit', '.area.f-miyama .evs | .area.f-miyama', '.area.f-shinto .evs | .area.f-shinto'],
    x: () => `ต้นรอบเปิดการ์ดสถานการณ์ รอบนี้ "${g.sit.name}" ทุกคนได้มานา +${g.sit.mana} · ${g.sit.text} · การ์ดอีเวนต์บอก VP ของสนามรบ มิยามะเปิดให้เห็น ชินโตะคว่ำไว้จนถึงปฏิบัติการ` },
  { at: 'place', t: 'ตั้งมั่น', try: true, lit: () => (pop ? ['#pop .pop-dlg'] : ['.area.f-miyama']), ring: ['#pop [data-act="place"][data-to="miyama"] | .area.f-miyama'],
    only: (t) => t.dataset.act !== 'place' || t.dataset.to === 'miyama', no: 'ลองวางที่ย่านมิยามะก่อน',
    x: 'ทีละคนวางหมาก Master เพื่อเลือกว่ารอบนี้เริ่มที่ไหน · ลองแตะย่านมิยามะ แล้วกด "วางหมากที่นี่"' },
  { at: 'placed', t: 'ได้เปรียบพื้นที่', hold: true, lit: ['.area.f-miyama'],
    x: () => `${me().terrain ? `คุณวางที่มิยามะเป็นคนแรกจึงได้เปรียบพื้นที่ +${me().terrain}` : `คนแรกที่วางในสนามรบได้เปรียบพื้นที่ +${TERRAIN[0]}`} บวกพลังตอนต่อสู้ (คนที่สอง +${TERRAIN[1]}) · ย้ายออกแล้วหาย · โรงฝึกเวทให้มานาแทน · ลาดตระเวนวางตอนนี้ไม่ได้ ต้องเดินเข้าไป · กด ต่อไป แล้วดูคนอื่นวางหมาก` },
  { at: 'move', t: 'ปฏิบัติการ', try: true, lit: () => (pop ? ['#pop .pop-dlg'] : ['.area.f-miyama', '.map .arrow']), ring: ['#pop [data-act="move"][data-how="stay"] | .area.f-miyama'],
    only: (t) => t.dataset.act !== 'move' || t.dataset.how === 'stay', no: 'รอบนี้ลองกด "อยู่ที่นี่" ก่อน',
    x: () => `ทีละคน ย้ายตามลูกศรทางเดียว เลขบนลูกศรคือมานาที่ใช้เดิน · สนามรบที่มี 2 คนขึ้นไปติดพัน เดินออกตามปกติไม่ได้${g.engagedAt(me().at) ? ' (มิยามะติดพันแล้ว)' : ''} · รอบนี้ลองอยู่ที่เดิม: แตะมิยามะ แล้วกด "อยู่ที่นี่"` },
  { at: 'cards', t: 'ลงการ์ด', try: true, lit: () => (pop?.k === 'act' ? ['#pop .pop-dlg'] : ['#bar [data-act="openact"]']), ring: ['#pop [data-act="play"] | #pop .pop-dlg | #bar [data-act="openact"]'],
    x: () => (pop?.k === 'act' && pop.min ? 'แตะแถบที่พับไว้เพื่อเปิดหน้าลงการ์ดอีกครั้ง' : pop?.k === 'act' ? `เลือกการ์ด ${PLAY} ใบ ลงหงายเพื่อสู้ (จ่ายมานาตามการ์ด) หรือคว่ำเพื่อหลอกคู่แข่ง (พลัง 0 ไม่เสียมานา) · หน้านี้เลือกชุดที่แนะนำไว้แล้ว ลองกด "ลงการ์ด"` : 'กด "เปิดหน้าลงการ์ด" ตรงที่เรืองแสง') },
  { at: 'battle', t: 'หน้าต่างต่อสู้', hold: true, lit: ['.area.fighting'],
    x: 'ลงการ์ดแล้ว พื้นที่ของคุณกลายเป็นหน้าต่างต่อสู้: ใครอยู่ด้วย การ์ดที่ลง และพลังรวม · การ์ดคว่ำของคนอื่นเห็นเป็น ? · คนที่ยังไม่เล่นจะลงการ์ดตามลำดับ · กด ต่อไป แล้วดูต่อ' },
  { at: 'combatEnd', t: 'ต่อสู้', try: true, lit: ['.area.fighting .brow.me'],
    x: 'ผล "ตอนปะทะ" ขึ้นทีละคนตามลำดับที่นั่ง แล้วพลังรวมสูงสุดที่ไม่ [แพ้] ชนะ · ลองแตะแถวของคุณเพื่อดูว่าพลังมาจากอะไรบ้าง',
    after: { on: () => pop?.k === 'pw', lit: ['#pop .pop-dlg'], x: 'แต่ละบรรทัดคือที่มาของพลัง ค่าบวกสีเขียว ค่าลบสีแดง ผลตอนปะทะมีป้ายบอก · กด ต่อไป เพื่อดูผลทุกสนามรบ' } },
  { at: 'combatEnd', t: 'ผลการต่อสู้', try: true, lit: ['#bar [data-act="allres"]'],
    x: () => { const e = myEnt(); return `${e ? (e.defeated ? 'คุณ [แพ้] · ' : e.won ? `คุณชนะ ได้ ${e.gain} VP · ` : 'คุณแพ้รอบนี้ · ') : ''}ผู้ชนะได้ VP ของการ์ดอีเวนต์ + โบนัสสนามรบ แพ้ปกติไม่เสียอะไร · ลองกด "ดูผลทุกสนามรบ"`; } },
  { at: 'sheet', t: 'จบรอบ', free: true, lit: [], ring: ['#sheet [data-act="cont"]'],
    x: 'การ์ดที่ลงไปกองทิ้ง · รอบใหม่จั่วจนมี 3 ใบ · ผู้เริ่ม (★) เลื่อนไปคนถัดไป · ตั้งแต่รอบ 6 อันดับมีเส้นตัดบอกว่าใครจะตกรอบ · กด "จบรอบ" เพื่อไปรอบ 2' },
  { at: 'round2', t: 'รอบต่อไป', hold: true, lit: ['.hand > div.cards:last-of-type', '#hud .mystat'],
    x: `มีมานา ${SKILL_MANA} ขึ้นไปลงการ์ด NP/สกิลได้ (ท้ายแถบการ์ด) · NP ที่มีป้าย "เปิดชื่อจริง" ทำให้ทุกคนรู้ว่า Servant ของคุณคือใคร · Command Spell (◆) ใช้ในตาของคุณ: มานา +${CS_MANA} · พลัง +${CS_POWER} · ย้ายแม้ติดพัน` },
  { at: 'round2', t: 'จบการสอน', hold: true, end: true, lit: [],
    x: 'คุณเล่นครบ 1 รอบแล้ว · เล่นเกมนี้ต่อได้เลย มีคำแนะนำสั้นๆ ตอนเจอสิ่งใหม่ครั้งแรก · หรือเลือก Master เองแล้วเริ่มเกมใหม่ · กติกาเต็มอยู่ที่ปุ่มกติกา (บนมือถืออยู่ในเมนู)' },
];

// the step to show now, after moving on past any step whose moment has gone (you did it, or it never came)
function tutSync() {
  if (!tut) return null;
  const at = tutAt();
  let s = TUT_STEPS[tut.i];
  if (at > AT.indexOf(s.at)) {
    const j = TUT_STEPS.findIndex((x, n) => n > tut.i && AT.indexOf(x.at) >= at);
    tut.i = j < 0 ? TUT_STEPS.length - 1 : j;
    s = TUT_STEPS[tut.i];
    if (!s.hold) letGo();
  }
  return at === AT.indexOf(s.at) ? s : null;
}
function holdBots() {
  const s = tutSync();
  if (!s?.hold) return null;
  if (!held) { let res; const p = new Promise((r) => { res = r; }); held = { p, res }; }
  return held.p;
}
function letGo() { const h = held; held = null; h?.res(); }
function tutNext() {
  if (!tut) return;
  const s = TUT_STEPS[tut.i];
  if (s.after?.on()) { pop = null; popBack = null; } // the power table was a look; the results come next
  tut.i = Math.min(tut.i + 1, TUT_STEPS.length - 1);
  if (!TUT_STEPS[tut.i].hold) letGo();
  render();
}
// the end of the tutorial: play on with hints, or back to the Master picker; skipped, the button stays lit
function tutStop({ done = false, play = false } = {}) {
  if (done) tutSave();
  tut = null;
  hints = play ? { seen: new Set(), now: null } : null;
  letGo();
  render();
}

// one-time hints when you play on (paper 4.6 item 12)
const HINTS = {
  np: { t: `มานาถึง ${SKILL_MANA} แล้ว`, lit: ['#pop .cg:last-child | .hand > div.cards:last-of-type'], live: () => wait?.kind === 'cards',
    x: () => 'การ์ด NP/สกิลเลือกลงได้แล้ว จ่ายมานาตามการ์ด · NP ที่มีป้าย "เปิดชื่อจริง" ทำให้ทุกคนรู้ว่า Servant ของคุณคือใคร' },
  win: { t: 'ช่วงใช้การ์ด', lit: ['#pop .pop-dlg | #bar [data-act="openwin"]'], live: () => wait?.kind === 'window',
    x: () => 'ตอนนี้มีการ์ดที่ใช้ได้ในช่วงนี้ (เรืองแสงในแถบการ์ด) · ใช้จากมือได้ ไม่นับเป็น 2 ใบที่ลง · ไม่ใช้ก็กด "ผ่าน"' },
  reveal: { t: 'มีคนเปิดชื่อจริง', lit: [RANK], live: () => g.round === hints.round,
    x: () => { const q = hints.who; return q.isHuman ? `ชื่อจริงของคุณเปิดแล้ว ทุกคนรู้ว่า Servant ของคุณคือ ${q.sv.name}` : `${q.name} เปิดชื่อจริงแล้ว: ${q.sv.cls} · ${q.sv.name} · แตะชื่อในอันดับเพื่อดูความสามารถและการ์ดของเขา`; } },
  cut: { t: `รอบ ${REGULAR} รอบปกติสุดท้าย`, lit: [RANK], live: () => g.round === hints.round,
    x: () => 'จบรอบนี้คนที่อยู่ใต้เส้นตัดในอันดับตกรอบ เหลือ 4 คน · ต่อจากนั้นเป็นรอบไคลแมกซ์ คัดออกจนเหลือ 2 และ 1 · คนสุดท้ายชนะ' },
};
function hintCheck() {
  if (!hints || g.over || me().out) return;
  if (hints.now && !HINTS[hints.now].live()) hints.now = null; // its moment has gone
  if (hints.now) return;
  const show = (k, ok) => { if (!ok || hints.seen.has(k)) return false; hints.seen.add(k); hints.now = k; hints.round = g.round; return true; };
  const who = g.players.find((q) => q.revealed && !q.out);
  show('np', wait?.kind === 'cards' && me().mana >= SKILL_MANA) || show('win', wait?.kind === 'window')
    || (who && show('reveal', true) && (hints.who = who)) || show('cut', g.round === REGULAR && !g.climax());
}

// ---------- the coach on screen ----------
// #tut sits over the pop-ups and the results (under the start screen): a dim layer with holes cut
// at the lit parts (on a step to try, a tap reaches only those), glowing rings, and the coach box,
// beside the lit part on a computer, docked above the hand bar on a phone (at the top if that
// would cover what it talks about). An open pop-up or the results move down to make room.
let tutRaf = 0;
function tutKick() {
  hintCheck();
  if ((tut || hints?.now) && !tutRaf) tutRaf = requestAnimationFrame(tutLoop);
}
function tutLoop() {
  tutRaf = 0;
  if (!tutDraw()) return;
  tutRaf = requestAnimationFrame(tutLoop);
}
function tutEl() {
  let el = $('#tut');
  if (!el) {
    el = document.createElement('div');
    el.id = 'tut';
    el.hidden = true;
    el.innerHTML = '<div class="tut-dim"></div><div class="tut-block"></div><div class="tut-rings"></div><div class="tut-box" role="dialog" aria-live="polite"></div>';
    document.body.append(el);
  }
  return el;
}
// the first element of "a | b | c" that is on screen, as a rectangle inside the window
function onScreen(alts) {
  for (const sel of alts.split('|')) {
    for (const el of document.querySelectorAll(sel.trim())) {
      const r = el.getBoundingClientRect();
      const l = Math.max(0, r.left), t = Math.max(0, r.top), rr = Math.min(innerWidth, r.right), b = Math.min(innerHeight, r.bottom);
      if (rr - l > 2 && b - t > 2) return { l, t, r: rr, b };
    }
  }
  return null;
}
const grow = (r, n) => ({ l: r.l - n, t: r.t - n, r: r.r + n, b: r.b + n });
const meets = (a, b) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
function merged(rs) { // overlapping holes become one, so the dim's even-odd fill leaves them all open
  const out = [];
  for (let r of rs) {
    for (let i = out.length - 1; i >= 0; i--) if (meets(out[i], r)) { const o = out.splice(i, 1)[0]; r = { l: Math.min(o.l, r.l), t: Math.min(o.t, r.t), r: Math.max(o.r, r.r), b: Math.max(o.b, r.b) }; i = out.length; }
    out.push(r);
  }
  return out;
}
function tutHide() {
  const el = $('#tut');
  if (el) el.hidden = true;
  document.documentElement.classList.remove('tut-up');
}
function tutDraw() {
  if (!tut && !hints?.now) { tutHide(); return false; }
  const el = tutEl();
  const s = tutSync();
  const h = !tut && hints?.now ? HINTS[hints.now] : null;
  if ((!s && !h) || !$('#modal').hidden || !started) { tutHide(); return true; } // between moments, or the start screen is up
  const after = s?.after?.on() ? s.after : null;
  const mode = h ? 'hint' : after ? 'after' : s.free ? 'free' : s.try ? 'try' : 'read';
  const src = after || s || h;
  const lit = (typeof src.lit === 'function' ? src.lit() : src.lit).map(onScreen).filter(Boolean);
  if (!$('#cpop').hidden && mode !== 'read') { const c = onScreen('#cpop .pop-dlg'); if (c) lit.push(c); } // a skill's choice opened on top
  const rings = (src.ring && !after ? src.ring.map(onScreen).filter(Boolean) : lit).map((r) => grow(r, 4));
  const holes = merged(lit.map((r) => grow(r, 6)));
  // the box: what it says, then where it goes
  const box = el.querySelector('.tut-box');
  const text = typeof src.x === 'function' ? src.x() : src.x;
  const n = h ? '' : `<span class="tut-n">สอนเล่น · ${tut.i + 1} / ${TUT_STEPS.length}</span>${s.try && !after ? '<span class="tut-kind">ลองทำ</span>' : ''}`;
  const acts = h ? '<button class="btn sm ghost" data-act="hintoff">ปิดคำแนะนำ</button><button class="btn sm primary" data-act="hintok">เข้าใจแล้ว</button>'
    : s.end ? '<button class="btn sm ghost" data-act="tutnew">เลือก Master แล้วเริ่มเกมใหม่</button><button class="btn sm primary" data-act="tutplay">เล่นเกมนี้ต่อ</button>'
    : mode === 'read' || mode === 'after' ? '<button class="btn sm primary" data-act="tutnext">ต่อไป</button>' : '';
  const html = `<div class="tut-top">${h ? '<span class="tut-n">คำแนะนำ</span>' : n}${h || s.end ? '' : '<button class="tut-skip" data-act="tutskip">ข้ามการสอน</button>'}</div>
    <h3>${esc(src.t || s.t)}</h3><p>${esc(text)}</p>${acts ? `<div class="tut-acts">${acts}</div>` : ''}`;
  const key = h ? `h:${hints.now}` : `${tut.i}:${mode}`;
  if (box.dataset.k !== key) { // a new step comes in with a small rise
    box.dataset.k = key;
    tutDraw.html = null;
    box.classList.remove('in'); void box.offsetWidth; box.classList.add('in');
    if (mode === 'read' || mode === 'after') requestAnimationFrame(() => box.querySelector('[data-act="tutnext"], [data-act="tutplay"]')?.focus({ preventScroll: true }));
  }
  if (tutDraw.html !== html) { tutDraw.html = html; box.innerHTML = html; }
  el.className = mode;
  el.hidden = false;
  const W = innerWidth, H = innerHeight, m = 10;
  const bw = box.offsetWidth, bh = box.offsetHeight;
  const up = (!$('#pop').hidden && !pop?.min && mode !== 'read') || !$('#sheet').hidden; // a pop-up or the results: dock at the top, they move down
  const cx = (W - bw) / 2;
  const cands = [];
  if (up) cands.push([cx, m]);
  else {
    if (W >= 900 && rings[0]) { const t = rings[0]; cands.push([t.r + 16, t.t], [t.l - 16 - bw, t.t], [t.l, t.b + 16], [t.l, t.t - 16 - bh]); }
    const hand = $('.hand')?.getBoundingClientRect();
    const low = (hand?.height ? hand.top : H - m) - bh - 8;
    const x = W >= 900 ? W - bw - 24 : cx;
    if (!rings.length && !lit.length) cands.push([cx, (H - bh) / 2]);
    cands.push([x, low], [x, H - bh - m], [x, W >= 900 ? 70 : m]); // above the hand bar, over it, at the top
  }
  const all = [...holes, ...rings];
  let best = null;
  for (const [x0, y0] of cands) {
    const x = Math.max(m, Math.min(W - bw - m, x0)), y = Math.max(m, Math.min(H - bh - m, y0));
    const hit = all.reduce((sum, r) => sum + Math.max(0, Math.min(x + bw, r.r) - Math.max(x, r.l)) * Math.max(0, Math.min(y + bh, r.b) - Math.max(y, r.t)), 0);
    if (!best || hit < best.hit) best = { x, y, hit };
    if (!hit) break;
  }
  const pos = `${Math.round(best.x)}px,${Math.round(best.y)}px`;
  if (box.dataset.pos !== pos) { box.dataset.pos = pos; box.style.left = `${Math.round(best.x)}px`; box.style.top = `${Math.round(best.y)}px`; }
  const root = document.documentElement;
  const tp = `${Math.round(best.y + bh + 6)}px`;
  root.classList.toggle('tut-up', up);
  if (up && root.style.getPropertyValue('--tutpad') !== tp) root.style.setProperty('--tutpad', tp);
  // the dim with its holes, and the rings
  const dim = el.querySelector('.tut-dim');
  const path = `path(evenodd, "M0 0H${W}V${H}H0Z${holes.map((r) => `M${Math.round(r.l)} ${Math.round(r.t)}H${Math.round(r.r)}V${Math.round(r.b)}H${Math.round(r.l)}Z`).join('')}")`;
  if (dim.dataset.p !== path) { dim.dataset.p = path; dim.style.clipPath = path; }
  const rh = rings.map((r) => `<i class="tut-ring" style="left:${Math.round(r.l)}px;top:${Math.round(r.t)}px;width:${Math.round(r.r - r.l)}px;height:${Math.round(r.b - r.t)}px"></i>`).join('');
  const rl = el.querySelector('.tut-rings');
  if (rl.dataset.h !== rh) { rl.dataset.h = rh; rl.innerHTML = rh; }
  return true;
}
// on a step to try, a tap on something the step does not ask for is turned away
document.addEventListener('click', (ev) => {
  const s = tut && tutSync();
  const t = s?.only && ev.target.closest('[data-act]');
  if (t && !s.only(t)) { ev.stopPropagation(); ev.preventDefault(); toast(s.no, ''); }
}, true);

// ---------- clicks ----------
document.addEventListener('toggle', (ev) => {
  const dk = ev.target.dataset?.dk;
  if (dk) { if (ev.target.open) openDrops.add(dk); else openDrops.delete(dk); }
}, true);
document.addEventListener('click', (ev) => {
  if (ev.target.id === 'cpop') return; // a skill choice is answered with its buttons only
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
    case 'tutorial': closeModal(); startGame(true); break;
    case 'tutnext': tutNext(); break;
    case 'tutskip': tutStop(); break;
    case 'tutplay': tutStop({ done: true, play: true }); break;
    case 'tutnew': tutStop({ done: true }); pop = null; popBack = null; drawPop(); showStart(); break;
    case 'hintok': if (hints) { hints.now = null; render(); } break;
    case 'hintoff': hints = null; render(); break;
    case 'go': { closeModal(); const go = summonGo; summonGo = null; go?.(); break; }
    case 'go-summon': showSummon(summonGo); break;
    case 'back-start': showStart(); break;
    case 'close': closeModal(); break;
    case 'showover': showOver(); break;
    case 'skip': skip = true; closeModal(); if (wait?.kind === 'combatEnd') answer(null); render(); break;
    case 'skipall': skip = true; answer(null); break;
    case 'cont': if (wait?.kind === 'combatEnd') answer(null); break;
    case 'allres': if (wait?.kind === 'combatEnd') showResults(wait.ctx.results); break;
    case 'pop': openPop({ k: t.dataset.k }); break;
    case 'popclose': closePop(); break;
    case 'cardinfo': if (pop?.k === 'card') { pop.f = +t.dataset.uid; render(); } else openPop({ k: 'card', f: +t.dataset.uid }); break;
    case 'pwrow': { // a row of the battle window: where that Master's power comes from (paper 4.6 item 9)
      const q = g.players[+t.dataset.id];
      if (!q || !started) break;
      if (pop?.k === 'pw') { pop.id = q.id; render(); } else openPop({ k: 'pw', f: q.at, id: q.id });
      break;
    }
    case 'player': {
      // your own row opens your Master board; another Master opens their public details (paper 4.6 item 6)
      const q = g.players[+t.dataset.id];
      if (!q || !started) break;
      if (pop?.k === 'player' && !q.isHuman) { pop.f = q.id; render(); break; }
      const back = pop && ['rank', 'player'].includes(pop.k) ? (pop.k === 'rank' ? { k: 'rank' } : pop.back) : null;
      if (pop?.k === 'pcard') { pop = { k: 'player', f: q.id, back: pop.back?.back || null }; render(); break; }
      openPop(q.isHuman ? { k: 'me', back } : { k: 'player', f: q.id, back });
      break;
    }
    case 'pcard': {
      const key = t.dataset.uid;
      if (pop?.k === 'pcard') { pop.c = key; render(); } else if (pop?.k === 'player') { pop = { k: 'pcard', f: pop.f, c: key, back: { ...pop, min: false } }; render(); }
      break;
    }
    case 'permcard': { // a permanent card's details, read only (paper 4.6 item 11)
      const q = g.players[+t.dataset.id];
      if (!q || !started) break;
      if (q.isHuman) openPop({ k: 'card', f: +t.dataset.uid });
      else openPop({ k: 'pcard', f: q.id, c: `s${t.dataset.uid}`, back: pop && ['rank', 'area'].includes(pop.k) ? { ...pop, min: false } : null });
      break;
    }
    case 'popmin': foldPop(!pop?.min); break;
    case 'area': if (started) openPop({ k: 'area', f: t.dataset.to }); break;
    case 'openact':
      if (myTurn() && wait.kind === 'cards') { if (pop?.k === 'act') foldPop(false); else { pop = { k: 'act' }; popBack = null; render(); } }
      break;
    case 'openwin':
      if (myTurn() && wait.kind === 'window') { if (pop?.k === 'win') foldPop(false); else { pop = { k: 'win' }; popBack = null; render(); } }
      break;
    case 'winuse': if (wait?.kind === 'window' && wait.ctx.cards.includes(+t.dataset.uid)) answer({ use: +t.dataset.uid }); break;
    case 'winpass': if (wait?.kind === 'window') answer(null); break;
    case 'mvcs4': if (wait?.kind === 'move') { d.cs4 = !d.cs4; render(); } break;
    case 'place': if (wait?.kind === 'place') answer({ to: t.dataset.to }); break;
    case 'move': if (wait?.kind === 'move') answer({ to: t.dataset.to, how: t.dataset.how, cs4: d.cs4 }); break;
    case 'pick': {
      if (wait?.kind !== 'cards') break;
      const uid = +t.dataset.uid;
      const p = me();
      info = allCards(p).find((c) => c.uid === uid) || null;
      if (d.ids.includes(uid)) dropPick(uid);
      else {
        const before = forcedDown(g.cleanCards(p, d));
        const add = { ...d, ids: [...d.ids, uid] };
        const test = g.cleanCards(p, add);
        // an attack card the mana cannot pay for goes in face down, never by turning another card over
        const flips = test.down.some((id) => add.ids.includes(id) && !add.down.includes(id) && !before.has(id));
        if (!test.ids.includes(uid)) toast(`ลง ${cardName(info)} เพิ่มไม่ได้ · เต็มจำนวนหรือมานาไม่พอ เอาใบอื่นออกก่อน`, '');
        else if (flips && g.canFlip(info)) { d.ids = add.ids; d.down = [...d.down, uid]; toast(`มานาไม่พอลง ${cardName(info)} แบบหงาย · ลงแบบคว่ำแทน`, ''); }
        else d.ids = add.ids;
        if (d.ids.includes(uid)) autoChoice(uid); // a skill that needs a choice asks it now (paper 4.6 item 8)
      }
      render();
      break;
    }
    case 'flip': {
      if (wait?.kind !== 'cards') break;
      const uid = +t.dataset.uid;
      const p = me();
      if (!d.down.includes(uid)) { // face down: no effect, so no move either
        if (g.cleanCards(p, d).mover === uid) { d.moveTo = null; d.mover = null; }
        d.down = [...d.down, uid]; render(); break;
      }
      // face up only when the mana pays for it without turning another card over
      const before = forcedDown(g.cleanCards(p, d));
      const up = { ...d, down: d.down.filter((x) => x !== uid) };
      const test = g.cleanCards(p, up);
      if (test.down.some((id) => up.ids.includes(id) && !up.down.includes(id) && !before.has(id))) toast('มานาไม่พอลงแบบหงาย · คว่ำใบอื่นหรือเอาออกก่อน', '');
      else { d.down = up.down; autoChoice(uid); }
      render();
      break;
    }
    case 'cs4': d.cs4 = !d.cs4; render(); break;
    case 'step': { const k = t.dataset.key; d[k] = Math.max(0, (d[k] || 0) + +t.dataset.d); render(); break; }
    case 'csMove': d.csMove = t.dataset.to || null; render(); break;
    case 'reset': if (wait?.kind === 'cards') { draft = firstDraft('cards', wait.ctx); info = null; choice = null; swapSel.clear(); render(); } break;
    case 'clear': if (wait?.kind === 'cards') clearDraft(); break;
    case 'copen': openChoice(t.dataset.k, t.dataset.uid ? +t.dataset.uid : null, true); break;
    case 'cpick': // one answer of a skill choice; 1st Strike has two groups
      if (!choice) break;
      if (t.dataset.g) choice.sel = { ...choice.sel, [t.dataset.g]: +t.dataset.v };
      else choice.sel = choice.k === 'rb' ? +t.dataset.v : t.dataset.v;
      if (choice.k === 'gem' && choice.sel !== 'swap') swapSel.clear();
      render();
      break;
    case 'ctog': if (choice?.k === 'gate') { const v = t.dataset.v; choice.sel = choice.sel.includes(v) ? choice.sel.filter((x) => x !== v) : [...choice.sel, v]; render(); } break;
    case 'cok': choiceOk(); break;
    case 'cno': choiceNo(); break;
    case 'gemoff': if (wait?.kind === 'cards') { const k = t.dataset.g; d[k] = Math.max(0, (d[k] || 0) - 1); render(); } break;
    case 'swappick': { const uid = +t.dataset.uid; if (swapSel.has(uid)) swapSel.delete(uid); else if (swapSel.size < 3) swapSel.add(uid); else toast('ทิ้งได้ครั้งละ 1–3 ใบ', ''); render(); break; }
    case 'play':
      if (wait?.kind !== 'cards') break;
      if (g.cleanCards(me(), d).temper) { openChoice('temper'); break; } // Short Temper: Rin picks how to use the Command Spell
      answer({ ...d });
      break;
    default: break;
  }
});
document.addEventListener('change', (ev) => {
  if (ev.target.id === 'mv-cs4' && wait?.kind === 'move') { draft.cs4 = ev.target.checked; render(); }
  if (ev.target.id === 'opt-sample') setup.sample = ev.target.checked;
});
document.addEventListener('keydown', (ev) => {
  if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.matches?.('.area[data-act], .st li[data-act], .brow[data-act]')) { ev.preventDefault(); ev.stopPropagation(); ev.target.click(); }
  if (choice) { // the gem and Short Temper close with Escape; a card's choice needs its buttons
    if (ev.key === 'Escape' && ['gem', 'temper'].includes(choice.k)) choiceNo();
    return;
  }
  if (ev.key === 'Escape' && pop && $('#modal').hidden && $('#sheet').hidden) closePop();
  if ((ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') && ['card', 'player', 'pcard', 'pw'].includes(pop?.k) && !pop.min) $(`#pop .cv-nav button:${ev.key === 'ArrowLeft' ? 'first' : 'last'}-of-type`)?.click();
});

// first screen: an empty board behind the Master picker
g = new Game({ decide: () => new Promise(() => {}), onEvent: () => {}, humanMaster: setup.master });
render();
showStart();
