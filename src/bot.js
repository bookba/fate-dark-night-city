// "Normal" difficulty bot from design section 12. Bots answer through the same
// decide() interface as the human, so a bot can take over a disconnected seat.

import { MANA_MAX } from './data.js';

const AREA_VALUE = { temple: 4.5, forest: 2.3, shinto: 2.4, church: 0.6, school: 3.2 };
const CATALYST_PREF = ['heracles', 'artoria', 'gilgamesh', 'iskandar', 'cu', 'emiya', 'siegfried'];

function strength(pl) {
  const s = pl.servant;
  if (!s) return 0;
  return s.hp + pl.mana * 3 + s.atk * 6 + s.def_ * 3;
}

export function botDecide(game, pl, kind, ctx) {
  switch (kind) {
    case 'area': return chooseArea(game, pl);
    case 'encounter': return chooseTarget(game, pl, ctx.targets);
    case 'combat': return chooseMove(game, pl, ctx);
    case 'summon': return true;
    case 'catalyst': return CATALYST_PREF.find((k) => ctx.choices.includes(k)) ?? ctx.choices[0];
    default: return null;
  }
}

function fieldActions(game, pl) {
  const s = pl.servant;
  const has = (c) => pl.cards.includes(c);
  if (has('mana_vial') && pl.mana <= MANA_MAX - 6) game.useFieldCard(pl, 'mana_vial');
  if (has('potion') && s.hp <= s.maxHp - 30) game.useFieldCard(pl, 'potion');
  const keep = game.grail.appeared ? 1 : 2;
  if (s.hp < s.maxHp * 0.35 && pl.seals > keep) game.sealHeal(pl);
  if (has('hero_record')) {
    const unknown = game.alive().filter((x) => x !== pl && !game.knowsName(pl, x));
    if (unknown.length) game.useFieldCard(pl, 'hero_record', game.pick(unknown).id);
  }
  if (has('familiar') && game.rng() < 0.4) game.useFieldCard(pl, 'familiar');
}

function chooseArea(game, pl) {
  fieldActions(game, pl);
  const s = pl.servant;
  const hpPct = s.hp / s.maxHp;
  const holder = game.grail.holder;
  const scores = game.open.map((a) => {
    let v = AREA_VALUE[a];
    if (a === 'forest') v += (1 - hpPct) * 3;
    if (a === 'church') v += (1 - hpPct) * 6 + (pl.seals < 3 ? 1.5 : 0);
    if (a === 'shinto' && pl.cards.length >= 3) v -= 1.5;
    if (s.def.favored === a) v += game.rng() < 0.6 ? 2 : 0; // not every phase, so others can't read it
    if (s.def.unfavored === a) v -= 2;
    if (a === 'temple' && hpPct < 0.5) v -= 1.5; // popular spot = fights
    if (game.grail.appeared) {
      const strong = strength(pl) > 110;
      if (!holder && a === game.grail.area) v += strong ? 6 : 2;
      if (holder && holder !== pl && a === holder.area && strong) v += 4;
    }
    return { a, v: v + game.rng() * 1.5 };
  });
  scores.sort((x, y) => y.v - x.v);
  const area = (game.rng() < 0.75 ? scores[0] : scores[Math.min(1, scores.length - 1)]).a;
  let stance = hpPct < 0.4 ? 'hide' : 'gather';
  if (holder === pl) stance = 'gather';
  if (stance === 'hide' && pl.cards.includes('ward_stone')) game.useFieldCard(pl, 'ward_stone');
  return { area, stance };
}

function chooseTarget(game, pl, targets) {
  const s = pl.servant;
  const hpPct = s.hp / s.maxHp;
  const mine = strength(pl) * (pl.hidden ? 1.25 : 1) * (game.areaMod(pl) > 0 ? 1.15 : game.areaMod(pl) < 0 ? 0.85 : 1);
  let best = null, bestEdge = -Infinity;
  for (const t of targets) {
    let edge = mine / Math.max(1, strength(t) * 0.92); // bots can't see enemy mana, assume a bit less
    if (game.grail.holder === t) edge += 0.35;
    if (t.servant.hp < 30) edge += 0.2;
    if (edge > bestEdge) { bestEdge = edge; best = t; }
  }
  const aggressive = game.grail.appeared || game.day >= 6;
  const need = aggressive ? 0.95 : 1.1;
  if (hpPct < 0.35 && game.grail.holder !== best) return null;
  if (pl.mana >= 4 && bestEdge >= need) return best.id;
  if (hpPct > 0.6 && game.rng() < (aggressive ? 0.3 : 0.15)) return best.id;
  return null;
}

function chooseMove(game, pl, ctx) {
  const { side, moves, cards } = ctx;
  const s = side.s, foe = side.enemy;
  const hpPct = s.hp / s.maxHp;
  const foeHp = foe.s.hp;
  const get = (t, id) => moves.find((m) => m.type === t && (!id || m.skillId === id));
  const out = { type: 'attack' };
  const r = game.rng();

  // cards first (free actions)
  const hasCard = (c) => cards.includes(c);
  const losing = hpPct < 0.3 && foeHp > s.hp * 1.4;

  if (losing) {
    if (hasCard('scroll')) return { type: 'attack', card: 'scroll' };
    if (get('seal_flee') && pl.seals >= 2) return { type: 'seal_flee' };
    if (get('flee')) return { type: 'flee', card: hasCard('charm') ? 'charm' : null };
  }

  const np = get('np');
  if (np) {
    const finisher = foeHp <= 55;
    const desperate = hpPct < 0.45;
    if (pl.mana >= np.cost && (finisher || desperate || game.grail.appeared || r < 0.25)) {
      out.type = 'np';
    } else if (pl.seals >= 3 && (finisher || game.grail.holder === foe.pl) && r < 0.5) {
      out.type = 'np'; out.boost = true;
    }
  }
  if (out.type === 'attack') {
    const skills = moves.filter((m) => m.type === 'skill' && m.cost <= pl.mana);
    const dmg = skills.filter((m) => /d6/.test(m.desc) && !/โจมตีปกติ/.test(m.desc));
    const other = skills.filter((m) => !dmg.includes(m));
    if (dmg.length && r < 0.65) Object.assign(out, { type: 'skill', skillId: game.pick(dmg).skillId });
    else if (other.length && r < 0.85) {
      const m = game.pick(other);
      if (!(m.skillId === 'temple_heal' && hpPct > 0.7)) Object.assign(out, { type: 'skill', skillId: m.skillId });
    } else if (hpPct < 0.4 && get('defend') && pl.mana >= 1 && r < 0.95) out.type = 'defend';
  }

  if (!out.card) {
    if (hasCard('gem')) out.card = 'gem';
    else if (hasCard('black_keys')) out.card = 'black_keys';
    else if (hasCard('shroud') && hpPct < 0.4) out.card = 'shroud';
    else if (hasCard('charm') && out.type === 'np') out.card = 'charm';
    else if (hasCard('potion') && s.hp <= s.maxHp - 30) out.card = 'potion';
    else if (hasCard('mana_vial') && np && pl.mana < np.cost) out.card = 'mana_vial';
  }
  const keep = game.grail.appeared ? 1 : 2;
  if (hpPct < 0.25 && pl.seals > keep + (out.boost ? 1 : 0)) out.sealHeal = true;
  return out;
}

