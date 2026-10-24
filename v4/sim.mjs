// node v4/sim.mjs [games] — bots-only games to check the rules never crash or break state
import { Game, SERVANTS } from './game.js';
import { botDecide } from './bot.js';

const N = +process.argv[2] || 300;
const st = { shared: 0, fights: 0, alone: 0, reveals: 0, skills: 0, recon: 0, cs: 0, avalon: 0, endVP: 0 };
const wins = {};
const svWins = {};
const deckSize = Object.fromEntries(SERVANTS.map((s) => [s.key, s.deck.length]));
for (let i = 0; i < N; i++) {
  const g = new Game({ decide: async (g, p, k, c) => botDecide(g, p, k, c) });
  g.human.isHuman = false; // the human seat plays as a bot too
  const check = () => {
    for (const p of g.players) {
      if (p.mana < 0 || p.cs < 0 || p.gems < 0 || p.vp < 0 || [p.mana, p.cs, p.gems, p.vp].some(Number.isNaN)) throw new Error(`bad state r${g.round} ${p.name} mana ${p.mana} cs ${p.cs} gems ${p.gems} vp ${p.vp}`);
      const n = p.hand.length + p.deck.length + p.trash.length + (p.play?.cards.filter((c) => !c.skill).length || 0);
      const want = deckSize[p.sv.key] + (p.m.key === 'kuzuki' ? 2 : 0);
      if (n !== want) throw new Error(`lost cards r${g.round} ${g.phase} ${p.name} ${p.hand.length}+${p.deck.length}+${p.trash.length} != ${want}`);
    }
  };
  g.onEvent = (e) => { if (e.type === 'update' || e.type === 'combat') check(); };
  const cut = g.cut.bind(g);
  g.cut = (n) => {
    cut(n);
    const vps = g.alive().map((p) => p.vp).sort((a, b) => b - a);
    const saved = g.alive().some((p) => p.avalonUsed && p.mana === 0);
    if (vps.length > n && vps[n - 1] !== vps[n] && !saved) throw new Error(`cut to ${n} left ${vps}`);
  };
  await g.run();
  check();
  if (!g.over || g.round !== 11) throw new Error(`game did not finish (round ${g.round})`);
  if (g.winner) { wins[g.winner.m.key] = (wins[g.winner.m.key] || 0) + 1; svWins[g.winner.sv.key] = (svWins[g.winner.sv.key] || 0) + 1; } else st.shared++;
  st.fights += g.logs.filter((l) => l.cls === 'fight').length;
  st.alone += g.logs.filter((l) => l.text.includes('อยู่คนเดียว')).length;
  st.reveals += g.logs.filter((l) => l.text.includes('เปิดชื่อจริง')).length;
  st.recon += g.logs.filter((l) => l.text.includes('ลาดตระเวน ได้')).length;
  st.cs += g.logs.filter((l) => l.cls === 'cs').length;
  st.avalon += g.players.some((p) => p.avalonUsed) ? 1 : 0;
  st.skills += g.players.reduce((s, p) => s + Object.values(p.uses).reduce((a, b) => a + b, 0), 0);
  st.endVP += Math.max(...g.players.map((p) => p.vp));
}
const per = (x) => +(x / N).toFixed(2);
console.log(N, 'games', Object.fromEntries(Object.entries(st).map(([k, v]) => [k, k === 'shared' ? v : per(v)])));
console.log('Master wins', wins);
console.log('Servant wins', svWins);
