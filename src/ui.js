// DOM front end. Renders the HUD from game state and answers the human's
// decisions by returning Promises that resolve when the player clicks.
// Fights the human is in are replayed line by line in the battle scene.

import { AREAS, AREA_KEYS, CLASSES, SERVANTS, CARDS, MANA_MAX, DEATHS_FOR_GRAIL, SEAL_MAX } from './data.js';
import { CLASS_ART, CLASS_COLOR } from './portraits.js';

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CHOICE_SECONDS = 30;
const PLAYER_COLORS = ['#5b8def', '#e0c341', '#e0565b', '#5ec48a', '#f08a3c', '#a77be8', '#c98a5a', '#8d93a6'];
// ring positions (percent) for the five areas on the stage
const RING = AREA_KEYS.map((_, i) => {
  const ang = (-90 + i * 72) * Math.PI / 180;
  return { x: 50 + 38 * Math.cos(ang), y: 50 + 38 * Math.sin(ang) };
});

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
const art = (cls) => (cls && CLASS_ART[cls]) || '';
const portrait = (cls, size = '') => cls
  ? `<img class="pt ${size}" src="${art(cls)}" alt="${cls}">`
  : `<span class="pt ${size} empty">?</span>`;

export class UI {
  constructor() {
    this.game = null;
    this.revealed = false;
    this.sel = { area: null, stance: 'gather' };
    this.fast = false;
    this.mode = null;
    this.battle = null;
    $('#logbtn').onclick = () => { $('#logdrawer').hidden = !$('#logdrawer').hidden; };
  }

  attach(game) {
    this.game = game;
    this.revealed = false;
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
      case 'phase': this.revealed = false; this.renderAll(); break;
      case 'reveal': this.revealed = true; this.renderAll(); break;
      case 'combatStart': this.openBattle(e.view); break;
      case 'combatRound': this.queueBattle(e.view); break;
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
    for (let p = 0; p < 16; p++) {
      const h = g.history[p];
      const icons = [];
      if (h?.grail || (p === g.p && g.grail.appearedAt === p)) icons.push('<i class="ic grail">✦</i>');
      if (h?.deaths) icons.push(`<i class="ic death">☠${h.deaths > 1 ? h.deaths : ''}</i>`);
      if (h?.closing) icons.push('<i class="ic warn">▲</i>');
      if (g.grail.appeared && p === g.grail.endP) icons.push('<i class="ic end">★</i>');
      const state = p < g.p ? 'past' : p === g.p ? 'now' : 'future';
      nodes.push(`<div class="node ${state} ${p % 2 ? 'night' : 'day'}">
        <div class="icons">${icons.join('')}</div><b></b>${p % 2 === 0 ? `<small>${p / 2 + 1}</small>` : '<small></small>'}</div>`);
    }
    $('#daytrack').innerHTML = `<div class="hud-tag">DAY</div><div class="track">${nodes.join('')}</div>`;
  }

  renderBanner() {
    const g = this.game;
    const stage = { area: 'เลือกพื้นที่', encounter: 'เผชิญหน้า', phaseEnd: 'สรุปเฟส' }[this.mode] || (this.revealed ? 'เปิดเผย' : 'เตรียมตัว');
    let pill;
    if (g.grail.appeared) {
      const where = g.grail.holder ? `${esc(g.grail.holder.name)} ถือจอก` : `อยู่ที่${AREAS[g.grail.area].name}`;
      pill = `<span class="pill-tag">HOLY GRAIL</span><b>จอกศักดิ์สิทธิ์</b> ${where} · เหลือ ${Math.max(0, g.grail.endP - g.p + 1)} เฟส`;
    } else if (g.closingNext.length) {
      pill = `<span class="pill-tag warn">BARRIER</span><b>เขตแดนหด</b> ${g.closingNext.map((a) => AREAS[a].name).join(', ')} จะปิดเฟสหน้า`;
    } else {
      pill = `<span class="pill-tag">WAR</span><b>ตายรวม ${g.deaths}/${DEATHS_FOR_GRAIL}</b> ครบแล้วจอกศักดิ์สิทธิ์ปรากฏ`;
    }
    $('#banner').innerHTML = `<div class="phase-title">${g.night ? '☾ กลางคืน' : '☀ กลางวัน'} · วันที่ ${g.day} · ${stage}</div>
      <div class="pill">${pill}</div>`;
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
        ${stat('▤', 'card', pl.cards.length, 3)}
        ${stat('☠', 'death', g.deaths, DEATHS_FOR_GRAIL)}
        <div class="stat box">เหลือ<br><b>${g.alive().length}/8</b> มาสเตอร์</div>
      </div>`;
  }

  renderSecret() {
    const s = this.me.servant;
    if (!s) { $('#secret').innerHTML = `<div class="hud-tag">SECRET</div><p class="muted">${this.me.out ? 'คุณตกรอบแล้ว' : ''}</p>`; return; }
    const def = s.def;
    $('#secret').innerHTML = `<div class="hud-tag">SECRET · เห็นเฉพาะคุณ</div>
      <div class="sec-row"><span class="tag good">ถนัด</span> ${AREAS[def.favored].name} <small>+1/ลูกเต๋า · มานา +1</small></div>
      <div class="sec-row"><span class="tag bad">ไม่ถนัด</span> ${AREAS[def.unfavored].name} <small>−1/ลูกเต๋า</small></div>
      <div class="sec-row"><span class="tag warn">จุดอ่อน</span> ${esc(def.weakness)}</div>
      <div class="sec-row muted">${s.revealed ? '⚠ ชื่อจริงถูกเปิดเผยแล้ว ทุกคนรู้ข้อมูลนี้' : 'ชื่อจริงยังเป็นความลับ คนอื่นเห็นแค่คลาส'}</div>`;
  }

  renderItems() {
    const pl = this.me;
    const cards = pl.cards.length
      ? pl.cards.map((k) => `<li class="r-${CARDS[k].rarity}" title="${esc(CARDS[k].desc)}"><b>${esc(CARDS[k].name)}</b><small>${esc(CARDS[k].desc)}</small></li>`).join('')
      : '<li class="muted">ยังไม่มีการ์ด · ได้จากย่านชินโตะหรือชนะการต่อสู้</li>';
    $('#items').innerHTML = `<div class="hud-tag">ITEM CARDS ${pl.cards.length}/3</div><ul class="items">${cards}</ul>`;
  }

  renderCard() {
    const s = this.me.servant;
    if (!s) { $('#charcard').innerHTML = ''; return; }
    const def = s.def;
    const skills = def.skills.map((k) => `<li><b>${esc(k.name)}</b><em>${k.kind === 'passive' ? 'ติดตัว' : k.cost}</em></li>`).join('');
    $('#charcard').innerHTML = `<div class="ccard cls-${s.cls}" style="--cc:${CLASS_COLOR[s.cls]}">
      <div class="cc-art" style="background-image:url('${art(s.cls)}')">
        <span class="cc-cls">${s.cls}</span>
        <span class="cc-stats">ATK ${s.atk} · DEF ${s.def_} · AGI ${s.agi}</span>
      </div>
      <div class="cc-body">
        <div class="cc-name">${esc(def.name)}</div>
        ${bar(Math.max(0, s.hp), s.maxHp, 'hp')}
        <ul class="cc-moves">
          <li class="muted"><b>${esc(CLASSES[s.cls].passive)}</b></li>
          ${skills}
          <li class="np"><b>NP · ${esc(def.np.name)}</b><em>${def.np.cost}</em></li>
        </ul>
      </div>
    </div>`;
  }

  renderStage() {
    const g = this.game, me = this.me;
    const choosing = this.mode === 'area';
    const nodes = AREA_KEYS.map((a, i) => {
      const closed = !g.open.includes(a);
      const closing = g.closingNext.includes(a);
      const grailHere = g.grail.appeared && !g.grail.holder && g.grail.area === a;
      let people = [];
      if (this.revealed) {
        people = g.alive().filter((x) => x.area === a && x.servant && (!x.hidden || x === me || (x.area === me.area && g.visibleTo(me, x))));
      }
      const tokens = people.map((x) => `<span class="token ${x === me ? 'me' : ''} ${x.hidden ? 'hid' : ''} ${g.grail.holder === x ? 'holder' : ''}" style="--pc:${this.color(x)}" title="${esc(x.name)} · ${esc(g.servantLabel(me, x))}">
        ${portrait(x.servant.cls, 'xs')}<small>${esc(x.name)}</small></span>`).join('');
      const sel = choosing && this.sel.area === a;
      const mine = !choosing && !me.out && me.area === a && this.revealed;
      const fight = this.revealed && g.fightAreas.has(a);
      const fav = me.servant && me.servant.def.favored === a ? '<i class="mk good">ถนัด</i>' : me.servant && me.servant.def.unfavored === a ? '<i class="mk bad">ไม่ถนัด</i>' : '';
      return `<button class="anode ${closed ? 'closed' : ''} ${sel ? 'sel' : ''} ${mine ? 'mine' : ''}" data-area="${a}" style="left:${RING[i].x}%;top:${RING[i].y}%" ${closed || !choosing ? 'tabindex="-1"' : ''}>
        <div class="an-name">${AREAS[a].name}</div>
        <div class="an-flags">${fav}${closed ? '<i class="mk">ปิด</i>' : closing ? '<i class="mk warn">จะปิด</i>' : ''}${grailHere ? '<i class="mk grail">✦ จอก</i>' : ''}${fight ? '<i class="mk fight">⚔</i>' : ''}</div>
        <div class="tokens">${tokens}</div>
      </button>`;
    }).join('');
    $('#stage').innerHTML = `<div class="ring ${g.night ? 'night' : 'day'}">
      <div class="ring-core"><div class="moon">${g.night ? '☾' : '☀'}</div><b>ฟุยุกิ</b><small>เฟส ${g.p + 1}/16</small></div>
      ${nodes}</div>`;
    $('#stage').querySelectorAll('.anode').forEach((b) => b.addEventListener('click', () => {
      if (this.mode !== 'area' || b.classList.contains('closed')) return;
      this.sel.area = b.dataset.area;
      this.renderStage();
      this.renderAreaChoice();
    }));
  }

  playerStatus(x) {
    const g = this.game;
    if (x.out) return 'ตกรอบ';
    if (this.mode === 'area' || g.choosing) return x === this.me ? '<span class="hl">กำลังเลือก</span>' : 'เลือกแล้ว';
    if (!this.revealed || !x.area) return '';
    if (x !== this.me && x.hidden && !(x.area === this.me.area && g.visibleTo(this.me, x))) return 'ไม่พบตัว';
    return AREAS[x.area].short + (x.hidden ? ' (ซ่อน)' : '');
  }

  renderPlayers() {
    const g = this.game, me = this.me;
    const list = [me, ...g.players.filter((x) => x !== me)];
    const rows = list.map((x, i) => {
      const s = x.servant;
      const top = Object.entries(x.areaCounts).sort((a, b) => b[1] - a[1])[0];
      const seen = s && me.seen[s.uid] ? [...me.seen[s.uid]].join(', ') : '';
      const label = s ? g.servantLabel(me, x) : (x.out ? '—' : '...');
      return `<li class="prow ${x.out ? 'out' : ''} ${x === me ? 'me' : ''}" style="--pc:${this.color(x)}">
        <div class="pr-num">${i + 1}</div>
        ${portrait(s?.cls, 'sm')}
        <div class="pr-main">
          <div class="pr-name"><b>${esc(x.name)}</b>${x === me ? '<span class="you">คุณ</span>' : ''}${g.grail.holder === x ? '<span class="grail">✦</span>' : ''}</div>
          <div class="pr-sv">${esc(label)}${s && x !== me && g.knowsName(me, x) ? ` <small class="bad" title="${esc(s.def.weakness)}">รู้จุดอ่อน</small>` : ''}</div>
          ${s ? bar(Math.max(0, s.hp), s.maxHp, 'hp small', false) : ''}
          <div class="pr-meta">${x === me ? seals(x.seals) : '<span class="seals hidden" title="Command Seal ของคนอื่นเป็นความลับ">◆ ?</span>'} · ▤ ${x.cards.length}
            ${x !== me && top[1] ? ` · พบบ่อย ${AREAS[top[0]].short}` : ''}${seen ? ` · <span title="สกิลที่เคยเห็น">${esc(seen)}</span>` : ''}</div>
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

  // ================= decisions =================
  decide(g, pl, kind, ctx) {
    switch (kind) {
      case 'intro': return this.showIntro();
      case 'area': return this.askArea();
      case 'encounter': return this.askEncounter(ctx.targets);
      case 'combat': return this.askCombat(ctx);
      case 'combatEnd': return this.askCombatEnd(ctx.view);
      case 'summon': return this.askSummon();
      case 'catalyst': return this.askCatalyst(ctx.choices);
      case 'phaseEnd': return this.askPhaseEnd(ctx.label);
      default: return null;
    }
  }

  askArea() {
    const g = this.game, me = this.me;
    this.mode = 'area';
    this.sel = { area: g.open.includes(me.area) ? me.area : null, stance: 'gather' };
    this.deadline = Date.now() + CHOICE_SECONDS * 1000;
    this.renderAll();
    return new Promise((resolve) => {
      this.resolveArea = resolve;
      this.renderAreaChoice();
      clearInterval(this.timer);
      this.timer = setInterval(() => {
        const left = Math.max(0, Math.ceil((this.deadline - Date.now()) / 1000));
        const el = $('#timer');
        if (el) {
          el.querySelector('b').textContent = left;
          el.style.setProperty('--p', left / CHOICE_SECONDS);
        }
        // design: no choice in time = stay put (or a random open area) and gather
        if (left <= 0) this.confirmArea(true);
      }, 250);
    });
  }

  confirmArea(timeout = false) {
    if (!this.resolveArea) return;
    const g = this.game;
    clearInterval(this.timer);
    let { area, stance } = this.sel;
    if (!area) area = g.open.includes(this.me.area) ? this.me.area : g.pick(g.open);
    if (timeout) stance = 'gather';
    this.mode = null;
    this.setChoice('<div class="waiting">เปิดเผยตำแหน่ง…</div>');
    const r = this.resolveArea; this.resolveArea = null;
    r({ area, stance });
  }

  renderAreaChoice() {
    const g = this.game, me = this.me;
    const holder = g.grail.holder === me;
    const fieldCards = [...new Set(me.cards)].filter((c) => g.fieldCardUsable(me, c));
    const cardBtns = fieldCards.map((c) => `<button class="small" data-card="${c}" title="${esc(CARDS[c].desc)}">ใช้ ${esc(CARDS[c].name)}</button>`).join('');
    const unknown = g.alive().filter((x) => x !== me && !g.knowsName(me, x));
    const need = g.night ? 5 : 3;
    const hideBonus = (me.servant.cls === 'Assassin' ? 2 : 0) + (this.sel.area === 'forest' ? 1 : 0);
    const rows = AREA_KEYS.filter((a) => g.open.includes(a)).map((a) => {
      const def = me.servant.def;
      const tag = def.favored === a ? '<i class="mk good">ถนัด</i>' : def.unfavored === a ? '<i class="mk bad">ไม่ถนัด</i>' : '';
      return `<button class="arow ${this.sel.area === a ? 'sel' : ''}" data-area="${a}">
        <b>${AREAS[a].name}</b> ${tag}${g.closingNext.includes(a) ? '<i class="mk warn">จะปิด</i>' : ''}${g.grail.appeared && !g.grail.holder && g.grail.area === a ? '<i class="mk grail">✦ จอก</i>' : ''}
        <span>${AREAS[a].desc}</span></button>`;
    }).join('');
    const left = Math.max(0, Math.ceil((this.deadline - Date.now()) / 1000));
    this.setChoice(`
      <div class="hud-tag">เลือกสถานที่</div>
      <p class="note">ทุกคนเลือกพร้อมกันแบบลับ แล้วเปิดเผยพร้อมกัน · เจอใครในพื้นที่เดียวกันเลือกสู้หรือปล่อยผ่าน${g.night ? ' · กลางคืนมานา ×1.5' : ''}</p>
      <div class="arows">${rows}</div>
      <div class="seg">
        <button data-stance="gather" class="${this.sel.stance === 'gather' ? 'on' : ''}">เก็บของ<small>ได้ทรัพยากรเต็ม</small></button>
        <button data-stance="hide" class="${this.sel.stance === 'hide' ? 'on' : ''}" ${holder ? 'disabled' : ''}>ซ่อนตัว<small>${me.ward ? 'ศิลาเขตแดน: สำเร็จแน่นอน' : `ได้ครึ่งเดียว · d6${hideBonus ? '+' + hideBonus : ''} ≥ ${need}`}</small></button>
      </div>
      ${holder ? '<p class="note grail">คุณถือจอก: ซ่อนตัวไม่ได้ ทุกคนเห็นตำแหน่ง</p>' : ''}
      ${g.canSealHeal(me) || cardBtns ? `<div class="tools">${g.canSealHeal(me) ? '<button class="small seal" data-seal="heal">◆ Command Seal: รักษา! (60%)</button>' : ''}${cardBtns}</div>` : ''}
      <div id="hero-pick"></div>
      <div class="confirm-row">
        <div id="timer" class="timer" style="--p:${left / CHOICE_SECONDS}"><b>${left}</b></div>
        <button class="primary" id="go" ${this.sel.area ? '' : 'disabled'}>ยืนยัน${this.sel.area ? ` · ${AREAS[this.sel.area].short}` : ''}</button>
      </div>`);
    const el = $('#choice');
    el.querySelectorAll('[data-area]').forEach((b) => b.onclick = () => { this.sel.area = b.dataset.area; this.renderStage(); this.renderAreaChoice(); });
    el.querySelectorAll('[data-stance]').forEach((b) => b.onclick = () => { this.sel.stance = b.dataset.stance; this.renderAreaChoice(); });
    el.querySelectorAll('[data-seal]').forEach((b) => b.onclick = () => { g.sealHeal(me); this.renderAll(); this.renderAreaChoice(); });
    el.querySelectorAll('[data-card]').forEach((b) => b.onclick = () => {
      const c = b.dataset.card;
      if (c === 'hero_record') {
        $('#hero-pick').innerHTML = `<p class="note">บันทึกวีรชน: เลือกเป้าหมาย</p><div class="tools">` + unknown.map((x) =>
          `<button class="small" data-hero="${x.id}">${esc(x.name)} (${x.servant.cls})</button>`).join('') + '</div>';
        $('#hero-pick').querySelectorAll('[data-hero]').forEach((h) => h.onclick = () => {
          g.useFieldCard(me, 'hero_record', Number(h.dataset.hero));
          this.renderAll(); this.renderAreaChoice();
        });
        return;
      }
      g.useFieldCard(me, c);
      this.renderAll();
      this.renderAreaChoice();
    });
    $('#go').onclick = () => this.confirmArea();
  }

  askEncounter(targets) {
    const g = this.game, me = this.me;
    this.mode = 'encounter';
    this.renderBanner();
    return new Promise((resolve) => {
      const rows = targets.map((t) => {
        const s = t.servant;
        return `<div class="target">
          ${portrait(s.cls, 'sm')}
          <div class="t-main"><b>${esc(t.name)}</b> · ${esc(g.servantLabel(me, t))}${t.hidden ? ' <i class="mk">ซ่อนตัว</i>' : ''}${g.grail.holder === t ? ' <i class="mk grail">✦ ถือจอก</i>' : ''}
            ${bar(Math.max(0, s.hp), s.maxHp, 'hp small', false)}</div>
          <button class="danger" data-t="${t.id}">${me.hidden ? 'ซุ่มโจมตี' : 'โจมตี'}</button>
        </div>`;
      }).join('');
      const here = me.servant.def.favored === me.area ? 'ถนัด (+1/ลูก)' : me.servant.def.unfavored === me.area ? 'ไม่ถนัด (−1/ลูก)' : 'ปกติ';
      this.setChoice(`
        <div class="hud-tag">เผชิญหน้า · ${AREAS[me.area].name}</div>
        <p class="note">${me.hidden ? 'คุณซ่อนตัวอยู่ ถ้าโจมตีจะได้ลงมือก่อนในรอบแรก' : 'เลือกลับๆ ว่าจะโจมตีใคร หรือปล่อยผ่าน'} · มานา ${me.mana} · พื้นที่นี้สำหรับคุณ: ${here}</p>
        ${rows}
        <button class="primary wide" data-t="">ปล่อยผ่าน</button>`);
      $('#choice').querySelectorAll('[data-t]').forEach((b) => b.onclick = () => {
        this.mode = null;
        this.setChoice('<div class="waiting">รอผลการเผชิญหน้า…</div>');
        resolve(b.dataset.t === '' ? null : Number(b.dataset.t));
      });
    });
  }

  askPhaseEnd(label) {
    const g = this.game, me = this.me;
    if (me.out) {
      if (this.fast) return null;
      return new Promise((resolve) => {
        this.setChoice(`<div class="hud-tag">ตกรอบ</div><p class="note">ดูการต่อสู้ของมาสเตอร์ที่เหลือจนจบได้</p>
          <div class="confirm-row"><button id="nx">ดูเฟสถัดไป</button><button class="primary" id="ff">ข้ามไปดูผลตอนจบ</button></div>`);
        $('#ff').onclick = () => { this.fast = true; this.setChoice('<div class="waiting">กำลังจำลองจนจบ…</div>'); resolve(null); };
        $('#nx').onclick = () => resolve(null);
      });
    }
    this.mode = 'phaseEnd';
    this.renderBanner();
    const mine = g.logs.filter((e) => e.p === g.p && (e.to ? e.to.includes(me.id) : /☠|✦|✸|✖|ตกรอบ|⚠|หนี|กำจัด/.test(e.text)));
    return new Promise((resolve) => {
      this.setChoice(`<div class="hud-tag">สรุป${esc(label)}</div>
        <div class="summary">${mine.map((e) => `<div class="l ${e.cls}">${fmt(e.text)}</div>`).join('') || '<div class="muted">เฟสนี้เงียบสงบ</div>'}</div>
        <button class="primary wide" id="nx">เฟสถัดไป ›</button>`);
      $('#nx').onclick = () => { this.mode = null; this.setChoice(''); resolve(null); };
    });
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
        <p class="muted">เดโมออฟไลน์: คุณ 1 คน ปะทะบอท 7 ตัว · 8 วัน วันละ 2 เฟส</p>
        <ul class="rules">
          <li>แต่ละเฟสเลือก <b>พื้นที่</b> และท่าที <b>เก็บของ / ซ่อนตัว</b> แบบลับ แล้วเปิดเผยพร้อมกัน</li>
          <li>เจอใครในพื้นที่เดียวกัน เลือก <b>โจมตี</b> หรือ <b>ปล่อยผ่าน</b> · ต่อสู้ด้วย <b>มานา + ลูกเต๋า</b> สูงสุด 3 รอบ</li>
          <li><b>Noble Phantasm</b> แรงที่สุด แต่ใช้แล้ว <b>ชื่อจริงของ Servant ถูกเปิดเผย</b></li>
          <li>Servant ตาย → จ่าย <b>Command Seal</b> อัญเชิญใหม่ · หมด Seal = ตกรอบ · คนอื่นไม่รู้ว่าคุณเหลือกี่ดวง</li>
          <li>ตายรวม 7 ครั้งหรือถึงวันที่ 8 → <b>จอกศักดิ์สิทธิ์</b> ปรากฏ · คนที่ถือจอกตอนจบชนะ</li>
          <li>Servant มี <b>พื้นที่ถนัด/ไม่ถนัด</b> ที่มีแค่คุณรู้</li>
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
        <div class="muted">HP ${s.maxHp} · ATK ${s.atk} · DEF ${s.def_} · AGI ${s.agi}</div>
        <div>NP: <b class="grail">${esc(def.np.name)}</b> (${def.np.cost} มานา)</div>
        <div><small>${def.skills.map((k) => esc(k.name)).join(' · ')}</small></div>
        <div class="secret-box">🔒 ถนัด ${AREAS[def.favored].name} · ไม่ถนัด ${AREAS[def.unfavored].name}</div>
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

  askSummon() {
    return new Promise((resolve) => {
      const me = this.me;
      const sh = this.modal(`<h2>Servant ของคุณพ่ายแพ้</h2>
        <p>Command Seal เหลือ ${seals(me.seals)} อัญเชิญใหม่ต้องใช้ 1 ดวง</p>
        ${me.seals === 1 ? '<p class="bad">นี่คือดวงสุดท้าย ถ้า Servant ตายอีกครั้งคุณจะตกรอบ</p>' : ''}
        <button class="primary" id="y">อัญเชิญใหม่</button> <button id="n">ยอมแพ้ (ตกรอบ)</button>`);
      sh.querySelector('#y').onclick = () => { this.closeModal(); resolve(true); };
      sh.querySelector('#n').onclick = () => { this.closeModal(); resolve(false); };
    });
  }

  askCatalyst(choices) {
    return new Promise((resolve) => {
      const sh = this.modal(`<h2>วัตถุเชื่อมโยง</h2><p>เลือก Servant ที่จะอัญเชิญ</p>
        <div class="grid">${choices.map((k) => `<button data-k="${k}" class="pick-sv"><img src="${art(SERVANTS[k].cls)}" alt=""><b>${esc(SERVANTS[k].name)}</b><small>${SERVANTS[k].cls}</small></button>`).join('')}</div>`);
      sh.querySelectorAll('[data-k]').forEach((b) => b.onclick = () => { this.closeModal(); resolve(b.dataset.k); });
    });
  }

  // ================= battle scene =================
  openBattle(view) {
    const el = $('#battle');
    el.hidden = false;
    const fighter = (v, side) => `<div class="fighter ${side}" id="f-${v.id}" style="--cc:${CLASS_COLOR[v.cls]}">
      <div class="f-hud">
        <div class="f-name"><b>${esc(v.name)}</b> ${v.seals != null ? seals(v.seals) : '<span class="seals hidden">◆ ?</span>'}</div>
        <div class="f-label">${esc(v.label)}</div>
        <div class="hpbar"><i class="lag"></i><i class="cur"></i><span></span></div>
        ${v.mana != null ? `<div class="f-mana">มานา <b>${v.mana}</b>/${MANA_MAX}</div>` : ''}
      </div>
      <div class="f-body"><img src="${art(v.cls)}" alt="${v.cls}"><div class="fx-layer"></div></div>
    </div>`;
    el.innerHTML = `<div class="bt-sky"></div>
      <div class="bt-top"><span class="hud-tag">BATTLE</span> <b id="bt-round">รอบ 1/3</b> · ${AREAS[this.me.area]?.name ?? ''}</div>
      <div class="arena">
        ${fighter(view.me, 'L')}
        <div class="tray"><div class="vs">VS</div><div class="dicebox"></div><div class="tray-text"></div></div>
        ${fighter(view.foe, 'R')}
      </div>
      <div class="np-banner"></div>
      <div class="bt-bottom">
        <div class="bt-log"></div>
        <div class="bt-controls"></div>
      </div>`;
    this.battle = { me: view.me.id, foe: view.foe.id, shown: 0, queue: Promise.resolve(), fast: false, maxHp: { [view.me.id]: view.me.maxHp, [view.foe.id]: view.foe.maxHp } };
    this.setHp(view.me.id, view.me.hp, true);
    this.setHp(view.foe.id, view.foe.hp, true);
    el.querySelector('.arena').onclick = () => { if (this.battle) this.battle.fast = true; };
    this.queueBattle(view);
  }

  queueBattle(view) {
    const b = this.battle;
    if (!b) return;
    const lines = view.lines.slice(b.shown);
    b.shown = view.lines.length;
    b.view = view;
    b.queue = b.queue.then(async () => {
      for (const l of lines) await this.playLine(l);
      $('#bt-round').textContent = `รอบ ${Math.min(view.round, 3)}/3`;
      const mana = $(`#f-${b.me} .f-mana b`);
      if (mana) mana.textContent = view.me.mana;
      $(`#f-${b.me} .f-name`).innerHTML = `<b>${esc(view.me.name)}</b> ${seals(view.me.seals)}`;
      this.renderAll();
    });
  }

  setHp(id, hp, instant = false) {
    const f = $(`#f-${id}`);
    if (!f) return;
    const max = this.battle.maxHp[id];
    const pct = Math.max(0, Math.min(100, (hp / max) * 100));
    const cur = f.querySelector('.hpbar .cur'), lag = f.querySelector('.hpbar .lag');
    cur.style.width = pct + '%';
    if (instant) lag.style.width = pct + '%';
    else setTimeout(() => { lag.style.width = pct + '%'; }, 350);
    f.querySelector('.hpbar span').textContent = `${hp}/${max}`;
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

  async rollDice(text) {
    const m = text.match(/\[([\d,]+)\]/);
    const box = $('#battle .dicebox');
    if (!m || !box) return;
    const vals = m[1].split(',').map(Number);
    box.innerHTML = vals.map(() => '<b class="die rolling">⚀</b>').join('');
    if (!this.battle.fast) {
      for (let i = 0; i < 6; i++) {
        box.querySelectorAll('.die').forEach((d) => { d.textContent = FACES[Math.floor(Math.random() * 6)]; });
        await sleep(55);
      }
    }
    box.innerHTML = vals.map((v) => `<b class="die">${FACES[v - 1] ?? v}</b>`).join('');
  }

  async playLine(l) {
    const b = this.battle;
    const wait = (ms) => (b.fast ? sleep(0) : sleep(ms));
    const log = $('#battle .bt-log');
    if (!log) return;
    const div = document.createElement('div');
    div.className = `l ${l.cls}`;
    div.innerHTML = fmt(l.t);
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
    $('#battle .tray-text').innerHTML = fmt(l.t.replace(/ · .*HP \d+\/\d+$/, ''));
    const rm = l.t.match(/รอบ (\d)/);
    if (l.cls === 'round' && rm) $('#bt-round').textContent = `รอบ ${rm[1]}/3`;
    const fx = l.fx;
    if (fx) {
      switch (fx.k) {
        case 'hit': {
          await this.rollDice(l.t);
          this.flash(fx.from, 'lunge', 400);
          await wait(180);
          this.flash(fx.to, fx.big ? 'hit-big' : 'hit', 500);
          if (fx.big) this.flashScreen('np-flash');
          this.float(fx.to, fx.amt > 0 ? `-${fx.amt}` : 'MISS', fx.big ? 'dmg big' : fx.amt > 0 ? 'dmg' : 'miss');
          this.setHp(fx.to, l.hp[fx.to]);
          await wait(fx.big ? 700 : 480);
          break;
        }
        case 'np': {
          const bn = $('#battle .np-banner');
          bn.innerHTML = `<small>NOBLE PHANTASM</small><b>${esc(fx.name)}</b>`;
          bn.classList.remove('show'); void bn.offsetWidth; bn.classList.add('show');
          this.flash(fx.who, 'charge', 1100);
          await wait(1200);
          break;
        }
        case 'reveal': {
          const lab = $(`#f-${fx.who} .f-label`);
          if (lab) { lab.textContent = fx.name; lab.classList.add('stamp'); }
          this.float(fx.who, 'TRUE NAME!', 'reveal');
          await wait(700);
          break;
        }
        case 'heal':
          this.float(fx.to, fx.label ? `${fx.label}` : '+HP', 'heal');
          this.setHp(fx.to, l.hp[fx.to]);
          await wait(450);
          break;
        case 'guard':
          await this.rollDice(l.t);
          this.float(fx.who, '🛡 GUARD', 'guard');
          await wait(380);
          break;
        case 'flee':
          this.flash(fx.who, 'fled', 99999);
          await wait(600);
          break;
        case 'death':
          $(`#f-${fx.to}`)?.classList.add('dead');
          this.flashScreen('death-flash');
          await wait(900);
          break;
        case 'stun':
          this.float(fx.to, 'กลายเป็นหิน!', 'stun');
          this.flash(fx.to, 'stone', 900);
          await wait(500);
          break;
        case 'seal':
          this.float(fx.who, `◆ ${fx.label}`, 'seal');
          await wait(450);
          break;
        case 'card':
          this.float(fx.who, `▤ ${fx.label}`, 'card');
          await wait(400);
          break;
        case 'buff':
          await this.rollDice(l.t);
          this.float(fx.who, fx.label, 'heal');
          await wait(380);
          break;
        default:
          await wait(200);
      }
    } else {
      if (/\[[\d,]+\]/.test(l.t)) await this.rollDice(l.t);
      await wait(l.cls === 'round' ? 350 : 220);
    }
    for (const id of Object.keys(l.hp)) this.setHp(Number(id), l.hp[id]);
  }

  flashScreen(cls) {
    const el = $('#battle');
    el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);
    setTimeout(() => el.classList.remove(cls), 700);
  }

  async askCombat(ctx) {
    const me = this.me, g = this.game;
    const { moves, cards } = ctx;
    await this.battle.queue;
    this.battle.fast = false;
    $('#bt-round').textContent = `รอบ ${ctx.fight.round}/3`;
    const opt = { boost: false, sealHeal: false, card: null };
    return new Promise((resolve) => {
      const draw = () => {
        const sealsLeft = me.seals - (opt.boost ? 1 : 0) - (opt.sealHeal ? 1 : 0);
        const mv = moves.map((m, i) => {
          const npFree = m.type === 'np' && opt.boost;
          const ok = npFree ? true : m.type === 'np' ? me.mana >= m.cost : m.ok;
          const sealOk = m.type !== 'seal_flee' || sealsLeft >= 1;
          return `<button class="move ${m.type}" data-i="${i}" ${ok && sealOk ? '' : 'disabled'}>
            <b>${esc(m.label)}</b> <em>${m.seal ? '◆' : (npFree ? 'ฟรี' : m.cost + ' มานา')}</em><small>${esc(m.desc)}</small></button>`;
        }).join('');
        const cardOpts = cards.map((c) => `<button class="small ${opt.card === c ? 'on' : ''}" data-card="${c}" title="${esc(CARDS[c].desc)}">▤ ${esc(CARDS[c].name)}</button>`).join('');
        const ctl = $('#battle .bt-controls');
        ctl.innerHTML = `
          <div class="tools">
            <label class="tog ${opt.boost ? 'on' : ''}"><input type="checkbox" id="boost" ${opt.boost ? 'checked' : ''} ${me.seals - (opt.sealHeal ? 1 : 0) < 1 && !opt.boost ? 'disabled' : ''}> ◆ เพิ่มพลัง! <small>+2/ลูก หรือ NP ฟรี</small></label>
            ${g.canSealHeal(me) ? `<label class="tog ${opt.sealHeal ? 'on' : ''}"><input type="checkbox" id="sh" ${opt.sealHeal ? 'checked' : ''} ${me.seals - (opt.boost ? 1 : 0) < 1 && !opt.sealHeal ? 'disabled' : ''}> ◆ รักษา! <small>ฟื้น 60%</small></label>` : ''}
            ${cardOpts}
          </div>
          <div class="moves">${mv}</div>`;
        ctl.querySelector('#boost').onchange = (e) => { opt.boost = e.target.checked; draw(); };
        const shb = ctl.querySelector('#sh');
        if (shb) shb.onchange = (e) => { opt.sealHeal = e.target.checked; draw(); };
        ctl.querySelectorAll('[data-card]').forEach((b) => b.onclick = () => { opt.card = opt.card === b.dataset.card ? null : b.dataset.card; draw(); });
        ctl.querySelectorAll('[data-i]').forEach((b) => b.onclick = () => {
          const m = moves[Number(b.dataset.i)];
          ctl.innerHTML = '<div class="waiting">ทอยลูกเต๋า… <small>(แตะสนามเพื่อเร่ง)</small></div>';
          resolve({ type: m.type, skillId: m.skillId, boost: opt.boost, card: opt.card, sealHeal: opt.sealHeal });
        });
      };
      draw();
    });
  }

  async askCombatEnd() {
    await this.battle.queue;
    return new Promise((resolve) => {
      const ctl = $('#battle .bt-controls');
      ctl.innerHTML = '<button class="primary wide" id="done">กลับสู่เมือง</button>';
      ctl.querySelector('#done').onclick = () => {
        $('#battle').hidden = true;
        $('#battle').innerHTML = '';
        this.battle = null;
        this.renderAll();
        resolve(null);
      };
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
