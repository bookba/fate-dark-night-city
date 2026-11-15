// Rules from design v2.0 (22 Oct 2026). Where the paper still has an open
// question (section 10), the paper's recommended default is used.
// No DOM code here, so the same rules can run headless (v2/sim.mjs).

export const COLORS = ['B', 'A', 'Q'];
export const CNAME = { B: 'Buster', A: 'Art', Q: 'Quick', M: 'Mana', C: 'Curse' };
export const CAP = { B: 12, A: 12, Q: 12, M: 12, C: 5 }; // Mana cap 12: default 9
export const CS_MAX = 3;
export const DAYS = 8;
export const PHASES = [
  { key: 'day1', name: 'กลางวัน 1', night: false },
  { key: 'day2', name: 'กลางวัน 2', night: false },
  { key: 'night1', name: 'กลางคืน 1', night: true },
  { key: 'night2', name: 'กลางคืน 2', night: true },
];

// section 5: max players / reward / closes when fewer players than this are left
export const LOCS = {
  temple: { name: 'วัด', cap: 1, close: 0, reward: 'Mana 4' },
  castle: { name: 'ปราสาท', cap: 1, close: 5, reward: 'โทเคน 4 อัน (หลายสีได้)' },
  school: { name: 'โรงเรียน', cap: 2, close: 3, reward: 'โทเคน 3 อัน (สีเดียว)' },
  matou: { name: 'บ้านมาโต้', cap: 2, close: 0, reward: 'Mana 3 + Curse 1' },
  station: { name: 'สถานี', cap: 3, close: 4, reward: 'โทเคน 2 อัน (หลายสีได้)' },
  church: { name: 'โบสถ์', cap: 4, close: 6, reward: 'Mana 1 + แลก 1 อย่าง' },
};
export const LOC_KEYS = Object.keys(LOCS);
export const SPLIT = { castle: 4, station: 2 }; // tokens split over colors
export const CHURCH_HEAL = 3; // default 5
export const CS_HEAL = 5; // default 5
export const CS_BOOST = 5;

// Only Artoria is in the paper. The other seven reuse her pattern with other token
// colors until the designer writes them (default 10). All HP 10.
const S3 = { B: 'Strength Up', A: 'Wind Magic', Q: 'Swift Strike' };
const sv = (key, cls, name, P, S, np) => ({ key, cls, name, P, S, np, hp: 10 });
export const SERVANTS = [
  sv('artoria', 'Saber', 'Artoria Pendragon', 'B', 'A', 'Excalibur'),
  sv('heracles', 'Berserker', 'Heracles', 'B', 'Q', 'Nine Lives'),
  sv('gilgamesh', 'Archer', 'Gilgamesh', 'B', 'A', 'Gate of Babylon'),
  sv('emiya', 'Archer', 'EMIYA', 'A', 'B', 'Unlimited Blade Works'),
  sv('medea', 'Caster', 'Medea', 'A', 'Q', 'Rule Breaker'),
  sv('cu', 'Lancer', 'Cú Chulainn', 'Q', 'B', 'Gáe Bolg'),
  sv('medusa', 'Rider', 'Medusa', 'Q', 'A', 'Bellerophon'),
  sv('hassan', 'Assassin', 'Hassan of the Cursed Arm', 'Q', 'A', 'Zabaniya'),
];

export function skillsOf(s) {
  return [
    { key: 's1', name: 'Normal Attack', cond: {}, costText: '–', atkText: '1' },
    { key: 's2', name: 'Mana Burst', cond: { [s.P]: 5, M: 2 }, costText: 'Mana ทั้งหมด', atkText: '1 ต่อ Mana ที่จ่าย' },
    { key: 's3', name: s.key === 'artoria' ? 'Wind Magic' : S3[s.S], cond: { [s.S]: 3 }, costText: `${CNAME[s.S]} 3`, atkText: '3' },
    { key: 'np', name: s.np, cond: { [s.P]: 10 }, costText: `${CNAME[s.P]} 5 + โทเคนสีเดียวกัน 5`, atkText: '8', np: true },
  ];
}
export const condText = (c) => Object.entries(c).map(([k, n]) => `${CNAME[k]} ${n}`).join(' + ') || '–';
export const PASSIVE = { cond: 'Buster 1 + Art 1 + Quick 1', text: 'ฟื้น HP 2 ทุกวัน' };

export class Game {
  constructor({ decide, rng = Math.random, humanName = 'คุณ', onEvent = () => {} }) {
    this.decide = decide;
    this.rng = rng;
    this.onEvent = onEvent;
    this.logs = [];
    this.day = 0;
    this.phase = null;
    this.grail = { appeared: false, loc: null, holder: null };
    const names = [humanName, 'โทซากะ', 'มาโต้', 'ไอนซ์เบิร์น', 'โคโตมิเนะ', 'อาร์ชิบอลด์', 'เวลเว็ต', 'อุริว'];
    const svs = this.shuffle([...SERVANTS]);
    this.players = names.map((name, id) => {
      const s = svs[id];
      return { id, name, isHuman: id === 0, sv: s, hp: s.hp, maxHp: s.hp, tok: { B: 0, A: 0, Q: 0, M: 0, C: 0 }, cs: 3, out: false, revealed: false };
    });
    this.human = this.players[0];
    this.over = false;
    this.winner = null;
  }

  shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(this.rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  pick(a) { return a[Math.floor(this.rng() * a.length)]; }
  emit(type, data = {}) { this.onEvent({ type, ...data }); }
  log(text, cls = '') { const e = { text, cls, day: this.day, phase: this.phase?.key }; this.logs.push(e); this.emit('log', { entry: e }); }
  alive() { return this.players.filter((p) => !p.out); }
  open() { const n = this.alive().length; return LOC_KEYS.filter((k) => n >= LOCS[k].close); }
  add(pl, k, n) { pl.tok[k] = Math.max(0, Math.min(CAP[k], pl.tok[k] + n)); }
  heal(pl, n) { pl.hp = Math.min(pl.maxHp, pl.hp + n); }
  // default 13: Buster + Art + Quick + Mana + HP, lowest goes first (Curse does not count)
  score(pl) { return pl.tok.B + pl.tok.A + pl.tok.Q + pl.tok.M + pl.hp; }
  canSpell(pl) { return pl.cs > 0 && pl.tok.C < 5; }

  // ---------- skills ----------
  unlocked(pl, sk) { return Object.entries(sk.cond).every(([k, n]) => pl.tok[k] >= n); }
  // what using the skill costs and how much ATK it gives; null if it cannot be paid
  plan(pl, sk) {
    if (!this.unlocked(pl, sk)) return null;
    const s = pl.sv, t = pl.tok;
    if (sk.key === 's1') return { atk: 1, pay: {} };
    if (sk.key === 's2') return { atk: t.M, pay: { M: t.M } };
    if (sk.key === 's3') { const have = Math.min(3, t[s.S]); const m = 3 - have; return m <= t.M ? { atk: 3, pay: { [s.S]: have, ...(m ? { M: m } : {}) } } : null; }
    // NP: primary 5 + 5 more of any one color (primary allowed, default 18); Mana covers what is short
    let best = null;
    for (const x of COLORS) {
      const left = t[x] - (x === s.P ? 5 : 0);
      const have = Math.max(0, Math.min(5, left));
      const m = 5 - have;
      if (m > t.M) continue;
      if (!best || m < best.m) best = { x, have, m };
    }
    if (!best) return null;
    const pay = { [s.P]: 5 };
    pay[best.x] = (pay[best.x] || 0) + best.have;
    if (best.m) pay.M = best.m;
    return { atk: 8, pay };
  }
  options(pl) { return skillsOf(pl.sv).map((sk) => ({ sk, p: this.plan(pl, sk) })).filter((o) => o.p); }

  // ---------- match ----------
  async run() {
    this.log('สงครามจอกศักดิ์สิทธิ์เริ่มต้น! Master 8 คน', 'sys');
    this.emit('update');
    for (this.day = 1; this.day <= DAYS && !this.over; this.day++) {
      this.startDay();
      for (const ph of PHASES) {
        if (this.checkEnd()) break;
        this.phase = ph;
        await this.runPhase(ph);
      }
    }
    if (!this.over) this.finish();
  }

  // default 21: Mana +1 → random token +1 → daily Passive → Curse 3+ HP −2
  startDay() {
    this.phase = null;
    this.log(`── วันที่ ${this.day} ──`, 'phase');
    for (const pl of this.alive()) {
      this.add(pl, 'M', 1);
      const c = this.pick(COLORS);
      this.add(pl, c, 1);
      const notes = [`Mana +1`, `${CNAME[c]} +1`];
      if (pl.tok.B >= 1 && pl.tok.A >= 1 && pl.tok.Q >= 1 && pl.hp < pl.maxHp) { this.heal(pl, 2); notes.push('Passive ฟื้น HP 2'); }
      if (pl.tok.C >= 3) { pl.hp -= 2; notes.push('Curse 3+ HP −2'); }
      if (pl.isHuman) this.log(`เริ่มวัน: ${notes.join(' · ')}`, 'me');
      if (pl.hp <= 0) this.knockOut(pl, 'Curse');
    }
    this.emit('update');
  }

  async runPhase(ph) {
    // the Grail shows up on a random open location once only 2 are left (default 8)
    if (!this.grail.appeared && this.alive().length <= 2) {
      this.grail.appeared = true;
      this.grail.loc = this.pick(this.open());
      this.log(`✦ จอกศักดิ์สิทธิ์ปรากฏที่${LOCS[this.grail.loc].name}!`, 'grail');
    }
    this.log(`${ph.name}`, 'phase');
    this.stage = 'choose';
    this.emit('phase');
    const open = this.open();
    const order = [...this.alive()].sort((a, b) => a.isHuman - b.isHuman);
    for (const pl of order) pl.choice = this.clean(pl, await this.decide(this, pl, 'loc', { open, phase: ph }), open);
    this.stage = 'result';
    const results = [];
    for (const loc of open) {
      const here = this.alive().filter((p) => p.choice.loc === loc);
      if (!here.length) continue;
      const grailHere = this.grail.appeared && !this.grail.holder && this.grail.loc === loc;
      const holderHere = this.grail.holder && here.includes(this.grail.holder);
      const cap = LOCS[loc].cap;
      if (ph.night && (here.length > cap || ((grailHere || holderHere) && here.length > 1))) {
        results.push(await this.fight(loc, here));
        continue;
      }
      // day overflow: the lowest-ranked get it first; the rest get nothing (default 13)
      const order2 = [...here].map((p) => ({ p, r: this.score(p), t: this.rng() })).sort((a, b) => a.r - b.r || a.t - b.t).map((x) => x.p);
      const got = order2.slice(0, cap), missed = order2.slice(cap);
      for (const p of got) this.reward(p, loc);
      if (grailHere && got.length) this.takeGrail(got[0]);
      results.push({ loc, fight: false, got: got.map((p) => p.id), missed: missed.map((p) => p.id), people: here.map((p) => p.id) });
      this.log(`${LOCS[loc].name}: ${got.map((p) => p.name).join(', ')} ได้รางวัล${missed.length ? ` · ${missed.map((p) => p.name).join(', ')} ไม่ได้ (คนเกิน)` : ''}`, 'loc');
    }
    this.lastResults = results;
    this.emit('update');
    await this.decide(this, this.human, 'phaseEnd', { results, phase: ph });
  }

  clean(pl, c, open) {
    c = c || {};
    const loc = open.includes(c.loc) ? c.loc : this.pick(open);
    const out = { loc };
    if (loc === 'school') out.color = COLORS.includes(c.color) ? c.color : pl.sv.P;
    if (SPLIT[loc]) {
      const n = SPLIT[loc];
      const s = { B: 0, A: 0, Q: 0 };
      let left = n;
      for (const k of COLORS) { const v = Math.max(0, Math.min(left, Math.floor(c.split?.[k] || 0))); s[k] = v; left -= v; }
      s[pl.sv.P] += left;
      out.split = s;
    }
    if (loc === 'church') out.ex = c.ex || null;
    return out;
  }

  reward(pl, loc) {
    const c = pl.choice;
    const got = [];
    if (loc === 'temple') { this.add(pl, 'M', 4); got.push('Mana +4'); }
    if (loc === 'matou') { this.add(pl, 'M', 3); this.add(pl, 'C', 1); got.push('Mana +3', 'Curse +1'); }
    if (loc === 'school') { this.add(pl, c.color, 3); got.push(`${CNAME[c.color]} +3`); }
    if (SPLIT[loc]) for (const k of COLORS) if (c.split[k]) { this.add(pl, k, c.split[k]); got.push(`${CNAME[k]} +${c.split[k]}`); }
    if (loc === 'church') {
      this.add(pl, 'M', 1); got.push('Mana +1');
      const ex = c.ex || '';
      if (ex === 'heal') { const b = pl.hp; this.heal(pl, CHURCH_HEAL); got.push(`ฟื้น HP ${pl.hp - b}`); }
      else if (ex === 'curse' && pl.tok.C >= 1) { this.add(pl, 'C', -1); this.add(pl, 'M', 2); got.push('แลก Curse 1 → Mana 2'); }
      else if (ex === 'cs' && pl.tok.C >= 5 && pl.cs < CS_MAX) { this.add(pl, 'C', -5); pl.cs++; got.push('แลก Curse 5 → Command Spell 1'); }
      else if (ex.startsWith('color:')) {
        const x = ex.slice(6);
        if (COLORS.includes(x) && pl.tok[x] >= 2) { const n = Math.floor(pl.tok[x] / 2); got.push(`แลก ${CNAME[x]} ทั้งหมด (${pl.tok[x]}) → Mana ${n}`); pl.tok[x] = 0; this.add(pl, 'M', n); }
      }
    }
    pl.lastGot = got.join(' · ');
    if (pl.isHuman) this.log(`คุณได้: ${pl.lastGot}`, 'good');
  }

  takeGrail(pl) {
    if (this.grail.holder === pl) return;
    this.grail.holder = pl;
    this.grail.loc = null;
    this.log(`✦ ${pl.name} ครอบครองจอกศักดิ์สิทธิ์!`, 'grail');
  }

  async fight(loc, here) {
    const L = LOCS[loc];
    const plays = [];
    for (const pl of [...here].sort((a, b) => a.isHuman - b.isHuman)) {
      const foes = here.filter((x) => x !== pl);
      plays.push({ pl, ans: await this.decide(this, pl, 'fight', { loc, foes }) || {} });
    }
    const ents = plays.map(({ pl, ans }) => {
      const opts = this.options(pl);
      const o = opts.find((x) => x.sk.key === ans.skill) || opts[0];
      for (const [k, n] of Object.entries(o.p.pay)) pl.tok[k] -= n;
      let spells = [];
      const use = (what) => { if (this.canSpell(pl)) { pl.cs--; spells.push(what); return true; } return false; };
      const boost = ans.boost && use('boost');
      const healed = ans.heal && use('heal');
      if (healed) this.heal(pl, CS_HEAL);
      if (o.sk.np && !pl.revealed) { pl.revealed = true; }
      return { pl, id: pl.id, name: pl.name, skill: o.sk.name, np: !!o.sk.np, atk: o.p.atk + (boost ? CS_BOOST : 0), boost, healed, wantEscape: !!ans.escape, rank: this.score(pl), t: this.rng(), hpBefore: pl.hp };
    });
    // highest ATK wins; a tie goes to the lower-ranked, then at random (default 4)
    ents.sort((a, b) => b.atk - a.atk || a.rank - b.rank || a.t - b.t);
    const win = ents[0];
    for (const e of ents.slice(1)) {
      // "หนี" after the reveal: no HP loss, no Curse, no reward (default 7)
      if (e.wantEscape && this.canSpell(e.pl)) { e.pl.cs--; e.escaped = true; continue; }
      e.dmg = win.atk - e.atk;
      e.pl.hp -= e.dmg;
      this.add(e.pl, 'C', 1);
    }
    // rewards go down the ATK order up to the location's limit (default 3)
    const got = ents.filter((e) => !e.escaped && e.pl.hp > 0).slice(0, L.cap);
    for (const e of got) { this.reward(e.pl, loc); e.got = e.pl.lastGot; }
    const holder = this.grail.holder;
    if ((holder && here.includes(holder) && holder !== win.pl) || (!holder && this.grail.appeared && this.grail.loc === loc)) this.takeGrail(win.pl);
    for (const e of ents) if (e.pl.hp <= 0) { e.died = true; this.knockOut(e.pl, `แพ้ที่${L.name}`, win.pl); }
    for (const e of ents) if (e.np) this.log(`✸ ${e.name} ใช้ NP ${e.skill}: Servant คือ ${e.pl.sv.name} (${e.pl.sv.cls})`, 'reveal');
    const line = ents.map((e) => `${e.name} ${e.atk}`).join(' · ');
    this.log(`⚔ ${L.name}: ${line} → ${win.name} ชนะ`, 'fight');
    for (const e of ents.slice(1)) this.log(e.escaped ? `${e.name} ใช้ Command Spell หนี` : `${e.name} เสีย HP ${e.dmg} · Curse +1`, e.pl.isHuman ? 'bad' : '');
    const res = { loc, fight: true, win: win.id, ents: ents.map(({ pl, ...r }) => r), got: got.map((e) => e.id), people: here.map((p) => p.id) };
    this.emit('fight', { res });
    return res;
  }

  knockOut(pl, why, by = null) {
    if (pl.out) return;
    pl.out = true;
    pl.hp = Math.max(0, pl.hp);
    this.log(`✖ ${pl.name} ตกรอบ (${why})`, 'death');
    if (this.grail.holder === pl) {
      if (by && !by.out) this.takeGrail(by);
      else { this.grail.holder = null; this.grail.loc = this.pick(this.open()); this.log(`✦ จอกหลุดมือ วางอยู่ที่${LOCS[this.grail.loc].name}`, 'grail'); }
    }
  }

  checkEnd() {
    if (this.over) return true;
    if (this.alive().length <= 1) { this.finish(); return true; }
    return false;
  }

  // section 8: the last one standing, or whoever holds the Grail at the end; otherwise everyone loses
  finish() {
    if (this.over) return;
    this.over = true;
    const alive = this.alive();
    if (alive.length === 1) this.winner = alive[0];
    else if (this.grail.holder && !this.grail.holder.out) this.winner = this.grail.holder;
    else this.winner = null;
    this.how = !this.winner ? (this.grail.appeared ? 'ไม่มีใครถือจอกตอนจบ' : 'จอกไม่ปรากฏเพราะผู้เล่นยังเหลือเกิน 2 คน')
      : alive.length === 1 ? 'เหลือรอดคนสุดท้าย' : 'ถือจอกศักดิ์สิทธิ์ตอนจบ';
    this.log(this.winner ? `🏆 ${this.winner.name} ชนะ! (${this.how})` : `ทุกคนแพ้ (${this.how})`, 'grail');
    this.emit('over');
  }
}
