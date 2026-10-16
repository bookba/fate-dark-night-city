// Game engine for design v1.8: owns all state, shuffles, rolls and resolves.
// No DOM code, so it can run in the browser, in scripts/sim.js, or on a server.
//
// Every step is a simultaneous choice: the engine asks every player through
// `decide(game, player, kind, ctx)` (bots answer at once, the human UI with a
// Promise), and only then resolves everything in one go.

import {
  AREAS, AREA_KEYS, FIELDS, SAFE_AREAS, capacityFor, SERVANTS, SERVANT_KEYS, ALTER_KEYS, CLASS_HP, buildDeck, npCard, TYPES,
  DAILY, DAILY_KEYS, REWARDS, ITEMS, ITEM_KEYS, MASTER_NAMES,
  MANA_START, MANA_MAX, HAND_SIZE, ITEM_MAX, SEAL_MAX, DEATHS_FOR_GRAIL, MOVE_COST, OFFER_PRICE,
  FORGE_MANA, SHADOW_BASE, CHURCH_MONSTER_BASE,
} from './data.js';

export const LAST_DAY = 8;

export class Game {
  constructor({ humanName = 'เอมิยะ', rng = Math.random, decide, onEvent = () => {}, humanCount = 1 }) {
    this.rng = rng;
    this.decide = decide;
    this.onEvent = onEvent;
    this.day = 1;
    this.half = 'day';
    this.nightNo = 0;
    this.stage = 'setup';
    this.deaths = 0;
    this.uid = 0;
    this.cardId = 0;
    this.pool = [...SERVANT_KEYS];
    this.alterPool = [...ALTER_KEYS];
    this.flags = { miyama: null, shinto: null };
    this.grail = { appeared: false, pending: false, area: null, holder: null, endDay: LAST_DAY, appearedDay: null };
    this.situation = null;
    this.dailyDeck = [];
    this.shadowArea = null;
    this.events = {};
    this.shintoOpen = false;
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
      deck: [], discard: [], hand: [],
      out: false,
      known: new Set(),
      area: null, dayArea: null, settled: false,
      churchToday: false, churchMonster: false, resting: false,
      catalystPending: false, catalystChoices: null,
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
    const entry = { text, to, cls, day: this.day, half: this.half, night: this.half === 'night' ? this.nightNo : 0 };
    this.logs.push(entry);
    this.emit('log', { entry });
  }
  async ask(player, kind, ctx = {}) { return await this.decide(this, player, kind, ctx); }
  gainMana(pl, n) {
    const before = pl.mana;
    pl.mana = Math.max(0, Math.min(MANA_MAX, pl.mana + n));
    if (pl.mana > before) this.emit('mana', { pl, n: pl.mana - before });
  }
  // every Command Seal spent or gained goes through these, so the UI can show it
  useSeal(pl) { pl.seals--; this.emit('seal', { pl, d: -1 }); }
  addSeal(pl) {
    if (pl.seals >= SEAL_MAX) return false;
    pl.seals++;
    this.emit('seal', { pl, d: 1 });
    return true;
  }
  heal(s, n) { s.hp = Math.min(s.maxHp, s.hp + n); }
  // design 6.1: whoever loses a flag is told why
  setFlag(f, id, why) {
    const prev = this.flags[f];
    if (prev === id) return;
    this.flags[f] = id;
    if (prev != null && !this.players[prev].out) this.log(`คุณเสียธง${AREAS[f].name} (${why})`, [prev], 'bad');
  }
  areaOpen(a) {
    if (a === 'temple' || a === 'church' || a === 'mansion') return this.cap[a] > 0;
    return this.cap.fields.includes(a);
  }
  capOf(a) { return FIELDS.includes(a) ? Infinity : this.cap[a]; }
  get daily() { return DAILY[this.situation] || {}; }
  cardCost(c) { return c.kind === 'np' && this.daily.npCost ? this.daily.npCost : c.cost; }
  moveCost() { return this.daily.calm ? 0 : MOVE_COST; }
  handSize() { return this.daily.handSize || HAND_SIZE; }
  // who wins a full area: lowest mana (temple, mansion) or fewest seals then mana (church)
  priority(a) { return a === 'church' ? (x, y) => x.seals - y.seals || x.mana - y.mana : (x, y) => x.mana - y.mana; }

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
    return { uid: ++this.uid, key, def, cls: def.cls, maxHp, hp: maxHp, revealed: false, pendingReveal: false, shown: [], np: npCard(key, ++this.cardId) };
  }

  // summon order (design 9): unused central pool, then unused Alters, then
  // (repeats allowed) any dead Servant nobody is using. Only living Servants
  // count as in use, so the one that just died can come back.
  summonSource() {
    if (this.pool.length) return this.pool;
    if (this.alterPool.length) return this.alterPool;
    const inUse = new Set(this.alive().filter((x) => x.servant && x.servant.hp > 0).map((x) => x.servant.key));
    return [...SERVANT_KEYS, ...ALTER_KEYS].filter((k) => !inUse.has(k));
  }

  // catalyst: 3 picks from the pile in use, topped up from the Alter pile;
  // `taken` keeps two Masters picking in the same morning from seeing the same ones
  catalystChoices(taken = []) {
    const src = this.summonSource();
    const free = (list) => list.filter((k) => !taken.includes(k));
    const from = free(src).length >= 3 ? free(src) : src;
    let out = this.shuffle(from).slice(0, 3);
    if (out.length < 3 && src === this.pool) out = [...out, ...this.shuffle(free(this.alterPool)).slice(0, 3 - out.length)];
    return out;
  }

  summon(pl, key) {
    const src = this.summonSource();
    const ok = key && (src.includes(key) || this.pool.includes(key) || this.alterPool.includes(key));
    if (!ok) key = this.pick(src);
    this.pool = this.pool.filter((k) => k !== key);
    this.alterPool = this.alterPool.filter((k) => k !== key);
    pl.servant = this.makeServant(key);
    pl.deck = this.shuffle(buildDeck(key).map((c) => ({ ...c, id: ++this.cardId })));
    pl.discard = [];
    pl.hand = [];
    this.draw(pl, HAND_SIZE);
    if (SERVANTS[key].alter) this.log('กองกลางหมดแล้ว คุณได้ Servant Alter (ร่างด้านมืด)', [pl.id], 'me');
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

  // what the player could put down tonight: hand + the Servant's NP ability
  playable(pl) { return pl.servant ? [...pl.hand, pl.servant.np] : [...pl.hand]; }

  addItem(pl, key = null) {
    const k = key || this.pick(ITEM_KEYS);
    pl.items.push(k);
    return k;
  }

  // ---------- actions players may take during their choice ----------
  canSealHeal(pl) { return pl.seals > 0 && pl.servant && !pl.catalystPending && pl.servant.hp < pl.servant.maxHp; }
  sealHeal(pl) {
    if (!this.canSealHeal(pl)) return false;
    this.useSeal(pl);
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

  offerPrice() { return OFFER_PRICE; }
  forgeMana() { return this.daily.forge || FORGE_MANA; }

  // ---------- match flow ----------
  async run() {
    this.log('สงครามจอกศักดิ์สิทธิ์เริ่มต้น! Master 8 คนอัญเชิญ Servant', null, 'sys');
    for (const pl of this.players) this.summon(pl);
    this.emit('update');
    await this.ask(this.human, 'intro', {});
    for (this.day = 1; this.day <= LAST_DAY; this.day++) {
      await this.runDay();
      await this.runNight(1);
      if (this.alive().length <= 1) break;
      await this.runNight(2);
      if (this.checkOver()) break;
    }
    this.finish();
  }

  checkOver() {
    return this.alive().length <= 1 || this.day >= this.grail.endDay;
  }

  morning() {
    this.half = 'day';
    this.nightNo = 0;
    this.cap = capacityFor(this.alive().length);
    // the Grail is announced the morning after it appears, face up on a battlefield
    if ((this.grail.pending || this.day === LAST_DAY) && !this.grail.appeared) {
      this.grail.appeared = true;
      this.grail.appearedDay = this.day;
      this.grail.area = this.pick(this.cap.fields);
      this.grail.endDay = Math.min(LAST_DAY, this.day + 1);
      const why = this.deaths >= DEATHS_FOR_GRAIL ? `Servant ตายครบ ${DEATHS_FOR_GRAIL} ครั้ง` : 'เข้าสู่วันที่ 8';
      const end = this.grail.endDay === this.day ? 'ของวันนี้' : 'ของพรุ่งนี้';
      this.log(`✦ จอกปรากฏที่${AREAS[this.grail.area].name}! (${why}) เกมจบเมื่อจบกลางคืน 2 ${end}`, null, 'grail');
    }
    if (this.grail.area && !this.cap.fields.includes(this.grail.area) && !this.grail.holder) this.grail.area = this.cap.fields[0];
    for (const f of FIELDS) if (!this.cap.fields.includes(f) && this.flags[f] != null) this.setFlag(f, null, 'สนามรบปิด');

    // daily event deck: no repeats until the 17 cards run out
    if (!this.dailyDeck.length) this.dailyDeck = this.shuffle(DAILY_KEYS);
    this.situation = this.dailyDeck.pop();
    this.shadowArea = this.daily.shadow ? this.pick(this.cap.fields) : null;
    this.events = {};
    for (const f of this.cap.fields) this.events[f] = this.pick(REWARDS);
    this.shintoOpen = false;
    this.deathsToday = 0;
    // items over the limit stay until the day choice: the Master picks what to drop (design 2)
    for (const pl of this.alive()) {
      Object.assign(pl, { churchToday: false, churchMonster: false, area: null, settled: false, dayArea: null, choice: null, move: null, play: null, peek: null, resting: false });
      if (this.daily.morningMana) this.gainMana(pl, this.daily.morningMana);
      if (!pl.catalystPending) this.draw(pl, this.handSize() - pl.hand.length);
    }
    // a Master holding a catalyst picks the new Servant in this day step (design 9)
    const offered = [];
    for (const pl of this.alive().filter((x) => x.catalystPending)) {
      pl.catalystChoices = this.catalystChoices(offered);
      offered.push(...pl.catalystChoices);
    }
    const sit = this.daily;
    this.log(`── วันที่ ${this.day} · กลางวัน ──`, null, 'phase');
    this.log(`อีเวนต์ประจำวัน: ${sit.name} (${sit.text})${this.shadowArea ? ` ที่${AREAS[this.shadowArea].name}` : ''}`, null, 'sys');
    if (this.events.miyama) this.log(`การ์ดรางวัลที่มิยามะ: ${this.events.miyama.name}`, null, 'sys');
  }

  async runDay() {
    this.morning();
    this.stage = 'choose';
    this.emit('phase');
    // ① everyone chooses at once (bots lock in first, so their "chosen" mark is honest).
    // Nothing chosen here takes effect until everyone has locked in.
    const order = [...this.alive()].sort((a, b) => a.isHuman - b.isHuman);
    for (const pl of order) {
      pl.choice = await this.ask(pl, 'day', pl.catalystPending ? { catalyst: pl.catalystChoices } : {});
      // no catalyst pick in time = one of the three at random
      if (pl.catalystPending) this.pickCatalyst(pl, null);
      pl.locked = true;
      this.emit('update');
    }
    for (const pl of this.alive()) pl.locked = false;
    this.resolveDay();
    this.stage = 'dayResult';
    this.emit('phase');
  }

  // the new Servant from a catalyst, picked from the three offered this morning
  pickCatalyst(pl, key) {
    if (!pl.catalystPending) return false;
    const choices = pl.catalystChoices?.length ? pl.catalystChoices : this.catalystChoices();
    if (!choices.includes(key)) key = this.pick(choices);
    pl.catalystPending = false;
    pl.catalystChoices = null;
    this.summon(pl, key);
    if (this.half === 'day') this.draw(pl, this.handSize() - pl.hand.length);
    this.log(`${pl.name} อัญเชิญ ${pl.servant.cls} ตนใหม่ด้วยวัตถุเชื่อมโยง`, null, 'seal');
    this.emit('update');
    return true;
  }

  normalizeChoice(pl) {
    const c = pl.choice || {};
    const fields = this.cap.fields;
    const holder = this.grail.holder === pl;
    let backup = fields.includes(c.backup) ? c.backup : (fields.includes(pl.lastField) ? pl.lastField : this.pick(fields));
    let area = AREA_KEYS.includes(c.area) && this.areaOpen(c.area) ? c.area : backup;
    if (holder && !fields.includes(area)) area = backup;
    const church = area === 'church' && ['offer', 'monster'].includes(c.church?.type) ? { type: c.church.type } : null;
    return {
      area, backup, church,
      forge: area === 'mansion' && Array.isArray(c.forge) ? c.forge : [],
      items: Array.isArray(c.items) ? c.items.filter((x) => x && typeof x.key === 'string') : [],
      sealHeal: !!c.sealHeal,
      discard: Array.isArray(c.discard) ? c.discard : [],
    };
  }

  resolveDay() {
    const alive = this.alive();
    const want = new Map(alive.map((pl) => [pl, this.normalizeChoice(pl)]));
    const assign = new Map();
    const tie = new Map(alive.map((pl) => [pl, this.rng()]));
    // a full area takes the Masters with the least mana (seals for the church) as everyone saw them this morning
    const admit = (area, sortKey) => {
      const cands = alive.filter((pl) => want.get(pl).area === area).sort((a, b) => sortKey(a, b) || tie.get(a) - tie.get(b));
      cands.forEach((pl, i) => {
        if (i < this.capOf(area)) { assign.set(pl, area); return; }
        const w = want.get(pl);
        assign.set(pl, w.backup);
        const others = this.players.filter((x) => x !== pl).map((x) => x.id);
        this.log(`${AREAS[area].name}เต็ม ${pl.name} ไปสนามรบสำรอง ${AREAS[w.backup].name}`, others, 'sys');
        const dropped = w.church ? ' ธุระโบสถ์ถูกยกเลิก ไม่เสียอะไร' : w.forge.length ? ' การหลอมถูกยกเลิก ไม่เสียอะไร' : '';
        this.log(`${AREAS[area].short}เต็ม คุณถูกส่งไป${AREAS[w.backup].name} (สนามรบสำรอง)${dropped}`, [pl.id], 'bad');
      });
    };
    for (const a of ['temple', 'church', 'mansion']) admit(a, this.priority(a));
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
    // day items, "รักษา!" and discards chosen in secret happen now, together
    for (const pl of alive) this.dayActions(pl, want.get(pl));
    // day results
    const temple = alive.filter((pl) => pl.area === 'temple');
    const share = (temple.length === 1 ? 4 : temple.length === 2 ? 3 : 2) + (this.daily.ley || 0);
    for (const pl of temple) { this.gainMana(pl, share); this.log(`วัดริวโด: แบ่งเลย์ไลน์ มานา +${share}`, [pl.id], 'me'); }
    for (const pl of alive.filter((x) => x.area === 'church')) {
      const ch = want.get(pl).church;
      if (ch && this.grail.holder !== pl && !pl.churchToday) this.churchAction(pl, ch);
      // everyone sees whether the church fights its monster tonight (design 4.1 step 5)
      this.log(pl.churchMonster ? `${pl.name} จะปราบภูตร้ายใต้โบสถ์คืนนี้` : `${pl.name} อยู่โบสถ์ ไม่ปราบมอนสเตอร์`, null, 'sys');
    }
    for (const pl of alive.filter((x) => x.area === 'mansion')) this.forge(pl, want.get(pl).forge);
  }

  dayActions(pl, w) {
    for (const { key, target } of w.items) this.useDayItem(pl, key, target);
    if (w.sealHeal) this.sealHeal(pl);
    for (const k of w.discard) {
      const i = pl.items.indexOf(k);
      if (i < 0 || pl.items.length <= ITEM_MAX) continue;
      pl.items.splice(i, 1);
      this.log(`ทิ้ง ${ITEMS[k].name}`, [pl.id], 'me');
    }
    // nothing picked in time = the oldest goes
    while (pl.items.length > ITEM_MAX) {
      const k = pl.items.shift();
      this.log(`ไอเท็มเกิน ${ITEM_MAX} ใบ ทิ้ง ${ITEMS[k].name} (ใบเก่าสุด)`, [pl.id], 'me');
    }
  }

  // Tohsaka mansion: melt 1-2 hand cards for mana, then redraw
  forge(pl, ids) {
    const cards = [...new Set(ids)].slice(0, 2).map((id) => pl.hand.find((c) => c.id === id)).filter(Boolean);
    if (!cards.length) return;
    for (const c of cards) { pl.hand.splice(pl.hand.indexOf(c), 1); pl.discard.push(c); }
    const m = cards.length * this.forgeMana();
    this.gainMana(pl, m);
    this.draw(pl, cards.length);
    this.log(`คฤหาสน์โทซากะ: หลอม ${cards.map((c) => c.name).join(', ')} ได้มานา +${m} แล้วจั่วใหม่ ${cards.length} ใบ`, [pl.id], 'me');
  }

  // church errand (design 8, v1.8): offer mana for a Command Seal now, or fight
  // the monster under the church in night 1 for one
  churchAction(pl, ch) {
    pl.churchToday = true;
    if (pl.seals >= SEAL_MAX) return this.log(`Command Seal เต็มแล้ว (${SEAL_MAX} ดวง) ไปหลบได้แต่ทำธุระไม่ได้`, [pl.id], 'me');
    if (ch.type === 'offer') {
      const price = this.offerPrice();
      if (pl.mana < price) return this.log(`มานาไม่พอถวาย (ต้องใช้ ${price})`, [pl.id], 'bad');
      pl.mana -= price; this.addSeal(pl);
      this.log(`โบสถ์: ถวายมานา ${price} ได้ Command Seal 1 ดวง`, [pl.id], 'me');
      return;
    }
    if (ch.type === 'monster') {
      pl.churchMonster = true;
      this.log(`โบสถ์: คืนนี้จะสู้กับภูตร้ายใต้โบสถ์ในกลางคืน 1 (พลัง ${CHURCH_MONSTER_BASE} + ลูกเต๋า)`, [pl.id], 'me');
    }
  }

  // ---------- night ----------
  tiedDown(pl) {
    return pl.dayArea != null && this.alive().filter((x) => x.dayArea === pl.dayArea).length > 1;
  }

  moveOptions(pl) {
    const opts = { stay: true, move: [], escape: [], view: [] };
    const holder = this.grail.holder === pl;
    if (!this.tiedDown(pl) && !this.daily.fog && pl.mana >= this.moveCost()) {
      opts.move = this.cap.fields.filter((f) => f !== pl.area);
    }
    // the church takes nobody in at night (v1.8 safe zone), not even by "หนี!"
    if (pl.seals > 0 || pl.items.includes('scroll')) {
      opts.escape = AREA_KEYS.filter((a) => a !== pl.area && a !== 'church' && this.areaOpen(a) && !(holder && !FIELDS.includes(a)));
    }
    if (pl.area === 'church') opts.view = this.alive().filter((x) => x !== pl).map((x) => x.id);
    return opts;
  }

  async runNight(n) {
    this.half = 'night';
    this.nightNo = n;
    this.shintoOpen = true;
    this.log(`── วันที่ ${this.day} · กลางคืน ${n}/2 ──`, null, 'phase');
    if (n === 2) this.prepSecondNight();
    else if (this.events.shinto) this.log(`การ์ดรางวัลที่ชินโตะเปิดแล้ว: ${this.events.shinto.name}`, null, 'sys');
    // ② move at once
    this.stage = 'move';
    this.emit('phase');
    const alive = this.alive().filter((x) => !x.resting);
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
    this.endNight(n);
    this.stage = 'result';
    this.emit('night', { results: this.results });
    await this.ask(this.human, 'nightEnd', { results: this.results });
    // ⑤ automatic resummons (a catalyst holder picks theirs in the next day step)
    for (const pl of this.alive().filter((x) => x.servant && x.servant.hp <= 0 && !x.catalystPending)) {
      await this.resummon(pl);
      // a Servant summoned after night 1 rests through night 2 (design 4.3)
      if (n === 1 && !pl.out) pl.resting = true;
    }
    this.history[this.day] = { deaths: this.deathsToday, grail: this.grail.appearedDay === this.day };
    if (!this.grail.appeared && this.deaths >= DEATHS_FOR_GRAIL) this.grail.pending = true;
    this.emit('update');
  }

  // night 2 (design 4.3): starting positions are where night 1 ended, hands
  // refill, every open battlefield gets a new face-up reward card, and
  // Masters whose Servant died in night 1 leave the map until morning
  prepSecondNight() {
    this.events = {};
    for (const f of this.cap.fields) this.events[f] = this.pick(REWARDS);
    for (const pl of this.alive()) {
      if (pl.resting) {
        for (const f of FIELDS) if (this.flags[f] === pl.id) this.setFlag(f, null, 'พักฟื้น');
        if (this.grail.holder === pl) {
          this.grail.holder = null;
          this.grail.area = this.cap.fields.includes(pl.area) ? pl.area : this.cap.fields[0];
          this.log(`✦ ${pl.name} พักฟื้น จอกวางอยู่ที่${AREAS[this.grail.area].name}`, null, 'grail');
        }
        Object.assign(pl, { area: null, dayArea: null, settled: false, move: null, play: null, peek: null, peekTarget: null });
        this.log(`${pl.name} พักฟื้น Servant ตนใหม่จนถึงเช้า`, null, 'sys');
        continue;
      }
      Object.assign(pl, { dayArea: pl.area, settled: true, move: null, play: null, peek: null });
      this.draw(pl, HAND_SIZE - pl.hand.length);
    }
    this.log(`การ์ดรางวัลใหม่: ${this.cap.fields.map((f) => `${AREAS[f].short} ${this.events[f].name}`).join(' · ')}`, null, 'sys');
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
        pl.mana -= this.moveCost();
        pl.area = m.to; pl.settled = false;
        this.log(`${pl.name} ย้ายไป${AREAS[m.to].name}`, null, 'move');
      } else if (m.type === 'escape' && opts.escape.includes(m.to)) {
        const scroll = m.scroll && pl.items.includes('scroll');
        if (!scroll && pl.seals <= 0) continue;
        escapes.push({ pl, to: m.to, scroll });
      }
    }
    const spend = (e) => { if (e.scroll) e.pl.items.splice(e.pl.items.indexOf('scroll'), 1); else this.useSeal(e.pl); };
    const go = (e) => {
      spend(e);
      e.pl.area = e.to; e.pl.settled = false;
      this.log(`${e.pl.name} ${e.scroll ? 'ใช้ม้วนคาถา' : 'ใช้ Command Seal "หนี!"'} ไป${AREAS[e.to].name}`, null, 'seal');
    };
    for (const e of escapes.filter((x) => FIELDS.includes(x.to))) go(e);
    for (const a of ['temple', 'mansion']) {
      const prio = this.priority(a);
      const list = escapes.filter((x) => x.to === a).sort((x, y) => prio(x.pl, y.pl) || this.rng() - 0.5);
      let free = Math.max(0, this.capOf(a) - dayCount(a));
      for (const e of list) {
        if (free > 0) { free--; go(e); } else this.log(`${AREAS[a].short}เต็ม คุณอยู่ที่เดิม และได้${e.scroll ? 'ม้วนคาถา' : ' Command Seal '}คืน`, [e.pl.id], 'bad');
      }
    }
    for (const pl of alive) {
      if (FIELDS.includes(pl.area)) pl.lastField = pl.area;
      // leaving the church in night 1 calls off the monster fight, at no cost (design 8)
      if (pl.churchMonster && pl.area !== 'church') {
        pl.churchMonster = false;
        this.log('ออกจากโบสถ์ ยกเลิกการปราบมอนสเตอร์ ไม่เสียอะไร', [pl.id], 'me');
      }
    }
    this.emit('update');
  }

  planFights() {
    const fights = [];
    for (const a of AREA_KEYS) {
      if (SAFE_AREAS.includes(a) || !this.areaOpen(a)) continue;
      const players = this.alive().filter((x) => x.area === a);
      const shadow = a === this.shadowArea;
      if (players.length + (shadow ? 1 : 0) >= 2 && players.length >= 1) fights.push({ area: a, players, monster: shadow ? 'shadow' : null });
    }
    // the church stays free of player fights; whoever chose its monster fights it in night 1 only
    if (this.nightNo === 1) {
      for (const pl of this.alive().filter((x) => x.area === 'church' && x.churchMonster)) fights.push({ area: 'church', players: [pl], monster: 'church', church: true });
    }
    // the church occupant sees one master's hand at the start of card play
    for (const pl of this.alive().filter((x) => x.area === 'church' && x.peekTarget != null && !this.players[x.peekTarget].out)) {
      const t = this.players[pl.peekTarget];
      pl.peek = { id: t.id, name: t.name, cards: t.hand.map((c) => c.name) };
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
    const sit = this.daily;
    cards.forEach((c, i) => {
      parts.push({ label: c.name, v: c.power });
      if (sit.type?.[c.type]) parts.push({ label: sit.name, v: sit.type[c.type] });
      const other = cards[1 - i];
      if (c.eff.pair && other && other.type === c.eff.pair.type) parts.push({ label: `${c.name} คู่${TYPES[other.type].name}`, v: c.eff.pair.bonus });
    });
    // "ใจเดียว" needs 2 cards of one type; the NP is an ability, not a card (design 5.2)
    if (sit.onemind && cards.length === 2 && cards.every((c) => c.kind !== 'np') && cards[0].type === cards[1].type) parts.push({ label: 'ใจเดียว', v: sit.onemind });
    return parts;
  }

  extraDice(pl, cards, items) {
    let n = this.daily.extraDie || 0;
    for (const c of cards) n += c.eff.die || 0;
    if (items.includes('charm')) n++;
    return n;
  }

  sanitizePlay(pl, play) {
    const playable = this.playable(pl);
    const ids = [...new Set((play?.cards || []).slice(0, 2))];
    let cards = ids.map((id) => playable.find((c) => c.id === id)).filter(Boolean);
    // drop cards the player cannot pay for (most expensive first)
    const cost = (list) => list.reduce((a, c) => a + this.cardCost(c), 0);
    while (cost(cards) > pl.mana) cards = cards.sort((a, b) => this.cardCost(a) - this.cardCost(b)).slice(0, -1);
    const boost = !!play?.boost && pl.seals > 0;
    const sealHeal = !!play?.sealHeal && pl.seals > (boost ? 1 : 0) && pl.servant.hp < pl.servant.maxHp;
    const items = [...new Set(play?.items || [])].filter((k) => pl.items.includes(k) && ITEMS[k].phase.includes('fight'));
    return { cards, boost, sealHeal, items };
  }

  setHolder(pl, res) {
    this.grail.holder = pl;
    res.notes.push({ text: 'คุณครอบครองจอก! ถือไว้ให้ถึงตอนจบ', to: [pl.id], holder: pl });
  }

  resolveFight(f) {
    // the monster under the church (design 8): no rewards, flags, Grail or loot,
    // and no HP loss there ever takes a Servant below 1
    const church = f.monster === 'church';
    const res = { area: f.area, church, entries: [], monster: null, winners: [], text: [], notes: [] };
    const ents = f.players.map((pl) => {
      const play = this.sanitizePlay(pl, pl.play);
      const s = pl.servant;
      const e = { pl, id: pl.id, name: pl.name, key: s.key, cls: s.cls, label: null, play, cards: play.cards.map((c) => ({ ...c })), hpBefore: s.hp, maxHp: s.maxHp, parts: [] };
      // pay
      pl.mana -= play.cards.reduce((a, c) => a + this.cardCost(c), 0);
      if (play.boost) this.useSeal(pl);
      if (play.sealHeal) this.useSeal(pl);
      for (const k of play.items) pl.items.splice(pl.items.indexOf(k), 1);
      return e;
    });
    const floor = (e, n, flag = 'clamped') => {
      if (!church) return n;
      const capped = Math.min(n, Math.max(0, e.pl.servant.hp - 1));
      if (capped < n) e[flag] = true;
      return capped;
    };
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
    // monsters roll base + 1d6 and ignore the daily event
    if (f.monster) {
      const d = this.d6();
      const base = church ? CHURCH_MONSTER_BASE : SHADOW_BASE;
      res.monster = { kind: f.monster, base, total: base + d, dice: [d] };
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
    // 4. damage for the losers
    for (const e of ents) {
      const s = e.pl.servant;
      e.dmg = 0;
      if (e.total < max) {
        let d = Math.max(1, max - e.total);
        if (unique) for (const c of unique.play.cards) d += c.eff.splash || 0;
        d += this.daily.lossHp || 0;
        for (const c of e.play.cards) d -= c.eff.reduce || 0;
        if (e.play.items.includes('shroud')) d = 0;
        e.dmg = floor(e, Math.max(0, d));
      }
      s.hp -= e.dmg;
      e.result = monsterTop ? (e.total === max ? 'tie' : 'lose') : top.includes(e) ? (unique ? 'win' : 'tie') : 'lose';
    }
    // deaths
    const dead = [];
    for (const e of ents) {
      const s = e.pl.servant;
      if (s.hp > 0) continue;
      s.hp = 0;
      e.died = true;
      dead.push(e);
      this.deaths++;
      this.deathsToday = (this.deathsToday || 0) + 1;
    }
    // 5. rewards, loot, flag, Grail; the church monster pays a Command Seal for a win
    if (church) {
      const e = ents[0];
      if (e.result === 'win' && this.addSeal(e.pl)) { e.sealWon = true; res.text.push(`${e.name} ชนะภูตร้ายใต้โบสถ์ ได้ Command Seal 1 ดวง`); }
    } else {
      if (monsterTop) res.text.push('มอนสเตอร์เงาดำชนะ ไม่มีใครได้รางวัลและธง');
      else this.giveReward(f, top, ents.length + (f.monster ? 1 : 0), res);
      if (unique && dead.length) {
        unique.loot = [];
        for (const d of dead) {
          if (d === unique) continue;
          const take = this.daily.blood ? d.pl.mana : Math.floor(d.pl.mana / 2);
          d.pl.mana -= take;
          this.gainMana(unique.pl, take);
          let item = null;
          if (d.pl.items.length) {
            item = d.pl.items.splice(Math.floor(this.rng() * d.pl.items.length), 1)[0];
            unique.pl.items.push(item);
          }
          unique.pl.kills++;
          unique.loot.push({ name: d.name, mana: take, item });
          const what = [take ? `มานา ${take}` : '', item ? ITEMS[item].name : ''].filter(Boolean).join(' และ');
          if (what) res.text.push(`${unique.name} ยึด${what} จาก ${d.name}`);
        }
      }
      if (FIELDS.includes(f.area)) {
        const prev = this.flags[f.area];
        const next = monsterTop ? null : unique ? unique.id : top.some((e) => e.id === prev) ? prev : null;
        const why = !ents.some((e) => e.id === prev) ? 'ออกจากสนามรบนั้น' : monsterTop ? 'มอนสเตอร์เงาดำชนะ' : 'แพ้';
        this.setFlag(f.area, next, why);
        res.flag = { before: prev, after: next };
        if (next !== prev) res.text.push(next != null ? `ธง${AREAS[f.area].short}เป็นของ ${this.players[next].name}` : `ธง${AREAS[f.area].short}ว่าง`);
      }
      // the Grail changes hands only to a single winning Master; a tie or a shadow-monster
      // win leaves it where it is, and it drops only if its holder's Servant died (design 11)
      const holder = this.grail.holder;
      const holderEnt = ents.find((e) => e.pl === holder);
      if (holderEnt && !top.includes(holderEnt)) {
        if (unique) { this.setHolder(unique.pl, res); res.text.push(`✦ จอกศักดิ์สิทธิ์ตกเป็นของ ${unique.name}`); }
        else if (holderEnt.died) { this.grail.holder = null; this.grail.area = f.area; res.text.push('✦ จอกหลุดมือ วางอยู่ที่สนามรบนี้'); }
      } else if (!holder && this.grail.appeared && this.grail.area === f.area && unique) {
        this.setHolder(unique.pl, res);
        res.text.push(`✦ ${unique.name} ครอบครองจอกศักดิ์สิทธิ์!`);
      }
    }
    // HP the Servant costs itself once the fight is settled ("ความบ้าคลั่ง", Alter NP):
    // a death from it counts, but nobody takes mana or items (design 5.4)
    for (const e of ents) {
      const s = e.pl.servant;
      e.hpMid = Math.max(0, s.hp);
      if (e.died) continue;
      const own = e.play.cards.filter((c) => c.eff.selfHit || c.eff.darkHit);
      if (!own.length) continue;
      const hit = floor(e, own.reduce((a, c) => a + (c.eff.selfHit || 0) + (c.eff.darkHit || 0), 0), 'selfClamped');
      const why = own.map((c) => (c.eff.darkHit ? 'NP ด้านมืด' : c.name)).join(' และ ');
      e.selfHit = hit;
      e.selfWhy = why;
      if (!hit) continue;
      s.hp -= hit;
      e.dmg += hit;
      res.text.push(`${e.name}: ${why} Servant เสีย HP ${hit}`);
      if (s.hp > 0) continue;
      s.hp = 0;
      e.died = true;
      e.selfDeath = true;
      this.deaths++;
      this.deathsToday = (this.deathsToday || 0) + 1;
      if (this.flags[f.area] === e.id) this.setFlag(f.area, null, 'Servant ถูกกำจัด');
      if (this.grail.holder === e.pl) { this.grail.holder = null; this.grail.area = f.area; res.text.push('✦ จอกหลุดมือ วางอยู่ที่สนามรบนี้'); }
    }
    // after-fight card effects, discard
    for (const e of ents) {
      for (const c of e.play.cards) if (c.eff.mana) this.gainMana(e.pl, c.eff.mana);
      const pl = e.pl;
      for (const c of e.play.cards) {
        const hi = pl.hand.findIndex((h) => h.id === c.id);
        if (hi >= 0) pl.hand.splice(hi, 1);
        if (c.kind !== 'np') pl.discard.push(c);
      }
      e.hpAfter = Math.max(0, pl.servant.hp);
      e.sealsAfter = pl.seals;
      e.label = pl.servant.revealed ? `${pl.servant.def.name} (${pl.servant.cls})` : pl.servant.cls;
      e.trueName = pl.servant.def.name;
    }
    res.entries = ents.map(({ pl, play, ...rest }) => ({ ...rest, boost: play.boost, sealHeal: play.sealHeal, items: play.items }));
    if (church) {
      const e = ents[0];
      const outcome = e.result === 'win' ? `${e.name} ชนะ` : e.result === 'tie' ? 'เสมอ' : 'ภูตร้ายใต้โบสถ์ชนะ';
      this.log(`⛪ ${AREAS.church.name}: ${e.name} vs ภูตร้ายใต้โบสถ์ → ${outcome}`, null, 'fight');
    } else {
      const names = ents.map((e) => e.name).join(' vs ');
      const outcome = monsterTop ? 'มอนสเตอร์เงาดำชนะ' : unique ? `${unique.name} ชนะ` : `เสมอ (${top.map((e) => e.name).join(', ')})`;
      this.log(`⚔ ${AREAS[f.area].name}: ${names}${f.monster ? ' + มอนสเตอร์เงาดำ' : ''} → ${outcome}`, null, 'fight');
    }
    for (const e of ents) if (e.died) this.log(`☠ Servant ของ ${e.name} ถูกกำจัด (ตายรวม ${this.deaths})`, null, 'death');
    for (const t of res.text) this.log(t, null, t.startsWith('✦') ? 'grail' : '');
    for (const n of res.notes) if (!n.holder || this.grail.holder === n.holder) this.log(n.text, n.to, 'grail');
    return res;
  }

  revealName(pl) {
    const s = pl.servant;
    if (s.revealed) return;
    s.revealed = true;
    const where = `ถนัด${AREAS[s.def.favored].name} ไม่ถนัด${AREAS[s.def.unfavored].name}`;
    this.log(`✸ ชื่อจริงถูกเปิดเผย: Servant ของ ${pl.name} คือ ${s.def.name} · NP ${s.def.np.name} พลัง ${s.def.np.power} · ${where}`, null, 'reveal');
    this.log(`ทุกคนรู้แล้วว่า Servant ของคุณคือ ${s.def.name} ${where} ตั้งแต่การสู้ครั้งหน้าพลัง −2`, [pl.id], 'bad');
  }

  // a reward card; Masters who tie for the top split it, rounded up (design 6.2)
  applyEvent(pl, ev, share = 1) {
    const got = [];
    if (ev.mana) { const m = Math.ceil(ev.mana / share); this.gainMana(pl, m); got.push(`+${m} มานา`); }
    if (ev.items) { const k = this.addItem(pl); got.push(ITEMS[k].name); }
    if (ev.heal) { const h = Math.ceil(ev.heal / share); this.heal(pl.servant, h); got.push(`ฟื้น HP ${h}`); }
    if (ev.draw) { const d = Math.ceil(ev.draw / share); this.draw(pl, d); got.push(`จั่ว ${d} ใบ`); }
    return got.join(' และ');
  }

  giveReward(f, top, size, res) {
    const n = top.length;
    for (const e of top) {
      const pl = e.pl;
      let got;
      if (f.area === 'temple') { const m = Math.ceil((4 + (this.daily.ley || 0)) / n); this.gainMana(pl, m); got = `+${m} มานา (เลย์ไลน์)`; }
      else got = this.applyEvent(pl, this.events[f.area], n);
      if (size >= 3) { const b = Math.ceil(2 / n); this.gainMana(pl, b); got += ` · ตะลุมบอน +${b} มานา`; }
      if (f.monster === 'shadow') { const k = this.addItem(pl); got += ` · ชนะมอนสเตอร์เงาดำได้${ITEMS[k].name}`; }
      e.got = got;
      res.text.push(`${e.name} ได้รางวัล: ${got}`);
    }
  }

  soloRewards() {
    for (const f of this.cap.fields) {
      const here = this.alive().filter((x) => x.area === f);
      if (here.length !== 1 || this.shadowArea === f) continue;
      const pl = here[0];
      const got = this.applyEvent(pl, this.events[f]);
      this.setFlag(f, pl.id, 'ออกจากสนามรบนั้น');
      this.log(`${pl.name} อยู่${AREAS[f].name}คนเดียว ได้ ${got} และธงยึดครอง`, null, 'good');
      if (this.grail.appeared && !this.grail.holder && this.grail.area === f) {
        this.grail.holder = pl;
        this.log(`✦ ${pl.name} ครอบครองจอกศักดิ์สิทธิ์!`, null, 'grail');
        this.log('คุณครอบครองจอก! ถือไว้ให้ถึงตอนจบ', [pl.id], 'grail');
      }
    }
  }

  endNight(n) {
    for (const f of FIELDS) {
      const owner = this.flags[f];
      if (owner != null && this.players[owner].area !== f) this.setFlag(f, null, 'ออกจากสนามรบนั้น');
    }
    // the church monster fights in night 1 only
    if (n === 1) for (const pl of this.alive()) pl.churchMonster = false;
  }

  async resummon(pl) {
    // the old Servant does not return to the pool
    if (pl.seals <= 0) {
      this.log('Command Seal หมด คุณตกรอบ ดูต่อได้หรือออกจากห้อง', [pl.id], 'bad');
      return this.eliminate(pl, 'Command Seal หมด อัญเชิญไม่ได้');
    }
    this.useSeal(pl);
    const rest = this.nightNo === 1 ? ' ตนใหม่พักฟื้นถึงพรุ่งนี้' : '';
    // with a catalyst the Master picks 1 of 3 in the next day step instead (design 9)
    const ci = pl.items.indexOf('catalyst');
    if (ci >= 0) {
      pl.items.splice(ci, 1);
      pl.catalystPending = true;
      this.log(`Servant ของคุณถูกกำจัด ใช้ Command Seal 1 ดวงอัญเชิญตนใหม่ (เหลือ ${pl.seals} ดวง) ใช้วัตถุเชื่อมโยง เลือก Servant ได้ตอนกลางวันถัดไป`, [pl.id], 'seal');
      this.log(`${pl.name} ใช้ Command Seal และวัตถุเชื่อมโยง Servant ตนใหม่มาตอนกลางวัน`, null, 'seal');
      return;
    }
    this.log(`Servant ของคุณถูกกำจัด ใช้ Command Seal 1 ดวงอัญเชิญตนใหม่ (เหลือ ${pl.seals} ดวง)${rest}`, [pl.id], 'seal');
    this.summon(pl);
    this.log(`${pl.name} ใช้ Command Seal อัญเชิญ ${pl.servant.cls} ตนใหม่`, null, 'seal');
  }

  eliminate(pl, why) {
    pl.out = true;
    pl.servant = null;
    pl.catalystPending = false;
    this.eliminatedOrder.push(pl);
    this.log(`✖ ${pl.name} ตกรอบ (${why})`, null, 'death');
    if (this.grail.holder === pl) { this.grail.holder = null; this.grail.area = FIELDS.includes(pl.area) ? pl.area : this.cap.fields[0]; }
    for (const f of FIELDS) if (this.flags[f] === pl.id) this.flags[f] = null;
  }

  finish() {
    // a catalyst pick still waiting when the war ends is made at random
    for (const pl of this.alive().filter((x) => x.catalystPending)) this.pickCatalyst(pl, null);
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
