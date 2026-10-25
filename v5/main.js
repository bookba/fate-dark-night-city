// One-page UI for the v5.0 demo (the Dominate Grail War manual, one stage). The rules live in
// game.js; this file only draws the state and turns clicks into the answers game.decide() waits for.
// Board layout: design paper v5.0 section 4 (4.4 desktop, 4.5 mobile).
import {
  Game, AREAS, PATH, TYPES, MASTERS, TERRAIN, WORKSHOP, RECON_VP, SKILL_MANA, MANA_MAX, REGULAR, PLAY,
  CS_MANA, CS_POWER, CS_VP, FIELDS, STEP_COST, GEM_GAND, GEM_SWAP, TSUBAME, SAKURA_FROM,
} from './game.js';
import { botDecide } from './bot.js';
import { SV_ART, MAP_ART } from './art.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const PHASES = [['prep', 'เตรียมการ'], ['outpost', 'ตั้งมั่น'], ['action', 'ปฏิบัติการ'], ['combat', 'ต่อสู้'], ['end', 'จบรอบ']];
const ASK = { place: 'วางหมาก', move: 'ย้าย', cards: 'ลงการ์ด', combatEnd: 'ดูผลต่อสู้' };
const JP = { workshop: '魔術工房', miyama: '深山町', shinto: '新都', recon: '偵察' };
const BOT_DELAY = 260; // a short pause on each bot choice so the board can be followed
const SUN = '★';
const mobile = () => window.matchMedia('(max-width: 899px)').matches;

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
    if (skip || kind === 'combatEnd') return a;
    return new Promise((res) => setTimeout(() => res(a), BOT_DELAY));
  }
  if (kind === 'combatEnd' && skip) return null;
  return new Promise((res) => {
    wait = { kind, ctx, res };
    draft = firstDraft(kind, ctx);
    info = null;
    render();
    if (kind === 'combatEnd') showResults(ctx.results);
    else if (mobile() || kind === 'cards') $('#panel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
}
function answer(v) { const w = wait; wait = null; draft = null; info = null; swapSel.clear(); closeSheet(); w.res(v); render(); }

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
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => { queued = false; render(); });
}

// ---------- small pieces ----------
const me = () => g.human;
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

// a card tile. o: { btn, act, sel, down, secret, back, lock, power, cost, mini, note }
function tile(c, o = {}) {
  if (o.back) return `<div class="card back${o.mini ? ' mini' : ''}" title="การ์ดคว่ำ"><span class="ty">คว่ำ</span><span class="pw">?</span></div>`;
  const down = o.down ?? c.down;
  const cls = ['card', `t${c.type}`, c.skill ? 'skill' : '', c.keep || c.special ? 'sp' : '', o.sel ? 'sel' : '', down ? 'down' : '', o.lock ? 'lock' : '', c.gone ? 'gone' : '', c.resident ? 'res' : '', o.mini ? 'mini' : ''].filter(Boolean).join(' ');
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

// ---------- drawing ----------
function render() {
  if (!g) return;
  drawHud();
  drawSitbar();
  drawBoard();
  drawPanel();
  drawDock();
  drawStandings();
  drawLog();
  if (me().out && !outShown && !g.over) { outShown = true; showOut(); }
  if (g.over && !overShown && !wait) { overShown = true; showOver(); }
}

function roundLabel() {
  if (!g.round) return 'ก่อนเริ่มเกม';
  return g.climax() ? `ไคลแมกซ์ ${g.climaxNo()} · รอบ ${g.round}` : `รอบ ${g.round}/${REGULAR}`;
}

function drawHud() {
  const steps = PHASES.map(([k, t]) => `<li class="${g.phase === k && !g.over ? 'now' : ''}">${t}</li>`).join('');
  const p = me();
  const stats = started ? `<div class="mystat" aria-label="ของคุณ"><span class="m">มานา <b>${p.mana}</b></span><span class="c" title="Command Spell">◆ <b>${p.cs}</b></span><span class="v"><b>${p.vp}</b> VP</span></div>` : '';
  const ask = wait && wait.kind !== 'combatEnd' ? `<span class="yourturn">ตาของคุณ · ${ASK[wait.kind]}</span>` : '';
  $('#hud').innerHTML = `<div class="brand"><span class="crest">DOMINATE GRAIL WAR</span><span class="sub">สงครามจอกศักดิ์สิทธิ์ฟุยุกิ · เดโม 1 ด่าน</span></div>
    <div class="track"><b class="rl">${esc(roundLabel())}${g.phase && !g.over ? ` · ${PHASES.find(([k]) => k === g.phase)[1]}` : ''}</b><ol class="steps" aria-label="ขั้นของรอบ">${steps}</ol></div>
    ${ask}${stats}
    <div class="hud-btns"><button class="btn ghost" data-act="rules">กติกา</button><button class="btn ghost" data-act="new">เกมใหม่</button></div>`;
}

// the situation card in one line, for phones (on a computer it sits on the board)
function drawSitbar() {
  const s = g.sit;
  $('#sitbar').innerHTML = s ? `<div class="sitline${g.climax() ? ' climax' : ''}"><span class="lab">สถานการณ์</span><b>${esc(s.name)}</b><span class="mana">มานา +${s.mana}</span><span class="dim">${esc(s.text)}</span></div>` : '';
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
const moveOpts = () => g.moveOptions(me(), Math.min(MANA_MAX, me().mana + (draft?.cs4 ? CS_MANA : 0)), me().cs - (draft?.cs4 ? 1 : 0));

function drawBoard() {
  const can = boardChoices();
  $('#board').innerHTML = `<div class="b-left">${rail()}${vpTrack()}${sitCard()}</div>
    <div class="b-main">${ptrack('miyama')}${map(can)}${ptrack('shinto')}</div>`;
}

// round display: used situation cards stack here [p.3]
function rail() {
  const r = g.round;
  let li = '';
  for (let i = 1; i <= REGULAR; i++) li += `<li class="${i < r || (g.over && i <= r) ? 'done' : ''}${i === r && !g.over ? ' now' : ''}">${i}</li>`;
  for (let k = 1; k <= Math.max(3, g.climaxNo()); k++) {
    const i = REGULAR + k;
    li += `<li class="cl${i < r || (g.over && i <= r) ? ' done' : ''}${i === r && !g.over ? ' now' : ''}" title="ไคลแมกซ์ ${k}">ไคล${k}</li>`;
  }
  return `<div class="rail"><span class="lab">รอบ</span><ol>${li}</ol></div>`;
}

// the serpentine VP track: 5 columns of 10, odd columns run upward, gold every 10
function vpTrack() {
  const cut = cutInfo();
  const show = cut?.show && !cut.allOut;
  const at = {};
  for (const p of g.alive()) (at[p.vp % 50] ||= []).push(p);
  let cells = '';
  for (let row = 0; row < 10; row++) {
    for (let col = 0; col < 5; col++) {
      const v = col * 10 + (col % 2 ? 9 - row : row);
      const cls = ['vc', v % 10 === 0 && v ? 'gold' : '', show && v <= cut.line ? 'danger' : '', show && v === cut.line ? 'line' : ''].filter(Boolean).join(' ');
      cells += `<div class="${cls}"><span class="n">${v}</span>${(at[v] || []).map((p) => tok(p, ` · ${p.vp} VP`)).join('')}</div>`;
    }
  }
  const legend = show ? `<span class="cutlab">พื้นแดง = ตกรอบถ้าคัดตอนนี้ (${cut.when} เหลือ ${cut.target} คน)</span>` : `<span class="cutlab dim">เส้นตัดขึ้นตั้งแต่รอบ 6</span>`;
  return `<div class="vpt"><div class="vpt-head"><b>แถบ VP <small>戦果</small></b>${legend}</div><div class="vgrid">${cells}</div>${g.alive().some((p) => p.vp >= 50) ? '<small class="dim">เกิน 49 วนกลับไปเริ่ม 0</small>' : ''}</div>`;
}

function sitCard() {
  const s = g.sit;
  const left = REGULAR - Math.min(g.round, REGULAR);
  const body = s
    ? `<span class="lab">การ์ดสถานการณ์ · ${esc(roundLabel())}</span><b>${esc(s.name)}</b><span class="supply">จ่าย มานา +${s.mana}</span><span class="rule">${esc(s.text)}</span>`
    : '<span class="lab">การ์ดสถานการณ์</span><span class="rule">เปิดรอบละใบตอนเตรียมการ</span>';
  return `<div class="sitwrap"><div class="sitcard${g.climax() ? ' climax' : ''}">${body}</div><div class="sitdeck"><span>กองสถานการณ์ เหลือ ${left} ใบ</span><span class="cl">ไคลแมกซ์ 3 ใบแยกไว้</span></div></div>`;
}

// battlefield power track: 1–30 in three rows of ten [p.10]
function ptrack(f) {
  const ps = g.here(f).filter((p) => p.play);
  const at = {};
  for (const p of ps) (at[Math.max(0, Math.min(30, p.play.pre))] ||= []).push(p);
  let cells = '';
  for (let n = 1; n <= 30; n++) cells += `<div class="pc${at[n] ? ' on' : ''}"><span class="n">${n}${n === 30 ? '+' : ''}</span>${(at[n] || []).map((p) => tok(p, ` · พลัง ${p.play.pre}`)).join('')}</div>`;
  const zero = at[0] ? `<span class="zero">0: ${at[0].map((p) => tok(p, ' · พลัง 0')).join('')}</span>` : '';
  return `<div class="ptrack p-${f}"><div class="pt-lab"><small>แถบพลัง</small><b>${esc(AREAS[f].name)}</b>${zero}</div><div class="pgrid">${cells}</div></div>`;
}

function map(can) {
  const arrow = (i, dir, area) => {
    const kz = me().m.key === 'kuzuki' && i === 0 && started;
    return `<div class="arrow a-${dir}" style="grid-area:${area}" aria-hidden="true"><i>➜</i><span class="cost">${kz ? '0' : STEP_COST[i]}</span>${kz ? '<small>คุณฟรี</small>' : ''}</div>`;
  };
  return `<div class="map">
      ${workshop(can)}${arrow(0, 'r', 'a1')}${field('miyama', can)}${evSlot('miyama')}
      ${arrow(1, 'd', 'a2')}${evDeck()}
      ${recon(can)}${arrow(2, 'l', 'a3')}${field('shinto', can)}${evSlot('shinto')}
      <p class="maphint">ทางเดียว · เลขบนลูกศรคือมานา · จ่ายรวมได้: โรงฝึกเวท → ชินโตะ 3 · → ลาดตระเวน 5</p>
    </div>`;
}

function areaAttrs(k, can) {
  const c = can[k];
  return c ? ` data-act="area" data-to="${k}" role="button" tabindex="0" aria-label="${esc(`เลือก${AREAS[k].name}`)}"` : '';
}
const areaCls = (k, can) => `${can[k] ? ' can' : ''}${me().at === k && !me().out && started ? ' here' : ''}`;

function workshop(can) {
  const here = g.here('workshop');
  const slots = WORKSHOP.map((n, i) => {
    const p = here.find((q) => q.slot === i);
    return `<span class="dia${p ? ' full' : ''}"><span>${p ? tok(p) : `+${n}`}</span></span>`;
  }).join('');
  return `<div class="area ws${areaCls('workshop', can)}" style="grid-area:ws"${areaAttrs('workshop', can)}>
    <h3>${AREAS.workshop.name}<small>${JP.workshop} · รับ 4 คน</small></h3><div class="dias">${slots}</div>
    <span class="rule">คนแรกมานา 2 · ต่อไป 1${me().m.key === 'kuzuki' && started ? ' · คุณได้ VP แทน' : ''}</span></div>`;
}

function recon(can) {
  const p = g.here('recon')[0];
  return `<div class="area rc${areaCls('recon', can)}" style="grid-area:rc"${areaAttrs('recon', can)}>
    <h3>${AREAS.recon.name}<small>${JP.recon} · รับ 1 คน</small></h3><div class="dias"><span class="dia${p ? ' full' : ''}"><span>${p ? tok(p) : 'ว่าง'}</span></span></div>
    <span class="prize">ย้ายเข้าได้ +${RECON_VP} VP</span><span class="rule">วางตอนตั้งมั่นไม่ได้</span></div>`;
}

function field(f, can) {
  const A = AREAS[f];
  const here = g.here(f);
  const slots = TERRAIN.map((t, i) => {
    const p = here.find((q) => q.slot === i);
    return `<span class="tslot${p ? ' full' : ''}"><span class="v">+${t}</span>${p ? tok(p, p.terrain ? ` · ได้เปรียบ +${p.terrain}` : '') : ''}</span>`;
  }).join('');
  const rest = here.filter((q) => q.slot == null || q.slot >= TERRAIN.length).map((q) => tok(q, q.terrain ? ` · ได้เปรียบ +${q.terrain}` : '')).join('');
  const engaged = g.phase === 'action' && g.engagedAt(f) ? '<span class="tag-engaged" title="มี 2 คนขึ้นไป เดินออกตามปกติไม่ได้">ติดพัน</span>' : '';
  return `<div class="area field f-${f}${areaCls(f, can)}" style="grid-area:${f === 'miyama' ? 'mi' : 'sh'}"${areaAttrs(f, can)}>
    <div class="in"><h3>${A.name}</h3><small class="jp">${JP[f]} · สนามรบ</small>
      <div class="tslots" title="ช่องได้เปรียบพื้นที่ +3 และ +1">${slots}${rest}</div>${engaged}
      <div class="m-only">${evMini(f)}${pbar(f)}<span class="prize">ชนะคู่ต่อสู้ = VP การ์ด + ${bonusOf(f)}</span></div></div></div>`;
}

// event cards of a battlefield: Open (Miyama, face up) and Close (Shinto, face down until the action phase) [p.3]
function evCards(f, mini = false) {
  const hidden = f === 'shinto' && !g.shintoOpen;
  if (!g.evs[f].length) return `<div class="evcard empty${mini ? ' mini' : ''}">วางตอนเตรียมการ</div>`;
  return g.evs[f].map((e) => (hidden
    ? `<div class="evcard back${mini ? ' mini' : ''}"><b>คว่ำ</b><small>เปิดตอนปฏิบัติการ</small></div>`
    : `<div class="evcard${mini ? ' mini' : ''}" title="${esc(e.text)}"><span class="vpc">${e.vp}</span><span><b>${esc(e.name)}</b><small>${esc(e.text)}</small></span></div>`)).join('');
}
function evSlot(f) {
  const hidden = f === 'shinto' && !g.shintoOpen;
  const vp = g.eventVP(f);
  const b = bonusOf(f);
  const box = g.evs[f].length ? `<div class="vpbox"><span>คนเดียว<b>${hidden ? 'VP การ์ด' : `${vp} VP`}</b></span><span>ชนะคู่ต่อสู้<b>${hidden ? `VP การ์ด + ${b}` : `${vp + b} VP`}</b></span></div>` : '';
  return `<div class="evslot ev-${f}" style="grid-area:${f === 'miyama' ? 'op' : 'cl'}"><div class="eh"><b>${f === 'miyama' ? 'Open' : 'Close'}</b><small>อีเวนต์${f === 'miyama' ? 'มิยามะ · หงาย' : 'ชินโตะ · เปิดตอนปฏิบัติการ'}</small></div>
    <div class="evcards">${evCards(f)}</div>${box}</div>`;
}
const evMini = (f) => `<div class="evcards">${evCards(f, true)}</div>`;
function evDeck() {
  return `<div class="evdeck" style="grid-area:dk"><span class="pile"><b>${g.evDeck.length}</b>กองอีเวนต์</span><small>ใช้แล้ว ${g.evUsed.length} ใบ</small></div>`;
}

// the one-line power bar of a battlefield, for phones
function pbar(f) {
  const ps = g.here(f).filter((p) => p.play);
  const seen = {};
  const toks = ps.map((p) => {
    const v = Math.max(0, Math.min(30, p.play.pre));
    const k = seen[v] = (seen[v] || 0) + 1;
    return `<span class="pt" style="left:${(v / 30) * 100}%;--k:${k - 1}">${tok(p, ` · พลัง ${p.play.pre}`)}</span>`;
  }).join('');
  const ticks = [0, 5, 10, 15, 20, 25, 30].map((n) => `<span style="left:${(n / 30) * 100}%">${n}</span>`).join('');
  return `<div class="pbar"><small>แถบพลัง 0–30</small><div class="bar">${toks}</div><div class="ticks">${ticks}</div></div>`;
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
    el.innerHTML = `<div class="p-head"><span class="who">GAME OVER</span><h2>${esc(g.winner ? `${g.winner.name} ชนะสงครามจอกศักดิ์สิทธิ์` : 'ไม่มีผู้ชนะ')}</h2></div>
      <p class="p-text">${esc(g.how || '')}</p><div class="go-row"><button class="btn" data-act="showover">ดูอันดับ</button><button class="btn primary" data-act="again">เล่นอีกครั้ง</button></div>`;
    return;
  }
  if (!wait || wait.kind === 'combatEnd') {
    const t = g.turn;
    const what = !g.round ? 'กำลังเรียก Servant…' : t ? `${t.name} กำลังเลือก` : g.phase === 'combat' ? 'กำลังตัดสินผลการต่อสู้' : 'กำลังเตรียมรอบ';
    el.innerHTML = `<div class="p-head"><span class="who">${me().out ? 'คุณตกรอบแล้ว · ดูต่อ' : 'รอคู่แข่ง'}</span><h2>${esc(what)}</h2></div>${g.round ? orderStrip() : ''}
      ${me().out && !skip ? '<div class="go-row"><span class="dim">บอทเล่นต่อจนเหลือคนสุดท้าย</span><button class="btn" data-act="skip">ข้ามไปผลสุดท้าย</button></div>' : ''}`;
    return;
  }
  if (wait.kind === 'place') el.innerHTML = placePanel();
  else if (wait.kind === 'move') el.innerHTML = movePanel();
  else if (wait.kind === 'cards') el.innerHTML = wait.ctx.field ? cardsPanel() : discardPanel();
}

// Rin's jewel swap, in her own action turn before the cards are chosen
function swapBox() {
  const p = me();
  if (!g.canSwap(p)) return '';
  return `<div class="swap"><p class="row-lab">อัญมณี: แลกการ์ดในมือ · ใช้ ${GEM_SWAP} อัน รอบละครั้ง (เหลือ ${p.gems})</p><div class="cards">${p.hand.map((c) => tile(c, { btn: true, act: 'swappick', mini: true, sel: swapSel.has(c.uid) })).join('')}
    <button class="btn sm" data-act="swap"${swapSel.size ? '' : ' disabled'}>${swapSel.size ? `ทิ้ง ${swapSel.size} ใบ แล้วจั่วใหม่` : 'เลือกใบที่จะทิ้ง'}</button></div></div>`;
}

function placePanel() {
  const p = me();
  const opts = wait.ctx.opts.map((k) => {
    const here = g.here(k);
    let sub = '';
    if (k === 'workshop') {
      const n = WORKSHOP[here.length];
      const res = p.skills.find((c) => c.resident && c.fx.workshopVP && c.residentFrom <= g.round);
      sub = `<span>ช่อง ${here.length + 1} · <span class="gain">${p.m.key === 'kuzuki' ? `${n} VP (Calm)` : `มานา +${Math.min(n, MANA_MAX - p.mana)}`}</span>${res ? ` · ${esc(res.name)} +${res.fx.workshopVP} VP` : ''}</span><span>ไม่ได้สู้ · ตอนปฏิบัติการเดินต่อไปได้</span>`;
    } else {
      const t = here.length < TERRAIN.length ? TERRAIN[here.length] : 0;
      sub = `<span>${t ? `<span class="gain">ได้เปรียบพื้นที่ +${t}</span>` : 'โทเคนได้เปรียบหมดแล้ว'}${k === 'miyama' && p.m.key === 'shinji' ? ' · มานา +1' : ''} · ${esc(prizeText(k))}</span><span>${here.length ? `อยู่แล้ว: ${here.map((q) => esc(q.name)).join(', ')}` : 'ยังไม่มีใคร'}</span>`;
    }
    return `<button class="opt" data-act="place" data-to="${k}"><b>${esc(AREAS[k].name)}</b>${sub}</button>`;
  }).join('');
  return `<div class="p-head"><span class="who">ตาของคุณ</span><h2>ตั้งมั่น · วางหมาก Master</h2></div>
    <p class="p-text">เลือกจุดวางหมาก (กดที่กระดานก็ได้) · โรงฝึกเวทให้มานา สนามรบให้ได้เปรียบพื้นที่กับ 2 คนแรก · ลาดตระเวนวางตอนนี้ไม่ได้ ต้องย้ายเข้าตอนปฏิบัติการ</p>
    ${orderStrip()}<div class="opts">${opts}</div>`;
}

function movePanel() {
  const p = me();
  const fieldTxt = (k) => {
    const foes = g.here(k).filter((q) => q !== p);
    return foes.length ? `สู้กับ ${foes.map((q) => esc(q.name)).join(', ')} · ${esc(prizeText(k))}` : `ยังไม่มีคู่ต่อสู้ · ${esc(prizeText(k))}`;
  };
  const where = (k) => (AREAS[k].field ? fieldTxt(k) : k === 'recon' ? `ได้ ${RECON_VP} VP ทันที` : '');
  const opts = moveOpts().map((o) => {
    const A = AREAS[o.to];
    let b, sub;
    if (o.how === 'stay') { b = `อยู่ที่${A.name}`; sub = A.field ? fieldTxt(o.to) : 'ไม่สู้ · ทิ้งการ์ดคว่ำ 2 ใบ'; }
    else if (o.how === 'walk') { b = `เดินไป${A.name}`; sub = `<span class="gain">มานา ${o.cost}</span> · ${where(o.to)}${o.to === 'miyama' && p.m.key === 'shinji' ? ' · มานา +1' : ''}`; }
    else if (o.how === 'kirei') { b = 'Supervisor: ไปลาดตระเวน'; sub = `<span class="gain">มานา 2</span> · ไม่สนการติดพัน · ได้ ${RECON_VP} VP ทันที`; }
    else { b = `ย้ายไป${A.name}`; sub = `Command Spell 1 ดวง · ไม่สนการติดพัน · ${where(o.to)}`; }
    return `<button class="opt${o.how === 'cs' ? ' cs' : ''}" data-act="move" data-to="${o.to}" data-how="${o.how}"><b>${esc(b)}</b><span>${sub}</span></button>`;
  }).join('');
  const engaged = g.engagedAt(p.at) ? `<p class="p-text warnline">${esc(AREAS[p.at].name)}ติดพัน (มี 2 คนขึ้นไป) เดินออกตามปกติไม่ได้</p>` : '';
  const mana = Math.min(MANA_MAX, p.mana + (draft.cs4 ? CS_MANA : 0));
  return `<div class="p-head"><span class="who">ตาของคุณ</span><h2>ปฏิบัติการ ① ย้ายหรืออยู่ที่เดิม</h2></div>
    <p class="p-text">เดินตามลูกศรได้ทางเดียว จ่ายมานาตามลูกศร (ข้ามหลายช่องได้) แล้วค่อยลงการ์ด · มานาคุณ ${p.mana}${draft.cs4 ? ` → ${mana}` : ''}</p>${engaged}
    ${p.cs > 0 && p.mana < MANA_MAX ? `<label class="check"><input type="checkbox" id="mv-cs4"${draft.cs4 ? ' checked' : ''}> ใช้ Command Spell 1 ดวงรับมานา +${CS_MANA} ก่อนย้าย (สูงสุด ${MANA_MAX})</label>` : ''}
    ${orderStrip()}<div class="opts">${opts}</div>`;
}

function discardPanel() {
  const p = me();
  const ids = draft.ids;
  const n = Math.min(PLAY, p.hand.length);
  return `<div class="p-head"><span class="who">ตาของคุณ</span><h2>ปฏิบัติการ ② ทิ้งการ์ดคว่ำ ${n} ใบ</h2></div>
    <p class="p-text">คุณอยู่${esc(AREAS[p.at].name)} ไม่ได้สู้ · ยังต้องลงการ์ด ${PLAY} ใบ ลงแบบคว่ำไปกองทิ้ง ไม่เสียมานา คนอื่นไม่รู้ว่าทิ้งอะไร · เก็บใบดีไว้รอบหน้า</p>
    <div class="cards">${p.hand.map((c) => tile(c, { btn: true, sel: ids.includes(c.uid) })).join('')}</div>${swapBox()}
    <div class="go-row"><span class="dim">เลือกแล้ว ${ids.length}/${n}</span><button class="btn primary" data-act="discard"${ids.length === n ? '' : ' disabled'}>ทิ้งการ์ดคว่ำ</button></div>`;
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

function cardsPanel() {
  const p = me();
  const { a, cards, pw, revealing, f, off, dest } = preview();
  const mana = a.cs4 ? Math.min(MANA_MAX, p.mana + CS_MANA) : p.mana;
  const foes = g.here(p.at).filter((q) => q !== p).map((q) => `<div class="foe">${chip(q)}${q.play
    ? `<span>แถบพลัง</span><span class="pw">${q.play.pre}</span><div class="cards">${q.play.cards.map((c) => (c.down ? tile(c, { back: true, mini: true }) : tile(c, { mini: true }))).join('')}</div>`
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
  const deckRow = ubw ? `<div><p class="row-lab">สำรับ (Unlimited Blade Works ลงการ์ดโจมตีได้ถึง ${ubw.fx.ubw} ใบ)</p><div class="cards">${p.deck.map((c) => pick(c)).join('')}</div></div>` : '';

  // Command Spells and jewels (paper section 10, Rin in section 5)
  const csLeft = p.cs - (a.cs4 ? 1 : 0);
  const ctrl = [];
  if (p.cs > 0 && p.mana < MANA_MAX) ctrl.push(`<button class="btn${draft.cs4 ? ' on' : ''}" data-act="cs4" aria-pressed="${!!draft.cs4}">◆ มานา +${CS_MANA} ก่อนจ่าย</button>`);
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
  if (g.tsubame(cards)) notes.push(`ลงดาบครบ 3 ใบ: 燕返し Tsubame Gaeshi พลัง +${TSUBAME}`);
  if (revealing) notes.push(`ลงชุดนี้แล้วชื่อจริงจะเปิด: ${esc(p.sv.name)}`);
  if (dest) notes.push(off ? `ย้ายไป${esc(AREAS[dest].name)}หลังลงการ์ด: การ์ดลงกองทิ้ง ได้ ${RECON_VP} VP` : `ย้ายไป${esc(AREAS[dest].name)}หลังลงการ์ด: การ์ดตามไป ได้เปรียบพื้นที่เดิมหายไป`);
  if (a.ids.length && a.ids.every((id) => a.down.includes(id))) notes.push('คว่ำทั้ง 2 ใบ: พลังจากการ์ดเป็น 0 แต่ไม่เสียมานา');
  const left = mana - a.cost;
  const gemsLeft = p.gems - a.gemMana - (a.gand ? GEM_GAND : 0);
  const parts = pw.parts.filter(([, n]) => n).map(([t, n]) => `${esc(t)} ${n}`).join(' + ') || 'การ์ด 0';
  const infoLine = info ? `<div class="info"><b>${esc(cardName(info))}</b> · ${esc(cardText(info))}</div>` : '';
  const max = g.maxCards(p);

  return `<div class="p-head"><span class="who">ตาของคุณ</span><h2>ปฏิบัติการ ② ลงการ์ดที่${esc(AREAS[p.at].name)}</h2><span class="prize">${esc(prizeText(p.at))}</span></div>
    <p class="p-text">เลือก ${max} ใบ${g.infinite(p) ? ' (Hidden Secret: มานาไม่จำกัด)' : ''} · การ์ดโจมตีหงายหรือคว่ำทีละใบ: หงาย = จ่ายมานาและมีพลัง · คว่ำ = พลัง 0 มานา 0 · การ์ด NP/สกิลใช้ได้เมื่อมีมานา ${SKILL_MANA} ขึ้นไป · มานารวมต้องไม่เกินที่มี</p>
    ${foes ? `<div class="foes">${foes}</div>` : '<p class="p-text">ยังไม่มีคู่ต่อสู้ที่นี่ (คนที่ยังไม่เล่นอาจย้ายเข้ามา)</p>'}
    <div><p class="row-lab">การ์ดในมือ${p.specials.length ? ' · การ์ดพิเศษสีเขียวอยู่ในมือตลอด' : ''}</p><div class="cards">${p.hand.map((c) => pick(c)).join('')}${specials}</div></div>
    <div><p class="row-lab">การ์ด NP/สกิล · ${esc(p.sv.cls)}</p><div class="cards">${skills}</div></div>
    ${deckRow}${infoLine}${swapBox()}
    ${ctrl.length ? `<div class="ctrl"><span class="row-lab">Command Spell (เหลือ ${p.cs})</span>${ctrl.join('')}</div>` : ''}
    <div class="sum"><div class="go-row"><div><span class="dim">พลังรวม${dest && !off ? `ที่${esc(AREAS[f].name)}` : ''}</span><div class="big">${off ? '–' : pw.total}</div></div>
      <div class="num" style="text-align:right"><div>มานา ${mana} − ${a.cost} = <b style="color:var(--mana)">${left}</b></div>${p.m.key === 'rin' ? `<div class="dim">อัญมณีเหลือ ${gemsLeft}</div>` : ''}<div class="dim">Command Spell เหลือ ${csLeft - a.cs2 - (a.csMove ? 1 : 0)}</div></div></div>
      <div class="parts">${parts}</div>${notes.map((n) => `<div class="warn">${n}</div>`).join('')}</div>
    <div class="go-row"><button class="btn ghost" data-act="reset">ใช้ชุดที่แนะนำ</button><button class="btn primary" data-act="play">ลงการ์ด${off ? '' : ` · พลัง ${pw.total}`}</button></div>`;
}

function stepper(key, label, v, max) {
  return `<span class="stepper"><span>${label}</span><button data-act="step" data-key="${key}" data-d="-1" aria-label="ลด"${v <= 0 ? ' disabled' : ''}>−</button><b>${v}</b><button data-act="step" data-key="${key}" data-d="1" aria-label="เพิ่ม"${v >= max ? ' disabled' : ''}>+</button></span>`;
}

// ---------- my Master board (paper section 4.2) ----------
function drawDock() {
  const p = me();
  if (!started) { $('#dock').innerHTML = '<p class="p-text">เลือก Master แล้วกระดาน Master ของคุณจะอยู่ตรงนี้</p>'; return; }
  const track = Array.from({ length: MANA_MAX + 1 }, (_, i) => `<span class="md${i === p.mana ? ' now' : ''}${i === p.m.mana ? ' start' : ''}${i >= SKILL_MANA ? ' gold' : ''}${i < p.mana ? ' on' : ''}"><i>${i}</i></span>`).join('');
  const seals = Array.from({ length: 3 }, (_, i) => `<span class="seal${i < p.cs ? ' on' : ''}">${i < p.cs ? '令呪' : i >= p.m.cs ? 'ขาด' : 'ใช้แล้ว'}</span>`).join('');
  const skillNote = (c) => {
    if (c.gone) return 'ใช้แล้ว · ครั้งเดียว';
    if (c.resident) return c.residentFrom > g.round ? 'ค้าง · มีผลรอบหน้า' : 'ค้างอยู่';
    if (p.uses[c.name]) return 'ใช้แล้ว · หงายไว้';
    return g.round && !g.over ? g.skillState(p, c) || 'พร้อมใช้' : 'คว่ำไว้';
  };
  const skills = p.skills.map((c) => tile(c, { note: skillNote(c), lock: !c.gone && !c.resident && !!(g.round && !g.over && g.skillState(p, c)) })).join('');
  const hand = p.hand.map((c) => tile(c)).join('') + p.specials.map((c) => tile(c, { note: g.round && !g.over ? g.specialState(p, c) || 'การ์ดพิเศษ' : 'การ์ดพิเศษ' })).join('');
  const trash = p.trash.slice(-5).map((c) => tile(c, { mini: true })).join('') || '<span class="dim">ว่าง</span>';
  const more = `<div class="mb-tarot"><img src="${SV_ART[p.sv.key]}" alt="${esc(p.sv.name)}"><div class="who"><span class="cls">${esc(p.sv.cls.toUpperCase())}</span><b>${esc(p.sv.name)}</b>
      <span class="hide${p.revealed ? ' open' : ''}">${p.revealed ? 'ไพ่ทาโรต์หงายแล้ว ทุกคนเห็น' : 'ไพ่ทาโรต์คว่ำ คู่แข่งไม่รู้ว่าคุณเป็นใคร'}</span></div></div>
    <ul class="mb-abil">${p.m.abil.map(([t, d]) => `<li><b>${esc(t)}</b>${d ? `<span>${esc(d)}</span>` : ''}</li>`).join('')}</ul>
    <div class="mb-piles"><div class="pile deck"><b>${p.deck.length}</b><small>สำรับ</small></div>
      <div class="trash"><p class="row-lab">กองทิ้ง ${p.trash.length} ใบ · วางตามด้านที่ลง คนอื่นเห็นแค่ใบหงาย</p><div class="cards">${trash}</div></div></div>`;
  $('#dock').innerHTML = `<div class="mb-head"><span class="who">กระดาน Master</span><h2>${esc(p.m.name)} <small>(คุณ)</small></h2>
      <span class="lvl">ระดับ${esc(p.m.level)}</span>${p.out ? '<span class="bad">ตกรอบแล้ว</span>' : ''}<span class="vpbig"><b>${p.vp}</b> VP</span></div>
    <div class="mb-grid"><div class="d-only mb-more">${more}</div>
      <div class="mb-res">
        <div><p class="row-lab">แถบมานา 0–${MANA_MAX} · ตอนนี้ <b style="color:var(--mana)">${p.mana}</b> · ช่องทอง ${SKILL_MANA}+ ใช้ NP/สกิลได้ · กรอบเขียว = ค่าเริ่ม</p><div class="mtrack">${track}</div></div>
        <div class="mb-cs"><p class="row-lab">Command Spell ${p.cs}/3</p><div class="seals">${seals}</div>${p.m.key === 'rin' ? `<span class="gems">อัญมณี <b>${p.gems}</b></span>` : ''}</div>
      </div></div>
    <div class="mycards"><div><p class="row-lab">การ์ดในมือ ${p.hand.length}${p.specials.length ? ' + การ์ดพิเศษ' : ''}</p><div class="cards">${hand || '<span class="dim">ยังไม่มีการ์ด</span>'}</div></div>
      <div><p class="row-lab">การ์ด NP/สกิล ${p.skills.length} ใบ · คว่ำจนกว่าจะใช้</p><div class="cards">${skills}</div></div></div>
    <details class="m-only mb-moredet"><summary>ดูเพิ่ม: ไพ่ทาโรต์ · ความสามารถ · สำรับ · กองทิ้ง</summary>${more}</details>`;
}

// ---------- side: every Master's public info, ranked by VP (paper 4.3–4.5) ----------
function topTrash(p) {
  const c = p.trash[p.trash.length - 1];
  if (!c) return '<span class="dim">ว่าง</span>';
  if (c.down && !p.isHuman) return '<span class="tt back">คว่ำ</span>';
  return `<span class="tt t${c.type}">${c.down ? 'คว่ำ · ' : ''}${esc(cardName(c))}</span>`;
}
function drawStandings() {
  const alive = [...g.alive()].sort((a, b) => b.vp - a.vp);
  const out = g.players.filter((p) => p.out).sort((a, b) => b.outRound - a.outRound || b.vp - a.vp);
  const cut = cutInfo();
  const sun = g.order()[0];
  const line = cut?.show && !cut.allOut ? alive.findIndex((p) => p.vp <= cut.line) : -1;
  const row = (p, i) => {
    const used = p.skills.filter((c) => p.uses[c.name]).map((c) => c.name);
    return `<li class="${p.isHuman ? 'me' : ''}${p.out ? ' out' : ''}"><span class="rk">${p.out ? '✖' : i + 1}</span>
      <span class="who">${chip(p, p === sun && !p.out && !g.over ? `<span class="t" title="ผู้เริ่มรอบนี้">${SUN}</span>` : '')}</span>
      <span class="vp">${p.vp}</span>
      <span class="pub"><span class="m">มานา ${p.mana}</span> · <span class="cs" title="Command Spell">${csDots(p.cs)}</span>${p.m.key === 'rin' ? ` · อัญมณี ${p.gems}` : ''}${p.out ? ` · ตกรอบหลังรอบ ${p.outRound}` : p.at ? ` · ${esc(AREAS[p.at].name)}` : ''}</span>
      <span class="pub2"><span class="sv">${esc(svLabel(p))}</span>${used.length ? ` · NP หงาย: ${esc(used.join(', '))}` : ''} · ทิ้งล่าสุด ${topTrash(p)}</span></li>`;
  };
  let rows = '';
  alive.forEach((p, i) => { if (i === line) rows += `<li class="cutline">เส้นตัด ${cut.target} คน · ใต้เส้นตกรอบถ้า${cut.when}ตอนนี้</li>`; rows += row(p, i); });
  rows += out.map((p) => row(p, 0)).join('');
  const sub = g.over ? 'จบเกม' : cut?.allOut ? 'ทุกคนเสมอที่เส้นตัด จะไม่มีใครออก' : !g.climax() ? `จบรอบ ${REGULAR} เหลือ 4 คน · เสมอที่เส้นตัดออกหมด` : 'คัดออกจนเหลือคนสุดท้าย';
  $('#standings').innerHTML = `<div class="st-head"><h2>Master ทุกคน · อันดับ VP</h2><small>${sub}</small></div><ol class="st">${rows}</ol>`;
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
      <span class="en">${esc(m.en.toUpperCase())} · ระดับ${esc(m.level)}</span><b>${esc(m.name)}</b><span class="st2">มานาเริ่ม ${m.mana} · Command Spell ${m.cs}${m.gems ? ` · อัญมณี ${m.gems}` : ''}</span>
      <ul>${m.abil.map(([t, d]) => `<li>${esc(t)}${d ? `: ${esc(d)}` : ''}</li>`).join('')}</ul></button>`).join('');
  openModal(`<div class="dlg"><span class="eyebrow">เดโม 1 ด่าน · เมืองฟุยุกิ · กติกาตามคู่มือ</span><div class="title-crest">DOMINATE GRAIL WAR</div>
    <p class="lede">สงครามจอกศักดิ์สิทธิ์ 7 Master กับ 7 Servant ของ Fate/stay night · เก็บ VP 8 รอบ แล้วเข้าไคลแมกซ์ คนที่ VP น้อยถูกคัดออก 4 → 2 → 1 · คนสุดท้ายที่เหลือชนะ</p>
    <ol class="how"><li>ตั้งมั่น: วางหมากที่โรงฝึกเวทเพื่อเก็บมานา หรือที่สนามรบเพื่อรับได้เปรียบพื้นที่</li><li>ปฏิบัติการ: ย้ายตามลูกศร แล้วลงการ์ด 2 ใบ หงายเพื่อสู้ คว่ำเพื่อหลอก</li><li>มีมานา ${SKILL_MANA} ขึ้นไปใช้การ์ด NP/สกิลได้ · มานาสูงสุด ${MANA_MAX}</li><li>Command Spell 3 ดวง ใช้ในตาของตัวเอง: มานา +${CS_MANA} · พลัง +${CS_POWER} · ย้ายไม่สนติดพัน</li></ol>
    <h2>เลือก Master ของคุณ</h2><div class="masters">${ms}</div>
    <p class="lede">Servant สุ่มให้ และเป็นความลับจนกว่าจะเปิดชื่อจริง · ตัวเลขการ์ด การ์ดสถานการณ์ และการ์ดอีเวนต์เป็นค่าแทน เพราะในคู่มืออ่านไม่ออก</p>
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
      <li><b>ปฏิบัติการ:</b> เปิดอีเวนต์ชินโตะ แล้วทีละคน ① ย้ายตามลูกศรทางเดียว (มานา ${STEP_COST.join(' / ')}) · สนามรบที่มี 2 คนขึ้นไปติดพัน เดินออกไม่ได้ · เข้าลาดตระเวน (รับ 1 คน) ได้ ${RECON_VP} VP ทันที ② ลงการ์ด 2 ใบ หงายหรือคว่ำทีละใบ · หงาย = ใช้ค่าบนการ์ด · คว่ำ = พลัง 0 มานา 0 ไม่มีผล · แล้ววางหมากบนแถบพลัง</li>
      <li><b>ต่อสู้:</b> ผล "ตอนปะทะ" ทำตามลำดับที่นั่ง · พลังรวมสูงสุดที่ไม่ [แพ้] ชนะ ได้ VP การ์ดอีเวนต์ + ${AREAS.miyama.bonus} (มิยามะ) หรือ + ${AREAS.shinto.bonus} (ชินโตะ) · เสมอแบ่งกันปัดขึ้น · อยู่คนเดียวได้แค่ VP การ์ดอีเวนต์ · แพ้ไม่เสียอะไร</li>
      <li><b>จบรอบ:</b> การ์ดลงกองทิ้งตามด้านที่ลง · การ์ด NP/สกิลกลับข้างไพ่ทาโรต์แบบหงาย · ผู้เริ่ม (${SUN}) เลื่อนไปคนถัดไป</li></ol></div>
    <div><h3>มานาและการ์ด NP/สกิล</h3><p>มานา 0–${MANA_MAX} · การ์ด NP/สกิลเลือกได้เมื่อมีมานา ${SKILL_MANA} ขึ้นไป แล้วจ่ายตามการ์ด · ใช้แล้วใช้ซ้ำได้ ยกเว้น "ครั้งเดียวต่อเกม" · การ์ดที่มี "เปิดชื่อจริง" หงายไพ่ทาโรต์ของคุณ</p></div>
    <div><h3>Command Spell</h3><p>ใช้ได้เฉพาะในตาปฏิบัติการของตัวเอง ก่อนย้าย ระหว่างย้ายกับลงการ์ด หรือหลังลงการ์ด · 1 ดวงต่อ 1 ผล: มานา +${CS_MANA} · พลังรวม +${CS_POWER} และถ้าชนะได้ VP +${CS_VP} · ย้ายไปที่ไหนก็ได้ยกเว้นโรงฝึกเวท ไม่สนการติดพัน</p></div>
    <div><h3>ข้อยกเว้นของ Master</h3><p>ชิโร่ไม่ตกรอบตอนคัดหลังรอบ ${REGULAR} (Avalon) · ชินจิอยู่อันดับสุดท้ายคนเดียวตอนจบรอบ ${REGULAR} ชนะทันที (Clown) · ซากุระตั้งแต่รอบ ${SAKURA_FROM} ถูกบังคับเสียมานา 2 ได้ 2 VP และในไคลแมกซ์ถ้าไม่ได้อันดับ 1 มานาไม่จำกัด</p></div>
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
    <span class="vp">${p.vp}</span><span class="pub">${p.out ? `ตกรอบหลังรอบ ${p.outRound}` : p === g.winner ? 'ผู้ชนะ' : 'อยู่ถึงจบ'}</span><span class="pub2">${esc(`${p.sv.cls} · ${p.sv.name}`)}</span></li>`).join('');
  const meWon = g.winner === me();
  openModal(`<div class="dlg narrow"><span class="eyebrow">Heaven's Feel · จบเกม</span>
    <h2>${meWon ? 'คุณชนะสงครามจอกศักดิ์สิทธิ์' : `${esc(g.winner ? g.winner.name : 'ไม่มีใคร')} ชนะ`}</h2>
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
});

// first screen: an empty board behind the Master picker
g = new Game({ decide: () => new Promise(() => {}), onEvent: () => {}, humanMaster: setup.master });
render();
showStart();
