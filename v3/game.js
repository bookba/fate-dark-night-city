// Rules from design v3.0 (Dominate Grail War, 24 Oct 2026). Open questions in section 13
// use the paper's recommended defaults: 7 players, turns in seat order like the original,
// the Japanese reports over the wiki, NP/skill cards need 8+ mana, and a casual mode.
// Card numbers are placeholders (data.js). No DOM code here, so the rules run headless (v3/sim.mjs).
import {
  AREAS, PATH, STEP_COST, WORKSHOP_MANA, TERRAIN, RECON_RES, HAND, NP_MANA, ROUNDS, CASUAL,
  CS_MANA, CS_POWER, CS_RES, MASTERS, SERVANTS, KANSHOU, SNAKE, EVENTS, SITUATIONS, CLIMAX,
} from './data.js';

export * from './data.js';

let uid = 0;
const inst = (spec, extra = {}) => ({ ...spec, uid: ++uid, ...extra });
const FIELDS = ['miyama', 'shinto'];

export class Game {
  constructor({ decide, rng = Math.random, onEvent = () => {}, mode = 'full', humanMaster = null }) {
    this.decide = decide;
    this.rng = rng;
    this.onEvent = onEvent;
    this.mode = mode;
    this.logs = [];
    this.round = 0;
    this.phase = null;
    this.climax = false;
    this.over = false;
    this.winner = null;
    this.results = [];
    const svs = this.shuffle([...SERVANTS]);
    let h = MASTERS.findIndex((m) => m.key === humanMaster);
    if (h < 0) h = Math.floor(rng() * MASTERS.length);
    this.players = MASTERS.map((m, id) => {
      const sv = svs[id];
      const deck = sv.deck.map((s) => inst(s));
      if (m.key === 'kuzuki') deck.push(inst(SNAKE));
      return {
        id, m, name: m.short, isHuman: id === h, sv, deck: this.shuffle(deck), hand: [], trash: [],
        np: sv.np.map((s) => inst(s, { np: true, used: false, gone: false })), swords: new Set(),
        mana: m.mana + (mode === 'casual' ? CASUAL.startMana : 0), cs: m.cs, res: 0, gems: m.gems || 0, jewel: false,
        revealed: false, out: false, at: null, terrain: 0, play: null, linger: 0, avalon: m.key === 'shirou',
      };
    });
    this.human = this.players[h];
    this.start = Math.floor(rng() * this.players.length); // rock-paper-scissors
    this.evDeck = this.shuffle(EVENTS.map((e) => ({ ...e })));
    this.evUsed = [];
    this.fieldEv = { miyama: [], shinto: [] };
    this.shintoOpen = false;
    // 10 normal situation cards, 2 removed unseen, 8 used [RP]; casual uses 4
    this.sits = this.shuffle([...SITUATIONS]).slice(0, ROUNDS[mode]);
    this.sit = null;
    this.engaged = new Set();
    this.turn = null;
  }

  shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(this.rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  emit(type, data = {}) { this.onEvent({ type, ...data }); }
  log(text, cls = '') { const e = { text, cls, round: this.round }; this.logs.push(e); this.emit('log', { entry: e }); }
  alive() { return this.players.filter((p) => !p.out); }
  // seat order from the start player, clockwise
  order() { const n = this.players.length; const out = []; for (let i = 0; i < n; i++) { const p = this.players[(this.start + i) % n]; if (!p.out) out.push(p); } return out; }
  here(area) { return this.alive().filter((p) => p.at === area); }
  fx(key) { return this.sit?.fx?.[key] || 0; }
  // Sakura's Hidden Secret: in the climax, not first in results → mana without limit [4G]
  infinite(p) { return this.climax && p.m.key === 'sakura' && this.alive().some((q) => q !== p && q.res >= p.res); }
  maxCards(p) { return 2 + (this.infinite(p) ? 1 : 0); }

  drawTo(p, n) {
    while (p.hand.length < n) {
      if (!p.deck.length) { if (!p.trash.length) break; p.deck = this.shuffle(p.trash); p.trash = []; }
      p.hand.push(p.deck.pop());
    }
  }

  // ---------- movement (section 5) ----------
  stepCost(p, i) { if (i === 0 && p.m.key === 'kuzuki') return 0; return Math.max(0, STEP_COST[i] - this.fx('moveCut')); }
  walkCost(p, from, to) { let c = 0; for (let i = PATH.indexOf(from); i < PATH.indexOf(to); i++) c += this.stepCost(p, i); return c; }
  reconFree(p) { return !this.alive().some((q) => q !== p && q.at === 'recon'); }
  moveOptions(p, mana = p.mana, cs = p.cs) {
    const opts = [{ to: p.at, how: 'stay', cost: 0 }];
    const i = PATH.indexOf(p.at);
    if (!this.engaged.has(p.at)) {
      for (const to of PATH.slice(i + 1)) {
        if (to === 'recon' && !this.reconFree(p)) continue;
        const cost = this.walkCost(p, p.at, to);
        if (cost <= mana) opts.push({ to, how: 'walk', cost });
      }
    }
    if (p.m.key === 'kirei' && !p.revealed && p.at !== 'recon' && this.reconFree(p) && mana >= 2) opts.push({ to: 'recon', how: 'kirei', cost: 2 });
    if (cs > 0) for (const to of PATH.slice(1)) if (to !== p.at && (to !== 'recon' || this.reconFree(p))) opts.push({ to, how: 'cs', cost: 0 });
    return opts;
  }

  enter(p, to, how) {
    if (p.at !== to) p.terrain = 0; // a terrain token stays with the battlefield it was won on (demo default)
    p.at = to;
    if (to === 'recon') { const n = RECON_RES + this.fx('recon'); p.res += n; this.log(`${p.name} ลาดตระเวน ได้แต้มผลงาน ${n}`, p.isHuman ? 'good' : ''); }
    if (to === 'miyama' && p.m.key === 'shinji') { p.mana += 1; p.res += 1; }
    if (how === 'cs') this.log(`${p.name} ใช้ Command Spell ย้ายไป${AREAS[to].name}`, 'cs');
  }

  // ---------- cards (section 7.3) ----------
  usableNp(p, mana = p.mana) {
    if (!this.infinite(p) && mana < NP_MANA) return [];
    return p.np.filter((c) => !c.gone && !(c.fx.hidden && p.revealed));
  }
  tsubame(p, c) { return c.fx?.tsubame && p.swords.has('One Sword') && p.swords.has('Two Swords'); }

  // power before opponents' cards are known: what goes on the power track
  cardPower(p, c, extra = {}) {
    if (c.down) return 0;
    let pw = c.power;
    if (this.tsubame(p, c)) pw += c.fx.tsubame;
    if (c.fx?.climax && this.climax) pw += c.fx.climax;
    if (extra.zero && (c.fx?.allTypes || c.type === extra.zero)) return 0;
    const types = c.fx?.allTypes ? ['S', 'A', 'M'] : [c.type];
    for (const f of [this.sit?.fx, ...(extra.events || []).map((e) => e.fx)]) if (f?.up && types.includes(f.up)) pw += f.n;
    return pw;
  }

  terrainOf(p, cards, extra = {}) {
    let t = p.terrain;
    if (!t || extra.noTerrain) return 0;
    t += this.fx('terrain');
    for (const c of cards) if (!c.down && c.fx?.terrainMul && !extra.cancelled) t *= c.fx.terrainMul;
    return t;
  }

  powerOf(p, play, extra = {}) {
    const cards = play.cards;
    const parts = [];
    const base = cards.reduce((s, c) => s + this.cardPower(p, c, extra), 0);
    parts.push(['การ์ด', base]);
    const t = this.terrainOf(p, cards, extra);
    if (t) parts.push(['ได้เปรียบพื้นที่', t]);
    if (play.cs2) parts.push(['Command Spell', play.cs2 * CS_POWER]);
    if (play.gems) parts.push(['อัญมณี (Gandr)', play.gems]);
    if (p.m.key === 'kirei' && p.revealed) parts.push(['Proxy', 2]);
    if (!extra.cancelled) for (const c of cards) if (!c.down && c.fx?.ruleBreaker) parts.push(['Rule Breaker', c.fx.ruleBreaker]);
    if (extra.underdog) parts.push(['อีเวนต์: แต้มน้อยสุด', extra.underdog]);
    return { total: parts.reduce((s, [, n]) => s + n, 0), parts };
  }

  // check and fix an answer for the card step; returns the cards in play order
  cleanCards(p, ans, field) {
    ans = ans || {};
    if (!field) {
      const ids = (ans.ids || []).filter((id) => p.hand.some((c) => c.uid === id)).slice(0, 2);
      for (const c of p.hand) if (ids.length < Math.min(2, p.hand.length) && !ids.includes(c.uid)) ids.push(c.uid);
      return { ids, down: ids, cs2: 0, gems: 0, kb: false, cs4: false };
    }
    let mana = p.mana;
    const cs4 = !!ans.cs4 && p.cs > 0;
    if (cs4) mana += CS_MANA;
    const inf = this.infinite(p);
    const npOk = this.usableNp(p, mana);
    const ubw = (ans.ids || []).some((id) => npOk.some((c) => c.uid === id && c.fx.ubw));
    const pool = [...p.hand, ...npOk, ...(ubw ? p.deck : [])];
    let picked = [...new Set(ans.ids || [])].map((id) => pool.find((c) => c.uid === id)).filter(Boolean);
    const riding = picked.find((c) => c.fx?.riding);
    const limit = ubw ? 4 : this.maxCards(p);
    // Riding: any number of extra cards with power 3 or less [GZ]
    const core = []; const extra = [];
    for (const c of picked) {
      if (core.length < limit) core.push(c);
      else if (riding && !c.np && c.power <= riding.fx.riding) extra.push(c);
    }
    picked = [...core, ...extra];
    const down = new Set((ans.down || []).filter((id) => picked.some((c) => c.uid === id && !c.np)));
    const free = picked.some((c) => !down.has(c.uid) && c.fx?.freeMana);
    const costOf = (c) => (down.has(c.uid) || (free && !c.fx?.freeMana) ? 0 : c.mana);
    let kb = !!ans.kb && p.m.key === 'shirou' && (inf || mana >= NP_MANA);
    let cost = picked.reduce((s, c) => s + costOf(c), 0) + (kb ? KANSHOU.mana : 0);
    // too expensive: turn the dearest attack cards face down, then drop NP cards
    while (!inf && cost > mana) {
      const dear = picked.filter((c) => !c.np && !down.has(c.uid) && costOf(c) > 0).sort((a, b) => b.mana - a.mana)[0];
      if (dear) { down.add(dear.uid); } else if (kb) { kb = false; } else { const np = picked.find((c) => c.np); if (!np) break; picked = picked.filter((c) => c !== np); }
      cost = picked.reduce((s, c) => s + costOf(c), 0) + (kb ? KANSHOU.mana : 0);
    }
    // always two cards when possible
    for (const c of p.hand) if (picked.length < Math.min(2, p.hand.length + npOk.length) && !picked.includes(c)) { picked.push(c); down.add(c.uid); }
    let csLeft = p.cs - (cs4 ? 1 : 0);
    let jewel = p.jewel;
    let gems = Math.max(0, Math.min(3, p.gems, Math.floor(ans.gems || 0)));
    if (gems && !jewel) { if (csLeft > 0) { csLeft--; jewel = true; } else gems = 0; } // Jewel Magecraft starts with one Command Spell [วิกิ]
    const cs2 = Math.max(0, Math.min(csLeft, Math.floor(ans.cs2 || 0)));
    const bell = picked.some((c) => c.fx?.bell);
    const bellTo = bell && PATH.slice(1).includes(ans.bellTo) && (ans.bellTo !== 'recon' || this.reconFree(p)) ? ans.bellTo : null;
    return { ids: picked.map((c) => c.uid), down: [...down], cs2, gems, kb, cs4, cost: inf ? 0 : cost, jewel: jewel && !p.jewel, bellTo, ubw };
  }

  applyCards(p, a, field) {
    if (!field) {
      for (const id of a.ids) { const i = p.hand.findIndex((c) => c.uid === id); if (i >= 0) p.trash.push(...p.hand.splice(i, 1)); }
      p.play = null;
      return;
    }
    if (a.cs4) { p.cs--; p.mana += CS_MANA; this.log(`${p.name} ใช้ Command Spell ได้มานา +${CS_MANA}`, 'cs'); }
    if (a.jewel) { p.cs--; p.jewel = true; this.log(`${p.name} ใช้ Command Spell เริ่ม Jewel Magecraft`, 'cs'); }
    if (a.ubw) { p.hand.push(...p.deck); p.deck = []; }
    p.mana -= a.cost;
    p.cs -= a.cs2;
    p.gems -= a.gems;
    const cards = [];
    const down = new Set(a.down);
    for (const id of a.ids) {
      let c = p.np.find((x) => x.uid === id);
      if (c) { c.used = true; if (c.fx.once) c.gone = true; cards.push({ ...c, down: false }); continue; }
      const i = p.hand.findIndex((x) => x.uid === id);
      if (i < 0) continue;
      c = p.hand.splice(i, 1)[0];
      c.down = down.has(c.uid);
      cards.push(c);
    }
    if (a.kb) cards.push(inst(KANSHOU, { down: false }));
    if (a.ubw) { p.deck = this.shuffle(p.hand); p.hand = []; } // cards not played go back into the deck (demo default)
    p.play = { cards, cs2: a.cs2, gems: a.gems };
    for (const c of cards) {
      if (c.down) continue;
      if (c.fx?.mana) p.mana += c.fx.mana;
      if (c.fx?.linger) p.linger += c.fx.linger;
      const reveal = c.fx?.reveal || this.tsubame(p, c);
      if (reveal && !p.revealed) { p.revealed = true; this.log(`✸ ${p.name} ใช้ ${c.name} เปิดชื่อจริง: ${p.sv.name} (${p.sv.cls})`, 'reveal'); }
    }
    for (const c of cards) if (!c.down && (c.name === 'One Sword' || c.name === 'Two Swords')) p.swords.add(c.name);
    if (cards.some((c) => !c.down && c.fx?.rehide) && p.revealed) { p.revealed = false; this.log(`${p.name} ซ่อนชื่อจริงกลับ (Self-Modification)`, 'reveal'); }
    if (a.bellTo) {
      const was = p.at;
      this.enter(p, a.bellTo, 'bell');
      if (AREAS[a.bellTo].field) { for (const q of this.here(a.bellTo)) if (q !== p) { p.terrain += q.terrain; q.terrain = 0; } }
      this.log(`${p.name} ใช้ Bellerophon ย้ายจาก${AREAS[was].name}ไป${AREAS[a.bellTo].name}`, 'reveal');
    }
    p.play.pre = this.powerOf(p, p.play, { events: this.fieldEv[p.at] || [] }).total;
  }

  // ---------- the game ----------
  async run() {
    this.log(`สงครามจอกศักดิ์สิทธิ์เริ่มต้น · Master ${this.players.length} คน · ${this.mode === 'casual' ? 'แบบสั้น 4 รอบ' : '8 รอบ'} แล้วเข้าไคลแมกซ์`, 'sys');
    this.emit('update');
    for (const sit of this.sits) {
      await this.playRound(sit);
      if (this.over) return;
    }
    this.cut(this.alive().length >= 5 ? 4 : this.alive().length - 1, true);
    let stuck = 0;
    while (!this.over && this.alive().length > 1) {
      const n = this.alive().length;
      const card = n >= 4 ? CLIMAX[0] : n === 3 ? CLIMAX[1] : CLIMAX[2];
      this.climax = true;
      await this.playRound(card);
      const before = this.alive().length;
      this.cut(card.fx.cutTo, false);
      stuck = this.alive().length === before ? stuck + 1 : 0;
      if (stuck >= 3) break; // everyone left keeps tying: they share the win (demo default)
    }
    this.finish();
  }

  // section 11: lowest results out; ties go out together, but never everyone [RP]
  cut(target, first) {
    if (this.over) return;
    const label = first ? `จบรอบ ${this.sits.length}` : 'จบรอบไคลแมกซ์';
    const gone = [];
    while (this.alive().length > Math.max(1, target)) {
      const pool = this.alive().filter((p) => !(first && p.avalon)); // Avalon: Shirou survives the first cut [4G]
      if (!pool.length) break;
      const low = Math.min(...pool.map((p) => p.res));
      const out = pool.filter((p) => p.res === low);
      if (out.length >= this.alive().length) break;
      for (const p of out) { p.out = true; gone.push(p); this.log(`✖ ${p.name} ตกรอบ (${label} แต้มผลงาน ${p.res} น้อยที่สุด)`, 'death'); }
    }
    const saved = first && this.alive().find((p) => p.avalon);
    if (saved && gone.length && saved.res <= Math.max(...gone.map((p) => p.res))) this.log(`${saved.name} รอดการคัดออกด้วย Avalon`, 'reveal');
    this.emit('update');
    if (this.alive().length <= 1) this.finish();
  }

  async playRound(sit) {
    this.round++;
    this.sit = sit;
    this.log(`── รอบ ${this.climax ? 'ไคลแมกซ์' : this.round}${this.climax ? '' : `/${this.sits.length}`} · ${sit.name} ──`, 'phase');
    await this.prep();
    await this.outpost();
    await this.action();
    await this.combat();
    this.cleanup();
  }

  async prep() {
    this.phase = 'prep';
    for (const p of this.alive()) {
      this.drawTo(p, this.fx('hand') || HAND);
      if (p.linger) { p.mana += p.linger; this.log(`${p.name} ได้มานา +${p.linger} (ผลต่อเนื่อง)`, ''); p.linger = 0; }
      if (this.fx('mana')) p.mana += this.fx('mana');
      if (p.m.key === 'sakura') { p.mana -= Math.min(2, p.mana); p.res += 2; }
      p.at = null; p.terrain = 0; p.play = null;
    }
    this.fieldEv = { miyama: [], shinto: [] };
    this.shintoOpen = false;
    if (this.mode === 'full') {
      const n = 1 + (this.fx('extraEvent') ? 1 : 0);
      for (const f of FIELDS) for (let i = 0; i < n; i++) this.fieldEv[f].push(this.drawEvent());
    }
    this.emit('phase');
  }

  drawEvent() {
    if (!this.evDeck.length) { this.evDeck = this.shuffle(this.evUsed); this.evUsed = []; }
    return this.evDeck.pop();
  }

  async outpost() {
    this.phase = 'outpost';
    this.emit('phase');
    for (const p of this.order()) {
      const opts = ['miyama', 'shinto'];
      if (this.here('workshop').length < AREAS.workshop.cap) opts.unshift('workshop');
      const ans = await this.decide(this, p, 'place', { opts });
      const to = opts.includes(ans?.to) ? ans.to : opts[0];
      const k = this.here(to).length;
      p.at = to;
      if (to === 'workshop') {
        const n = (k === 0 ? WORKSHOP_MANA[0] : WORKSHOP_MANA[1]) + this.fx('workshop');
        if (p.m.key === 'kuzuki') p.res += n; else p.mana += n;
        this.log(`${p.name} วางที่โรงฝึกเวท ได้${p.m.key === 'kuzuki' ? 'แต้มผลงาน' : 'มานา'} +${n}`, p.isHuman ? 'me' : '');
      } else {
        if (k < TERRAIN.length) p.terrain = TERRAIN[k];
        if (to === 'miyama' && p.m.key === 'shinji') { p.mana += 1; p.res += 1; }
        this.log(`${p.name} วางที่${AREAS[to].name}${p.terrain ? ` ได้เปรียบพื้นที่ +${p.terrain}` : ''}`, p.isHuman ? 'me' : '');
      }
      this.emit('update');
    }
  }

  async action() {
    this.phase = 'action';
    this.shintoOpen = true;
    // a battlefield with 2+ pieces when the step starts is engaged [RP]
    this.engaged = new Set(FIELDS.filter((f) => this.here(f).length >= 2));
    this.emit('phase');
    for (const p of this.order()) {
      this.turn = p;
      const mv = (await this.decide(this, p, 'move', { opts: this.moveOptions(p) })) || {};
      let cs4 = false;
      if (mv.cs4 && p.cs > 0) { p.cs--; p.mana += CS_MANA; cs4 = true; this.log(`${p.name} ใช้ Command Spell ได้มานา +${CS_MANA}`, 'cs'); }
      const o = this.moveOptions(p).find((x) => x.to === mv.to && x.how === mv.how);
      if (o && o.how !== 'stay') {
        p.mana -= o.cost;
        if (o.how === 'cs') p.cs--;
        this.enter(p, o.to, o.how);
        if (o.how === 'walk' && !p.isHuman) this.log(`${p.name} ย้ายไป${AREAS[o.to].name}`, '');
        if (o.how === 'kirei') this.log(`${p.name} ใช้ Supervisor ไปลาดตระเวน`, '');
      }
      this.emit('update');
      const field = AREAS[p.at].field;
      const ans = await this.decide(this, p, 'cards', { field, cs4used: cs4 });
      this.applyCards(p, this.cleanCards(p, ans, field), field);
      if (field && p.play) this.log(`${p.name} ลงการ์ดที่${AREAS[p.at].name} พลังตอนเตรียม ${p.play.pre}`, p.isHuman ? 'me' : '');
      this.emit('update');
    }
    this.turn = null;
  }

  async combat() {
    this.phase = 'combat';
    this.results = [];
    for (const f of FIELDS) {
      const people = this.order().filter((p) => p.at === f);
      if (!people.length) continue;
      const evs = this.fieldEv[f];
      if (people.length === 1) {
        const p = people[0];
        const n = this.mode === 'casual' ? CASUAL.alone : evs.reduce((s, e) => s + e.v, 0);
        p.res += n;
        this.results.push({ f, alone: true, ents: [{ id: p.id, gain: n, cards: p.play?.cards || [] }], winners: [p.id] });
        this.log(`${AREAS[f].name}: ${p.name} อยู่คนเดียว ได้แต้มผลงาน ${n}`, p.isHuman ? 'good' : '');
        continue;
      }
      this.results.push(this.fight(f, people, evs));
    }
    this.emit('combat', { results: this.results });
    await this.decide(this, this.human, 'combatEnd', { results: this.results });
  }

  fight(f, people, evs) {
    const evfx = evs.map((e) => e.fx).filter(Boolean);
    const ents = people.map((p, i) => ({ p, i, cards: p.play?.cards || [], up: (p.play?.cards || []).filter((c) => !c.down) }));
    const has = (e, k) => e.up.some((c) => c.fx?.[k]);
    // cancelling effects are never cancelled themselves; Two Swords only hits players after it in seat order [4G]
    const cancelled = new Set();
    for (const a of ents) for (const c of a.up) {
      if (c.fx?.cancel === 'all') for (const b of ents) if (b !== a) cancelled.add(b);
      if (c.fx?.cancel === 'first') for (const b of ents) if (b.i > a.i) cancelled.add(b);
    }
    const act = (e, k) => !cancelled.has(e) && has(e, k);
    const defeated = new Set();
    for (const a of ents) {
      if (act(a, 'petrify')) for (const b of ents) if (b !== a && !b.up.some((c) => c.fx?.guard)) defeated.add(b);
      if (act(a, 'ruleBreaker')) for (const b of ents) if (b !== a && b.p.cs <= 1) { defeated.add(b); b.p.cs = 0; }
    }
    const noTerrainFoe = (e) => ents.some((o) => o !== e && act(o, 'ignoreTerrain'));
    const zeroS = (e) => ents.some((o) => o !== e && act(o, 'zeroOpp'));
    const lowRes = Math.min(...people.map((p) => p.res));
    const under = evfx.reduce((s, x) => s + (x.underdog || 0), 0);
    for (const e of ents) {
      const extra = { events: evs, noTerrain: evfx.some((x) => x.noTerrain) || noTerrainFoe(e), zero: zeroS(e) ? 'S' : null, cancelled: cancelled.has(e), underdog: under && e.p.res === lowRes ? under : 0 };
      e.pw = this.powerOf(e.p, e.p.play || { cards: [] }, extra);
    }
    const cand = ents.filter((e) => !defeated.has(e));
    let winners = [];
    const sure = cand.filter((e) => act(e, 'sure1v1'));
    if (people.length === 2 && sure.length === 1) winners = sure;
    else if (cand.length) { const top = Math.max(...cand.map((e) => e.pw.total)); winners = cand.filter((e) => e.pw.total === top); }
    const pool = this.mode === 'casual' ? CASUAL.win[f] : evs.reduce((s, e) => s + e.v, 0) + AREAS[f].bonus;
    const penalty = ents.filter((e) => !winners.includes(e) && act(e, 'godHand')).reduce((s, e) => s + e.up.find((c) => c.fx?.godHand).fx.godHand, 0);
    for (const e of ents) {
      const p = e.p;
      e.notes = [];
      if (winners.includes(e)) {
        let n = Math.ceil(pool / winners.length) + (p.play?.cs2 || 0) * CS_RES;
        for (const c of e.up) if (!cancelled.has(e) && c.fx?.win) n += c.fx.win;
        if (act(e, 'perFoe')) n += people.length - 1;
        n = Math.max(0, n - penalty);
        p.res += n;
        e.gain = n;
        for (const x of evfx) if (x.winMana) { p.mana += x.winMana; e.notes.push(`มานา +${x.winMana}`); }
        if (act(e, 'doubleRes')) { e.notes.push(`Zabaniya แต้ม ${p.res} → ${p.res * 2}`); e.gain += p.res; p.res *= 2; }
      } else {
        let n = 0;
        for (const c of e.up) if (!cancelled.has(e) && c.fx?.cont) n += c.fx.cont;
        for (const x of evfx) if (x.loserRes) n += x.loserRes;
        if (act(e, 'godHand')) { const g = e.up.find((c) => c.fx?.godHand).fx.godHand; n += g; e.notes.push(`God Hand: ผู้ชนะแต้ม −${g}`); }
        p.res += n;
        e.gain = n;
      }
      for (const x of evfx) if (x.allMana) p.mana += x.allMana;
      if (defeated.has(e)) e.notes.push('แพ้ทันที');
      if (cancelled.has(e)) e.notes.push('ผลการ์ดถูกยกเลิก');
    }
    const r = {
      f, events: evs, pool, winners: winners.map((e) => e.p.id),
      ents: ents.map((e) => ({ id: e.p.id, cards: e.cards, power: e.pw.total, parts: e.pw.parts, gain: e.gain, notes: e.notes, won: winners.includes(e) })),
    };
    const line = ents.map((e) => `${e.p.name} ${e.pw.total}`).join(' · ');
    this.log(`⚔ ${AREAS[f].name}: ${line} → ${winners.length ? winners.map((e) => `${e.p.name} +${e.gain}`).join(', ') : 'ไม่มีผู้ชนะ'}`, 'fight');
    return r;
  }

  cleanup() {
    for (const p of this.alive()) {
      if (p.play) for (const c of p.play.cards) if (!c.np && !c.special) { delete c.down; p.trash.push(c); }
      p.play = null;
      if (p.m.key === 'illya') p.mana += 1;
    }
    for (const f of FIELDS) this.evUsed.push(...this.fieldEv[f]);
    const n = this.players.length;
    for (let i = 1; i <= n; i++) { const q = this.players[(this.start + i) % n]; if (!q.out) { this.start = q.id; break; } }
    this.phase = 'end';
    this.emit('update');
  }

  finish() {
    if (this.over) return;
    this.over = true;
    const left = this.alive();
    this.winner = left.length === 1 ? left[0] : null;
    this.coWinners = left.length > 1 ? left : [];
    this.how = this.winner ? 'เหลือคนสุดท้าย' : `เสมอกันจนจบ ${left.map((p) => p.name).join(', ')} ชนะร่วม`;
    this.log(this.winner ? `🏆 ${this.winner.name} ชนะสงครามจอกศักดิ์สิทธิ์! (${this.winner.sv.name})` : `🏆 ${this.how}`, 'grail');
    this.emit('over');
  }
}
