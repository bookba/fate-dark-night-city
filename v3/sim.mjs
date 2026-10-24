// node v3/sim.mjs [games] [full|casual] — bots-only games to check the rules never crash
import { Game } from './game.js';
import { botDecide } from './bot.js';
const N = +process.argv[2] || 300;
const mode = process.argv[3] || 'full';
const st = { shared: 0, rounds: 0, fights: 0, alone: 0, reveals: 0, maxRes: 0, mana: 0 };
const wins = {};
const svWins = {};
for (let i = 0; i < N; i++) {
  const g = new Game({ decide: async (g, p, k, c) => botDecide(g, p, k, c), mode });
  g.human.isHuman = false; // the human seat plays as a bot too
  await g.run();
  if (!g.over) throw new Error('game did not finish');
  if (g.winner) { wins[g.winner.m.key] = (wins[g.winner.m.key] || 0) + 1; svWins[g.winner.sv.key] = (svWins[g.winner.sv.key] || 0) + 1; } else st.shared++;
  st.rounds += g.round;
  st.fights += g.logs.filter((l) => l.cls === 'fight').length;
  st.alone += g.logs.filter((l) => l.text.includes('อยู่คนเดียว')).length;
  st.reveals += g.logs.filter((l) => l.cls === 'reveal' && l.text.includes('เปิดชื่อจริง')).length;
  st.maxRes += Math.max(...g.players.map((p) => p.res));
  st.mana += g.players.reduce((s, p) => s + p.mana, 0) / g.players.length;
  for (const p of g.players) {
    if (p.mana < 0 || p.cs < 0 || p.gems < 0 || Number.isNaN(p.res)) throw new Error(`bad state ${p.name} mana ${p.mana} cs ${p.cs} gems ${p.gems} res ${p.res}`);
    if (p.hand.length + p.deck.length + p.trash.length !== p.sv.deck.length + (p.m.key === 'kuzuki' ? 1 : 0)) throw new Error(`lost cards ${p.name} ${p.hand.length}+${p.deck.length}+${p.trash.length}`);
  }
}
const per = (x) => +(x / N).toFixed(2);
console.log(N, mode, 'games', { shared: st.shared, rounds: per(st.rounds), fights: per(st.fights), alone: per(st.alone), reveals: per(st.reveals), topRes: per(st.maxRes), endMana: per(st.mana) });
console.log('Master wins', wins);
console.log('Servant wins', svWins);
