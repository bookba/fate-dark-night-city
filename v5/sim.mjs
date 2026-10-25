// node v5/sim.mjs [games] — bots-only games to check the rules never crash or break state
import { Game, SERVANTS, MANA_MAX, REGULAR } from './game.js';
import { botDecide } from './bot.js';

const N = +process.argv[2] || 300;
const st = { rounds: 0, clown: 0, replay: 0, fights: 0, alone: 0, reveals: 0, skills: 0, recon: 0, cs: 0, csPower: 0, csMove: 0, swap: 0, gand: 0, avalon: 0, tsubame: 0, allDown: 0, endVP: 0, out8: 0 };
const wins = {};
const svWins = {};
const deckSize = Object.fromEntries(SERVANTS.map((s) => [s.key, s.deck.length]));
for (let i = 0; i < N; i++) {
  const g = new Game({ decide: async (g, p, k, c) => botDecide(g, p, k, c) });
  g.human.isHuman = false; // the human seat plays as a bot too
  const check = () => {
    for (const p of g.players) {
      if (p.mana < 0 || p.mana > MANA_MAX || p.cs < 0 || p.gems < 0 || p.vp < 0 || [p.mana, p.cs, p.gems, p.vp].some(Number.isNaN)) throw new Error(`bad state r${g.round} ${p.name} mana ${p.mana} cs ${p.cs} gems ${p.gems} vp ${p.vp}`);
      const n = p.hand.length + p.deck.length + p.trash.length + (p.play?.cards.filter((c) => !c.skill && !c.keep).length || 0);
      const want = deckSize[p.sv.key] + (p.m.key === 'kuzuki' ? 2 : 0);
      if (n !== want) throw new Error(`lost cards r${g.round} ${g.phase} ${p.name} ${p.hand.length}+${p.deck.length}+${p.trash.length} != ${want}`);
      if (p.deck.some((c) => c.down)) throw new Error(`face-down card left in the deck r${g.round} ${p.name}`);
    }
  };
  g.onEvent = (e) => { if (e.type === 'update' || e.type === 'combat') check(); };
  // the cut: nobody left above the line is out, nobody at or below it stays (Avalon aside)
  const elim = g.eliminate.bind(g);
  g.eliminate = () => {
    const before = g.alive().map((p) => ({ p, vp: p.vp }));
    const r = g.round;
    elim();
    if (g.over) { st.clown++; return; }
    const out = before.filter((x) => x.p.out);
    const kept = before.filter((x) => !x.p.out);
    if (out.length && kept.some((k) => !(k.p.m.key === 'shirou' && r === REGULAR) && out.some((o) => o.vp >= k.vp))) throw new Error(`bad cut r${r} kept ${kept.map((x) => x.vp)} out ${out.map((x) => x.vp)}`);
    if (r === REGULAR && g.alive().filter((p) => !p.avalonUsed).length > 4) throw new Error(`more than 4 left after round 8: ${g.alive().length}`);
    if (r > REGULAR && out.length && g.alive().length > (before.length === 2 ? 1 : 2)) throw new Error(`climax cut left ${g.alive().length}`);
    if (r === REGULAR) st.out8 += out.length;
  };
  const apply = g.applyCards.bind(g);
  g.applyCards = (p, a, f) => {
    if (a.gand) st.gand++;
    if (f && a.ids.length && a.ids.every((id) => a.down.includes(id))) st.allDown++;
    const r = apply(p, a, f);
    if (p.play && g.tsubame(p.play.cards)) st.tsubame++;
    return r;
  };
  await g.run();
  check();
  if (!g.over || !g.winner) throw new Error(`game did not finish (round ${g.round}, ${g.alive().length} left)`);
  if (!g.special && g.alive().length !== 1) throw new Error(`winner but ${g.alive().length} left`);
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
  st.swap += g.logs.filter((l) => l.text.includes('อัญมณีแลกการ์ด')).length;
  st.avalon += g.players.some((p) => p.avalonUsed) ? 1 : 0;
  st.skills += g.players.reduce((s, p) => s + Object.values(p.uses).reduce((a, b) => a + b, 0), 0);
  st.endVP += g.winner.vp;
}
const per = (x) => +(x / N).toFixed(2);
console.log(N, 'games', Object.fromEntries(Object.entries(st).map(([k, v]) => [k, ['clown', 'avalon'].includes(k) ? v : per(v)])));
console.log('Master wins', wins);
console.log('Servant wins', svWins);
