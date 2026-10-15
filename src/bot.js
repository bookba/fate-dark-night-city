// "Normal" difficulty bot from design v1.3 section 12. Bots answer through the
// same decide() interface as the human, so a bot can take over a seat (and
// plays the human's cards when their timer runs out).

import { MANA_MAX, SEAL_MAX, QUEST_DEPOSIT } from './data.js';

const CATALYST_PREF = ['heracles', 'artoria', 'gilgamesh', 'iskandar', 'lancelot', 'cu', 'emiya', 'siegfried'];
const EVENT_VALUE = (ev) => (ev ? (ev.mana || 0) + (ev.items ? 3.5 : 0) + (ev.heal ? 2.5 : 0) + (ev.draw ? 2 : 0) : 2);

export function botDecide(game, pl, kind, ctx) {
  switch (kind) {
    case 'day': return chooseDay(game, pl);
    case 'move': return chooseMove(game, pl, ctx.opts);
    case 'cards': return chooseCards(game, pl, ctx);
    case 'catalyst': return CATALYST_PREF.find((k) => ctx.choices.includes(k)) ?? ctx.choices[0];
    default: return null;
  }
}

function dayActions(game, pl) {
  const s = pl.servant;
  const has = (k) => pl.items.includes(k);
  if (has('mana_vial') && pl.mana <= MANA_MAX - 5) game.useDayItem(pl, 'mana_vial');
  if (has('potion') && s.hp <= s.maxHp - 6) game.useDayItem(pl, 'potion');
  if (has('hero_record')) {
    const unknown = game.alive().filter((x) => x !== pl && !game.knowsName(pl, x));
    if (unknown.length) game.useDayItem(pl, 'hero_record', game.pick(unknown).id);
  }
  const keep = game.grail.appeared ? 1 : 2;
  if (s.hp <= s.maxHp * 0.35 && pl.seals > keep) game.sealHeal(pl);
}

function fieldScore(game, pl, f) {
  const s = pl.servant;
  let v = EVENT_VALUE(game.events[f]) + game.rng() * 2;
  if (s.def.favored === f) v += 2;
  if (s.def.unfavored === f) v -= 2.5;
  if (game.flags[f] === pl.id) v += 2.5;
  if (game.shadowArea === f) v -= 3;
  if (game.grail.appeared && !game.grail.holder && game.grail.area === f) v += 6;
  const holder = game.grail.holder;
  if (holder && holder !== pl && holder.lastField === f && s.hp > s.maxHp * 0.6) v += 3;
  return v;
}

function chooseDay(game, pl) {
  dayActions(game, pl);
  const s = pl.servant;
  const fields = [...game.cap.fields].sort((a, b) => fieldScore(game, pl, b) - fieldScore(game, pl, a));
  const backup = fields[0];
  const holder = game.grail.holder === pl;
  if (holder) return { area: backup, backup };
  // church: buy a seal when short and able to pay, or pick up a quest now and then
  if (game.cap.church) {
    const price = game.offerPrice();
    if (pl.seals < SEAL_MAX && pl.mana >= price && (pl.seals <= 1 || game.rng() < 0.5)) return { area: 'church', backup, church: { type: 'offer' } };
  }
  if (game.cap.church && !pl.quest) {
    const price = game.offerPrice();
    if (pl.seals < SEAL_MAX && pl.items.length >= 2 && game.quests.includes('offering') && pl.mana >= QUEST_DEPOSIT)
      return { area: 'church', backup, church: { type: 'quest', quest: 'offering' } };
    if (s.hp <= s.maxHp * 0.3 && pl.seals <= 1) return { area: 'church', backup, church: pl.mana >= price ? { type: 'offer' } : null };
  }
  const wantGrail = game.grail.appeared && !game.grail.holder;
  // mansion: melt weak cards (power 1-2) for mana when holding two or more
  const weak = pl.hand.filter((c) => c.kind === 'atk' && c.power <= 2);
  if (game.cap.mansion && !wantGrail && weak.length >= 2 && game.rng() < 0.7) return { area: 'mansion', backup, forge: weak.slice(0, 2).map((c) => c.id) };
  if (game.cap.temple && !wantGrail && (pl.mana < 8 || s.hp <= s.maxHp * 0.4) && game.rng() < 0.8) return { area: 'temple', backup };
  return { area: backup, backup };
}

function strengthGuess(game, pl) {
  // what a bot can reasonably read about a rival: HP, class, flag
  const s = pl.servant;
  return s.hp + (game.flags[pl.area] === pl.id ? 3 : 0);
}

function chooseMove(game, pl, opts) {
  const s = pl.servant;
  const out = { type: 'stay' };
  if (opts.view.length) {
    const rivals = game.alive().filter((x) => x !== pl);
    out.view = game.pick(rivals).id;
  }
  const here = game.alive().filter((x) => x !== pl && x.area === pl.area);
  const hpPct = s.hp / s.maxHp;
  // escape when badly hurt (worse in night 2: tied down with whoever just won); never the last seal
  const danger = game.nightNo === 2 ? 0.4 : 0.25;
  if (here.length && hpPct <= danger && opts.escape.length && (pl.seals >= 2 || pl.items.includes('scroll')) && game.grail.holder !== pl) {
    const empty = (a) => !game.alive().some((x) => x.area === a);
    const safe = ['church', 'mansion'].find((a) => opts.escape.includes(a) && empty(a)) ?? opts.escape.find(empty) ?? null;
    if (safe) return { ...out, type: 'escape', to: safe, scroll: pl.items.includes('scroll') };
  }
  // move only when free and the other battlefield looks weaker / emptier
  if (opts.move.length && pl.mana >= game.moveCost() + 2) {
    for (const f of opts.move) {
      const there = game.alive().filter((x) => x.area === f);
      const theirs = there.reduce((a, x) => Math.max(a, strengthGuess(game, x)), 0);
      const grailHere = game.grail.appeared && !game.grail.holder && game.grail.area === f;
      const holderThere = game.grail.holder && game.grail.holder !== pl && there.includes(game.grail.holder);
      if ((grailHere || holderThere) && hpPct > 0.5) return { ...out, type: 'move', to: f };
      // hunt a wounded rival sitting alone on the other battlefield
      const wounded = there.length === 1 && there[0].servant.hp <= there[0].servant.maxHp * 0.5;
      if (there.length === 1 && (theirs < s.hp - 3 || wounded) && game.rng() < 0.6 && f !== game.shadowArea) return { ...out, type: 'move', to: f };
    }
  }
  return out;
}

function evalCombo(game, pl, cards, area) {
  const parts = [...game.cardParts(cards), ...game.fixedParts(pl, area)];
  let v = parts.reduce((a, p) => a + p.v, 0);
  const extra = game.extraDice(pl, cards, []);
  v += [3.5, 4.47, 4.96, 5.24][Math.min(3, extra)];
  for (const c of cards) {
    const e = c.eff;
    v += (e.foe || 0) + (e.reduce || 0) * 0.4 + (e.heal || 0) * 0.4 + (e.mana || 0) * 0.5 + (e.splash || 0) * 0.5 - (e.selfHit || 0) * 0.5;
  }
  return v;
}

export function chooseCards(game, pl, ctx) {
  const { fight } = ctx;
  const cards = ctx.cards || game.playable(pl);
  const s = pl.servant;
  const hpPct = s.hp / s.maxHp;
  const grailFight = (game.grail.appeared && !game.grail.holder && game.grail.area === fight.area) ||
    (game.grail.holder && fight.players.includes(game.grail.holder));
  const foes = fight.players.length - 1 + (fight.monster ? 1 : 0);
  const combos = [[]];
  for (let i = 0; i < cards.length; i++) {
    combos.push([cards[i]]);
    for (let j = i + 1; j < cards.length; j++) combos.push([cards[i], cards[j]]);
  }
  let best = null, bestScore = -Infinity;
  for (const combo of combos) {
    const cost = combo.reduce((a, c) => a + game.cardCost(c), 0);
    if (cost > pl.mana) continue;
    const hasNp = combo.some((c) => c.kind === 'np');
    let total = evalCombo(game, pl, combo, fight.area);
    // mana is score at the end, so spend it only when it matters
    let score = total - cost * (grailFight || hpPct < 0.5 ? 0.25 : 0.55);
    if (hasNp && !grailFight && !s.revealed && hpPct > 0.4 && total < 17) score -= 3; // keep the true name hidden
    if (score > bestScore) { bestScore = score; best = { combo, total }; }
  }
  const out = { cards: best.combo.map((c) => c.id), boost: false, sealHeal: false, items: [] };
  const keep = game.grail.appeared ? 0 : 1;
  if (grailFight && pl.seals > keep + 1) out.boost = true;
  if (hpPct <= 0.3 && pl.seals > keep + (out.boost ? 1 : 0)) out.sealHeal = true;
  const has = (k) => pl.items.includes(k);
  if (has('gem') && (grailFight || foes >= 2 || game.rng() < 0.5)) out.items.push('gem');
  if (has('charm') && (grailFight || game.rng() < 0.5)) out.items.push('charm');
  if (has('shroud') && hpPct <= 0.5) out.items.push('shroud');
  if (has('potion') && s.hp <= s.maxHp - 5) out.items.push('potion');
  return out;
}
