// Rules from design v4.0 (Fate/Domination, 24 Oct 2026): 11 rounds (8 regular + 3 climax),
// cuts to 4 / 3 / 2 players after rounds 8–10, most VP after round 11 wins.
// Numbers not in the sources are placeholders (data.js). No DOM code, so it runs headless (v4/sim.mjs).
import {
  AREAS, PATH, STEP_COST, WORKSHOP, TERRAIN, RECON_VP, HAND, SKILL_MANA, ROUNDS, REGULAR, CUT,
  CS_MANA, CS_POWER, CS_VP, MASTERS, SERVANTS, KANSHOU, SNAKE, EVENTS, CLIMAX, OBJECTS, GAND, GEM_GAND, GEM_SWAP,
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
    this.winners = [];
    this.results = [];
    const svs = this.shuffle([...SERVANTS]);
    let h = MASTERS.findIndex((m) => m.key === humanMaster);
    if (h < 0) h = Math.floor(rng() * MASTERS.length);
    this.players = MASTERS.map((m, id) => {
      const sv = svs[id];
      const deck = sv.deck.map((s) => inst(s));
      if (m.key === 'kuzuki') deck.push(...SNAKE.map((s) => inst(s)));
      const skills = sv.skills.map((s) => inst(s, { skill: true, gone: false, resident: false }));
      if (m.key === 'shirou') skills.push(inst(KANSHOU, { skill: true, gone: false, resident: false }));
      return {
        id, m, name: m.short, isHuman: id === h, sv, deck: this.shuffle(deck), hand: [], trash: [], skills,
        mana: m.mana, cs: m.cs, vp: 0, gems: m.gems || 0, gand: m.key === 'rin' ? inst(GAND) : null, roundUse: {}, revealed: false, out: false, outRound: 0,
        at: null, slot: null, terrain: 0, play: null, avalonUsed: false, uses: {}, swords: new Set(), godLost: 0, vpStart: 0,
      };
    });
    this.human = this.players[h];
    this.start = Math.floor(rng() * this.players.length);
    // 10 regular events, 2 removed unseen, 8 used; then the 3 climax events in order [NW]
    this.events = [...this.shuffle([...EVENTS]).slice(0, REGULAR), ...CLIMAX];
    this.event = null;
    this.objDeck = this.shuffle(OBJECTS.map((o) => ({ ...o })));
    this.objUsed = [];
    this.objs = { miyama: [], shinto: [] };
    this.shintoOpen = false;
    this.engaged = new Set();
    this.turn = null;
  }

  shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(this.rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  emit(type, data = {}) { this.onEvent({ type, ...data }); }
  log(text, cls = '') { const e = { text, cls, round: this.round }; this.logs.push(e); this.emit('log', { entry: e }); }
  alive() { return this.players.filter((p) => !p.out); }
  order() { const n = this.players.length; const out = []; for (let i = 0; i < n; i++) { const p = this.players[(this.start + i) % n]; if (!p.out) out.push(p); } return out; }
  here(area) { return this.alive().filter((p) => p.at === area); }
  climax() { return this.round > REGULAR; }
  efx(key) { return this.event?.fx?.[key] || 0; }
  ofx(f, key) { return (this.objs[f] || []).reduce((s, o) => s + (typeof o.fx[key] === 'number' ? o.fx[key] : o.fx[key] ? 1 : 0), 0); }
  fieldVP(f) { return (this.objs[f] || []).reduce((s, o) => s + o.vp, 0) + AREAS[f].bonus + this.efx('bonusUp'); }
  rank(p) { return 1 + this.alive().filter((q) => q.vp > p.vp).length; }
  // Sakura's Contaminated Grail: climax and not first → mana without limit, 3 cards [NW]
  infinite(p) { return this.climax() && p.m.key === 'sakura' && this.alive().some((q) => q !== p && q.vp >= p.vp); }
  maxCards(p) { return this.infinite(p) ? 3 : 2; }

  drawTo(p, n) {
    while (p.hand.length < n) {
      if (!p.deck.length) { if (!p.trash.length) break; p.deck = this.shuffle(p.trash); p.trash = []; }
      p.hand.push(p.deck.pop());
    }
  }

  // ---------- movement (paper section 5) ----------
  stepCost(p, i) { return i === 0 && p.m.key === 'kuzuki' ? 0 : STEP_COST[i]; }
  walkCost(p, from, to) { let c = 0; for (let i = PATH.indexOf(from); i < PATH.indexOf(to); i++) c += this.stepCost(p, i); return c; }
  reconFree(p) { return !this.alive().some((q) => q !== p && q.at === 'recon'); }
  moveOptions(p, mana = p.mana, cs = p.cs) {
    const opts = [{ to: p.at, how: 'stay', cost: 0 }];
    const i = PATH.indexOf(p.at);
    if (!this.engaged.has(p.at)) {
      for (const to of PATH.slice(i + 1)) {
        if (to === 'recon' && !this.reconFree(p)) continue;
        const cost = this.walkCost(p, p.at, to);
        if (cost <= mana) opts.push({ to, how: 'walk', cost });
      }
    }
    if (p.m.key === 'kirei' && !p.revealed && p.at !== 'recon' && this.reconFree(p) && mana >= 2 && !opts.some((o) => o.to === 'recon' && o.cost <= 2)) opts.push({ to: 'recon', how: 'kirei', cost: 2 });
    // Command Spell move: only from Miyama or Shinto [NW]; not into the workshop [v3]
    if (cs > 0 && AREAS[p.at]?.field) for (const to of PATH.slice(1)) if (to !== p.at && (to !== 'recon' || this.reconFree(p))) opts.push({ to, how: 'cs', cost: 0 });
    return opts;
  }

  enter(p, to, how) {
    if (p.at !== to) { p.terrain = 0; p.slot = null; } // advantage is lost when moving to another battlefield [NW]
    p.at = to;
    if (how === 'cs') this.log(`${p.name} ใช้ Command Spell ย้ายไป${AREAS[to].name}`, 'cs');
  }

  // ---------- cards (paper section 7) ----------
  skillCost(p, c) {
    let m = c.mana;
    if (c.fx?.manaAfter && p.uses[c.fx.manaAfter[0]]) m = c.fx.manaAfter[1];
    if (c.fx?.costUp) m += c.fx.costUp * (p.uses[c.name] || 0);
    if (c.fx?.roundDiscount) m = Math.max(0, m - c.fx.roundDiscount * this.round);
    return m;
  }
  costOf(p, c) { return c.skill ? this.skillCost(p, c) : c.mana; }
  skillState(p, c, mana = p.mana) {
    if (c.gone) return 'ใช้หมดแล้ว';
    if (c.resident) return 'วางค้างอยู่';
    if (c.fx?.constant) return 'ติดตัวถาวร';
    if ((c.type === 'N' || c.fx?.npBan) && this.efx('noNP')) return 'อีเวนต์ห้ามใช้ NP';
    if (c.fx?.maxRound && this.round > c.fx.maxRound) return `ใช้ได้แค่รอบ 1–${c.fx.maxRound}`;
    if (!this.infinite(p) && mana < SKILL_MANA) return `ต้องมีมานา ${SKILL_MANA}`;
    return '';
  }
  usableSkills(p, mana = p.mana) { return p.skills.filter((c) => !this.skillState(p, c, mana)); }
  tsubame(p, c) { return c.fx?.tsubame && p.uses['ดาบที่หนึ่ง'] && p.uses['ดาบที่สอง']; }

  // ctx: { f, cards (face-up cards of this play), zero, cancelled, revealing }
  cardPower(p, c, ctx = {}) {
    if (c.down) return 0;
    const f = ctx.f ?? p.at;
    let pw = c.power;
    const live = !(c.skill && ctx.cancelled);
    if (live && c.fx?.climaxPower && this.climax()) pw = c.fx.climaxPower;
    else if (live && c.fx?.revealPower && ctx.revealing) pw = c.fx.revealPower;
    if (live && c.fx?.godHand) pw += 3 * p.godLost;
    if (live && this.tsubame(p, c)) pw += c.fx.tsubame;
    if (live && c.fx?.agiExtra && (ctx.cards || []).filter((x) => x !== c && !x.down && x.type === 'A').length >= 2) pw += c.fx.agiExtra;
    if (c.type === 'X' && f && this.ofx(f, 'noSpecial')) return 0;
    if (ctx.zero && c.type === ctx.zero) return 0;
    const lowUp = f ? this.ofx(f, 'lowUp') : 0;
    if (lowUp && c.power <= 2) pw += lowUp;
    for (const x of [this.event?.fx, ...(f ? this.objs[f] || [] : []).map((o) => o.fx)]) if (x?.up && x.up === c.type) pw += x.n;
    return pw;
  }

  terrainOf(p, cards, ctx = {}) {
    const f = ctx.f ?? p.at;
    if (!p.terrain || ctx.noTerrain || (f && this.ofx(f, 'noTerrain'))) return 0;
    let t = p.terrain + (f ? this.ofx(f, 'terrainUp') : 0);
    if (!ctx.cancelled) for (const c of cards) if (!c.down && c.fx?.terrainMul) t *= c.fx.terrainMul;
    return t;
  }

  powerOf(p, play, ctx = {}) {
    const f = ctx.f ?? p.at;
    const cards = play.cards;
    const up = cards.filter((c) => !c.down);
    const cx = { ...ctx, f, cards, revealing: ctx.revealing ?? play.revealing };
    const parts = [['การ์ด', cards.reduce((s, c) => s + this.cardPower(p, c, cx), 0)]];
    const t = this.terrainOf(p, cards, cx);
    if (t) parts.push(['ได้เปรียบพื้นที่', t]);
    const unify = this.efx('unify') + (f ? this.ofx(f, 'unify') : 0);
    if (unify && up.length >= 2 && up.every((c) => c.type === up[0].type)) parts.push(['การ์ดชนิดเดียวกัน', unify]);
    if (play.cs2) parts.push(['Command Spell', play.cs2 * CS_POWER]);
    if (p.m.key === 'kirei' && p.revealed) parts.push(['ผู้แทน', 2]);
    const res = p.skills.find((c) => c.resident);
    if (res && f && AREAS[f].field) parts.push([res.name, res.power]);
    const hidden = f ? this.ofx(f, 'hiddenUp') : 0;
    if (hidden && !p.revealed) parts.push(['ชื่อจริงยังซ่อน', hidden]);
    if (ctx.underdog) parts.push(['VP น้อยสุด', ctx.underdog]);
    if (ctx.rb) parts.push(['Rule Breaker', ctx.rb]);
    return { total: parts.reduce((s, [, n]) => s + n, 0), parts };
  }

  // check and fix an answer for the card step
  cleanCards(p, ans, field) {
    ans = ans || {};
    if (!field) {
      const ids = (ans.ids || []).filter((id) => p.hand.some((c) => c.uid === id)).slice(0, 2);
      for (const c of p.hand) if (ids.length < Math.min(2, p.hand.length) && !ids.includes(c.uid)) ids.push(c.uid);
      return { ids, down: ids, cs2: 0, gemMana: 0, gand: false, cs4: false, cost: 0 };
    }
    let mana = p.mana;
    const cs4 = !!ans.cs4 && p.cs > 0;
    if (cs4) mana += CS_MANA;
    // Gand: Rin's card from outside the deck, paid with a jewel, once a round [NW]
    const gandOk = !!p.gand && !p.roundUse.gand && p.gems >= GEM_GAND;
    const wantGand = gandOk && (ans.ids || []).includes(p.gand.uid);
    const gemMana = p.m.key === 'rin' ? Math.max(0, Math.min(p.gems - (wantGand ? GEM_GAND : 0), Math.floor(ans.gemMana || 0))) : 0;
    const inf = this.infinite(p);
    const skills = this.usableSkills(p, mana); // the 8-mana rule looks at mana before paying (gems are paid, not held)
    const ubw = (ans.ids || []).some((id) => skills.some((c) => c.uid === id && c.fx.ubw));
    const pool = [...p.hand, ...skills, ...(gandOk ? [p.gand] : []), ...(ubw ? p.deck : [])];
    let picked = [...new Set(ans.ids || [])].map((id) => pool.find((c) => c.uid === id)).filter(Boolean);
    const riding = picked.find((c) => c.fx?.riding);
    const ubwCard = picked.find((c) => c.fx?.ubw);
    const limit = ubwCard ? 1 + ubwCard.fx.ubw : this.maxCards(p);
    const core = []; const extra = [];
    for (const c of picked) {
      if (core.length < limit) core.push(c);
      else if (riding && extra.length < riding.fx.extra && !c.skill && c.power <= riding.fx.riding) extra.push(c);
    }
    picked = [...core, ...extra];
    const down = new Set((ans.down || []).filter((id) => picked.some((c) => c.uid === id && !c.skill && !c.fx?.gand)));
    const budget = mana + gemMana;
    const costOf = (c) => (down.has(c.uid) ? 0 : this.costOf(p, c));
    let cost = picked.reduce((s, c) => s + costOf(c), 0);
    // too expensive: turn the dearest attack cards face down, then drop skill cards
    while (!inf && cost > budget) {
      const dear = picked.filter((c) => !c.skill && !down.has(c.uid) && costOf(c) > 0).sort((a, b) => b.mana - a.mana)[0];
      if (dear) down.add(dear.uid);
      else { const s = [...picked].reverse().find((c) => c.skill); if (!s) break; picked = picked.filter((c) => c !== s); }
      cost = picked.reduce((s, c) => s + costOf(c), 0);
    }
    // two cards when possible
    for (const c of p.hand) if (picked.length < 2 && !picked.includes(c)) { picked.push(c); down.add(c.uid); }
    // on a battlefield at least one card face up [NW]: turn up the cheapest card it can pay for
    if (picked.length && picked.every((c) => down.has(c.uid))) {
      const ok = picked.filter((c) => inf || c.mana <= budget - cost).sort((a, b) => a.mana - b.mana || b.power - a.power)[0];
      if (ok) { down.delete(ok.uid); cost += inf ? 0 : ok.mana; }
    }
    const csLeft = p.cs - (cs4 ? 1 : 0);
    const cs2 = Math.max(0, Math.min(csLeft, Math.floor(ans.cs2 || 0)));
    const mover = picked.find((c) => !down.has(c.uid) && (c.fx?.bell || c.fx?.move));
    const moveOk = (k) => PATH.slice(1).includes(k) && k !== p.at && (k !== 'recon' || this.reconFree(p));
    const moveTo = mover && moveOk(ans.moveTo) ? ans.moveTo : null;
    const paid = inf ? 0 : cost;
    const gemPay = Math.min(gemMana, Math.max(0, paid - mana));
    const gand = !!p.gand && picked.includes(p.gand);
    return { ids: picked.map((c) => c.uid), down: [...down], cs2, gemMana: gemPay, gand, cs4, cost: paid - gemPay, moveTo, ubw: !!ubwCard };
  }

  applyCards(p, a, field) {
    if (!field) {
      for (const id of a.ids) { const i = p.hand.findIndex((c) => c.uid === id); if (i >= 0) p.trash.push(...p.hand.splice(i, 1)); }
      p.play = null;
      return;
    }
    if (a.cs4) { p.cs--; p.mana += CS_MANA; this.log(`${p.name} ใช้ Command Spell ได้มานา +${CS_MANA}`, 'cs'); }
    if (a.ubw) { p.hand.push(...p.deck); p.deck = []; }
    p.mana -= a.cost;
    p.gems -= a.gemMana + (a.gand ? GEM_GAND : 0);
    if (a.gand) p.roundUse.gand = true;
    p.cs -= a.cs2;
    const cards = [];
    const down = new Set(a.down);
    for (const id of a.ids) {
      if (p.gand && id === p.gand.uid) { cards.push({ ...p.gand, down: false }); continue; }
      let c = p.skills.find((x) => x.uid === id);
      if (c) {
        cards.push({ ...c, down: false, paid: this.skillCost(p, c) });
        p.uses[c.name] = (p.uses[c.name] || 0) + 1;
        if (c.fx.once) c.gone = true;
        if (c.fx.residual) c.resident = true;
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
    for (const c of cards) {
      if (c.down) continue;
      if (c.fx?.mana) p.mana += c.fx.mana;
      if ((c.fx?.reveal || this.tsubame(p, c)) && !p.revealed) { p.revealed = true; revealing = true; this.log(`✸ ${p.name} ใช้ ${c.name} เปิดชื่อจริง: ${p.sv.name} (${p.sv.cls})`, 'reveal'); }
      if (c.fx?.playVP) { p.vp += c.fx.playVP; this.log(`${p.name} ใช้ ${c.name} ได้ ${c.fx.playVP} VP`, p.isHuman ? 'good' : ''); }
    }
    // Saber Class: an NP card played → 1 VP, 2 on the reveal round [NW]
    if (p.skills.some((c) => c.fx.saberVP) && cards.some((c) => !c.down && c.type === 'N')) { const n = revealing ? 2 : 1; p.vp += n; this.log(`${p.name} ได้ ${n} VP จาก Saber Class`, p.isHuman ? 'good' : ''); }
    p.play = { cards, cs2: a.cs2, revealing };
    const mover = cards.find((c) => !c.down && (c.fx?.bell || c.fx?.move));
    if (mover && a.moveTo) {
      const was = p.at;
      this.enter(p, a.moveTo, 'card');
      if (mover.fx.bell && AREAS[a.moveTo].field) for (const q of this.here(a.moveTo)) if (q !== p) { p.terrain += q.terrain; q.terrain = 0; }
      this.log(`${p.name} ใช้ ${mover.name} ย้ายจาก${AREAS[was].name}ไป${AREAS[a.moveTo].name}`, 'reveal');
      if (!AREAS[a.moveTo].field) { this.dropPlay(p); return; }
    }
    p.play.pre = this.powerOf(p, p.play).total;
  }

  // attack cards of a play go to the discard pile (skill cards and Gand do not)
  dropPlay(p) {
    if (p.play) for (const c of p.play.cards) if (!c.skill && !c.fx?.gand) { delete c.down; p.trash.push(c); }
    p.play = null;
  }

  // ---------- ability windows (paper section 7, v4.1) ----------
  // Command Spells work in any window [NW, timing inferred]; Rin's card swap once a round [NW]
  abilityOpts(p) {
    const o = [];
    const field = AREAS[p.at]?.field;
    if (p.cs > 0) {
      o.push({ kind: 'csMana' });
      if (field && p.play) o.push({ kind: 'csPower' });
      if (field) for (const to of PATH.slice(1)) if (to !== p.at && (to !== 'recon' || this.reconFree(p))) o.push({ kind: 'csMove', to });
    }
    if (p.m.key === 'rin' && p.gems >= GEM_SWAP && !p.roundUse.swap && p.hand.length) o.push({ kind: 'gemSwap' });
    return o;
  }

  useAbility(p, a) {
    if (!a || !this.abilityOpts(p).some((o) => o.kind === a.kind && (o.to ?? null) === (a.to ?? null))) return false;
    if (a.kind === 'csMana') { p.cs--; p.mana += CS_MANA; this.log(`${p.name} ใช้ Command Spell ได้มานา +${CS_MANA}`, 'cs'); }
    else if (a.kind === 'csPower') {
      p.cs--; p.play.cs2 = (p.play.cs2 || 0) + 1; p.play.pre = this.powerOf(p, p.play).total;
      this.log(`${p.name} ใช้ Command Spell พลัง +${CS_POWER} ที่${AREAS[p.at].name} (พลังตอนนี้ ${p.play.pre})`, 'cs');
    } else if (a.kind === 'csMove') {
      p.cs--;
      this.enter(p, a.to, 'cs');
      if (p.play) { if (AREAS[a.to].field) p.play.pre = this.powerOf(p, p.play).total; else this.dropPlay(p); }
    } else if (a.kind === 'gemSwap') {
      const ids = new Set((a.ids || []).filter((id) => p.hand.some((c) => c.uid === id)));
      if (!ids.size) return false;
      const n = p.hand.length;
      p.trash.push(...p.hand.filter((c) => ids.has(c.uid)));
      p.hand = p.hand.filter((c) => !ids.has(c.uid));
      this.drawTo(p, n);
      p.gems -= GEM_SWAP; p.roundUse.swap = true;
      this.log(`${p.name} ใช้อัญมณีแลกการ์ด ${ids.size} ใบ`, p.isHuman ? 'me' : '');
    } else return false;
    this.emit('update');
    return true;
  }

  async abilityWindow(stage, list = this.order()) {
    for (const p of list) {
      for (let i = 0; i < 12 && !p.out; i++) {
        const opts = this.abilityOpts(p);
        if (!opts.length) break;
        const a = await this.decide(this, p, 'ability', { stage, opts });
        if (!a || a.kind === 'pass' || !this.useAbility(p, a)) break;
      }
    }
  }

  // ---------- the game ----------
  async run() {
    this.log(`สงครามจอกศักดิ์สิทธิ์เริ่มต้น · Master ${this.players.length} คน · ${ROUNDS} รอบ (ปกติ ${REGULAR} + ไคลแมกซ์ ${ROUNDS - REGULAR})`, 'sys');
    this.emit('update');
    for (let r = 1; r <= ROUNDS && !this.over; r++) {
      await this.playRound(this.events[r - 1]);
      if (CUT[r]) this.cut(CUT[r]);
    }
    this.finish();
  }

  // keep the top n by VP; ties on the line all stay [NW]; Avalon saves Shirou once
  cut(n) {
    const left = [...this.alive()].sort((a, b) => b.vp - a.vp);
    if (left.length <= n) return;
    const line = left[n - 1].vp;
    for (const p of left) {
      if (p.vp >= line) continue;
      if (p.m.key === 'shirou' && !p.avalonUsed) { p.avalonUsed = true; p.mana = 0; this.log(`${p.name} รอดการคัดออกด้วย Avalon (มานาหมด)`, 'reveal'); continue; }
      p.out = true;
      p.outRound = this.round;
      this.log(`✖ ${p.name} ตกรอบ (จบรอบ ${this.round} · ${p.vp} VP ไม่ติด ${n} อันดับแรก)`, 'death');
    }
    this.emit('update');
  }

  async playRound(event) {
    this.round++;
    this.event = event;
    this.log(`── รอบ ${this.round}/${ROUNDS}${this.climax() ? ' · ไคลแมกซ์' : ''} · ${event.name} ──`, 'phase');
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
      p.mana += this.event.mana;
      if (p.m.key === 'illya' && !this.climax()) p.mana += 1;
      if (p.m.key === 'rin' && this.round === 1 && p.cs > 0) { p.cs--; this.log(`${p.name} เสีย Command Spell 1 ดวง (Absolute Obedience Order)`, 'cs'); }
      p.at = null; p.slot = null; p.terrain = 0; p.play = null; p.vpStart = p.vp; p.roundUse = {};
    }
    if (this.event.mana) this.log(`อีเวนต์ ${this.event.name}: ทุกคนได้มานา +${this.event.mana}`, 'sys');
    this.objs = { miyama: [], shinto: [] };
    for (const f of FIELDS) { this.objs[f].push(this.drawObj()); if (this.efx('extraObj') && this.event.fx.extraObj === f) this.objs[f].push(this.drawObj()); }
    this.shintoOpen = false;
    this.emit('phase');
    await this.abilityWindow('prep');
  }

  drawObj() {
    if (!this.objDeck.length) { this.objDeck = this.shuffle(this.objUsed); this.objUsed = []; }
    return this.objDeck.pop();
  }

  async outpost() {
    this.phase = 'outpost';
    this.emit('phase');
    for (const p of this.order()) {
      await this.abilityWindow('outpost-before', [p]);
      const opts = ['miyama', 'shinto'];
      if (this.here('workshop').length < WORKSHOP.length) opts.unshift('workshop');
      const ans = await this.decide(this, p, 'place', { opts });
      const to = opts.includes(ans?.to) ? ans.to : opts[0];
      const k = this.here(to).length;
      p.at = to;
      p.slot = k; // which workshop or advantage space, for the board
      if (to === 'workshop') {
        const n = p.m.key === 'kuzuki' ? 0 : WORKSHOP[k];
        p.mana += n;
        let extra = '';
        const res = p.skills.find((c) => c.resident && c.fx.workshopVP);
        if (res) { p.vp += res.fx.workshopVP; p.mana += res.fx.workshopMana; extra = ` · ${res.name} ได้ ${res.fx.workshopVP} VP มานา +${res.fx.workshopMana}`; }
        this.log(`${p.name} วางที่โรงฝึกเวทช่อง ${k + 1} ได้มานา +${n}${extra}`, p.isHuman ? 'me' : '');
      } else {
        if (k < TERRAIN.length) p.terrain = TERRAIN[k];
        this.log(`${p.name} วางที่${AREAS[to].name}${p.terrain ? ` ได้เปรียบพื้นที่ +${p.terrain}` : ''}`, p.isHuman ? 'me' : '');
      }
      this.emit('update');
      await this.abilityWindow('outpost-after', [p]);
    }
  }

  async action() {
    this.phase = 'action';
    this.shintoOpen = true;
    this.engaged = new Set(FIELDS.filter((f) => this.here(f).length >= 2));
    this.emit('phase');
    for (const p of this.order()) {
      this.turn = p;
      this.emit('update');
      await this.abilityWindow('action-move', [p]);
      const mv = (await this.decide(this, p, 'move', { opts: this.moveOptions(p) })) || {};
      let cs4 = false;
      if (mv.cs4 && p.cs > 0) { p.cs--; p.mana += CS_MANA; cs4 = true; this.log(`${p.name} ใช้ Command Spell ได้มานา +${CS_MANA}`, 'cs'); }
      const o = this.moveOptions(p).find((x) => x.to === mv.to && x.how === mv.how);
      if (o && o.how !== 'stay') {
        p.mana -= o.cost;
        if (o.how === 'cs') p.cs--;
        this.enter(p, o.to, o.how);
        if (o.how === 'walk') this.log(`${p.name} ย้ายไป${AREAS[o.to].name}${o.cost ? ` (มานา ${o.cost})` : ''}`, p.isHuman ? 'me' : '');
        if (o.how === 'kirei') this.log(`${p.name} ใช้ผู้ควบคุมไปลาดตระเวน (มานา 2)`, '');
      }
      this.emit('update');
      await this.abilityWindow('action-cards', [p]);
      const field = AREAS[p.at].field;
      const ans = await this.decide(this, p, 'cards', { field, cs4used: cs4 });
      this.applyCards(p, this.cleanCards(p, ans, field), field);
      if (field && p.play) this.log(`${p.name} ลงการ์ดที่${AREAS[p.at].name} พลังที่ประกาศ ${p.play.pre}`, p.isHuman ? 'me' : '');
      this.emit('update');
      await this.abilityWindow('action-after', [p]);
    }
    this.turn = null;
  }

  async combat() {
    this.phase = 'combat';
    this.results = [];
    this.turn = null;
    this.emit('phase');
    await this.abilityWindow('combat'); // last chance before the winners are decided [NW]
    for (const f of FIELDS) {
      const people = this.order().filter((p) => p.at === f);
      if (!people.length) continue;
      if (people.length === 1) {
        const p = people[0];
        const n = this.objs[f].reduce((s, o) => s + o.vp, 0); // alone: object VP, no battle bonus [v3]
        p.vp += n;
        this.results.push({ f, alone: true, pool: n, winners: [p.id], ents: [{ id: p.id, gain: n, cards: p.play?.cards || [], won: true, notes: [] }] });
        this.log(`${AREAS[f].name}: ${p.name} อยู่คนเดียว ได้ ${n} VP`, p.isHuman ? 'good' : '');
        continue;
      }
      this.results.push(this.fight(f, people));
    }
    this.emit('combat', { results: this.results });
    await this.decide(this, this.human, 'combatEnd', { results: this.results });
  }

  fight(f, people) {
    const ents = people.map((p, i) => ({ p, i, cards: p.play?.cards || [], up: (p.play?.cards || []).filter((c) => !c.down), notes: [] }));
    // Second Sword: opponents here cannot use skill effects [NW]
    const cancelled = new Set();
    for (const a of ents) if (a.up.some((c) => c.fx?.cancel)) for (const b of ents) if (b !== a) cancelled.add(b);
    const act = (e, k) => e.up.some((c) => c.fx?.[k] && !(c.skill && cancelled.has(e)));
    const card = (e, k) => e.up.find((c) => c.fx?.[k] && !(c.skill && cancelled.has(e)));
    const pre = (e) => e.p.play?.pre ?? 0;
    const defeated = new Set();
    const rbBonus = new Map();
    for (const a of ents) {
      const foes = ents.filter((b) => b !== a);
      if (act(a, 'petrify')) for (const b of foes) if (!b.up.some((c) => c.type === 'X' && !this.ofx(f, 'noSpecial'))) { defeated.add(b); b.notes.push('ถูกสะกดด้วยดวงตาศิลา'); }
      if (act(a, 'defeatOne')) { const b = [...foes].sort((x, y) => pre(y) - pre(x))[0]; defeated.add(b); b.notes.push('โดน Gáe Bolg'); }
      if (act(a, 'ruleBreaker')) {
        const zero = foes.find((b) => b.p.cs === 0);
        if (zero) { defeated.add(zero); zero.notes.push('โดน Rule Breaker'); rbBonus.set(a, card(a, 'ruleBreaker').fx.ruleBreaker); }
        else { const b = [...foes].sort((x, y) => pre(y) - pre(x))[0]; b.p.cs--; b.notes.push('Rule Breaker เผา Command Spell 1 ดวง'); }
      }
    }
    for (const e of defeated) if (e.p.m.key === 'shinji' && e.p.cs > 0) { e.p.cs--; e.notes.push('ตัวตลก: เสีย Command Spell 1 ดวง'); }
    const lowVP = Math.min(...people.map((p) => p.vp));
    const under = this.ofx(f, 'underdog');
    for (const e of ents) {
      const zero = ents.some((o) => o !== e && act(o, 'zeroOpp')) ? 'S' : null;
      e.pw = this.powerOf(e.p, e.p.play || { cards: [] }, { f, zero, cancelled: cancelled.has(e), underdog: under && e.p.vp === lowVP ? under : 0, rb: rbBonus.get(e) || 0 });
    }
    const cand = ents.filter((e) => !defeated.has(e));
    let winners = [];
    if (cand.length) { const top = Math.max(...cand.map((e) => e.pw.total)); winners = cand.filter((e) => e.pw.total === top); }
    const pool = this.fieldVP(f);
    for (const e of ents) {
      const p = e.p;
      e.gain = 0;
      if (winners.includes(e)) {
        let n = Math.ceil(pool / winners.length) + (p.play?.cs2 || 0) * CS_VP;
        const w = card(e, 'win'); if (w) n += w.fx.win;
        const pf = card(e, 'perFoe'); if (pf) n += pf.fx.perFoe * (people.length - 1);
        p.vp += n;
        e.gain = n;
        const wm = this.ofx(f, 'winMana'); if (wm) { p.mana += wm; e.notes.push(`มานา +${wm}`); }
        const dr = card(e, 'drain');
        if (dr) for (const b of ents) if (!winners.includes(b) && b.p.vp > 0) { const k = Math.min(b.p.vp, dr.fx.drain); b.p.vp -= k; b.gain -= k; b.notes.push(`เสีย ${k} VP (Gáe Bolg)`); }
      } else {
        const lv = this.ofx(f, 'loserVP'); if (lv) { p.vp += lv; e.gain += lv; }
        const ac = card(e, 'loseVP'); if (ac) { const k = Math.min(p.vp, ac.fx.loseVP); p.vp -= k; e.gain -= k; e.notes.push(`${ac.name}: เสีย ${k} VP`); }
        // God Hand: losing while Heracles still has one costs one of them and steals VP [NW]
        const gh = card(e, 'godHand') || (!cancelled.has(e) && p.skills.find((c) => c.fx.godHand && !c.gone));
        if (gh && winners.length) {
          const sk = p.skills.find((c) => c.uid === gh.uid); if (sk) sk.gone = true;
          p.godLost++;
          const w = winners[0];
          const k = Math.min(w.p.vp, gh.fx.godHand);
          w.p.vp -= k; w.gain -= k; p.vp += k; e.gain += k;
          e.notes.push(`เสีย ${gh.name} · ขโมย ${k} VP จาก${w.p.name}`);
        }
        if (act(e, 'returnRB')) { const rb = p.skills.find((c) => c.fx.ruleBreaker); if (rb?.gone) { rb.gone = false; e.notes.push('Rule Breaker กลับมาใช้ได้'); } }
      }
      if (defeated.has(e)) e.notes.unshift('[แพ้]');
      if (cancelled.has(e)) e.notes.push('ผลสกิลถูกดาบที่สองยกเลิก');
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
    for (const p of this.order()) {
      if (p.at === 'recon') { p.vp += RECON_VP; this.log(`${p.name} ลาดตระเวน ได้ ${RECON_VP} VP`, p.isHuman ? 'good' : ''); }
      if (p.m.key === 'shinji' && p.at === 'miyama') p.mana += 1;
      if (p.m.key === 'kuzuki' && p.vp === p.vpStart) { p.vp += 1; this.log(`${p.name} ได้ 1 VP (หมาป่าเดียวดาย)`, ''); }
    }
    const left = this.alive();
    const sak = left.find((p) => p.m.key === 'sakura');
    if (sak && left.length > 1 && sak.mana >= 2 && left.every((q) => q === sak || q.vp > sak.vp)) { sak.mana -= 2; sak.vp += 2; this.log(`${sak.name} จ่ายมานา 2 ได้ 2 VP (เงาดำ)`, ''); }
    for (const p of left) {
      this.dropPlay(p);
    }
    for (const f of FIELDS) this.objUsed.push(...this.objs[f]);
    const n = this.players.length;
    for (let i = 1; i <= n; i++) { const q = this.players[(this.start + i) % n]; if (!q.out) { this.start = q.id; break; } }
    this.emit('update');
  }

  finish() {
    if (this.over) return;
    this.over = true;
    const left = this.alive();
    const top = Math.max(...left.map((p) => p.vp));
    this.winners = left.filter((p) => p.vp === top);
    this.winner = this.winners.length === 1 ? this.winners[0] : null;
    this.how = this.winner ? `VP มากที่สุดหลังรอบ ${ROUNDS} (${top} VP)` : `เสมอกัน ${top} VP: ${this.winners.map((p) => p.name).join(', ')} ชนะร่วม`;
    this.log(this.winner ? `🏆 ${this.winner.name} ชนะสงครามจอกศักดิ์สิทธิ์! (${this.winner.sv.name})` : `🏆 ${this.how}`, 'grail');
    this.emit('over');
  }
}
