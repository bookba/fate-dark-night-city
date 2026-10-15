// Headless balance check: runs N all-bot matches and prints averages.
// Usage: node scripts/sim.js [games]
import { Game } from '../src/engine.js';
import { botDecide } from '../src/bot.js';

const N = Number(process.argv[2] || 200);
const stats = { deaths: 0, out: 0, grailEarly: 0, phases: 0, grailWin: 0, np: 0, fights: 0 };
const wins = {};
for (let i = 0; i < N; i++) {
  const g = new Game({ decide: botDecide, humanCount: 1 });
  g.human.autopilot = true;
  g.onEvent = (e) => {
    if (e.type !== 'log') return;
    if (e.entry.cls === 'reveal' && e.entry.to === null) stats.np++;
    if (e.entry.text.startsWith('⚔')) stats.fights++;
  };
  await g.run();
  stats.deaths += g.deaths;
  stats.out += g.eliminatedOrder.length;
  stats.phases += g.p + 1;
  if (g.grail.appeared && g.deaths >= 7) stats.grailEarly++;
  if (g.grail.holder === g.winner) stats.grailWin++;
  const k = g.winner.servant?.key ?? 'none';
  wins[k] = (wins[k] || 0) + 1;
}
for (const k in stats) console.log(k.padEnd(12), (stats[k] / N).toFixed(2));
console.log('winner servant', wins);
