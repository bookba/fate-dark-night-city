// Game engine: owns all state, rolls every die, resolves phases and combat.
// It has no DOM code, so the same module can run in the browser, in the
// headless balance sim (scripts/sim.js), or later on the game server.
//
// Decisions are requested through `decide(game, player, kind, ctx)`, which may
// return a value or a Promise. Bots answer synchronously; the human UI answers
// with a Promise once the player clicks.

import {
  AREAS, AREA_KEYS, CLASSES, SERVANTS, SERVANT_KEYS, CARDS, CARD_POOL, MASTER_NAMES,
  MANA_MAX, CARD_MAX, SEAL_MAX, DEATHS_FOR_GRAIL, MAX_ROUNDS,
} from './data.js';

const TOTAL_PHASES = 16;

export class Game {
  constructor({ humanName = 'เอมิยะ', rng = Math.random, decide, onEvent = () => {}, humanCount = 1 }) {
    this.rng = rng;
    this.decide = decide;
    this.onEvent = onEvent;
    this.p = 0;
    this.deaths = 0;
    this.uid = 0;
    this.pool = [...SERVANT_KEYS];
    this.open = [...AREA_KEYS];
    this.closingNext = [];
    this.grail = { appeared: false, area: null, holder: null, endP: TOTAL_PHASES - 1 };
    this.over = false;
    this.eliminatedOrder = [];
    this.logs = [];
    this.history = []; // per phase: { deaths, grail, closing }
    this.fightAreas = new Set();
    this.players = [];
    const names = [...MASTER_NAMES];
    for (let i = 0; i < 8; i++) {
      const human = i < humanCount;
      this.players.push({
        id: i,
        name: human ? humanName : names[i - humanCount],
        isHuman: human,
        autopilot: false,
        seals: 3,
        mana: 3,
        cards: [],
        servant: null,
        out: false,
        known: new Set(), // servant uids whose true name this master knows
        seen: {}, // skill names this master has witnessed, keyed by servant uid
        areaCounts: Object.fromEntries(AREA_KEYS.map((a) => [a, 0])), // public sightings
        area: null,
        stance: 'gather',
        hidden: false,
        fled: false,
        died: false,
        needSummon: false,
        familiar: false,
        ward: false,
        kills: 0,
      });
    }
  }

  // ---------- helpers ----------
  d6() { return 1 + Math.floor(this.rng() * 6); }
  pick(arr) { return arr[Math.floor(this.rng() * arr.length)]; }
  shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  get day() { return Math.floor(this.p / 2) + 1; }
  get night() { return this.p % 2 === 1; }
  get human() { return this.players.find((x) => x.isHuman); }
  alive() { return this.players.filter((x) => !x.out); }

  emit(type, data = {}) { this.onEvent({ type, ...data }); }

  // to: null = everyone sees it, otherwise an array of player ids
  log(text, to = null, cls = '') {
    const entry = { text, to, cls, p: this.p };
    this.logs.push(entry);
    this.emit('log', { entry });
  }

  async ask(player, kind, ctx = {}) {
    return await this.decide(this, player, kind, ctx);
  }

  knowsName(viewer, target) {
    if (!target.servant) return false;
    return viewer === target || target.servant.revealed || viewer.known.has(target.servant.uid);
  }

  // How `viewer` should see `target`'s Servant
  servantLabel(viewer, target) {
    const s = target.servant;
    if (!s) return '—';
    return this.knowsName(viewer, target) ? `${s.def.name} (${s.cls})` : s.cls;
  }

  // ---------- Servants ----------
  makeServant(key) {
    const def = SERVANTS[key];
    const cls = CLASSES[def.cls];
    const maxHp = def.hp ?? cls.hp;
    return {
      uid: ++this.uid, key, def, cls: def.cls, maxHp, hp: maxHp,
      atk: cls.atk, def_: cls.def, agi: cls.agi,
      revealed: false, godHandUsed: false, battleContUsed: false, namelessUsed: false, poison: 0,
    };
  }

  async summon(player, free = false) {
    let key;
    const choices = this.pool.length ? this.pool : SERVANT_KEYS;
    const ci = player.cards.indexOf('catalyst');
    if (ci >= 0) {
      player.cards.splice(ci, 1);
      key = await this.ask(player, 'catalyst', { choices });
      if (!choices.includes(key)) key = this.pick(choices);
      this.log(`${player.name} ใช้วัตถุเชื่อมโยง เลือก Servant เอง`, null);
    } else {
      key = this.pick(choices);
    }
    this.pool = this.pool.filter((k) => k !== key);
    if (!free) player.seals--;
    player.servant = this.makeServant(key);
    player.needSummon = false;
    this.log(`${player.name} อัญเชิญ ${player.servant.cls}${free ? '' : ' (ใช้ Command Seal)'}`, null);
    this.log(`Servant ของคุณคือ ${player.servant.def.name}`, [player.id], 'me');
  }

  gainMana(player, n) { player.mana = Math.max(0, Math.min(MANA_MAX, player.mana + n)); }
  heal(s, n) { s.hp = Math.min(s.maxHp, s.hp + n); }
  drawCard(player) {
    if (player.cards.length >= CARD_MAX) return null;
    const c = this.pick(CARD_POOL);
    player.cards.push(c);
    return c;
  }

  // ---------- actions available outside combat ----------
  canSealHeal(player) { return player.seals > 0 && player.servant && player.servant.hp < player.servant.maxHp; }
  sealHeal(player) {
    if (!this.canSealHeal(player)) return false;
    player.seals--;
    this.heal(player.servant, Math.round(player.servant.maxHp * 0.6));
    this.log(`${player.name} ใช้ Command Seal "รักษา!"`, null);
    this.emit('update');
    return true;
  }

  fieldCardUsable(player, card) {
    const w = CARDS[card].where;
    if (w !== 'field' && w !== 'any') return false;
    if (player.servant?.key === 'heracles') return false;
    if (card === 'potion' && player.servant.hp >= player.servant.maxHp) return false;
    if (card === 'mana_vial' && player.mana >= MANA_MAX) return false;
    return true;
  }

  useFieldCard(player, card, targetId = null) {
    const i = player.cards.indexOf(card);
    if (i < 0 || !this.fieldCardUsable(player, card)) return false;
    if (card === 'hero_record') {
      const t = this.players[targetId];
      if (!t || t.out || t === player || !t.servant) return false;
      player.known.add(t.servant.uid);
      this.log(`บันทึกวีรชน: Servant ของ ${t.name} คือ ${t.servant.def.name} · จุดอ่อน: ${t.servant.def.weakness}`, [player.id], 'me');
    }
    player.cards.splice(i, 1);
    if (card === 'mana_vial') this.gainMana(player, 5);
    if (card === 'potion') this.heal(player.servant, 30);
    if (card === 'familiar') player.familiar = true;
    if (card === 'ward_stone') player.ward = true;
    this.log(`คุณใช้การ์ด ${CARDS[card].name}`, [player.id], 'me');
    this.emit('update');
    return true;
  }

  // ---------- match flow ----------
  async run() {
    this.log('สงครามจอกศักดิ์สิทธิ์เริ่มต้น! มาสเตอร์ 8 คนอัญเชิญ Servant', null, 'sys');
    for (const pl of this.players) await this.summon(pl, true);
    this.emit('update');
    await this.ask(this.human, 'intro', {});
    for (this.p = 0; this.p < TOTAL_PHASES; this.p++) {
      await this.runPhase();
      if (this.checkOver()) break;
    }
    this.finish();
  }

  checkOver() {
    if (this.alive().length <= 1) return true;
    if (this.grail.appeared && this.p >= this.grail.endP) return true;
    return false;
  }

  maybeGrail() {
    if (this.grail.appeared) return;
    if (this.deaths < DEATHS_FOR_GRAIL && this.day < 8) return;
    this.grail.appeared = true;
    this.grail.appearedAt = this.p;
    this.grail.area = this.pick(this.open);
    this.closingNext = this.closingNext.filter((a) => a !== this.grail.area);
    this.grail.endP = this.day < 8 ? Math.min(this.p + 3, TOTAL_PHASES - 1) : TOTAL_PHASES - 1;
    const why = this.deaths >= DEATHS_FOR_GRAIL ? `Servant ตายครบ ${DEATHS_FOR_GRAIL} ครั้ง` : 'เข้าสู่วันที่ 8';
    const left = this.grail.endP - this.p + 1;
    this.log(`✦ จอกศักดิ์สิทธิ์ปรากฏที่${AREAS[this.grail.area].name}! (${why}) ศึกชิงจอกเหลือ ${left} เฟส`, null, 'grail');
    this.emit('grail');
  }

  async runPhase() {
    const label = `วันที่ ${this.day} · ${this.night ? 'กลางคืน' : 'กลางวัน'}`;
    // shrink the barrier: areas announced last phase close now
    if (this.closingNext.length) {
      this.open = this.open.filter((a) => !this.closingNext.includes(a));
      this.log(`เขตแดนหดตัว: ${this.closingNext.map((a) => AREAS[a].name).join(', ')} ปิดแล้ว`, null, 'sys');
      this.closingNext = [];
    }
    this.maybeGrail();
    this.log(`── ${label} ──`, null, 'phase');
    const deathsBefore = this.deaths;
    for (const pl of this.players) {
      Object.assign(pl, { hidden: false, fled: false, died: false, familiar: false, ward: false, hawk: false });
    }
    this.fightAreas = new Set();
    this.emit('phase');

    // ① choose area + stance (bots also use field cards / seals inside decide)
    const choices = new Map();
    this.choosing = true;
    const order = [...this.alive()].sort((x, y) => x.isHuman - y.isHuman); // bots lock in first
    for (const pl of order) {
      const c = await this.ask(pl, 'area', {});
      let area = this.open.includes(c?.area) ? c.area : (this.open.includes(pl.area) ? pl.area : this.pick(this.open));
      let stance = c?.stance === 'hide' ? 'hide' : 'gather';
      if (this.grail.holder === pl) stance = 'gather';
      choices.set(pl, { area, stance });
    }
    this.choosing = false;
    for (const [pl, c] of choices) { pl.area = c.area; pl.stance = c.stance; }

    // ② hide rolls, then reveal
    for (const pl of this.alive()) {
      if (pl.stance !== 'hide') continue;
      const s = pl.servant;
      const need = this.night ? 5 : 3;
      const roll = this.d6();
      const bonus = (pl.area === 'forest' ? 1 : 0) + (s.cls === 'Assassin' ? 2 : 0);
      pl.hidden = pl.ward || roll + bonus >= need;
      const how = pl.ward ? 'ศิลาเขตแดน' : `ทอย ${roll}+${bonus} ต้องได้ ${need}`;
      this.log(`ซ่อนตัว${pl.hidden ? 'สำเร็จ' : 'ไม่สำเร็จ'} (${how})`, [pl.id], pl.hidden ? 'me' : 'bad');
      if (!pl.hidden && s.key === 'hassan') {
        s.hp = Math.max(1, s.hp - 15);
        this.log(`${pl.name}: Servant ถูกพบตอนซ่อนตัว เสีย HP 15`, [pl.id], 'bad');
      }
    }
    for (const pl of this.alive()) if (!pl.hidden) pl.areaCounts[pl.area]++;
    this.emit('reveal');
    for (const a of this.open) {
      const here = this.alive().filter((x) => x.area === a && !x.hidden);
      if (here.length) this.log(`${AREAS[a].name}: ${here.map((x) => `${x.name} [${x.servant.cls}]`).join(', ')}`, null, 'map');
    }

    // ③ encounters
    await this.runEncounters();

    // grail pickup
    if (this.grail.appeared && !this.grail.holder) {
      const here = this.alive().filter((x) => x.area === this.grail.area && !x.fled && !x.died);
      if (here.length) {
        let best = here[0];
        if (here.length > 1) {
          let bestRoll = -1;
          for (const x of here) {
            const r = this.d6() + x.servant.agi;
            if (r > bestRoll) { bestRoll = r; best = x; }
          }
        }
        this.grail.holder = best;
        this.log(`✦ ${best.name} ครอบครองจอกศักดิ์สิทธิ์!`, null, 'grail');
      }
    }

    // ④ gather
    this.gather();

    // end-of-phase effects
    for (const pl of this.alive()) {
      const s = pl.servant;
      if (!s || pl.died) continue;
      if (s.poison > 0) {
        s.poison--;
        s.hp -= 5;
        this.log(`${pl.name}: Servant โดนพิษ HP −5`, null, 'bad');
        if (s.hp <= 0) this.servantDies(pl, null);
      }
    }

    // ⑤ resummon
    for (const pl of this.alive()) {
      if (!pl.needSummon) continue;
      if (pl.seals <= 0) { this.eliminate(pl, 'Command Seal หมด อัญเชิญไม่ได้'); continue; }
      const yes = await this.ask(pl, 'summon', {});
      if (yes) await this.summon(pl);
      else this.eliminate(pl, 'ยอมแพ้');
    }
    if (this.grail.holder?.out) this.grail.holder = null;

    // announce next closures: open areas = players left − 1 (min 2)
    const target = Math.max(2, Math.min(AREA_KEYS.length, this.alive().length - 1));
    const excess = this.open.length - target;
    if (excess > 0 && this.p < TOTAL_PHASES - 1) {
      const cand = this.shuffle(this.open.filter((a) => a !== this.grail.area));
      this.closingNext = cand.slice(0, excess);
      this.log(`⚠ เฟสหน้าเขตแดนหด: ${this.closingNext.map((a) => AREAS[a].name).join(', ')} จะปิด`, null, 'sys');
    }
    this.history[this.p] = { deaths: this.deaths - deathsBefore, grail: this.grail.appeared && this.grail.appearedAt === this.p, closing: this.closingNext.length > 0 };
    this.emit('update');
    if (!this.checkOver()) await this.ask(this.human, 'phaseEnd', { label });
  }

  visibleTo(viewer, other) {
    if (viewer === other || viewer.area !== other.area) return false;
    if (!other.hidden || this.grail.holder === other) return true;
    if (viewer.familiar) return true;
    if (viewer.hawk) return true; // EMIYA's hawk eye, paid in runEncounters
    return false;
  }

  async runEncounters() {
    const attacks = [];
    for (const a of this.open) {
      const here = this.alive().filter((x) => x.area === a && x.servant);
      if (here.length < 2) continue;
      for (const pl of here) {
        // EMIYA's hawk eye costs 2 mana and only fires when someone is actually hidden
        if (pl.servant.key === 'emiya' && here.some((o) => o !== pl && o.hidden)) {
          if (pl.mana >= 2 && !pl.hidden) { pl.mana -= 2; pl.hawk = true; this.log('ตาเหยี่ยว: เห็นคนที่ซ่อนตัวอยู่ (−2 มานา)', [pl.id], 'me'); }
        }
        const targets = here.filter((o) => this.visibleTo(pl, o));
        if (!targets.length) continue;
        const t = await this.ask(pl, 'encounter', { targets });
        if (t != null && targets.some((x) => x.id === t)) {
          attacks.push({ a: pl, t: this.players[t], init: pl.servant.agi + this.rng() });
        }
      }
    }
    attacks.sort((x, y) => y.init - x.init);
    for (const { a, t } of attacks) {
      if (a.out || t.out || a.died || t.died || a.fled || t.fled) continue;
      if (a.servant.hp <= 0 || t.servant.hp <= 0) continue;
      const ambush = a.hidden && !t.familiar && !t.hawk;
      this.log(`⚔ ${a.name} ${ambush ? 'ซุ่มโจมตี' : 'โจมตี'} ${t.name} ที่${AREAS[a.area].name}`, null, 'fight');
      this.fightAreas.add(a.area);
      await this.fight(a, t, ambush);
      a.hidden = false;
      this.emit('update');
    }
  }

  gather() {
    const mult = this.night ? 1.5 : 1;
    for (const a of this.open) {
      const here = this.alive().filter((x) => x.area === a && !x.fled && !x.died && x.servant);
      const gatherers = here.filter((x) => !x.hidden).length || 1;
      for (const pl of here) {
        const s = pl.servant;
        const r = this.d6();
        let mana = 0;
        const notes = [];
        if (a === 'temple') mana = r + 1;
        if (a === 'forest') mana = [1, 1, 2, 3, 3, 4][r - 1];
        if (a === 'shinto') mana = Math.ceil(r / 2);
        if (a === 'school') mana = r;
        if (s.def.favored === a) mana += 1;
        mana = pl.hidden ? Math.floor(mana / 2) : Math.ceil(mana / gatherers);
        mana = Math.ceil(mana * mult);
        if (s.cls === 'Caster') { mana += 2; notes.push('Caster +2'); }
        if (s.key === 'gilgamesh') { mana += 2; notes.push('กฎทองคำ +2'); }
        if (this.grail.holder === pl) { mana += 3; notes.push('จอก +3'); }
        this.gainMana(pl, mana);
        if (a === 'forest' && s.key !== 'gilles') { this.heal(s, Math.round(s.maxHp * 0.1)); notes.push('ฟื้น HP 10%'); }
        if (a === 'church' && s.key !== 'gilles') { this.heal(s, Math.round(s.maxHp * 0.2)); notes.push('ฟื้น HP 20%'); }
        if (a === 'church' && r === 6 && pl.seals < SEAL_MAX) { pl.seals++; notes.push('ได้เศษ Command Seal!'); this.log(`${pl.name} ได้ Command Seal คืนที่โบสถ์`, null); }
        if (a === 'school' && r === 1) { s.hp = Math.max(1, s.hp - 10); notes.push('โดนกับดัก HP −10'); }
        if (a === 'shinto' && r >= 3) { const c = this.drawCard(pl); if (c) notes.push(`ได้การ์ด ${CARDS[c].name}`); }
        this.log(`${AREAS[a].name}: ทอย ${r} → มานา +${mana}${notes.length ? ' · ' + notes.join(' · ') : ''}`, [pl.id], 'me');
      }
    }
  }

  servantDies(pl, killer) {
    const s = pl.servant;
    if (s.key === 'heracles' && !s.godHandUsed) {
      s.godHandUsed = true;
      s.hp = Math.round(s.maxHp * 0.5);
      this.log(`${pl.name}: Servant ฟื้นจากความตาย! (God Hand)`, null, 'bad');
      if (!s.revealed) { s.revealed = true; this.log(`ชื่อจริงถูกเปิดเผย: ${s.def.name}`, null, 'reveal'); }
      return false;
    }
    s.hp = 0;
    pl.died = true;
    pl.needSummon = true;
    this.deaths++;
    this.log(`☠ Servant ${this.servantLabelPublic(pl)} ของ ${pl.name} ถูกกำจัด (ตายรวม ${this.deaths})`, null, 'death');
    if (killer) {
      killer.kills++;
      const loot = Math.floor(pl.mana / 2);
      pl.mana -= loot;
      this.gainMana(killer, loot);
      let cardText = '';
      if (pl.cards.length && killer.cards.length < CARD_MAX) {
        const i = Math.floor(this.rng() * pl.cards.length);
        const c = pl.cards.splice(i, 1)[0];
        killer.cards.push(c);
        cardText = ` และการ์ด 1 ใบ`;
      }
      this.log(`${killer.name} ยึดมานา ${loot}${cardText}`, null);
    }
    if (this.grail.holder === pl) {
      this.grail.holder = killer || null;
      if (!killer) this.grail.area = pl.area;
      this.log(killer ? `✦ จอกศักดิ์สิทธิ์ตกเป็นของ ${killer.name}!` : `✦ จอกตกอยู่ที่${AREAS[pl.area].name}`, null, 'grail');
    }
    return true;
  }

  servantLabelPublic(pl) {
    const s = pl.servant;
    return s.revealed ? `${s.def.name} (${s.cls})` : s.cls;
  }

  eliminate(pl, why) {
    pl.out = true;
    pl.servant = null;
    this.eliminatedOrder.push(pl);
    this.log(`✖ ${pl.name} ตกรอบ (${why})`, null, 'death');
    if (this.grail.holder === pl) this.grail.holder = null;
    this.emit('update');
  }

  finish() {
    this.over = true;
    const alive = this.alive();
    let winner = this.grail.holder && !this.grail.holder.out ? this.grail.holder : null;
    const byMana = [...alive].sort((a, b) => b.mana - a.mana || (b.servant?.hp ?? 0) - (a.servant?.hp ?? 0));
    if (!winner) winner = byMana[0];
    const ranking = [winner, ...byMana.filter((x) => x !== winner), ...[...this.eliminatedOrder].reverse()];
    this.ranking = ranking;
    this.winner = winner;
    const how = this.grail.holder === winner ? 'ถือจอกศักดิ์สิทธิ์' : 'มานามากที่สุด';
    this.log(`🏆 ${winner.name} ชนะสงครามจอกศักดิ์สิทธิ์! (${how})`, null, 'grail');
    this.emit('over', { winner, ranking, how });
  }

  // ======================= COMBAT =======================

  // per-die modifier from favored / unfavored area
  areaMod(pl) {
    const s = pl.servant;
    if (s.def.favored === pl.area) return 1;
    if (s.def.unfavored === pl.area) return s.key === 'kojiro' ? -2 : -1;
    return 0;
  }

  rollDice(n, mod, lucky) {
    const once = () => {
      const dice = [];
      for (let i = 0; i < n; i++) dice.push(this.d6());
      const total = dice.reduce((a, d) => a + Math.max(0, d + mod), 0);
      return { dice, total };
    };
    const r = once();
    if (!lucky) return r;
    const r2 = once();
    return r2.total > r.total ? r2 : r;
  }

  newSide(pl, enemy) {
    return {
      pl, s: pl.servant, enemy,
      atkBuffs: [], defBuffs: [], // {v, rounds}
      npUsed: false, fled: false, dot: 0, move: null,
    };
  }

  stat(side, which) {
    const s = side.s;
    const base = which === 'atk' ? s.atk : s.def_;
    const buffs = which === 'atk' ? side.atkBuffs : side.defBuffs;
    return base + buffs.reduce((a, b) => a + b.v, 0);
  }

  // Which moves a side may pick this round. Shared by the UI and bots.
  legalMoves(fight, side) {
    const s = side.s, pl = side.pl;
    const def = s.def;
    const moves = [{ type: 'attack', label: 'โจมตี', cost: 0, desc: '1d6+ATK' }];
    const noDefend = s.key === 'lancelot' || (s.key === 'gilgamesh' && fight.round === 1);
    if (!noDefend) moves.push({ type: 'defend', label: 'ป้องกัน', cost: 1, desc: '1d6+DEF×2 ลดดาเมจ' });
    if (s.cls !== 'Berserker') {
      for (const sk of def.skills) {
        if (sk.kind === 'passive') continue;
        moves.push({ type: 'skill', skillId: sk.id, label: sk.name, cost: sk.cost, desc: sk.desc });
      }
    }
    if (!side.npUsed) moves.push({ type: 'np', label: `NP: ${def.np.name}`, cost: def.np.cost, desc: def.np.desc });
    if (this.canFlee(fight, side)) moves.push({ type: 'flee', label: 'หนี', cost: 0, desc: '1d6+AGI ชนะอีกฝ่าย = ออกจากการต่อสู้' });
    if (pl.seals > 0) moves.push({ type: 'seal_flee', label: 'Command Seal: หนี!', cost: 0, seal: true, desc: 'หนีสำเร็จแน่นอน (−1 Command Seal)' });
    return moves.map((m) => ({ ...m, ok: m.cost <= pl.mana || (m.type === 'np' && pl.seals > 0) }));
  }

  canFlee(fight, side) {
    const s = side.s;
    if (s.key === 'heracles') return false;
    if (s.key === 'cu' && this.night) return false;
    if (fight.chained === side) return false;
    return true;
  }

  combatCards(side) {
    if (side.s.key === 'heracles') return [];
    return [...new Set(side.pl.cards.filter((c) => CARDS[c].where === 'combat' || CARDS[c].where === 'any'))];
  }

  sideView(viewer, side) {
    return {
      id: side.pl.id, name: side.pl.name, label: this.servantLabel(viewer, side.pl),
      cls: side.s.cls, hp: Math.max(0, side.s.hp), maxHp: side.s.maxHp,
      // other masters' Command Seals stay hidden
      mana: viewer === side.pl ? side.pl.mana : null, seals: viewer === side.pl ? side.pl.seals : null,
    };
  }

  async fight(a, b, ambush) {
    const fight = { round: 0, ambush: ambush ? a : null, lines: [], over: false, chained: null };
    const A = this.newSide(a, null), B = this.newSide(b, null);
    A.enemy = B; B.enemy = A;
    fight.sides = [A, B];
    const watcher = [a, b].find((x) => x.isHuman && !x.autopilot);
    fight.watcher = watcher;
    // every line carries an HP snapshot (and optional fx) so the UI can replay the fight step by step
    const line = (t, cls = '', fx = null) => fight.lines.push({ t, cls, fx, hp: { [a.id]: Math.max(0, A.s.hp), [b.id]: Math.max(0, B.s.hp) } });

    // initiative
    const ia = this.rollDice(1, this.areaMod(a), false).total + a.servant.agi;
    const ib = this.rollDice(1, this.areaMod(b), false).total + b.servant.agi;
    A.init = ia + (ia === ib ? this.rng() : 0); B.init = ib;
    line(`ทอยความเร็ว: ${a.name} ${ia} · ${b.name} ${ib}${ambush ? ` · ${a.name} ซุ่มโจมตี ได้โจมตีก่อนในรอบแรก` : ''}`);
    if (watcher) this.emit('combatStart', { fight, view: this.fightView(fight, watcher) });

    for (fight.round = 1; fight.round <= MAX_ROUNDS; fight.round++) {
      line(`— รอบ ${fight.round} —`, 'round');
      for (const side of fight.sides) {
        const moves = this.legalMoves(fight, side);
        const cards = this.combatCards(side);
        const view = watcher ? this.fightView(fight, side.pl) : null;
        side.move = await this.ask(side.pl, 'combat', { fight, side, moves, cards, view });
      }
      this.resolveRound(fight, line);
      if (watcher) this.emit('combatRound', { fight, view: this.fightView(fight, watcher) });
      if (fight.over) break;
    }
    if (!fight.over) line('ครบ 3 รอบ ต่างฝ่ายถอยออกไป', 'end');
    // public summary for those who were not in the fight
    const sum = fight.result || `${a.name} vs ${b.name} ไม่มีใครตาย`;
    this.log(sum, null, 'fight');
    if (watcher) await this.ask(watcher, 'combatEnd', { fight, view: this.fightView(fight, watcher) });
  }

  fightView(fight, viewer) {
    const me = fight.sides.find((x) => x.pl === viewer) || fight.sides[0];
    return { round: fight.round, me: this.sideView(viewer, me), foe: this.sideView(viewer, me.enemy), lines: [...fight.lines], over: fight.over };
  }

  sanitizeMove(fight, side, m) {
    const pl = side.pl;
    const legal = this.legalMoves(fight, side);
    m = m || { type: 'attack' };
    let pick = legal.find((x) => x.type === m.type && (x.type !== 'skill' || x.skillId === m.skillId));
    const boost = !!m.boost && pl.seals > (pick?.type === 'seal_flee' ? 1 : 0);
    if (pick && pick.type === 'np' && !(boost || pl.mana >= pick.cost)) pick = null;
    if (pick && pick.type !== 'np' && pick.cost > pl.mana) pick = null;
    if (!pick) pick = legal[0];
    const cards = this.combatCards(side);
    const card = cards.includes(m.card) ? m.card : null;
    const sealHeal = !!m.sealHeal && this.canSealHeal(pl) && pl.seals > (boost ? 1 : 0) + (pick.type === 'seal_flee' ? 1 : 0);
    return { ...pick, boost: boost && pick.type !== 'seal_flee' && pick.type !== 'flee', card, sealHeal };
  }

  resolveRound(fight, line) {
    const [A, B] = fight.sides;
    for (const side of fight.sides) side.move = this.sanitizeMove(fight, side, side.move);
    fight.chained = null;
    const flags = new Map(fight.sides.map((s) => [s, { dodge: false, shroud: false, dr: 0, lucky: false, canceled: false, debuffAtk: 0, defending: false, defendRoll: null }]));

    // costs, free actions and pre-round effects
    for (const side of fight.sides) {
      const { pl, s, move } = side;
      const f = flags.get(side);
      const name = pl.name;
      if (move.type === 'np' && move.boost) { pl.seals--; line(`${name} ใช้ Command Seal "เพิ่มพลัง!" ปลดปล่อย NP โดยไม่เสียมานา`, 'seal', { k: 'seal', who: pl.id, label: 'เพิ่มพลัง!' }); }
      else {
        pl.mana -= move.cost;
        if (move.boost) { pl.seals--; line(`${name} ใช้ Command Seal "เพิ่มพลัง!" (+2 ทุกลูกเต๋ารอบนี้)`, 'seal', { k: 'seal', who: pl.id, label: 'เพิ่มพลัง!' }); }
      }
      if (move.type === 'seal_flee') pl.seals--;
      if (move.sealHeal) {
        pl.seals--;
        this.heal(s, Math.round(s.maxHp * 0.6));
        line(`${name} ใช้ Command Seal "รักษา!" HP → ${s.hp}`, 'seal', { k: 'heal', to: pl.id, label: 'รักษา!' });
      }
      if (move.card) {
        const c = move.card;
        pl.cards.splice(pl.cards.indexOf(c), 1);
        line(`${name} ใช้การ์ด ${CARDS[c].name}`, 'card', { k: 'card', who: pl.id, label: CARDS[c].name });
        if (c === 'mana_vial') this.gainMana(pl, 5);
        if (c === 'potion') this.heal(s, 30);
        if (c === 'charm') f.lucky = true;
        if (c === 'shroud') f.shroud = true;
        if (c === 'scroll') side.fled = true;
        if (c === 'gem' || c === 'black_keys') {
          const r = c === 'gem' ? this.rollDice(3, 0, false) : this.rollDice(1, 0, false);
          const dmg = (r.total + (c === 'black_keys' ? 2 : 0)) * 2;
          side.pendingDirect = { dmg, dice: r.dice };
        }
      }
      if (move.type === 'defend' || (move.type === 'skill' && move.skillId === 'instinct')) f.defending = true;
      // buff skills
      if (move.type === 'skill') {
        const id = move.skillId;
        const foe = flags.get(side.enemy);
        if (id === 'dragon_blood') f.dr += 5;
        if (id === 'valor') side.atkBuffs.push({ v: 2, rounds: 2 });
        if (id === 'runes') side.defBuffs.push({ v: 2, rounds: 2 });
        if (id === 'charisma') { side.atkBuffs.push({ v: 1, rounds: 99 }); side.defBuffs.push({ v: 1, rounds: 99 }); }
        if (id === 'madness') { side.atkBuffs.push({ v: 2, rounds: 99 }); side.defBuffs.push({ v: -1, rounds: 99 }); }
        if (id === 'love_spot') foe.debuffAtk += 1;
        if (id === 'chains') fight.chained = side.enemy;
        if (id === 'poison') { side.enemy.s.poison = 2; line(`${side.enemy.pl.name}: Servant ติดพิษ (−5 HP ทุกเฟส 2 เฟส)`, 'bad'); }
        if (id === 'minds_eye') {
          const r = this.d6();
          f.dodge = r >= 4;
          line(`${name}: ใจนิ่ง ทอย [${r}] ${f.dodge ? '→ หลบได้ทั้งรอบ' : '→ ไม่สำเร็จ'}`, '', f.dodge ? { k: 'buff', who: pl.id, label: 'หลบ!' } : null);
        }
        if (id === 'mystic_eyes') {
          if (this.knowsName(side.enemy.pl, pl)) line(`${side.enemy.pl.name} รู้ชื่อจริงของ Medusa สายตามนตร์ไม่ได้ผล`);
          else {
            const r = this.d6();
            if (r <= 2) { foe.canceled = true; line(`สายตามนตร์! ${side.enemy.pl.name} ทอย [${r}] → กลายเป็นหิน เสียรอบนี้`, 'bad', { k: 'stun', to: side.enemy.pl.id }); }
            else line(`สายตามนตร์: ${side.enemy.pl.name} ทอย ${r} ต้านได้`);
          }
        }
        this.witness(side, `${move.label}`);
      }
    }

    // a Command Seal escape or the teleport scroll ends the fight before blows land
    for (const side of fight.sides) {
      if (side.move.type === 'seal_flee' || side.fled) {
        side.fled = true;
        side.pl.fled = true;
        line(`${side.pl.name} ${side.move.type === 'seal_flee' ? 'ใช้ Command Seal "หนี!"' : 'ใช้ม้วนคาถา'} หายตัวไปจากการต่อสู้`, 'seal', { k: 'flee', who: side.pl.id });
        fight.over = true;
        fight.result = `${side.pl.name} หนีจากการต่อสู้กับ ${side.enemy.pl.name}`;
      }
    }
    if (fight.over) { this.endRoundBuffs(fight); return; }

    // direct damage from cards
    for (const side of fight.sides) {
      if (side.pendingDirect) {
        const { dmg, dice } = side.pendingDirect;
        side.pendingDirect = null;
        const f = flags.get(side.enemy);
        const real = f.shroud ? 0 : dmg;
        this.damage(fight, side, side.enemy, real, line, `การ์ดทอย [${dice.join(',')}] → ดาเมจ ${real}`);
        if (fight.over) { this.endRoundBuffs(fight); return; }
      }
    }

    // DoT from last round (Gilles' sea horror)
    for (const side of fight.sides) {
      if (side.dot) {
        const r = this.rollDice(2, 0, false);
        side.dot = 0;
        const dmg = flags.get(side.enemy).shroud ? 0 : this.applyResist(side, side.enemy, r.total * 3);
        this.damage(fight, side, side.enemy, dmg, line, `สัตว์ประหลาดใต้ทะเลจู่โจมต่อ [${r.dice.join(',')}] → ดาเมจ ${dmg}`);
        if (fight.over) { this.endRoundBuffs(fight); return; }
      }
    }

    // defence rolls (rolled once, before blows)
    for (const side of fight.sides) {
      const f = flags.get(side);
      if (!f.defending) continue;
      const mod = this.areaMod(side.pl) + (side.move.boost ? 2 : 0);
      const lucky = f.lucky || side.move.skillId === 'instinct';
      const r = this.rollDice(1, mod, lucky);
      f.defendRoll = r.total + this.stat(side, 'def') * 2;
      line(`${side.pl.name} ตั้งป้องกัน ทอย [${r.dice.join(',')}] → ลดดาเมจ ${f.defendRoll}`, '', { k: 'guard', who: side.pl.id });
    }

    // action order
    const prio = (side) => {
      let p = side.init;
      const m = side.move;
      if (m.skillId === 'charge') p += 100;
      if (m.type === 'np' && side.s.def.np.special === 'first') p += 100;
      if (m.skillId === 'assassinate' && fight.ambush === side.pl && fight.round === 1) p += 100;
      if (fight.round === 1 && fight.ambush === side.pl) p += 50;
      if (fight.round === 1 && side.s.cls === 'Archer') p += 40;
      return p;
    };
    const order = [A, B].sort((x, y) => prio(y) - prio(x));

    for (const side of order) {
      if (fight.over) break;
      const f = flags.get(side);
      if (side.s.hp <= 0) continue;
      if (f.canceled) { line(`${side.pl.name} ขยับไม่ได้รอบนี้`); continue; }
      this.doAction(fight, side, flags, line);
    }
    this.endRoundBuffs(fight);
  }

  endRoundBuffs(fight) {
    for (const side of fight.sides) {
      for (const list of [side.atkBuffs, side.defBuffs]) {
        for (const b of list) b.rounds--;
        for (let i = list.length - 1; i >= 0; i--) if (list[i].rounds <= 0) list.splice(i, 1);
      }
    }
  }

  witness(side, what) {
    const foe = side.enemy.pl;
    const uid = side.s.uid;
    foe.seen[uid] = foe.seen[uid] || new Set();
    foe.seen[uid].add(what);
  }

  applyResist(src, dst, dmg) {
    if (src.s.cls === 'Caster') {
      if (dst.s.cls === 'Saber') dmg = Math.floor(dmg / 2);
      else if (dst.s.cls === 'Lancer') dmg = Math.floor(dmg * 0.75);
    }
    return dmg;
  }

  doAction(fight, side, flags, line) {
    const { pl, s, move } = side;
    const foe = side.enemy;
    const ff = flags.get(foe);
    const f = flags.get(side);
    const mod = this.areaMod(pl) + (move.boost ? 2 : 0);
    let atk = this.stat(side, 'atk') - f.debuffAtk;
    if (s.key === 'medea' && fight.round === 1) atk -= 1;

    if (move.type === 'defend' || move.skillId === 'instinct') return; // already rolled
    if (move.type === 'flee') {
      const rider = s.cls === 'Rider' ? 2 : 0;
      const mine = this.rollDice(1, mod, f.lucky).total + s.agi + rider;
      const theirs = this.rollDice(1, this.areaMod(foe.pl), false).total + foe.s.agi;
      if (mine > theirs) {
        side.fled = true; pl.fled = true; fight.over = true;
        line(`${pl.name} หนี! ทอย ${mine} ชนะ ${theirs} → หนีสำเร็จ`, 'seal', { k: 'flee', who: pl.id });
        fight.result = `${pl.name} หนีจากการต่อสู้กับ ${foe.pl.name}`;
      } else line(`${pl.name} พยายามหนี ทอย ${mine} แพ้ ${theirs} → หนีไม่พ้น`, 'bad');
      return;
    }
    if (move.type === 'skill') {
      const sk = s.def.skills.find((x) => x.id === move.skillId);
      if (sk.kind === 'heal') {
        this.heal(s, sk.amount);
        line(`${pl.name}: ${sk.name} ฟื้น HP ${sk.amount} → ${s.hp}`, 'good', { k: 'heal', to: pl.id, label: sk.name });
        return;
      }
      if (sk.kind === 'dmg') {
        const hits = sk.hits || 1;
        for (let h = 0; h < hits && !fight.over; h++) {
          const r = this.rollDice(sk.dice, mod, f.lucky);
          let val = r.total + (sk.addAtk ? atk : 0) + (sk.bonus || 0);
          let dmg = val * 3;
          if (sk.ambushX2 && fight.ambush === pl && fight.round === 1) dmg *= 2;
          dmg = this.mitigate(fight, side, foe, dmg, ff, false, false);
          this.damage(fight, side, foe, dmg, line, `${pl.name}: ${sk.name} ทอย [${r.dice.join(',')}]${mod ? ` (${mod > 0 ? '+' : ''}${mod}/ลูก)` : ''} → ${val} → ดาเมจ ${dmg}`);
        }
        if (sk.dot) side.dot = 1;
        return;
      }
      // buff skills fall through to a normal attack
    }
    if (move.type === 'np') {
      side.npUsed = true;
      const np = s.def.np;
      line(`${pl.name} ปลดปล่อย Noble Phantasm!`, 'np', { k: 'np', who: pl.id, name: np.name });
      this.revealByNP(side, line);
      const bi = foe.pl.cards.indexOf('origin_bullet');
      if (bi >= 0) {
        foe.pl.cards.splice(bi, 1);
        line(`${foe.pl.name} ยิงกระสุนต้นกำเนิด! ${np.name} ถูกยกเลิก`, 'bad');
        return;
      }
      const n = np.special === 'dice5' ? 5 : 4;
      const r = this.rollDice(n, mod, f.lucky);
      const val = r.total + atk + (np.special === 'extra' ? 2 : 0);
      let dmg = val * 3;
      const pierce = np.special === 'pierce';
      dmg = this.mitigate(fight, side, foe, dmg, ff, pierce, np.name === 'Gáe Bolg');
      if (np.special === 'dispel') { foe.atkBuffs.length = 0; foe.defBuffs.length = 0; }
      this.damage(fight, side, foe, dmg, line, `✸ ${pl.name}: Noble Phantasm "${np.name}" ทอย [${r.dice.join(',')}] → ${val} → ดาเมจ ${dmg}`, 'np');
      if (np.special === 'drain') { this.heal(s, 15); line(`${pl.name} ดูดพลังฟื้น HP 15`, 'good', { k: 'heal', to: pl.id }); }
      return;
    }
    // normal attack (also after buff skills)
    const r = this.rollDice(1, mod, f.lucky);
    const val = r.total + atk;
    let dmg = this.mitigate(fight, side, foe, val * 3, ff, false, false);
    this.damage(fight, side, foe, dmg, line, `${pl.name} โจมตี ทอย [${r.dice.join(',')}]${mod ? ` (${mod > 0 ? '+' : ''}${mod}/ลูก)` : ''} +ATK ${atk} → ${val} → ดาเมจ ${dmg}`);
  }

  mitigate(fight, side, foe, dmg, ff, pierce, sure) {
    if (ff.shroud) return 0;
    if (ff.dodge && !sure) return 0;
    if (!pierce) dmg -= ff.defending ? ff.defendRoll : this.stat(foe, 'def');
    dmg = this.applyResist(side, foe, dmg);
    // weaknesses that only matter when the attacker knows the true name
    if (this.knowsName(side.pl, foe.pl)) {
      if (foe.s.key === 'diarmuid' && side.s.cls === 'Saber') dmg += 3;
      if (foe.s.key === 'siegfried' && fight.ambush === side.pl && fight.round === 1) dmg *= 2;
    }
    dmg -= ff.dr;
    return Math.max(0, dmg);
  }

  revealByNP(side, line) {
    const s = side.s;
    if (s.revealed) return;
    if (s.key === 'lancelot' && !s.namelessUsed) {
      s.namelessUsed = true;
      line(`${side.pl.name}: ไร้นาม — ชื่อจริงยังถูกปกปิด`);
      return;
    }
    s.revealed = true;
    line(`ชื่อจริงถูกเปิดเผย: ${s.def.name}! จุดอ่อน: ${s.def.weakness}`, 'reveal', { k: 'reveal', who: side.pl.id, name: s.def.name });
    this.log(`✸ ${side.pl.name} ปลดปล่อย ${s.def.np.name} — Servant คือ ${s.def.name} (${s.cls})`, null, 'reveal');
  }

  damage(fight, src, dst, dmg, line, text, cls = '') {
    dst.s.hp -= dmg;
    line(`${text} · ${dst.pl.name} HP ${Math.max(0, dst.s.hp)}/${dst.s.maxHp}`, cls, { k: 'hit', from: src.pl.id, to: dst.pl.id, amt: dmg, big: cls === 'np' });
    const s = dst.s;
    if (s.hp > 0 && s.hp < 20 && s.key === 'cu' && !s.battleContUsed) {
      s.battleContUsed = true;
      this.heal(s, 15);
      line(`${dst.pl.name}: การรบต่อเนื่อง ฟื้น HP 15 → ${s.hp}`, 'good', { k: 'heal', to: dst.pl.id });
    }
    if (s.hp <= 0) {
      const died = this.servantDies(dst.pl, src.pl);
      if (died) {
        fight.over = true;
        fight.result = `${src.pl.name} กำจัด Servant ของ ${dst.pl.name}`;
        line(`☠ Servant ของ ${dst.pl.name} พ่ายแพ้!`, 'death', { k: 'death', to: dst.pl.id });
      } else line(`${dst.pl.name}: God Hand! ฟื้นคืนชีพ HP ${s.hp}`, 'good', { k: 'heal', to: dst.pl.id, label: 'God Hand!' });
    }
  }
}
