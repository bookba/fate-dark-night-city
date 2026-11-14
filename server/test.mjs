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
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'fdnc-test-')); // a members' store of its own, no GitHub
const server = spawn(process.execPath, [fileURLToPath(new URL('./index.mjs', import.meta.url))], { env: { ...process.env, PORT: String(PORT), THINK_MS: '2000', DATA_DIR: DATA, GITHUB_TOKEN: '' }, stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((r) => server.stdout.once('data', r));
// the server saves its members when it is stopped (SIGTERM), so the test's folder goes once it has exited
let stopping = false;
const stop = (code, msg) => {
  if (msg) console.log(msg);
  if (stopping) return;
  stopping = true;
  const end = () => { try { fs.rmSync(DATA, { recursive: true, force: true }); } catch { /* a temp folder: left to the system */ } process.exit(code); };
  if (server.exitCode !== null || server.signalCode !== null) end(); else { server.once('exit', end); server.kill(); }
};
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
    // the host is a member (its game goes into its profile); the others are guests
    ws.onopen = () => {
      if (i === 0 && !resume) ws.send(JSON.stringify({ t: 'signup', user: 'host_test', pass: 'secret12', name: 'host' }));
      ws.send(JSON.stringify(resume ? { t: 'resume', code, token: resume } : i === 0 ? { t: 'create', name: 'host' } : { t: 'join', code, name: `p${i}` }));
    };
    ws.onerror = (e) => reject(e);
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      msgs++; bytes += ev.data.length;
      if (m.t === 'error') reject(new Error(m.msg));
      if (m.t === 'autherr') stop(1, `FAIL: sign up ${m.msg}`);
      if (m.t === 'profile') {
        const st = m.p?.stats;
        const ok = st?.games === 1 && m.p.hist.length === 1 && m.p.hist[0].n === 7;
        stop(ok ? 0 : 1, `${ok ? 'OK' : 'FAIL'}: the host's profile after the game: ${JSON.stringify(st)} · ${JSON.stringify(m.p?.hist?.[0])}`);
      }
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
          console.log(`${same ? 'OK' : 'FAIL'}: ${ends.join(' | ')} · ${msgs} messages, ${(bytes / 1e6).toFixed(1)} MB, ${timeouts} timeouts, rejoined ${rejoined}`);
          if (!same) stop(1);
          setTimeout(() => host.ws.send(JSON.stringify({ t: 'profile', user: 'host_test' })), 500); // the match history has the game
        }
      }
    };
  });
}

const host = await client(0);
for (let i = 1; i < N; i++) await client(i);
host.ws.send(JSON.stringify({ t: 'pick', master: 'rin' }));
host.ws.send(JSON.stringify({ t: 'start' }));
