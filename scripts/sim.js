// Headless balance check: runs N all-bot matches and prints averages.
// Usage: node scripts/sim.js [games]
import { Game } from '../src/engine.js';
import { botDecide } from '../src/bot.js';

const N = Number(process.argv[2] || 200);
const stats = { deaths: 0, out: 0, days: 0, grailEarly: 0, grailWin: 0, fights: 0, reveals: 0, alters: 0, finalAlive: 0 };
const wins = {};
const areas = {};
for (let i = 0; i < N; i++) {
  const g = new Game({ decide: botDecide, humanCount: 1 });
  g.human.autopilot = true;
  g.onEvent = (e) => {
    if (e.type !== 'log') return;
    if (e.entry.cls === 'reveal') stats.reveals++;
    if (e.entry.text.startsWith('กองกลางหมดแล้ว')) stats.alters++;
    if (e.entry.text.startsWith('⚔')) stats.fights++;
    if (e.entry.cls === 'map') { const a = e.entry.text.split(':')[0]; areas[a] = (areas[a] || 0) + e.entry.text.split(',').length; }
  };
  await g.run();
  stats.deaths += g.deaths;
  stats.out += g.eliminatedOrder.length;
  stats.days += g.day;
  stats.finalAlive += g.alive().length;
  if (g.grail.appeared && g.grail.appearedDay < 8) stats.grailEarly++;
  if (g.grail.holder === g.winner) stats.grailWin++;
  const k = g.winner.servant?.key ?? 'none';
  wins[k] = (wins[k] || 0) + 1;
}
for (const k in stats) console.log(k.padEnd(12), (stats[k] / N).toFixed(2));
console.log('area visits/game', Object.fromEntries(Object.entries(areas).map(([k, v]) => [k, (v / N).toFixed(1)])));
console.log('winner servant', wins);
