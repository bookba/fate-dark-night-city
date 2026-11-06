// npm run online:test — starts the server with a 2-second thinking time, then 3 pretend people
// play a whole game in one room (4 bots fill the other seats). Each answers from its own page copy
// with the bot's choice, one lets the time run out now and then, one drops out and comes back.
// Checks: everyone reaches the same end, nobody's copy shows another Master's hand or hidden Servant.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Mirror } from '../v5/net.js';
import { botDecide } from '../v5/bot.js';

const PORT = 18000 + Math.floor(Math.random() * 1000);
const URL_ = `ws://localhost:${PORT}/ws`;
const N = 3;
const server = spawn(process.execPath, [fileURLToPath(new URL('./index.mjs', import.meta.url))], { env: { ...process.env, PORT: String(PORT), THINK_MS: '2000' }, stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((r) => server.stdout.once('data', r));
const stop = (code, msg) => { if (msg) console.log(msg); server.kill(); process.exit(code); };
setTimeout(() => stop(1, 'FAIL: the game did not end within 15 minutes'), 15 * 60_000).unref();

let code = null;
const ends = [];
let msgs = 0, bytes = 0, timeouts = 0, rejoined = false;

function client(i, resume = null) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(URL_);
    const mir = new Mirror();
    const answered = new Set();
    let token = null, gameNo = 0;
    ws.onopen = () => ws.send(JSON.stringify(resume ? { t: 'resume', code, token: resume } : i === 0 ? { t: 'create', name: 'host' } : { t: 'join', code, name: `p${i}` }));
    ws.onerror = (e) => reject(e);
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      msgs++; bytes += ev.data.length;
      if (m.t === 'error') reject(new Error(m.msg));
      if (m.t === 'joined') { token = m.token; if (i === 0) code = m.code; resolve({ ws, token: () => token }); }
      if (m.t !== 'state') return;
      if (m.game !== gameNo) { gameNo = m.game; }
      const root = mir.apply(m.data, m.full);
      const g = root.g, me = g.players[m.me];
      if (!me.isHuman || g.human !== me || g.players.filter((p) => p.isHuman).length !== 1) stop(1, `FAIL: page ${i} does not see itself as the one human`);
      if (!g.over) {
        for (const q of g.players) {
          if (q === me) continue;
          if (q.hand.some((c) => !c.hidden) || q.deck.some((c) => !c.hidden)) stop(1, `FAIL: page ${i} sees ${q.name}'s hand or deck`);
          if (!q.revealed && q.sv.key !== '?') stop(1, `FAIL: page ${i} sees ${q.name}'s hidden Servant`);
        }
      }
      // one person drops out in round 2 and comes back a few seconds later
      if (i === 2 && !resume && !rejoined && g.round === 2) {
        rejoined = true;
        const tk = token;
        ws.close();
        setTimeout(() => client(2, tk).catch((e) => stop(1, `FAIL: rejoin ${e.message}`)), 3000);
        return;
      }
      if (m.ask && !answered.has(m.ask.id)) {
        answered.add(m.ask.id);
        if (m.ask.kind === 'combatEnd') { ws.send(JSON.stringify({ t: 'answer', id: m.ask.id, v: null })); return; }
        if (i === 1 && Math.random() < 0.15) { timeouts++; return; } // let the time run out
        const v = botDecide(g, me, m.ask.kind, root.ctx);
        ws.send(JSON.stringify({ t: 'answer', id: m.ask.id, v: v ?? null }));
      }
      if (g.over && !ends[i]) {
        ends[i] = `${g.winner?.name} round ${g.round}`;
        if (ends.filter(Boolean).length === N) {
          const same = new Set(ends).size === 1;
          stop(same ? 0 : 1, `${same ? 'OK' : 'FAIL'}: ${ends.join(' | ')} · ${msgs} messages, ${(bytes / 1e6).toFixed(1)} MB, ${timeouts} timeouts, rejoined ${rejoined}`);
        }
      }
    };
  });
}

const host = await client(0);
for (let i = 1; i < N; i++) await client(i);
host.ws.send(JSON.stringify({ t: 'pick', master: 'rin' }));
host.ws.send(JSON.stringify({ t: 'start' }));
