// Simple bots for the v4.0 demo: they estimate the power they can reach and pick the
// place, move and cards with the best expected VP, plus some noise.
import { AREAS, TERRAIN, WORKSHOP, RECON_VP, SKILL_MANA, CS_MANA, CS_POWER } from './game.js';

const MANA_W = 0.4; // how much a bot values one mana kept for later
const winChance = (mine, theirs) => 1 / (1 + Math.exp(-(mine - theirs) / 2.5));

// VP a bot expects for winning a battlefield (Shinto objects stay hidden until the action step)
function fieldValue(g, f) {
  if (f === 'shinto' && !g.shintoOpen) return 3 * g.objs[f].length + AREAS[f].bonus + g.efx('bonusUp');
  return g.fieldVP(f);
}

// best power from cards it could play at f with this much mana
function handPower(g, p, f, mana = p.mana) {
  const pool = [...p.hand, ...g.usableSkills(p, mana)];
  let best = 0;
  const pw = (c) => g.cardPower(p, c, { f });
  for (let i = 0; i < pool.length; i++) {
    if (g.costOf(p, pool[i]) <= mana) best = Math.max(best, pw(pool[i]));
    for (let j = i + 1; j < pool.length; j++) if (g.costOf(p, pool[i]) + g.costOf(p, pool[j]) <= mana) best = Math.max(best, pw(pool[i]) + pw(pool[j]));
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
      const k = g.here('workshop').length;
      const n = p.m.key === 'kuzuki' ? 0 : WORKSHOP[k];
      // mana matters most just below the 8-mana skill line
      const need = Math.max(0, SKILL_MANA - p.mana);
      v += n * (need > 0 && need <= n + 4 ? 1.3 : 0.6) + (need > 0 ? 0.6 : 0);
      if (p.skills.some((c) => c.resident && c.fx.workshopVP)) v += 2;
      if (p.m.key === 'kirei' && !p.revealed) v += 0.8; // can still slip off to recon for 2 mana
    } else {
      const there = g.here(to);
      const terr = there.length < TERRAIN.length ? TERRAIN[there.length] : 0;
      const mine = handPower(g, p, to) + terr;
      const foe = there.length ? Math.max(...there.map((q) => foePower(g, q))) : 6;
      v += fieldValue(g, to) * winChance(mine, foe) + terr * 0.3;
      if (p.mana < 2) v -= 1;
      if (g.climax()) v += 1;
    }
    return { to, v };
  });
  rows.sort((a, b) => b.v - a.v);
  return { to: rows[0].to };
}

function move(g, p, opts) {
  const late = g.climax() || g.round >= 7;
  const rows = opts.map((o) => {
    let v = -o.cost * MANA_W + g.rng() * 0.5;
    const to = o.to;
    if (to === 'recon') v += RECON_VP;
    else if (AREAS[to].field) {
      const there = g.here(to).filter((q) => q !== p);
      const left = p.mana - o.cost;
      const mine = handPower(g, p, to, left) + (to === p.at ? p.terrain : 0);
      const foe = there.length ? Math.max(...there.map((q) => foePower(g, q))) : 0;
      v += there.length ? fieldValue(g, to) * winChance(mine, foe) : fieldValue(g, to) * 0.85;
    }
    if (o.how === 'cs') v -= late ? 2.5 : 6;
    return { o, v };
  });
  rows.sort((a, b) => b.v - a.v);
  const o = rows[0].o;
  return { to: o.to, how: o.how };
}

// card combinations a bot considers: pairs (and triples when it may play 3), face up or
// down, at least one face up; plus Unlimited Blade Works and Riding builds
function combos(g, p, mana) {
  const skills = g.usableSkills(p, mana);
  const pool = [...p.hand, ...skills];
  const max = g.maxCards(p);
  const out = [];
  const flips = (set) => {
    const n = set.length;
    for (let m = 0; m < 1 << n; m++) {
      if (m === (1 << n) - 1) continue; // all face down is not allowed on a battlefield
      if (set.some((c, i) => m & (1 << i) && c.skill)) continue; // skills are never face down
      out.push(set.map((c, i) => ({ c, down: !!(m & (1 << i)) })));
    }
  };
  for (let i = 0; i < pool.length; i++) {
    flips([pool[i]]);
    for (let j = i + 1; j < pool.length; j++) {
      flips([pool[i], pool[j]]);
      if (max >= 3) for (let k = j + 1; k < pool.length; k++) flips([pool[i], pool[j], pool[k]]);
    }
  }
  const ubw = skills.find((c) => c.fx.ubw);
  if (ubw) {
    let left = mana - g.costOf(p, ubw);
    const pick = [{ c: ubw, down: false }];
    for (const c of [...p.hand, ...p.deck].sort((x, y) => y.power - x.power)) if (pick.length <= ubw.fx.ubw && c.mana <= left) { pick.push({ c, down: false }); left -= c.mana; }
    out.push(pick);
  }
  const rid = skills.find((c) => c.fx.riding);
  if (rid) {
    let left = mana - g.costOf(p, rid);
    const pick = [{ c: rid, down: false }];
    for (const c of [...p.hand].sort((x, y) => y.power - x.power)) if (pick.length < 2 + rid.fx.extra && c.power <= rid.fx.riding && c.mana <= left) { pick.push({ c, down: false }); left -= c.mana; }
    out.push(pick);
  }
  return out;
}

function cards(g, p, ctx) {
  if (!ctx.field) {
    const low = [...p.hand].sort((a, b) => a.power - b.power).slice(0, 2);
    return { ids: low.map((c) => c.uid) };
  }
  const f = p.at;
  const there = g.here(f).filter((q) => q !== p);
  const foe = Math.max(0, ...there.map((q) => foePower(g, q)));
  const alone = !there.length;
  const prize = fieldValue(g, f);
  const late = g.climax() || g.round >= 7;
  const inf = g.infinite(p);
  const tries = [{ cs4: false, mana: p.mana }];
  if (!ctx.cs4used && p.cs > 0 && !alone && late) tries.push({ cs4: true, mana: p.mana + CS_MANA });
  const gemPay = p.m.key === 'rin' ? Math.min(p.gems, 3) : 0;
  const scored = [];
  for (const t of tries) {
    for (const cb of combos(g, p, t.mana)) {
      const cardsUp = cb.filter((x) => !x.down);
      const cost = cardsUp.reduce((s, x) => s + g.costOf(p, x.c), 0);
      if (!inf && cost > t.mana + gemPay) continue;
      const reveals = !p.revealed && cardsUp.some((x) => x.c.fx?.reveal || g.tsubame(p, x.c));
      const play = { cards: cb.map(({ c, down }) => ({ ...c, down })), cs2: 0, gems: 0 };
      const pw = g.powerOf(p, play, { f, revealing: reveals }).total;
      let extra = 0; let vp = 0;
      for (const { c } of cardsUp) {
        const fx = c.fx || {};
        if (fx.petrify && there.length) extra += there.some((q) => q.play?.cards.some((x) => !x.down && x.type === 'X')) ? 3 : 10;
        if (fx.defeatOne && there.length) extra += there.length === 1 ? 14 : 5;
        if (fx.ruleBreaker && there.length) extra += there.some((q) => q.cs === 0) ? 14 : 1;
        if (fx.zeroOpp) extra += 2;
        if (fx.cancel) extra += 1.5;
        if (fx.playVP) vp += fx.playVP;
        if (fx.win) vp += fx.win * 0.6;
        if (fx.perFoe) vp += there.length * 0.6;
        if (fx.godHand) vp += 1;
        if (fx.residual) vp += Math.max(0, 11 - g.round) * 0.8;
        if (fx.once) vp -= late ? 0 : 3; // keep one-use cards for the climax
      }
      if (play.cards.some((c) => !c.down && c.type === 'N') && p.skills.some((c) => c.fx.saberVP)) vp += reveals ? 2 : 1;
      const chance = alone ? 0.95 : winChance(pw + extra, foe + 0.5);
      if (cardsUp.some(({ c }) => c.fx?.loseVP)) vp -= c5(p) * (1 - chance);
      const v = prize * chance + vp - (inf ? 0 : cost * MANA_W) - (t.cs4 ? (late ? 2 : 5) : 0) + (alone ? -pw * 0.05 : 0);
      scored.push({ cb, pw: pw + extra, cost, v, cs4: t.cs4 });
    }
  }
  if (!scored.length) return { ids: p.hand.slice(0, 2).map((c) => c.uid), down: p.hand.slice(1, 2).map((c) => c.uid) };
  scored.sort((a, b) => b.v - a.v);
  const best = scored[0];
  const ans = { ids: best.cb.map((x) => x.c.uid), down: best.cb.filter((x) => x.down).map((x) => x.c.uid), cs4: best.cs4, cs2: 0, gems: 0, gemMana: 0 };
  const mana = p.mana + (best.cs4 ? CS_MANA : 0);
  if (best.cost > mana) ans.gemMana = best.cost - mana;
  const gap = foe - best.pw;
  const csLeft = p.cs - (best.cs4 ? 1 : 0);
  if (!alone && gap >= 0 && gap < CS_POWER * Math.min(2, csLeft) && (late || csLeft >= 2)) ans.cs2 = Math.min(csLeft, Math.ceil((gap + 1) / CS_POWER));
  if (p.m.key === 'rin' && !alone && gap >= 0 && gap < 3) ans.gems = Math.min(3, p.gems - ans.gemMana, gap + 1);
  return ans;
}
const c5 = (p) => Math.min(p.vp + 3, 5);

export function botDecide(g, p, kind, ctx) {
  if (kind === 'place') return place(g, p, ctx.opts);
  if (kind === 'move') return move(g, p, ctx.opts);
  if (kind === 'cards') return cards(g, p, ctx);
  return null;
}
