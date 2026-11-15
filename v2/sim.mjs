// node v2/sim.mjs [games] — bots-only games to check the rules never crash
import { Game } from './game.js';
import { botDecide } from './bot.js';
const N = +process.argv[2] || 500;
const st = { win: 0, none: 0, last: 0, grail: 0, days: 0, fights: 0, alive: 0 };
for (let i = 0; i < N; i++) {
  const g = new Game({ decide: async (g, pl, k, c) => botDecide(g, pl, k, c) });
  await g.run();
  if (g.winner) { st.win++; g.how.includes('คนสุดท้าย') ? st.last++ : st.grail++; } else st.none++;
  st.days += Math.min(g.day, 8);
  st.alive += g.alive().length;
  st.fights += g.logs.filter((l) => l.cls === 'fight').length;
  for (const p of g.players) for (const k in p.tok) if (p.tok[k] < 0 || Number.isNaN(p.tok[k])) throw new Error('bad tok ' + k);
}
console.log(N, 'games', { ...st, days: st.days / N, fights: st.fights / N, alive: st.alive / N });
