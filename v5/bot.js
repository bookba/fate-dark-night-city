// Simple bots for the v5.2 demo: they estimate the power they can reach and pick the
// place, move and cards with the best expected VP, plus some noise.
import { AREAS, TERRAIN, WORKSHOP, RECON_VP, SKILL_MANA, MANA_MAX, CS_MANA, CS_POWER, PLAY, FIELDS, REGULAR } from './game.js';

const MANA_W = 0.4; // how much a bot values one mana kept for later
const winChance = (mine, theirs) => 1 / (1 + Math.exp(-(mine - theirs) / 2.5));
const late = (g) => g.climax() || g.round >= 7;
const roundsLeft = (g) => (g.climax() ? 1 : REGULAR - g.round + 1);

// VP a bot expects for winning a battlefield (the Shinto event stays hidden until the action
// phase, unless the bot looked at it with a card)
function fieldValue(g, f, p) {
  if (f === 'shinto' && !g.shintoOpen && p?.peek !== g.round) return 3 * g.evs[f].length + AREAS[f].bonus + g.sfx('bonusUp');
  return g.fieldVP(f);
}

// best power from two cards it could play at f with this much mana
function handPower(g, p, f, mana = p.mana) {
  const pool = [...p.hand, ...g.usableSkills(p, mana), ...g.usableSpecials(p, mana)];
  let best = 0;
  const pw = (c) => g.cardPower(p, c, { f });
  const m = (c) => g.costOf(p, c);
  for (let i = 0; i < pool.length; i++) {
    if (m(pool[i]) <= mana) best = Math.max(best, pw(pool[i]));
    for (let j = i + 1; j < pool.length; j++) if (m(pool[i]) + m(pool[j]) <= mana) best = Math.max(best, pw(pool[i]) + pw(pool[j]));
  }
  return best;
}

function foePower(g, q) {
  if (q.play) return q.play.pre;
  return 7 + q.terrain + (q.mana >= SKILL_MANA ? 4 : 0);
}

function place(g, p, opts) {
  const rows = opts.map((to) => {
    let v = g.rng() * 2;
    if (to === 'workshop') {
      const n = WORKSHOP[g.here('workshop').length];
      if (p.m.key === 'kuzuki') v += 0.3; // no mana there, only a cheaper walk out
      else {
        // mana matters most just below the 8-mana NP line, and is wasted above 12
        const need = Math.max(0, SKILL_MANA - p.mana);
        v += Math.min(n, MANA_MAX - p.mana) * (need > 0 && need <= n + 4 ? 1.3 : 0.6) + (need > 0 ? 0.6 : 0);
      }
      if (p.skills.some((c) => c.resident && c.fx?.workshop)) v += 2.5; // Caster Class
      if (p.m.key === 'kirei' && !p.revealed) v += 0.8; // can still slip off to recon for 2 mana
    } else {
      const there = g.here(to);
      const terr = there.length < TERRAIN.length ? TERRAIN[there.length] : 0;
      const mine = handPower(g, p, to) + terr;
      const foe = there.length ? Math.max(...there.map((q) => foePower(g, q))) : 6;
      v += fieldValue(g, to, p) * winChance(mine, foe) + terr * 0.3;
      if (to === 'miyama' && p.m.key === 'shinji') v += 0.5;
      if (p.mana < 2) v -= 1;
      if (g.climax()) v += 1;
    }
    return { to, v };
  });
  rows.sort((a, b) => b.v - a.v);
  return { to: rows[0].to };
}

function move(g, p, opts) {
  const rows = opts.map((o) => {
    let v = -o.cost * MANA_W + g.rng() * 0.5;
    const to = o.to;
    if (to === 'recon' && o.how !== 'stay') v += RECON_VP;
    else if (AREAS[to].field) {
      const there = g.here(to).filter((q) => q !== p);
      const left = p.mana - o.cost;
      const mine = handPower(g, p, to, left) + (to === p.at ? p.terrain : 0);
      const foe = there.length ? Math.max(...there.map((q) => foePower(g, q))) : 0;
      v += there.length ? fieldValue(g, to) * winChance(mine, foe) : fieldValue(g, to) * 0.85;
      if (to === 'miyama' && to !== p.at && p.m.key === 'shinji') v += 0.4;
    }
    if (o.how === 'cs') v -= late(g) ? 2.5 : 6;
    return { o, v };
  });
  rows.sort((a, b) => b.v - a.v);
  const o = rows[0].o;
  return { to: o.to, how: o.how };
}

// Gate of Babylon: the types that get a bonus at f (situation or event cards)
export function gateTypes(g, f) {
  const ups = [g.sit?.fx, ...(g.evs[f] || []).map((e) => e.fx)].map((x) => x?.up).filter(Boolean);
  return ['S', 'A', 'M'].filter((t) => ups.includes(t));
}

// card sets a bot considers: pairs (triples when it may play 3 or a card goes on top), each attack
// card face up or down; plus Unlimited Blade Works and Rider Class builds
function combos(g, p, mana, f) {
  const skills = g.usableSkills(p, mana);
  const hand = p.hand.filter((c) => !(c.fx?.luck && p.roundUse.defeated));
  const pool = [...hand, ...skills, ...g.usableSpecials(p, mana)];
  const max = g.maxCards(p);
  const out = [];
  const gate = gateTypes(g, f);
  const add = (set) => { set.gate = set.some((x) => x.c.fx?.gate) ? gate : []; out.push(set); };
  // UBW up: lay the strongest cards it can pay for, up to 4
  if (g.ubwOn(p)) {
    for (const k of [max, 2, 1]) {
      let left = mana;
      const pick = [];
      for (const c of [...pool].sort((x, y) => y.power - x.power)) if (pick.length < k && g.costOf(p, c) <= left) { pick.push({ c, down: false }); left -= g.costOf(p, c); }
      add(pick);
    }
    return out;
  }
  const flips = (set) => {
    const n = set.length;
    for (let m = 0; m < 1 << n; m++) {
      if (set.some((c, i) => m & (1 << i) && !g.canFlip(c))) continue; // NP/skill and K&B are never face down
      add(set.map((c, i) => ({ c, down: !!(m & (1 << i)) })));
    }
  };
  const onTop = (set) => set.some((c) => c.fx?.extra || c.fx?.strike3);
  for (let i = 0; i < pool.length; i++) {
    if (pool.length < PLAY) flips([pool[i]]);
    for (let j = i + 1; j < pool.length; j++) {
      flips([pool[i], pool[j]]);
      for (let k = j + 1; k < pool.length; k++) {
        const set = [pool[i], pool[j], pool[k]];
        if (max >= 3 || onTop(set)) flips(set);
      }
    }
  }
  const ubw = skills.find((c) => c.fx.ubw);
  if (ubw) {
    let left = mana - g.costOf(p, ubw);
    const pick = [{ c: ubw, down: false }];
    for (const c of [...p.hand, ...p.deck, ...p.trash].sort((x, y) => y.power - x.power)) if (pick.length <= ubw.fx.ubw && c.mana <= left) { pick.push({ c, down: false }); left -= c.mana; }
    add(pick);
  }
  const rid = skills.find((c) => c.fx.riding);
  if (rid) {
    let left = mana - g.costOf(p, rid);
    const pick = [{ c: rid, down: false }];
    for (const c of [...hand].sort((x, y) => y.power - x.power)) if (pick.length < PLAY + rid.fx.riding && (pick.length < PLAY || c.power <= 3) && c.mana <= left) { pick.push({ c, down: false }); left -= c.mana; }
    add(pick);
  }
  return out;
}

// off a battlefield (paper 8.3, v5.1): a move card can jump into a fight worth taking (or to a
// free recon); otherwise lay what pays off anywhere face up and the weakest cards face down
function offField(g, p) {
  const pool = [...p.hand, ...g.usableSkills(p), ...g.usableSpecials(p)];
  const blocked = g.blocked(p, p.at);
  let best = null;
  for (const m of blocked ? [] : pool.filter((c) => (c.fx?.bell || c.fx?.move) && g.costOf(p, c) <= p.mana)) {
    const left = p.mana - g.costOf(p, m);
    const cost = g.costOf(p, m) * MANA_W + (m.fx.once && !late(g) ? 3 : 0) + (m.fx.reveal && !p.revealed ? 1 : 0);
    for (const to of g.cardDests(p, m)) {
      if (!AREAS[to].field) { if (to === 'recon') { const v = RECON_VP - cost; if (!best || v > best.v) best = { v, ids: [m.uid], moveTo: to }; } continue; }
      const there = g.here(to).filter((q) => q !== p);
      const terr = m.fx.bell ? TERRAIN.reduce((s, t) => s + t, 0) : 0;
      let second = null;
      let pw2 = 0;
      for (const c of pool) if (c !== m && !c.fx?.bell && !c.fx?.move && g.costOf(p, c) <= left && g.cardPower(p, c, { f: to }) > pw2) { pw2 = g.cardPower(p, c, { f: to }); second = c; }
      const mine = g.cardPower(p, m, { f: to }) + pw2 + terr;
      const foe = there.length ? Math.max(...there.map((q) => foePower(g, q))) : 0;
      const v = (there.length ? fieldValue(g, to, p) * winChance(mine, foe) : g.eventVP(to) * 0.9) - cost - (second ? g.costOf(p, second) * MANA_W : 0);
      if (!best || v > best.v) best = { v, ids: [m.uid, ...(second ? [second.uid] : [])], moveTo: to };
    }
  }
  if (best && best.v > 1.2) return { ids: best.ids, down: [], moveTo: best.moveTo };
  let left = p.mana;
  const ids = [];
  const take = (c) => { if (c && ids.length < g.maxCards(p) && (g.infinite(p) || g.costOf(p, c) <= left)) { ids.push(c.uid); left -= g.infinite(p) ? 0 : g.costOf(p, c); } };
  const skills = g.usableSkills(p);
  if (!blocked) {
    take(skills.find((c) => c.fx.archer)); // Archer Class: 3 VP, no fight to lose here
    if (g.round <= 6) take(skills.find((c) => c.fx.workshop)); // Caster Class pays more the sooner it is down
    if (g.round <= 5) take(skills.find((c) => c.fx.npTop)); // Saber Class stays for good
    if (p.revealed) take(skills.find((c) => c.fx.hide && p.skills.some((z) => z.fx.hiddenOnly && !z.gone)));
    for (const c of p.hand.filter((x) => x.fx?.mana)) take(c);
  }
  const low = [...p.hand].filter((c) => !ids.includes(c.uid)).sort((a, b) => a.power - b.power);
  const down = [];
  if (!g.ubwOn(p)) for (const c of low) if (ids.length < PLAY) { ids.push(c.uid); down.push(c.uid); }
  return { ids, down };
}

function cards(g, p, ctx) {
  if (!AREAS[p.at].field) return offField(g, p);
  const f = p.at;
  const blocked = g.blocked(p, f);
  // Rin: swap a weak hand with a gem before choosing (ctx.noSwap / ctx.noCs: a suggestion for the player)
  if (!ctx.noSwap && g.canSwap(p) && p.gems >= 4 && !p.roundUse.swaps) {
    const weak = p.hand.filter((c) => c.power <= 2).slice(0, 3);
    if (weak.length >= 2) return { swap: weak.map((c) => c.uid) };
  }
  const there = g.here(f).filter((q) => q !== p);
  const known = there.filter((q) => q.play);
  const unknown = there.filter((q) => !q.play);
  const foe = Math.max(0, ...there.map((q) => foePower(g, q)));
  const alone = !there.length;
  const prize = fieldValue(g, f, p);
  const inf = g.infinite(p);
  const rin = p.m.key === 'rin' && !blocked;
  const lim = g.gemLimit();
  const tries = [{ cs4: false, gem: 0 }];
  if (!ctx.noCs && !blocked && p.cs > 0 && !alone && late(g) && p.mana < MANA_MAX) tries.push({ cs4: true, gem: 0 });
  if (rin && !alone) for (let k = 1; k <= Math.min(lim, p.gems); k++) if (p.mana < MANA_MAX) tries.push({ cs4: false, gem: k });
  const scored = [];
  for (const t of tries) {
    const mana = Math.min(MANA_MAX, p.mana + (t.cs4 ? CS_MANA : 0) + t.gem);
    for (const cb of combos(g, p, mana, f)) {
      const cardsUp = cb.filter((x) => !x.down);
      const cost = cardsUp.reduce((s, x) => s + g.costOf(p, x.c, cb.gate.length), 0);
      if (!inf && cost > mana) continue;
      const play = { cards: cb.map(({ c, down }) => ({ ...c, down, ...(c.fx?.gate && cb.gate.length ? { types: ['N', ...cb.gate] } : {}) })), cs2: 0, blocked };
      const pw = g.powerOf(p, play, { f }).total;
      let extra = 0; let vp = 0; let risk = 0; let mul = 1;
      for (const { c } of cardsUp) {
        const fx = c.fx || {};
        if (fx.once) vp -= late(g) ? 0 : 3; // keep one-use cards for the climax
        if (fx.pierce) vp -= 0.6;
        if (blocked) continue; // 2nd Strike: its effects do nothing here
        if (fx.petrify && there.length) extra += known.some((q) => q.play.cards.some((x) => !x.down && x.type === 'X')) ? 3 : 8;
        if (fx.duel && there.length === 1) extra += 14;
        if (fx.zab && there.length) { if (g.alive().length === 2) extra += 14; else mul = 2; }
        if (fx.enuma && there.length) extra += known.some((q) => g.activeSpecial(q)) ? 12 : 1;
        if (fx.presence && there.length >= 2) extra += 3;
        if (fx.ruleBreaker && there.length) { const q = g.rbAuto(there); extra += q.cs <= 1 ? 24 : 1; } // left at 0: [แพ้] and +10
        if (fx.zeroOpp) extra += 2;
        if (fx.block) extra += unknown.length * 2;
        if (fx.playVP) vp += fx.playVP;
        if (fx.hide) vp += p.revealed && p.skills.some((z) => z.fx.hiddenOnly && !z.gone) ? 3 : 0;
        if (fx.archer) { vp += fx.archer; risk += fx.archerLose; }
        if (fx.win) vp += fx.win * 0.6;
        if (fx.strike) vp += there.length;
        if (fx.godHand) vp += 1.5;
        if (fx.npTop) vp += roundsLeft(g) * 0.4;
        if (fx.workshop) vp += Math.min(roundsLeft(g), 5);
        if (fx.ubw) vp += 2;
        if (fx.excal && g.climax() && g.sit.size === 2) extra += 15;
        if (fx.strike1) { vp += 0.8; extra += 2; }
        if (fx.riderDraw) vp += 0.5;
        if (fx.luck && there.length) vp += 0.5;
      }
      const chance = alone ? 0.95 : winChance(pw + extra, foe + 0.5);
      const v = prize * chance * mul + vp - risk * (1 - chance) - (inf ? 0 : cost * MANA_W) - (t.cs4 ? (late(g) ? 2 : 5) : 0) - t.gem * (late(g) ? 0.5 : 1.2) + (alone ? -pw * 0.05 : 0);
      scored.push({ cb, pw: pw + extra, cost, v, cs4: t.cs4, gem: t.gem, mana });
    }
  }
  if (!scored.length) return { ids: p.hand.slice(0, 2).map((c) => c.uid), down: p.hand.slice(0, 2).map((c) => c.uid) };
  scored.sort((a, b) => b.v - a.v);
  const best = scored[0];
  const ans = { ids: best.cb.map((x) => x.c.uid), down: best.cb.filter((x) => x.down).map((x) => x.c.uid), cs4: best.cs4, cs2: 0, gemMana: best.gem, gate: best.cb.gate, gandr: 0 };
  const gap = foe - best.pw;
  // Rin: Gandr Shot on top in a close fight, more freely late or with gems to spare
  if (rin && !alone && p.gems - best.gem > 0 && (late(g) || p.gems > roundsLeft(g) + 2) && gap >= -1 && gap <= 2 * lim) ans.gandr = Math.min(lim, p.gems - best.gem, Math.max(1, gap + 1));
  // Command Spells after the cards: power for a close fight, or leave a hopeless one for recon
  if (!ctx.noCs && !blocked && !alone && late(g)) {
    const csLeft = p.cs - (best.cs4 ? 1 : 0);
    const need = Math.ceil((gap - ans.gandr + 1) / CS_POWER);
    if (gap - ans.gandr >= 0 && need <= Math.min(2, csLeft)) ans.cs2 = need;
    else if (gap >= 6 && csLeft > 0 && g.reconFree(p)) ans.csMove = 'recon';
  }
  return ans;
}

// a card window (paper 8.0): use a card when its effect is clearly worth it, else pass
function windowUse(g, p, ctx) {
  for (const uid of ctx.cards) {
    const c = [...p.hand, ...p.specials, ...p.skills].find((x) => x.uid === uid);
    const fx = g.useLine(p, c, ctx.w)?.fx || {};
    const m = g.costOf(p, c);
    if (fx.mana && fx.mana > m) return { use: uid };
    if (fx.vp && fx.vp > m * MANA_W * (late(g) ? 0.3 : 1)) return { use: uid };
    if (fx.peek && p.hand.length >= 3 && p.mana - m >= 4) return { use: uid };
    if (fx.freeMove) {
      // engaged in a fight it is likely to lose: pay to be able to walk out
      const foe = Math.max(0, ...g.here(p.at).filter((q) => q !== p).map((q) => foePower(g, q)));
      if (foe > handPower(g, p, p.at, p.mana - m) + p.terrain + 2 && p.mana - m >= 2) return { use: uid };
    }
  }
  return null;
}

// how good an area looks for a move card at this power; the player's pop-up marks the best as
// "แนะนำ" (paper 4.6 item 8)
export function destValue(g, p, to, power) {
  if (!to) return 0;
  if (!AREAS[to].field) return to === 'recon' && p.at !== 'recon' ? RECON_VP : 0;
  const there = g.here(to).filter((q) => q !== p);
  if (!there.length) return g.eventVP(to) * 0.9;
  return fieldValue(g, to, p) * winChance(power, Math.max(...there.map((q) => foePower(g, q))));
}

export function botDecide(g, p, kind, ctx) {
  if (kind === 'place') return place(g, p, ctx.opts);
  if (kind === 'move') return move(g, p, ctx.opts);
  if (kind === 'cards') return cards(g, p, ctx);
  if (kind === 'window') return windowUse(g, p, ctx);
  return null;
}
