// DOM front end for design v1.6. Renders the HUD from game state and answers
// the human's decisions by returning Promises that resolve when the player
// clicks (or the timer runs out). Night fights are replayed in the battle scene.

import {
  AREAS, AREA_KEYS, FIELDS, SAFE_AREAS, SERVANTS, TYPES, DAILY, ITEMS, QUESTS,
  MANA_MAX, DEATHS_FOR_GRAIL, SEAL_MAX, HAND_SIZE, ITEM_MAX, QUEST_DEPOSIT, MONSTER_BASE,
} from './data.js';
import { LAST_DAY } from './engine.js';
import { chooseCards } from './bot.js';
import { CLASS_ART, CLASS_COLOR } from './portraits.js';
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

const seals = (n) => `<span class="seals" title="Command Seal">${'◆'.repeat(n)}${'◇'.repeat(Math.max(0, SEAL_MAX - n))}</span>`;
const hiddenSeals = '<span class="seals hidden" title="Command Seal ของคนอื่นเป็นความลับ">◆ ?</span>';
const art = (cls) => (cls && CLASS_ART[cls]) || '';
const portrait = (cls, size = '') => cls
  ? `<img class="pt ${size}" src="${art(cls)}" alt="${cls}">`
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
  }

  // ================= explanations (design 13.2) =================
  // tap a value to read what it means; press and hold (or hover) a button for the full text
  setupTips() {
    const tip = $('#tip');
    const show = (el) => {
      const key = el.dataset.help;
      const html = key && TERMS[key] ? `<b>${esc(TERMS[key][0])}</b>${esc(TERMS[key][1])}` : esc(el.dataset.tip || '');
      if (!html) return;
      tip.innerHTML = html;
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
      if (el && !el.closest('button')) show(el);
      else tip.hidden = true;
    }, true);
  }

  // first-day box for this step; closed boxes come back from the "?" guide
  hint(step) {
    if (!this.hints || (this.game.day !== 1 && !this.forceHints) || this.hintsSeen.has(step) || !FIRST_DAY[step]) return '';
    return `<div class="hintbox" data-hint="${step}"><button class="hb-x" data-closehint="${step}" title="ปิดคำแนะนำ">✕</button>💡 ${FIRST_DAY[step]}</div>`;
  }
  wireHints() {
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
      case 'phase': this.renderAll(); if (this.game.stage === 'cards') this.cardsWaiting(); break;
      default: this.renderAll();
    }
  }

  // ================= HUD =================
  renderAll() {
    if (!this.game) return;
    this.renderTrack();
    this.renderBanner();
    this.renderStatus();
    this.renderSecret();
    this.renderItems();
    this.renderCard();
    this.renderStage();
    this.renderPlayers();
  }

  renderTrack() {
    const g = this.game;
    const nodes = [];
    for (let d = 1; d <= LAST_DAY; d++) {
      // each day: day phase, night 1, night 2
      for (const step of [0, 1, 2]) {
        const half = step ? 'night' : 'day';
        const h = g.history[d];
        const icons = [];
        if (!step && g.grail.appearedDay === d) icons.push('<i class="ic grail">✦</i>');
        if (step === 2 && h?.deaths) icons.push(`<i class="ic death">☠${h.deaths > 1 ? h.deaths : ''}</i>`);
        if (step === 2 && g.grail.appeared && d === g.grail.endDay) icons.push('<i class="ic end">★</i>');
        const cur = g.half === 'night' ? g.nightNo : 0;
        const now = d === g.day && step === cur;
        const past = d < g.day || (d === g.day && step < cur);
        nodes.push(`<div class="node ${past ? 'past' : now ? 'now' : 'future'} ${half}">
          <div class="icons">${icons.join('')}</div><b></b><small>${half === 'day' ? d : ''}</small></div>`);
      }
    }
    $('#daytrack').innerHTML = `<div class="hud-tag">DAY</div><div class="track">${nodes.join('')}</div>`;
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
      case 'cards': return 'เลือกการ์ด 2 ใบ (หรือ NP + การ์ด 1 ใบ)';
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
    $('#banner').innerHTML = `<div class="phase-title">${g.half === 'night' ? `☾ กลางคืน ${g.nightNo}` : '☀ กลางวัน'} · วันที่ ${g.day}/${LAST_DAY} · ${this.stepText()}${secs}</div>
      <div class="pill" ${help(g.grail.appeared ? 'grail' : 'deaths')}>${pill}</div>
      ${sit ? `<div class="sit" ${help('daily')}><span class="pill-tag warn">อีเวนต์วันนี้</span> <b>${esc(sit.name)}</b> <small>${esc(sit.text)}${g.shadowArea ? ` · ที่${AREAS[g.shadowArea].name}` : ''}</small></div>` : ''}`;
  }

  renderStatus() {
    const pl = this.me, g = this.game;
    const s = pl.servant;
    const stat = (icon, cls, v, max, key) => `<div class="stat ${cls}" ${help(key)}><i>${icon}</i><b>${v}</b>${max != null ? `<small>/${max}</small>` : ''}</div>`;
    $('#status').innerHTML = `<div class="hud-tag">STATUS</div>
      <div class="stat-grid">
        ${stat('❤', 'hp', s ? Math.max(0, s.hp) : 0, s ? s.maxHp : 0, 'hp')}
        ${stat('◈', 'mana', pl.mana, MANA_MAX, 'mana')}
        ${stat('◆', 'seal', pl.seals, SEAL_MAX, 'seal')}
        ${stat('▤', 'card', pl.hand.length, Math.max(HAND_SIZE, g.handSize()), 'hand')}
        ${stat('☠', 'death', g.deaths, DEATHS_FOR_GRAIL, 'deaths')}
        <div class="stat box" ${help('alive')}>เหลือ<br><b>${g.alive().length}/8</b> มาสเตอร์</div>
      </div>
      <div class="sec-row muted" ${help('pools')} style="margin-top:6px">อัญเชิญได้อีก: กองกลาง <b>${g.pool.length}</b> · กอง Alter <b>${g.alterPool.length}</b></div>`;
  }

  renderSecret() {
    const me = this.me, g = this.game;
    const s = me.servant;
    if (!s) { $('#secret').innerHTML = `<div class="hud-tag">SECRET</div><p class="muted">${me.out ? 'คุณตกรอบแล้ว' : ''}</p>`; return; }
    const def = s.def;
    const q = me.quest;
    const flags = FIELDS.filter((f) => g.flags[f] === me.id).map((f) => AREAS[f].short);
    $('#secret').innerHTML = `<div class="hud-tag">SECRET · เห็นเฉพาะคุณ</div>
      <div class="sec-row" ${help('favored')}><span class="tag good">ถนัด</span> ${AREAS[def.favored].name} <small>พลัง +2</small></div>
      <div class="sec-row" ${help('favored')}><span class="tag bad">ไม่ถนัด</span> ${AREAS[def.unfavored].name} <small>พลัง −2</small></div>
      ${flags.length ? `<div class="sec-row" ${help('flag')}><span class="tag warn">⚑ ธง</span> ${flags.join(', ')} <small>อยู่ต่อคืนหน้า +3</small></div>` : ''}
      ${q ? `<div class="sec-row" data-tip="${esc(QUESTS[q.key].text)}"><span class="tag warn">เควส</span> ${esc(QUESTS[q.key].name)} ${q.progress}/${QUESTS[q.key].need} <small>ภายในวันที่ ${q.until}</small></div>` : ''}
      ${me.resting && g.half === 'night' ? `<div class="sec-row" ${help('resting')}><span class="tag warn">พักฟื้น</span> คืนนี้ไม่ต้องสู้ กลับมาเล่นพรุ่งนี้</div>` : ''}
      <div class="sec-row muted" ${help(s.revealed ? 'revealed' : 'favored')}>${s.revealed ? '⚠ ชื่อจริงและพื้นที่ถนัดถูกเปิดแล้ว พลัง −2 ทุกการต่อสู้' : 'ชื่อจริงและพื้นที่ถนัดยังเป็นความลับ คนอื่นเห็นแค่คลาส'} · กองจั่ว ${me.deck.length} · กองทิ้ง ${me.discard.length}</div>`;
  }

  renderItems() {
    const me = this.me;
    const hand = me.hand;
    const handHtml = hand.length ? hand.map((c) => cardTile(c, { attrs: 'tabindex="-1"', cost: this.game.cardCost(c) })).join('') : '<p class="muted">ไม่มีการ์ดในมือ</p>';
    const items = me.items.length
      ? me.items.map((k) => `<li title="${esc(ITEMS[k].text)}"><b>${esc(ITEMS[k].name)}</b><small>${esc(ITEMS[k].text)}</small></li>`).join('')
      : '<li class="muted">ยังไม่มีไอเท็ม · ได้จากการ์ดรางวัลหรือปราบมอนสเตอร์</li>';
    $('#items').innerHTML = `<div class="hud-tag" ${help('hand')}>HAND ${me.hand.length}/${Math.max(HAND_SIZE, this.game.handSize())} + NP</div>
      <div class="hand mini">${handHtml}</div>
      <div class="hud-tag" style="margin-top:8px" ${help('items')}>ITEMS ${me.items.length}/${ITEM_MAX}</div><ul class="items">${items}</ul>`;
  }

  renderCard() {
    const s = this.me.servant;
    if (!s) { $('#charcard').innerHTML = ''; return; }
    const def = s.def;
    const skills = def.skills.map((k) => `<li title="${esc(k.text)}"><b>${esc(k.name)}</b><em>พลัง ${k.power} · ${k.cost}◈</em></li>`).join('');
    $('#charcard').innerHTML = `<div class="ccard cls-${s.cls}" style="--cc:${CLASS_COLOR[s.cls]}">
      <div class="cc-art" style="background-image:url('${art(s.cls)}')">
        <span class="cc-cls">${s.cls}${def.alter ? ' · Alter' : ''}</span>
        <span class="cc-stats">HP ${s.maxHp}${def.godHand ? ' · God Hand' : ''}${def.nameless ? ' · ไร้นาม' : ''}</span>
      </div>
      <div class="cc-body">
        <div class="cc-name">${esc(def.name)}</div>
        ${bar(Math.max(0, s.hp), s.maxHp, 'hp')}
        <ul class="cc-moves">
          ${skills}
          <li class="np" ${help('np')}><b>NP · ${esc(def.np.name)}</b><em>พลัง ${def.np.power} · ${this.game.cardCost(s.np)}◈</em><small class="desc">${esc(def.np.text)} · ความสามารถ ใช้ได้ทุกการต่อสู้</small></li>
        </ul>
      </div>
    </div>`;
  }

  renderStage() {
    const g = this.game, me = this.me;
    const choosing = this.mode === 'day';
    const night = g.half === 'night';
    const nodes = AREA_KEYS.map((a) => {
      const closed = !g.areaOpen(a);
      const grailHere = g.grail.appeared && !g.grail.holder && g.grail.area === a;
      const people = g.alive().filter((x) => x.area === a && x.servant);
      const tokens = people.map((x) => `<span class="token ${x === me ? 'me' : ''} ${g.grail.holder === x ? 'holder' : ''}" style="--pc:${this.color(x)}" title="${esc(x.name)} · ${esc(g.servantLabel(me, x))}">
        ${portrait(x.servant.cls, 'xs')}<small>${esc(x.name)}</small></span>`).join('');
      const sel = choosing && this.sel.area === a;
      const mine = !choosing && !me.out && me.area === a;
      const fight = g.stage === 'cards' || g.stage === 'result' ? (g.fights || []).some((f) => f.area === a) : false;
      const def = me.servant?.def;
      const fav = def && def.favored === a ? '<i class="mk good">ถนัด</i>' : def && def.unfavored === a ? '<i class="mk bad">ไม่ถนัด</i>' : '';
      const cap = closed ? '<i class="mk">ปิด</i>' : FIELDS.includes(a) ? '' : `<i class="mk">รับ ${g.capOf(a)}</i>`;
      const flagOwner = FIELDS.includes(a) && g.flags[a] != null ? g.players[g.flags[a]] : null;
      const flag = flagOwner ? `<i class="mk flag" style="--pc:${this.color(flagOwner)}" title="ธงยึดครองของ ${esc(flagOwner.name)}">⚑ ${esc(flagOwner.name)}</i>` : '';
      let ev = '';
      if (FIELDS.includes(a) && g.events[a] && !closed) {
        ev = a === 'shinto' && !g.shintoOpen ? '<div class="evcard back">รางวัล (คว่ำ)</div>' : `<div class="evcard">รางวัล: ${esc(g.events[a].name)}</div>`;
      }
      if (a === 'temple' && !closed) ev = '<div class="evcard ley">เลย์ไลน์ มานา</div>';
      if (a === 'mansion' && !closed) ev = `<div class="evcard ley">หลอมการ์ด ใบละ ${g.forgeMana()} มานา</div>`;
      const monster = g.shadowArea === a ? `<i class="mk fight" title="มอนสเตอร์ ${MONSTER_BASE}+1d6">👁 มอนสเตอร์</i>` : '';
      return `<button class="anode ${closed ? 'closed' : ''} ${sel ? 'sel' : ''} ${mine ? 'mine' : ''}" data-area="${a}" style="grid-area:${a}" ${closed || !choosing ? 'tabindex="-1"' : ''} data-tip="${esc(this.areaDesc(a))}">
        <div class="an-name">${AREAS[a].name}</div>
        <div class="an-flags">${fav}${cap}${flag}${grailHere ? '<i class="mk grail">✦ จอก</i>' : ''}${monster}${fight ? '<i class="mk fight">⚔</i>' : ''}</div>
        ${ev}
        <div class="tokens">${tokens}</div>
      </button>`;
    }).join('');
    $('#stage').innerHTML = `<div class="ring map ${night ? 'night' : 'day'}">
      <div class="ring-core" style="grid-area:core"><div class="moon">${night ? '☾' : '☀'}</div><b>ฟุยุกิ</b></div>
      ${nodes}</div>`;
    this.fitMap();
    $('#stage').querySelectorAll('.anode').forEach((b) => b.addEventListener('click', () => {
      if (this.mode !== 'day' || b.classList.contains('closed')) return;
      if (g.grail.holder === me && !FIELDS.includes(b.dataset.area)) return;
      this.pickArea(b.dataset.area);
    }));
  }

  // shrink the map to fit when the choice panel below grows, so nothing is cut off
  fitMap() {
    const st = $('#stage'), map = st.querySelector('.ring.map');
    if (!map || window.innerWidth <= 1100) return;
    map.style.zoom = 1;
    const room = st.clientHeight - 4, need = map.offsetHeight;
    if (need > room && room > 0) map.style.zoom = Math.max(0.55, room / need).toFixed(3);
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
      const label = s ? g.servantLabel(me, x) : (x.out ? '—' : '...');
      const flags = FIELDS.filter((f) => g.flags[f] === x.id).map((f) => `⚑${AREAS[f].short}`).join(' ');
      const known = s && x !== me && g.knowsName(me, x);
      return `<li class="prow ${x.out ? 'out' : ''} ${x === me ? 'me' : ''}" style="--pc:${this.color(x)}">
        <div class="pr-num">${i + 1}</div>
        ${portrait(s?.cls, 'sm')}
        <div class="pr-main">
          <div class="pr-name"><b>${esc(x.name)}</b>${x === me ? '<span class="you">คุณ</span>' : ''}${g.grail.holder === x ? '<span class="grail"> ✦</span>' : ''}</div>
          <div class="pr-sv">${esc(label)}${s?.def.alter && known ? ' <small class="bad">Alter</small>' : ''}${known ? ` <small class="bad" ${help(s.revealed ? 'revealed' : 'favored')}>${s.revealed ? 'เปิดชื่อแล้ว −2' : 'รู้ชื่อจริง'}</small>` : ''}</div>
          ${known ? `<div class="pr-meta">ถนัด ${AREAS[s.def.favored].short} · ไม่ถนัด ${AREAS[s.def.unfavored].short}</div>` : ''}
          ${s ? bar(Math.max(0, s.hp), s.maxHp, 'hp small', false) : ''}
          <div class="pr-meta"><span ${help(x === me ? 'seal' : 'sealsHidden')}>${x === me ? seals(x.seals) : hiddenSeals}</span> · <span ${help('mana')}>◈ ${x.mana}</span> · <span ${help('items')}>ไอเท็ม ${x.items.length}</span>${flags ? ` · <span ${help('flag')}>${flags}</span>` : ''}</div>
        </div>
        <div class="pr-state">${this.playerStatus(x)}</div>
      </li>`;
    }).join('');
    $('#players').innerHTML = `<div class="hud-tag">MASTERS · ${g.alive().length}/8</div><ul>${rows}</ul>`;
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
      case 'day': return this.askDay();
      case 'move': return this.askMove(ctx.opts);
      case 'cards': return this.askCards(ctx);
      case 'nightEnd': return this.showNight(ctx.results);
      case 'catalyst': return this.askCatalyst(ctx.choices);
      default: return null;
    }
  }

  // ---------- ① day: choose an area ----------
  askDay() {
    const g = this.game, me = this.me;
    const fields = g.cap.fields;
    this.mode = 'day';
    this.sel = { area: null, backup: fields.includes(me.lastField) ? me.lastField : fields[0], church: { type: 'offer' }, forge: [], hero: false };
    this.renderAll();
    return new Promise((resolve) => {
      this.resolveDay = resolve;
      this.startTimer(DAY_SECONDS, () => this.confirmDay(true));
      this.renderDayChoice();
    });
  }

  pickArea(a) {
    this.sel.area = a;
    if (FIELDS.includes(a)) this.sel.backup = a;
    this.renderStage();
    this.renderDayChoice();
  }

  confirmDay(timeout = false) {
    if (!this.resolveDay) return;
    clearInterval(this.timer);
    const { area, backup, church, forge } = this.sel;
    this.mode = null;
    this.setChoice('<div class="waiting">รอทุกคนเลือก แล้วเปิดเผยพร้อมกัน…</div>');
    const r = this.resolveDay; this.resolveDay = null;
    // design: no choice in time = previous battlefield (or a random one)
    r(timeout && !area ? {} : { area, backup, church: area === 'church' ? church : null, forge: area === 'mansion' ? forge : [] });
  }

  areaDesc(a) {
    return a === 'mansion' ? DAY.mansion[0].replace('ใบละ 2 มานา', `ใบละ ${this.game.forgeMana()} มานา`) : DAY[a][0];
  }

  // why an area cannot be picked this morning
  areaWhy(a) {
    const g = this.game, me = this.me;
    if (!g.areaOpen(a)) return `ปิด: มาสเตอร์เหลือ ${g.alive().length} คน ${a === 'shinto' ? 'เปิดสนามรบเดียว' : 'ที่นี่ไม่รับคนแล้ว'}`;
    if (g.grail.holder === me && !FIELDS.includes(a)) return 'ผู้ถือจอกเข้าวัด โบสถ์ หรือคฤหาสน์ไม่ได้';
    return '';
  }

  renderDayChoice() {
    const g = this.game, me = this.me;
    const holder = g.grail.holder === me;
    const def = me.servant.def;
    this.redrawChoice = () => this.renderDayChoice();
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
    let church = '';
    if (this.sel.area === 'church') {
      const price = g.offerPrice();
      const ch = this.sel.church;
      const offerWhy = me.seals >= SEAL_MAX ? `Command Seal เต็มแล้ว (${SEAL_MAX} ดวง)` : me.mana < price ? `มานาไม่พอ (ต้องใช้ ${price})` : '';
      const quests = g.quests.map((k) => {
        const why = me.quest ? 'ถือเควสได้ทีละ 1 เควส' : me.mana < QUEST_DEPOSIT ? `มานาไม่พอวางมัดจำ (ต้องใช้ ${QUEST_DEPOSIT})`
          : k === 'offering' && me.items.length < 2 ? 'ต้องมีการ์ดไอเท็ม 2 ใบ' : k === 'offering' && me.seals >= SEAL_MAX ? 'Command Seal เต็มแล้ว' : '';
        return optBtn({ cls: 'small', sel: ch.type === 'quest' && ch.quest === k, off: !!why, attrs: `data-quest="${k}"`, label: `รับเควส: ${esc(QUESTS[k].name)}`, desc: `${DAY[k][0]} · ${DAY.quest[0]}`, when: DAY[k][1], why });
      }).join('');
      church = `<div class="sub"><small>ทำอะไรที่โบสถ์ (ทำได้ 1 อย่าง)</small><div class="tools col">
        ${optBtn({ cls: 'small', sel: ch.type === 'offer', off: !!offerWhy, attrs: 'data-offer="1"', label: `ถวายมานา ${price} → Command Seal +1`, desc: DAY.offer[0], when: DAY.offer[1], why: offerWhy })}
        ${quests}</div></div>`;
    }
    let forge = '';
    if (this.sel.area === 'mansion') {
      forge = `<div class="sub"><small>หลอมการ์ด: ${esc(DAY.forge[0])} (ใบละ +${g.forgeMana()} มานา แล้วจั่วใหม่) · ควร${esc(DAY.forge[1])}</small>
        <div class="hand">${me.hand.map((c) => {
          const on = this.sel.forge.includes(c.id);
          const full = !on && this.sel.forge.length >= 2;
          return cardTile(c, { sel: on, off: full, attrs: `data-forge="${c.id}"`, cost: g.cardCost(c), why: full ? 'เลือกครบ 2 ใบแล้ว' : '' });
        }).join('')}</div></div>`;
    }
    const dayItems = [...new Set(me.items)].filter((k) => ITEMS[k].phase.includes('day'));
    const itemWhy = (k) => g.dayItemUsable(me, k) ? '' : k === 'potion' ? 'HP เต็มแล้ว' : k === 'mana_vial' ? 'มานาเต็มแล้ว' : '';
    const itemBtns = dayItems.map((k) => optBtn({ cls: 'small', attrs: `data-item="${k}"`, off: !!itemWhy(k), label: `ใช้ ${esc(ITEMS[k].name)}`, desc: DAY[k]?.[0] || ITEMS[k].text, when: DAY[k]?.[1], why: itemWhy(k) })).join('');
    const healWhy = me.seals <= 0 ? 'ไม่มี Command Seal' : me.servant.hp >= me.servant.maxHp ? 'HP เต็มแล้ว' : '';
    const sealBtn = optBtn({ cls: 'small seal', attrs: 'data-seal="heal"', off: !!healWhy, label: '◆ รักษา! (Command Seal)', desc: DAY.sealHeal[0], when: DAY.sealHeal[1], why: healWhy });
    const unknown = g.alive().filter((x) => x !== me && !g.knowsName(me, x));
    const heroPick = this.sel.hero ? `<p class="note">บันทึกวีรชน: เลือกเป้าหมาย</p><div class="tools">${unknown.map((x) =>
      `<button class="small" data-hero="${x.id}">${esc(x.name)} (${x.servant.cls})</button>`).join('')}</div>` : '';
    this.setChoice(`
      <div class="hud-tag">กลางวัน · เลือกที่จะไป</div>
      ${this.hint('choose')}
      <p class="note">ทุกคนเลือกพร้อมกันแบบลับ แล้วเปิดเผยพร้อมกัน · กลางวันไม่มีการต่อสู้ · อยู่สนามรบตั้งแต่กลางวัน = ตั้งหลัก +1 คืนนี้${holder ? ' · <b class="grail">คุณถือจอก: ไปได้แค่สนามรบ</b>' : ''}</p>
      <div class="arows two">${rows}</div>
      ${backup}${church}${forge}
      <div class="tools col optcol two">${sealBtn}${itemBtns}</div>
      ${heroPick}
      <div class="confirm-row">
        ${this.timerHtml()}
        <button class="primary" id="go" ${this.sel.area ? '' : 'disabled'}>ยืนยัน${this.sel.area ? ` · ${AREAS[this.sel.area].short}` : ''}</button>
      </div>
      <small class="desc" style="text-align:right">${this.sel.area ? 'ยืนยันแล้วเปลี่ยนไม่ได้' : 'ยังไม่ได้เลือก: แตะพื้นที่ก่อน ถ้าหมดเวลาระบบส่งไปสนามรบเดิม'}</small>`);
    const el = $('#choice');
    this.wireHints();
    el.querySelectorAll('[data-area]').forEach((b) => b.onclick = () => this.pickArea(b.dataset.area));
    el.querySelectorAll('[data-backup]').forEach((b) => b.onclick = () => { this.sel.backup = b.dataset.backup; this.renderDayChoice(); });
    el.querySelectorAll('[data-offer]').forEach((b) => b.onclick = () => { this.sel.church = { type: 'offer' }; this.renderDayChoice(); });
    el.querySelectorAll('[data-quest]').forEach((b) => b.onclick = () => { this.sel.church = { type: 'quest', quest: b.dataset.quest }; this.renderDayChoice(); });
    el.querySelectorAll('[data-forge]').forEach((b) => b.onclick = () => {
      const id = Number(b.dataset.forge);
      this.sel.forge = this.sel.forge.includes(id) ? this.sel.forge.filter((x) => x !== id) : [...this.sel.forge, id];
      this.renderDayChoice();
    });
    el.querySelectorAll('[data-seal]').forEach((b) => b.onclick = () => { g.sealHeal(me); this.renderAll(); this.renderDayChoice(); });
    el.querySelectorAll('[data-item]').forEach((b) => b.onclick = () => {
      const k = b.dataset.item;
      if (k === 'hero_record') { this.sel.hero = true; this.renderDayChoice(); return; }
      g.useDayItem(me, k);
      this.renderAll(); this.renderDayChoice();
    });
    el.querySelectorAll('[data-hero]').forEach((h) => h.onclick = () => {
      g.useDayItem(me, 'hero_record', Number(h.dataset.hero));
      this.sel.hero = false;
      this.renderAll(); this.renderDayChoice();
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
        const stayDesc = FIELDS.includes(me.area) ? (g.flags[me.area] === me.id ? 'ไม่เสียอะไร ถือธงอยู่ได้พลัง +3' : MOVE.stay[0]) : 'ไม่เสียอะไร';
        const rows = [
          optBtn({ sel: this.sel.type === 'stay', attrs: 'data-type="stay" data-to=""', label: `อยู่ที่${AREAS[me.area].name}`, desc: stayDesc, when: MOVE.stay[1] }),
          ...fieldsTo.map((f) => optBtn({ sel: this.sel.type === 'move' && this.sel.to === f, off: !opts.move.includes(f), attrs: `data-type="move" data-to="${f}"`,
            label: `ย้ายไป${AREAS[f].name}`, desc: g.moveCost() ? MOVE.move[0] : 'ลมสงบ: ย้ายฟรี ไปถึงได้โบนัส 0 ทำได้เฉพาะตอนไม่มีใครอยู่ด้วย', when: MOVE.move[1], why: moveWhy })),
        ];
        // escapes: listed when you are tied down or cannot move otherwise; else one line saying how
        const escWhy = !opts.escape.length ? (me.seals <= 0 && !hasScroll ? 'ไม่มี Command Seal' : holder ? 'ผู้ถือจอกเข้าวัด โบสถ์ หรือคฤหาสน์ไม่ได้' : 'ไม่มีที่ให้หนีไป') : '';
        if (escWhy) rows.push(optBtn({ off: true, label: '"หนี!" (Command Seal)', desc: MOVE.escape[0], why: escWhy }));
        else if (here.length || !opts.move.length) {
          for (const a of opts.escape) rows.push(optBtn({ sel: this.sel.type === 'escape' && this.sel.to === a, attrs: `data-type="escape" data-to="${a}"`,
            label: `"หนี!" ไป${AREAS[a].name}`, tags: useScroll ? '<i class="mk">ม้วนคาถา</i>' : '<i class="mk">−1 Command Seal</i>',
            desc: useScroll ? MOVE.scroll[0] : MOVE.escape[0], when: useScroll ? MOVE.scroll[1] : MOVE.escape[1] }));
        } else rows.push(`<small class="desc">"หนี!" ใช้ได้เมื่อมีคนอยู่ด้วย (ตอนนี้ย้ายแบบจ่ายมานาได้อยู่แล้ว)</small>`);
        const view = opts.view.length ? `<div class="sub"><small>ดูมือ (โบสถ์): ${esc(MOVE.view[0])}</small><div class="tools">${opts.view.map((id) =>
          `<button class="small ${this.sel.view === id ? 'on' : ''}" data-view="${id}" title="ควรเลือกเมื่อ: ${esc(MOVE.view[1])}">${esc(g.players[id].name)}</button>`).join('')}</div></div>` : '';
        const daySum = this.dayLines().map((e) => `<div class="l ${e.cls}">${fmt(e.text)}</div>`).join('');
        this.setChoice(`
          <div class="hud-tag">กลางคืน ${g.nightNo} · ย้ายพื้นที่</div>
          ${this.hint('move')}
          ${daySum ? `<div class="summary small">${daySum}</div>` : ''}
          <p class="note">${here.length ? `อยู่ด้วยกัน: ${here.map((x) => `${esc(x.name)} [${esc(g.servantLabel(me, x))}]`).join(', ')} · ถ้าอยู่ที่เดิมต้องสู้` : 'ตอนนี้คุณอยู่คนเดียว ถ้าไม่มีใครมา คุณได้รางวัลโดยไม่ต้องสู้'}${tied ? ` · <span ${help('tied')}>ติดพัน</span>` : ''}</p>
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

  // ---------- ③ night: play cards ----------
  cardsWaiting() {
    const g = this.game, me = this.me;
    if (me.out || (g.fights || []).some((f) => f.players.includes(me))) return;
    const peek = me.peek ? `<p class="note">โบสถ์: มือของ <b>${esc(me.peek.name)}</b> คือ ${esc(me.peek.cards.join(', ') || '(ว่าง)')}</p>` : '';
    const where = !me.area ? 'Servant ตนใหม่กำลังพักฟื้น กลับมาเลือกพื้นที่ได้ตอนเช้า' : SAFE_AREAS.includes(me.area) ? `คุณปลอดภัยอยู่ใน${AREAS[me.area].name}` : `เฟสนี้ไม่มีใครมาสู้กับคุณที่${AREAS[me.area].name}`;
    this.setChoice(`<div class="hud-tag">กลางคืน · ลงการ์ด</div>${peek}<div class="waiting">${where} · รอการต่อสู้ที่อื่น…</div>`);
  }

  askCards(ctx) {
    const g = this.game, me = this.me;
    const { fight, cards } = ctx;
    this.mode = 'cards';
    this.sel = { cards: [], boost: false, sealHeal: false, items: [] };
    this.renderAll();
    return new Promise((resolve) => {
      const done = (play) => {
        clearInterval(this.timer);
        this.mode = null;
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
        const foes = fight.players.filter((x) => x !== me).map((x) => `<span class="foe">${portrait(x.servant.cls, 'xs')} <b>${esc(x.name)}</b> ${esc(g.servantLabel(me, x))} · HP ${Math.max(0, x.servant.hp)}/${x.servant.maxHp}</span>`);
        if (fight.monster) foes.push(`<span class="foe">👁 <b>มอนสเตอร์</b> ${MONSTER_BASE}+1d6</span>`);
        const cardWhy = (c) => {
          if (this.sel.cards.includes(c.id)) return '';
          if (full) return 'เลือกครบ 2 ใบแล้ว';
          if (spent + g.cardCost(c) > me.mana) return `มานาไม่พอ (ต้องใช้ ${g.cardCost(c)})`;
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
          <div class="hud-tag">กลางคืน ${g.nightNo} · ลงการ์ด · ${AREAS[fight.area].name}</div>
          ${this.hint('cards')}
          <div class="foes">${foes.join('')}</div>
          ${me.peek ? `<p class="note">โบสถ์: มือของ ${esc(me.peek.name)} คือ ${esc(me.peek.cards.join(', '))}</p>` : ''}
          <p class="note">เลือกการ์ดได้ 2 ใบ หรือ NP + การ์ด 1 ใบ (มานา ${me.mana}) · ทุกคนเปิดพร้อมกัน พลังรวมสูงสุดชนะ คนแพ้เสีย HP เท่าส่วนต่าง</p>
          <div class="play-grid"><div>
          <div class="hand">${hand || '<p class="muted">ไม่มีการ์ดในมือ</p>'}</div>
          ${npRow}
          <div class="optcol">
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
    const others = [...res.entries.filter((x) => x !== e).map((x) => x.total), ...(res.monster ? [res.monster.total] : [])];
    const best = Math.max(...others);
    const size = res.entries.length + (res.monster ? 1 : 0);
    const melee = size >= 3 ? ` (ตะลุมบอน ${size} ฝ่าย ผู้ชนะได้ +2 มานาเพิ่ม)` : '';
    const got = res.text.find((t) => t.startsWith(`${me.name} ได้รางวัล:`));
    const gain = got ? ` ได้${got.split('ได้รางวัล:')[1]}` : '';
    const flag = FIELDS.includes(res.area) && this.game.flags[res.area] === me.id ? ` และธง${AREAS[res.area].name}` : '';
    const kills = res.entries.filter((x) => x.died && x !== e && !x.darkHit).map((x) => x.name);
    let text, cls;
    if (e.result === 'win') {
      text = `คุณชนะ ${e.total} ต่อ ${best}${gain}${flag}${melee}`;
      if (kills.length) text += ` · คุณกำจัด Servant ของ ${kills.join(', ')}`;
      cls = 'win';
    } else if (e.result === 'tie') {
      text = res.monsterWon ? `เสมอกับมอนสเตอร์ ${e.total} ต่อ ${res.monster.total} ไม่มีใครได้รางวัลและธง` : `เสมอ ${e.total} ต่อ ${e.total} แบ่งรางวัลกัน${gain ? ` (${gain.trim()})` : ''} ไม่มีใครเสีย HP`;
      cls = '';
    } else {
      const lost = e.dmg - (e.darkHit || 0);
      text = `คุณแพ้ ${e.total} ต่อ ${res.max} ${lost > 0 ? `เสีย HP ${lost}` : 'แต่ไม่เสีย HP'} (เหลือ ${e.hpAfter})${res.monsterWon ? ' · มอนสเตอร์ชนะ ไม่มีใครได้รางวัลและธง' : ''}${melee}`;
      cls = 'lose';
    }
    if (e.darkHit) text += ` · NP ด้านมืด เสีย HP ${e.darkHit}`;
    if (e.died) text += ' · Servant ของคุณถูกกำจัด';
    if (e.revived) text += ' · God Hand ฟื้นจากความตาย';
    return { text, cls };
  }

  async showNight(results) {
    const g = this.game, me = this.me;
    if (me.out && this.fast) return null;
    const mine = results.find((r) => r.entries.some((e) => e.id === me.id));
    const order = mine ? [mine, ...results.filter((r) => r !== mine)] : results;
    if (order.length) await this.playFights(order);
    const lines = g.logs.filter((e) => e.day === g.day && e.half === 'night' && e.night === g.nightNo && e.cls !== 'phase'
      && (e.to ? e.to.includes(me.id) : /☠|✦|✸|✖|⚔|ได้รางวัล|ยึด|คนเดียว|หนี|ย้าย|ม้วน/.test(e.text)));
    this.renderAll();
    const verdicts = results.map((r) => this.resultSentence(r)).filter(Boolean)
      .map((v) => `<div class="verdict-line ${v.cls}">${esc(v.text)}</div>`).join('');
    const solo = !me.out && !mine && FIELDS.includes(me.area) && g.alive().filter((x) => x.area === me.area).length === 1 && g.shadowArea !== me.area
      ? '<div class="verdict-line win">ไม่มีใครมา คุณได้รางวัลและธงโดยไม่ต้องสู้</div>' : '';
    const box = (l) => `${verdicts}${solo}<div class="summary">${l.map((e) => `<div class="l ${e.cls}">${fmt(e.text)}</div>`).join('') || '<div class="muted">คืนนี้เงียบสงบ</div>'}</div>`;
    return new Promise((resolve) => {
      if (me.out) {
        this.setChoice(`<div class="hud-tag">ตกรอบ</div><p class="note">ดูการต่อสู้ของมาสเตอร์ที่เหลือต่อได้</p>${box(lines)}
          <div class="confirm-row"><button id="nx">ดูวันถัดไป</button><button class="primary" id="ff">ข้ามไปดูผลตอนจบ</button></div>`);
        $('#ff').onclick = () => { this.fast = true; this.setChoice('<div class="waiting">กำลังจำลองจนจบ…</div>'); resolve(null); };
        $('#nx').onclick = () => { this.setChoice(''); resolve(null); };
        return;
      }
      const last = g.checkOver();
      const next = g.nightNo === 1 ? (g.alive().length <= 1 ? 'ดูผลตอนจบ ›' : 'กลางคืน 2 ›') : last ? 'ดูผลตอนจบ ›' : `วันที่ ${g.day + 1} ›`;
      this.setChoice(`<div class="hud-tag">สรุปคืนวันที่ ${g.day} · กลางคืน ${g.nightNo}</div>${this.hint('result')}${box(lines)}
        <button class="primary wide" id="nx">${next}</button>`);
      this.wireHints();
      $('#nx').onclick = () => { this.setChoice(''); resolve(null); };
    });
  }

  // ================= battle scene =================
  async playFights(order) {
    const el = $('#battle');
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
      <div class="f-body"><img src="${art(e.cls)}" alt="${e.cls}"><div class="fx-layer"></div></div>
      <div class="f-cards">${e.cards.length ? e.cards.map((c) => cardTile(c, { back: true })).join('') : '<small class="muted">ไม่ลงการ์ด</small>'}</div>
      <div class="f-total"><span class="dicebox"></span><b class="f-sum">?</b></div>
      <small class="f-parts"></small>
    </div>`;
    const monster = res.monster ? `<div class="fighter monster" id="f-m" style="--cc:#a24bd0">
      <div class="f-hud"><div class="f-name"><b>เงาดำจากจอก</b></div><div class="f-label">มอนสเตอร์</div></div>
      <div class="f-body"><div class="mon">👁</div><div class="fx-layer"></div></div>
      <div class="f-cards"><small class="muted">พลัง ${MONSTER_BASE}</small></div>
      <div class="f-total"><span class="dicebox"></span><b class="f-sum">?</b></div><small class="f-parts"></small>
    </div>` : '';
    const n = res.entries.length + (res.monster ? 1 : 0);
    el.innerHTML = `<div class="bt-sky"></div>
      <div class="bt-top"><span class="hud-tag">BATTLE ${idx + 1}/${count}</span> <b>${AREAS[res.area].name}</b> · ${esc(DAILY[g.situation].name)}<div class="verdict"></div></div>
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
    if (res.monster) { $('#f-m .f-sum').textContent = res.monster.total; $('#f-m .f-parts').textContent = `${MONSTER_BASE} + ลูกเต๋า ${res.monster.dice[0]}`; }
    await wait(900);
    // outcome
    for (const e of res.entries) $(`#f-${e.id}`).classList.add(e.result);
    if (res.monster) $('#f-m').classList.add(res.monsterWon ? 'win' : 'lose');
    const top = res.entries.filter((e) => e.result === 'win');
    const ties = res.entries.filter((e) => e.result === 'tie');
    $('#battle .verdict').textContent = res.monsterWon ? 'มอนสเตอร์ชนะ!' : top.length ? `${top[0].name} ชนะ!` : `เสมอ · ${ties.map((e) => e.name).join(', ')}`;
    await wait(500);
    for (const e of res.entries) {
      if (e.dmg > 0) {
        this.flash(e.id, e.dmg >= 5 ? 'hit-big' : 'hit', 500);
        this.float(e.id, `-${e.dmg}`, e.dmg >= 5 ? 'dmg big' : 'dmg');
      } else if (e.result === 'lose') this.float(e.id, 'ไม่เสีย HP', 'miss');
      this.setHp(e.id, e.revived ? 0 : e.hpAfter);
    }
    await wait(900);
    for (const e of res.entries) {
      if (e.revived) { this.float(e.id, 'GOD HAND!', 'reveal'); this.setHp(e.id, e.hpAfter); }
      if (e.died) { $(`#f-${e.id}`).classList.add('dead'); this.flashScreen('death-flash'); }
    }
    if (res.entries.some((e) => e.died || e.revived)) await wait(900);
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
        <p class="muted">เดโมออฟไลน์ (กติกา v1.6): คุณ 1 คน ปะทะบอท 7 ตัว · 8 วัน วันละ 1 กลางวัน + 2 กลางคืน</p>
        <h3 style="margin:10px 0 4px">เล่นเป็นใน 1 นาที</h3>
        <ol class="rules">${QUICKSTART.map((t) => `<li>${t}</li>`).join('')}</ol>
        <p class="muted" style="font-size:12px">ทุกปุ่มมีคำอธิบายใต้ปุ่ม · แตะค่าบนจอเพื่อดูความหมาย · กดค้างหรือชี้ที่ปุ่มเพื่อดูคำแนะนำ · ปุ่ม <b>?</b> มุมขวาล่างเปิดคู่มือ</p>
        <label>ชื่อมาสเตอร์ <input id="nm" value="เอมิยะ" maxlength="16"></label>
        <button class="primary" id="st">เริ่มสงครามจอกศักดิ์สิทธิ์</button>`);
      sh.querySelector('#st').onclick = () => {
        const name = sh.querySelector('#nm').value.trim() || 'เอมิยะ';
        this.closeModal();
        resolve(name);
      };
    });
  }

  servantCard(s) {
    const def = s.def;
    return `<div class="summon">
      <img class="summon-art" src="${art(s.cls)}" alt="${s.cls}">
      <div>
        <div class="sv-head"><span class="badge" style="background:${CLASS_COLOR[s.cls]}">${s.cls}</span>${def.alter ? ' <span class="badge alter">Alter</span>' : ''} <b>${esc(def.name)}</b></div>
        <div class="muted">HP ${s.maxHp} · สำรับ 12 ใบ: โจมตี 10 · สกิล 2</div>
        ${def.alter ? `<div><small class="bad">${esc(TERMS.alter[1])}</small></div>` : ''}
        ${def.skills.map((k) => `<div><small>สกิล <b>${esc(k.name)}</b> พลัง ${k.power} · ${k.cost} มานา · ${esc(k.text)}</small></div>`).join('')}
        <div>NP (ความสามารถ ไม่อยู่ในกองการ์ด): <b class="grail">${esc(def.np.name)}</b> <small>พลัง ${def.np.power} · ${def.np.cost} มานา · ${esc(def.np.text)}</small></div>
        <div><small class="muted">ใช้ได้ทุกการต่อสู้แทนการ์ด 1 ใบ แต่ใช้แล้วทุกคนรู้ชื่อจริงและพื้นที่ถนัด/ไม่ถนัด แล้วพลัง −2 จนกว่าจะตาย</small></div>
        <div class="secret-box">🔒 ถนัด ${AREAS[def.favored].name} (+2) · ไม่ถนัด ${AREAS[def.unfavored].name} (−2)</div>
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

  askCatalyst(choices) {
    return new Promise((resolve) => {
      const sh = this.modal(`<h2>วัตถุเชื่อมโยง</h2><p>Servant ของคุณถูกกำจัด ${esc(DAY.catalyst[0])}</p>
        <p class="muted">ควรเลือกเมื่อ: ${esc(DAY.catalyst[1])}</p>
        <div class="grid">${choices.map((k) => {
          const d = SERVANTS[k];
          return `<button data-k="${k}" class="pick-sv"><img src="${art(d.cls)}" alt=""><b>${esc(d.name)}</b><small>${d.cls}${d.alter ? ' · Alter' : ''}</small>
            <small class="desc">ถนัด ${AREAS[d.favored].short} · ไม่ถนัด ${AREAS[d.unfavored].short} · NP ${esc(d.np.name)}</small></button>`;
        }).join('')}</div>`);
      sh.querySelectorAll('[data-k]').forEach((b) => b.onclick = () => { this.closeModal(); resolve(b.dataset.k); });
    });
  }

  showGameOver() {
    const g = this.game, me = this.me;
    clearInterval(this.timer);
    this.mode = null;
    this.setChoice('');
    const rank = g.ranking.indexOf(me) + 1;
    return new Promise((resolve) => {
      const rows = g.ranking.map((x, i) => `<li class="${x === me ? 'me' : ''}">${portrait(x.servant?.cls, 'sm')}<b>#${i + 1} ${esc(x.name)}</b>
        <span>${x.servant ? `${esc(x.servant.def.name)} (${x.servant.cls})` : 'ตกรอบ'} · มานา ${x.mana} · กำจัด ${x.kills}${x === g.grail.holder ? ' ✦' : ''}</span></li>`).join('');
      const sh = this.modal(`<h2>${g.winner === me ? '🏆 คุณคว้าจอกศักดิ์สิทธิ์!' : `จบสงคราม · คุณได้อันดับ ${rank}`}</h2>
        <p>ผู้ชนะ: <b>${esc(g.winner.name)}</b> ${g.grail.holder === g.winner ? '(ถือจอกศักดิ์สิทธิ์)' : '(มานามากที่สุด เพราะไม่มีใครถือจอก)'}</p>
        <ol class="ranking">${rows}</ol>
        <button class="primary" id="again">เล่นอีกครั้ง</button>`);
      sh.querySelector('#again').onclick = () => { this.closeModal(); resolve(true); };
    });
  }
}
