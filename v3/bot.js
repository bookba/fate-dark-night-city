// Simple bots for the v3.0 demo: they estimate the power they can reach and pick
// the place, move and cards with the best expected battle results, plus some noise.
import { AREAS, TERRAIN, CASUAL, NP_MANA, RECON_RES } from './game.js';

const MANA_W = 0.35; // how much a bot values one mana kept for later

function fieldValue(g, f) {
  if (g.mode === 'casual') return CASUAL.win[f];
  const evs = g.fieldEv[f];
  const v = f === 'shinto' && !g.shintoOpen ? 2.5 * evs.length : evs.reduce((s, e) => s + e.v, 0);
  return v + AREAS[f].bonus;
}

// best power from two hand cards it can pay for right now (no NP)
function handPower(g, p) {
  const h = p.hand;
  let best = 0;
  for (let i = 0; i < h.length; i++) for (let j = i + 1; j < h.length; j++) if (h[i].mana + h[j].mana <= p.mana) best = Math.max(best, h[i].power + h[j].power);
  if (p.mana >= NP_MANA) for (const c of g.usableNp(p)) for (const x of h) if (c.mana + x.mana <= p.mana) best = Math.max(best, c.power + x.power);
  return best;
}

const winChance = (mine, theirs) => 1 / (1 + Math.exp(-(mine - theirs) / 2.5));

function foePower(g, q) { return q.play ? q.play.pre : 7 + q.terrain; }

function place(g, p, opts) {
  const rows = opts.map((to) => {
    let v = g.rng() * 2;
    if (to === 'workshop') {
      const n = (g.here('workshop').length === 0 ? 2 : 1) + g.fx('workshop');
      v += p.m.key === 'kuzuki' ? n * 1.4 : p.mana < NP_MANA ? n * 1.2 + (NP_MANA - p.mana) * 0.35 : n * 0.5;
    } else {
      const there = g.here(to);
      const terr = there.length < TERRAIN.length ? TERRAIN[there.length] : 0;
      const mine = handPower(g, p) + terr;
      const foe = there.length ? Math.max(...there.map((q) => foePower(g, q))) : 6;
      v += fieldValue(g, to) * winChance(mine, foe) + terr * 0.3;
      if (p.mana < 2) v -= 1.5;
    }
    return { to, v };
  });
  rows.sort((a, b) => b.v - a.v);
  return { to: rows[0].to };
}

function move(g, p, opts) {
  const late = g.climax || g.round >= g.sits.length - 1;
  const rows = opts.map((o) => {
    let v = -o.cost * MANA_W + g.rng() * 0.5;
    const to = o.to;
    if (to === 'recon') v += RECON_RES + g.fx('recon');
    else if (AREAS[to].field) {
      const there = g.here(to).filter((q) => q !== p);
      const mine = handPower(g, p) + (to === p.at ? p.terrain : 0) - o.cost;
      const foe = there.length ? Math.max(...there.map((q) => foePower(g, q))) : 0;
      v += there.length ? fieldValue(g, to) * winChance(mine, foe) : fieldValue(g, to) * 0.8;
    }
    if (o.how === 'cs') v -= late ? 2.5 : 6;
    return { o, v };
  });
  rows.sort((a, b) => b.v - a.v);
  const o = rows[0].o;
  return { to: o.to, how: o.how };
}

function combos(g, p) {
  const np = g.usableNp(p);
  const pool = [...p.hand, ...np];
  const out = [];
  for (let i = 0; i < pool.length; i++) for (let j = i + 1; j < pool.length; j++) {
    const a = pool[i]; const b = pool[j];
    out.push([{ c: a, down: false }, { c: b, down: false }]);
    if (!a.np) out.push([{ c: a, down: true }, { c: b, down: false }]);
    if (!b.np) out.push([{ c: a, down: false }, { c: b, down: true }]);
    if (!a.np && !b.np) out.push([{ c: a, down: true }, { c: b, down: true }]);
  }
  if (pool.length === 1) out.push([{ c: pool[0], down: !pool[0].np }]);
  // Unlimited Blade Works: UBW + the three strongest affordable cards from hand and deck
  const ubw = np.find((c) => c.fx.ubw);
  if (ubw) {
    let left = p.mana - ubw.mana;
    const pick = [{ c: ubw, down: false }];
    for (const c of [...p.hand, ...p.deck].sort((x, y) => y.power - x.power)) if (pick.length < 4 && c.mana <= left) { pick.push({ c, down: false }); left -= c.mana; }
    out.push(pick);
  }
  // Riding: add every cheap card with power 3 or less
  const rid = np.find((c) => c.fx.riding);
  if (rid) {
    let left = p.mana - rid.mana;
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
  const evs = g.fieldEv[p.at] || [];
  const there = g.here(p.at).filter((q) => q !== p);
  const acted = there.filter((q) => q.play);
  const waiting = there.filter((q) => !q.play);
  const foe = Math.max(0, ...acted.map((q) => q.play.pre), ...waiting.map((q) => 8 + q.terrain));
  const alone = !there.length;
  const prize = fieldValue(g, p.at);
  const scored = [];
  for (const cb of combos(g, p)) {
    const play = { cards: cb.map(({ c, down }) => ({ ...c, down })), cs2: 0, gems: 0 };
    const free = play.cards.some((c) => !c.down && c.fx?.freeMana);
    const cost = play.cards.reduce((s, c) => s + (c.down || (free && !c.fx?.freeMana) ? 0 : c.mana), 0);
    if (cost > p.mana && !g.infinite(p)) continue;
    const pw = g.powerOf(p, play, { events: evs }).total;
    let extra = 0;
    for (const c of play.cards) {
      if (c.down || !c.fx) continue;
      if (c.fx.sure1v1 && there.length === 1) extra += 20;
      if (c.fx.petrify && there.length) extra += 12;
      if (c.fx.win) extra += c.fx.win * 0.5;
      if (c.fx.perFoe) extra += there.length * 0.5;
      if (c.fx.doubleRes) extra += p.res * 0.3;
      if (c.fx.godHand) extra += 1.5;
      if (c.fx.once) extra -= g.climax ? 0 : 4; // keep one-use cards for the climax
    }
    const npUsed = play.cards.filter((c) => c.np).length;
    const chance = alone ? 0.9 : winChance(pw + extra, foe + 0.5);
    const v = prize * chance - cost * MANA_W - npUsed * (g.climax ? 0.2 : 1.2) + (alone ? -pw * 0.05 : 0);
    scored.push({ cb, pw, cost, v });
  }
  if (!scored.length) return { ids: p.hand.slice(0, 2).map((c) => c.uid), down: p.hand.slice(0, 2).map((c) => c.uid) };
  scored.sort((a, b) => b.v - a.v);
  const best = scored[0];
  const ans = { ids: best.cb.map((x) => x.c.uid), down: best.cb.filter((x) => x.down).map((x) => x.c.uid), cs2: 0, gems: 0 };
  const gap = foe - best.pw;
  const late = g.climax || g.round >= g.sits.length - 2;
  if (!alone && gap >= 0 && gap < 2 * Math.min(2, p.cs) && (late || p.cs >= 2)) ans.cs2 = Math.min(p.cs, Math.ceil((gap + 1) / 2));
  if (p.m.key === 'rin' && !alone && gap >= 0 && gap < 3 && p.gems && (p.jewel || p.cs > 1)) ans.gems = Math.min(3, p.gems, gap + 1);
  if (p.m.key === 'shirou' && !alone && (p.mana - best.cost) >= 1 && p.mana >= NP_MANA && gap >= 0) ans.kb = true;
  return ans;
}

export function botDecide(g, p, kind, ctx) {
  if (kind === 'place') return place(g, p, ctx.opts);
  if (kind === 'move') return move(g, p, ctx.opts);
  if (kind === 'cards') return cards(g, p, ctx);
  return null;
}
