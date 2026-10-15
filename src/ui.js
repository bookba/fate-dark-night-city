// DOM front end. Renders the board from game state and answers the human's
// decisions by returning Promises that resolve when the player clicks.

import { AREAS, AREA_KEYS, CLASSES, SERVANTS, CARDS, MANA_MAX, DEATHS_FOR_GRAIL } from './data.js';

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

// turn "ทอย [3,5]" into dice glyphs
function fmt(text) {
  return esc(text).replace(/\[([\d,]+)\]/g, (_, list) =>
    `<span class="dice">${list.split(',').map((d) => `<b class="die">${FACES[d - 1] ?? d}</b>`).join('')}</span>`);
}

function bar(cur, max, cls) {
  const pct = Math.max(0, Math.min(100, (cur / max) * 100));
  return `<div class="bar ${cls}"><i style="width:${pct}%"></i><span>${cur}/${max}</span></div>`;
}

const seals = (n) => `<span class="seals" title="Command Seal">${'◆'.repeat(n)}${'◇'.repeat(Math.max(0, 3 - n))}</span>`;

export class UI {
  constructor() {
    this.game = null;
    this.revealed = false;
    this.sel = { area: null, stance: 'gather' };
    this.fast = false;
    this.combat = null; // {view, pending resolver}
  }

  attach(game) {
    this.game = game;
    this.revealed = false;
    this.fast = false;
    $('#log').innerHTML = '<h3>บันทึก</h3><div class="lines"></div>';
    this.renderAll();
  }

  get me() { return this.game.human; }

  onEvent(e) {
    switch (e.type) {
      case 'log': this.addLog(e.entry); break;
      case 'phase': this.revealed = false; this.renderAll(); break;
      case 'reveal': this.revealed = true; this.renderAll(); break;
      case 'combatStart':
      case 'combatRound': this.renderCombat(e.view); this.renderAll(); break;
      default: this.renderAll();
    }
  }

  // ---------------- rendering ----------------
  renderAll() {
    if (!this.game) return;
    this.renderTop();
    this.renderMe();
    this.renderMap();
    this.renderOthers();
  }

  renderTop() {
    const g = this.game;
    const grail = g.grail.appeared
      ? `<span class="grail">✦ จอก: ${g.grail.holder ? esc(g.grail.holder.name) : AREAS[g.grail.area].name} · เหลือ ${Math.max(0, g.grail.endP - g.p + 1)} เฟส</span>`
      : `<span>ตายรวม ${g.deaths}/${DEATHS_FOR_GRAIL}</span>`;
    $('#top').innerHTML = `
      <div class="title">Fate <span>Battle Royale</span></div>
      <div class="clock ${g.night ? 'night' : 'day'}">${g.night ? '☾ กลางคืน' : '☀ กลางวัน'} · วันที่ ${g.day}/8</div>
      <div class="meta">${grail} · เหลือ ${g.alive().length} มาสเตอร์</div>`;
  }

  renderMe() {
    const pl = this.me;
    const el = $('#me');
    if (pl.out) { el.innerHTML = `<h3>${esc(pl.name)}</h3><p class="muted">คุณตกรอบแล้ว</p>`; return; }
    const s = pl.servant;
    if (!s) { el.innerHTML = ''; return; }
    const c = CLASSES[s.cls];
    const def = s.def;
    const skills = def.skills.map((k) =>
      `<li><b>${esc(k.name)}</b> <em>${k.kind === 'passive' ? 'ติดตัว' : k.cost + ' มานา'}</em><br><small>${esc(k.desc)}</small></li>`).join('');
    const cards = pl.cards.length
      ? pl.cards.map((k) => `<li class="card r-${CARDS[k].rarity}"><b>${esc(CARDS[k].name)}</b><br><small>${esc(CARDS[k].desc)}</small></li>`).join('')
      : '<li class="muted">ไม่มีการ์ด</li>';
    el.innerHTML = `
      <h3>${esc(pl.name)} <small class="muted">(คุณ)</small></h3>
      <div class="servant cls-${s.cls}">
        <div class="sv-head"><span class="badge">${s.cls}</span> <b>${esc(def.name)}</b>
          ${s.revealed ? '<span class="tag warn">ชื่อถูกเปิดเผย</span>' : '<span class="tag">ชื่อยังเป็นความลับ</span>'}</div>
        ${bar(s.hp, s.maxHp, 'hp')}
        <div class="stats">ATK ${s.atk} · DEF ${s.def_} · AGI ${s.agi}</div>
        <div class="row">มานา ${bar(pl.mana, MANA_MAX, 'mana')}</div>
        <div class="row">Command Seal ${seals(pl.seals)}</div>
        <details open><summary>สกิลและ NP</summary>
          <ul class="skills">
            <li><b>${esc(c.passive)}</b> <em>สกิลคลาส</em></li>
            ${skills}
            <li class="np"><b>NP: ${esc(def.np.name)}</b> <em>${def.np.cost} มานา</em><br><small>${esc(def.np.desc)} · ใช้แล้วเปิดชื่อจริง</small></li>
          </ul>
        </details>
        <div class="secret">🔒 ถนัด: <b>${AREAS[def.favored].name}</b> (+1 ต่อลูก, มานา +1)<br>
          🔒 ไม่ถนัด: <b>${AREAS[def.unfavored].name}</b> (−1 ต่อลูก)<br>
          ⚠ จุดอ่อน: ${esc(def.weakness)}</div>
      </div>
      <h4>การ์ด (${pl.cards.length}/3)</h4>
      <ul class="cards">${cards}</ul>`;
  }

  renderMap() {
    const g = this.game, me = this.me;
    const choosing = this.mode === 'area';
    $('#map').innerHTML = AREA_KEYS.map((a) => {
      const closed = !g.open.includes(a);
      const closing = g.closingNext.includes(a);
      const grailHere = g.grail.appeared && !g.grail.holder && g.grail.area === a;
      let people = [];
      if (this.revealed) {
        people = g.alive().filter((x) => x.area === a && x.servant && (!x.hidden || x === me || (x.area === me.area && g.visibleTo(me, x))));
      }
      const chips = people.map((x) => {
        const cls = [x === me ? 'me' : '', x.hidden ? 'hid' : '', g.grail.holder === x ? 'holder' : ''].join(' ');
        return `<span class="chip ${cls}">${esc(x.name)} · ${esc(g.servantLabel(me, x))}${x.hidden ? ' (ซ่อน)' : ''}${g.grail.holder === x ? ' ✦' : ''}</span>`;
      }).join('');
      const selected = choosing && this.sel.area === a;
      const mine = !choosing && !me.out && me.area === a && this.revealed;
      return `<button class="area ${closed ? 'closed' : ''} ${selected ? 'sel' : ''} ${mine ? 'mine' : ''}" data-area="${a}" ${closed || !choosing ? 'disabled' : ''}>
        <div class="a-name">${AREAS[a].name}${grailHere ? ' <span class="grail">✦ จอก</span>' : ''}</div>
        <div class="a-desc">${AREAS[a].desc}</div>
        ${closed ? '<div class="tag">ปิดแล้ว</div>' : closing ? '<div class="tag warn">จะปิดเฟสหน้า</div>' : ''}
        ${me.servant && me.servant.def.favored === a ? '<div class="tag good">ถนัด</div>' : ''}
        ${me.servant && me.servant.def.unfavored === a ? '<div class="tag bad">ไม่ถนัด</div>' : ''}
        <div class="chips">${chips}</div>
      </button>`;
    }).join('');
    $('#map').querySelectorAll('.area').forEach((b) => b.addEventListener('click', () => {
      if (this.mode !== 'area') return;
      this.sel.area = b.dataset.area;
      this.renderMap();
      this.renderAreaAction();
    }));
  }

  renderOthers() {
    const g = this.game, me = this.me;
    const rows = g.players.filter((x) => x !== me).map((x) => {
      if (x.out) return `<li class="out"><b>${esc(x.name)}</b> <span class="muted">ตกรอบ</span></li>`;
      const s = x.servant;
      if (!s) return `<li><b>${esc(x.name)}</b></li>`;
      const top = Object.entries(x.areaCounts).sort((a, b) => b[1] - a[1])[0];
      const seen = me.seen[s.uid] ? [...me.seen[s.uid]].join(', ') : '';
      return `<li>
        <div><b>${esc(x.name)}</b> ${g.grail.holder === x ? '<span class="grail">✦</span>' : ''} ${seals(x.seals)}
          <span class="muted">· การ์ด ${x.cards.length}</span></div>
        <div class="sv">${esc(g.servantLabel(me, x))}${g.knowsName(me, x) ? ` <small class="bad">จุดอ่อน: ${esc(s.def.weakness)}</small>` : ''}</div>
        ${bar(Math.max(0, s.hp), s.maxHp, 'hp small')}
        <small class="muted">${top[1] ? `พบบ่อยที่ ${AREAS[top[0]].short} (${top[1]})` : 'ยังไม่เคยพบ'}${seen ? ` · เคยเห็นใช้: ${esc(seen)}` : ''}</small>
      </li>`;
    }).join('');
    $('#others').innerHTML = `<h3>มาสเตอร์คนอื่น</h3><ul class="others">${rows}</ul>`;
  }

  addLog(entry) {
    if (!this.game) return;
    if (entry.to && !entry.to.includes(this.me.id)) return;
    const box = $('#log .lines');
    if (!box) return;
    const div = document.createElement('div');
    div.className = `l ${entry.cls}`;
    div.innerHTML = fmt(entry.text);
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
  }

  setAction(html) { $('#action').innerHTML = html; }

  // ---------------- decisions ----------------
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
    this.mode = 'area';
    const me = this.me;
    this.sel = { area: this.game.open.includes(me.area) ? me.area : null, stance: 'gather' };
    this.renderMap();
    return new Promise((resolve) => {
      this.resolveArea = resolve;
      this.renderAreaAction();
    });
  }

  renderAreaAction() {
    const g = this.game, me = this.me;
    const holder = g.grail.holder === me;
    const fieldCards = [...new Set(me.cards)].filter((c) => g.fieldCardUsable(me, c));
    const cardBtns = fieldCards.map((c) => `<button class="small" data-card="${c}">ใช้ ${esc(CARDS[c].name)}</button>`).join('');
    const unknown = g.alive().filter((x) => x !== me && !g.knowsName(me, x));
    const need = g.night ? 5 : 3;
    const hideBonus = (me.servant.cls === 'Assassin' ? 2 : 0) + (this.sel.area === 'forest' ? 1 : 0);
    this.setAction(`
      <h3>① เลือกพื้นที่และท่าที</h3>
      <p class="muted">แตะพื้นที่บนแผนที่ด้านล่าง ทุกคนเลือกพร้อมกันแบบลับ${g.night ? ' · กลางคืนได้มานา ×1.5' : ''}</p>
      <div class="pick">พื้นที่: <b>${this.sel.area ? AREAS[this.sel.area].name : '— ยังไม่เลือก —'}</b></div>
      <div class="seg">
        <button data-stance="gather" class="${this.sel.stance === 'gather' ? 'on' : ''}">เก็บของ<small>ได้ทรัพยากรเต็ม</small></button>
        <button data-stance="hide" class="${this.sel.stance === 'hide' ? 'on' : ''}" ${holder ? 'disabled' : ''}>ซ่อนตัว<small>ได้ครึ่งเดียว · ทอย d6${hideBonus ? '+' + hideBonus : ''} ≥ ${need}${me.ward ? ' (ศิลาเขตแดน: สำเร็จแน่นอน)' : ''}</small></button>
      </div>
      ${holder ? '<p class="grail">คุณถือจอก: ซ่อนตัวไม่ได้ ถูกเห็นทุกเฟส</p>' : ''}
      <div class="tools">
        ${g.canSealHeal(me) ? `<button class="small seal" data-seal="heal">Command Seal: รักษา! (ฟื้น 60%)</button>` : ''}
        ${cardBtns}
      </div>
      <div id="hero-pick"></div>
      <button class="primary" id="go" ${this.sel.area ? '' : 'disabled'}>ยืนยัน</button>`);
    const act = $('#action');
    act.querySelectorAll('[data-stance]').forEach((b) => b.onclick = () => { this.sel.stance = b.dataset.stance; this.renderAreaAction(); });
    act.querySelectorAll('[data-seal]').forEach((b) => b.onclick = () => { g.sealHeal(me); this.renderAreaAction(); });
    act.querySelectorAll('[data-card]').forEach((b) => b.onclick = () => {
      const c = b.dataset.card;
      if (c === 'hero_record') {
        $('#hero-pick').innerHTML = `<p>บันทึกวีรชน: เลือกเป้าหมาย</p>` + unknown.map((x) =>
          `<button class="small" data-hero="${x.id}">${esc(x.name)} (${x.servant.cls})</button>`).join('');
        $('#hero-pick').querySelectorAll('[data-hero]').forEach((h) => h.onclick = () => {
          g.useFieldCard(me, 'hero_record', Number(h.dataset.hero));
          this.renderAll(); this.renderAreaAction();
        });
        return;
      }
      g.useFieldCard(me, c);
      this.renderAll();
      this.renderAreaAction();
    });
    $('#go').onclick = () => {
      this.mode = null;
      this.setAction('<p class="muted">รอทุกคนเลือก…</p>');
      const r = this.resolveArea; this.resolveArea = null;
      r({ area: this.sel.area, stance: this.sel.stance });
    };
  }

  askEncounter(targets) {
    const g = this.game, me = this.me;
    return new Promise((resolve) => {
      const rows = targets.map((t) => {
        const s = t.servant;
        return `<div class="target">
          <div><b>${esc(t.name)}</b> · ${esc(g.servantLabel(me, t))} ${seals(t.seals)}${t.hidden ? ' <span class="tag">ซ่อนตัว</span>' : ''}${g.grail.holder === t ? ' <span class="grail">✦ ถือจอก</span>' : ''}</div>
          ${bar(Math.max(0, s.hp), s.maxHp, 'hp small')}
          <button class="danger" data-t="${t.id}">${me.hidden ? 'ซุ่มโจมตี' : 'โจมตี'}</button>
        </div>`;
      }).join('');
      this.setAction(`
        <h3>③ เผชิญหน้าที่${AREAS[me.area].name}</h3>
        <p class="muted">${me.hidden ? 'คุณซ่อนตัวอยู่ ถ้าโจมตีจะได้ลงมือก่อนในรอบแรก' : 'เลือกลับๆ ว่าจะโจมตีใคร หรือปล่อยผ่าน'} · มานาของคุณ ${me.mana} · พื้นที่นี้สำหรับคุณ: ${me.servant.def.favored === me.area ? 'ถนัด (+1/ลูก)' : me.servant.def.unfavored === me.area ? 'ไม่ถนัด (−1/ลูก)' : 'ปกติ'}</p>
        ${rows}
        <button class="primary" data-t="">ปล่อยผ่าน</button>`);
      $('#action').querySelectorAll('[data-t]').forEach((b) => b.onclick = () => {
        this.setAction('<p class="muted">รอผลการเผชิญหน้า…</p>');
        resolve(b.dataset.t === '' ? null : Number(b.dataset.t));
      });
    });
  }

  askPhaseEnd(label) {
    if (this.me.out) {
      if (this.fast) return null;
      return new Promise((resolve) => {
        this.setAction(`<h3>คุณตกรอบแล้ว</h3><p class="muted">ดูการต่อสู้ของมาสเตอร์ที่เหลือจนจบได้</p>
          <button class="primary" id="ff">ข้ามไปดูผลตอนจบ</button> <button id="nx">ดูเฟสถัดไป</button>`);
        $('#ff').onclick = () => { this.fast = true; this.setAction('<p class="muted">กำลังจำลองจนจบ…</p>'); resolve(null); };
        $('#nx').onclick = () => resolve(null);
      });
    }
    return new Promise((resolve) => {
      this.setAction(`<h3>จบ${esc(label)}</h3><p class="muted">ดูผลในบันทึกด้านข้าง แล้วไปเฟสถัดไป</p>
        <button class="primary" id="nx">เฟสถัดไป ›</button>`);
      $('#nx').onclick = () => { this.setAction(''); resolve(null); };
    });
  }

  // ---------------- modal ----------------
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
        <h1 class="logo">Fate <span>Battle Royale</span></h1>
        <p class="muted">เดโมออฟไลน์: คุณ 1 คน ปะทะบอท 7 ตัว · 8 วัน วันละ 2 เฟส</p>
        <ul class="rules">
          <li>แต่ละเฟสเลือก <b>พื้นที่</b> และท่าที <b>เก็บของ / ซ่อนตัว</b> แบบลับ แล้วเปิดเผยพร้อมกัน</li>
          <li>เจอใครในพื้นที่เดียวกัน เลือก <b>โจมตี</b> หรือ <b>ปล่อยผ่าน</b> · ต่อสู้ด้วย <b>มานา + ลูกเต๋า</b> สูงสุด 3 รอบ</li>
          <li><b>Noble Phantasm</b> แรงที่สุด แต่ใช้แล้ว <b>ชื่อจริงของ Servant ถูกเปิดเผย</b></li>
          <li>Servant ตาย → จ่าย <b>Command Seal</b> อัญเชิญใหม่ · หมด Seal = ตกรอบ</li>
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
    return `<div class="servant big cls-${s.cls}">
      <div class="sv-head"><span class="badge">${s.cls}</span> <b>${esc(def.name)}</b></div>
      <div class="stats">HP ${s.maxHp} · ATK ${s.atk} · DEF ${s.def_} · AGI ${s.agi}</div>
      <div><small>NP: ${esc(def.np.name)} (${def.np.cost} มานา) · ${def.skills.map((k) => esc(k.name)).join(' · ')}</small></div>
      <div class="secret">🔒 ถนัด ${AREAS[def.favored].name} · ไม่ถนัด ${AREAS[def.unfavored].name}</div>
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
        <p>Command Seal เหลือ ${seals(me.seals)} — อัญเชิญใหม่ต้องใช้ 1 ดวง</p>
        ${me.seals === 1 ? '<p class="bad">นี่คือดวงสุดท้าย ถ้า Servant ตายอีกครั้งคุณจะตกรอบ</p>' : ''}
        <button class="primary" id="y">อัญเชิญใหม่</button> <button id="n">ยอมแพ้ (ตกรอบ)</button>`);
      sh.querySelector('#y').onclick = () => { this.closeModal(); resolve(true); };
      sh.querySelector('#n').onclick = () => { this.closeModal(); resolve(false); };
    });
  }

  askCatalyst(choices) {
    return new Promise((resolve) => {
      const sh = this.modal(`<h2>วัตถุเชื่อมโยง</h2><p>เลือก Servant ที่จะอัญเชิญ</p>
        <div class="grid">${choices.map((k) => `<button data-k="${k}"><b>${esc(SERVANTS[k].name)}</b><br><small>${SERVANTS[k].cls}</small></button>`).join('')}</div>`);
      sh.querySelectorAll('[data-k]').forEach((b) => b.onclick = () => { this.closeModal(); resolve(b.dataset.k); });
    });
  }

  // ---------------- combat ----------------
  renderCombat(view, controls = '') {
    const side = (v, mine) => `<div class="fighter ${mine ? 'mine' : 'foe'}">
      <div><b>${esc(v.name)}</b> ${seals(v.seals)}</div>
      <div class="sv">${esc(v.label)}</div>
      ${bar(v.hp, v.maxHp, 'hp')}
      ${v.mana != null ? `<div class="row">มานา ${bar(v.mana, MANA_MAX, 'mana small')}</div>` : ''}
    </div>`;
    const prev = this.combatLines || 0;
    const lines = view.lines.map((l, i) => `<div class="l ${l.cls} ${i >= prev ? 'new' : ''}">${fmt(l.t)}</div>`).join('');
    this.combatLines = view.lines.length;
    const sh = this.modal(`<h2>⚔ การต่อสู้ <small>รอบ ${Math.min(view.round, 3)}/3</small></h2>
      <div class="versus">${side(view.me, true)}<div class="vs">VS</div>${side(view.foe, false)}</div>
      <div class="clog">${lines}</div>
      <div class="controls">${controls}</div>`);
    const lg = sh.querySelector('.clog');
    lg.scrollTop = lg.scrollHeight;
    return sh;
  }

  askCombat(ctx) {
    const g = this.game, me = this.me;
    const { moves, cards, view } = ctx;
    const opt = { boost: false, sealHeal: false, card: null };
    return new Promise((resolve) => {
      const draw = () => {
        const sealsLeft = me.seals - (opt.boost ? 1 : 0) - (opt.sealHeal ? 1 : 0);
        const mv = moves.map((m, i) => {
          const npFree = m.type === 'np' && opt.boost;
          const ok = npFree ? true : m.type === 'np' ? me.mana >= m.cost : m.ok;
          const sealOk = m.type !== 'seal_flee' || sealsLeft >= 1;
          return `<button class="move ${m.type}" data-i="${i}" ${ok && sealOk ? '' : 'disabled'}>
            <b>${esc(m.label)}</b> <em>${m.seal ? 'Seal' : (npFree ? 'ฟรี' : m.cost + ' มานา')}</em><small>${esc(m.desc)}</small></button>`;
        }).join('');
        const cardOpts = cards.map((c) => `<button class="small ${opt.card === c ? 'on' : ''}" data-card="${c}" title="${esc(CARDS[c].desc)}">${esc(CARDS[c].name)}</button>`).join('');
        const controls = `
          <div class="tools">
            <label class="tog ${opt.boost ? 'on' : ''}"><input type="checkbox" id="boost" ${opt.boost ? 'checked' : ''} ${me.seals - (opt.sealHeal ? 1 : 0) < 1 && !opt.boost ? 'disabled' : ''}> Command Seal: เพิ่มพลัง! <small>(+2 ทุกลูกเต๋ารอบนี้ หรือ NP ฟรี)</small></label>
            ${g.canSealHeal(me) ? `<label class="tog ${opt.sealHeal ? 'on' : ''}"><input type="checkbox" id="sh" ${opt.sealHeal ? 'checked' : ''} ${me.seals - (opt.boost ? 1 : 0) < 1 && !opt.sealHeal ? 'disabled' : ''}> Command Seal: รักษา! <small>(ฟื้น 60%)</small></label>` : ''}
          </div>
          ${cards.length ? `<div class="tools"><span class="muted">การ์ด (ใช้ได้ 1 ใบ/รอบ):</span> ${cardOpts}</div>` : ''}
          <div class="moves">${mv}</div>`;
        const sh = this.renderCombat(view, controls);
        sh.querySelector('#boost').onchange = (e) => { opt.boost = e.target.checked; draw(); };
        const shb = sh.querySelector('#sh');
        if (shb) shb.onchange = (e) => { opt.sealHeal = e.target.checked; draw(); };
        sh.querySelectorAll('[data-card]').forEach((b) => b.onclick = () => { opt.card = opt.card === b.dataset.card ? null : b.dataset.card; draw(); });
        sh.querySelectorAll('[data-i]').forEach((b) => b.onclick = () => {
          const m = moves[Number(b.dataset.i)];
          sh.querySelector('.controls').innerHTML = '<p class="muted">ทอยลูกเต๋า…</p>';
          setTimeout(() => resolve({ type: m.type, skillId: m.skillId, boost: opt.boost, card: opt.card, sealHeal: opt.sealHeal }), 350);
        });
      };
      draw();
    });
  }

  askCombatEnd(view) {
    return new Promise((resolve) => {
      const sh = this.renderCombat(view, `<button class="primary" id="done">ปิด</button>`);
      sh.querySelector('#done').onclick = () => { this.combatLines = 0; this.closeModal(); resolve(null); };
    });
  }

  showGameOver() {
    const g = this.game, me = this.me;
    const rank = g.ranking.indexOf(me) + 1;
    return new Promise((resolve) => {
      const rows = g.ranking.map((x, i) => `<li class="${x === me ? 'me' : ''}"><b>#${i + 1} ${esc(x.name)}</b>
        ${x.servant ? `· ${esc(x.servant.def.name)} (${x.servant.cls})` : '· ตกรอบ'} · มานา ${x.mana} · กำจัด ${x.kills}${x === g.grail.holder ? ' ✦' : ''}</li>`).join('');
      const sh = this.modal(`<h2>${g.winner === me ? '🏆 คุณคว้าจอกศักดิ์สิทธิ์!' : `จบสงคราม · คุณได้อันดับ ${rank}`}</h2>
        <p>ผู้ชนะ: <b>${esc(g.winner.name)}</b> ${g.grail.holder === g.winner ? '(ถือจอกศักดิ์สิทธิ์)' : '(มานามากที่สุด เพราะไม่มีใครถือจอก)'}</p>
        <ol class="ranking">${rows}</ol>
        <button class="primary" id="again">เล่นอีกครั้ง</button>`);
      sh.querySelector('#again').onclick = () => { this.closeModal(); resolve(true); };
    });
  }
}
