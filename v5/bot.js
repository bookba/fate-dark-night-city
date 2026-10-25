// Simple bots for the v5.0 demo: they estimate the power they can reach and pick the
// place, move and cards with the best expected VP, plus some noise.
import { AREAS, TERRAIN, WORKSHOP, RECON_VP, SKILL_MANA, MANA_MAX, CS_MANA, CS_POWER, GEM_GAND, PLAY } from './game.js';

const MANA_W = 0.4; // how much a bot values one mana kept for later
const winChance = (mine, theirs) => 1 / (1 + Math.exp(-(mine - theirs) / 2.5));
const late = (g) => g.climax() || g.round >= 7;

// VP a bot expects for winning a battlefield (the Shinto event stays hidden until the action phase)
function fieldValue(g, f) {
  if (f === 'shinto' && !g.shintoOpen) return 3 * g.evs[f].length + AREAS[f].bonus + g.sfx('bonusUp');
  return g.fieldVP(f);
}

// best power from two cards it could play at f with this much mana
function handPower(g, p, f, mana = p.mana) {
  const pool = [...p.hand, ...g.usableSkills(p, mana), ...g.usableSpecials(p, mana)];
  let best = 0;
  const pw = (c) => g.cardPower(p, c, { f });
  for (let i = 0; i < pool.length; i++) {
    if (pool[i].mana <= mana) best = Math.max(best, pw(pool[i]));
    for (let j = i + 1; j < pool.length; j++) if (pool[i].mana + pool[j].mana <= mana) best = Math.max(best, pw(pool[i]) + pw(pool[j]));
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
      if (p.m.key === 'kuzuki') v += n * 1.2; // Calm: VP instead of mana
      else {
        // mana matters most just below the 8-mana NP line, and is wasted above 12
        const need = Math.max(0, SKILL_MANA - p.mana);
        v += Math.min(n, MANA_MAX - p.mana) * (need > 0 && need <= n + 4 ? 1.3 : 0.6) + (need > 0 ? 0.6 : 0);
      }
      if (p.skills.some((c) => c.resident && c.fx.workshopVP)) v += 2;
      if (p.m.key === 'kirei' && !p.revealed) v += 0.8; // can still slip off to recon for 2 mana
    } else {
      const there = g.here(to);
      const terr = there.length < TERRAIN.length ? TERRAIN[there.length] : 0;
      const mine = handPower(g, p, to) + terr;
      const foe = there.length ? Math.max(...there.map((q) => foePower(g, q))) : 6;
      v += fieldValue(g, to) * winChance(mine, foe) + terr * 0.3;
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

// card sets a bot considers: pairs (triples when it may play 3), each attack card face up or
// down; plus Unlimited Blade Works and Riding builds
function combos(g, p, mana) {
  const skills = g.usableSkills(p, mana);
  const pool = [...p.hand, ...skills, ...g.usableSpecials(p, mana)];
  const max = g.maxCards(p);
  const out = [];
  const flips = (set) => {
    const n = set.length;
    for (let m = 0; m < 1 << n; m++) {
      if (set.some((c, i) => m & (1 << i) && !g.canFlip(c))) continue; // NP/skill and K&B/Gand are never face down
      out.push(set.map((c, i) => ({ c, down: !!(m & (1 << i)) })));
    }
  };
  for (let i = 0; i < pool.length; i++) {
    if (pool.length < PLAY) flips([pool[i]]);
    for (let j = i + 1; j < pool.length; j++) {
      flips([pool[i], pool[j]]);
      for (let k = j + 1; k < pool.length; k++) {
        const set = [pool[i], pool[j], pool[k]];
        if (max >= 3 || set.some((c) => c.fx?.extra)) flips(set);
      }
    }
  }
  const ubw = skills.find((c) => c.fx.ubw);
  if (ubw) {
    let left = mana - ubw.mana;
    const pick = [{ c: ubw, down: false }];
    for (const c of [...p.hand, ...p.deck].sort((x, y) => y.power - x.power)) if (pick.length <= ubw.fx.ubw && c.mana <= left) { pick.push({ c, down: false }); left -= c.mana; }
    out.push(pick);
  }
  const rid = skills.find((c) => c.fx.riding);
  if (rid) {
    let left = mana - rid.mana;
    const pick = [{ c: rid, down: false }];
    for (const c of [...p.hand].sort((x, y) => y.power - x.power)) if (c.power <= rid.fx.riding && c.mana <= left) { pick.push({ c, down: false }); left -= c.mana; }
    out.push(pick);
  }
  return out;
}

function cards(g, p, ctx) {
  if (!ctx.field) {
    const low = [...p.hand].sort((a, b) => a.power - b.power).slice(0, 2);
    return { ids: low.map((c) => c.uid) };
  }
  // Rin: swap a weak hand with a jewel before choosing (ctx.noSwap / ctx.noCs: a suggestion for the player)
  if (!ctx.noSwap && g.canSwap(p) && p.gems >= 3) {
    const weak = p.hand.filter((c) => c.power <= 2);
    if (weak.length >= 2) return { swap: weak.map((c) => c.uid) };
  }
  const f = p.at;
  const there = g.here(f).filter((q) => q !== p);
  const known = there.filter((q) => q.play);
  const unknown = there.filter((q) => !q.play);
  const foe = Math.max(0, ...there.map((q) => foePower(g, q)));
  const alone = !there.length;
  const prize = fieldValue(g, f);
  const inf = g.infinite(p);
  const tries = [{ cs4: false, mana: p.mana }];
  if (!ctx.noCs && p.cs > 0 && !alone && late(g) && p.mana < MANA_MAX) tries.push({ cs4: true, mana: Math.min(MANA_MAX, p.mana + CS_MANA) });
  const scored = [];
  for (const t of tries) {
    for (const cb of combos(g, p, t.mana)) {
      const cardsUp = cb.filter((x) => !x.down);
      const cost = cardsUp.reduce((s, x) => s + x.c.mana, 0);
      const gemPay = p.m.key === 'rin' ? p.gems - (cb.some((x) => x.c.fx?.gand) ? GEM_GAND : 0) : 0;
      if (!inf && cost > t.mana + gemPay) continue;
      const play = { cards: cb.map(({ c, down }) => ({ ...c, down })), cs2: 0 };
      const pw = g.powerOf(p, play, { f }).total;
      let extra = 0; let vp = 0;
      for (const { c } of cardsUp) {
        const fx = c.fx || {};
        if (fx.petrify && there.length) extra += known.some((q) => q.play.cards.some((x) => !x.down && x.type === 'X')) ? 3 : 10;
        if (fx.duel && there.length === 1) extra += 14;
        if (fx.ruleBreaker && there.length) extra += there.some((q) => q.cs <= 1) ? 14 : 2;
        if (fx.zeroOpp) extra += 2;
        if (fx.cancel) extra += unknown.length ? 2 : 0;
        if (fx.playVP) vp += fx.playVP;
        if (fx.win) vp += fx.win * 0.6;
        if (fx.perFoe) vp += there.length * 0.6;
        if (fx.godHand) vp += 1.2;
        if (fx.residual) vp += Math.max(0, 9 - g.round) * 0.6;
        if (fx.once) vp -= late(g) ? 0 : 3; // keep one-use cards for the climax
      }
      const chance = alone ? 0.95 : winChance(pw + extra, foe + 0.5);
      const v = prize * chance + vp - (inf ? 0 : cost * MANA_W) - (t.cs4 ? (late(g) ? 2 : 5) : 0) + (alone ? -pw * 0.05 : 0);
      scored.push({ cb, pw: pw + extra, cost, v, cs4: t.cs4, mana: t.mana });
    }
  }
  if (!scored.length) return { ids: p.hand.slice(0, 2).map((c) => c.uid), down: p.hand.slice(0, 2).map((c) => c.uid) };
  scored.sort((a, b) => b.v - a.v);
  const best = scored[0];
  const ans = { ids: best.cb.map((x) => x.c.uid), down: best.cb.filter((x) => x.down).map((x) => x.c.uid), cs4: best.cs4, cs2: 0, gemMana: 0 };
  if (best.cost > best.mana) ans.gemMana = best.cost - best.mana;
  // Command Spells after the cards: power for a close fight, or leave a hopeless one for recon
  if (!ctx.noCs && !alone && late(g)) {
    const csLeft = p.cs - (best.cs4 ? 1 : 0);
    const gap = foe - best.pw;
    const need = Math.ceil((gap + 1) / CS_POWER);
    if (gap >= 0 && need <= Math.min(2, csLeft)) ans.cs2 = need;
    else if (gap >= 6 && csLeft > 0 && g.reconFree(p)) ans.csMove = 'recon';
  }
  return ans;
}

export function botDecide(g, p, kind, ctx) {
  if (kind === 'place') return place(g, p, ctx.opts);
  if (kind === 'move') return move(g, p, ctx.opts);
  if (kind === 'cards') return cards(g, p, ctx);
  return null;
}
