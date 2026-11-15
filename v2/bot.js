// Simple bots for the v2.0 demo: they score each open location with a little noise.
import { COLORS, LOCS, SPLIT, CS_MAX } from './game.js';

function wantColor(pl) {
  // primary until the NP unlocks (10), then the secondary for Skill 3
  return pl.tok[pl.sv.P] < 10 ? pl.sv.P : pl.sv.S;
}

function churchEx(pl) {
  if (pl.tok.C >= 5 && pl.cs < CS_MAX) return 'cs';
  if (pl.hp <= 6) return 'heal';
  if (pl.tok.C >= 2) return 'curse';
  return 'heal';
}

function chooseLoc(g, pl, open) {
  const want = wantColor(pl);
  const rows = open.map((loc) => {
    let v = g.rng() * 3;
    if (loc === 'temple') v += pl.tok.M < 6 ? 5 : 2;
    if (loc === 'castle') v += 6;
    if (loc === 'school') v += 5;
    if (loc === 'station') v += 3.5;
    if (loc === 'matou') v += pl.tok.C >= 3 ? -6 : 3;
    if (loc === 'church') v += pl.hp <= 6 || pl.tok.C >= 3 ? 7 : 1;
    if (g.phase.night && pl.hp <= 4) v -= LOCS[loc].cap * 1.5; // hide in small places
    if (g.grail.appeared && !g.grail.holder && g.grail.loc === loc) v += 15;
    if (g.grail.holder === pl) v += LOCS[loc].cap === 1 ? 4 : 0;
    if (g.grail.holder && g.grail.holder !== pl) v += 2 * (g.alive().length <= 2);
    return { loc, v };
  });
  rows.sort((a, b) => b.v - a.v);
  const loc = rows[0].loc;
  const out = { loc };
  if (loc === 'school') out.color = want;
  if (SPLIT[loc]) {
    const n = SPLIT[loc];
    const s = { B: 0, A: 0, Q: 0 };
    s[want] = n;
    // grab one of each colour for the Passive if missing
    for (const k of COLORS) if (pl.tok[k] === 0 && s[want] > 1 && k !== want) { s[k]++; s[want]--; }
    out.split = s;
  }
  if (loc === 'church') out.ex = churchEx(pl);
  return out;
}

function chooseFight(g, pl, ctx) {
  const opts = g.options(pl).sort((a, b) => b.p.atk - a.p.atk);
  const best = opts[0];
  const grail = (g.grail.appeared && g.grail.loc === ctx.loc) || g.grail.holder === pl || ctx.foes.includes(g.grail.holder);
  const can = g.canSpell(pl);
  let cs = can ? pl.cs : 0;
  const ans = { skill: best.sk.key };
  if (cs && pl.hp <= 4) { ans.heal = true; cs--; }
  if (cs >= 2 && (grail || best.p.atk <= 3) && g.rng() < 0.5) { ans.boost = true; cs--; }
  if (cs && pl.hp <= 5 && !grail) ans.escape = true;
  return ans;
}

export function botDecide(g, pl, kind, ctx) {
  if (kind === 'loc') return chooseLoc(g, pl, ctx.open);
  if (kind === 'fight') return chooseFight(g, pl, ctx);
  return null;
}
