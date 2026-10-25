// Rules from design v5.0 (the Dominate Grail War manual, 25 Oct 2026): 8 regular rounds, then
// climax rounds until one Master is left (7 players: 4 left after round 8, then 2, then 1).
// Numbers not in the manual are placeholders (data.js). No DOM code, so it runs headless (v5/sim.mjs).
import {
  AREAS, PATH, STEP_COST, WORKSHOP, TERRAIN, RECON_VP, HAND, PLAY, SKILL_MANA, MANA_MAX, REGULAR, MAX_ROUNDS,
  CS_MANA, CS_POWER, CS_VP, SAKURA_FROM, MASTERS, SERVANTS, KANSHOU, GAND, GEM_GAND, GEM_SWAP, SNAKE, TSUBAME,
  SITUATIONS, CLIMAX, EVENTS,
} from './data.js';

export * from './data.js';

let uid = 0;
const inst = (spec, extra = {}) => ({ ...spec, uid: ++uid, ...extra });
export const FIELDS = ['miyama', 'shinto'];

export class Game {
  constructor({ decide, rng = Math.random, onEvent = () => {}, humanMaster = 'shirou' }) {
    this.decide = decide;
    this.rng = rng;
    this.onEvent = onEvent;
    this.logs = [];
    this.round = 0;
    this.phase = null;
    this.over = false;
    this.winner = null;
    this.results = [];
    const svs = this.shuffle([...SERVANTS]);
    let h = MASTERS.findIndex((m) => m.key === humanMaster);
    if (h < 0) h = Math.floor(rng() * MASTERS.length);
    this.players = MASTERS.map((m, id) => {
      const sv = svs[id];
      const deck = sv.deck.map((s) => inst(s));
      if (m.key === 'kuzuki') deck.push(...SNAKE.map((s) => inst(s)));
      const specials = m.key === 'shirou' ? [inst(KANSHOU, { keep: true })] : m.key === 'rin' ? [inst(GAND, { keep: true })] : [];
      return {
        id, m, name: m.short, isHuman: id === h, sv, deck: this.shuffle(deck), hand: [], trash: [], specials,
        skills: sv.skills.map((s) => inst(s, { skill: true, gone: false, resident: false })),
        mana: m.mana, cs: m.cs, vp: 0, gems: m.gems || 0, roundUse: {}, revealed: false, out: false, outRound: 0,
        at: null, slot: null, terrain: 0, play: null, seq: 0, uses: {}, infRound: 0, avalonUsed: false,
      };
    });
    this.human = this.players[h];
    this.start = Math.floor(rng() * this.players.length);
    // 10 regular situation cards, 2 removed unseen, 8 used [p.6]; climax cards by players left [p.11]
    this.sits = this.shuffle([...SITUATIONS]).slice(0, REGULAR);
    this.sit = null;
    this.sitUsed = [];
    this.evDeck = this.shuffle(EVENTS.map((e) => ({ ...e })));
    this.evUsed = [];
    this.evs = { miyama: [], shinto: [] };
    this.shintoOpen = false;
    this.turn = null;
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
  // Sakura's Hidden Secret: unlimited mana for this climax round [p.14]
  infinite(p) { return p.infRound === this.round && this.round > 0; }
  maxCards(p) { return PLAY + (this.infinite(p) ? 1 : 0); }

  drawTo(p, n) {
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
  stepCost(p, i) { return i === 0 && p.m.key === 'kuzuki' ? 0 : STEP_COST[i]; } // Straightforward [p.15]
  walkCost(p, from, to) { let c = 0; for (let i = PATH.indexOf(from); i < PATH.indexOf(to); i++) c += this.stepCost(p, i); return c; }
  reconFree(p) { return !this.alive().some((q) => q !== p && q.at === 'recon'); }
  moveOptions(p, mana = p.mana, cs = p.cs) {
    const opts = [{ to: p.at, how: 'stay', cost: 0 }];
    const i = PATH.indexOf(p.at);
    if (!this.engagedAt(p.at)) {
      for (const to of PATH.slice(i + 1)) {
        if (to === 'recon' && !this.reconFree(p)) continue;
        const cost = this.walkCost(p, p.at, to);
        if (cost <= mana) opts.push({ to, how: 'walk', cost });
      }
    }
    // Supervisor: recon from any state, even engaged, for 2 mana [p.15][4G]
    if (p.m.key === 'kirei' && !p.revealed && p.at !== 'recon' && this.reconFree(p) && mana >= 2 && !opts.some((o) => o.to === 'recon' && o.cost <= 2)) opts.push({ to: 'recon', how: 'kirei', cost: 2 });
    // Command Spell move: from anywhere to anywhere but the workshop, engaged or not [p.10]
    if (cs > 0) for (const to of PATH.slice(1)) if (to !== p.at && (to !== 'recon' || this.reconFree(p))) opts.push({ to, how: 'cs', cost: 0 });
    return opts;
  }

  enter(p, to, how) {
    if (p.at === to) return;
    p.terrain = 0; p.slot = null; // advantage stays on the battlefield it was won on
    p.at = to;
    if (how === 'cs') this.log(`${p.name} ใช้ Command Spell ย้ายไป${AREAS[to].name}`, 'cs');
    if (to === 'recon') { p.vp += RECON_VP; this.log(`${p.name} เข้าลาดตระเวน ได้ ${RECON_VP} VP`, p.isHuman ? 'good' : ''); }
    if (to === 'miyama' && p.m.key === 'shinji') { this.gain(p, 1); this.log(`${p.name} เข้าย่านมิยามะ ได้มานา +1 (Absorbing Command)`, ''); }
  }

  // ---------- cards (paper section 8.3 ②, 9) ----------
  skillState(p, c, mana = p.mana) {
    if (c.gone) return 'ใช้แล้ว (ครั้งเดียวต่อเกม)';
    if (c.resident) return 'ค้างอยู่';
    if (c.type === 'N' && this.sfx('noNP')) return 'การ์ดสถานการณ์ห้ามใช้ NP';
    if (!this.infinite(p) && mana < SKILL_MANA) return `ต้องมีมานา ${SKILL_MANA}`;
    return '';
  }
  specialState(p, c, mana = p.mana) {
    if (c.fx?.gand) return p.gems >= GEM_GAND ? '' : 'อัญมณีหมด';
    if (c.fx?.needMana && !this.infinite(p) && mana < SKILL_MANA) return `ต้องมีมานา ${SKILL_MANA}`;
    return '';
  }
  usableSkills(p, mana = p.mana) { return p.skills.filter((c) => !this.skillState(p, c, mana)); }
  usableSpecials(p, mana = p.mana) { return p.specials.filter((c) => !this.specialState(p, c, mana)); }
  costOf(p, c) { return c.mana; }
  canFlip(c) { return !c.skill && !c.keep; } // attack cards (and Snake) may go face down [p.10]
  tsubame(cards) { const s = new Set(cards.filter((c) => !c.down && c.fx?.sword).map((c) => c.fx.sword)); return s.size === 3; }

  // ctx: { f, cards, zero (Set of types), cancelled }
  cardPower(p, c, ctx = {}) {
    if (c.down) return 0;
    const f = ctx.f ?? p.at;
    let pw = c.power;
    if (c.type === 'X' && f && this.efx(f, 'noSpecial')) pw = 0;
    if (ctx.zero?.has(c.type)) pw = 0; // "base power becomes 0", type bonuses still add [p.18]
    const lowUp = f ? this.efx(f, 'lowUp') : 0;
    if (lowUp && c.power <= 2) pw += lowUp;
    for (const x of [this.sit?.fx, ...(f ? this.evs[f] || [] : []).map((e) => e.fx)]) if (x?.up && x.up === c.type) pw += x.n;
    return pw;
  }

  terrainOf(p, cards, ctx = {}) {
    const f = ctx.f ?? p.at;
    if (!p.terrain || (f && this.efx(f, 'noTerrain'))) return 0;
    let t = p.terrain + (f ? this.efx(f, 'terrainUp') : 0);
    if (!ctx.cancelled) for (const c of cards) if (!c.down && c.fx?.terrainMul) t *= c.fx.terrainMul;
    return t;
  }

  powerOf(p, play, ctx = {}) {
    const f = ctx.f ?? p.at;
    const cards = play.cards;
    const up = cards.filter((c) => !c.down);
    const cx = { ...ctx, f, cards };
    const parts = [['การ์ด', cards.reduce((s, c) => s + this.cardPower(p, c, cx), 0)]];
    const t = this.terrainOf(p, cards, cx);
    if (t) parts.push(['ได้เปรียบพื้นที่', t]);
    if (!ctx.cancelled && this.tsubame(cards)) parts.push(['Tsubame Gaeshi', TSUBAME]);
    const unify = this.sfx('unify') + (f ? this.efx(f, 'unify') : 0);
    if (unify && up.length >= 2 && up.every((c) => c.type === up[0].type)) parts.push(['การ์ดชนิดเดียวกัน', unify]);
    if (play.cs2) parts.push(['Command Spell', play.cs2 * CS_POWER]);
    if (p.m.key === 'kirei' && p.revealed) parts.push(['Proxy', 2]);
    const hidden = f ? this.efx(f, 'hiddenUp') : 0;
    if (hidden && !p.revealed) parts.push(['ชื่อจริงยังซ่อน', hidden]);
    if (ctx.underdog) parts.push(['VP น้อยสุด', ctx.underdog]);
    if (ctx.rb) parts.push(['Rule Breaker', ctx.rb]);
    return { total: parts.reduce((s, [, n]) => s + n, 0), parts };
  }

  // check and fix an answer for the card step
  cleanCards(p, ans, field) {
    ans = ans || {};
    if (!field) {
      // off a battlefield the 2 cards are only discarded, face down [GZ]
      const ids = (ans.ids || []).filter((id) => p.hand.some((c) => c.uid === id)).slice(0, PLAY);
      for (const c of p.hand) if (ids.length < Math.min(PLAY, p.hand.length) && !ids.includes(c.uid)) ids.push(c.uid);
      return { ids, down: ids, cs2: 0, gemMana: 0, gand: false, cs4: false, cost: 0, moveTo: null, csMove: null };
    }
    const cs4 = !!ans.cs4 && p.cs > 0;
    const mana = cs4 ? Math.min(MANA_MAX, p.mana + CS_MANA) : p.mana;
    const inf = this.infinite(p);
    const skills = this.usableSkills(p, mana); // the 8-mana rule looks at mana before paying
    const specials = this.usableSpecials(p, mana);
    const ubw = (ans.ids || []).some((id) => skills.some((c) => c.uid === id && c.fx.ubw));
    const pool = [...p.hand, ...skills, ...specials, ...(ubw ? p.deck : [])];
    let picked = [...new Set(ans.ids || [])].map((id) => pool.find((c) => c.uid === id)).filter(Boolean);
    const riding = picked.find((c) => c.fx?.riding);
    const ubwCard = picked.find((c) => c.fx?.ubw);
    const limit = ubwCard ? 1 + ubwCard.fx.ubw : this.maxCards(p) + picked.reduce((s, c) => s + (c.fx?.extra || 0), 0);
    const core = []; const extra = [];
    for (const c of picked) {
      if (core.length < limit) core.push(c);
      else if (riding && !c.skill && !c.keep && c.power <= riding.fx.riding) extra.push(c); // Riding: any number [GZ]
    }
    picked = [...core, ...extra];
    const gandOn = picked.some((c) => c.fx?.gand);
    const gemMana = p.m.key === 'rin' ? Math.max(0, Math.min(p.gems - (gandOn ? GEM_GAND : 0), Math.floor(ans.gemMana || 0))) : 0;
    const down = new Set((ans.down || []).filter((id) => picked.some((c) => c.uid === id && this.canFlip(c))));
    const budget = mana + gemMana;
    const costOf = (c) => (down.has(c.uid) ? 0 : c.mana);
    let cost = picked.reduce((s, c) => s + costOf(c), 0);
    // too expensive: turn the dearest attack cards face down, then drop NP/skill and special cards
    while (!inf && cost > budget) {
      const dear = picked.filter((c) => this.canFlip(c) && !down.has(c.uid) && c.mana > 0).sort((a, b) => b.mana - a.mana)[0];
      if (dear) down.add(dear.uid);
      else { const s = [...picked].reverse().find((c) => !this.canFlip(c)); if (!s) break; picked = picked.filter((c) => c !== s); }
      cost = picked.reduce((s, c) => s + costOf(c), 0);
    }
    // two cards when the hand has them: the missing ones go face down [p.10]
    for (const c of p.hand) if (picked.length < PLAY && !picked.includes(c)) { picked.push(c); down.add(c.uid); }
    let csLeft = p.cs - (cs4 ? 1 : 0);
    const cs2 = Math.max(0, Math.min(csLeft, Math.floor(ans.cs2 || 0)));
    csLeft -= cs2;
    const mover = picked.find((c) => !down.has(c.uid) && (c.fx?.bell || c.fx?.move));
    const moveOk = (k) => PATH.slice(1).includes(k) && k !== p.at && (k !== 'recon' || this.reconFree(p));
    const moveTo = mover && moveOk(ans.moveTo) ? ans.moveTo : null;
    // Command Spell move after the cards: the cards go along [paper 10, ph]
    const csMove = !moveTo && csLeft > 0 && moveOk(ans.csMove) ? ans.csMove : null;
    const paid = inf ? 0 : cost;
    const gemPay = Math.min(gemMana, Math.max(0, paid - mana));
    return { ids: picked.map((c) => c.uid), down: [...down], cs2, gemMana: gemPay, gand: gandOn, cs4, cost: paid - gemPay, moveTo, csMove, ubw: !!ubwCard };
  }

  applyCards(p, a, field) {
    if (!field) {
      for (const id of a.ids) { const i = p.hand.findIndex((c) => c.uid === id); if (i >= 0) { const c = p.hand.splice(i, 1)[0]; c.down = true; p.trash.push(c); } }
      p.play = null;
      return;
    }
    if (a.cs4) { p.cs--; this.gain(p, CS_MANA); this.log(`${p.name} ใช้ Command Spell ได้มานา +${CS_MANA}`, 'cs'); }
    if (a.ubw) { p.hand.push(...p.deck); p.deck = []; }
    p.mana -= a.cost;
    p.gems -= a.gemMana + (a.gand ? GEM_GAND : 0);
    p.cs -= a.cs2;
    if (a.cs2) this.log(`${p.name} ใช้ Command Spell พลัง +${a.cs2 * CS_POWER} ที่${AREAS[p.at].name}`, 'cs');
    const cards = [];
    const down = new Set(a.down);
    for (const id of a.ids) {
      let c = p.specials.find((x) => x.uid === id);
      if (c) { cards.push({ ...c, down: false }); continue; }
      c = p.skills.find((x) => x.uid === id);
      if (c) {
        cards.push({ ...c, down: false });
        p.uses[c.name] = (p.uses[c.name] || 0) + 1;
        if (c.fx.once) c.gone = true;
        if (c.fx.residual) { c.resident = true; c.residentFrom = this.round + 1; } // 残留: works from next round [p.18]
        continue;
      }
      const i = p.hand.findIndex((x) => x.uid === id);
      if (i < 0) continue;
      c = p.hand.splice(i, 1)[0];
      c.down = down.has(c.uid);
      cards.push(c);
    }
    if (a.ubw) { p.deck = this.shuffle(p.hand); p.hand = []; } // cards not played go back into the deck
    let revealing = false;
    const reveal = (why) => { if (p.revealed) return; p.revealed = true; revealing = true; this.log(`✸ ${p.name} ใช้ ${why} เปิดชื่อจริง: ${p.sv.name} (${p.sv.cls})`, 'reveal'); };
    for (const c of cards) {
      if (c.down) continue;
      if (c.fx?.mana) this.gain(p, c.fx.mana);
      if (c.fx?.reveal) reveal(c.name);
      if (c.fx?.playVP) { p.vp += c.fx.playVP; this.log(`${p.name} ใช้ ${c.name} ได้ ${c.fx.playVP} VP`, p.isHuman ? 'good' : ''); }
    }
    if (this.tsubame(cards)) reveal('燕返し Tsubame Gaeshi');
    p.play = { cards, cs2: a.cs2, revealing };
    const mover = cards.find((c) => !c.down && (c.fx?.bell || c.fx?.move));
    const go = (to, how, label) => {
      const was = p.at;
      if (how === 'cs') p.cs--;
      this.enter(p, to, how);
      if (label) this.log(`${p.name} ใช้ ${label} ย้ายจาก${AREAS[was].name}ไป${AREAS[to].name}`, 'reveal');
      if (!AREAS[to].field) this.dropPlay(p);
    };
    if (mover && a.moveTo) {
      go(a.moveTo, 'card', mover.name);
      if (mover.fx.bell && AREAS[a.moveTo].field) for (const q of this.here(a.moveTo)) if (q !== p) { p.terrain += q.terrain; q.terrain = 0; }
    } else if (a.csMove) go(a.csMove, 'cs');
    if (p.play) p.play.pre = this.powerOf(p, p.play).total;
  }

  // played attack cards go to the discard pile the way they were played [p.11]; NP/skill and
  // the in-hand special cards go back
  dropPlay(p) {
    if (p.play) for (const c of p.play.cards) if (!c.skill && !c.keep) p.trash.push(c);
    p.play = null;
  }

  // Rin's Jewel Magecraft: swap cards in hand, once a round in her own action turn [p.14, ph]
  canSwap(p) { return p.m.key === 'rin' && p.gems >= GEM_SWAP && !p.roundUse.swap && p.hand.length > 0; }
  gemSwap(p, ids) {
    if (!this.canSwap(p)) return false;
    const set = new Set((ids || []).filter((id) => p.hand.some((c) => c.uid === id)));
    if (!set.size) return false;
    const n = p.hand.length;
    for (const c of p.hand) if (set.has(c.uid)) { c.down = true; p.trash.push(c); }
    p.hand = p.hand.filter((c) => !set.has(c.uid));
    this.drawTo(p, n);
    p.gems -= GEM_SWAP; p.roundUse.swap = true;
    this.log(`${p.name} ใช้อัญมณีแลกการ์ด ${set.size} ใบ`, p.isHuman ? 'me' : '');
    this.emit('update');
    return true;
  }

  // ---------- the game ----------
  async run() {
    this.log(`สงครามจอกศักดิ์สิทธิ์เริ่มต้น · Master ${this.players.length} คน · รอบปกติ ${REGULAR} รอบ แล้วไคลแมกซ์จนเหลือคนเดียว`, 'sys');
    this.emit('update');
    while (!this.over && this.alive().length > 1 && this.round < MAX_ROUNDS) {
      await this.playRound();
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
    // Shinji's Clown, 7 players: sole last place when the climax starts wins [p.15]
    const sh = left.find((p) => p.m.key === 'shinji');
    if (r === REGULAR && sh && this.players.length === 7 && left.every((q) => q === sh || q.vp > sh.vp)) {
      this.special = sh;
      this.log(`🃏 ${sh.name} อยู่อันดับสุดท้ายคนเดียวตอนเริ่มไคลแมกซ์ ชนะทันทีด้วยตัวตลก (Clown)`, 'grail');
      this.over = true;
      return;
    }
    const target = r === REGULAR ? (left.length >= 5 ? 4 : left.length - 1) : this.sit.size === 2 ? 1 : 2;
    if (left.length <= target) return;
    const line = left[target].vp;
    const keep = left.filter((p) => p.vp > line);
    if (!keep.length) { this.log(`ทุกคนเสมอกันที่เส้นตัด (${line} VP) ไม่มีใครตกรอบ เล่นไคลแมกซ์อีกรอบ`, 'sys'); return; }
    for (const p of left.filter((q) => q.vp <= line)) {
      if (r === REGULAR && p.m.key === 'shirou') { p.avalonUsed = true; this.log(`${p.name} ไม่ตกรอบเพราะ Avalon (${p.vp} VP)`, 'reveal'); continue; }
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
    this.cleanup();
  }

  async prep() {
    this.phase = 'prep';
    for (const p of this.alive()) {
      this.drawTo(p, HAND);
      this.gain(p, this.sit.mana);
      if (p.m.key === 'illya') this.gain(p, 1); // +1 every round [p.14]
      p.at = null; p.slot = null; p.terrain = 0; p.play = null; p.roundUse = {};
    }
    this.log(`การ์ดสถานการณ์ ${this.sit.name}: ทุกคนได้มานา +${this.sit.mana}${this.sit.text ? ` · ${this.sit.text}` : ''}`, 'sys');
    const sak = this.alive().find((p) => p.m.key === 'sakura');
    if (sak && this.round >= SAKURA_FROM && sak.mana >= 2) { sak.mana -= 2; sak.vp += 2; this.log(`${sak.name} เสียมานา 2 ได้ 2 VP (Engraved Fate)`, sak.isHuman ? 'good' : ''); }
    if (sak && this.climax() && this.rank(sak) >= 2) { sak.infRound = this.round; this.log(`${sak.name} Hidden Secret: รอบนี้มานาไม่จำกัด ลงการ์ดได้ ${this.maxCards(sak)} ใบ`, 'reveal'); }
    this.evs = { miyama: [this.drawEvent()], shinto: [this.drawEvent()] };
    const ex = this.sfx('extraEvent');
    if (ex) this.evs[this.sit.fx.extraEvent].push(this.drawEvent());
    this.shintoOpen = false;
    this.log(`อีเวนต์มิยามะ: ${this.evs.miyama.map((e) => `${e.name} ${e.vp} VP`).join(' + ')} · อีเวนต์ชินโตะคว่ำไว้`, 'sys');
    this.emit('phase');
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
        if (p.m.key === 'kuzuki') { p.vp += n; txt = `ได้ ${n} VP แทนมานา (Calm)`; } else { this.gain(p, n); txt = `ได้มานา +${n}`; }
        const res = p.skills.find((c) => c.resident && c.fx.workshopVP && c.residentFrom <= this.round);
        if (res) { p.vp += res.fx.workshopVP; this.gain(p, res.fx.workshopMana); txt += ` · ${res.name} ได้ ${res.fx.workshopVP} VP มานา +${res.fx.workshopMana}`; }
        this.log(`${p.name} วางที่โรงฝึกเวทช่อง ${k + 1} ${txt}`, p.isHuman ? 'me' : '');
      } else {
        if (k < TERRAIN.length) p.terrain = TERRAIN[k];
        this.log(`${p.name} วางที่${AREAS[to].name}${p.terrain ? ` ได้เปรียบพื้นที่ +${p.terrain}` : ''}`, p.isHuman ? 'me' : '');
        if (to === 'miyama' && p.m.key === 'shinji') { this.gain(p, 1); this.log(`${p.name} เข้าย่านมิยามะ ได้มานา +1 (Absorbing Command)`, ''); }
      }
      this.emit('update');
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
      this.emit('update');
      // ① move; a Command Spell may come before it (mana) or be the move itself [p.10]
      const mv = (await this.decide(this, p, 'move', { opts: this.moveOptions(p) })) || {};
      if (mv.cs4 && p.cs > 0) { p.cs--; this.gain(p, CS_MANA); this.log(`${p.name} ใช้ Command Spell ได้มานา +${CS_MANA}`, 'cs'); }
      const o = this.moveOptions(p).find((x) => x.to === mv.to && x.how === mv.how);
      if (o && o.how !== 'stay') {
        p.mana -= o.cost;
        if (o.how === 'cs') p.cs--;
        if (o.how === 'walk') this.log(`${p.name} ย้ายไป${AREAS[o.to].name}${o.cost ? ` (มานา ${o.cost})` : ''}`, p.isHuman ? 'me' : '');
        if (o.how === 'kirei') this.log(`${p.name} ใช้ Supervisor ไปลาดตระเวน (มานา 2)`, '');
        this.enter(p, o.to, o.how);
      }
      this.emit('update');
      // ② battle prep; Rin may swap cards first
      const field = AREAS[p.at].field;
      let ans = null;
      for (let k = 0; k < 3; k++) {
        ans = await this.decide(this, p, 'cards', { field });
        if (ans?.swap) { this.gemSwap(p, ans.swap); continue; }
        break;
      }
      this.applyCards(p, this.cleanCards(p, ans, field), field);
      if (p.play) this.log(`${p.name} ลงการ์ดที่${AREAS[p.at].name} พลังรวม ${p.play.pre}`, p.isHuman ? 'me' : '');
      else if (!field) this.log(`${p.name} ทิ้งการ์ด 2 ใบแบบคว่ำ`, p.isHuman ? 'me' : '');
      this.emit('update');
    }
    this.turn = null;
  }

  async combat() {
    this.phase = 'combat';
    this.results = [];
    this.turn = null;
    this.emit('phase');
    for (const f of FIELDS) {
      const people = this.order().filter((p) => p.at === f);
      if (!people.length) continue;
      if (people.length === 1) {
        const p = people[0];
        const n = this.eventVP(f); // alone: only the event VP [p.11]
        p.vp += n;
        this.results.push({ f, alone: true, pool: n, winners: [p.id], ents: [{ id: p.id, gain: n, cards: p.play?.cards || [], power: p.play?.pre ?? 0, parts: [], won: true, notes: [] }] });
        this.log(`${AREAS[f].name}: ${p.name} อยู่คนเดียว ได้ ${n} VP`, p.isHuman ? 'good' : '');
        continue;
      }
      this.results.push(this.fight(f, people));
    }
    this.emit('combat', { results: this.results });
    await this.decide(this, this.human, 'combatEnd', { results: this.results });
  }

  fight(f, people) {
    const ents = people.map((p) => ({ p, cards: p.play?.cards || [], up: (p.play?.cards || []).filter((c) => !c.down), notes: [] }));
    // Second Sword: card effects of opponents who played after Kojiro do not work [4G]
    const cancelled = new Set();
    for (const a of ents) if (a.up.some((c) => c.fx?.cancel)) for (const b of ents) if (b !== a && b.p.seq > a.p.seq) cancelled.add(b);
    const card = (e, k) => (cancelled.has(e) ? null : e.up.find((c) => c.fx?.[k]));
    const defeated = new Set();
    const rbBonus = new Map();
    // 対決時 effects one by one in seat order [p.11]
    for (const a of ents) {
      const foes = ents.filter((b) => b !== a);
      if (card(a, 'petrify')) for (const b of foes) if (!b.up.some((c) => c.type === 'X' && !this.efx(f, 'noSpecial'))) { defeated.add(b); b.notes.push('ถูกสะกดด้วยดวงตาศิลา'); }
      if (card(a, 'duel') && foes.length === 1) { defeated.add(foes[0]); foes[0].notes.push('โดน Gáe Bolg (แทง)'); }
      const rb = card(a, 'ruleBreaker');
      if (rb) {
        rbBonus.set(a, rb.fx.ruleBreaker);
        for (const b of foes) if (b.p.cs <= 1) { defeated.add(b); b.p.cs = 0; b.notes.push('โดน Rule Breaker: Command Spell เหลือ 0'); }
      }
    }
    const lowVP = Math.min(...people.map((p) => p.vp));
    const under = this.efx(f, 'underdog');
    for (const e of ents) {
      const zero = new Set(ents.filter((o) => o !== e).map((o) => card(o, 'zeroOpp')?.fx.zeroOpp).filter(Boolean));
      e.pw = this.powerOf(e.p, e.p.play || { cards: [] }, { f, zero, cancelled: cancelled.has(e), underdog: under && e.p.vp === lowVP ? under : 0, rb: rbBonus.get(e) || 0 });
    }
    const cand = ents.filter((e) => !defeated.has(e));
    let winners = [];
    if (cand.length) { const top = Math.max(...cand.map((e) => e.pw.total)); winners = cand.filter((e) => e.pw.total === top); }
    const pool = this.fieldVP(f);
    for (const e of ents) {
      e.gain = 0;
      if (!winners.includes(e)) continue;
      const p = e.p;
      let n = Math.ceil(pool / winners.length) + (p.play?.cs2 || 0) * CS_VP; // ties split, rounded up [p.11]
      const w = card(e, 'win'); if (w) n += w.fx.win;
      const pf = card(e, 'perFoe'); if (pf) n += pf.fx.perFoe * (people.length - 1);
      p.vp += n;
      e.gain = n;
      const wm = this.efx(f, 'winMana'); if (wm) { this.gain(p, wm); e.notes.push(`มานา +${wm}`); }
    }
    for (const e of ents) {
      if (winners.includes(e)) continue;
      const p = e.p;
      const lv = this.efx(f, 'loserVP'); if (lv) { p.vp += lv; e.gain += lv; }
      // God Hand: losing still gives VP and cuts what the winners get [p.17][4G]
      const gh = card(e, 'godHand');
      if (gh && winners.length) {
        p.vp += gh.fx.godHand; e.gain += gh.fx.godHand;
        for (const w of winners) { const k = Math.min(w.gain, gh.fx.godHand); w.p.vp -= k; w.gain -= k; w.notes.push(`God Hand ลด ${k} VP`); }
        e.notes.push(`${gh.name}: แพ้แต่ได้ ${gh.fx.godHand} VP`);
      }
    }
    for (const e of ents) {
      if (defeated.has(e)) e.notes.unshift('[แพ้]');
      if (cancelled.has(e)) e.notes.push('ผลการ์ดถูกดาบที่สองยกเลิก');
    }
    const r = {
      f, pool, winners: winners.map((e) => e.p.id),
      ents: ents.map((e) => ({ id: e.p.id, cards: e.cards, power: e.pw.total, parts: e.pw.parts, gain: e.gain, notes: e.notes, won: winners.includes(e), defeated: defeated.has(e) })),
    };
    this.log(`⚔ ${AREAS[f].name}: ${ents.map((e) => `${e.p.name} ${defeated.has(e) ? '[แพ้]' : e.pw.total}`).join(' · ')} → ${winners.length ? winners.map((e) => `${e.p.name} +${e.gain} VP`).join(', ') : 'ไม่มีผู้ชนะ'}`, 'fight');
    return r;
  }

  cleanup() {
    this.phase = 'end';
    for (const p of this.alive()) this.dropPlay(p);
    for (const f of FIELDS) this.evUsed.push(...this.evs[f]);
    this.sitUsed.push(this.sit);
    const n = this.players.length;
    for (let i = 1; i <= n; i++) { const q = this.players[(this.start + i) % n]; if (!q.out) { this.start = q.id; break; } }
    this.emit('update');
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
      this.winner = this.special;
      this.how = `ตัวตลก (Clown): ${this.special.name} อยู่อันดับสุดท้ายคนเดียวตอนเริ่มไคลแมกซ์`;
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
