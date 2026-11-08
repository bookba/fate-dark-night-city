// npm run online:test-social — members, the lobby and rooms without playing a game: sign up, log
// in, a saved login, the profile, friends, an invitation, the room list, quick join, the lobby and
// room chats, the host's kick, leaving a room keeps the connection, a member's seat from another
// device, and the members' store surviving a restart (encrypted copy on disk only here).
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';

const PORT = 19000 + Math.floor(Math.random() * 1000);
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'fdnc-social-'));
let server = null;
async function start() {
  server = spawn(process.execPath, [fileURLToPath(new URL('./index.mjs', import.meta.url))], { env: { ...process.env, PORT: String(PORT), DATA_DIR: DATA, GITHUB_TOKEN: '' }, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((r) => server.stdout.once('data', r));
}
const done = (code, msg) => { console.log(msg); server?.kill(); fs.rmSync(DATA, { recursive: true, force: true }); process.exit(code); };
setTimeout(() => done(1, 'FAIL: took more than 60 s'), 60_000).unref();
let n = 0;
const check = (ok, what) => { n++; if (!ok) done(1, `FAIL: ${what}`); };

function client() {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://localhost:${PORT}/ws`);
    const got = [];
    const waiters = [];
    const c = {
      ws, got,
      send: (m) => ws.send(JSON.stringify(m)),
      pos: 0, // messages before this one were looked at already
      // the next message that matches, after the last one waited for (or from the start, old=true)
      wait(pred, what = 'a message', old = false) {
        for (let i = old ? 0 : c.pos; i < got.length; i++) if (pred(got[i])) { if (!old) c.pos = i + 1; return Promise.resolve(got[i]); }
        return new Promise((res, rej) => { const w = { pred, res }; waiters.push(w); setTimeout(() => rej(new Error(`no ${what}`)), 4000); });
      },
    };
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      got.push(m);
      for (const w of [...waiters]) if (w.pred(m)) { waiters.splice(waiters.indexOf(w), 1); c.pos = got.length; w.res(m); }
    };
    ws.onopen = () => resolve(c);
  });
}
const t = (k) => (m) => m.t === k;

try {
  await start();
  const a = await client(), b = await client(), g = await client();
  a.send({ t: 'hello' }); await a.wait(t('me'));
  // signing up
  a.send({ t: 'signup', user: 'al', pass: 'secret12' }); check((await a.wait(t('autherr'))).msg, 'a short username is refused');
  a.send({ t: 'signup', user: 'alice', pass: '123' }); check((await a.wait(t('autherr'))).msg, 'a short password is refused');
  a.send({ t: 'signup', user: 'alice', pass: 'secret12', name: 'อลิซ' });
  const am = await a.wait((m) => m.t === 'me' && m.me);
  check(am.token && am.me.name === 'อลิซ' && am.me.stats.games === 0, 'signed up');
  b.send({ t: 'signup', user: 'Alice', pass: 'secret12' }); check((await b.wait(t('autherr'))).msg, 'the same name in other letters is refused');
  b.send({ t: 'signup', user: 'bob', pass: 'secret12', name: 'บ็อบ' });
  const bm = await b.wait((m) => m.t === 'me' && m.me);
  // logging in
  g.send({ t: 'login', user: 'alice', pass: 'wrong123' }); check((await g.wait(t('autherr'))).msg, 'a wrong password is refused');
  g.send({ t: 'login', user: 'ALICE', pass: 'secret12' }); const gl = await g.wait((m) => m.t === 'me' && m.me);
  check(gl.me.uid === am.me.uid, 'logged in with the name in other letters');
  g.send({ t: 'logout' }); await g.wait((m) => m.t === 'me' && !m.me);
  g.send({ t: 'hello', token: gl.token }); check((await g.wait(t('me'))).expired, 'a logged out token no longer works');
  // the profile
  a.send({ t: 'profile.set', name: 'Alice!', bio: 'ชอบริน', avatar: 'm:rin' });
  const a2 = await a.wait((m) => m.t === 'me' && m.me?.name === 'Alice!');
  check(a2.me.avatar === 'm:rin' && a2.me.bio === 'ชอบริน', 'profile saved');
  a.send({ t: 'profile.set', avatar: '<script>' }); a.send({ t: 'profile', user: 'alice' });
  check((await a.wait(t('profile'))).p.avatar === 'm:rin', 'a picture not on the list is ignored');
  // friends
  b.send({ t: 'friend.add', user: 'alice' });
  const req = await a.wait(t('friendreq'));
  check(req.from.user === 'bob', 'the friend request arrives');
  a.send({ t: 'friend.ok', uid: bm.me.uid });
  const fl = await b.wait((m) => m.t === 'friends' && m.list.length === 1);
  check(fl.list[0].user === 'alice' && fl.list[0].on, 'friends, and online');
  // the room list, quick join, invitation, chat
  b.send({ t: 'rooms', on: true }); await b.wait(t('rooms'));
  a.send({ t: 'create', title: 'ห้องของอลิซ', pub: true });
  const aj = await a.wait(t('joined'));
  const list = await b.wait((m) => m.t === 'rooms' && m.list.some((r) => r.code === aj.code));
  check(list.list[0].title === 'ห้องของอลิซ' && list.list[0].n === 1, 'the room is in the list');
  a.send({ t: 'invite', uid: bm.me.uid });
  check((await b.wait(t('invited'))).code === aj.code, 'the invitation arrives');
  g.send({ t: 'quick', name: 'guest' });
  check((await g.wait(t('joined'))).code === aj.code, 'quick join takes the waiting room');
  b.send({ t: 'join', code: aj.code });
  await b.wait(t('joined'));
  const lob = await a.wait((m) => m.t === 'lobby' && m.seats.length === 3);
  check(lob.seats[1].name === 'guest' && lob.seats[2].user === 'bob' && lob.seats[2].avatar, 'members and guests in the room');
  g.send({ t: 'chat', ch: 'room', text: 'hello <b>all</b>' });
  const ch = await b.wait((m) => m.t === 'chat' && m.ch === 'room');
  check(ch.msg.text === 'hello ball/b' || !ch.msg.text.includes('<'), 'room chat, without tags');
  g.send({ t: 'chat', ch: 'lobby', text: 'hi' }); check((await g.wait(t('note'))).msg, 'guests cannot use the lobby chat');
  const c2 = await client(); c2.send({ t: 'hello', token: bm.token }); c2.send({ t: 'rooms', on: true }); await c2.wait(t('rooms'));
  a.send({ t: 'chat', ch: 'lobby', text: 'lobby hi' });
  check((await c2.wait((m) => m.t === 'chat' && m.ch === 'lobby')).msg.from.user === 'alice', 'the lobby chat');
  // bob on a second device takes his seat; the first page is told, and keeps its connection
  c2.send({ t: 'join', code: aj.code });
  await c2.wait(t('joined'));
  check((await b.wait((m) => m.t === 'error' && m.gone)).code === aj.code, 'the old page leaves the room');
  b.send({ t: 'friends' }); check((await b.wait(t('friends'))).list.length === 1, 'the old page is still connected');
  check((await a.wait((m) => m.t === 'lobby' && m.seats.length === 3 && m.seats[2].on)), 'still 3 seats');
  // the host kicks the guest; settings
  a.send({ t: 'kick', i: 1 });
  check((await g.wait((m) => m.t === 'error' && m.gone)).msg, 'the kicked guest is told');
  a.send({ t: 'settings', title: 'ใหม่', pub: false });
  check((await a.wait((m) => m.t === 'lobby' && m.title === 'ใหม่' && !m.pub && m.seats.length === 2)), 'settings and the kick');
  // leaving keeps the connection: the guest can create another room
  g.send({ t: 'create', name: 'guest' }); check((await g.wait(t('joined'))).code !== aj.code, 'a new room after a kick');
  // the ranking and a password change
  a.send({ t: 'top' }); check(Array.isArray((await a.wait(t('top'))).list), 'the ranking');
  a.send({ t: 'passwd', old: 'nope', pass: 'newpass1' }); check((await a.wait(t('autherr'))).msg, 'a wrong old password');
  a.send({ t: 'passwd', old: 'secret12', pass: 'newpass1' }); const np = await a.wait((m) => m.t === 'me' && m.token);
  check(np.token && np.token !== am.token, 'password changed');
  // a restart: the members and friends are still there
  await new Promise((r) => setTimeout(r, 500));
  server.kill('SIGTERM'); await new Promise((r) => server.once('exit', r));
  await start();
  const z = await client();
  z.send({ t: 'login', user: 'alice', pass: 'newpass1' });
  const zm = await z.wait(t('me'));
  check(zm.me?.name === 'Alice!', 'the member is kept after a restart');
  check((await z.wait(t('friends'), 'friends', true)).list[0]?.user === 'bob', 'friends kept after a restart');
  done(0, `OK: ${n} checks`);
} catch (e) { done(1, `FAIL after ${n} checks: ${e.message}`); }
