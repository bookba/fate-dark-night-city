// Game engine for design v1.1: owns all state, shuffles, rolls and resolves.
// No DOM code, so it can run in the browser, in scripts/sim.js, or on a server.
//
// Every step is a simultaneous choice: the engine asks every player through
// `decide(game, player, kind, ctx)` (bots answer at once, the human UI with a
// Promise), and only then resolves everything in one go.

import {
  AREAS, AREA_KEYS, FIELDS, capacityFor, SERVANTS, SERVANT_KEYS, CLASS_HP, buildDeck, TYPES,
  SITUATIONS, SITUATION_KEYS, EVENTS, ITEMS, ITEM_KEYS, QUESTS, QUEST_KEYS, MASTER_NAMES,
  MANA_START, MANA_MAX, HAND_SIZE, ITEM_MAX, SEAL_MAX, DEATHS_FOR_GRAIL, MOVE_COST, OFFER_PRICES,
  QUEST_DEPOSIT, MONSTER_BASE,
} from './data.js';

export const LAST_DAY = 8;

export class Game {
  constructor({ humanName = 'เอมิยะ', rng = Math.random, decide, onEvent = () => {}, humanCount = 1 }) {
    this.rng = rng;
    this.decide = decide;
    this.onEvent = onEvent;
    this.day = 1;
    this.half = 'day';
    this.stage = 'setup';
    this.deaths = 0;
    this.uid = 0;
    this.cardId = 0;
    this.pool = [...SERVANT_KEYS];
    this.flags = { miyama: null, shinto: null };
    this.grail = { appeared: false, pending: false, area: null, holder: null, endDay: LAST_DAY, appearedDay: null };
    this.situation = null;
    this.shadowArea = null;
    this.events = {};
    this.shintoOpen = false;
    this.quests = [];
    this.cap = capacityFor(8);
    this.results = [];
    this.history = [];
    this.logs = [];
    this.eliminatedOrder = [];
    this.over = false;
    const names = [...MASTER_NAMES];
    this.players = Array.from({ length: 8 }, (_, i) => ({
      id: i,
      name: i < humanCount ? humanName : names[i - humanCount],
      isHuman: i < humanCount,
      autopilot: false,
      mana: MANA_START,
      seals: 3,
      items: [],
      servant: null,
      deck: [], discard: [], hand: [], npSide: null,
      out: false,
      known: new Set(),
      area: null, dayArea: null, settled: false,
      buys: 0, churchToday: false, quest: null,
      catalystPending: false,
      kills: 0,
    }));
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
  get human() { return this.players.find((x) => x.isHuman); }
  alive() { return this.players.filter((x) => !x.out); }
  emit(type, data = {}) { this.onEvent({ type, ...data }); }
  log(text, to = null, cls = '') {
    const entry = { text, to, cls, day: this.day, half: this.half };
    this.logs.push(entry);
    this.emit('log', { entry });
  }
  async ask(player, kind, ctx = {}) { return await this.decide(this, player, kind, ctx); }
  gainMana(pl, n) { pl.mana = Math.max(0, Math.min(MANA_MAX, pl.mana + n)); }
  heal(s, n) { s.hp = Math.min(s.maxHp, s.hp + n); }
  areaOpen(a) {
    if (a === 'temple') return this.cap.temple > 0;
    if (a === 'church') return this.cap.church > 0;
    return this.cap.fields.includes(a);
  }
  capOf(a) { return a === 'temple' ? this.cap.temple : a === 'church' ? this.cap.church : Infinity; }

  knowsName(viewer, target) {
    const s = target.servant;
    return !!s && (viewer === target || s.revealed || viewer.known.has(s.uid));
  }
  servantLabel(viewer, target) {
    const s = target.servant;
    if (!s) return '—';
    return this.knowsName(viewer, target) ? `${s.def.name} (${s.cls})` : s.cls;
  }

  // ---------- Servants & decks ----------
  makeServant(key) {
    const def = SERVANTS[key];
    const maxHp = def.hp ?? CLASS_HP[def.cls];
    return { uid: ++this.uid, key, def, cls: def.cls, maxHp, hp: maxHp, revealed: false, pendingReveal: false, godHandUsed: false, namelessUsed: false, shown: [] };
  }

  summon(pl, key) {
    const choices = this.pool.length ? this.pool : SERVANT_KEYS;
    if (!key || !choices.includes(key)) key = this.pick(choices);
    this.pool = this.pool.filter((k) => k !== key);
    pl.servant = this.makeServant(key);
    pl.deck = this.shuffle(buildDeck(key).map((c) => ({ ...c, id: ++this.cardId })));
    pl.discard = [];
    pl.hand = [];
    pl.npSide = null;
    this.draw(pl, HAND_SIZE);
    this.log(`Servant ของคุณคือ ${pl.servant.def.name}`, [pl.id], 'me');
  }

  draw(pl, n) {
    for (let i = 0; i < n; i++) {
      if (!pl.deck.length) {
        if (!pl.discard.length) return;
        pl.deck = this.shuffle(pl.discard);
        pl.discard = [];
      }
      pl.hand.push(pl.deck.pop());
    }
  }

  // cards the player could put down tonight: hand + an NP already played before
  playable(pl) { return pl.npSide ? [...pl.hand, pl.npSide] : [...pl.hand]; }

  addItem(pl, key = null) {
    const k = key || this.pick(ITEM_KEYS);
    pl.items.push(k);
    return k;
  }

  // ---------- actions players may take during their choice ----------
  canSealHeal(pl) { return pl.seals > 0 && pl.servant && pl.servant.hp < pl.servant.maxHp; }
  sealHeal(pl) {
    if (!this.canSealHeal(pl)) return false;
    pl.seals--;
    this.heal(pl.servant, Math.ceil(pl.servant.maxHp / 2));
    this.log(`${pl.name} ใช้ Command Seal "รักษา!"`, null, 'seal');
    this.emit('update');
    return true;
  }

  dayItemUsable(pl, k) {
    if (!ITEMS[k].phase.includes('day')) return false;
    if (k === 'potion') return pl.servant.hp < pl.servant.maxHp;
    if (k === 'mana_vial') return pl.mana < MANA_MAX;
    return true;
  }

  useDayItem(pl, k, targetId = null) {
    const i = pl.items.indexOf(k);
    if (i < 0 || !this.dayItemUsable(pl, k)) return false;
    if (k === 'hero_record') {
      const t = this.players[targetId];
      if (!t || t.out || t === pl || !t.servant) return false;
      pl.known.add(t.servant.uid);
      const d = t.servant.def;
      this.log(`บันทึกวีรชน: ${t.name} ใช้ ${d.name} · NP ${d.np.name} · ถนัด ${AREAS[d.favored].name} · ไม่ถนัด ${AREAS[d.unfavored].name}`, [pl.id], 'me');
    }
    pl.items.splice(i, 1);
    if (k === 'mana_vial') this.gainMana(pl, 5);
    if (k === 'potion') this.heal(pl.servant, 5);
    this.log(`ใช้ไอเท็ม ${ITEMS[k].name}`, [pl.id], 'me');
    this.emit('update');
    return true;
  }

  offerPrice(pl) { return OFFER_PRICES[Math.min(pl.buys, OFFER_PRICES.length - 1)]; }

  // ---------- match flow ----------
  async run() {
    this.log('สงครามจอกศักดิ์สิทธิ์เริ่มต้น! มาสเตอร์ 8 คนอัญเชิญ Servant', null, 'sys');
    for (const pl of this.players) this.summon(pl);
    this.emit('update');
    await this.ask(this.human, 'intro', {});
    for (this.day = 1; this.day <= LAST_DAY; this.day++) {
      await this.runDay();
      await this.runNight();
      if (this.checkOver()) break;
    }
    this.finish();
  }

  checkOver() {
    return this.alive().length <= 1 || this.day >= this.grail.endDay;
  }

  morning() {
    this.half = 'day';
    this.cap = capacityFor(this.alive().length);
    // the Grail is announced the morning after it appears, face up on a battlefield
    if ((this.grail.pending || this.day === LAST_DAY) && !this.grail.appeared) {
      this.grail.appeared = true;
      this.grail.appearedDay = this.day;
      this.grail.area = this.pick(this.cap.fields);
      this.grail.endDay = Math.min(LAST_DAY, this.day + 1);
      const why = this.deaths >= DEATHS_FOR_GRAIL ? `Servant ตายครบ ${DEATHS_FOR_GRAIL} ครั้ง` : 'เข้าสู่วันที่ 8';
      this.log(`✦ จอกศักดิ์สิทธิ์ปรากฏที่${AREAS[this.grail.area].name}! (${why}) เกมจบเมื่อจบคืนวันที่ ${this.grail.endDay}`, null, 'grail');
    }
    if (this.grail.area && !this.cap.fields.includes(this.grail.area) && !this.grail.holder) this.grail.area = this.cap.fields[0];
    for (const f of FIELDS) if (!this.cap.fields.includes(f)) this.flags[f] = null;

    this.situation = this.pick(SITUATION_KEYS);
    this.shadowArea = this.situation === 'shadow' ? this.pick(this.cap.fields) : null;
    this.events = {};
    for (const f of this.cap.fields) this.events[f] = this.pick(EVENTS);
    this.shintoOpen = false;
    this.deathsToday = 0;
    this.quests = this.shuffle(QUEST_KEYS).slice(0, 3);
    for (const pl of this.alive()) {
      Object.assign(pl, { churchToday: false, area: null, settled: false, dayArea: null, choice: null, move: null, play: null, peek: null });
      if (this.situation === 'magic') this.gainMana(pl, 2);
      this.draw(pl, HAND_SIZE - pl.hand.length);
      while (pl.items.length > ITEM_MAX) {
        const k = pl.items.shift();
        this.log(`ไอเท็มเกิน ${ITEM_MAX} ใบ ทิ้ง ${ITEMS[k].name}`, [pl.id], 'me');
      }
    }
    const sit = SITUATIONS[this.situation];
    this.log(`── วันที่ ${this.day} · กลางวัน ──`, null, 'phase');
    this.log(`การ์ดสถานการณ์คืนนี้: ${sit.name} (${sit.text})${this.shadowArea ? ` ที่${AREAS[this.shadowArea].name}` : ''}`, null, 'sys');
    if (this.events.miyama) this.log(`การ์ดอีเวนต์ที่มิยามะ: ${this.events.miyama.name}`, null, 'sys');
  }

  async runDay() {
    this.morning();
    this.stage = 'choose';
    this.emit('phase');
    // ① everyone chooses at once (bots lock in first, so their "chosen" mark is honest)
    const order = [...this.alive()].sort((a, b) => a.isHuman - b.isHuman);
    for (const pl of order) {
      pl.choice = await this.ask(pl, 'day', {});
      pl.locked = true;
      this.emit('update');
    }
    for (const pl of this.alive()) pl.locked = false;
    this.resolveDay();
    this.stage = 'dayResult';
    this.emit('phase');
  }

  normalizeChoice(pl) {
    const c = pl.choice || {};
    const fields = this.cap.fields;
    const holder = this.grail.holder === pl;
    let backup = fields.includes(c.backup) ? c.backup : (fields.includes(pl.lastField) ? pl.lastField : this.pick(fields));
    let area = AREA_KEYS.includes(c.area) && this.areaOpen(c.area) ? c.area : backup;
    if (holder && !fields.includes(area)) area = backup;
    return { area, backup, church: c.church || null };
  }

  resolveDay() {
    const alive = this.alive();
    const want = new Map(alive.map((pl) => [pl, this.normalizeChoice(pl)]));
    const assign = new Map();
    const tie = new Map(alive.map((pl) => [pl, this.rng()]));
    const admit = (area, sortKey) => {
      const cands = alive.filter((pl) => want.get(pl).area === area).sort((a, b) => sortKey(a, b) || tie.get(a) - tie.get(b));
      cands.forEach((pl, i) => {
        if (i < this.capOf(area)) assign.set(pl, area);
        else {
          assign.set(pl, want.get(pl).backup);
          this.log(`${AREAS[area].name}เต็ม ${pl.name} ไปสนามรบสำรอง ${AREAS[want.get(pl).backup].name}`, null, 'sys');
        }
      });
    };
    admit('temple', (a, b) => a.mana - b.mana);
    admit('church', (a, b) => a.seals - b.seals || a.mana - b.mana);
    for (const pl of alive) if (!assign.has(pl)) assign.set(pl, want.get(pl).area);
    for (const pl of alive) {
      pl.area = pl.dayArea = assign.get(pl);
      pl.settled = true;
      if (FIELDS.includes(pl.area)) pl.lastField = pl.area;
    }
    for (const a of AREA_KEYS) {
      const here = alive.filter((pl) => pl.area === a);
      if (here.length) this.log(`${AREAS[a].name}: ${here.map((x) => `${x.name} [${x.servant.cls}]`).join(', ')}`, null, 'map');
    }
    // day results
    const temple = alive.filter((pl) => pl.area === 'temple');
    const share = temple.length === 1 ? 4 : temple.length === 2 ? 3 : 2;
    for (const pl of temple) { this.gainMana(pl, share); this.log(`วัดริวโด: แบ่งเลย์ไลน์ มานา +${share}`, [pl.id], 'me'); }
    for (const pl of alive.filter((x) => x.area === 'church')) {
      const ch = want.get(pl).church;
      if (!ch || this.grail.holder === pl || pl.churchToday) continue;
      this.churchAction(pl, ch);
    }
  }

  churchAction(pl, ch) {
    pl.churchToday = true;
    if (ch.type === 'offer') {
      const price = this.offerPrice(pl);
      if (pl.seals >= SEAL_MAX) return this.log('Command Seal เต็มแล้ว ถวายมานาไม่ได้', [pl.id], 'me');
      if (pl.mana < price) return this.log(`มานาไม่พอถวาย (ต้องใช้ ${price})`, [pl.id], 'bad');
      pl.mana -= price; pl.seals++; pl.buys++;
      this.log(`โบสถ์: ถวายมานา ${price} ได้ Command Seal 1 ดวง`, [pl.id], 'me');
      this.log(`${pl.name} ทำธุระที่โบสถ์`, null);
      return;
    }
    if (ch.type === 'quest') {
      const key = ch.quest;
      if (!this.quests.includes(key)) return;
      if (pl.quest) return this.log('ถือเควสได้ทีละ 1 เควส', [pl.id], 'bad');
      if (pl.mana < QUEST_DEPOSIT) return this.log('มานาไม่พอวางมัดจำเควส', [pl.id], 'bad');
      pl.mana -= QUEST_DEPOSIT;
      if (key === 'offering') {
        if (pl.items.length < 2 || pl.seals >= SEAL_MAX) {
          pl.mana += QUEST_DEPOSIT;
          return this.log('เครื่องบูชาต้องมีไอเท็ม 2 ใบและ Command Seal ไม่เต็ม', [pl.id], 'bad');
        }
        pl.items.splice(0, 2);
        this.completeQuest(pl, { key, progress: 0 });
        return;
      }
      pl.quest = { key, progress: 0, until: this.day + QUESTS[key].days - 1 };
      this.log(`รับเควส "${QUESTS[key].name}" (มัดจำ ${QUEST_DEPOSIT} มานา) ภายในวันที่ ${pl.quest.until}`, [pl.id], 'me');
      this.log(`${pl.name} ทำธุระที่โบสถ์`, null);
    }
  }

  completeQuest(pl, q) {
    pl.quest = null;
    pl.mana += QUEST_DEPOSIT;
    if (pl.seals < SEAL_MAX) pl.seals++;
    this.log(`เควส "${QUESTS[q.key].name}" สำเร็จ! ได้ Command Seal 1 ดวง และมัดจำคืน`, [pl.id], 'good');
  }

  // ---------- night ----------
  tiedDown(pl) {
    return this.alive().filter((x) => x.dayArea === pl.dayArea).length > 1;
  }

  moveOptions(pl) {
    const opts = { stay: true, move: [], escape: [], view: [] };
    const holder = this.grail.holder === pl;
    if (!this.tiedDown(pl) && this.situation !== 'fog' && pl.mana >= MOVE_COST) {
      opts.move = this.cap.fields.filter((f) => f !== pl.area);
    }
    if (pl.seals > 0 || pl.items.includes('scroll')) {
      opts.escape = AREA_KEYS.filter((a) => a !== pl.area && this.areaOpen(a) && !(holder && !FIELDS.includes(a)));
    }
    if (pl.area === 'church') opts.view = this.alive().filter((x) => x !== pl).map((x) => x.id);
    return opts;
  }

  async runNight() {
    this.half = 'night';
    this.shintoOpen = true;
    this.log(`── วันที่ ${this.day} · กลางคืน ──`, null, 'phase');
    if (this.events.shinto) this.log(`การ์ดอีเวนต์ที่ชินโตะเปิดแล้ว: ${this.events.shinto.name}`, null, 'sys');
    // ② move at once
    this.stage = 'move';
    this.emit('phase');
    const alive = this.alive();
    const order = [...alive].sort((a, b) => a.isHuman - b.isHuman);
    for (const pl of order) {
      const opts = this.moveOptions(pl);
      pl.move = (opts.move.length || opts.escape.length || opts.view.length) ? await this.ask(pl, 'move', { opts }) : null;
      pl.locked = true;
      this.emit('update');
    }
    for (const pl of alive) pl.locked = false;
    this.resolveMoves();
    // ③ card play at once
    this.fights = this.planFights();
    this.stage = 'cards';
    this.emit('phase');
    const fighters = this.fights.flatMap((f) => f.players);
    for (const pl of [...fighters].sort((a, b) => a.isHuman - b.isHuman)) {
      const fight = this.fights.find((f) => f.players.includes(pl));
      pl.play = await this.ask(pl, 'cards', { fight, cards: this.playable(pl) });
      pl.locked = true;
      this.emit('update');
    }
    for (const pl of fighters) pl.locked = false;
    // ④ reveal and resolve everything in one go
    this.results = this.fights.map((f) => this.resolveFight(f));
    this.soloRewards();
    this.endNight();
    this.stage = 'result';
    this.emit('night', { results: this.results });
    await this.ask(this.human, 'nightEnd', { results: this.results });
    // ⑤ automatic resummons
    for (const pl of this.alive().filter((x) => x.servant && x.servant.hp <= 0)) await this.resummon(pl);
    this.history[this.day] = { deaths: this.deathsToday, grail: this.grail.appearedDay === this.day };
    if (!this.grail.appeared && this.deaths >= DEATHS_FOR_GRAIL) this.grail.pending = true;
    this.emit('update');
  }

  resolveMoves() {
    const alive = this.alive();
    const dayCount = (a) => alive.filter((x) => x.dayArea === a).length;
    const escapes = [];
    for (const pl of alive) {
      const m = pl.move;
      const opts = this.moveOptions(pl);
      if (m?.view != null && opts.view.includes(m.view)) pl.peekTarget = m.view; else pl.peekTarget = null;
      if (!m || m.type === 'stay') continue;
      if (m.type === 'move' && opts.move.includes(m.to)) {
        pl.mana -= MOVE_COST;
        pl.area = m.to; pl.settled = false;
        this.log(`${pl.name} ย้ายไป${AREAS[m.to].name}`, null, 'move');
      } else if (m.type === 'escape' && opts.escape.includes(m.to)) {
        const scroll = m.scroll && pl.items.includes('scroll');
        if (!scroll && pl.seals <= 0) continue;
        escapes.push({ pl, to: m.to, scroll });
      }
    }
    const spend = (e) => { if (e.scroll) e.pl.items.splice(e.pl.items.indexOf('scroll'), 1); else e.pl.seals--; };
    const go = (e) => {
      spend(e);
      e.pl.area = e.to; e.pl.settled = false;
      this.log(`${e.pl.name} ${e.scroll ? 'ใช้ม้วนคาถา' : 'ใช้ Command Seal "หนี!"'} ไป${AREAS[e.to].name}`, null, 'seal');
    };
    for (const e of escapes.filter((x) => FIELDS.includes(x.to))) go(e);
    for (const a of ['temple', 'church']) {
      const list = escapes.filter((x) => x.to === a)
        .sort((x, y) => (a === 'temple' ? x.pl.mana - y.pl.mana : x.pl.seals - y.pl.seals || x.pl.mana - y.pl.mana) || this.rng() - 0.5);
      let free = Math.max(0, this.capOf(a) - dayCount(a));
      for (const e of list) {
        if (free > 0) { free--; go(e); } else this.log(`${AREAS[a].name}ไม่มีที่ว่าง ${e.pl.name} อยู่ที่เดิม`, [e.pl.id], 'bad');
      }
    }
    for (const pl of alive) if (FIELDS.includes(pl.area)) pl.lastField = pl.area;
    this.emit('update');
  }

  planFights() {
    const fights = [];
    for (const a of AREA_KEYS) {
      if (a === 'church' || !this.areaOpen(a)) continue;
      const players = this.alive().filter((x) => x.area === a);
      const monster = a === this.shadowArea;
      if (players.length + (monster ? 1 : 0) >= 2 && players.length >= 1) fights.push({ area: a, players, monster });
    }
    // the church occupant sees one master's hand at the start of card play
    for (const pl of this.alive().filter((x) => x.area === 'church' && x.peekTarget != null)) {
      const t = this.players[pl.peekTarget];
      pl.peek = { id: t.id, name: t.name, cards: this.playable(t).map((c) => c.name) };
      this.log(`โบสถ์: มือของ ${t.name} คือ ${pl.peek.cards.join(', ') || '(ว่าง)'}`, [pl.id], 'me');
    }
    return fights;
  }

  // area bonus + other fixed modifiers (design 6, 6.1)
  fixedParts(pl, area) {
    const parts = [];
    const s = pl.servant;
    if (FIELDS.includes(area)) {
      if (pl.settled && pl.dayArea === area && this.flags[area] === pl.id) parts.push({ label: 'ยึดครอง (ธง)', v: 3 });
      else if (pl.settled && pl.dayArea === area) parts.push({ label: 'ตั้งหลัก', v: 1 });
      else parts.push({ label: 'บุกเข้ามา', v: 0 });
    }
    if (s.def.favored === area) parts.push({ label: 'พื้นที่ถนัด', v: 2 });
    if (s.def.unfavored === area) parts.push({ label: 'พื้นที่ไม่ถนัด', v: -2 });
    if (s.revealed) parts.push({ label: 'ชื่อจริงถูกเปิด', v: -2 });
    if (this.grail.holder === pl) parts.push({ label: 'ผู้ถือจอก', v: 3 });
    return parts;
  }

  // card part of the total, shared by the UI preview and bots
  cardParts(cards) {
    const parts = [];
    const sit = this.situation;
    const typeBonus = { force: 'F', speed: 'A', magic: 'M' }[sit];
    cards.forEach((c, i) => {
      parts.push({ label: c.name, v: c.power });
      if (typeBonus && c.type === typeBonus) parts.push({ label: SITUATIONS[sit].name, v: 2 });
      const other = cards[1 - i];
      if (c.eff.pair && other && other.type === c.eff.pair.type) parts.push({ label: `${c.name} คู่${TYPES[other.type].name}`, v: c.eff.pair.bonus });
    });
    if (sit === 'onemind' && cards.length === 2 && cards[0].type === cards[1].type) parts.push({ label: 'ใจเดียว', v: 3 });
    return parts;
  }

  extraDice(pl, cards, items) {
    let n = this.situation === 'moon' ? 1 : 0;
    for (const c of cards) n += c.eff.die || 0;
    if (items.includes('charm')) n++;
    return n;
  }

  sanitizePlay(pl, play) {
    const playable = this.playable(pl);
    const ids = [...new Set((play?.cards || []).slice(0, 2))];
    let cards = ids.map((id) => playable.find((c) => c.id === id)).filter(Boolean);
    // drop cards the player cannot pay for (most expensive first)
    while (cards.reduce((a, c) => a + c.cost, 0) > pl.mana) cards = cards.sort((a, b) => a.cost - b.cost).slice(0, -1);
    const boost = !!play?.boost && pl.seals > 0;
    const sealHeal = !!play?.sealHeal && pl.seals > (boost ? 1 : 0) && pl.servant.hp < pl.servant.maxHp;
    const items = [...new Set(play?.items || [])].filter((k) => pl.items.includes(k) && ITEMS[k].phase.includes('fight'));
    return { cards, boost, sealHeal, items };
  }

  resolveFight(f) {
    const res = { area: f.area, entries: [], monster: null, winners: [], text: [] };
    const ents = f.players.map((pl) => {
      const play = this.sanitizePlay(pl, pl.play);
      const s = pl.servant;
      const e = { pl, id: pl.id, name: pl.name, cls: s.cls, label: null, play, cards: play.cards.map((c) => ({ ...c })), hpBefore: s.hp, maxHp: s.maxHp, parts: [] };
      // pay
      pl.mana -= play.cards.reduce((a, c) => a + c.cost, 0);
      if (play.boost) pl.seals--;
      if (play.sealHeal) pl.seals--;
      for (const k of play.items) pl.items.splice(pl.items.indexOf(k), 1);
      return e;
    });
    // 1. heals
    for (const e of ents) {
      const s = e.pl.servant;
      let h = 0;
      if (e.play.sealHeal) h += Math.ceil(s.maxHp / 2);
      if (e.play.items.includes('potion')) h += 5;
      for (const c of e.play.cards) h += c.eff.heal || 0;
      const before = s.hp;
      this.heal(s, h);
      e.healed = s.hp - before;
    }
    // 2. dice
    for (const e of ents) {
      const n = 1 + this.extraDice(e.pl, e.play.cards, e.play.items);
      e.dice = Array.from({ length: n }, () => this.d6());
      e.die = Math.max(...e.dice);
    }
    // 3. totals
    for (const e of ents) {
      e.parts = [...this.cardParts(e.play.cards), ...this.fixedParts(e.pl, f.area)];
      if (e.play.boost) e.parts.push({ label: 'เพิ่มพลัง!', v: 4 });
      if (e.play.items.includes('gem')) e.parts.push({ label: 'อัญมณีของโทซากะ', v: 4 });
      e.parts.push({ label: `ลูกเต๋า`, v: e.die });
    }
    for (const e of ents) {
      for (const o of ents) {
        if (o === e) continue;
        for (const c of o.play.cards) if (c.eff.foe) e.parts.push({ label: `${c.name} ของ ${o.name}`, v: -c.eff.foe });
      }
      e.total = e.parts.reduce((a, p) => a + p.v, 0);
    }
    if (f.monster) {
      const d = this.d6();
      res.monster = { total: MONSTER_BASE + d, dice: [d] };
    }
    const all = [...ents.map((e) => e.total), res.monster ? res.monster.total : -Infinity];
    const max = Math.max(...all);
    const monsterTop = res.monster && res.monster.total === max;
    const top = ents.filter((e) => e.total === max);
    const unique = !monsterTop && top.length === 1 ? top[0] : null;
    res.max = max;
    res.winners = top.map((e) => e.id);
    res.monsterWon = monsterTop;
    // reveal true names after the totals are fixed (weakness applies from the next fight)
    for (const e of ents) {
      for (const c of e.play.cards) e.pl.servant.shown.push(c.name);
      if (e.play.cards.some((c) => c.reveal)) this.revealName(e.pl);
    }
    // 4. damage
    for (const e of ents) {
      const s = e.pl.servant;
      e.dmg = 0;
      if (e.total < max) {
        let d = Math.max(1, max - e.total);
        if (unique) for (const c of unique.play.cards) d += c.eff.splash || 0;
        for (const c of e.play.cards) d -= c.eff.reduce || 0;
        if (e.play.items.includes('shroud')) d = 0;
        e.dmg = Math.max(0, d);
      }
      for (const c of e.play.cards) e.dmg += c.eff.selfHit || 0;
      s.hp -= e.dmg;
      e.result = monsterTop ? (e.total === max ? 'tie' : 'lose') : top.includes(e) ? (unique ? 'win' : 'tie') : 'lose';
    }
    const revealedFoes = new Set(ents.filter((e) => e.pl.servant.revealed && !e.newReveal).map((e) => e.id));
    // deaths
    const dead = [];
    for (const e of ents) {
      const s = e.pl.servant;
      if (s.hp > 0) continue;
      if (s.def.godHand && !s.godHandUsed) {
        s.godHandUsed = true; s.hp = 6;
        e.revived = true;
        res.text.push(`${e.name}: Servant ฟื้นจากความตาย (God Hand) HP 6`);
        if (!s.revealed) this.revealName(e.pl);
        continue;
      }
      s.hp = 0;
      e.died = true;
      dead.push(e);
      this.deaths++;
      this.deathsToday = (this.deathsToday || 0) + 1;
    }
    // 5. rewards, loot, flag, Grail, quests
    if (monsterTop) res.text.push('มอนสเตอร์ชนะ ไม่มีใครได้รางวัล');
    else this.giveReward(f, top, ents.length + (f.monster ? 1 : 0), res);
    if (unique && dead.length) {
      for (const d of dead) {
        const take = this.situation === 'blood' ? d.pl.mana : Math.floor(d.pl.mana / 2);
        d.pl.mana -= take;
        this.gainMana(unique.pl, take);
        let itemText = '';
        if (d.pl.items.length) {
          const k = d.pl.items.splice(Math.floor(this.rng() * d.pl.items.length), 1)[0];
          unique.pl.items.push(k);
          itemText = ` และ${ITEMS[k].name}`;
        }
        unique.pl.kills++;
        if (take || itemText) res.text.push(`${unique.name} ยึด${take ? `มานา ${take}` : ''}${itemText} จาก ${d.name}`);
      }
    }
    if (FIELDS.includes(f.area)) {
      const prev = this.flags[f.area];
      if (monsterTop) this.flags[f.area] = null;
      else if (unique) this.flags[f.area] = unique.id;
      else this.flags[f.area] = top.some((e) => e.id === prev) ? prev : null;
    }
    const holder = this.grail.holder;
    const holderEnt = ents.find((e) => e.pl === holder);
    if (holderEnt && !top.includes(holderEnt)) {
      if (unique) { this.grail.holder = unique.pl; res.text.push(`✦ จอกศักดิ์สิทธิ์ตกเป็นของ ${unique.name}`); }
      else if (holderEnt.died || monsterTop) { this.grail.holder = null; this.grail.area = f.area; res.text.push('✦ จอกหลุดมือ วางอยู่ที่สนามรบนี้'); }
    } else if (!holder && this.grail.appeared && this.grail.area === f.area && unique) {
      this.grail.holder = unique.pl;
      res.text.push(`✦ ${unique.name} ครอบครองจอกศักดิ์สิทธิ์!`);
    }
    if (unique) {
      const q = unique.pl.quest;
      if (q) {
        if (q.key === 'bounty' && dead.length) q.progress++;
        if (q.key === 'fields' && FIELDS.includes(f.area)) q.progress++;
        if (q.key === 'revealed' && ents.some((e) => e !== unique && revealedFoes.has(e.id))) q.progress++;
        if (q.progress >= QUESTS[q.key].need) this.completeQuest(unique.pl, q);
      }
    }
    // after-fight card effects, discard
    for (const e of ents) {
      for (const c of e.play.cards) if (c.eff.mana) this.gainMana(e.pl, c.eff.mana);
      const pl = e.pl;
      for (const c of e.play.cards) {
        const hi = pl.hand.findIndex((h) => h.id === c.id);
        if (hi >= 0) pl.hand.splice(hi, 1);
        if (c.kind === 'np') pl.npSide = c; else pl.discard.push(c);
      }
      e.hpAfter = Math.max(0, pl.servant.hp);
      e.label = pl.servant.revealed ? `${pl.servant.def.name} (${pl.servant.cls})` : pl.servant.cls;
      e.trueName = pl.servant.def.name;
    }
    res.entries = ents.map(({ pl, play, ...rest }) => ({ ...rest, boost: play.boost, sealHeal: play.sealHeal, items: play.items }));
    const names = ents.map((e) => e.name).join(' vs ');
    const outcome = monsterTop ? 'มอนสเตอร์ชนะ' : unique ? `${unique.name} ชนะ` : `เสมอ (${top.map((e) => e.name).join(', ')})`;
    this.log(`⚔ ${AREAS[f.area].name}: ${names}${f.monster ? ' + มอนสเตอร์' : ''} → ${outcome}`, null, 'fight');
    for (const e of ents) if (e.died) this.log(`☠ Servant ของ ${e.name} ถูกกำจัด (ตายรวม ${this.deaths})`, null, 'death');
    for (const t of res.text) this.log(t, null, t.startsWith('✦') ? 'grail' : '');
    return res;
  }

  revealName(pl) {
    const s = pl.servant;
    if (s.revealed) return;
    if (s.def.nameless && !s.namelessUsed) { s.namelessUsed = true; return; }
    s.revealed = true;
    this.log(`✸ ชื่อจริงถูกเปิดเผย: Servant ของ ${pl.name} คือ ${s.def.name}`, null, 'reveal');
  }

  applyEvent(pl, ev, share = 1) {
    const got = [];
    if (ev.mana) { const m = Math.ceil(ev.mana / share); this.gainMana(pl, m); got.push(`มานา +${m}`); }
    if (ev.items) { const k = this.addItem(pl); got.push(ITEMS[k].name); }
    if (ev.heal) { this.heal(pl.servant, ev.heal); got.push(`HP +${ev.heal}`); }
    if (ev.draw) { this.draw(pl, ev.draw); got.push(`จั่ว ${ev.draw} ใบ`); }
    return got.join(', ');
  }

  giveReward(f, top, size, res) {
    const n = top.length;
    for (const e of top) {
      const pl = e.pl;
      let got;
      if (f.area === 'temple') { const m = Math.ceil(4 / n); this.gainMana(pl, m); got = `เลย์ไลน์ มานา +${m}`; }
      else got = this.applyEvent(pl, this.events[f.area], n);
      if (size >= 3) { const b = Math.ceil(2 / n); this.gainMana(pl, b); got += ` · ตะลุมบอน +${b} มานา`; }
      if (f.monster && n === 1) { const k = this.addItem(pl); got += ` · ปราบมอนสเตอร์ได้${ITEMS[k].name}`; }
      res.text.push(`${e.name} ได้รางวัล: ${got}`);
    }
  }

  soloRewards() {
    for (const f of this.cap.fields) {
      const here = this.alive().filter((x) => x.area === f);
      if (here.length !== 1 || this.shadowArea === f) continue;
      const pl = here[0];
      const got = this.applyEvent(pl, this.events[f]);
      this.flags[f] = pl.id;
      this.log(`${pl.name} อยู่${AREAS[f].name}คนเดียว ได้ ${got} และธงยึดครอง`, null, 'good');
      if (this.grail.appeared && !this.grail.holder && this.grail.area === f) {
        this.grail.holder = pl;
        this.log(`✦ ${pl.name} ครอบครองจอกศักดิ์สิทธิ์!`, null, 'grail');
      }
    }
  }

  endNight() {
    for (const f of FIELDS) {
      const owner = this.flags[f];
      if (owner != null && this.players[owner].area !== f) this.flags[f] = null;
    }
    for (const pl of this.alive()) {
      if (pl.quest && this.day >= pl.quest.until) {
        this.log(`เควส "${QUESTS[pl.quest.key].name}" หมดเวลา เสียมัดจำ`, [pl.id], 'bad');
        pl.quest = null;
      }
    }
  }

  async resummon(pl) {
    // the old Servant does not return to the pool
    if (pl.seals <= 0) return this.eliminate(pl, 'Command Seal หมด อัญเชิญไม่ได้');
    pl.seals--;
    let key = null;
    const ci = pl.items.indexOf('catalyst');
    if (ci >= 0) {
      pl.items.splice(ci, 1);
      const src = this.pool.length ? this.pool : SERVANT_KEYS;
      const choices = this.shuffle(src).slice(0, 3);
      key = await this.ask(pl, 'catalyst', { choices });
      if (!choices.includes(key)) key = this.pick(choices);
    }
    this.summon(pl, key);
    this.log(`${pl.name} ใช้ Command Seal อัญเชิญ ${pl.servant.cls} ตนใหม่`, null, 'seal');
  }

  eliminate(pl, why) {
    pl.out = true;
    pl.servant = null;
    this.eliminatedOrder.push(pl);
    this.log(`✖ ${pl.name} ตกรอบ (${why})`, null, 'death');
    if (this.grail.holder === pl) { this.grail.holder = null; this.grail.area = FIELDS.includes(pl.area) ? pl.area : this.cap.fields[0]; }
    for (const f of FIELDS) if (this.flags[f] === pl.id) this.flags[f] = null;
  }

  finish() {
    this.over = true;
    const alive = this.alive();
    const byMana = [...alive].sort((a, b) => b.mana - a.mana || (b.servant?.hp ?? 0) - (a.servant?.hp ?? 0));
    const winner = this.grail.holder && !this.grail.holder.out ? this.grail.holder : byMana[0];
    this.ranking = [winner, ...byMana.filter((x) => x !== winner), ...[...this.eliminatedOrder].reverse()];
    this.winner = winner;
    const how = this.grail.holder === winner ? 'ถือจอกศักดิ์สิทธิ์' : 'มานามากที่สุด';
    this.log(`🏆 ${winner.name} ชนะสงครามจอกศักดิ์สิทธิ์! (${how})`, null, 'grail');
    this.emit('over', { winner, how });
  }
}
