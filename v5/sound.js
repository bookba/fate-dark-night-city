// Sound effects (paper 4.6 item 23), made with the Web Audio API: no sound files, nothing to load.
// Off until the first tap (browsers block sound before it) and at the level in the settings (item 24).
// A sound replaced on the admin page (server/admin.mjs) plays its uploaded file instead, at the same level.
import { OVR } from './custom.js';

let ctx = null;
let out = null;
let level = 2; // 0 off · 1 low · 2 medium · 3 loud
const GAIN = [0, 0.16, 0.36, 0.7];
const last = {}; // the same sound twice within 70 ms plays once

export function setSound(l) {
  level = l;
  if (out) out.gain.value = GAIN[l] || 0;
}

function ac() {
  if (!level) return null;
  try {
    if (!ctx) {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      ctx = new C();
      out = ctx.createGain();
      out.gain.value = GAIN[level];
      out.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  } catch { return null; }
}
// the first tap anywhere opens the sound
export function unlockSound() { if (level && ac()) for (const n of Object.keys(OVR.sounds || {})) fileFor(n); } // and start loading the uploaded sounds

// one note: a frequency (or a slide to a second one) with a quick rise and a fall
function tone(c, t, f, d, o = {}) {
  const { type = 'sine', vol = 0.3, to = null, at = 0.006 } = o;
  const os = c.createOscillator();
  const g = c.createGain();
  os.type = type;
  os.frequency.setValueAtTime(f, t);
  if (to) os.frequency.exponentialRampToValueAtTime(to, t + d);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + at);
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  os.connect(g).connect(out);
  os.start(t);
  os.stop(t + d + 0.02);
}
// a burst of noise through a filter: swishes, flicks and drum skins
let buf = null;
function noise(c, t, d, o = {}) {
  const { vol = 0.25, f = 1200, to = null, q = 1, kind = 'bandpass' } = o;
  if (!buf) {
    buf = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
  }
  const s = c.createBufferSource();
  s.buffer = buf;
  const fl = c.createBiquadFilter();
  fl.type = kind;
  fl.frequency.setValueAtTime(f, t);
  if (to) fl.frequency.exponentialRampToValueAtTime(to, t + d);
  fl.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  s.connect(fl).connect(g).connect(out);
  s.start(t);
  s.stop(t + d + 0.02);
}

const SFX = {
  // your turn: two bright notes
  turn: (c, t) => { tone(c, t, 659, 0.22, { type: 'triangle', vol: 0.32 }); tone(c, t + 0.13, 988, 0.34, { type: 'triangle', vol: 0.3 }); },
  // a piece set down on the board
  place: (c, t) => { tone(c, t, 210, 0.14, { to: 95, vol: 0.45 }); noise(c, t, 0.05, { f: 2400, vol: 0.12 }); },
  // a piece moving along an arrow
  move: (c, t) => { noise(c, t, 0.32, { f: 380, to: 1900, q: 0.8, vol: 0.22 }); tone(c, t + 0.22, 240, 0.12, { to: 120, vol: 0.3 }); },
  // cards laid or used
  card: (c, t) => { noise(c, t, 0.07, { f: 3200, kind: 'highpass', vol: 0.2 }); noise(c, t + 0.07, 0.06, { f: 2600, kind: 'highpass', vol: 0.14 }); },
  // a card picked in a pop-up
  pick: (c, t) => { tone(c, t, 1320, 0.05, { type: 'square', vol: 0.05 }); },
  // a new phase of the round
  phase: (c, t) => { tone(c, t, 784, 0.5, { vol: 0.16 }); tone(c, t, 1568, 0.35, { vol: 0.05 }); },
  // the fights begin
  fight: (c, t) => { tone(c, t, 82, 0.4, { to: 46, vol: 0.6 }); noise(c, t, 0.18, { f: 900, vol: 0.2 }); tone(c, t + 0.12, 523, 0.18, { type: 'sawtooth', vol: 0.06 }); tone(c, t + 0.12, 784, 0.25, { type: 'sawtooth', vol: 0.05 }); },
  // your fight won / lost
  win: (c, t) => { [523, 659, 784, 1047].forEach((f, i) => tone(c, t + i * 0.08, f, 0.3, { type: 'triangle', vol: 0.26 })); },
  lose: (c, t) => { [392, 330, 262].forEach((f, i) => tone(c, t + i * 0.12, f, 0.32, { type: 'triangle', vol: 0.22 })); },
  // a true name revealed
  reveal: (c, t) => { [880, 1175, 1480, 1760].forEach((f, i) => tone(c, t + i * 0.05, f, 0.6, { vol: 0.1 })); noise(c, t, 0.5, { f: 5000, kind: 'highpass', vol: 0.05 }); },
  // a Command Spell
  cs: (c, t) => { tone(c, t, 330, 0.4, { to: 1320, type: 'sawtooth', vol: 0.08 }); tone(c, t + 0.05, 660, 0.35, { vol: 0.14 }); },
  // a Master out of the war
  out: (c, t) => { tone(c, t, 110, 1.4, { vol: 0.42, at: 0.01 }); tone(c, t, 165, 1.1, { vol: 0.12 }); tone(c, t, 233, 0.8, { vol: 0.06 }); },
  // the Grail: the end of the war
  grail: (c, t) => { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(c, t + i * 0.11, f, 0.7, { type: 'triangle', vol: 0.22 })); tone(c, t + 0.55, 262, 1.2, { vol: 0.2 }); },
  // a fixed sample for the settings
  test: (c, t) => SFX.turn(c, t),
};

export const SFX_NAMES = Object.keys(SFX);

// the uploaded sounds, fetched and decoded once each
const files = {};
function fileFor(name) {
  const u = OVR.sounds?.[name] || (name === 'test' ? OVR.sounds?.turn : null);
  if (!u || !ctx) return null;
  if (!files[u]) {
    files[u] = { buf: null };
    fetch(u).then((r) => r.arrayBuffer()).then((a) => new Promise((ok, no) => ctx.decodeAudioData(a, ok, no)))
      .then((b) => { files[u].buf = b; }, () => { files[u].bad = true; });
  }
  return files[u];
}
function playFile(c, f) {
  const s = c.createBufferSource();
  s.buffer = f.buf;
  s.connect(out);
  s.start(c.currentTime + 0.01);
}
// the admin page plays a sound file (a URL) at the sound level
export async function playUrl(u) {
  const c = ac();
  if (!c) return;
  const a = await (await fetch(u)).arrayBuffer();
  const buf = await new Promise((ok, no) => c.decodeAudioData(a, ok, no));
  playFile(c, { buf });
}

export function sfx(name) {
  if (!level || !SFX[name]) return;
  const now = performance.now();
  if (now - (last[name] || 0) < 70) return;
  last[name] = now;
  const c = ac();
  if (!c) return;
  const f = fileFor(name);
  if (f && !f.bad) { if (f.buf) playFile(c, f); return; } // still loading: this once, quiet
  try { SFX[name](c, c.currentTime + 0.01); } catch { /* a browser without some node: stay quiet */ }
}
// the original drawn sound, even when replaced (the admin page compares the two)
export function sfxOriginal(name) { const c = ac(); if (c && SFX[name]) SFX[name](c, c.currentTime + 0.01); }
