// DOM front end for design v1.3. Renders the HUD from game state and answers
// the human's decisions by returning Promises that resolve when the player
// clicks (or the timer runs out). Night fights are replayed in the battle scene.

import {
  AREAS, AREA_KEYS, FIELDS, SAFE_AREAS, SERVANTS, TYPES, DAILY, ITEMS, QUESTS,
  MANA_MAX, DEATHS_FOR_GRAIL, SEAL_MAX, HAND_SIZE, ITEM_MAX, QUEST_DEPOSIT, MONSTER_BASE,
} from './data.js';
import { LAST_DAY } from './engine.js';
import { chooseCards } from './bot.js';
import { CLASS_ART, CLASS_COLOR } from './portraits.js';

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

// one Servant card as a small tile
function cardTile(c, { sel = false, off = false, back = false, attrs = '', extra = '', cost = c.cost } = {}) {
  const t = TYPES[c.type];
  if (back) return `<div class="gcard back"><span>?</span></div>`;
  return `<button class="gcard k-${c.kind} ${sel ? 'sel' : ''} ${extra}" style="--tc:${t.color}" ${off ? 'disabled' : ''} ${attrs}
    title="${esc(c.name)}${t.th ? ` (${t.th})` : ''} · พลัง ${c.power} · ${cost} มานา${c.text ? ' · ' + esc(c.text) : ''}">
    <i class="gc-type">${t.icon}</i><b class="gc-pow">${c.power}</b><em class="gc-cost">${cost ? cost + '◈' : 'ฟรี'}</em>
    <span class="gc-name">${esc(c.name)}</span>${c.text ? `<small>${esc(c.text)}</small>` : ''}</button>`;
}

export class UI {
  constructor() {
    this.game = null;
    this.fast = false;
    this.mode = null;
    this.sel = {};
    $('#logbtn').onclick = () => { $('#logdrawer').hidden = !$('#logdrawer').hidden; };
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
    $('#banner').innerHTML = `<div class="phase-title">${g.half === 'night' ? `☾ กลางคืน ${g.nightNo}/2` : '☀ กลางวัน'} · วันที่ ${g.day}/${LAST_DAY} · ${this.stageName()}</div>
      <div class="pill">${pill}</div>
      ${sit ? `<div class="sit"><span class="pill-tag warn">อีเวนต์วันนี้</span> <b>${esc(sit.name)}</b> <small>${esc(sit.text)}${g.shadowArea ? ` · ที่${AREAS[g.shadowArea].name}` : ''}</small></div>` : ''}`;
  }

  renderStatus() {
    const pl = this.me, g = this.game;
    const s = pl.servant;
    const stat = (icon, cls, v, max) => `<div class="stat ${cls}"><i>${icon}</i><b>${v}</b>${max != null ? `<small>/${max}</small>` : ''}</div>`;
    $('#status').innerHTML = `<div class="hud-tag">STATUS</div>
      <div class="stat-grid">
        ${stat('❤', 'hp', s ? Math.max(0, s.hp) : 0, s ? s.maxHp : 0)}
        ${stat('◈', 'mana', pl.mana, MANA_MAX)}
        ${stat('◆', 'seal', pl.seals, SEAL_MAX)}
        ${stat('▤', 'card', pl.hand.length, Math.max(HAND_SIZE, g.handSize()))}
        ${stat('☠', 'death', g.deaths, DEATHS_FOR_GRAIL)}
        <div class="stat box">เหลือ<br><b>${g.alive().length}/8</b> มาสเตอร์</div>
      </div>`;
  }

  renderSecret() {
    const me = this.me, g = this.game;
    const s = me.servant;
    if (!s) { $('#secret').innerHTML = `<div class="hud-tag">SECRET</div><p class="muted">${me.out ? 'คุณตกรอบแล้ว' : ''}</p>`; return; }
    const def = s.def;
    const q = me.quest;
    const flags = FIELDS.filter((f) => g.flags[f] === me.id).map((f) => AREAS[f].short);
    $('#secret').innerHTML = `<div class="hud-tag">SECRET · เห็นเฉพาะคุณ</div>
      <div class="sec-row"><span class="tag good">ถนัด</span> ${AREAS[def.favored].name} <small>พลัง +2</small></div>
      <div class="sec-row"><span class="tag bad">ไม่ถนัด</span> ${AREAS[def.unfavored].name} <small>พลัง −2</small></div>
      ${flags.length ? `<div class="sec-row"><span class="tag warn">⚑ ธง</span> ${flags.join(', ')} <small>อยู่ต่อคืนหน้า +3</small></div>` : ''}
      ${q ? `<div class="sec-row"><span class="tag warn">เควส</span> ${esc(QUESTS[q.key].name)} ${q.progress}/${QUESTS[q.key].need} <small>ภายในวันที่ ${q.until}</small></div>` : ''}
      <div class="sec-row muted">${s.revealed ? '⚠ ชื่อจริงถูกเปิดเผยแล้ว พลัง −2 ทุกการต่อสู้' : 'ชื่อจริงยังเป็นความลับ คนอื่นเห็นแค่คลาส'} · กองจั่ว ${me.deck.length} · กองทิ้ง ${me.discard.length}</div>`;
  }

  renderItems() {
    const me = this.me;
    const hand = this.game.playable(me);
    const handHtml = hand.length ? hand.map((c) => cardTile(c, { attrs: 'tabindex="-1"', cost: this.game.cardCost(c) })).join('') : '<p class="muted">ไม่มีการ์ดในมือ</p>';
    const items = me.items.length
      ? me.items.map((k) => `<li title="${esc(ITEMS[k].text)}"><b>${esc(ITEMS[k].name)}</b><small>${esc(ITEMS[k].text)}</small></li>`).join('')
      : '<li class="muted">ยังไม่มีไอเท็ม · ได้จากการ์ดอีเวนต์หรือปราบมอนสเตอร์</li>';
    $('#items').innerHTML = `<div class="hud-tag">HAND ${me.hand.length}/${Math.max(HAND_SIZE, this.game.handSize())}${me.npSide ? ' + NP' : ''}</div>
      <div class="hand mini">${handHtml}</div>
      <div class="hud-tag" style="margin-top:8px">ITEMS ${me.items.length}/${ITEM_MAX}</div><ul class="items">${items}</ul>`;
  }

  renderCard() {
    const s = this.me.servant;
    if (!s) { $('#charcard').innerHTML = ''; return; }
    const def = s.def;
    const skills = def.skills.map((k) => `<li title="${esc(k.text)}"><b>${esc(k.name)}</b><em>พลัง ${k.power} · ${k.cost}◈</em></li>`).join('');
    $('#charcard').innerHTML = `<div class="ccard cls-${s.cls}" style="--cc:${CLASS_COLOR[s.cls]}">
      <div class="cc-art" style="background-image:url('${art(s.cls)}')">
        <span class="cc-cls">${s.cls}</span>
        <span class="cc-stats">HP ${s.maxHp}${def.godHand ? ' · God Hand' : ''}${def.nameless ? ' · ไร้นาม' : ''}</span>
      </div>
      <div class="cc-body">
        <div class="cc-name">${esc(def.name)}</div>
        ${bar(Math.max(0, s.hp), s.maxHp, 'hp')}
        <ul class="cc-moves">
          ${skills}
          <li class="np" title="${esc(def.np.text)}"><b>NP · ${esc(def.np.name)}</b><em>พลัง ${def.np.power} · ${def.np.cost}◈</em></li>
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
      return `<button class="anode ${closed ? 'closed' : ''} ${sel ? 'sel' : ''} ${mine ? 'mine' : ''}" data-area="${a}" style="grid-area:${a}" ${closed || !choosing ? 'tabindex="-1"' : ''}>
        <div class="an-name">${AREAS[a].name}</div>
        <div class="an-flags">${fav}${cap}${flag}${grailHere ? '<i class="mk grail">✦ จอก</i>' : ''}${monster}${fight ? '<i class="mk fight">⚔</i>' : ''}</div>
        ${ev}
        <div class="tokens">${tokens}</div>
      </button>`;
    }).join('');
    $('#stage').innerHTML = `<div class="ring map ${night ? 'night' : 'day'}">
      <div class="ring-core" style="grid-area:core"><div class="moon">${night ? '☾' : '☀'}</div><b>ฟุยุกิ</b></div>
      ${nodes}</div>`;
    $('#stage').querySelectorAll('.anode').forEach((b) => b.addEventListener('click', () => {
      if (this.mode !== 'day' || b.classList.contains('closed')) return;
      if (g.grail.holder === me && !FIELDS.includes(b.dataset.area)) return;
      this.pickArea(b.dataset.area);
    }));
  }

  playerStatus(x) {
    const g = this.game;
    if (x.out) return 'ตกรอบ';
    if (x.resting && g.half === 'night') return 'พักฟื้น';
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
          <div class="pr-sv">${esc(label)}${known ? ` <small class="bad" title="ถนัด ${AREAS[s.def.favored].name} · ไม่ถนัด ${AREAS[s.def.unfavored].name}">รู้ชื่อจริง</small>` : ''}</div>
          ${s ? bar(Math.max(0, s.hp), s.maxHp, 'hp small', false) : ''}
          <div class="pr-meta">${x === me ? seals(x.seals) : hiddenSeals} · ◈ ${x.mana} · ไอเท็ม ${x.items.length}${flags ? ` · ${flags}` : ''}</div>
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

  renderDayChoice() {
    const g = this.game, me = this.me;
    const holder = g.grail.holder === me;
    const def = me.servant.def;
    const rows = AREA_KEYS.map((a) => {
      const closed = !g.areaOpen(a) || (holder && !FIELDS.includes(a));
      const tag = def.favored === a ? '<i class="mk good">ถนัด</i>' : def.unfavored === a ? '<i class="mk bad">ไม่ถนัด</i>' : '';
      const cap = FIELDS.includes(a) ? 'ไม่จำกัดคน' : `รับ ${g.capOf(a)} คน · ${a === 'church' ? 'Seal น้อยสุดได้ก่อน' : 'มานาน้อยสุดได้ก่อน'}`;
      const flag = g.flags[a] === me.id ? '<i class="mk warn">⚑ ธงของคุณ +3</i>' : '';
      const grail = g.grail.appeared && !g.grail.holder && g.grail.area === a ? '<i class="mk grail">✦ จอก</i>' : '';
      const text = a === 'mansion' ? `หลอมการ์ด: ทิ้ง 1–2 ใบ ใบละ +${g.forgeMana()} มานา แล้วจั่วใหม่` : AREAS[a].day;
      return `<button class="arow ${this.sel.area === a ? 'sel' : ''}" data-area="${a}" ${closed ? 'disabled' : ''}>
        <b>${AREAS[a].name}</b> ${tag}${flag}${grail}${closed ? '<i class="mk">ปิด</i>' : ''}
        <span>${esc(text)}</span><small class="cap">${cap}</small></button>`;
    }).join('');
    const fields = g.cap.fields;
    const needBackup = this.sel.area && !FIELDS.includes(this.sel.area);
    const backup = needBackup && fields.length > 1 ? `<div class="sub"><small>ถ้าเต็ม ไปสนามรบสำรอง:</small>
      <div class="seg">${fields.map((f) => `<button data-backup="${f}" class="${this.sel.backup === f ? 'on' : ''}">${AREAS[f].name}</button>`).join('')}</div></div>` : '';
    let church = '';
    if (this.sel.area === 'church') {
      const price = g.offerPrice();
      const ch = this.sel.church;
      const quests = g.quests.map((k) => {
        const off = me.quest || me.mana < QUEST_DEPOSIT || (k === 'offering' && (me.items.length < 2 || me.seals >= SEAL_MAX));
        return `<button class="small ${ch.type === 'quest' && ch.quest === k ? 'on' : ''}" data-quest="${k}" ${off ? 'disabled' : ''}>เควส: ${esc(QUESTS[k].name)}<small>${esc(QUESTS[k].text)}</small></button>`;
      }).join('');
      church = `<div class="sub"><small>ทำอะไรที่โบสถ์ (ทำได้ 1 อย่าง)</small><div class="tools col">
        <button class="small ${ch.type === 'offer' ? 'on' : ''}" data-offer="1" ${me.mana < price || me.seals >= SEAL_MAX ? 'disabled' : ''}>ถวายมานา ${price} → Command Seal +1</button>
        ${quests}</div><small class="muted">รับเควสวางมัดจำ ${QUEST_DEPOSIT} มานา (ได้คืนเมื่อสำเร็จ) · ถ้าเข้าโบสถ์ไม่ได้ ไปสนามรบสำรอง</small></div>`;
    }
    let forge = '';
    if (this.sel.area === 'mansion') {
      const melt = me.hand.filter((c) => c.kind !== 'np');
      forge = `<div class="sub"><small>เลือกการ์ดที่จะหลอม 1–2 ใบ (ใบละ +${g.forgeMana()} มานา แล้วจั่วใหม่)</small>
        <div class="hand">${melt.map((c) => {
          const on = this.sel.forge.includes(c.id);
          return cardTile(c, { sel: on, off: !on && this.sel.forge.length >= 2, attrs: `data-forge="${c.id}"`, cost: g.cardCost(c) });
        }).join('')}</div></div>`;
    }
    const dayItems = [...new Set(me.items)].filter((k) => g.dayItemUsable(me, k));
    const itemBtns = dayItems.map((k) => `<button class="small" data-item="${k}" title="${esc(ITEMS[k].text)}">ใช้ ${esc(ITEMS[k].name)}</button>`).join('');
    const unknown = g.alive().filter((x) => x !== me && !g.knowsName(me, x));
    const heroPick = this.sel.hero ? `<p class="note">บันทึกวีรชน: เลือกเป้าหมาย</p><div class="tools">${unknown.map((x) =>
      `<button class="small" data-hero="${x.id}">${esc(x.name)} (${x.servant.cls})</button>`).join('')}</div>` : '';
    this.setChoice(`
      <div class="hud-tag">กลางวัน · เลือกพื้นที่</div>
      <p class="note">ทุกคนเลือกพร้อมกันแบบลับ แล้วเปิดเผยพร้อมกัน · อยู่สนามรบตั้งแต่กลางวัน = ตั้งหลัก +1 คืนนี้${holder ? ' · <b class="grail">คุณถือจอก: ไปได้แค่สนามรบ</b>' : ''}</p>
      <div class="arows">${rows}</div>
      ${backup}${church}${forge}
      ${g.canSealHeal(me) || itemBtns ? `<div class="tools">${g.canSealHeal(me) ? '<button class="small seal" data-seal="heal">◆ Command Seal: รักษา! (50%)</button>' : ''}${itemBtns}</div>` : ''}
      ${heroPick}
      <div class="confirm-row">
        ${this.timerHtml()}
        <button class="primary" id="go" ${this.sel.area ? '' : 'disabled'}>ยืนยัน${this.sel.area ? ` · ${AREAS[this.sel.area].short}` : ''}</button>
      </div>`);
    const el = $('#choice');
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
        const here = g.alive().filter((x) => x !== me && x.area === me.area);
        const why = !opts.move.length
          ? (g.daily.fog ? 'หมอกหนา: ย้ายแบบจ่ายมานาไม่ได้ทั้งวัน' : g.tiedDown(me) ? `ติดพัน: มีคนอยู่พื้นที่เดียวกันตั้งแต่${g.nightNo === 2 ? 'จบกลางคืน 1' : 'กลางวัน'} ย้ายแบบจ่ายมานาไม่ได้` : me.mana < g.moveCost() ? `มานาไม่พอย้าย (ต้องใช้ ${g.moveCost()})` : '')
          : '';
        const hasScroll = me.items.includes('scroll');
        const opt = (type, to, label, sub, off = false) => `<button class="arow ${this.sel.type === type && this.sel.to === to ? 'sel' : ''}" data-type="${type}" data-to="${to ?? ''}" ${off ? 'disabled' : ''}><b>${label}</b><span>${sub}</span></button>`;
        const rows = [
          opt('stay', null, `อยู่ที่${AREAS[me.area].name}`, FIELDS.includes(me.area) ? (g.flags[me.area] === me.id ? 'ธง +3' : 'ตั้งหลัก +1') : 'ไม่เสียอะไร'),
          ...opts.move.map((f) => opt('move', f, `ย้ายไป${AREAS[f].name}`, `${g.moveCost() ? `−${g.moveCost()} มานา` : 'ฟรี (ลมสงบ)'} · บุกเข้าไป ไม่มีโบนัสพื้นที่`)),
          ...(here.length || !opts.move.length ? opts.escape : []).map((a) => opt('escape', a, `"หนี!" ไป${AREAS[a].name}`, hasScroll && (this.sel.scroll || me.seals <= 0) ? 'ใช้ม้วนคาถา' : '−1 Command Seal')),
        ].join('');
        const view = opts.view.length ? `<div class="sub"><small>โบสถ์: ดูมือของ 1 คนตอนเริ่มลงการ์ด</small><div class="tools">${opts.view.map((id) =>
          `<button class="small ${this.sel.view === id ? 'on' : ''}" data-view="${id}">${esc(g.players[id].name)}</button>`).join('')}</div></div>` : '';
        const daySum = this.dayLines().map((e) => `<div class="l ${e.cls}">${fmt(e.text)}</div>`).join('');
        this.setChoice(`
          <div class="hud-tag">กลางคืน ${g.nightNo}/2 · ย้ายพื้นที่</div>
          ${daySum ? `<div class="summary small">${daySum}</div>` : ''}
          <p class="note">${here.length ? `อยู่ด้วยกัน: ${here.map((x) => `${esc(x.name)} [${esc(g.servantLabel(me, x))}]`).join(', ')}` : 'ตอนนี้คุณอยู่คนเดียว'}${why ? ` · ${why}` : ''}</p>
          <div class="arows">${rows}</div>
          ${hasScroll && me.seals > 0 && opts.escape.length ? `<label class="tog ${this.sel.scroll ? 'on' : ''}"><input type="checkbox" id="scroll" ${this.sel.scroll ? 'checked' : ''}> ใช้ม้วนคาถาแทน Command Seal</label>` : ''}
          ${view}
          <div class="confirm-row">${this.timerHtml()}<button class="primary" id="go">ยืนยัน</button></div>`);
        const el = $('#choice');
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
        const chosen = this.sel.cards.map((id) => cards.find((c) => c.id === id));
        const spent = chosen.reduce((a, c) => a + g.cardCost(c), 0);
        const foes = fight.players.filter((x) => x !== me).map((x) => `<span class="foe">${portrait(x.servant.cls, 'xs')} <b>${esc(x.name)}</b> ${esc(g.servantLabel(me, x))} · HP ${Math.max(0, x.servant.hp)}/${x.servant.maxHp}</span>`);
        if (fight.monster) foes.push(`<span class="foe">👁 <b>มอนสเตอร์</b> ${MONSTER_BASE}+1d6</span>`);
        const hand = cards.map((c) => {
          const on = this.sel.cards.includes(c.id);
          const off = !on && (this.sel.cards.length >= 2 || spent + g.cardCost(c) > me.mana);
          return cardTile(c, { sel: on, off, attrs: `data-card="${c.id}"`, cost: g.cardCost(c) });
        }).join('');
        const fightItems = [...new Set(me.items)].filter((k) => ITEMS[k].phase.includes('fight'));
        const sealsLeft = me.seals - (this.sel.boost ? 1 : 0) - (this.sel.sealHeal ? 1 : 0);
        const parts = [...g.cardParts(chosen), ...g.fixedParts(me, fight.area)];
        if (this.sel.boost) parts.push({ label: 'เพิ่มพลัง!', v: 4 });
        if (this.sel.items.includes('gem')) parts.push({ label: 'อัญมณี', v: 4 });
        const sum = parts.reduce((a, p) => a + p.v, 0);
        const dice = 1 + g.extraDice(me, chosen, this.sel.items);
        const partText = parts.filter((p) => p.v).map((p) => `${esc(p.label)} ${p.v > 0 ? '+' : ''}${p.v}`).join(' · ');
        this.setChoice(`
          <div class="hud-tag">ลงการ์ด · ${AREAS[fight.area].name}</div>
          <div class="foes">${foes.join('')}</div>
          ${me.peek ? `<p class="note">โบสถ์: มือของ ${esc(me.peek.name)} คือ ${esc(me.peek.cards.join(', '))}</p>` : ''}
          <p class="note">เลือกการ์ดได้ 2 ใบ (มานา ${me.mana}) · ทุกคนเปิดพร้อมกัน พลังรวมสูงสุดชนะ</p>
          <div class="hand">${hand || '<p class="muted">ไม่มีการ์ดในมือ</p>'}</div>
          <div class="tools">
            ${me.seals > 0 ? `<label class="tog ${this.sel.boost ? 'on' : ''}"><input type="checkbox" id="boost" ${this.sel.boost ? 'checked' : ''} ${!this.sel.boost && sealsLeft < 1 ? 'disabled' : ''}> ◆ เพิ่มพลัง! <small>+4</small></label>` : ''}
            ${g.canSealHeal(me) ? `<label class="tog ${this.sel.sealHeal ? 'on' : ''}"><input type="checkbox" id="sh" ${this.sel.sealHeal ? 'checked' : ''} ${!this.sel.sealHeal && sealsLeft < 1 ? 'disabled' : ''}> ◆ รักษา! <small>50%</small></label>` : ''}
            ${fightItems.map((k) => `<button class="small ${this.sel.items.includes(k) ? 'on' : ''}" data-item="${k}" title="${esc(ITEMS[k].text)}">${esc(ITEMS[k].name)}</button>`).join('')}
          </div>
          <div class="preview">พลังรวม <b>${sum}</b> + ${dice > 1 ? `ทอย ${dice} ลูกเอาสูงสุด` : 'ลูกเต๋า 1d6'} <small>${partText || 'ยังไม่ได้เลือกการ์ด'} · ใช้มานา ${spent}</small></div>
          <div class="confirm-row">${this.timerHtml()}<button class="primary" id="go">ลงการ์ด ${this.sel.cards.length}/2</button></div>`);
        const el = $('#choice');
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
        $('#go').onclick = () => done({ ...this.sel });
      };
      draw();
    });
  }

  // ---------- ④ night results ----------
  async showNight(results) {
    const g = this.game, me = this.me;
    if (me.out && this.fast) return null;
    const mine = results.find((r) => r.entries.some((e) => e.id === me.id));
    const order = mine ? [mine, ...results.filter((r) => r !== mine)] : results;
    if (order.length) await this.playFights(order);
    const lines = g.logs.filter((e) => e.day === g.day && e.half === 'night' && e.night === g.nightNo && e.cls !== 'phase'
      && (e.to ? e.to.includes(me.id) : /☠|✦|✸|✖|⚔|ได้รางวัล|ยึด|คนเดียว|หนี|ย้าย|ม้วน/.test(e.text)));
    this.renderAll();
    const box = (l) => `<div class="summary">${l.map((e) => `<div class="l ${e.cls}">${fmt(e.text)}</div>`).join('') || '<div class="muted">คืนนี้เงียบสงบ</div>'}</div>`;
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
      this.setChoice(`<div class="hud-tag">สรุปคืนวันที่ ${g.day} · ${g.nightNo}/2</div>${box(lines)}
        <button class="primary wide" id="nx">${next}</button>`);
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
    $('#battle .bt-log').innerHTML = res.entries.filter((e) => e.died).map((e) => `<div class="l death">☠ Servant ของ ${esc(e.name)} ถูกกำจัด</div>`).join('')
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
        <p class="muted">เดโมออฟไลน์ (กติกา v1.3): คุณ 1 คน ปะทะบอท 7 ตัว · 8 วัน วันละ 1 กลางวัน + 2 กลางคืน</p>
        <ul class="rules">
          <li>ทุกเช้าเปิด <b>อีเวนต์ประจำวัน</b> มีผลทั้งวัน เช่น "วันแห่ง Arts" การ์ดเวท +1</li>
          <li><b>กลางวัน</b> ทุกคนเลือกพื้นที่พร้อมกัน: <b>วัดริวโด</b> (มานา) · <b>มิยามะ / ชินโตะ</b> (สนามรบ) · <b>โบสถ์</b> (Command Seal 5 มานา, เควส) · <b>คฤหาสน์โทซากะ</b> (หลอมการ์ดเป็นมานา)</li>
          <li><b>กลางคืน 2 รอบ</b> แต่ละรอบย้ายได้ถ้าไม่มีใครอยู่ด้วย แล้วคนที่อยู่พื้นที่เดียวกัน <b>ลงการ์ด 2 ใบ + ทอย 1d6</b> พร้อมกัน พลังรวมสูงสุดชนะ</li>
          <li>ผู้แพ้เสีย HP เท่าส่วนต่าง · อยู่สนามรบตั้งแต่กลางวัน = <b>ตั้งหลัก +1</b> · ชนะแล้วได้ <b>ธง +3</b> ถ้าอยู่ต่อ</li>
          <li><b>Noble Phantasm</b> แรงที่สุด แต่ <b>ชื่อจริงถูกเปิด</b> พลัง −2 ทุกการต่อสู้ต่อจากนั้น</li>
          <li>Servant ตาย → ใช้ <b>Command Seal</b> อัญเชิญใหม่อัตโนมัติ (ตายกลางคืน 1 พักฟื้นถึงเช้า) · หมด Seal = ตกรอบ · คนอื่นไม่รู้ว่าคุณเหลือกี่ดวง</li>
          <li>ตายรวม 7 ครั้งหรือถึงวันที่ 8 → <b>จอกศักดิ์สิทธิ์</b> ปรากฏบนสนามรบ · ถือจอกตอนจบชนะ</li>
        </ul>
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
        <div class="sv-head"><span class="badge" style="background:${CLASS_COLOR[s.cls]}">${s.cls}</span> <b>${esc(def.name)}</b></div>
        <div class="muted">HP ${s.maxHp} · เด็ค 13 ใบ: โจมตี 10 · สกิล 2 · NP 1</div>
        ${def.skills.map((k) => `<div><small>สกิล <b>${esc(k.name)}</b> พลัง ${k.power} · ${k.cost} มานา · ${esc(k.text)}</small></div>`).join('')}
        <div>NP: <b class="grail">${esc(def.np.name)}</b> <small>พลัง ${def.np.power} · ${def.np.cost} มานา · ${esc(def.np.text)}</small></div>
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
      const sh = this.modal(`<h2>วัตถุเชื่อมโยง</h2><p>Servant ของคุณถูกกำจัด เลือก Servant ที่จะอัญเชิญใหม่</p>
        <div class="grid">${choices.map((k) => `<button data-k="${k}" class="pick-sv"><img src="${art(SERVANTS[k].cls)}" alt=""><b>${esc(SERVANTS[k].name)}</b><small>${SERVANTS[k].cls}</small></button>`).join('')}</div>`);
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
