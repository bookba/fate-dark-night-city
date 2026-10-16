// "Normal" difficulty bot from design v1.8 section 12. Bots answer through the
// same decide() interface as the human, so a bot can take over a seat (and
// plays the human's cards when their timer runs out).

import { MANA_MAX, SEAL_MAX, ITEM_MAX, REWARDS, ATTACKS, FIELDS, SHADOW_BASE, HAND_SIZE, attackCost } from './data.js';

const CATALYST_PREF = ['heracles', 'artoria', 'gilgamesh', 'iskandar', 'lancelot', 'cu', 'emiya', 'siegfried'];
const EVENT_VALUE = (ev) => (ev.mana || 0) + (ev.items ? 3.5 : 0) + (ev.heal ? 2.5 : 0) + (ev.draw ? 2 : 0);
// bots see only what a player sees (design 12): a face-down reward counts as the average card
const HIDDEN_VALUE = REWARDS.reduce((a, r) => a + EVENT_VALUE(r), 0) / REWARDS.length;
// the least useful items go first when a bot holds more than it may keep
const DROP_ORDER = ['hero_record', 'charm', 'shroud', 'mana_vial', 'potion', 'gem', 'catalyst', 'scroll'];
const prefRank = (k) => { const i = CATALYST_PREF.indexOf(k.replace(/_alter$/, '')); return i < 0 ? 99 : i; };

export function botDecide(game, pl, kind, ctx) {
  switch (kind) {
    case 'day':
      if (ctx.catalyst) game.pickCatalyst(pl, [...ctx.catalyst].sort((a, b) => prefRank(a) - prefRank(b))[0]);
      return chooseDay(game, pl);
    case 'move': return chooseMove(game, pl, ctx.opts);
    case 'cards': return chooseCards(game, pl, ctx);
    default: return null;
  }
}

// day items, "รักษา!" and discards are part of the day answer and happen at the reveal
function dayActions(game, pl) {
  const s = pl.servant;
  const has = (k) => pl.items.includes(k);
  const items = [];
  if (has('mana_vial') && pl.mana <= MANA_MAX - 5) items.push({ key: 'mana_vial' });
  if (has('potion') && s.hp <= s.maxHp - 6) items.push({ key: 'potion' });
  if (has('hero_record')) {
    const unknown = game.alive().filter((x) => x !== pl && x.servant && !game.knowsName(pl, x));
    if (unknown.length) items.push({ key: 'hero_record', target: game.pick(unknown).id });
  }
  const keep = game.grail.appeared ? 1 : 2;
  const sealHeal = s.hp <= s.maxHp * 0.35 && pl.seals > keep;
  const left = [...pl.items];
  for (const it of items) left.splice(left.indexOf(it.key), 1);
  const discard = [];
  while (left.length > ITEM_MAX) {
    const k = [...left].sort((a, b) => DROP_ORDER.indexOf(a) - DROP_ORDER.indexOf(b))[0];
    left.splice(left.indexOf(k), 1);
    discard.push(k);
  }
  return { items, sealHeal, discard };
}

function fieldScore(game, pl, f) {
  const s = pl.servant;
  const hidden = f === 'shinto' && !game.shintoOpen;
  let v = (hidden ? HIDDEN_VALUE : EVENT_VALUE(game.events[f])) + game.rng() * 2;
  if (s.def.favored === f) v += 2;
  if (s.def.unfavored === f) v -= 2.5;
  if (game.flags[f] === pl.id) v += 2.5;
  if (game.shadowArea === f) v -= 3;
  if (game.grail.appeared && !game.grail.holder && game.grail.area === f) v += 6;
  const holder = game.grail.holder;
  if (holder && holder !== pl && holder.lastField === f && s.hp > s.maxHp * 0.6) v += 3;
  return v;
}

// design 12: the first rule that fits is the answer; rules 2-5 are skipped
// now and then so the bots do not all crowd into one place
function chooseDay(game, pl) {
  const acts = dayActions(game, pl);
  const s = pl.servant;
  const using = (k) => acts.items.some((x) => x.key === k);
  const mana = Math.min(MANA_MAX, pl.mana + (using('mana_vial') ? 5 : 0));
  const hp = Math.min(s.maxHp, s.hp + (using('potion') ? 5 : 0) + (acts.sealHeal ? Math.ceil(s.maxHp / 2) : 0));
  const fields = [...game.cap.fields].sort((a, b) => fieldScore(game, pl, b) - fieldScore(game, pl, a));
  const backup = fields[0];
  const go = (o) => ({ ...acts, backup, ...o });
  // 1. the Grail holder always goes to a battlefield
  if (game.grail.holder === pl) return go({ area: backup });
  if (game.cap.church && pl.seals < SEAL_MAX) {
    // 2. buy a Command Seal  3. or fight the monster under the church for one
    if (mana >= game.offerPrice() && game.rng() < 0.75) return go({ area: 'church', church: { type: 'offer' } });
    if (mana < game.offerPrice() && hp > s.maxHp / 2 && game.rng() < 0.75) return go({ area: 'church', church: { type: 'monster' } });
  }
  // 4. melt weak cards (power 1-2) for mana when holding two or more
  const weak = pl.hand.filter((c) => c.kind === 'atk' && c.power <= 2);
  if (game.cap.mansion && weak.length >= 2 && game.rng() < 0.7) return go({ area: 'mansion', forge: weak.slice(0, 2).map((c) => c.id) });
  // 5. short of mana
  if (game.cap.temple && mana < 8 && game.rng() < 0.8) return go({ area: 'temple' });
  // 6. the battlefield with the best reward that suits the Servant
  return go({ area: backup });
}

// ---------- reading rivals (design 12: HP, mana and the class a player can see) ----------
const CLASS_CARDS = Object.fromEntries(Object.entries(ATTACKS).map(([cls, list]) =>
  [cls, list.split(' ').map((c) => ({ type: c[0], power: +c.slice(1) }))]));
const handCache = new Map();
// what the best affordable pair from a fresh hand of this class's attack cards is worth on average
function handGuess(game, cls, mana) {
  const bonus = game.daily.type || {};
  const key = `${cls}|${game.situation}|${Math.min(mana, 4)}`;
  if (handCache.has(key)) return handCache.get(key);
  const deck = CLASS_CARDS[cls].map((c) => ({ v: c.power + (bonus[c.type] || 0), cost: attackCost(c.power) }));
  let sum = 0, n = 0;
  const pickBest = (hand) => {
    let best = 0;
    for (let i = 0; i < hand.length; i++) {
      if (hand[i].cost <= mana) best = Math.max(best, hand[i].v);
      for (let j = i + 1; j < hand.length; j++) if (hand[i].cost + hand[j].cost <= mana) best = Math.max(best, hand[i].v + hand[j].v);
    }
    return best;
  };
  const walk = (start, hand) => {
    if (hand.length === HAND_SIZE) { sum += pickBest(hand); n++; return; }
    for (let i = start; i < deck.length; i++) walk(i + 1, [...hand, deck[i]]);
  };
  walk(0, []);
  handCache.set(key, sum / n);
  return sum / n;
}

// a rival's likely total at an area, from public facts only: class, mana, where they
// stand, flags, the Grail, a revealed name, and favored ground once the name is known
function rivalEstimate(game, viewer, x, area) {
  const s = x.servant;
  let v = handGuess(game, s.cls, x.mana) + 3.5;
  v += game.fixedParts(x, area).reduce((a, p) => a + p.v, 0);
  if (!game.knowsName(viewer, x)) {
    if (s.def.favored === area) v -= 2;
    if (s.def.unfavored === area) v += 2;
  }
  // enough mana for a Noble Phantasm is a threat even before it is played
  if (x.mana >= (game.daily.npCost || 8)) v += 2;
  return v;
}

function bestThreat(game, pl, area, players) {
  const rivals = players.filter((x) => x !== pl);
  let v = rivals.reduce((a, x) => Math.max(a, rivalEstimate(game, pl, x, area)), -Infinity);
  if (game.shadowArea === area) v = Math.max(v, SHADOW_BASE + 3.5);
  return v;
}

function combosOf(cards) {
  const combos = [[]];
  for (let i = 0; i < cards.length; i++) {
    combos.push([cards[i]]);
    for (let j = i + 1; j < cards.length; j++) combos.push([cards[i], cards[j]]);
  }
  return combos;
}

function evalCombo(game, pl, cards, area) {
  const parts = [...game.cardParts(cards), ...game.fixedParts(pl, area)];
  let v = parts.reduce((a, p) => a + p.v, 0);
  const extra = game.extraDice(pl, cards, []);
  v += [3.5, 4.47, 4.96, 5.24][Math.min(3, extra)];
  for (const c of cards) {
    const e = c.eff;
    v += (e.foe || 0) + (e.reduce || 0) * 0.4 + (e.heal || 0) * 0.4 + (e.mana || 0) * 0.5 + (e.splash || 0) * 0.5 - ((e.selfHit || 0) + (e.darkHit || 0)) * 0.5;
  }
  return v;
}

// design 12 / ก.5: the strongest pair it can pay for; mana only breaks ties
function bestCombo(game, pl, cards, area, mana, withNp) {
  const cost = (combo) => combo.reduce((a, c) => a + game.cardCost(c), 0);
  const rank = (combo) => evalCombo(game, pl, combo, area) - cost(combo) * 0.01;
  const list = combosOf(cards).filter((c) => cost(c) <= mana && c.some((x) => x.kind === 'np') === withNp);
  return list.sort((a, b) => rank(b) - rank(a))[0] || null;
}

// the Master who beat this one in night 1, if it won alone (a public result)
function lastWinnerOver(game, pl) {
  if (game.nightNo !== 2) return null;
  for (const r of game.results || []) {
    const mine = r.entries.find((e) => e.pl === pl);
    if (!mine || mine.result !== 'lose') continue;
    const w = r.entries.find((e) => e.result === 'win');
    return w && !w.pl.out ? w.pl : null;
  }
  return null;
}

function chooseMove(game, pl, opts) {
  const s = pl.servant;
  const out = { type: 'stay' };
  if (opts.view.length) {
    const rivals = game.alive().filter((x) => x !== pl);
    out.view = game.pick(rivals).id;
  }
  // design 12: a bot in the church stays there both night phases
  if (pl.area === 'church') return out;
  const others = game.alive().filter((x) => x !== pl);
  const here = others.filter((x) => x.area === pl.area);
  const hpPct = s.hp / s.maxHp;
  const scroll = pl.items.includes('scroll');
  const empty = (a) => !others.some((x) => x.area === a) && game.shadowArea !== a;
  const safe = ['mansion', 'temple'].find((a) => opts.escape.includes(a) && empty(a)) ?? opts.escape.find(empty) ?? null;
  const escape = (useScroll) => ({ ...out, type: 'escape', to: safe, scroll: useScroll });
  const threatened = here.length > 0 || game.shadowArea === pl.area;
  // night 2: badly hurt and still tied down with whoever just beat it. The scroll or a
  // potion comes first; only then a Command Seal, and never the last one
  const winner = lastWinnerOver(game, pl);
  if (winner && winner.area === pl.area && hpPct <= 0.4) {
    if (scroll && safe) return escape(true);
    if (pl.items.includes('potion')) return out; // stays and drinks it in the card step
    if (pl.seals >= 2 && safe) return escape(false);
    return out;
  }
  // "หนี!" when HP is very low and two or more Command Seals are left
  if (threatened && hpPct <= 0.25 && safe && (scroll || pl.seals >= 2)) return escape(scroll);
  // move only when free and the other battlefield looks weaker (design 12)
  if (!opts.move.length) return out;
  const grailAt = (a) => (game.grail.appeared && !game.grail.holder && game.grail.area === a) ||
    (game.grail.holder && game.grail.holder !== pl && game.grail.holder.area === a);
  const prize = (a) => (FIELDS.includes(a) ? EVENT_VALUE(game.events[a] || {}) : 0) + (grailAt(a) ? 6 : 0);
  const value = (a, mana) => {
    const there = others.filter((x) => x.area === a);
    const threat = bestThreat(game, pl, a, there);
    if (threat === -Infinity) return prize(a);
    const combo = bestCombo(game, pl, game.playable(pl), a, mana, false) || [];
    const edge = evalCombo(game, pl, combo, a) - threat;
    // hunting: alone, with a wounded rival on the other battlefield
    const wounded = there.some((x) => x.servant.hp <= x.servant.maxHp * 0.5);
    if (edge >= 3 || (grailAt(a) && edge >= 0) || (wounded && !here.length && edge >= 0)) return prize(a) + (wounded ? 2 : 0);
    return edge - 3;
  };
  const stay = value(pl.area, pl.mana);
  let best = null, bestV = stay + 1 + game.moveCost() * 0.5;
  for (const f of opts.move) {
    const v = value(f, pl.mana - game.moveCost());
    if (v > bestV) { best = f; bestV = v; }
  }
  return best ? { ...out, type: 'move', to: best } : out;
}

export function chooseCards(game, pl, ctx) {
  const { fight } = ctx;
  const cards = ctx.cards || game.playable(pl);
  const s = pl.servant;
  const hpPct = s.hp / s.maxHp;
  const plain = bestCombo(game, pl, cards, fight.area, pl.mana, false) || [];
  const ids = (combo) => combo.map((c) => c.id);
  // design 12: against the church monster, the strongest pair it can pay for. HP
  // cannot drop below 1 there, so no Command Seal or item is spent on it.
  if (fight.church) return { cards: ids(plain), boost: false, sealHeal: false, items: [] };
  const grailFight = (game.grail.appeared && !game.grail.holder && game.grail.area === fight.area) ||
    (game.grail.holder && fight.players.includes(game.grail.holder));
  const foes = fight.players.length - 1 + (fight.monster ? 1 : 0);
  // the Noble Phantasm: in a Grail fight, or when it makes a likely win out of a doubtful one
  const withNp = bestCombo(game, pl, cards, fight.area, pl.mana, true);
  const threat = bestThreat(game, pl, fight.area, fight.players);
  const sure = (combo) => evalCombo(game, pl, combo, fight.area) >= threat + 3;
  const useNp = withNp && (grailFight || (sure(withNp) && !sure(plain)));
  const out = { cards: ids(useNp ? withNp : plain), boost: false, sealHeal: false, items: [] };
  // "เพิ่มพลัง!" in a Grail fight; no Command Seal use ever spends the last one
  if (grailFight && pl.seals >= 2) out.boost = true;
  const has = (k) => pl.items.includes(k);
  if (has('potion') && s.hp <= s.maxHp - 5) out.items.push('potion');
  else if (hpPct <= 0.3 && pl.seals - (out.boost ? 1 : 0) >= 2) out.sealHeal = true;
  if (has('gem') && (grailFight || foes >= 2 || game.rng() < 0.5)) out.items.push('gem');
  if (has('charm') && (grailFight || game.rng() < 0.5)) out.items.push('charm');
  if (has('shroud') && hpPct <= 0.5) out.items.push('shroud');
  return out;
}
