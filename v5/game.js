// Rules from design v5.2 (29 Oct 2026): the game follows the Dominate Grail War manual (8 regular
// rounds, then climax rounds until one Master is left; 7 players: 4 left after round 8, then 2,
// then 1), and the Masters' abilities and the Servants' cards follow Fate/Domination [FD].
// A round runs the numbered steps 1.1–5.2 of paper section 8.0, with 9 windows where cards can be
// used. Numbers not in the sources are placeholders (data.js). No DOM code, so it runs headless (v5/sim.mjs).
import {
  AREAS, PATH, STEP_COST, WORKSHOP, TERRAIN, RECON_VP, HAND, PLAY, SKILL_MANA, MANA_MAX, REGULAR, MAX_ROUNDS,
  CS_MANA, CS_POWER, CS_VP, MASTERS, SERVANTS, KANSHOU, GANDR, BLACK_SHADOW, SNAKE, TSUBAME, UBW_PLAY, RIDE_MAX, MANA_X, GEM_REPEAT,
  SITUATIONS, CLIMAX, EVENTS, TYPES, WINDOWS, SAMPLE, SAMPLE_NP, ALL_TYPES, hasType, cardLines,
} from './data.js';

export * from './data.js';

let uid = 0;
const inst = (spec, extra = {}) => ({ ...spec, uid: ++uid, ...extra });
export const FIELDS = ['miyama', 'shinto'];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.floor(v || 0)));
const cardName = (c) => c.name || `${TYPES[c.type]} ${c.power}`;
// effects of the cards laid that are Action abilities on the Fate/Domination cards: 2nd Strike stops
// these, not the On Play ones (Metamorphosis, Rider Class's draw, Gate of Babylon's types) [FD Keywords]
const ACTION_FX = ['mana', 'archer', 'block', 'ruleBreaker', 'terrainMul', 'move', 'bell', 'riding'];

export class Game {
  // servants and start: a fixed deal and first player (the tutorial, paper 4.6 item 12)
  constructor({ decide, rng = Math.random, onEvent = () => {}, humanMaster = 'shirou', sample = false, servants = null, start = null }) {
    this.decide = decide;
    this.rng = rng;
    this.onEvent = onEvent;
    this.logs = [];
    this.round = 0;
    this.phase = null;
    this.over = false;
    this.winner = null;
    this.results = [];
    this.step = null; // the step of paper 8.0 the round is at, e.g. '3.2'
    this.win = null; // the card window being asked, if any
    this.sample = sample; // the example cards of paper section 9 are shuffled in
    let svs = this.shuffle([...SERVANTS]); // each Master gets one of the 9 at random, 2 go unused [p.6]
    if (servants) { const fixed = MASTERS.map((m) => SERVANTS.find((sv) => sv.key === servants[m.key])); svs = [...fixed, ...svs.filter((sv) => !fixed.includes(sv))]; }
    this.unused = svs.slice(MASTERS.length); // nobody knows which; Shinji's book may call one [FD]
    let h = MASTERS.findIndex((m) => m.key === humanMaster);
    if (h < 0) h = Math.floor(rng() * MASTERS.length);
    this.players = MASTERS.map((m, id) => {
      const p = {
        id, m, name: m.short, isHuman: id === h, specials: m.key === 'shirou' ? [inst(KANSHOU, { keep: true })] : [],
        mana: m.mana, cs: m.cs, vp: 0, gems: m.gems || 0, roundUse: {}, revealed: false, out: false, outRound: 0,
        at: null, slot: null, terrain: 0, play: null, seq: 0, avalonUsed: false, grail: false, bookUsed: false, lastFight: null,
        shown: [], peek: 0, // shown: what everyone saw this Master lay (paper 4.6 item 6)
      };
      this.dealServant(p, svs[id]);
      return p;
    });
    this.human = this.players[h];
    this.start = start ?? Math.floor(rng() * this.players.length);
    // 10 regular situation cards, 2 removed unseen, 8 used [p.6]; climax cards by players left [p.11]
    this.sits = this.shuffle([...SITUATIONS]).slice(0, REGULAR);
    this.sit = null;
    this.sitUsed = [];
    this.evDeck = this.shuffle(EVENTS.map((e) => ({ ...e })));
    this.evUsed = [];
    this.evs = { miyama: [], shinto: [] };
    this.shintoOpen = false;
    this.turn = null;
    this.block = {}; // battlefield → the Master whose 2nd Strike holds it this round [FD]
  }

  // a Servant's deck and NP/skill slot (at the start, and when Shinji's book changes Servant)
  dealServant(p, sv) {
    p.sv = sv;
    const deck = sv.deck.map((s) => inst(s));
    if (p.m.key === 'kuzuki') deck.push(...SNAKE.map((s) => inst(s)));
    if (this.sample) deck.push(...SAMPLE.map((s) => inst(s)));
    p.deck = this.shuffle(deck); p.hand = []; p.trash = [];
    p.skills = [...sv.skills, ...(this.sample ? [SAMPLE_NP] : [])].map((s) => inst(s, { skill: true, gone: false, resident: false }));
    p.uses = {};
  }

  shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(this.rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  emit(type, data = {}) { this.onEvent({ type, ...data }); }
  log(text, cls = '') { const e = { text, cls, round: this.round }; this.logs.push(e); this.emit('log', { entry: e }); }
  alive() { return this.players.filter((p) => !p.out); }
  order() { const n = this.players.length; const out = []; for (let i = 0; i < n; i++) { const p = this.players[(this.start + i) % n]; if (!p.out) out.push(p); } return out; }
  here(area) { return this.alive().filter((p) => p.at === area); }
  climax() { return this.round > REGULAR; }
  climaxNo() { return Math.max(0, this.round - REGULAR); }
  sfx(key) { return this.sit?.fx?.[key] || 0; }
  efx(f, key) { return (this.evs[f] || []).reduce((s, e) => s + (typeof e.fx[key] === 'number' ? e.fx[key] : e.fx[key] ? 1 : 0), 0); }
  eventVP(f) { return (this.evs[f] || []).reduce((s, e) => s + e.vp, 0); }
  fieldVP(f) { return this.eventVP(f) + AREAS[f].bonus + this.sfx('bonusUp'); }
  rank(p) { return 1 + this.alive().filter((q) => q.vp > p.vp).length; }
  gain(p, n) { if (n > 0) p.mana = Math.min(MANA_MAX, p.mana + n); }
  // engaged: a battlefield with 2+ pieces at the start of someone's move step [p.9]
  engagedAt(f) { return !!AREAS[f]?.field && this.here(f).length >= 2; }
  // Sakura's Tainted Grail: unlimited mana and one more card until the end [FD]
  infinite(p) { return !!p.grail; }
  ubwOn(p) { return p.skills.some((c) => c.fx?.ubw && c.resident); } // Unlimited Blade Works is up [FD]
  maxCards(p) { return (this.ubwOn(p) ? UBW_PLAY : PLAY) + (p.grail ? 1 : 0); }
  seat(p) { return this.order().indexOf(p) + 1; }
  half() { return Math.max(1, Math.floor(this.alive().length / 2)); } // the first half of the seat order [FD]
  // 2nd Strike: in that battlefield the others' Action and Combat abilities and Command Spells do not
  // work; On Play and untagged text still does [FD Keywords]
  blocked(p, f) { const k = f && this.block[f]; return !!k && k !== p; }
  // permanent NP/skill cards still in play from an earlier round [FD]
  perm(p) { return p.skills.filter((c) => c.resident && !(p.play?.cards || []).some((x) => x.uid === c.uid)); }
  addVP(p, n) { if (n > 0) { p.vp += n; p.roundUse.gotVP = true; } }
  loseVP(p, n) { const k = Math.min(p.vp, Math.max(0, n)); p.vp -= k; return k; }
  useCS(p, n = 1) { p.cs -= n; p.roundUse.cs = (p.roundUse.cs || 0) + n; }
  csMana(p, why = '') {
    this.useCS(p); this.gain(p, CS_MANA);
    if (p.m.key === 'rin' && this.round === 1) p.roundUse.temper = true; // Short Temper: 4 mana back after the fight [FD]
    this.log(`${p.name} ใช้ Command Spell ได้มานา +${CS_MANA}${why}`, 'cs');
  }

  drawTo(p, n) {
    if (this.ubwOn(p)) return; // no drawing while Unlimited Blade Works is up [FD]
    while (p.hand.length < n) {
      if (!p.deck.length) {
        if (!p.trash.length) break;
        for (const c of p.trash) delete c.down; // the discard pile is turned over and shuffled [p.8]
        p.deck = this.shuffle(p.trash); p.trash = [];
      }
      p.hand.push(p.deck.pop());
    }
  }

  // ---------- movement (paper section 8.3) ----------
  // Kuzuki pays 1 less to walk out of the workshop [FD]
  walkCost(p, from, to) {
    let c = 0;
    for (let i = PATH.indexOf(from); i < PATH.indexOf(to); i++) c += STEP_COST[i];
    return p.m.key === 'kuzuki' && from === 'workshop' ? Math.max(0, c - 1) : c;
  }
  reconFree(p) { return !this.alive().some((q) => q !== p && q.at === 'recon'); }
  moveOptions(p, mana = p.mana, cs = p.cs) {
    const opts = [{ to: p.at, how: 'stay', cost: 0 }];
    const i = PATH.indexOf(p.at);
    if (!this.engagedAt(p.at) || p.roundUse.freeMove) {
      for (const to of PATH.slice(i + 1)) {
        if (to === 'recon' && !this.reconFree(p)) continue;
        const cost = this.walkCost(p, p.at, to);
        if (cost <= mana) opts.push({ to, how: 'walk', cost });
      }
    }
    // Supervisor (Impartial): recon from any state, even engaged, for 2 mana [FD]
    if (p.m.key === 'kirei' && !p.revealed && p.at !== 'recon' && this.reconFree(p) && mana >= 2 && !opts.some((o) => o.to === 'recon' && o.cost <= 2)) opts.push({ to: 'recon', how: 'kirei', cost: 2 });
    // Command Spell move: from anywhere to anywhere but the workshop, engaged or not [p.10]
    if (cs > 0 && !this.blocked(p, p.at)) for (const to of PATH.slice(1)) if (to !== p.at && (to !== 'recon' || this.reconFree(p))) opts.push({ to, how: 'cs', cost: 0 });
    return opts;
  }

  enter(p, to, how) {
    if (p.at === to) return;
    p.terrain = 0; p.slot = null; p.lostTerrain = null; p.seized = null; // advantage stays on the battlefield it was won on
    p.at = to;
    if (how === 'cs') this.log(`${p.name} ใช้ Command Spell ย้ายไป${AREAS[to].name}`, 'cs');
    if (to === 'recon') { this.addVP(p, RECON_VP); this.log(`${p.name} เข้าลาดตระเวน ได้ ${RECON_VP} VP`, p.isHuman ? 'good' : ''); }
    if (to === 'miyama' && p.m.key === 'shinji') { this.gain(p, 1); this.log(`${p.name} เข้ามิยามะ ได้มานา +1 (Immoral)`, ''); }
  }

  // ---------- cards (paper section 8.3 ②, 9) ----------
  skillState(p, c, mana = p.mana) {
    if (c.gone) return c.fx?.godHand ? 'ออกจากเกมแล้ว' : 'ใช้แล้ว (ครั้งเดียวต่อเกม)';
    if (c.resident) return 'ถาวรอยู่ในสนาม';
    if (hasType(c, 'N') && this.sfx('noNP')) return 'การ์ดสถานการณ์ห้ามใช้ NP';
    if (c.fx?.hiddenOnly && p.revealed) return 'ใช้ได้เฉพาะตอนชื่อจริงยังซ่อน';
    if (c.fx?.archer && this.round && this.seat(p) > this.half()) return `ลงได้เฉพาะลำดับ 1–${this.half()}`;
    if (c.limit === 'round' && p.roundUse[`lim${c.uid}`]) return 'ใช้แล้วรอบนี้ (รอบละครั้ง)';
    if (!this.infinite(p) && !c.fx?.no8 && mana < SKILL_MANA) return `ต้องมีมานา ${SKILL_MANA}`;
    return '';
  }
  specialState(p, c, mana = p.mana) {
    if (c.fx?.needMana && !this.infinite(p) && mana < SKILL_MANA) return `ต้องมีมานา ${SKILL_MANA}`;
    return '';
  }
  usableSkills(p, mana = p.mana) { return p.skills.filter((c) => !this.skillState(p, c, mana)); }
  usableSpecials(p, mana = p.mana) { return p.specials.filter((c) => !c.windowOnly && !this.specialState(p, c, mana)); }
  // the mana a card costs now: Caster Class X = 16 − 2 × round, Gate of Babylon X = its chosen
  // types, Invisible Air −2 while the true name is hidden [FD]
  costOf(p, c, gate = 0) {
    let m = c.fx?.manaX ? Math.max(0, MANA_X - 2 * this.round) : c.fx?.gate ? gate : c.mana;
    if (c.fx?.hiddenDisc && !p.revealed) m = Math.max(0, m - c.fx.hiddenDisc);
    return m;
  }
  canFlip(c) { return !c.skill && !c.keep; } // attack cards (and Snake) may go face down [p.10]
  isUp(c) { return !c.down && !c.off; } // off: turned off by an effect, power 0 and no effect [FD]
  tsubame(cards) { const s = new Set(cards.filter((c) => this.isUp(c) && c.fx?.sword).map((c) => c.fx.sword)); return s.size === 3; }
  // the battlefield or area each move card can take its Master to [FD]
  cardDests(p, c) {
    const free = (k) => k !== 'recon' || this.reconFree(p);
    if (c.fx?.move === 'next') { const k = PATH[PATH.indexOf(p.at) + 1]; return k && free(k) ? [k] : []; } // Surveil
    if (c.fx?.move) return PATH.slice(1).filter((k) => k !== p.at && free(k)); // Lancer Class
    if (c.fx?.bell) return PATH.slice(1).filter((k) => (k !== p.at || AREAS[k].field) && free(k)); // Bellerophon may stay to take the advantage
    return [];
  }
  // Rule Breaker's target when none was picked: the fewest Command Spells, then the most VP
  rbAuto(qs) { return [...qs].sort((a, b) => a.cs - b.cs || b.vp - a.vp)[0] || null; }
  gemLimit() { return this.climax() ? GEM_REPEAT : 1; }
  // a special-type NP/skill card face up or permanent: Enuma Elish defeats its Master [FD]
  // Enuma Elish's target: an NP of the Special type laid face up or in play for good [FD]
  activeSpecial(p) { return [...(p.play?.cards || []).filter((c) => this.isUp(c)), ...this.perm(p)].some((c) => c.skill && hasType(c, 'N') && hasType(c, 'X')); }

  // ctx: { f, zero (the types that count 0: a Set, or a Map of type → { name, owner } of the card) }.
  // why: an array that gets one entry for each change of the printed power, for the power table
  // (paper 4.6 item 9): { t: the reason, s: a short name, n: the change, zero, clash }
  cardPower(p, c, ctx = {}, why = null) {
    if (!this.isUp(c)) return 0;
    const f = ctx.f ?? p.at;
    const evs = f ? this.evs[f] || [] : [];
    let pw = c.power;
    const zero = (t, s, clash = false) => { if (pw) why?.push({ t, s, n: -pw, zero: true, clash }); pw = 0; };
    const seal = hasType(c, 'X') && evs.find((e) => e.fx.noSpecial);
    if (seal) zero(`อีเวนต์ ${seal.name}: การ์ดพิเศษพลัง 0`, seal.name);
    const zt = ctx.zero && [...ctx.zero.keys()].find((t) => hasType(c, t));
    if (zt) { const src = ctx.zero.get?.(zt); zero(`${src ? `${src.name} ของ ${src.owner}` : 'คู่ต่อสู้'}: การ์ด${TYPES[zt]}พลังพื้นฐาน 0`, src?.name || TYPES[zt], true); } // "base power becomes 0", type bonuses still add [p.18]
    for (const e of evs) if (e.fx.lowUp && c.power <= 2) { pw += e.fx.lowUp; why?.push({ t: `อีเวนต์ ${e.name}: การ์ดพลัง 1–2 +${e.fx.lowUp}`, s: e.name, n: e.fx.lowUp }); }
    for (const [x, kind] of [[this.sit, 'สถานการณ์'], ...evs.map((e) => [e, 'อีเวนต์'])]) {
      if (x?.fx?.up && hasType(c, x.fx.up)) { pw += x.fx.n; why?.push({ t: `${kind} ${x.name}: การ์ด${TYPES[x.fx.up]} +${x.fx.n}`, s: x.name, n: x.fx.n }); }
    }
    return pw;
  }
  // one card line of the power table: the printed power, then what changed it
  cardRow(p, c, val, mods) {
    const bump = c.bump || 0; // printed power raised for good by another card (none in the demo now)
    if (bump && this.isUp(c)) mods.unshift({ t: c.bumpBy || 'พลังเพิ่มถาวร', s: c.bumpBy || 'ถาวร', n: bump });
    if (c.off) mods.push({ t: c.offBy || 'ถูกปิด', s: '1st Strike', n: -c.power, zero: true, clash: true });
    return { k: 'card', uid: c.uid, name: c.name || '', type: c.type, types: c.types || null, base: c.power - bump, mods, val, down: !!c.down, clashIn: !!c.clashIn };
  }
  // why a Master at battlefield f has no advantage, for the power table
  noTerrain(p, f) {
    if (p.lostTerrain && p.at === f) return p.lostTerrain;
    if (p.at !== f || p.slot == null) return 'ย้ายเข้ามาทีหลัง';
    return 'วางคนที่ 3 ขึ้นไป ไม่มีช่องได้เปรียบ';
  }

  // the advantage multipliers are on-use effects: none when 2nd Strike blocked them (ctx.blocked)
  terrainOf(p, cards, ctx = {}, why = null) {
    const f = ctx.f ?? p.at;
    if (!p.terrain) return 0;
    const evs = f ? this.evs[f] || [] : [];
    const fog = evs.find((e) => e.fx.noTerrain);
    if (fog) { why?.push({ t: `อีเวนต์ ${fog.name}: ได้เปรียบพื้นที่ไม่มีผล`, s: fog.name, n: -p.terrain, zero: true }); return 0; }
    let t = p.terrain;
    if (p.seized?.f === f) why?.push({ t: `ยึดทั้ง 2 ช่องด้วย ${p.seized.by}`, s: p.seized.by, n: 0 });
    for (const e of evs) if (e.fx.terrainUp) { t += e.fx.terrainUp; why?.push({ t: `อีเวนต์ ${e.name}: ได้เปรียบพื้นที่ +${e.fx.terrainUp}`, s: e.name, n: e.fx.terrainUp }); }
    for (const c of cards) {
      if (!this.isUp(c) || !c.fx?.terrainMul) continue;
      if (ctx.blocked) { why?.push({ t: `${c.name} ×${c.fx.terrainMul} ไม่ทำงาน (2nd Strike)`, s: c.name, n: 0 }); continue; }
      why?.push({ t: c.name, s: c.name, mul: c.fx.terrainMul, n: t * (c.fx.terrainMul - 1) });
      t *= c.fx.terrainMul;
    }
    return t;
  }

  // ctx.clash: the clash effects work (no 2nd Strike of someone else here). ctx.detail: also return
  // rows, one line per card and bonus with where each point comes from (paper 4.6 item 9)
  powerOf(p, play, ctx = {}) {
    const f = ctx.f ?? p.at;
    const cards = play.cards;
    const up = cards.filter((c) => this.isUp(c));
    const clash = ctx.clash ?? !this.blocked(p, f);
    const cx = { ...ctx, f, cards, blocked: play.blocked };
    const rows = ctx.detail ? [] : null;
    let sum = 0;
    for (const c of cards) {
      const mods = rows && [];
      const n = this.cardPower(p, c, cx, mods);
      sum += n;
      rows?.push(this.cardRow(p, c, n, mods));
    }
    // permanent cards from earlier rounds are still in play and keep giving their power [FD Keywords]
    for (const c of this.perm(p)) {
      const mods = rows && [];
      const n = this.cardPower(p, c, cx, mods);
      sum += n;
      rows?.push({ ...this.cardRow(p, c, n, mods), perm: true });
    }
    const parts = [['การ์ด', sum]];
    const tm = rows && [];
    const t = this.terrainOf(p, cards, cx, tm);
    if (t) parts.push(['ได้เปรียบพื้นที่', t]);
    if (rows && AREAS[f]?.field) rows.push({ k: 'terrain', base: p.terrain, mods: tm, val: t, none: p.terrain ? '' : this.noTerrain(p, f) });
    const add = (label, n, o = {}) => { parts.push([label, n]); rows?.push({ k: 'part', label, n, ...o }); };
    const evs = f ? this.evs[f] || [] : [];
    const named = (key) => [this.sit?.fx?.[key] ? `สถานการณ์ ${this.sit.name}` : '', ...evs.filter((e) => e.fx[key]).map((e) => `อีเวนต์ ${e.name}`)].filter(Boolean).join(' · ');
    if (play.tsubame ?? this.tsubame(cards)) add('Tsubame Gaeshi', TSUBAME, { note: 'ดาบครบ 3 ใบ' });
    const unify = this.sfx('unify') + (f ? this.efx(f, 'unify') : 0);
    if (unify && up.length >= 2 && ALL_TYPES.some((ty) => up.every((c) => hasType(c, ty)))) add('การ์ดชนิดเดียวกัน', unify, { note: named('unify') });
    if (play.cs2) add('Command Spell', play.cs2 * CS_POWER, { note: `${play.cs2} ดวง` });
    if (clash && p.m.key === 'kirei' && p.revealed) add('Executor', 2, { clash: true, note: 'คิเรย์ชื่อจริงเปิดแล้ว' });
    const ex = clash && this.climax() ? up.find((c) => c.fx?.excal) : null;
    if (ex) add('Excalibur ไคลแมกซ์', ex.fx.excal, { clash: true });
    const hidden = f ? this.efx(f, 'hiddenUp') : 0;
    if (hidden && !p.revealed) add('ชื่อจริงยังซ่อน', hidden, { note: named('hiddenUp') });
    if (ctx.underdog) add('VP น้อยสุด', ctx.underdog, { clash: true, note: named('underdog') });
    if (play.rb) add('Rule Breaker', play.rb, { note: 'เป้าหมายเหลือ Command Spell 0' });
    const total = parts.reduce((s, [, n]) => s + n, 0);
    return rows ? { total, parts, rows } : { total, parts };
  }
  // the power shown before the fight; a later play here can change it (Bellerophon, 2nd Strike)
  setPre(p) { const pw = this.powerOf(p, p.play); p.play.pre = pw.total; p.play.preParts = pw.parts; }

  // check and fix an answer for the card step (3.4). Off a battlefield (workshop, recon) the cards
  // are laid the same way: on-use effects work, no power counts (paper 8.3, v5.1)
  cleanCards(p, ans) {
    ans = ans || {};
    const blockHere = this.blocked(p, p.at); // 2nd Strike: no on-use effects and no Command Spells here [FD]
    const cs4 = !blockHere && !!ans.cs4 && p.cs > 0;
    // Rin's gems [FD]: +1 mana and Gandr Shot, each once a round (up to 3 times in the climax)
    const rin = p.m.key === 'rin' && !blockHere;
    const lim = this.gemLimit();
    const gemMana = rin ? clamp(ans.gemMana, 0, Math.min(lim, p.gems)) : 0;
    const gandr = rin ? clamp(ans.gandr, 0, Math.min(lim, p.gems - gemMana)) : 0;
    const mana = Math.min(MANA_MAX, p.mana + (cs4 ? CS_MANA : 0) + gemMana);
    const inf = this.infinite(p);
    const skills = this.usableSkills(p, mana); // the 8-mana rule looks at mana before paying
    const specials = this.usableSpecials(p, mana);
    const hand = p.hand.filter((c) => !(c.fx?.luck && p.roundUse.defeated)); // no Luck once defeated [FD]
    const ubwPick = (ans.ids || []).some((id) => skills.some((c) => c.uid === id && c.fx.ubw));
    const pool = [...hand, ...skills, ...specials, ...(ubwPick ? [...p.deck, ...p.trash] : [])];
    let picked = [...new Set(ans.ids || [])].map((id) => pool.find((c) => c.uid === id)).filter(Boolean);
    const ubwCard = picked.find((c) => c.fx?.ubw);
    const ubwOn = this.ubwOn(p);
    const slots = ubwCard ? 1 + ubwCard.fx.ubw + (p.grail ? 1 : 0) : this.maxCards(p);
    const riding = blockHere ? null : picked.find((c) => c.fx?.riding);
    // cards laid on top of the 2: K&B, Gandr Shot, 3rd Strike with 2 more agility cards face up, and
    // Rider Class' small hand cards [FD]
    const freeOf = (c, list, down) => !!c.fx?.extra || (!!c.fx?.strike3 && list.filter((x) => x !== c && !down.has(x.uid) && hasType(x, 'A')).length >= 2);
    const sort = (list, down) => {
      const core = []; const extra = []; let ride = 0;
      for (const c of list) {
        if (freeOf(c, list, down)) extra.push(c);
        else if (core.length < slots) core.push(c);
        else if (riding && ride < riding.fx.riding && !c.skill && !c.keep && p.hand.includes(c) && c.power <= RIDE_MAX) { extra.push(c); ride++; }
      }
      return { core, extra };
    };
    const down = new Set((ans.down || []).filter((id) => picked.some((c) => c.uid === id && this.canFlip(c))));
    let { core, extra } = sort(picked, down);
    picked = [...core, ...extra];
    const gateCard = picked.find((c) => c.fx?.gate); // its types are On Play: 2nd Strike does not stop them [FD Keywords]
    const gate = gateCard ? [...new Set((ans.gate || []).filter((t) => ['S', 'A', 'M'].includes(t)))] : [];
    const cost1 = (c) => (down.has(c.uid) ? 0 : this.costOf(p, c, gate.length));
    const total = () => picked.reduce((s, c) => s + cost1(c), 0);
    let cost = total();
    // too expensive: turn the dearest attack cards face down, then fewer Gate types, then drop NP/skill and special cards
    while (!inf && cost > mana) {
      const dear = picked.filter((c) => this.canFlip(c) && !down.has(c.uid) && cost1(c) > 0).sort((a, b) => cost1(b) - cost1(a))[0];
      if (dear) down.add(dear.uid);
      else if (gate.length) gate.pop();
      else { const s = [...picked].reverse().find((c) => !this.canFlip(c) && cost1(c) > 0); if (!s) break; picked = picked.filter((c) => c !== s); }
      cost = total();
    }
    ({ core, extra } = sort(picked, down)); // a 3rd Strike whose agility cards went face down needs a slot again
    picked = [...core, ...extra];
    // two cards when the hand has them: the missing ones go face down [p.10]; with UBW 0–4 cards [FD]
    if (!ubwCard && !ubwOn) for (const c of hand) if (core.length < PLAY && !picked.includes(c)) { picked.push(c); core.push(c); down.add(c.uid); }
    for (const id of [...down]) if (!picked.some((c) => c.uid === id)) down.delete(id);
    cost = total();
    const csLeft = p.cs - (cs4 ? 1 : 0);
    let cs2 = blockHere ? 0 : clamp(ans.cs2, 0, csLeft);
    // move cards take the cards along, engaged or not [paper 8.3]
    const movers = blockHere ? [] : picked.filter((c) => !down.has(c.uid) && (c.fx?.bell || c.fx?.move));
    const goes = (c) => this.cardDests(p, c).includes(ans.moveTo);
    const mover = movers.find((c) => c.uid === ans.mover && goes(c)) || movers.find(goes) || null; // ans.mover: the card picked in the pop-up
    const moveTo = mover ? ans.moveTo : null;
    const moveOk = (k) => PATH.slice(1).includes(k) && k !== p.at && (k !== 'recon' || this.reconFree(p));
    // Command Spell move after the cards: the cards go along [paper 10, ph]
    const csMove = !blockHere && !moveTo && csLeft - cs2 > 0 && moveOk(ans.csMove) ? ans.csMove : null;
    const dest = moveTo || csMove || p.at;
    if (!AREAS[dest].field || this.blocked(p, dest)) cs2 = 0; // power +2 needs a battlefield
    // Short Temper: Rin must use a Command Spell in round 1; if she picked none, power +2 (mana off a battlefield) [FD]
    let temper = null;
    if (p.m.key === 'rin' && this.round === 1 && !p.roundUse.cs && !cs4 && !cs2 && !csMove && !blockHere && csLeft > 0) {
      if (AREAS[dest].field && !this.blocked(p, dest)) { cs2 = 1; temper = 'power'; } else temper = 'mana';
    }
    // Rule Breaker: a Master in our battlefield [FD]
    const rb = picked.find((c) => c.fx?.ruleBreaker && !down.has(c.uid));
    const targets = rb && !blockHere && AREAS[dest].field ? this.here(dest).filter((q) => q !== p) : [];
    const rbTarget = targets.find((q) => q.id === ans.rbTarget)?.id ?? this.rbAuto(targets)?.id ?? null;
    return {
      ids: picked.map((c) => c.uid), down: [...down], cs2, cs4, gemMana, gandr, cost: inf ? 0 : cost, budget: inf ? Infinity : mana,
      moveTo, mover: mover?.uid ?? null, csMove, ubw: !!ubwCard, gate, rbTarget, temper, blocked: blockHere,
    };
  }

  applyCards(p, a) {
    if (a.cs4) this.csMana(p);
    if (a.gemMana) { this.gain(p, a.gemMana); this.log(`${p.name} ใช้อัญมณี ${a.gemMana} ใบ ได้มานา +${a.gemMana}`, p.isHuman ? 'me' : ''); }
    p.gems -= a.gemMana + a.gandr;
    if (a.ubw) { for (const c of p.trash) delete c.down; p.hand.push(...p.deck, ...p.trash); p.deck = []; p.trash = []; } // the new hand [FD]
    p.mana -= a.cost;
    if (a.cs2) this.useCS(p, a.cs2);
    const cards = [];
    const down = new Set(a.down);
    for (const id of a.ids) {
      let c = p.specials.find((x) => x.uid === id);
      if (c) { cards.push({ ...c, down: false }); continue; }
      c = p.skills.find((x) => x.uid === id);
      if (c) {
        const copy = { ...c, down: false, paid: this.costOf(p, c, a.gate.length) };
        if (c.fx.gate && a.gate.length) copy.types = ['N', ...a.gate]; // Gate of Babylon [FD]
        cards.push(copy);
        p.uses[c.name] = (p.uses[c.name] || 0) + 1;
        if (c.fx.once) c.gone = true;
        if (c.fx.permanent) { c.resident = true; c.residentFrom = this.round; } // permanent: works from this round [FD]
        if (c.limit === 'round') p.roundUse[`lim${c.uid}`] = true;
        continue;
      }
      const i = p.hand.findIndex((x) => x.uid === id);
      if (i < 0) continue;
      c = p.hand.splice(i, 1)[0];
      c.down = down.has(c.uid);
      cards.push(c);
    }
    for (let k = 0; k < a.gandr; k++) cards.push(inst(GANDR, { keep: true }));
    if (a.gandr) this.log(`${p.name} ใช้อัญมณี ${a.gandr} ใบ ลง Gandr Shot ${a.gandr} ใบ`, p.isHuman ? 'me' : '');
    let revealing = false;
    const reveal = (why) => { if (p.revealed) return; p.revealed = true; revealing = true; this.log(`✸ ${p.name} ใช้ ${why} เปิดชื่อจริง: ${p.sv.name} (${p.sv.cls})`, 'reveal'); };
    const up = cards.filter((c) => this.isUp(c));
    for (const c of up) if (c.fx?.reveal) reveal(c.name);
    const tsubame = this.tsubame(cards);
    if (tsubame) reveal('Tsubame Gaeshi');
    if (up.some((c) => c.fx?.archerLose)) p.roundUse.archer = true; // Archer Class: −5 VP if this round's fight is lost [FD]
    p.play = { cards, cs2: a.cs2, revealing, blocked: a.blocked, tsubame, rb: 0 };
    // the move card takes the Master and the cards along [paper 8.3]; Bellerophon takes both advantage spaces [FD]
    const mover = a.mover != null ? cards.find((c) => c.uid === a.mover) : null;
    const was = p.at;
    if (mover && a.moveTo) {
      if (a.moveTo !== was) { this.enter(p, a.moveTo, 'card'); this.log(`${p.name} ใช้ ${mover.name} ย้ายจาก${AREAS[was].name}ไป${AREAS[a.moveTo].name}`, 'reveal'); }
      if (mover.fx.bell && AREAS[a.moveTo].field) {
        for (const q of this.here(a.moveTo)) if (q !== p && q.terrain) { q.terrain = 0; q.lostTerrain = `ถูก ${mover.name} ของ ${p.name} ยึด`; }
        p.terrain = TERRAIN.reduce((s, t) => s + t, 0); p.seized = { by: mover.name, f: a.moveTo };
        this.log(`${p.name} ใช้ ${mover.name} ยึดช่องได้เปรียบพื้นที่ทั้ง 2 ช่องที่${AREAS[a.moveTo].name} (+${p.terrain})`, 'reveal');
      }
    }
    // On Play effects work even where 2nd Strike holds the battlefield [FD Keywords]
    for (const c of up) if (c.fx?.playVP) { this.addVP(p, c.fx.playVP); this.log(`${p.name} ใช้ ${c.name} ได้ ${c.fx.playVP} VP`, p.isHuman ? 'good' : ''); }
    // Metamorphosis: the tarot card goes face down again [FD]
    const hide = up.find((c) => c.fx?.hide);
    if (hide && p.revealed) { p.revealed = false; revealing = false; p.play.revealing = false; this.log(`✸ ${p.name} ใช้ ${hide.name} ซ่อนชื่อจริงกลับ`, 'reveal'); }
    // Rider Class: draw 1 when laid with a basic card [FD]
    if (up.some((c) => c.fx?.riderDraw) && cards.some((c) => c.basic)) { const n = p.hand.length; this.drawTo(p, n + 1); if (p.hand.length > n) this.log(`${p.name} ใช้ Rider Class จั่ว 1 ใบ`, p.isHuman ? 'me' : ''); }
    if (a.blocked) {
      const off = up.filter((c) => ACTION_FX.some((k) => c.fx?.[k])).map((c) => cardName(c));
      if (off.length) this.log(`${p.name}: ความสามารถ Action ของ ${off.join(', ')} ไม่ทำงาน เพราะ 2nd Strike ของ ${this.block[was].name}`, '');
    } else {
      for (const c of up) {
        if (c.fx?.mana) this.gain(p, c.fx.mana);
        if (c.fx?.archer) { this.addVP(p, c.fx.archer); this.log(`${p.name} ใช้ ${c.name} ได้ ${c.fx.archer} VP · ถ้าแพ้การต่อสู้รอบนี้เสีย ${c.fx.archerLose} VP`, p.isHuman ? 'good' : ''); }
      }
      // 2nd Strike holds this battlefield for the round [FD]
      if (up.some((c) => c.fx?.block) && AREAS[p.at].field) { this.block[p.at] = p; this.log(`${p.name} ใช้ 2nd Strike: คนอื่นที่${AREAS[p.at].name}ใช้ความสามารถ Action และ Combat และ Command Spell ไม่ได้รอบนี้`, 'reveal'); }
      // Rule Breaker [FD]
      const rb = up.find((c) => c.fx?.ruleBreaker);
      const q = rb && AREAS[p.at].field ? this.players[a.rbTarget] : null;
      if (rb && q && !q.out && q !== p && q.at === p.at) {
        const had = q.cs > 0;
        if (had) q.cs--;
        const what = [had ? `${q.name} เสีย Command Spell 1 ดวง` : `${q.name} ไม่มี Command Spell`];
        // left with none (the last one, or none to lose): [แพ้] and our power +10 (paper 6, B's rule 30 Oct 2026)
        if (q.cs <= 0) { q.roundUse.defeated = `Rule Breaker ของ ${p.name}`; p.play.rb = rb.fx.ruleBreaker; what.push(`${q.name} [แพ้]`, `${p.name} พลังรวม +${rb.fx.ruleBreaker}`); }
        this.log(`${p.name} ใช้ Rule Breaker: ${what.join(' · ')}`, 'reveal');
      }
    }
    if (a.temper === 'mana') this.csMana(p, ' (Short Temper บังคับใช้รอบ 1)');
    if (a.temper === 'power') this.log(`${p.name}: Short Temper บังคับใช้ Command Spell รอบ 1 จึงใช้พลัง +${CS_POWER}`, 'cs');
    if (a.csMove) { this.useCS(p); this.enter(p, a.csMove, 'cs'); }
    if (a.cs2) this.log(`${p.name} ใช้ Command Spell พลัง +${a.cs2 * CS_POWER} ที่${AREAS[p.at].name}`, 'cs');
    this.record(p, cards);
    this.ubwCheck(p);
    if (AREAS[p.at].field) {
      this.setPre(p);
      for (const q of this.here(p.at)) if (q !== p && q.play) this.setPre(q);
      return;
    }
    // off a battlefield the on-use effects are done but no power counts; the cards go to the
    // discard pile the way they were laid (paper 8.3, v5.1)
    const n = cards.length - up.length;
    this.log(`${p.name} ลงการ์ดที่${AREAS[p.at].name}: ${[up.map((c) => cardName(c)).join(', '), n ? `คว่ำ ${n} ใบ` : ''].filter(Boolean).join(' · ')} · ไม่คิดพลัง`, p.isHuman ? 'me' : '');
    this.dropPlay(p);
  }
  // Unlimited Blade Works turns off once the hand is empty, back to the skill slot [FD]
  ubwCheck(p) {
    const u = p.skills.find((c) => c.fx?.ubw && c.resident);
    if (u && !p.hand.length) { u.resident = false; this.log(`${p.name}: การ์ดในมือหมด ${u.name} ปิด กลับช่องสกิล`, p.isHuman ? 'me' : ''); }
  }

  // what everyone saw a Master lay or use, oldest first; face-down cards stay unknown (paper 4.6 item 6)
  record(p, cards, w = 'onUse') {
    for (const c of cards) p.shown.push(c.down ? { down: true, round: this.round, w } : { ...c, round: this.round, w });
    if (p.shown.length > 60) p.shown.splice(0, p.shown.length - 60);
  }

  // ---------- card windows (paper 8.0 and 9) ----------
  // A card with a line for window w is used from the hand (or the NP/skill slot) in that window. It
  // is not one of the 2 cards laid in step 3.4; it costs its mana; NP/skill cards still need 8.
  useLine(p, c, w) { return (c.use || []).find((u) => u.when === w && this.whereOk(p, u.where) && this.condOk(p, u.cond)) || null; }
  whereOk(p, where = 'any') { return where === 'any' || (where === 'field' ? !!AREAS[p.at]?.field : p.at === where); }
  condOk(p, cond) {
    if (!cond) return true;
    if (cond === 'engaged') return this.engagedAt(p.at);
    if (cond === 'hidden') return !p.revealed;
    return false;
  }
  // why a window card cannot be used now ('' = it can)
  useState(p, c) {
    if (c.limit === 'round' && p.roundUse[`lim${c.uid}`]) return 'ใช้แล้วรอบนี้ (รอบละครั้ง)';
    const s = c.skill ? this.skillState(p, c) : c.keep ? this.specialState(p, c) : '';
    if (s) return s;
    const m = this.costOf(p, c);
    if (!this.infinite(p) && m > p.mana) return `มานาไม่พอ (ใช้ ${m})`;
    return '';
  }
  windowCards(p, w) { return [...p.hand, ...p.specials, ...p.skills].filter((c) => this.useLine(p, c, w) && !this.useState(p, c)); }
  // one Master's turn in a window: asked only while a card can be used, as often as they like
  async window(p, w) {
    for (let k = 0; k < 8; k++) {
      const cards = this.windowCards(p, w);
      if (!cards.length) break;
      this.turn = p; this.win = w; this.step = WINDOWS[w].code;
      this.emit('update');
      const ans = await this.decide(this, p, 'window', { w, cards: cards.map((c) => c.uid) });
      const c = cards.find((x) => x.uid === ans?.use);
      if (!c || !this.useLine(p, c, w) || this.useState(p, c)) break;
      this.useCard(p, c, w);
    }
    this.win = null;
  }
  useCard(p, c, w) {
    const u = this.useLine(p, c, w);
    const m = this.costOf(p, c);
    if (!this.infinite(p)) p.mana -= m;
    if (c.skill) { p.uses[c.name] = (p.uses[c.name] || 0) + 1; if (c.fx?.once) c.gone = true; } // back face up by the tarot card
    else if (c.consume) p.specials.splice(p.specials.indexOf(c), 1); // Black Shadow: once, then gone
    else if (!c.keep) { p.hand.splice(p.hand.indexOf(c), 1); c.down = false; p.trash.push(c); } // attack cards: discard pile, face up
    if (c.limit === 'round') p.roundUse[`lim${c.uid}`] = true;
    this.record(p, [c], w);
    const fx = u.fx || {};
    const got = [];
    if (fx.mana) { this.gain(p, fx.mana); got.push(`มานา +${fx.mana}`); }
    if (fx.vp) { this.addVP(p, fx.vp); got.push(`${fx.vp} VP`); }
    if (fx.freeMove) { p.roundUse.freeMove = true; got.push('ย้ายได้แม้ติดพัน'); }
    if (fx.peek) { p.peek = this.round; got.push('ดูอีเวนต์ชินโตะที่คว่ำอยู่'); }
    this.log(`${p.name} ใช้ ${c.name} ช่วง${WINDOWS[w].name}${m ? ` (มานา ${m})` : ''}: ${got.join(' · ')}`, p.isHuman ? 'me' : '');
    this.emit('update');
  }

  // played attack cards go to the discard pile the way they were played [p.11]; NP/skill and
  // the in-hand special cards go back
  dropPlay(p) {
    if (p.play) for (const c of p.play.cards) if (!c.skill && !c.keep) { delete c.off; delete c.offBy; delete c.clashIn; p.trash.push(c); }
    p.play = null;
  }

  // Rin's gem: discard 1–3 hand cards and draw as many, in her card step; once a round, up to
  // 3 times in the climax [FD]
  canSwap(p) { return p.m.key === 'rin' && p.gems > 0 && (p.roundUse.swaps || 0) < this.gemLimit() && p.hand.length > 0 && !this.blocked(p, p.at) && !this.ubwOn(p); }
  gemSwap(p, ids) {
    if (!this.canSwap(p)) return false;
    const set = new Set((ids || []).filter((id) => p.hand.some((c) => c.uid === id)).slice(0, 3));
    if (!set.size) return false;
    const n = p.hand.length;
    for (const c of p.hand) if (set.has(c.uid)) { c.down = true; p.trash.push(c); }
    p.hand = p.hand.filter((c) => !set.has(c.uid));
    this.drawTo(p, n);
    p.gems -= 1; p.roundUse.swaps = (p.roundUse.swaps || 0) + 1;
    this.log(`${p.name} ใช้อัญมณี 1 ใบ ทิ้งการ์ด ${set.size} ใบแล้วจั่วใหม่`, p.isHuman ? 'me' : '');
    this.emit('update');
    return true;
  }

  // ---------- the game ----------
  async run() {
    this.log(`สงครามจอกศักดิ์สิทธิ์เริ่มต้น · Master ${this.players.length} คน · รอบปกติ ${REGULAR} รอบ แล้วไคลแมกซ์จนเหลือคนเดียว`, 'sys');
    this.emit('update');
    while (!this.over && this.alive().length > 1 && this.round < MAX_ROUNDS) {
      await this.playRound();
      if (this.over) break; // Excalibur won the game [FD]
      if (this.round >= REGULAR) this.eliminate();
    }
    this.finish();
  }

  // climax card by the number of players left [p.11]
  climaxCard() { const n = this.alive().length; return { ...CLIMAX[n >= 4 ? 4 : n], size: n >= 4 ? 4 : n }; }

  // after round 8 and every climax round [p.11]: lowest VP out first, everyone tied on the line out
  eliminate() {
    const r = this.round;
    const left = [...this.alive()].sort((a, b) => b.vp - a.vp);
    const target = r === REGULAR ? (left.length >= 5 ? 4 : left.length - 1) : this.sit.size === 2 ? 1 : 2;
    if (left.length <= target) return;
    const line = left[target].vp;
    const keep = left.filter((p) => p.vp > line);
    if (!keep.length) { this.log(`ทุกคนเสมอกันที่เส้นตัด (${line} VP) ไม่มีใครตกรอบ เล่นไคลแมกซ์อีกรอบ`, 'sys'); return; }
    for (const p of left.filter((q) => q.vp <= line)) {
      // Avalon: the first time Shirou would be out, he loses all his mana instead [FD]
      if (p.m.key === 'shirou' && !p.avalonUsed) { p.avalonUsed = true; p.avalonRound = r; p.mana = 0; this.log(`${p.name} ไม่ตกรอบเพราะ Avalon: เสียมานาทั้งหมดแทน (${p.vp} VP)`, 'reveal'); continue; }
      p.out = true;
      p.outRound = r;
      this.log(`✖ ${p.name} ตกรอบ (จบรอบ ${r} · ${p.vp} VP)`, 'death');
    }
    this.emit('update');
  }

  async playRound() {
    this.round++;
    this.sit = this.round <= REGULAR ? this.sits[this.round - 1] : this.climaxCard();
    this.log(`── ${this.climax() ? `ไคลแมกซ์ ${this.climaxNo()} (รอบ ${this.round})` : `รอบ ${this.round}/${REGULAR}`} · ${this.sit.name} ──`, 'phase');
    await this.prep();
    await this.outpost();
    await this.action();
    await this.combat();
    if (this.over) return;
    await this.endRound();
    this.cleanup();
  }

  async prep() {
    this.phase = 'prep';
    this.step = '1.1';
    this.block = {};
    for (const p of this.alive()) {
      this.drawTo(p, HAND);
      p.at = null; p.slot = null; p.terrain = 0; p.lostTerrain = null; p.seized = null; p.play = null; p.roundUse = {};
    }
    this.step = '1.2';
    for (const p of this.alive()) this.gain(p, this.sit.mana);
    this.log(`การ์ดสถานการณ์ ${this.sit.name}: ทุกคนได้มานา +${this.sit.mana}${this.sit.text ? ` · ${this.sit.text}` : ''}`, 'sys');
    // Dress of Heaven: from round 8, 2 VP if last round's battlefield had someone who went out [FD]
    const il = this.alive().find((p) => p.m.key === 'illya');
    if (il && this.round >= REGULAR && il.lastFight?.round === this.round - 1 && il.lastFight.with.some((id) => this.players[id].out && this.players[id].outRound === this.round - 1)) {
      this.addVP(il, 2);
      this.log(`${il.name} ได้ 2 VP (Dress of Heaven: รอบก่อนอยู่สนามรบเดียวกับคนที่ตกรอบ)`, il.isHuman ? 'good' : '');
    }
    this.step = '1.3';
    this.evs = { miyama: [this.drawEvent()], shinto: [this.drawEvent()] };
    const ex = this.sfx('extraEvent');
    if (ex) this.evs[this.sit.fx.extraEvent].push(this.drawEvent());
    this.shintoOpen = false;
    this.log(`อีเวนต์มิยามะ: ${this.evs.miyama.map((e) => `${e.name} ${e.vp} VP`).join(' + ')} · อีเวนต์ชินโตะคว่ำไว้`, 'sys');
    this.emit('phase');
    this.step = '1.4';
    for (const p of this.order()) await this.window(p, 'prep');
    this.turn = null;
  }

  drawEvent() {
    if (!this.evDeck.length) { this.evDeck = this.shuffle(this.evUsed); this.evUsed = []; }
    return this.evDeck.pop();
  }

  async outpost() {
    this.phase = 'outpost';
    this.emit('phase');
    for (const p of this.order()) {
      this.turn = p;
      this.step = '2.1';
      await this.window(p, 'prePlace');
      this.step = '2.2';
      const opts = ['miyama', 'shinto'];
      if (this.here('workshop').length < WORKSHOP.length) opts.unshift('workshop');
      const ans = await this.decide(this, p, 'place', { opts });
      const to = opts.includes(ans?.to) ? ans.to : opts[0];
      const k = this.here(to).length;
      p.at = to;
      p.slot = k; // which workshop or advantage space, for the board
      if (to === 'workshop') {
        const n = WORKSHOP[k];
        let txt;
        if (p.m.key === 'kuzuki') txt = 'ไม่ได้มานา (คุซุกิ)'; else { this.gain(p, n); txt = `ได้มานา +${n}`; }
        const tc = p.skills.find((c) => c.resident && c.fx?.workshop); // Caster Class [FD]
        if (tc) { this.gain(p, tc.fx.workshop.mana); this.addVP(p, tc.fx.workshop.vp); txt += ` · ${tc.name} มานา +${tc.fx.workshop.mana} ได้ ${tc.fx.workshop.vp} VP`; }
        this.log(`${p.name} วางที่โรงฝึกเวทช่อง ${k + 1} ${txt}`, p.isHuman ? 'me' : '');
      } else {
        if (k < TERRAIN.length) p.terrain = TERRAIN[k];
        this.log(`${p.name} วางที่${AREAS[to].name}${p.terrain ? ` ได้เปรียบพื้นที่ +${p.terrain}` : ''}`, p.isHuman ? 'me' : '');
        if (to === 'miyama' && p.m.key === 'shinji') { this.gain(p, 1); this.log(`${p.name} เข้ามิยามะ ได้มานา +1 (Immoral)`, ''); }
      }
      this.emit('update');
      this.step = '2.3';
      await this.window(p, 'postPlace');
    }
    this.turn = null;
  }

  async action() {
    this.phase = 'action';
    this.shintoOpen = true;
    this.log(`เปิดอีเวนต์ชินโตะ: ${this.evs.shinto.map((e) => `${e.name} ${e.vp} VP`).join(' + ')}`, 'sys');
    this.emit('phase');
    let seq = 0;
    for (const p of this.order()) {
      this.turn = p;
      p.seq = ++seq;
      this.step = '3.1';
      this.emit('update');
      await this.window(p, 'preMove');
      // ① move; a Command Spell may come before it (mana) or be the move itself [p.10]
      this.step = '3.2';
      const mv = (await this.decide(this, p, 'move', { opts: this.moveOptions(p) })) || {};
      if (mv.cs4 && p.cs > 0 && !this.blocked(p, p.at)) this.csMana(p);
      const o = this.moveOptions(p).find((x) => x.to === mv.to && x.how === mv.how);
      if (o && o.how !== 'stay') {
        p.mana -= o.cost;
        if (o.how === 'cs') this.useCS(p);
        if (o.how === 'walk') this.log(`${p.name} ย้ายไป${AREAS[o.to].name}${o.cost ? ` (มานา ${o.cost})` : ''}`, p.isHuman ? 'me' : '');
        if (o.how === 'kirei') this.log(`${p.name} ใช้ Impartial ไปลาดตระเวน (มานา 2)`, '');
        this.enter(p, o.to, o.how);
      }
      this.emit('update');
      this.step = '3.3';
      await this.window(p, 'postMove');
      // ② battle prep, wherever the piece is; Rin may swap cards first
      this.step = '3.4';
      const field = AREAS[p.at].field;
      let ans = null;
      for (let k = 0; k < 6; k++) {
        ans = await this.decide(this, p, 'cards', { field });
        if (ans?.swap) { this.gemSwap(p, ans.swap); continue; }
        break;
      }
      this.applyCards(p, this.cleanCards(p, ans));
      if (p.play) this.log(`${p.name} ลงการ์ดที่${AREAS[p.at].name} พลังรวม ${p.play.pre}`, p.isHuman ? 'me' : '');
      this.emit('update');
      this.step = '3.5';
      await this.window(p, 'postCards');
    }
    this.turn = null;
  }

  async combat() {
    this.phase = 'combat';
    this.step = '4.1';
    this.results = [];
    this.turn = null;
    this.emit('phase');
    for (const f of FIELDS) {
      const people = this.order().filter((p) => p.at === f);
      if (!people.length) continue;
      if (people.length === 1) {
        const p = people[0];
        const n = this.eventVP(f); // alone: only the event VP [p.11]
        this.addVP(p, n);
        this.results.push({ f, alone: true, pool: n, winners: [p.id], ents: [{ id: p.id, gain: n, cards: p.play?.cards || [], power: p.play?.pre ?? 0, parts: [], won: true, notes: [] }] });
        this.log(`${AREAS[f].name}: ${p.name} อยู่คนเดียว ได้ ${n} VP`, p.isHuman ? 'good' : '');
        continue;
      }
      this.results.push(await this.fight(f, people));
    }
    // after the fight [FD]: Kuzuki's VP when he got none, Rin's Short Temper mana back
    for (const p of this.order()) {
      if (p.m.key === 'kuzuki' && !p.roundUse.gotVP) {
        const n = p.at === 'workshop' && this.here('workshop').length === 1 ? 2 : 1;
        this.addVP(p, n);
        this.log(`${p.name} รอบนี้ไม่ได้ VP เลย ได้ ${n} VP${n === 2 ? ' (อยู่โรงฝึกเวทคนเดียว)' : ''}`, p.isHuman ? 'good' : '');
      }
      if (p.roundUse.temper) { const k = Math.min(p.mana, CS_MANA); p.mana -= k; p.roundUse.temper = false; this.log(`${p.name} เสียมานา ${k} (Short Temper: รอบ 1 ใช้ Command Spell รับมานา)`, ''); }
    }
    if (this.special) { this.over = true; this.emit('combat', { results: this.results }); return; }
    this.step = '4.2';
    this.emit('combat', { results: this.results });
    await this.decide(this, this.human, 'combatEnd', { results: this.results });
  }

  // 5.1: the end-of-round window, one Master at a time in seat order
  async endRound() {
    this.phase = 'end';
    this.step = '5.1';
    this.emit('phase');
    for (const p of this.order()) {
      if (p.m.key === 'illya') this.gain(p, 1); // +1 mana at the end of each round [FD]
      if (p.m.key !== 'sakura' || p.grail) continue;
      // The Tainted Grail: end of round 8 and not first (a tie counts as first) [FD]
      if (this.round === REGULAR && this.rank(p) > 1) {
        p.grail = true;
        p.specials = p.specials.filter((c) => !c.consume);
        this.log(`✸ ${p.name} ได้ The Tainted Grail: มานาไม่จำกัด ลงการ์ดได้ ${this.maxCards(p)} ใบจนจบเกม`, 'reveal');
      } else if (this.alive().every((q) => q === p || q.vp > p.vp)) {
        // Broken Vessel: everyone has more VP [FD]
        p.specials.push(inst(BLACK_SHADOW, { keep: true }));
        this.log(`${p.name} ได้การ์ด Black Shadow (Broken Vessel: ทุกคนมี VP มากกว่า)`, p.isHuman ? 'good' : '');
      }
    }
    for (const p of this.order()) await this.window(p, 'end');
    this.turn = null;
    this.step = '5.2';
  }

  async fight(f, people) {
    const ents = people.map((p) => ({ p, cards: p.play?.cards || [], notes: [], gain: 0, loss: 0 }));
    const up = (e) => e.cards.filter((c) => this.isUp(c));
    const blk = this.block[f];
    const ok = (e) => !blk || blk === e.p; // 2nd Strike: the others' clash effects do not work here [FD]
    // cards whose clash effects work: the ones laid face up, and permanent NP/skill cards [FD]
    const act = (e) => (ok(e) ? [...up(e), ...this.perm(e.p)] : []);
    const card = (e, k) => act(e).find((c) => c.fx?.[k]);
    const defeated = new Map();
    const defeat = (e, why) => { if (!defeated.has(e)) defeated.set(e, why); };
    for (const e of ents) {
      e.p.lastFight = { round: this.round, f, with: people.filter((q) => q !== e.p).map((q) => q.id) }; // Dress of Heaven
      if (e.p.roundUse.defeated) defeat(e, e.p.roundUse.defeated); // Rule Breaker in the card step
    }
    // on-clash effects one by one in seat order [p.11]
    for (const a of ents) {
      const foes = ents.filter((b) => b !== a);
      if (card(a, 'petrify')) for (const b of foes) if (!up(b).some((c) => hasType(c, 'X') && !this.efx(f, 'noSpecial'))) defeat(b, `ถูก Petrification ของ ${a.p.name}`);
      if (card(a, 'duel') && foes.length === 1) defeat(foes[0], `โดน Gáe Bolg (แทง) ของ ${a.p.name}`);
      if (card(a, 'zab') && this.alive().length === 2) for (const b of foes) defeat(b, `โดน Zabaniya ของ ${a.p.name} (คู่แข่งคนสุดท้าย)`);
      if (card(a, 'enuma')) for (const b of foes) if (this.activeSpecial(b.p)) defeat(b, `โดน Enuma Elish ของ ${a.p.name} (มีการ์ด NP ชนิดพิเศษ)`);
      const s1 = card(a, 'strike1');
      if (s1) await this.firstStrike(a, s1, foes, f, up);
    }
    const lowVP = Math.min(...people.map((p) => p.vp));
    const under = this.efx(f, 'underdog');
    for (const e of ents) {
      const zero = new Map(); // type → the card that zeroes it, for the power table
      for (const o of ents) if (o !== e) for (const c of act(o)) if (c.fx?.zeroOpp && !zero.has(c.fx.zeroOpp)) zero.set(c.fx.zeroOpp, { name: c.name, owner: o.p.name });
      e.pw = this.powerOf(e.p, e.p.play || { cards: [] }, { f, zero, clash: ok(e), underdog: under && e.p.vp === lowVP ? under : 0, detail: true });
    }
    // Assassin Class: after the power, the one foe above us falls when 3+ are here [FD]
    if (ents.length >= 3) for (const a of ents) {
      if (!card(a, 'presence') || defeated.has(a)) continue;
      const above = ents.filter((b) => b !== a && !defeated.has(b) && b.pw.total > a.pw.total);
      if (above.length === 1) defeat(above[0], `โดน Assassin Class ของ ${a.p.name}`);
    }
    // Luck: the defeat does not count [FD]
    for (const e of ents) if (defeated.has(e) && card(e, 'luck')) { e.notes.push(`Luck: ไม่สน [แพ้] (${defeated.get(e)})`); defeated.delete(e); }
    const cand = ents.filter((e) => !defeated.has(e));
    let winners = [];
    if (cand.length) { const top = Math.max(...cand.map((e) => e.pw.total)); winners = cand.filter((e) => e.pw.total === top); }
    const pool = this.fieldVP(f);
    for (const e of winners) {
      const p = e.p;
      e.gain += Math.ceil(pool / winners.length) + (p.play?.cs2 || 0) * CS_VP; // ties split, rounded up [p.11]
      for (const c of act(e)) if (c.fx?.win) { e.gain += c.fx.win; e.notes.push(`${c.name} +${c.fx.win} VP`); } // Caladbolg II, Preparation
      const wm = this.efx(f, 'winMana'); if (wm) { this.gain(p, wm); e.notes.push(`มานา +${wm}`); }
      // Excalibur: a win in the climax round "2 left" wins the game [FD]
      if (card(e, 'excal') && this.climax() && this.sit.size === 2 && !this.special) this.special = { p, how: `Excalibur: ${p.name} ชนะในรอบไคลแมกซ์ "เหลือ 2 คน"` };
    }
    for (const e of ents) {
      // Gáe Bolg (ขว้าง): a win gives 1 VP per foe, and each foe loses as much [FD]
      const st = card(e, 'strike');
      if (st && winners.includes(e)) {
        const k = st.fx.strike * (ents.length - 1);
        e.gain += k; e.notes.push(`${st.name}: ${k} VP ตามจำนวนคู่ต่อสู้`);
        for (const b of ents) if (b !== e) b.loss += k;
      }
      if (winners.includes(e)) continue;
      const p = e.p;
      const lv = this.efx(f, 'loserVP'); if (lv) e.gain += lv;
      // God Hand: losing gives 3 VP and each winner loses 3; that card leaves the game [FD]
      for (const gh of up(e).filter((c) => c.fx?.godHand)) { // untagged text: 2nd Strike does not stop it [FD Keywords]
        e.gain += gh.fx.godHand;
        for (const w of winners) { w.loss += gh.fx.godHand; w.notes.push(`${gh.name} −${gh.fx.godHand} VP`); }
        const own = p.skills.find((s) => s.uid === gh.uid);
        if (own) own.gone = true;
        e.notes.push(`${gh.name}: แพ้แต่ได้ ${gh.fx.godHand} VP แล้วออกจากเกม`);
      }
      // Rain of Light: a loss brings Rule Breaker back [FD]
      if (card(e, 'rain')) { const rb = p.skills.find((s) => s.fx?.ruleBreaker && s.gone); if (rb) { rb.gone = false; e.notes.push('Rain of Light: Rule Breaker กลับช่องสกิล'); } }
      // Archer Class: a lost fight costs 5 VP, it cannot be stopped [FD]
      if (p.roundUse.archer) { e.loss += 5; e.notes.push('Archer Class: แพ้ −5 VP'); }
      // Poor Leadership: a lost fight costs Shinji a Command Spell [FD]
      if (p.m.key === 'shinji' && p.cs > 0) { p.cs--; e.notes.push('Poor Leadership: เสีย Command Spell 1 ดวง'); }
    }
    // Zabaniya: a win over a foe doubles the VP of this fight [FD]
    for (const e of winners) if (card(e, 'zab') && this.alive().length > 2 && e.gain > 0) { const k = e.gain; e.gain += k; e.notes.push(`Zabaniya: VP จากการต่อสู้นี้ ×2 (+${k})`); }
    for (const e of ents) this.addVP(e.p, e.gain);
    for (const e of ents) {
      if (e.loss) { const k = this.loseVP(e.p, e.loss); e.notes.push(`เสีย ${k} VP`); e.gain -= k; }
      if (defeated.has(e)) { e.notes.unshift('[แพ้]'); e.notes.push(defeated.get(e)); }
      if (!ok(e)) e.notes.push(`ผล "ตอนปะทะ" ไม่ทำงาน (2nd Strike ของ ${blk.name})`);
    }
    const r = {
      f, pool, winners: winners.map((e) => e.p.id),
      ents: ents.map((e) => ({ id: e.p.id, cards: e.cards, power: e.pw.total, parts: e.pw.parts, rows: e.pw.rows, pre: e.p.play?.pre ?? 0, preParts: e.p.play?.preParts || [], gain: e.gain, notes: e.notes, won: winners.includes(e), defeated: defeated.has(e) })),
    };
    this.log(`⚔ ${AREAS[f].name}: ${ents.map((e) => `${e.p.name} ${defeated.has(e) ? '[แพ้]' : e.pw.total}`).join(' · ')} → ${winners.length ? winners.map((e) => `${e.p.name} ${e.gain >= 0 ? '+' : ''}${e.gain} VP`).join(', ') : 'ไม่มีผู้ชนะ'}`, 'fight');
    return r;
  }

  // 1st Strike [FD]: it turns itself off and lays a basic Strength card from the hand (free); if it
  // can, +2 mana and a face-up basic card of a foe here turns off. The Master picks both cards in
  // a pop-up (paper 4.6 item 8); a bot, or no answer, takes the strongest of each.
  async firstStrike(a, s1, foes, f, up) {
    const p = a.p;
    s1.off = true; s1.offBy = '1st Strike ปิดตัวเอง';
    const pw = (q, c) => this.cardPower(q, c, { f });
    const mine = p.hand.filter((c) => c.basic && hasType(c, 'S')).sort((x, y) => pw(p, y) - pw(p, x));
    if (!mine.length) { a.notes.push('1st Strike ปิดตัวเอง · ไม่มีการ์ดกำลังพื้นฐานในมือ'); return; }
    const tgts = foes.flatMap((b) => up(b).filter((c) => c.basic).map((c) => ({ b, c }))).sort((x, y) => pw(y.b.p, y.c) - pw(x.b.p, x.c));
    this.turn = p;
    const ans = await this.decide(this, p, 'strike1', { f, card: s1.uid, mine: mine.map((c) => c.uid), foes: tgts.map(({ b, c }) => ({ id: b.p.id, uid: c.uid })) });
    this.turn = null;
    const s = mine.find((c) => c.uid === ans?.card) || mine[0];
    const tgt = tgts.find(({ c }) => c.uid === ans?.target) || tgts[0];
    p.hand.splice(p.hand.indexOf(s), 1);
    s.down = false; s.clashIn = true;
    a.cards.push(s);
    this.record(p, [s], 'clash');
    this.gain(p, s1.fx.strike1);
    if (tgt) { tgt.c.off = true; tgt.c.offBy = `ถูก 1st Strike ของ ${p.name} ปิด`; tgt.b.notes.push(`${cardName(tgt.c)} ถูก 1st Strike ปิด`); }
    a.notes.push(`1st Strike ปิดตัวเอง ลง ${cardName(s)} · มานา +${s1.fx.strike1}${tgt ? ` · ปิด ${cardName(tgt.c)} ของ ${tgt.b.p.name}` : ''}`);
  }

  cleanup() {
    this.phase = 'end';
    for (const p of this.alive()) { this.dropPlay(p); this.ubwCheck(p); }
    // Unworthy: the first time Shinji's Command Spells run out, his book calls another Servant [FD]
    for (const p of this.alive()) if (p.m.key === 'shinji' && p.cs <= 0 && !p.bookUsed && this.unused.length) this.book(p);
    for (const f of FIELDS) this.evUsed.push(...this.evs[f]);
    this.sitUsed.push(this.sit);
    const n = this.players.length;
    for (let i = 1; i <= n; i++) { const q = this.players[(this.start + i) % n]; if (!q.out) { this.start = q.id; break; } }
    this.emit('update');
  }

  // Book of the False Attendant: one of the 2 unused Servants at random; deck, hand and NP/skill
  // slot are new, the true name hides again, VP and mana stay, +3 Command Spells [FD]
  book(p) {
    const sv = this.unused.splice(Math.floor(this.rng() * this.unused.length), 1)[0];
    const old = p.sv;
    p.bookUsed = true;
    this.dealServant(p, sv);
    p.revealed = false;
    p.cs += 3;
    this.log(`📖 ${p.name} ใช้ Book of the False Attendant: Command Spell หมด เปลี่ยนเป็น Servant ใหม่ ชื่อจริงซ่อน · Command Spell +3`, 'reveal');
    this.emit('book', { p, old });
  }

  // final standing: winner first, then whoever lasted longer, then VP
  standing() {
    const life = (p) => (p === this.winner ? 1000 : p.out ? p.outRound : 999);
    return [...this.players].sort((a, b) => life(b) - life(a) || b.vp - a.vp);
  }

  finish() {
    if (this.over && this.winner) return;
    this.over = true;
    const left = this.alive();
    if (this.special) {
      this.winner = this.special.p;
      this.how = this.special.how;
    } else if (left.length === 1) {
      this.winner = left[0];
      this.how = `คนสุดท้ายที่เหลือ (${this.winner.vp} VP)`;
    } else {
      const top = Math.max(...left.map((p) => p.vp));
      const best = left.filter((p) => p.vp === top);
      this.winner = best.length === 1 ? best[0] : null;
      this.how = this.winner ? `VP มากที่สุดเมื่อครบ ${MAX_ROUNDS} รอบ` : `เสมอกันจนครบ ${MAX_ROUNDS} รอบ`;
    }
    this.log(this.winner ? `🏆 ${this.winner.name} ชนะสงครามจอกศักดิ์สิทธิ์! (${this.winner.sv.name})` : `🏆 ${this.how}`, 'grail');
    this.emit('over');
  }
}
