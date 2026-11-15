// DOM front end for design v1.8. Renders the HUD from game state and answers
// the human's decisions by returning Promises that resolve when the player
// clicks (or the timer runs out). Night fights are replayed in the battle scene.

import {
  AREAS, AREA_KEYS, FIELDS, SAFE_AREAS, SERVANTS, TYPES, DAILY, ITEMS, buildDeck,
  MANA_MAX, DEATHS_FOR_GRAIL, SEAL_MAX, HAND_SIZE, ITEM_MAX, SHADOW_BASE, CHURCH_MONSTER_BASE,
} from './data.js';
import { LAST_DAY } from './engine.js';
import { chooseCards } from './bot.js';
import { CLASS_ART, CLASS_COLOR } from './portraits.js';
import { servantArt, servantIcon } from './servant-art.js';
import { MAP_ART } from './map-art.js';
import { SEAL_SPRITE } from './ui-art.js';
import { QUICKSTART, TERMS, DAY, MOVE, CARDS, FIRST_DAY } from './help.js';

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DAY_SECONDS = 30, MOVE_SECONDS = 15, CARD_SECONDS = 20;
const PLAYER_COLORS = ['#5b8def', '#e0c341', '#e0565b', '#5ec48a', '#f08a3c', '#a77be8', '#c98a5a', '#8d93a6'];

// turn "ทอย [3,5]" into dice glyphs
function fmt(text) {
  return esc(text).replace(/\[([\d,]+)\]/g, (_, list) =>
    `<span class="dice">${list.split(',').map((d) => `<b class="die">${FACES[d - 1] ?? d}</b>`).join('')}</span>`);
}

function bar(cur, max, cls, label = true) {
  const pct = Math.max(0, Math.min(100, (cur / max) * 100));
  return `<div class="bar ${cls}"><i style="width:${pct}%"></i>${label ? `<span>${cur}/${max}</span>` : ''}</div>`;
}

// the Command Seal picture shows 3, 2, 1 or 0 parts left
const sealIcon = (n, cls = '') => `<span class="seal-icon s${Math.max(0, Math.min(SEAL_MAX, n))} ${cls}"></span>`;
const seals = (n) => `<span class="seals" title="Command Seal">${'◆'.repeat(n)}${'◇'.repeat(Math.max(0, SEAL_MAX - n))}</span>`;
// the two monsters (design 7 and 8): what they are called and their base power
const MONSTERS = {
  shadow: { name: 'มอนสเตอร์เงาดำ', base: SHADOW_BASE },
  church: { name: 'ภูตร้ายใต้โบสถ์', base: CHURCH_MONSTER_BASE },
};
// pass `key` only when the viewer knows the Servant's true name; otherwise the
// class art keeps it hidden. A missing or broken image falls back to the class art.
const art = (cls, key) => servantArt(key) || (cls && CLASS_ART[cls]) || '';
const fallback = (cls) => (cls && CLASS_ART[cls] ? ` onerror="this.onerror=null;this.src='${CLASS_ART[cls]}'"` : '');
// small round portraits use the Servant's face icon
const portrait = (cls, size = '', key) => cls
  ? `<img class="pt ${size}" src="${servantIcon(key) || art(cls, key)}" alt="${cls}"${fallback(cls)}>`
  : `<span class="pt ${size} empty">?</span>`;

// one Servant card as a small tile; `why` explains a disabled card
function cardTile(c, { sel = false, off = false, back = false, attrs = '', extra = '', cost = c.cost, why = '' } = {}) {
  const t = TYPES[c.type];
  if (back) return `<div class="gcard back"><span>?</span></div>`;
  return `<button class="gcard k-${c.kind} ${sel ? 'sel' : ''} ${extra}" style="--tc:${t.color}" ${off ? 'disabled' : ''} ${attrs}
    title="${esc(c.name)}${t.th ? ` (${t.th})` : ''} · พลัง ${c.power} · ${cost} มานา${c.text ? ' · ' + esc(c.text) : ''}${why ? ' · ' + esc(why) : ''}">
    <i class="gc-type">${t.icon}</i><b class="gc-pow">${c.power}</b><em class="gc-cost">${cost ? cost + '◈' : 'ฟรี'}</em>
    <span class="gc-name">${esc(c.name)}</span>${c.text ? `<small>${esc(c.text)}</small>` : ''}${why ? `<small class="why">${esc(why)}</small>` : ''}</button>`;
}

// a choice button: title, tags, one line saying what it does, and the reason when disabled
function optBtn({ cls = 'arow', sel = false, off = false, attrs = '', label, tags = '', desc = '', when = '', why = '' }) {
  const tip = [desc, when && `ควรเลือกเมื่อ: ${when}`].filter(Boolean).join(' · ');
  return `<button class="${cls} ${sel ? 'sel on' : ''}" ${off ? 'disabled' : ''} ${attrs} ${tip ? `data-tip="${esc(tip)}" title="${esc(tip)}"` : ''}>
    <b>${label}</b>${tags}${desc ? `<span class="desc">${esc(desc)}</span>` : ''}${off && why ? `<span class="why">${esc(why)}</span>` : ''}</button>`;
}

// who gets in first when an area is full (Appendix ก.3)
const a11yPrio = (a) => a === 'church' ? '· โบสถ์ให้คน Command Seal น้อยสุดก่อน' : a === 'temple' || a === 'mansion' ? '· คนมานาน้อยสุดได้เข้าก่อน' : '';

// where each area's box sits on the Fuyuki map picture (percent of width, height),
// next to its landmark: Ryuudou Temple, Miyama shopping street, Tohsaka house,
// Shinto station front, Kotomine Church
const MAP_SPOTS = { temple: [11, 31], miyama: [31, 57], mansion: [50, 85], shinto: [79, 47], church: [89, 81] };
const MAP_RATIO = 1200 / 525;
const MAP_MIN_H = 170; // smallest map that still fits the five boxes apart

const help = (key) => `data-help="${key}" title="${esc(TERMS[key][1])}"`;

export class UI {
  constructor() {
    this.game = null;
    this.fast = false;
    this.mode = null;
    this.sel = {};
    this.hints = true;
    this.hintsSeen = new Set();
    $('#logbtn').onclick = () => { $('#logdrawer').hidden = !$('#logdrawer').hidden; };
    $('#helpbtn').onclick = () => this.showGuide();
    this.setupTips();
    window.addEventListener('resize', () => this.fitMap());
    // the stage also changes size when the choice panel grows or shrinks (hint opened, options added)
    if (window.ResizeObserver) new ResizeObserver(() => this.fitMap()).observe($('#stage'));
    // set once as CSS variables so re-rendering the stage does not copy the pictures
    document.documentElement.style.setProperty('--map-day', `url("${MAP_ART.day}")`);
    document.documentElement.style.setProperty('--map-night', `url("${MAP_ART.night}")`);
    document.documentElement.style.setProperty('--seal-sprite', `url("${SEAL_SPRITE}")`);
    this.fxQueue = 0;
    this.fxTimers = new Set();
    this.pendingFx = { mana: 0, seals: [] };
    this.holdFx = false;
  }

  // ================= explanations (design 13.2) =================
  // tap a value to read what it means; press and hold (or hover) a button for the full text
  setupTips() {
    const tip = $('#tip');
    const show = (el) => {
      const key = el.dataset.help;
      const html = key && TERMS[key] ? `<b>${esc(TERMS[key][0])}</b>${esc(TERMS[key][1])}` : esc(el.dataset.tip || '');
      const extra = el.dataset.pools ? `<br><small>${esc(el.dataset.pools)}</small>` : '';
      if (!html) return;
      tip.innerHTML = html + extra;
      tip.hidden = false;
      const r = el.getBoundingClientRect();
      const w = tip.offsetWidth, h = tip.offsetHeight;
      const left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2));
      const top = r.top - h - 8 > 8 ? r.top - h - 8 : Math.min(window.innerHeight - h - 8, r.bottom + 8);
      tip.style.left = `${left}px`; tip.style.top = `${top}px`;
      clearTimeout(this.tipTimer);
      this.tipTimer = setTimeout(() => { tip.hidden = true; }, 4500);
    };
    let press = null;
    document.addEventListener('pointerdown', (e) => {
      const el = e.target.closest('[data-tip],[data-help]');
      clearTimeout(press);
      if (el) press = setTimeout(() => { show(el); this.suppressClick = true; }, 450);
    });
    const cancel = () => clearTimeout(press);
    document.addEventListener('pointerup', cancel);
    document.addEventListener('pointercancel', cancel);
    document.addEventListener('click', (e) => {
      if (this.suppressClick) { this.suppressClick = false; e.stopPropagation(); e.preventDefault(); return; }
      const el = e.target.closest('[data-help]');
      if (el && (!el.closest('button') || el.closest('.anode[tabindex="-1"]'))) show(el);
      else tip.hidden = true;
    }, true);
  }

  // first-day box for this step; closed boxes come back from the "?" guide
  hint(step) {
    if (!this.hints || (this.game.day !== 1 && !this.forceHints) || this.hintsSeen.has(step) || !FIRST_DAY[step]) return '';
    return `<div class="hintbox" data-hint="${step}"><button class="hb-x" data-closehint="${step}" title="ปิดคำแนะนำ">✕</button>💡 ${FIRST_DAY[step]}</div>`;
  }
  wireHints() {
    // the hint box is one line until tapped (design 13.1)
    $('#choice').querySelectorAll('.hintbox').forEach((h) => h.addEventListener('click', (e) => { if (!e.target.closest('[data-closehint]')) h.classList.toggle('open'); }));
    $('#choice').querySelectorAll('[data-closehint]').forEach((b) => b.onclick = () => {
      this.hintsSeen.add(b.dataset.closehint);
      b.closest('.hintbox').remove();
    });
  }

  showGuide(tab = 'start') {
    const g = $('#guide');
    const tabs = [['start', 'เล่นเป็นใน 1 นาที'], ['terms', 'คำศัพท์'], ['areas', 'พื้นที่ 5 แห่ง']];
    let body = '';
    if (tab === 'start') body = `<ol>${QUICKSTART.map((t) => `<li>${t}</li>`).join('')}</ol>`;
    if (tab === 'terms') body = `<dl>${Object.values(TERMS).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`;
    if (tab === 'areas') body = `<dl>${AREA_KEYS.map((a) => `<dt>${AREAS[a].name}</dt><dd>${esc(DAY[a][0])}<br><small class="muted">ควรเลือกเมื่อ: ${esc(DAY[a][1])}</small></dd>`).join('')}</dl>`;
    g.querySelector('.sheet').innerHTML = `<h2>คู่มือ</h2>
      <div class="tabs">${tabs.map(([k, l]) => `<button class="small ${k === tab ? 'on' : ''}" data-gtab="${k}">${l}</button>`).join('')}</div>
      ${body}
      <div class="confirm-row" style="margin-top:14px">
        <button class="small" id="g-hints">${this.hints && !this.hintsSeen.size ? 'คำแนะนำวันแรก: เปิดอยู่' : 'เปิดคำแนะนำวันแรกอีกครั้ง'}</button>
        <button class="primary" id="g-close">ปิด</button></div>`;
    g.hidden = false;
    g.querySelectorAll('[data-gtab]').forEach((b) => b.onclick = () => this.showGuide(b.dataset.gtab));
    g.querySelector('#g-close').onclick = () => { g.hidden = true; };
    g.querySelector('#g-hints').onclick = () => {
      this.hints = true; this.hintsSeen.clear(); this.forceHints = true;
      g.hidden = true;
      if (this.mode) this.redrawChoice?.();
    };
    g.onclick = (e) => { if (e.target === g) g.hidden = true; };
  }

  attach(game) {
    this.game = game;
    this.fast = false;
    this.timeKey = null;
    this.holdFx = false;
    this.clearFx();
    this.mode = null;
    $('#logdrawer .lines').innerHTML = '';
    this.renderAll();
    this.setChoice('');
  }

  get me() { return this.game.human; }
  color(pl) { return PLAYER_COLORS[pl.id % PLAYER_COLORS.length]; }

  onEvent(e) {
    switch (e.type) {
      case 'log': this.addLog(e.entry); break;
      case 'mana': if (e.pl === this.me) this.pendingFx.mana += e.n; break;
      case 'seal': if (e.pl === this.me) this.pendingFx.seals.push(e.d); break;
      case 'phase':
        // from card play until the replay is over, gains wait (see animateChanges)
        this.holdFx = this.game.stage === 'cards';
        this.renderAll();
        if (this.game.stage === 'cards') this.cardsWaiting();
        if (this.game.stage === 'move') this.moveWaiting();
        break;
      default: this.renderAll();
    }
  }

  // ================= HUD =================
  renderAll() {
    if (!this.game) return;
    // daytime gets the bright theme (design 13.1); the body background fades between them
    document.body.classList.toggle('daytime', this.game.half !== 'night');
    this.renderTrack();
    this.renderBanner();
    this.renderCard();
    this.renderHand();
    this.renderStage();
    this.renderPlayers();
    this.animateChanges();
  }

  // ================= animations: a new day or night, mana gained, Command Seal used =================
  // Mana and Command Seal changes arrive as engine events and wait here until the
  // player can see them: never on top of the battle replay (that would give the
  // result away) and never after the war is over.
  animateChanges() {
    const g = this.game, me = this.me;
    if (this.fast || g.over || me.out) { this.dropFx(); return; }
    const key = `${g.day}-${g.half}-${g.nightNo}`;
    if (g.stage !== 'setup' && key !== this.timeKey) {
      this.timeKey = key;
      this.timeFx();
    }
    if (this.holdFx || !$('#battle').hidden) return;
    const p = this.pendingFx;
    this.pendingFx = { mana: 0, seals: [] };
    if (p.mana) this.manaFx(p.mana);
    if (p.seals.length) {
      const used = p.seals.filter((d) => d < 0).length, gained = p.seals.length - used;
      let n = me.seals - p.seals.reduce((a, d) => a + d, 0);
      if (used) { this.sealFx(n, n - used); n -= used; }
      if (gained) this.sealFx(n, n + gained);
    }
  }

  dropFx() { this.pendingFx = { mana: 0, seals: [] }; }

  // stop every effect at once (game over, new game)
  clearFx() {
    for (const t of this.fxTimers) clearTimeout(t);
    this.fxTimers.clear();
    $('#fx').innerHTML = '';
    this.fxQueue = 0;
    this.dropFx();
  }

  later(fn, ms) {
    const t = setTimeout(() => { this.fxTimers.delete(t); fn(); }, ms);
    this.fxTimers.add(t);
  }

  // add an effect to the top layer and remove it when it is done
  fx(el, ms) {
    $('#fx').appendChild(el);
    this.later(() => el.remove(), ms);
  }

  // effects in the middle of the screen take turns so they never cover each other
  centerFx(el, ms) {
    const at = Math.max(Date.now(), this.fxQueue);
    this.fxQueue = at + ms - 300;
    this.later(() => this.fx(el, ms), at - Date.now());
  }

  // the battle replay waits until the middle of the screen is clear
  async fxIdle() {
    const wait = this.fxQueue + 300 - Date.now();
    if (wait > 0) await sleep(wait);
  }

  timeFx() {
    const g = this.game, night = g.half === 'night';
    const el = document.createElement('div');
    el.className = `time-fx ${night ? 'night' : 'day'}`;
    el.innerHTML = night
      ? `<div class="tf-icon">☾</div><b>กลางคืน${g.nightNo === 2 ? ' · รอบ 2' : ''}</b><small>วันที่ ${g.day}/${LAST_DAY}</small>`
      : `<div class="tf-icon">☀</div><b>วันที่ ${g.day}</b><small>กลางวัน · ${g.day}/${LAST_DAY}</small>`;
    this.centerFx(el, 2000);
  }

  manaFx(delta) {
    const bar = $('#charcard .bar.mana');
    if (!bar) return;
    const r = bar.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight) return;
    const glow = document.createElement('div');
    glow.className = 'mana-glow';
    Object.assign(glow.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    this.fx(glow, 900);
    const el = document.createElement('div');
    el.className = 'mana-fx';
    Object.assign(el.style, { left: `${r.left + r.width / 2}px`, top: `${r.top}px` });
    el.innerHTML = `<b>+${delta} ◈</b>${Array.from({ length: 8 }, (_, k) => `<i style="--k:${k}"></i>`).join('')}`;
    this.fx(el, 1400);
  }

  sealFx(before, after) {
    const used = after < before;
    const el = document.createElement('div');
    el.className = `seal-fx ${used ? 'use' : 'gain'}`;
    el.innerHTML = `<div class="sf-ring"></div><div class="sf-art">${sealIcon(before, 'big before')}${sealIcon(after, 'big after')}</div>
      <b>${used ? 'ใช้ Command Seal' : 'ได้ Command Seal'}</b><small>เหลือ ${after}/${SEAL_MAX}</small>`;
    this.centerFx(el, 1900);
  }

  // the day as one line of text at the top of the right column (design 13.1)
  renderTrack() {
    const g = this.game;
    const night = g.half === 'night';
    $('#daytrack').classList.toggle('night', night);
    $('#daytrack').innerHTML = `<div class="day-now">${night ? '☾ กลางคืน' : '☀ กลางวัน'} ${g.day}/${LAST_DAY}${night && g.nightNo === 2 ? ' · รอบ 2' : ''}</div>`;
  }

  stageName() {
    return { setup: 'เตรียมตัว', choose: 'เลือกพื้นที่', dayResult: 'ผลกลางวัน', move: 'ย้ายพื้นที่', cards: 'ลงการ์ด', result: 'ผลการต่อสู้' }[this.game.stage] || '';
  }

  // the step line: what is happening now and what you have to do (design 13.2)
  stepText() {
    const g = this.game, me = this.me;
    if (me.out) return 'คุณตกรอบแล้ว ดูต่อได้';
    switch (this.mode) {
      case 'day': return 'เลือกที่จะไป แล้วกดยืนยัน';
      case 'move': return 'อยู่ที่เดิม ย้าย หรือหนี';
      case 'cards': return this.fight?.church ? `ปราบมอนสเตอร์ในโบสถ์ · พลัง ${CHURCH_MONSTER_BASE} + ลูกเต๋า · ชนะได้ Command Seal` : 'เลือกการ์ด 2 ใบ (หรือ NP + การ์ด 1 ใบ)';
      default: break;
    }
    if (g.stage === 'cards') return (g.fights || []).some((f) => f.players.includes(me)) ? 'รอทุกคนลงการ์ด' : 'รอการต่อสู้ที่อื่น';
    if (g.stage === 'result') return 'ดูผลการต่อสู้';
    if (['choose', 'move'].includes(g.stage)) return 'รอทุกคนเลือก';
    return this.stageName();
  }

  renderBanner() {
    const g = this.game;
    let pill;
    if (g.grail.appeared) {
      const where = g.grail.holder ? `${esc(g.grail.holder.name)} ถือจอก` : `วางอยู่ที่${AREAS[g.grail.area].name}`;
      pill = `<span class="pill-tag">HOLY GRAIL</span><b>จอกศักดิ์สิทธิ์</b> ${where} · จบคืนวันที่ ${g.grail.endDay}`;
    } else {
      pill = `<span class="pill-tag">WAR</span><b>ตายรวม ${g.deaths}/${DEATHS_FOR_GRAIL}</b> ครบแล้วจอกศักดิ์สิทธิ์ปรากฏ`;
    }
    const sit = g.situation ? DAILY[g.situation] : null;
    const secs = this.mode ? ` · <span class="step-sec" id="stepsec">${this.timeLeft()}</span> วิ` : '';
    $('#banner').innerHTML = `<div class="phase-title">${g.half === 'night' ? `☾ กลางคืน ${g.nightNo}` : '☀ กลางวัน'} · ${this.stepText()}${secs}</div>
      <div class="pill" ${help(g.grail.appeared ? 'grail' : 'deaths')} data-pools="อัญเชิญได้อีก: กองกลาง ${g.stage === 'choose' && g.poolShown ? g.poolShown.pool : g.pool.length} · กอง Alter ${g.stage === 'choose' && g.poolShown ? g.poolShown.alter : g.alterPool.length}">${pill}</div>
      ${sit ? `<div class="sit" ${help('daily')}><span class="pill-tag warn">อีเวนต์ประจำวัน</span> <b>${esc(sit.name)}</b> <small>${esc(sit.text)}${g.shadowArea ? ` · ที่${AREAS[g.shadowArea].name}` : ''}</small></div>` : ''}`;
  }

  // Servant card + status, always at the top left (design 13.1)
  renderCard() {
    const me = this.me, g = this.game;
    const s = me.servant;
    if (!s || me.catalystPending) {
      const why = me.out ? 'คุณตกรอบแล้ว' : me.catalystPending ? 'วัตถุเชื่อมโยง: เลือก Servant ตนใหม่ตอนกลางวัน' : 'ยังไม่มี Servant';
      $('#charcard').innerHTML = `<div class="ccard empty"><p class="muted">${why}</p>${me.out ? '' : `<div class="cc-row"><span class="cc-seals" ${help('seal')}>${sealIcon(me.seals)}<b>${me.seals}/${SEAL_MAX}</b></span><span ${help('mana')}>◈${me.mana}</span></div>`}</div>`;
      return;
    }
    const def = s.def;
    const flags = FIELDS.filter((f) => g.flags[f] === me.id).map((f) => AREAS[f].short);
    const tags = [
      s.revealed ? `<span class="tag bad" ${help('revealed')}>ชื่อจริงถูกเปิด −2</span>` : '',
      me.resting && g.half === 'night' ? `<span class="tag warn" ${help('resting')}>พักฟื้น</span>` : '',
      flags.length ? `<span class="tag warn" ${help('flag')}>⚑ ${flags.join(', ')} +3</span>` : '',
      me.churchMonster ? `<span class="tag warn" data-tip="${esc(DAY.monster[0])}">ปราบภูตร้าย กลางคืน 1</span>` : '',
    ].filter(Boolean).join('');
    $('#charcard').innerHTML = `<div class="ccard cls-${s.cls}" style="--cc:${CLASS_COLOR[s.cls]}">
      <div class="cc-art" style="background-image:url('${art(s.cls, s.key)}')"><span class="cc-cls">${s.cls}${def.alter ? ` · <span ${help('alter')}>Alter</span>` : ''}</span></div>
      <div class="cc-body">
        <div class="cc-name" title="${esc(def.name)}">${esc(def.name)}</div>
        <div ${help('hp')}>${bar(Math.max(0, s.hp), s.maxHp, 'hp')}</div>
        <div ${help('mana')}>${bar(me.mana, MANA_MAX, 'mana')}</div>
        <div class="cc-row"><span class="cc-seals" ${help('seal')}>${sealIcon(me.seals)}<b>${me.seals}/${SEAL_MAX}</b></span></div>
      </div>
      <div class="cc-fav" ${help('favored')}><span class="good">ถนัด ${AREAS[def.favored].short} +2</span> · <span class="bad">ไม่ถนัด ${AREAS[def.unfavored].short} −2</span></div>
      ${tags ? `<div class="cc-tags">${tags}</div>` : ''}
    </div>`;
  }

  // hand + NP right under the Servant card, items at the bottom of the column
  renderHand() {
    const me = this.me, g = this.game;
    const s = me.catalystPending ? null : me.servant;
    const tiles = s ? me.hand.map((c) => cardTile(c, { attrs: 'tabindex="-1"', cost: g.cardCost(c) })) : [];
    if (s) {
      const cost = g.cardCost(s.np);
      const why = me.mana < cost ? `มานาไม่พอ (ต้องใช้ ${cost})` : '';
      tiles.push(cardTile({ ...s.np, name: `NP ${s.np.name}` }, { attrs: `tabindex="-1" ${help('np')}`, cost, off: !!why, why }));
    }
    $('#hand').innerHTML = `<div class="hud-tag" ${help('hand')}>HAND ${s ? me.hand.length : 0}/${Math.max(HAND_SIZE, g.handSize())}${s ? ` + NP <small>กองจั่ว ${me.deck.length} · ทิ้ง ${me.discard.length}</small>` : ''}</div>
      <div class="hand mini">${tiles.join('') || '<p class="muted">ไม่มีการ์ดในมือ</p>'}</div>`;
    const items = me.items.length
      ? me.items.map((k) => `<li data-tip="${esc(ITEMS[k].text)}"><b>${esc(ITEMS[k].name)}</b><small>${esc(ITEMS[k].text)}</small></li>`).join('')
      : '<li class="muted">ยังไม่มีไอเท็ม</li>';
    $('#items').innerHTML = `<div class="hud-tag" ${help('items')}>ITEMS ${me.items.length}/${ITEM_MAX}</div><ul class="items">${items}</ul>`;
  }

  renderStage() {
    const g = this.game, me = this.me;
    const choosing = this.mode === 'day';
    const night = g.half === 'night';
    const nodes = AREA_KEYS.map((a) => {
      const closed = !g.areaOpen(a);
      const grailHere = g.grail.appeared && !g.grail.holder && g.grail.area === a;
      const people = g.alive().filter((x) => x.area === a && x.servant && !x.catalystPending);
      const tokens = people.map((x) => `<span class="token ${x === me ? 'me' : ''} ${g.grail.holder === x ? 'holder' : ''}" style="--pc:${this.color(x)}" title="${esc(x.name)} · ${esc(g.servantLabel(me, x))}">
        ${portrait(x.servant.cls, 'xs', g.knowsName(me, x) && x.servant.key)}<small>${esc(x.name)}</small></span>`).join('');
      const sel = choosing && this.sel.area === a;
      const mine = !choosing && !me.out && me.area === a;
      const fight = g.stage === 'cards' || g.stage === 'result' ? (g.fights || []).some((f) => f.area === a) : false;
      const def = me.catalystPending ? null : me.servant?.def;
      const fav = def && def.favored === a ? `<i class="mk good" ${help('favored')}>ถนัด</i>` : def && def.unfavored === a ? `<i class="mk bad" ${help('favored')}>ไม่ถนัด</i>` : '';
      const cap = closed ? `<i class="mk" ${help('closed')}>ปิด</i>` : FIELDS.includes(a) ? '' : `<i class="mk" ${help('cap')}>รับ ${g.capOf(a)}</i>`;
      const flagOwner = FIELDS.includes(a) && g.flags[a] != null ? g.players[g.flags[a]] : null;
      const flag = flagOwner ? `<i class="mk flag" style="--pc:${this.color(flagOwner)}" ${flagOwner === me ? help('flag') : `data-help="rivalFlag" title="${esc(`ธงยึดครองของ ${flagOwner.name}`)}"`}>⚑ ${esc(flagOwner.name)}</i>` : '';
      let ev = '';
      if (FIELDS.includes(a) && g.events[a] && !closed) {
        ev = a === 'shinto' && !g.shintoOpen ? '<div class="evcard back">รางวัล (คว่ำ)</div>' : `<div class="evcard">รางวัล: ${esc(g.events[a].name)}</div>`;
      }
      if (a === 'temple' && !closed) ev = '<div class="evcard ley">เลย์ไลน์ มานา</div>';
      if (a === 'mansion' && !closed) ev = `<div class="evcard ley">หลอมการ์ด ใบละ ${g.forgeMana()} มานา</div>`;
      let monster = g.shadowArea === a ? `<i class="mk fight" ${help('shadow')}>👁 ${MONSTERS.shadow.name}</i>` : '';
      // the church at night is a safe zone; its monster is marked once someone chose to fight it
      if (a === 'church' && !closed) {
        monster = `<i class="mk" ${help('safe')}>เซฟโซน</i>`;
        if (people.some((x) => x.churchMonster)) monster += `<i class="mk fight" ${help('churchMonster')}>ภูตร้าย</i>`;
      }
      const [x, y] = MAP_SPOTS[a];
      return `<button class="anode ${closed ? 'closed' : ''} ${sel ? 'sel' : ''} ${mine ? 'mine' : ''}" data-area="${a}" style="grid-area:${a};--x:${x}%;--y:${y}%" ${closed || !choosing ? 'tabindex="-1"' : ''} data-tip="${esc(this.areaDesc(a))}">
        <div class="an-name">${AREAS[a].name}</div>
        <div class="an-flags">${fav}${cap}${flag}${grailHere ? `<i class="mk grail" ${help('grail')}>✦ จอก</i>` : ''}${monster}${fight ? '<i class="mk fight">⚔</i>' : ''}</div>
        ${ev}
        <div class="tokens">${tokens}</div>
      </button>`;
    }).join('');
    $('#stage').innerHTML = `<div class="ring map fuyuki ${night ? 'night' : 'day'}">
      <div class="map-bg day"></div><div class="map-bg night"></div>
      <div class="map-name">${night ? '☾' : '☀'} ฟุยุกิ</div>
      ${nodes}</div>`;
    this.fitMap();
    $('#stage').querySelectorAll('.anode').forEach((b) => b.addEventListener('click', () => {
      if (this.mode !== 'day' || b.classList.contains('closed')) return;
      if (g.grail.holder === me && !FIELDS.includes(b.dataset.area)) return;
      this.pickArea(b.dataset.area);
    }));
  }

  // size the map to the stage when the choice panel below grows, so nothing is cut off
  fitMap() {
    const st = $('#stage'), map = st.querySelector('.ring.map');
    if (!map) return;
    const choice = $('#choice');
    if (window.innerWidth <= 1100) {
      choice.style.maxHeight = '';
      map.style.width = map.style.height = '';
      map.querySelectorAll('.anode').forEach((el) => { el.style.left = el.style.top = ''; });
      return;
    }
    // the choice panel may take the height the map does not need, never the map's last MAP_MIN_H
    const app = $('#app'), cs = getComputedStyle(app);
    const room = app.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - $('#banner').offsetHeight - 2 * parseFloat(cs.rowGap);
    choice.style.maxHeight = `${Math.max(120, room - MAP_MIN_H)}px`;
    if (!st.clientWidth || !st.clientHeight) return;
    // the map keeps the picture's shape and takes the biggest size the stage allows
    const w = Math.max(0, Math.min(st.clientWidth, st.clientHeight * MAP_RATIO));
    map.style.width = `${Math.floor(w)}px`;
    map.style.height = `${Math.floor(w / MAP_RATIO)}px`;
    this.spreadBoxes(map);
  }

  // area boxes start at their landmarks; on a small map, push apart any that touch
  // and keep them inside the picture (design 13.1: nothing on the map overlaps)
  spreadBoxes(map) {
    const W = map.clientWidth, H = map.clientHeight, gap = 3;
    const boxes = [...map.querySelectorAll('.anode')].map((el) => {
      el.style.left = el.style.top = '';
      const [x, y] = MAP_SPOTS[el.dataset.area];
      return { el, w: el.offsetWidth, h: el.offsetHeight, cx: (x / 100) * W, cy: (y / 100) * H };
    });
    // the city name label stays put; boxes move away from it
    const tag = map.querySelector('.map-name');
    if (tag) boxes.push({ fixed: true, w: tag.offsetWidth, h: tag.offsetHeight, cx: tag.offsetLeft + tag.offsetWidth / 2, cy: tag.offsetTop + tag.offsetHeight / 2 });
    const clamp = (b) => {
      if (b.fixed) return;
      b.cx = Math.min(W - b.w / 2, Math.max(b.w / 2, b.cx));
      b.cy = Math.min(H - b.h / 2, Math.max(b.h / 2, b.cy));
    };
    boxes.forEach(clamp);
    for (let round = 0; round < 40; round++) {
      let moved = false;
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i], b = boxes[j];
          const ox = (a.w + b.w) / 2 + gap - Math.abs(a.cx - b.cx);
          const oy = (a.h + b.h) / 2 + gap - Math.abs(a.cy - b.cy);
          if (ox <= 0 || oy <= 0) continue;
          moved = true;
          // move along the shorter overlap, half each way
          // a fixed label never moves, so the box takes the whole push
          const ka = b.fixed ? 1 : a.fixed ? 0 : 0.5, kb = 1 - ka;
          if (ox < oy) { const d = ox * (a.cx < b.cx ? -1 : 1); a.cx += d * ka; b.cx -= d * kb; }
          else { const d = oy * (a.cy < b.cy ? -1 : 1); a.cy += d * ka; b.cy -= d * kb; }
          clamp(a); clamp(b);
        }
      }
      if (!moved) break;
    }
    for (const b of boxes) if (!b.fixed) { b.el.style.left = `${b.cx}px`; b.el.style.top = `${b.cy}px`; }
  }


  playerStatus(x) {
    const g = this.game;
    if (x.out) return 'ตกรอบ';
    if (x.resting && g.half === 'night') return `<span ${help('resting')}>พักฟื้น</span>`;
    if (['choose', 'move', 'cards'].includes(g.stage)) {
      if (g.stage === 'cards' && !(g.fights || []).some((f) => f.players.includes(x))) return x.area ? AREAS[x.area].short : '';
      if (x === this.me && this.mode) return '<span class="hl">กำลังเลือก</span>';
      return x.locked ? 'เลือกแล้ว' : 'กำลังเลือก…';
    }
    return x.area ? AREAS[x.area].short : '';
  }

  renderPlayers() {
    const g = this.game, me = this.me;
    const list = [me, ...g.players.filter((x) => x !== me)];
    const rows = list.map((x, i) => {
      const s = x.servant;
      const pending = x.catalystPending || (x !== me && x.catalystReveal);
      const label = pending ? 'รออัญเชิญ' : s ? g.servantLabel(me, x) : (x.out ? '—' : '...');
      const flags = FIELDS.filter((f) => g.flags[f] === x.id).map((f) => `⚑${AREAS[f].short}`).join(' ');
      const known = s && !pending && x !== me && g.knowsName(me, x);
      const tip = [label, known ? `ถนัด ${AREAS[s.def.favored].short} · ไม่ถนัด ${AREAS[s.def.unfavored].short}${s.revealed ? ' · เปิดชื่อแล้ว −2' : ''}` : ''].filter(Boolean).join(' · ');
      // a rival whose true name is out can be opened to see the whole Servant card (design 5.3)
      const open = s && !pending && x !== me && g.knowsName(me, x);
      return `<li class="prow ${x.out ? 'out' : ''} ${x === me ? 'me' : ''} ${open ? 'open' : ''}" style="--pc:${this.color(x)}" data-tip="${esc(`${x.name} · ${tip}${open ? ' · แตะเพื่อดูการ์ด Servant' : ''}`)}" ${open ? `data-rival="${x.id}"` : ''}>
        <div class="pr-num">${i + 1}</div>
        ${portrait(pending ? null : s?.cls, 'sm', s && g.knowsName(me, x) && s.key)}
        <div class="pr-main">
          <div class="pr-name"><b>${esc(x.name)}</b>${x === me ? '<span class="you">คุณ</span>' : ''}${g.grail.holder === x ? '<span class="grail"> ✦</span>' : ''}<span class="pr-state">${this.playerStatus(x)}</span></div>
          <div class="pr-meta"><span class="pr-sv">${esc(s && !pending ? (known || x === me ? s.def.name : s.cls) : label)}</span>${s?.def.alter && known ? ` <span ${help('alter')}>(Alter)</span>` : ''} · <span ${help(x === me ? 'seal' : 'rivalSeal')}>${seals(x.seals)}</span> · <span ${help('mana')}>◈${x.mana}</span> · <span ${help('items')}>🎒${x.items.length}</span>${flags ? ` · <span ${help(x === me ? 'flag' : 'rivalFlag')}>${flags}</span>` : ''}</div>
          ${s && !pending ? `<div ${help('hp')}>${bar(Math.max(0, s.hp), s.maxHp, 'hp thin', false)}</div>` : ''}
      </li>`;
    }).join('');
    $('#players').innerHTML = `<div class="hud-tag" ${help('alive')}>MASTERS · ${g.alive().length}/8</div><ul>${rows}</ul>`;
    $('#players').querySelectorAll('[data-rival]').forEach((li) => li.onclick = () => this.showRival(g.players[Number(li.dataset.rival)]));
  }

  // a revealed rival's Servant card: name, NP, the whole deck and the favored areas (design 5.3)
  showRival(x) {
    const s = x.servant;
    if (!s || !this.game.knowsName(this.me, x)) return;
    const deck = buildDeck(s.key);
    const attacks = deck.filter((c) => c.kind === 'atk').map((c) => `${TYPES[c.type].th} ${c.power}`).join(' · ');
    const g = $('#guide');
    g.querySelector('.sheet').innerHTML = `<h2>${esc(x.name)}: ${s.revealed ? 'Servant ที่ชื่อจริงถูกเปิด' : 'Servant ที่คุณรู้จากบันทึกวีรชน (คนอื่นยังไม่รู้)'}</h2>
      ${this.servantCard(s, false)}
      <div class="muted"><small>การ์ดโจมตี 10 ใบ: ${esc(attacks)}</small></div>
      ${s.shown.length ? `<div class="muted"><small>ลงมาแล้ว: ${esc(s.shown.join(', '))}</small></div>` : ''}
      <div class="confirm-row" style="margin-top:14px"><button class="primary" id="g-close">ปิด</button></div>`;
    g.hidden = false;
    g.querySelector('#g-close').onclick = () => { g.hidden = true; };
    g.onclick = (e) => { if (e.target === g) g.hidden = true; };
  }

  addLog(entry) {
    if (!this.game) return;
    if (entry.to && !entry.to.includes(this.me.id)) return;
    const box = $('#logdrawer .lines');
    const div = document.createElement('div');
    div.className = `l ${entry.cls}`;
    div.innerHTML = fmt(entry.text);
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
  }

  setChoice(html) {
    const el = $('#choice');
    el.innerHTML = html;
    el.classList.toggle('empty', !html);
    if (this.game) { this.renderBanner(); this.fitMap(); }
  }

  // a ticking ring; calls onEnd when time is up
  startTimer(seconds, onEnd) {
    clearInterval(this.timer);
    this.deadline = Date.now() + seconds * 1000;
    this.seconds = seconds;
    this.timer = setInterval(() => {
      const left = this.timeLeft();
      const el = $('#timer');
      if (el) { el.querySelector('b').textContent = left; el.style.setProperty('--p', left / seconds); }
      const ss = $('#stepsec');
      if (ss) ss.textContent = left;
      if (left <= 0) { clearInterval(this.timer); onEnd(); }
    }, 250);
  }
  timeLeft() { return Math.max(0, Math.ceil((this.deadline - Date.now()) / 1000)); }
  timerHtml() { const l = this.timeLeft(); return `<div id="timer" class="timer" style="--p:${l / this.seconds}"><b>${l}</b></div>`; }

  // ================= decisions =================
  decide(g, pl, kind, ctx) {
    switch (kind) {
      case 'intro': return this.showIntro();
      case 'day': return this.askDay(ctx);
      case 'move': return this.askMove(ctx.opts);
      case 'cards': return this.askCards(ctx);
      case 'nightEnd': return this.showNight(ctx.results);
      default: return null;
    }
  }

  // ---------- ① day: choose an area ----------
  askDay(ctx = {}) {
    const g = this.game, me = this.me;
    const fields = g.cap.fields;
    this.mode = 'day';
    this.catalyst = ctx.catalyst || null;
    this.sel = { area: null, backup: fields.includes(me.lastField) ? me.lastField : fields[0], church: this.defaultErrand(), forge: [], items: [], sealHeal: false, drop: [], hero: false };
    this.news = this.takeNews();
    this.renderAll();
    return new Promise((resolve) => {
      this.resolveDay = resolve;
      this.startTimer(DAY_SECONDS, () => this.confirmDay(true));
      this.renderDayChoice();
    });
  }

  pickArea(a) {
    if (this.me.catalystPending) return;
    this.sel.area = a;
    if (FIELDS.includes(a)) this.sel.backup = a;
    this.renderStage();
    this.renderDayChoice();
  }

  // the church errand picked to start with: offer when the mana is there, else the monster;
  // none with full Command Seals (hide only, design 8)
  defaultErrand() {
    const me = this.me;
    // the monster fight is always a deliberate tap, never a default
    if (me.seals >= SEAL_MAX || me.mana < this.game.offerPrice()) return null;
    return { type: 'offer' };
  }

  confirmDay(timeout = false) {
    if (!this.resolveDay) return;
    clearInterval(this.timer);
    const { area, backup, church, forge, items, sealHeal, drop } = this.sel;
    const me = this.me;
    this.mode = null;
    this.catalyst = null;
    this.setChoice('<div class="waiting">รอทุกคนเลือก แล้วเปิดเผยพร้อมกัน…</div>');
    const r = this.resolveDay; this.resolveDay = null;
    // design 4.4: no answer in time = the last battlefield (or a random one), no errand,
    // no forging, nothing used; extra items drop oldest first
    if (timeout) { r({}); return; }
    r({ area, backup, church: area === 'church' ? church : null, forge: area === 'mansion' ? forge : [], items, sealHeal, discard: drop.map((i) => me.items[i]) });
  }

  areaDesc(a) {
    return a === 'mansion' ? DAY.mansion[0].replace('ใบละ 2 มานา', `ใบละ ${this.game.forgeMana()} มานา`) : DAY[a][0];
  }

  // why an area cannot be picked this morning
  areaWhy(a) {
    const g = this.game, me = this.me;
    if (!g.areaOpen(a)) return `ปิด: Master เหลือ ${g.alive().length} คน ${a === 'shinto' ? 'เปิดสนามรบเดียว' : 'ที่นี่ไม่รับคนแล้ว'}`;
    if (g.grail.holder === me && a === 'church') return 'ผู้ถือจอกใช้โบสถ์ไม่ได้';
    if (g.grail.holder === me && !FIELDS.includes(a)) return 'ผู้ถือจอกเข้าวัดหรือคฤหาสน์ไม่ได้';
    return '';
  }

  // private lines that came after the last result panel (a resummon, an Alter, being
  // knocked out) are shown in the next panel (Appendix ก.6)
  takeNews() {
    const list = this.peekNews();
    this.newsFrom = this.game.logs.length;
    return list;
  }
  // the same lines without using them up: waiting panels can be replaced before they paint,
  // so the night summary that waits for a click shows them again
  peekNews() {
    const g = this.game, me = this.me;
    return g.logs.slice(this.newsFrom ?? g.logs.length).filter((e) => e.to && e.to.includes(me.id) && e.half === 'night');
  }
  newsHtml(list) {
    return list?.length ? `<div class="summary small">${list.map((e) => `<div class="l ${e.cls}">${fmt(e.text)}</div>`).join('')}</div>` : '';
  }

  // a Master holding a catalyst picks the new Servant first, inside the day timer (design 9)
  renderCatalystPick() {
    const g = this.game, me = this.me;
    this.setChoice(`
      <div class="hud-tag">กลางวัน · วัตถุเชื่อมโยง</div>
      ${this.newsHtml(this.news)}
      <p class="note">${esc(DAY.catalyst[0])} · ควรเลือกเมื่อ: ${esc(DAY.catalyst[1])}</p>
      <div class="grid">${this.catalyst.map((k) => {
        const d = SERVANTS[k];
        return `<button data-k="${k}" class="pick-sv"><img src="${art(d.cls, k)}" alt=""${fallback(d.cls)}><b>${esc(d.name)}</b><small>${d.cls}${d.alter ? ' · Alter' : ''}</small>
          <small class="desc">ถนัด ${AREAS[d.favored].short} · ไม่ถนัด ${AREAS[d.unfavored].short} · NP ${esc(d.np.name)}</small></button>`;
      }).join('')}</div>
      <div class="confirm-row">${this.timerHtml()}<small class="desc">เลือก Servant ก่อน แล้วจึงเลือกพื้นที่ · หมดเวลา = สุ่ม 1 ใน 3 และไปสนามรบเดิม</small></div>`);
    $('#choice').querySelectorAll('[data-k]').forEach((b) => b.onclick = () => {
      g.pickCatalyst(me, b.dataset.k);
      this.sel.church = this.defaultErrand();
      this.renderAll();
      this.renderDayChoice();
    });
  }

  renderDayChoice() {
    const g = this.game, me = this.me;
    this.redrawChoice = () => this.renderDayChoice();
    if (me.catalystPending && this.catalyst) { this.renderCatalystPick(); return; }
    const holder = g.grail.holder === me;
    const def = me.servant.def;
    const rows = AREA_KEYS.map((a) => {
      const why = this.areaWhy(a);
      const tag = def.favored === a ? '<i class="mk good">ถนัด +2</i>' : def.unfavored === a ? '<i class="mk bad">ไม่ถนัด −2</i>' : '';
      const cap = FIELDS.includes(a) ? '' : `<i class="mk">รับ ${g.capOf(a)} คน</i>`;
      const flag = g.flags[a] === me.id ? '<i class="mk warn">⚑ ธงของคุณ +3</i>' : '';
      const grail = g.grail.appeared && !g.grail.holder && g.grail.area === a ? '<i class="mk grail">✦ จอก</i>' : '';
      return optBtn({ sel: this.sel.area === a, off: !!why, attrs: `data-area="${a}"`, label: AREAS[a].name, tags: `${tag}${cap}${flag}${grail}`, desc: this.areaDesc(a), when: DAY[a][1], why });
    }).join('');
    const fields = g.cap.fields;
    const needBackup = this.sel.area && !FIELDS.includes(this.sel.area);
    const backup = needBackup && fields.length > 1 ? `<div class="sub"><small>สนามรบสำรอง: ${esc(DAY.backup[0])} ${a11yPrio(this.sel.area)}</small>
      <div class="seg">${fields.map((f) => `<button data-backup="${f}" class="${this.sel.backup === f ? 'on' : ''}" title="ควรเลือกเมื่อ: ${esc(DAY.backup[1])}">${AREAS[f].name}</button>`).join('')}</div></div>` : '';
    // day items and "รักษา!" are chosen now and happen at the reveal, with everyone else's
    const using = (k) => this.sel.items.some((x) => x.key === k);
    const manaThen = Math.min(MANA_MAX, me.mana + (using('mana_vial') ? 5 : 0));
    let church = '';
    if (this.sel.area === 'church') {
      const price = g.offerPrice();
      const full = me.seals >= SEAL_MAX ? `Command Seal เต็มแล้ว (${SEAL_MAX} ดวง) ไปหลบได้แต่ทำธุระไม่ได้` : '';
      const offerWhy = full || (manaThen < price ? `มานาไม่พอ (ต้องใช้ ${price})` : '');
      if (this.sel.church?.type === 'offer' && offerWhy) this.sel.church = null;
      if (full) this.sel.church = null;
      const ch = this.sel.church;
      church = `<div class="sub"><small>ธุระโบสถ์: เลือกได้ 1 อย่าง (แตะอีกครั้งเพื่อไปหลบเฉยๆ)</small><div class="tools col">
        ${optBtn({ cls: 'small', sel: ch?.type === 'offer', off: !!offerWhy, attrs: 'data-errand="offer"', label: `ถวายมานา ${price} → Command Seal +1`, desc: DAY.offer[0], when: DAY.offer[1], why: offerWhy })}
        ${optBtn({ cls: 'small', sel: ch?.type === 'monster', off: !!full, attrs: 'data-errand="monster"', label: 'ปราบมอนสเตอร์ → Command Seal +1', desc: DAY.monster[0], when: DAY.monster[1], why: full })}
        </div></div>`;
    }
    let forge = '';
    if (this.sel.area === 'mansion') {
      forge = `<div class="sub"><small>หลอมการ์ด: ${esc(DAY.forge[0])} (ใบละ +${g.forgeMana()} มานา แล้วจั่วใหม่) · ควร${esc(DAY.forge[1])}</small>
        <div class="hand">${me.hand.map((c) => {
          const on = this.sel.forge.includes(c.id);
          const max = !on && this.sel.forge.length >= 2;
          return cardTile(c, { sel: on, off: max, attrs: `data-forge="${c.id}"`, cost: g.cardCost(c), why: max ? 'เลือกครบ 2 ใบแล้ว' : '' });
        }).join('')}</div></div>`;
    }
    const dayItems = [...new Set(me.items)].filter((k) => ITEMS[k].phase.includes('day'));
    const unknown = g.alive().filter((x) => x !== me && x.servant && !x.catalystPending && !g.knowsName(me, x));
    const itemWhy = (k) => using(k) ? '' : k === 'hero_record' && !unknown.length ? 'รู้จัก Servant ทุกคนแล้ว'
      : g.dayItemUsable(me, k) ? '' : k === 'potion' ? 'HP เต็มแล้ว' : k === 'mana_vial' ? 'มานาเต็มแล้ว' : '';
    const itemBtns = dayItems.map((k) => optBtn({ cls: 'small', sel: using(k) || (k === 'hero_record' && this.sel.hero), attrs: `data-item="${k}"`, off: !!itemWhy(k),
      label: `ใช้ ${esc(ITEMS[k].name)}`, desc: DAY[k]?.[0] || ITEMS[k].text, when: DAY[k]?.[1], why: itemWhy(k) })).join('');
    const healWhy = this.sel.sealHeal ? '' : me.seals <= 0 ? 'ไม่มี Command Seal' : me.servant.hp >= me.servant.maxHp ? 'HP เต็มแล้ว' : '';
    const sealBtn = optBtn({ cls: 'small seal', sel: this.sel.sealHeal, attrs: 'data-seal="heal"', off: !!healWhy, label: '◆ รักษา! (Command Seal)', desc: DAY.sealHeal[0], when: DAY.sealHeal[1], why: healWhy });
    const heroAt = this.sel.items.find((x) => x.key === 'hero_record')?.target;
    const heroPick = this.sel.hero ? `<p class="note">บันทึกวีรชน: เลือกเป้าหมาย</p><div class="tools">${unknown.map((x) =>
      `<button class="small ${heroAt === x.id ? 'on' : ''}" data-hero="${x.id}">${esc(x.name)} (${x.catalystReveal ? 'รออัญเชิญ' : x.servant.cls})</button>`).join('')}</div>` : '';
    const planned = [...this.sel.items.map((x) => ITEMS[x.key].name + (x.key === 'hero_record' ? ` (${g.players[x.target].name})` : '')), ...(this.sel.sealHeal ? ['รักษา!'] : [])];
    // over the item limit: pick what to drop (design 2); the items being used do not count
    const usedIdx = new Set();
    for (const it of this.sel.items) usedIdx.add(me.items.findIndex((k, i) => k === it.key && !usedIdx.has(i)));
    const need = me.items.length - usedIdx.size - ITEM_MAX;
    this.sel.drop = this.sel.drop.filter((i) => !usedIdx.has(i)).slice(0, Math.max(0, need));
    const drop = need > 0 ? `<div class="sub"><small>ทิ้งไอเท็ม: ${esc(DAY.discard[0])} (ต้องทิ้งอีก ${need - this.sel.drop.length} ใบ)</small><div class="tools">${me.items.map((k, i) => {
      if (usedIdx.has(i)) return '';
      const on = this.sel.drop.includes(i);
      const why = !on && this.sel.drop.length >= need ? 'ทิ้งครบแล้ว' : '';
      return optBtn({ cls: 'small', sel: on, off: !!why, attrs: `data-drop="${i}"`, label: `ทิ้ง ${esc(ITEMS[k].name)}`, desc: ITEMS[k].text, why });
    }).join('')}</div></div>` : '';
    const goWhy = this.sel.area === 'mansion' && !this.sel.forge.length ? 'เลือกการ์ด 1–2 ใบที่จะหลอม' : '';
    const foot = !this.sel.area ? 'ยังไม่ได้เลือก: แตะพื้นที่ก่อน ถ้าหมดเวลาระบบส่งไปสนามรบเดิม'
      : goWhy || 'ยืนยันแล้วเปลี่ยนไม่ได้ · ถ้าไม่กดยืนยันก่อนหมดเวลา ระบบส่งไปสนามรบเดิมและไม่ใช้อะไรที่เลือกไว้';
    this.setChoice(`
      <div class="hud-tag">กลางวัน · เลือกที่จะไป</div>
      ${this.hint('choose')}
      ${this.newsHtml(this.news)}
      <p class="note">ทุกคนเลือกพร้อมกันแบบลับ แล้วเปิดเผยพร้อมกัน · กลางวันไม่มีการต่อสู้ · อยู่สนามรบตั้งแต่กลางวัน = ตั้งหลัก +1 คืนนี้${holder ? ' · <b class="grail">คุณถือจอก: ไปได้แค่สนามรบ</b>' : ''}</p>
      <div class="arows two">${rows}</div>
      ${backup}${church}${forge}
      <div class="tools col optcol two">${sealBtn}${itemBtns}</div>
      ${heroPick}
      ${planned.length ? `<p class="note">ใช้ตอนเปิดผลกลางวัน: ${esc(planned.join(', '))}</p>` : ''}
      ${drop}
      <div class="confirm-row">
        ${this.timerHtml()}
        <button class="primary" id="go" ${this.sel.area && !goWhy ? '' : 'disabled'}>ยืนยัน${this.sel.area ? ` · ${AREAS[this.sel.area].short}` : ''}</button>
      </div>
      <small class="desc" style="text-align:right">${esc(foot)}</small>`);
    const el = $('#choice');
    this.wireHints();
    el.querySelectorAll('[data-area]').forEach((b) => b.onclick = () => this.pickArea(b.dataset.area));
    el.querySelectorAll('[data-backup]').forEach((b) => b.onclick = () => { this.sel.backup = b.dataset.backup; this.renderDayChoice(); });
    el.querySelectorAll('[data-errand]').forEach((b) => b.onclick = () => {
      const t = b.dataset.errand;
      this.sel.church = this.sel.church?.type === t ? null : { type: t };
      this.renderDayChoice();
    });
    el.querySelectorAll('[data-forge]').forEach((b) => b.onclick = () => {
      const id = Number(b.dataset.forge);
      this.sel.forge = this.sel.forge.includes(id) ? this.sel.forge.filter((x) => x !== id) : [...this.sel.forge, id];
      this.renderDayChoice();
    });
    el.querySelectorAll('[data-seal]').forEach((b) => b.onclick = () => { this.sel.sealHeal = !this.sel.sealHeal; this.renderDayChoice(); });
    el.querySelectorAll('[data-item]').forEach((b) => b.onclick = () => {
      const k = b.dataset.item;
      if (k === 'hero_record') {
        this.sel.hero = !this.sel.hero && !using(k);
        this.sel.items = this.sel.items.filter((x) => x.key !== k);
      } else this.sel.items = using(k) ? this.sel.items.filter((x) => x.key !== k) : [...this.sel.items, { key: k }];
      this.renderDayChoice();
    });
    el.querySelectorAll('[data-hero]').forEach((h) => h.onclick = () => {
      this.sel.items = [...this.sel.items.filter((x) => x.key !== 'hero_record'), { key: 'hero_record', target: Number(h.dataset.hero) }];
      this.sel.hero = false;
      this.renderDayChoice();
    });
    el.querySelectorAll('[data-drop]').forEach((b) => b.onclick = () => {
      const i = Number(b.dataset.drop);
      this.sel.drop = this.sel.drop.includes(i) ? this.sel.drop.filter((x) => x !== i) : [...this.sel.drop, i];
      this.renderDayChoice();
    });
    $('#go').onclick = () => this.confirmDay();
  }

  // ---------- ② night: move ----------
  dayLines() {
    const g = this.game, me = this.me;
    if (g.nightNo !== 1) return [];
    return g.logs.filter((e) => e.day === g.day && e.half === 'day' && e.to && e.to.includes(me.id));
  }

  askMove(opts) {
    const g = this.game, me = this.me;
    this.mode = 'move';
    this.sel = { type: 'stay', to: null, scroll: false, view: opts.view[0] ?? null };
    this.renderAll();
    return new Promise((resolve) => {
      const done = () => {
        clearInterval(this.timer);
        this.mode = null;
        this.setChoice('<div class="waiting">รอทุกคนย้าย…</div>');
        const { type, to, scroll, view } = this.sel;
        resolve({ type, to, scroll, view });
      };
      // design: no choice in time = stay
      this.startTimer(MOVE_SECONDS, () => { this.sel.type = 'stay'; done(); });
      const draw = () => {
        this.redrawChoice = draw;
        const here = g.alive().filter((x) => x !== me && x.area === me.area);
        const tied = g.tiedDown(me);
        const hasScroll = me.items.includes('scroll');
        const useScroll = hasScroll && (this.sel.scroll || me.seals <= 0);
        // why paid moves are off (Appendix ก.4)
        const moveWhy = g.daily.fog ? 'หมอกหนา: วันนี้ห้ามย้ายแบบจ่ายมานา'
          : tied ? 'ย้ายไม่ได้: มีคนอื่นอยู่ด้วย (ติดพัน) ใช้ หนี! แทน'
          : me.mana < g.moveCost() ? `มานาไม่พอ (ต้องใช้ ${g.moveCost()})` : '';
        const fieldsTo = g.cap.fields.filter((f) => f !== me.area);
        const holder = g.grail.holder === me;
        const inChurch = me.area === 'church';
        const stayDesc = inChurch ? MOVE.churchStay[0] : FIELDS.includes(me.area) ? (g.flags[me.area] === me.id ? 'ไม่เสียอะไร ถือธงอยู่ได้พลัง +3' : MOVE.stay[0]) : 'ไม่เสียอะไร';
        const leave = MOVE.churchLeave[0].replace('(2 มานา)', g.moveCost() ? `(${g.moveCost()} มานา)` : '(ลมสงบ: ฟรี)');
        const moveDesc = inChurch ? leave : g.moveCost() ? MOVE.move[0] : 'ลมสงบ: ย้ายฟรี ไปถึงได้โบนัส 0 ทำได้เฉพาะตอนไม่มีใครอยู่ด้วย';
        const rows = [
          optBtn({ sel: this.sel.type === 'stay', attrs: 'data-type="stay" data-to=""', label: inChurch ? 'อยู่ในโบสถ์' : `อยู่ที่${AREAS[me.area].name}`, desc: stayDesc, when: inChurch ? MOVE.churchStay[1] : MOVE.stay[1] }),
          ...fieldsTo.map((f) => optBtn({ sel: this.sel.type === 'move' && this.sel.to === f, off: !opts.move.includes(f), attrs: `data-type="move" data-to="${f}"`,
            label: `ย้ายไป${AREAS[f].name}`, desc: moveDesc, when: inChurch ? MOVE.churchLeave[1] : MOVE.move[1], why: moveWhy })),
        ];
        // every escape target is listed, greyed with its reason when it is not allowed (ก.4)
        const escTo = [...fieldsTo, 'temple', 'mansion', 'church'].filter((a) => a !== me.area);
        for (const a of escTo) {
          const ok = opts.escape.includes(a);
          const why = ok ? '' : a === 'church' ? MOVE.churchClosed
            : holder && !FIELDS.includes(a) ? 'ผู้ถือจอกเข้าวัด โบสถ์ หรือคฤหาสน์ไม่ได้'
            : !g.areaOpen(a) ? this.areaWhy(a) || 'ปิด'
            : me.seals <= 0 && !hasScroll ? 'ไม่มี Command Seal' : 'ไปไม่ได้';
          rows.push(optBtn({ sel: this.sel.type === 'escape' && this.sel.to === a, off: !ok, attrs: ok ? `data-type="escape" data-to="${a}"` : '',
            label: `"หนี!" ไป${AREAS[a].name}`, tags: ok ? (useScroll ? '<i class="mk">ม้วนคาถา</i>' : '<i class="mk">−1 Command Seal</i>') : '',
            when: ok ? (inChurch ? MOVE.churchLeave[1] : useScroll ? MOVE.scroll[1] : MOVE.escape[1]) : '', why }));
        }
        // one shared line instead of repeating it on every escape button
        if (opts.escape.length) rows.push(`<small class="desc esc-note">"หนี!": ${esc(inChurch ? leave : useScroll ? MOVE.scroll[0] : MOVE.escape[0])}</small>`);
        const view = opts.view.length ? `<div class="sub"><small>ดูมือ (โบสถ์): ${esc(MOVE.view[0])}</small><div class="tools">${opts.view.map((id) =>
          `<button class="small ${this.sel.view === id ? 'on' : ''}" data-view="${id}" title="ควรเลือกเมื่อ: ${esc(MOVE.view[1])}">${esc(g.players[id].name)}</button>`).join('')}</div></div>` : '';
        const daySum = this.dayLines().map((e) => `<div class="l ${e.cls}">${fmt(e.text)}</div>`).join('');
        // what being alone here means depends on the area (design 3)
        const alone = inChurch ? (me.churchMonster ? `โบสถ์เป็นเซฟโซน ไม่มีใครเข้ามาได้ · คืนนี้คุณจะสู้กับภูตร้ายใต้โบสถ์ (พลัง ${CHURCH_MONSTER_BASE} + ลูกเต๋า) ถ้าออกจากโบสถ์ถือว่ายกเลิก` : 'โบสถ์เป็นเซฟโซน ไม่มีใครเข้ามาได้')
          : me.area === 'temple' ? 'ตอนนี้คุณอยู่คนเดียว ไม่มีใครมาก็ไม่ต้องสู้ แต่กลางคืนไม่ได้มานา'
          : me.area === 'mansion' ? 'กลางคืนปลอดภัย ไม่มีรางวัล'
          : g.shadowArea === me.area ? 'อยู่คนเดียวก็ต้องสู้กับมอนสเตอร์เงาดำ'
          : 'ตอนนี้คุณอยู่คนเดียว ถ้าไม่มีใครมา คุณได้รางวัลโดยไม่ต้องสู้';
        this.setChoice(`
          <div class="hud-tag">กลางคืน ${g.nightNo} · ย้ายพื้นที่</div>
          ${this.hint('move')}
          ${daySum ? `<div class="summary small">${daySum}</div>` : ''}
          <p class="note">${here.length ? `อยู่ด้วยกัน: ${here.map((x) => `${esc(x.name)} [${esc(g.servantLabel(me, x))}]`).join(', ')} · ถ้าอยู่ที่เดิมต้องสู้` : esc(alone)}${tied ? ` · <span ${help('tied')}>ติดพัน</span>` : ''}</p>
          <div class="arows two">${rows.join('')}</div>
          ${hasScroll && me.seals > 0 && opts.escape.length ? `<label class="tog ${this.sel.scroll ? 'on' : ''}" data-tip="${esc(MOVE.scroll[0])}"><input type="checkbox" id="scroll" ${this.sel.scroll ? 'checked' : ''}> ใช้ม้วนคาถาแทน Command Seal <span class="desc">${esc(MOVE.scroll[0])}</span></label>` : ''}
          ${view}
          <div class="confirm-row">${this.timerHtml()}<button class="primary" id="go">ยืนยัน</button></div>
          <small class="desc" style="text-align:right">หมดเวลา = อยู่ที่เดิม</small>`);
        const el = $('#choice');
        this.wireHints();
        el.querySelectorAll('[data-type]').forEach((b) => b.onclick = () => { this.sel.type = b.dataset.type; this.sel.to = b.dataset.to || null; draw(); });
        el.querySelectorAll('[data-view]').forEach((b) => b.onclick = () => { this.sel.view = Number(b.dataset.view); draw(); });
        const sc = el.querySelector('#scroll');
        if (sc) sc.onchange = (e) => { this.sel.scroll = e.target.checked; draw(); };
        $('#go').onclick = done;
      };
      if (me.seals <= 0 && me.items.includes('scroll')) this.sel.scroll = true;
      draw();
    });
  }

  // a resting Master is not asked to move (ก.4)
  moveWaiting() {
    const me = this.me;
    if (me.out || (!me.resting && !me.catalystPending)) return;
    const why = me.catalystPending ? 'รออัญเชิญด้วยวัตถุเชื่อมโยง เลือก Servant ตนใหม่ได้ตอนกลางวัน' : 'Servant พักฟื้น คืนนี้เลือกไม่ได้';
    this.setChoice(`<div class="hud-tag">กลางคืน ${this.game.nightNo} · ย้ายพื้นที่</div>${this.newsHtml(this.peekNews())}<div class="waiting">${why} · รอคนอื่นย้าย…</div>`);
  }

  // ---------- ③ night: play cards ----------
  cardsWaiting() {
    const g = this.game, me = this.me;
    if (me.out || (g.fights || []).some((f) => f.players.includes(me))) return;
    const peek = me.peek ? `<p class="note">โบสถ์: มือของ <b>${esc(me.peek.name)}</b> คือ ${esc(me.peek.cards.join(', ') || '(ว่าง)')}</p>` : '';
    const where = me.catalystPending ? 'รออัญเชิญด้วยวัตถุเชื่อมโยง เลือก Servant ตนใหม่ได้ตอนกลางวัน'
      : !me.area ? 'Servant พักฟื้น คืนนี้เลือกไม่ได้ กลับมาเลือกพื้นที่ได้ตอนเช้า'
      : me.area === 'church' ? 'คุณปลอดภัยอยู่ในโบสถ์ (เซฟโซน)'
      : SAFE_AREAS.includes(me.area) ? `คุณปลอดภัยอยู่ใน${AREAS[me.area].name}` : `เฟสนี้ไม่มีใครมาสู้กับคุณที่${AREAS[me.area].name}`;
    this.setChoice(`<div class="hud-tag">กลางคืน · ลงการ์ด</div>${this.newsHtml(this.peekNews())}${peek}<div class="waiting">${where} · รอการต่อสู้ที่อื่น…</div>`);
  }

  askCards(ctx) {
    const g = this.game, me = this.me;
    const { fight, cards } = ctx;
    this.mode = 'cards';
    this.fight = fight;
    this.sel = { cards: [], boost: false, sealHeal: false, items: [] };
    this.renderAll();
    return new Promise((resolve) => {
      const done = (play) => {
        clearInterval(this.timer);
        this.mode = null;
        this.fight = null;
        this.setChoice('<div class="waiting">รอทุกคนลงการ์ด แล้วเปิดพร้อมกัน…</div>');
        resolve(play);
      };
      // design: no cards in time = the bot plays for you
      this.startTimer(CARD_SECONDS, () => done(chooseCards(g, me, ctx)));
      const draw = () => {
        this.redrawChoice = draw;
        const chosen = this.sel.cards.map((id) => cards.find((c) => c.id === id));
        const spent = chosen.reduce((a, c) => a + g.cardCost(c), 0);
        const full = this.sel.cards.length >= 2;
        const foes = fight.players.filter((x) => x !== me).map((x) => `<span class="foe">${portrait(x.servant.cls, 'xs', g.knowsName(me, x) && x.servant.key)} <b>${esc(x.name)}</b> ${esc(g.servantLabel(me, x))} · HP ${Math.max(0, x.servant.hp)}/${x.servant.maxHp}</span>`);
        if (fight.monster) foes.push(`<span class="foe">👁 <b>${MONSTERS[fight.monster].name}</b> ${MONSTERS[fight.monster].base}+1d6</span>`);
        const cardWhy = (c) => {
          if (this.sel.cards.includes(c.id)) return '';
          if (full) return 'เลือกครบ 2 ใบแล้ว';
          if (spent + g.cardCost(c) > me.mana) return `มานาไม่พอ (ต้องใช้ ${g.cardCost(c)} · เหลือ ${me.mana - spent})`;
          return '';
        };
        const hand = cards.filter((c) => c.kind !== 'np').map((c) => {
          const why = cardWhy(c);
          return cardTile(c, { sel: this.sel.cards.includes(c.id), off: !!why, why, attrs: `data-card="${c.id}" data-tip="${esc(CARDS[c.kind][0])}"`, cost: g.cardCost(c) });
        }).join('');
        const np = cards.find((c) => c.kind === 'np');
        const npOn = np && this.sel.cards.includes(np.id);
        const npWhy = np ? cardWhy(np) : '';
        const npRow = np ? `<div class="np-row">${optBtn({ cls: 'small', sel: npOn, off: !!npWhy, attrs: `data-card="${np.id}"`,
          label: `✦ ใช้ NP · ${esc(np.name)}`, tags: ` <i class="mk">พลัง ${np.power} · ${g.cardCost(np)} มานา</i>`,
          desc: `${CARDS.np[0]}${me.servant.revealed ? ' (ชื่อจริงเปิดอยู่แล้ว)' : ''} · ${np.text}`, when: CARDS.np[1], why: npWhy })}</div>` : '';
        const fightItems = [...new Set(me.items)].filter((k) => ITEMS[k].phase.includes('fight'));
        const sealsLeft = me.seals - (this.sel.boost ? 1 : 0) - (this.sel.sealHeal ? 1 : 0);
        const tog = (id, on, label, [desc, when], why) => `<label class="tog ${on ? 'on' : ''} ${why ? 'off' : ''}" data-tip="${esc(`${desc} · ควรเลือกเมื่อ: ${when}`)}">
          <input type="checkbox" id="${id}" ${on ? 'checked' : ''} ${why ? 'disabled' : ''}> <b>${label}</b><span class="desc">${esc(desc)}</span>${why ? `<span class="why">${esc(why)}</span>` : ''}</label>`;
        const boostWhy = !this.sel.boost && (me.seals <= 0 ? 'ไม่มี Command Seal' : sealsLeft < 1 ? 'Command Seal ไม่พอ' : '');
        const healWhy = !this.sel.sealHeal && (me.seals <= 0 ? 'ไม่มี Command Seal' : me.servant.hp >= me.servant.maxHp ? 'HP เต็มแล้ว' : sealsLeft < 1 ? 'Command Seal ไม่พอ' : '');
        const parts = [...g.cardParts(chosen), ...g.fixedParts(me, fight.area)];
        if (this.sel.boost) parts.push({ label: 'เพิ่มพลัง!', v: 4 });
        if (this.sel.items.includes('gem')) parts.push({ label: 'อัญมณีของโทซากะ', v: 4 });
        const sum = parts.reduce((a, p) => a + p.v, 0);
        const dice = 1 + g.extraDice(me, chosen, this.sel.items);
        const lines = parts.filter((p) => p.v).map((p) => `<div class="${p.v < 0 ? 'neg' : ''}"><span>${esc(p.label)}</span><b>${p.v > 0 ? '+' : ''}${p.v}</b></div>`).join('');
        const diceLine = `<div><span>ลูกเต๋า${dice > 1 ? ` (ทอย ${dice} ลูก ใช้ลูกสูงสุด)` : ''}</span><b>+ 1–6</b></div>`;
        this.setChoice(`
          <div class="hud-tag">กลางคืน ${g.nightNo} · ${fight.church ? 'ปราบมอนสเตอร์ในโบสถ์' : `ลงการ์ด · ${AREAS[fight.area].name}`}</div>
          ${this.hint('cards')}
          <div class="foes">${foes.join('')}</div>
          ${fight.church ? `<p class="note">${esc(CARDS.church)} · ไม่มีโบนัสพื้นที่ · ชนะได้ Command Seal 1 ดวง เสมอไม่ได้อะไร</p>` : ''}
          ${me.peek ? `<p class="note">โบสถ์: มือของ ${esc(me.peek.name)} คือ ${esc(me.peek.cards.join(', '))}</p>` : ''}
          <div class="play-grid"><div>
          <div class="hand">${hand || '<p class="muted">ไม่มีการ์ดในมือ</p>'}</div>
          ${npRow}
          <div class="optcol two">
            ${tog('boost', this.sel.boost, '◆ เพิ่มพลัง! (Command Seal)', CARDS.boost, boostWhy)}
            ${tog('sh', this.sel.sealHeal, '◆ รักษา! (Command Seal)', CARDS.sealHeal, healWhy)}
            ${fightItems.map((k) => optBtn({ cls: 'small', sel: this.sel.items.includes(k), attrs: `data-item="${k}"`, label: esc(ITEMS[k].name), desc: CARDS[k]?.[0] || ITEMS[k].text, when: CARDS[k]?.[1] })).join('')}
          </div>
          </div>
          <div class="breakdown"><div class="muted"><span>ที่มาของพลังรวม</span></div>${lines || '<div class="muted"><span>ยังไม่ได้เลือกการ์ด</span></div>'}${diceLine}
            <div class="tot"><span>พลังรวมของคุณ</span><b>${sum} + ลูกเต๋า (1–6)</b></div></div></div>
          <div class="confirm-row">${this.timerHtml()}
            ${optBtn({ cls: 'small', attrs: 'id="facedown"', label: 'ลงคว่ำ', desc: CARDS.facedown[0], when: CARDS.facedown[1] })}
            <button class="primary" id="go">ลงการ์ด ${this.sel.cards.length}/2</button></div>
          <small class="desc" style="text-align:right">พลังรวมของคุณ ${sum} + ลูกเต๋า (1–6) · จ่าย ${spent} มานา · หมดเวลาระบบลงให้</small>`);
        const el = $('#choice');
        this.wireHints();
        el.querySelectorAll('[data-card]').forEach((b) => b.onclick = () => {
          const id = Number(b.dataset.card);
          this.sel.cards = this.sel.cards.includes(id) ? this.sel.cards.filter((x) => x !== id) : [...this.sel.cards, id];
          draw();
        });
        el.querySelectorAll('[data-item]').forEach((b) => b.onclick = () => {
          const k = b.dataset.item;
          this.sel.items = this.sel.items.includes(k) ? this.sel.items.filter((x) => x !== k) : [...this.sel.items, k];
          draw();
        });
        const bo = el.querySelector('#boost');
        if (bo) bo.onchange = (e) => { this.sel.boost = e.target.checked; draw(); };
        const sh = el.querySelector('#sh');
        if (sh) sh.onchange = (e) => { this.sel.sealHeal = e.target.checked; draw(); };
        $('#facedown').onclick = () => done({ ...this.sel, cards: [] });
        $('#go').onclick = () => done({ ...this.sel });
      };
      draw();
    });
  }

  // ---------- ④ night results ----------
  // one plain sentence saying how my fight went and why (Appendix ก.6)
  resultSentence(res) {
    const me = this.me;
    const e = res.entries.find((x) => x.id === me.id);
    if (!e) return null;
    const lost = e.dmg - (e.selfHit || 0);
    const self = e.selfHit ? ` · ${e.selfWhy} เสีย HP ${e.selfHit} (เหลือ ${e.hpAfter}${e.selfClamped ? ' · โบสถ์เป็นเซฟโซน Servant ไม่ตาย' : ''})` : '';
    let text, cls;
    if (res.church) {
      const m = res.monster.total;
      if (e.result === 'win') {
        text = `คุณชนะภูตร้ายใต้โบสถ์ ${e.total} ต่อ ${m}${e.sealWon ? ` ได้ Command Seal 1 ดวง (มี ${e.sealsAfter} ดวง)` : ''}`;
        cls = 'win';
      } else if (e.result === 'tie') {
        text = `เสมอกับภูตร้ายใต้โบสถ์ ${m} ต่อ ${m} ไม่ได้ Command Seal ไม่เสีย HP`;
        cls = '';
      } else {
        text = `ภูตร้ายใต้โบสถ์ชนะ ${m} ต่อ ${e.total} ${lost > 0 ? `เสีย HP ${lost}` : 'แต่ไม่เสีย HP'} (เหลือ ${e.hpMid}${e.clamped ? ' · โบสถ์เป็นเซฟโซน Servant ไม่ตาย' : ''})`;
        cls = 'lose';
      }
      return { text: text + self, cls };
    }
    const others = [...res.entries.filter((x) => x !== e).map((x) => x.total), ...(res.monster ? [res.monster.total] : [])];
    const best = Math.max(...others);
    const size = res.entries.length + (res.monster ? 1 : 0);
    const meleeOf = size >= 3 ? `ตะลุมบอน ${size} คน${res.monster ? ' (นับมอนสเตอร์เงาดำ 1 ตน)' : ''}` : '';
    const melee = !meleeOf ? '' : res.monsterWon ? ` · ${meleeOf} คนอื่นทุกคนเสีย HP ตามส่วนต่างกับมอนสเตอร์เงาดำ`
      : res.winners.length > 1 ? ` · ${meleeOf} คนที่เสมอสูงสุดแบ่งโบนัส +2 มานา คนอื่นเสีย HP ตามส่วนต่างกับค่าสูงสุด`
      : ` · ${meleeOf} ผู้ชนะได้ +2 มานาเพิ่ม คนอื่นทุกคนเสีย HP ตามส่วนต่างกับผู้ชนะ`;
    // design 6.1: say whether the flag was won, kept or lost in this fight
    const fl = res.flag, fname = AREAS[res.area].name;
    const flagWon = fl && fl.after === me.id && fl.before !== me.id ? ` และธง${fname}` : '';
    const flagKept = fl && fl.after === me.id && fl.before === me.id ? ` · ยังถือธง${fname}` : '';
    const flagLost = fl && fl.before === me.id && fl.after !== me.id ? ` · เสียธง${fname}` : '';
    if (e.result === 'win') {
      text = `คุณชนะ ${e.total} ต่อ ${best}${e.got ? ` ได้ ${e.got}` : ''}${flagWon}${flagKept}`;
      for (const l of e.loot || []) text += ` · คุณกำจัด Servant ของ ${l.name}${l.mana ? ` ยึดมานา ${l.mana}` : ''}${l.item ? `${l.mana ? ' และ' : ' ยึด'}${ITEMS[l.item].name}` : ''}`;
      cls = 'win';
    } else if (e.result === 'tie') {
      // a top tie in a melee: the tied Masters lose nothing, everyone below loses HP (6.2, 6.3)
      const hurt = res.entries.some((x) => x.result === 'lose' && x.dmg > 0);
      text = res.monsterWon ? `เสมอกับมอนสเตอร์เงาดำ ${e.total} ต่อ ${e.total} ไม่มีใครได้รางวัลและธง${flagLost}`
        : hurt ? `เสมอสูงสุด ${e.total} ต่อ ${e.total} แบ่งรางวัลกัน${e.got ? ` (ได้ ${e.got})` : ''} คุณไม่เสีย HP${flagKept}${flagLost} · ${meleeOf} คนที่เสมอแบ่งโบนัส +2 มานา คนอื่นเสีย HP ตามส่วนต่างกับค่าสูงสุด`
        : `เสมอ ${e.total} ต่อ ${e.total} แบ่งรางวัลกัน${e.got ? ` (ได้ ${e.got})` : ''} ไม่มีใครเสีย HP${flagKept}${flagLost}`;
      cls = '';
    } else {
      text = `คุณแพ้ ${e.total} ต่อ ${res.max} ${lost > 0 ? `เสีย HP ${lost}` : 'แต่ไม่เสีย HP'} (เหลือ ${e.hpMid})${res.monsterWon ? ' · มอนสเตอร์เงาดำชนะ ไม่มีใครได้รางวัลและธง' : ''}${flagLost}${melee}`;
      cls = 'lose';
    }
    text += self;
    if (e.died) text += ' · Servant ของคุณถูกกำจัด';
    return { text, cls };
  }

  async showNight(results) {
    const g = this.game, me = this.me;
    if (me.out && this.fast) return null;
    const mine = results.find((r) => r.entries.some((e) => e.id === me.id));
    const order = mine ? [mine, ...results.filter((r) => r !== mine)] : results;
    if (order.length) await this.playFights(order);
    this.holdFx = false;
    // private lines from after the last summary (a resummon, an Alter, a lost flag) come first
    const earlier = this.peekNews().filter((e) => e.night !== g.nightNo || e.day !== g.day);
    const lines = [...earlier, ...g.logs.filter((e) => e.day === g.day && e.half === 'night' && e.night === g.nightNo && e.cls !== 'phase'
      && (e.to ? e.to.includes(me.id) : /☠|✦|✸|✖|⚔|⛪|ภูตร้าย|เสีย HP|ได้รางวัล|ยึด|คนเดียว|หนี|ย้าย|ม้วน/.test(e.text)))];
    // anything logged after this panel (a resummon) shows in the next one
    this.newsFrom = g.logs.length;
    this.renderAll();
    const verdicts = results.map((r) => this.resultSentence(r)).filter(Boolean)
      .map((v) => `<div class="verdict-line ${v.cls}">${esc(v.text)}</div>`).join('');
    const solo = !me.out && !mine && FIELDS.includes(me.area) && g.alive().filter((x) => x.area === me.area).length === 1 && g.shadowArea !== me.area
      ? '<div class="verdict-line win">ไม่มีใครมา คุณได้รางวัลและธงโดยไม่ต้องสู้</div>' : '';
    const box = (l) => `${verdicts}${solo}<div class="summary">${l.map((e) => `<div class="l ${e.cls}">${fmt(e.text)}</div>`).join('') || '<div class="muted">คืนนี้เงียบสงบ</div>'}</div>`;
    return new Promise((resolve) => {
      if (me.out) {
        this.setChoice(`<div class="hud-tag">ตกรอบ</div><p class="note">ดูการต่อสู้ของ Master ที่เหลือต่อได้</p>${box(lines)}
          <div class="confirm-row"><button id="nx">ดูวันถัดไป</button><button class="primary" id="ff">ข้ามไปดูผลตอนจบ</button></div>`);
        $('#ff').onclick = () => { this.fast = true; this.setChoice('<div class="waiting">กำลังจำลองจนจบ…</div>'); resolve(null); };
        $('#nx').onclick = () => { this.setChoice(''); resolve(null); };
        return;
      }
      const last = g.checkOver();
      const next = g.nightNo === 1 ? (g.alive().length <= 1 ? 'ดูผลตอนจบ ›' : 'กลางคืน 2 ›') : last ? 'ดูผลตอนจบ ›' : `วันที่ ${g.day + 1} ›`;
      this.setChoice(`<div class="hud-tag">สรุปคืนวันที่ ${g.day} · กลางคืน ${g.nightNo}</div>${this.hint(g.nightNo === 1 ? 'result1' : 'result2')}${box(lines)}
        <button class="primary wide" id="nx">${next}</button>`);
      this.wireHints();
      $('#nx').onclick = () => { this.setChoice(''); resolve(null); };
    });
  }

  // ================= battle scene =================
  async playFights(order) {
    const el = $('#battle');
    await this.fxIdle();
    el.hidden = false;
    this.bfast = false;
    for (let i = 0; i < order.length; i++) {
      await this.playFight(order[i], i, order.length);
      const lastOne = i === order.length - 1;
      const skip = await new Promise((resolve) => {
        const ctl = $('#battle .bt-controls');
        ctl.innerHTML = `<div class="confirm-row">${!lastOne ? '<button id="skip">ข้ามที่เหลือ</button>' : ''}
          <button class="primary" id="next">${lastOne ? 'กลับสู่เมือง' : `การต่อสู้ถัดไป (${i + 2}/${order.length}) ›`}</button></div>`;
        ctl.querySelector('#next').onclick = () => resolve(false);
        const sk = ctl.querySelector('#skip');
        if (sk) sk.onclick = () => resolve(true);
      });
      if (skip) break;
    }
    el.hidden = true;
    el.innerHTML = '';
  }

  async playFight(res, idx, count) {
    const g = this.game, me = this.me;
    const wait = (ms) => sleep(this.bfast ? 0 : ms);
    const el = $('#battle');
    const preLabel = (e) => (e.id === me.id ? `${e.trueName} (${e.cls})` : e.cards.some((c) => c.reveal) ? e.cls : e.label);
    const fighter = (e) => `<div class="fighter" id="f-${e.id}" style="--cc:${CLASS_COLOR[e.cls]}">
      <div class="f-hud">
        <div class="f-name"><b>${esc(e.name)}</b>${e.id === me.id ? ' <span class="you">คุณ</span>' : ''}</div>
        <div class="f-label">${esc(preLabel(e))}</div>
        <div class="hpbar"><i class="lag"></i><i class="cur"></i><span></span></div>
      </div>
      <div class="f-body"><img src="${art(e.cls, preLabel(e) !== e.cls && e.key)}" alt="${e.cls}"${fallback(e.cls)}><div class="fx-layer"></div></div>
      <div class="f-cards">${e.cards.length ? e.cards.map((c) => cardTile(c, { back: true })).join('') : '<small class="muted">ไม่ลงการ์ด</small>'}</div>
      <div class="f-total"><span class="dicebox"></span><b class="f-sum">?</b></div>
      <small class="f-parts"></small>
    </div>`;
    const mon = res.monster ? MONSTERS[res.monster.kind] : null;
    const monster = mon ? `<div class="fighter monster" id="f-m" style="--cc:${res.church ? '#5b8def' : '#a24bd0'}">
      <div class="f-hud"><div class="f-name"><b>${mon.name}</b></div><div class="f-label">มอนสเตอร์ · ไม่มี HP</div></div>
      <div class="f-body"><div class="mon">${res.church ? '👹' : '👁'}</div><div class="fx-layer"></div></div>
      <div class="f-cards"><small class="muted">พลัง ${mon.base}</small></div>
      <div class="f-total"><span class="dicebox"></span><b class="f-sum">?</b></div><small class="f-parts"></small>
    </div>` : '';
    const n = res.entries.length + (res.monster ? 1 : 0);
    el.innerHTML = `<div class="bt-sky"></div>
      <div class="bt-top"><span class="hud-tag">BATTLE ${idx + 1}/${count}</span> <b>${AREAS[res.area].name}${res.church ? ' · ปราบมอนสเตอร์' : ''}</b> · ${esc(DAILY[g.situation].name)}<div class="verdict"></div></div>
      <div class="arena multi n${Math.min(n, 5)}">${res.entries.map(fighter).join('')}${monster}</div>
      <div class="np-banner"></div>
      <div class="bt-bottom"><div class="bt-log"></div><div class="bt-controls"><div class="waiting">เปิดการ์ดพร้อมกัน… <small>(แตะสนามเพื่อเร่ง)</small></div></div></div>`;
    el.querySelector('.arena').onclick = () => { this.bfast = true; };
    this.maxHp = Object.fromEntries(res.entries.map((e) => [e.id, e.maxHp]));
    for (const e of res.entries) this.setHp(e.id, e.hpBefore, true);
    await wait(600);
    // reveal everyone's cards at once
    for (const e of res.entries) {
      const box = $(`#f-${e.id} .f-cards`);
      if (e.cards.length) box.innerHTML = e.cards.map((c) => cardTile(c, { attrs: 'tabindex="-1"', extra: 'flip' })).join('');
      if (e.boost) this.float(e.id, '◆ เพิ่มพลัง!', 'seal');
      if (e.sealHeal) this.float(e.id, '◆ รักษา!', 'seal');
      for (const k of e.items) this.float(e.id, `▤ ${ITEMS[k].name}`, 'card');
    }
    await wait(900);
    // Noble Phantasms
    for (const e of res.entries) {
      const np = e.cards.find((c) => c.kind === 'np');
      if (!np) continue;
      const bn = $('#battle .np-banner');
      bn.innerHTML = `<small>NOBLE PHANTASM</small><b>${esc(np.name)}</b>`;
      bn.classList.remove('show'); void bn.offsetWidth; bn.classList.add('show');
      this.flash(e.id, 'charge', 1100);
      this.flashScreen('np-flash');
      await wait(1300);
      if (e.id !== me.id && e.label !== preLabel(e)) {
        const lab = $(`#f-${e.id} .f-label`);
        if (lab) { lab.textContent = e.label; lab.classList.add('stamp'); }
        this.float(e.id, 'TRUE NAME!', 'reveal');
        await wait(700);
      }
    }
    // heals happen before damage
    for (const e of res.entries) {
      if (!e.healed) continue;
      this.float(e.id, `+${e.healed} HP`, 'heal');
      this.setHp(e.id, e.hpBefore + e.healed);
    }
    // dice
    const rollers = [...res.entries.map((e) => ({ id: e.id, dice: e.dice })), ...(res.monster ? [{ id: 'm', dice: res.monster.dice }] : [])];
    await Promise.all(rollers.map((r) => this.rollDice(`#f-${r.id} .dicebox`, r.dice)));
    // totals
    for (const e of res.entries) {
      $(`#f-${e.id} .f-sum`).textContent = e.total;
      $(`#f-${e.id} .f-parts`).textContent = e.parts.filter((p) => p.v).map((p) => `${p.label} ${p.v > 0 ? '+' : ''}${p.v}`).join(' · ');
    }
    if (res.monster) { $('#f-m .f-sum').textContent = res.monster.total; $('#f-m .f-parts').textContent = `${res.monster.base} + ลูกเต๋า ${res.monster.dice[0]}`; }
    await wait(900);
    // outcome
    for (const e of res.entries) $(`#f-${e.id}`).classList.add(e.result);
    if (res.monster) $('#f-m').classList.add(res.church && res.entries[0].result === 'tie' ? 'tie' : res.monsterWon ? 'win' : 'lose');
    const top = res.entries.filter((e) => e.result === 'win');
    const ties = res.entries.filter((e) => e.result === 'tie');
    $('#battle .verdict').textContent = res.church && ties.length ? 'เสมอ' : res.monsterWon ? `${mon.name}ชนะ!` : top.length ? `${top[0].name} ชนะ!` : `เสมอ · ${ties.map((e) => e.name).join(', ')}`;
    await wait(500);
    for (const e of res.entries) {
      if (e.dmg > 0) {
        this.flash(e.id, e.dmg >= 5 ? 'hit-big' : 'hit', 500);
        this.float(e.id, `-${e.dmg}`, e.dmg >= 5 ? 'dmg big' : 'dmg');
      } else if (e.result === 'lose') this.float(e.id, 'ไม่เสีย HP', 'miss');
      if (e.clamped || e.selfClamped) this.float(e.id, 'เซฟโซน: ไม่ตาย', 'heal');
      if (e.sealWon) this.float(e.id, '+1 Command Seal', 'seal');
      this.setHp(e.id, e.hpAfter);
    }
    await wait(900);
    for (const e of res.entries) {
      if (e.died) { $(`#f-${e.id}`).classList.add('dead'); this.flashScreen('death-flash'); }
    }
    if (res.entries.some((e) => e.died)) await wait(900);
    const v = this.resultSentence(res);
    $('#battle .bt-log').innerHTML = (v ? `<div class="verdict-line ${v.cls}">${esc(v.text)}</div>` : '') + res.entries.filter((e) => e.died).map((e) => `<div class="l death">☠ Servant ของ ${esc(e.name)} ถูกกำจัด</div>`).join('')
      + res.text.map((t) => `<div class="l ${t.startsWith('✦') ? 'grail' : ''}">${fmt(t)}</div>`).join('');
  }

  setHp(id, hp, instant = false) {
    const f = $(`#f-${id}`);
    if (!f) return;
    const max = this.maxHp[id];
    const pct = Math.max(0, Math.min(100, (hp / max) * 100));
    const cur = f.querySelector('.hpbar .cur'), lag = f.querySelector('.hpbar .lag');
    if (!cur) return;
    cur.style.width = pct + '%';
    if (instant) lag.style.width = pct + '%';
    else setTimeout(() => { lag.style.width = pct + '%'; }, 350);
    f.querySelector('.hpbar span').textContent = `${Math.max(0, hp)}/${max}`;
    f.querySelector('.hpbar').classList.toggle('low', pct < 30);
  }

  float(id, text, cls) {
    const layer = $(`#f-${id} .fx-layer`);
    if (!layer) return;
    const d = document.createElement('div');
    d.className = `float ${cls}`;
    d.textContent = text;
    d.style.left = `${35 + Math.random() * 30}%`;
    layer.appendChild(d);
    setTimeout(() => d.remove(), 1300);
  }

  flash(id, cls, ms) {
    const f = $(`#f-${id}`);
    if (!f) return;
    f.classList.remove(cls);
    void f.offsetWidth;
    f.classList.add(cls);
    setTimeout(() => f.classList.remove(cls), ms);
  }

  async rollDice(sel, vals) {
    const box = $(sel);
    if (!box) return;
    box.innerHTML = vals.map(() => '<b class="die rolling">⚀</b>').join('');
    if (!this.bfast) {
      for (let i = 0; i < 10; i++) {
        box.querySelectorAll('.die').forEach((d) => { d.textContent = FACES[Math.floor(Math.random() * 6)]; });
        await sleep(60);
      }
    }
    const best = Math.max(...vals);
    let marked = false;
    box.innerHTML = vals.map((v) => {
      const keep = !marked && v === best;
      if (keep) marked = true;
      return `<b class="die ${vals.length > 1 && !keep ? 'drop' : ''}">${FACES[v - 1] ?? v}</b>`;
    }).join('');
  }

  flashScreen(cls) {
    const el = $('#battle');
    el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);
    setTimeout(() => el.classList.remove(cls), 700);
  }

  // ================= modal =================
  modal(html) {
    const m = $('#modal');
    m.hidden = false;
    m.querySelector('.sheet').innerHTML = html;
    return m.querySelector('.sheet');
  }
  closeModal() { $('#modal').hidden = true; $('#modal .sheet').innerHTML = ''; }

  showTitle() {
    return new Promise((resolve) => {
      const sh = this.modal(`
        <div class="title-art">${Object.keys(CLASS_ART).map((c) => `<img src="${art(c)}" alt="${c}">`).join('')}</div>
        <h1 class="logo">Fate <span>Battle Royale</span></h1>
        <p class="muted">เดโมออฟไลน์ (กติกา v1.8): คุณ 1 คน ปะทะบอท 7 ตัว · 8 วัน วันละ 1 กลางวัน + 2 กลางคืน</p>
        <h3 style="margin:10px 0 4px">เล่นเป็นใน 1 นาที</h3>
        <ol class="rules">${QUICKSTART.map((t) => `<li>${t}</li>`).join('')}</ol>
        <p class="muted" style="font-size:12px">ทุกปุ่มมีคำอธิบายใต้ปุ่ม · แตะค่าบนจอเพื่อดูความหมาย · กดค้างหรือชี้ที่ปุ่มเพื่อดูคำแนะนำ · ปุ่ม <b>?</b> มุมขวาล่างเปิดคู่มือ</p>
        <label>ชื่อ Master <input id="nm" value="เอมิยะ" maxlength="16"></label>
        <button class="primary" id="st">เริ่มสงครามจอกศักดิ์สิทธิ์</button>`);
      sh.querySelector('#st').onclick = () => {
        const name = sh.querySelector('#nm').value.trim() || 'เอมิยะ';
        this.closeModal();
        resolve(name);
      };
    });
  }

  // `mine` hides the favored areas behind a lock; a revealed rival's card shows them openly
  servantCard(s, mine = true) {
    const def = s.def;
    return `<div class="summon">
      <img class="summon-art" src="${art(s.cls, s.key)}" alt="${s.cls}"${fallback(s.cls)}>
      <div>
        <div class="sv-head"><span class="badge" style="background:${CLASS_COLOR[s.cls]}">${s.cls}</span>${def.alter ? ' <span class="badge alter">Alter</span>' : ''} <b>${esc(def.name)}</b></div>
        <div class="muted">HP ${mine ? s.maxHp : `${Math.max(0, s.hp)}/${s.maxHp}`} · สำรับ 12 ใบ: โจมตี 10 · สกิล 2</div>
        ${def.alter ? `<div><small class="bad">${esc(TERMS.alter[1])}</small></div>` : ''}
        ${def.skills.map((k) => `<div><small>สกิล <b>${esc(k.name)}</b> พลัง ${k.power} · ${k.cost} มานา · ${esc(k.text)}</small></div>`).join('')}
        <div>NP (ความสามารถ ไม่อยู่ในกองการ์ด): <b class="grail">${esc(def.np.name)}</b> <small>พลัง ${def.np.power} · ${def.np.cost} มานา · ${esc(def.np.text)}</small></div>
        <div><small class="muted">ใช้ได้ทุกการต่อสู้แทนการ์ด 1 ใบ แต่ใช้แล้วทุกคนรู้ชื่อจริงและพื้นที่ถนัด/ไม่ถนัด แล้วพลัง −2 จนกว่าจะตาย</small></div>
        <div class="secret-box">${mine ? '🔒 ' : ''}ถนัด ${AREAS[def.favored].name} (+2) · ไม่ถนัด ${AREAS[def.unfavored].name} (−2)</div>
      </div>
    </div>`;
  }

  showIntro() {
    return new Promise((resolve) => {
      const s = this.me.servant;
      const sh = this.modal(`<h2>การอัญเชิญสำเร็จ</h2>
        <p>"ข้าถามเจ้า เจ้าคือมาสเตอร์ของข้าหรือไม่?"</p>
        ${this.servantCard(s)}
        <p class="muted">คนอื่นเห็นแค่คลาส <b>${s.cls}</b> ของคุณ ซ่อนชื่อจริงไว้ให้นานที่สุด</p>
        <button class="primary" id="ok">เริ่มวันที่ 1</button>`);
      sh.querySelector('#ok').onclick = () => { this.closeModal(); resolve(null); };
    });
  }

  showGameOver() {
    const g = this.game, me = this.me;
    clearInterval(this.timer);
    this.clearFx();
    this.mode = null;
    this.setChoice('');
    const rank = g.ranking.indexOf(me) + 1;
    return new Promise((resolve) => {
      const rows = g.ranking.map((x, i) => `<li class="${x === me ? 'me' : ''}">${portrait(x.servant?.cls, 'sm', x.servant?.key)}<b>#${i + 1} ${esc(x.name)}</b>
        <span>${x.servant ? `${esc(x.servant.def.name)} (${x.servant.cls})` : 'ตกรอบ'} · มานา ${x.mana} · กำจัด ${x.kills}${x === g.grail.holder ? ' ✦' : ''}</span></li>`).join('');
      const sh = this.modal(`<h2>${g.winner === me ? '🏆 คุณคว้าจอกศักดิ์สิทธิ์!' : `จบสงคราม · คุณได้อันดับ ${rank}`}</h2>
        <p>ผู้ชนะ: <b>${esc(g.winner.name)}</b> ${g.grail.holder === g.winner ? '(ถือจอกศักดิ์สิทธิ์)' : '(มานามากที่สุด เพราะไม่มีใครถือจอก)'}</p>
        <ol class="ranking">${rows}</ol>
        <button class="primary" id="again">เล่นอีกครั้ง</button>`);
      sh.querySelector('#again').onclick = () => { this.closeModal(); resolve(true); };
    });
  }
}
