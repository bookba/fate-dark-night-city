// node v5/sim.mjs [games] [sample] — bots-only games to check the rules never crash or break state;
// "sample" shuffles in the example window cards of paper section 9
import { Game, SERVANTS, MANA_MAX, REGULAR, AREAS, SAMPLE } from './game.js';
import { botDecide } from './bot.js';

const N = +process.argv[2] || 300;
const sample = process.argv[3] === 'sample';
const st = { rounds: 0, excalWin: 0, replay: 0, fights: 0, alone: 0, reveals: 0, skills: 0, recon: 0, cs: 0, csPower: 0, csMove: 0, swap: 0, gandr: 0, gemMana: 0, avalon: 0, tsubame: 0, allDown: 0, endVP: 0, out8: 0, offPlay: 0, offUse: 0, cardMove: 0, zab: 0, zabWin: 0, hide: 0, winUse: 0,
  grail: 0, blackShadow: 0, book: 0, ubw: 0, ruleBreaker: 0, block: 0, strike1: 0, godHandOut: 0, enuma: 0, presence: 0, luck: 0, bell: 0, archer: 0, kuzukiVP: 0, dress: 0, temper: 0 };
const wins = {};
const svWins = {};
const svDealt = {};
const deckSize = Object.fromEntries(SERVANTS.map((s) => [s.key, s.deck.length + (sample ? SAMPLE.length : 0)]));
for (let i = 0; i < N; i++) {
  const g = new Game({ decide: async (g, p, k, c) => botDecide(g, p, k, c), sample });
  for (const p of g.players) svDealt[p.sv.key] = (svDealt[p.sv.key] || 0) + 1;
  if (new Set(g.players.map((p) => p.sv.key)).size !== g.players.length) throw new Error('a Servant was dealt twice');
  g.human.isHuman = false; // the human seat plays as a bot too
  const check = () => {
    for (const p of g.players) {
      if (p.mana < 0 || p.mana > MANA_MAX || p.cs < 0 || p.gems < 0 || p.vp < 0 || [p.mana, p.cs, p.gems, p.vp].some(Number.isNaN)) throw new Error(`bad state r${g.round} ${p.name} mana ${p.mana} cs ${p.cs} gems ${p.gems} vp ${p.vp}`);
      const n = p.hand.length + p.deck.length + p.trash.length + (p.play?.cards.filter((c) => !c.skill && !c.keep).length || 0);
      if ([...p.hand, ...p.deck, ...p.trash].some((c) => c.skill || c.keep)) throw new Error(`NP/skill or Master card in a pile r${g.round} ${p.name}`);
      if (p.trash.some((c) => c.off)) throw new Error(`turned-off card left marked in the discard pile r${g.round} ${p.name}`);
      const want = deckSize[p.sv.key] + (p.m.key === 'kuzuki' ? 2 : 0);
      if (n !== want) throw new Error(`lost cards r${g.round} ${g.phase} ${p.name} ${p.hand.length}+${p.deck.length}+${p.trash.length} != ${want}`);
      if (p.deck.some((c) => c.down)) throw new Error(`face-down card left in the deck r${g.round} ${p.name}`);
      if (p.revealed && p.skills.some((c) => c.resident && c.fx?.offOnReveal)) throw new Error(`Metamorphosis still on with the true name open r${g.round} ${p.name}`);
    }
  };
  g.onEvent = (e) => { if (e.type === 'update' || e.type === 'combat') check(); };
  // the cut: nobody left above the line is out, nobody at or below it stays (Avalon aside)
  const elim = g.eliminate.bind(g);
  g.eliminate = () => {
    const before = g.alive().map((p) => ({ p, vp: p.vp }));
    const r = g.round;
    elim();
    const out = before.filter((x) => x.p.out);
    const kept = before.filter((x) => !x.p.out);
    const saved = (p) => p.avalonRound === r;
    if (out.length && kept.some((k) => !saved(k.p) && out.some((o) => o.vp >= k.vp))) throw new Error(`bad cut r${r} kept ${kept.map((x) => x.vp)} out ${out.map((x) => x.vp)}`);
    if (r === REGULAR && g.alive().filter((p) => !saved(p)).length > 4) throw new Error(`more than 4 left after round 8: ${g.alive().length}`);
    if (r > REGULAR && out.length && g.alive().filter((p) => !saved(p)).length > (before.length === 2 ? 1 : 2)) throw new Error(`climax cut left ${g.alive().length}`);
    if (r === REGULAR) st.out8 += out.length;
  };
  const apply = g.applyCards.bind(g);
  g.applyCards = (p, a) => {
    const f = AREAS[p.at].field;
    st.gandr += a.gandr; st.gemMana += a.gemMana;
    if (a.cost > p.mana + (a.cs4 ? 4 : 0) + a.gemMana && !g.infinite(p)) throw new Error(`paid ${a.cost} with ${p.mana} mana r${g.round} ${p.name}`);
    if (f && a.ids.length && a.ids.every((id) => a.down.includes(id))) st.allDown++;
    const up = a.ids.filter((id) => !a.down.includes(id)).map((id) => [...p.hand, ...p.skills, ...p.specials, ...p.deck].find((c) => c.uid === id));
    if (up.some((c) => c?.fx?.hiddenOnly) && p.revealed) throw new Error(`Zabaniya with the true name open r${g.round} ${p.name}`);
    if (!f) { st.offPlay++; if (up.some((c) => c && (c.fx?.mana || c.fx?.permanent || c.fx?.hide || c.fx?.move || c.fx?.bell || c.fx?.reveal || c.fx?.archer))) st.offUse++; }
    if (up.some((c) => c?.fx?.zab)) st.zab++;
    if (up.some((c) => c?.fx?.ubw)) st.ubw++;
    if (up.some((c) => c?.fx?.bell)) st.bell++;
    if (up.some((c) => c?.fx?.archer)) st.archer++;
    const slots = a.ids.map((id) => [...p.hand, ...p.skills, ...p.specials, ...p.deck, ...p.trash].find((c) => c.uid === id)).filter((c) => c && !c.fx?.extra && !c.fx?.strike3 && !(c.power <= 3 && !c.skill && up.some((u) => u?.fx?.riding)));
    if (slots.length > g.maxCards(p) + (up.some((c) => c?.fx?.ubw) ? 3 : 0)) throw new Error(`too many cards r${g.round} ${p.name}: ${slots.length}`);
    const r = apply(p, a);
    if (p.play && g.tsubame(p.play.cards)) st.tsubame++;
    if (!f && AREAS[p.at].field && !p.play) throw new Error(`moved into a battlefield without cards r${g.round} ${p.name}`);
    if (!AREAS[p.at].field && p.play) throw new Error(`cards left out of a battlefield r${g.round} ${p.name}`);
    return r;
  };
  const fight = g.fight.bind(g);
  g.fightLog = [];
  g.fight = async (f, people) => { const r = await fight(f, people); g.fightLog.push(r); st.zabWin += r.ents.filter((e) => e.notes.some((n) => n.startsWith('Zabaniya'))).length; return r; };
  await g.run();
  check();
  if (!g.over || !g.winner) throw new Error(`game did not finish (round ${g.round}, ${g.alive().length} left)`);
  if (!g.special && g.alive().length !== 1) throw new Error(`winner but ${g.alive().length} left`);
  if (g.special) st.excalWin++;
  const has = (t) => g.logs.filter((l) => l.text.includes(t)).length;
  st.grail += has('ได้ The Tainted Grail'); st.blackShadow += has('ได้การ์ด Black Shadow'); st.book += has('Book of the False Attendant');
  st.ruleBreaker += has('ใช้ Rule Breaker:'); st.block += has('ใช้ 2nd Strike'); st.kuzukiVP += has('รอบนี้ไม่ได้ VP เลย'); st.dress += has('Dress of Heaven:'); st.temper += has('Short Temper');
  for (const r of g.fightLog || []) for (const e of r.ents) {
    const t = e.notes.join(' | ');
    if (t.includes('1st Strike ปิดตัวเอง ลง')) st.strike1++;
    if (t.includes('แล้วออกจากเกม')) st.godHandOut++;
    if (t.includes('Enuma Elish')) st.enuma++;
    if (t.includes('Assassin Class')) st.presence++;
    if (t.includes('Luck:')) st.luck++;
  }
  wins[g.winner.m.key] = (wins[g.winner.m.key] || 0) + 1;
  svWins[g.winner.sv.key] = (svWins[g.winner.sv.key] || 0) + 1;
  st.rounds += g.round;
  st.replay += g.logs.filter((l) => l.text.includes('ไม่มีใครตกรอบ')).length;
  st.fights += g.logs.filter((l) => l.cls === 'fight').length;
  st.alone += g.logs.filter((l) => l.text.includes('อยู่คนเดียว')).length;
  st.reveals += g.logs.filter((l) => l.text.includes('เปิดชื่อจริง')).length;
  st.recon += g.logs.filter((l) => l.text.includes('เข้าลาดตระเวน')).length;
  st.cs += g.logs.filter((l) => l.cls === 'cs').length;
  st.csPower += g.logs.filter((l) => l.text.includes('Command Spell พลัง')).length;
  st.csMove += g.logs.filter((l) => l.text.includes('Command Spell ย้าย')).length;
  st.swap += g.logs.filter((l) => l.text.includes('ทิ้งการ์ด') && l.text.includes('อัญมณี')).length;
  st.cardMove += g.logs.filter((l) => l.text.includes(' ย้ายจาก')).length;
  st.hide += g.logs.filter((l) => l.text.includes('ซ่อนชื่อจริงกลับ')).length;
  st.winUse += g.logs.filter((l) => / ช่วง(เตรียมการ|ก่อนวางหมาก|หลังวางหมาก|ก่อนย้าย|หลังย้าย|หลังลงการ์ด|จบรอบ)/.test(l.text)).length;
  st.avalon += g.players.some((p) => p.avalonUsed) ? 1 : 0;
  st.skills += g.players.reduce((s, p) => s + Object.values(p.uses).reduce((a, b) => a + b, 0), 0);
  st.endVP += g.winner.vp;
}
const per = (x) => +(x / N).toFixed(2);
console.log(N, 'games', Object.fromEntries(Object.entries(st).map(([k, v]) => [k, ['excalWin', 'avalon', 'grail', 'book'].includes(k) ? v : per(v)])));
console.log('Master wins', wins);
console.log('Servant wins', svWins);
console.log('Servant win rate when dealt', Object.fromEntries(Object.entries(svDealt).map(([k, n]) => [k, +((svWins[k] || 0) / n).toFixed(3)])));
