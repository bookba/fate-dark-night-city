// One-page UI for the v2.0 demo. The rules live in game.js; this file only draws
// the state and turns clicks into the answers game.decide() waits for.
import { Game, LOCS, LOC_KEYS, COLORS, CNAME, CAP, CS_MAX, DAYS, SPLIT, CS_BOOST, CS_HEAL, CHURCH_HEAL, skillsOf, condText, PASSIVE } from './game.js';
import { botDecide } from './bot.js';
import { SV_ART, MAP_ART } from './art.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const TOK = ['B', 'A', 'Q', 'M', 'C'];

let g, wait = null, draft = null, skip = false, overShown = false;

function newGame() {
  skip = false;
  overShown = false;
  closeModal();
  draft = null;
  wait = null;
  g = new Game({ decide, onEvent: () => render() });
  g.run();
}

function decide(game, pl, kind, ctx) {
  if (!pl.isHuman) return botDecide(game, pl, kind, ctx);
  if (kind === 'phaseEnd' && (skip || g.over)) return null;
  return new Promise((res) => { wait = { kind, ctx, res }; draft = kind === 'loc' ? null : draft; render(); });
}
function answer(v) { const w = wait; wait = null; draft = null; $('#modal').hidden = true; w.res(v); }

// ---------- drawing ----------
const tokChips = (t, full = false) => TOK.map((k) => `<span class="tok t${k}" title="${CNAME[k]}">${k === 'M' ? 'M' : k === 'C' ? '☠' : k}${t[k]}${full ? `<small>/${CAP[k]}</small>` : ''}</span>`).join('');
const seals = (n) => `<span class="cs">${'◆'.repeat(n)}<i>${'◇'.repeat(CS_MAX - n)}</i></span>`;
const hpBar = (p) => `<div class="hp"><b style="width:${(100 * Math.max(0, p.hp)) / p.maxHp}%"></b><span>HP ${Math.max(0, p.hp)}/${p.maxHp}</span></div>`;
const payText = (pay) => Object.entries(pay).filter(([, n]) => n).map(([k, n]) => `${CNAME[k]} ${n}`).join(' + ') || 'ไม่ต้องจ่าย';

function render() {
  if (!g) return;
  const me = g.human;
  const ph = g.phase;
  const night = !!ph?.night;
  document.body.classList.toggle('night', night);

  const grail = !g.grail.appeared ? 'จอกจะปรากฏเมื่อเหลือ 2 คน' : g.grail.holder ? `✦ จอกอยู่กับ ${esc(g.grail.holder.name)}` : `✦ จอกอยู่ที่${LOCS[g.grail.loc].name}`;
  $('#top').innerHTML = `<b>Fate Battle Royale</b><span class="when">วันที่ ${Math.min(g.day, DAYS)}/${DAYS} · ${ph ? ph.name : 'เริ่มวัน'}</span>
    <span>เหลือ ${g.alive().length} คน</span><span class="grail">${grail}</span>
    <span class="btns"><button id="rules">กติกา</button><button id="restart">เกมใหม่</button></span>`;
  $('#rules').onclick = showRules;
  $('#restart').onclick = newGame;

  const s = me.sv;
  $('#me').innerHTML = `<div class="card ${me.out ? 'out' : ''}">
    <img src="${SV_ART[s.key]}" alt="" />
    <div class="who"><b>${esc(s.name)}</b><span>${s.cls} · สีหลัก ${CNAME[s.P]} · สีรอง ${CNAME[s.S]}</span></div>
    ${hpBar(me)}
    <div class="row">Command Spell ${seals(me.cs)}${me.tok.C >= 5 ? ' <em>ใช้ไม่ได้ (Curse 5)</em>' : ''}</div>
    <div class="toks">${tokChips(me.tok, true)}</div>
    <h4>สกิล</h4>
    ${skillsOf(s).map((sk) => { const p = g.plan(me, sk); const un = g.unlocked(me, sk); return `<div class="skill ${p ? 'ok' : un ? 'short' : 'lock'}">
      <b>${esc(sk.name)}${sk.np ? ' (NP)' : ''}</b><span>ATK ${sk.atkText}</span>
      <small>ปลดล็อก: ${condText(sk.cond)} · จ่าย: ${sk.costText}</small></div>`; }).join('')}
    <div class="skill passive"><b>Passive</b><small>มี ${PASSIVE.cond}: ${PASSIVE.text}</small></div>
  </div>`;

  drawMap();
  drawPanel();

  $('#players').innerHTML = `<h4>ผู้เล่น</h4>` + g.players.map((p) => {
    const show = p.isHuman || p.revealed;
    const at = g.stage === 'result' && !p.out && p.choice ? `<em>${LOCS[p.choice.loc].name}</em>` : '';
    return `<div class="pl ${p.out ? 'out' : ''} ${p.isHuman ? 'me' : ''}">
      ${show ? `<img src="${SV_ART[p.sv.key]}" alt="" />` : `<span class="cls">${p.sv.cls[0]}</span>`}
      <div><b>${esc(p.name)}</b> <span>${p.sv.cls}${show && !p.isHuman ? ` · ${esc(p.sv.name)}` : ''}</span> ${g.grail.holder === p ? '✦' : ''} ${at}
      <div class="mini">HP ${Math.max(0, p.hp)} · ${seals(p.cs)} ${tokChips(p.tok)}</div></div></div>`;
  }).join('');

  $('#log').innerHTML = `<h4>บันทึก</h4>` + g.logs.slice(-120).map((l) => `<div class="l-${l.cls}">${esc(l.text)}</div>`).join('');
  $('#log').scrollTop = $('#log').scrollHeight;

  if (wait?.kind === 'fight' && $('#modal').hidden) showFight();
  if (g.over && !overShown && $('#modal').hidden) { overShown = true; showOver(); }
}

function drawMap() {
  const ph = g.phase;
  const open = g.open();
  const choosing = wait?.kind === 'loc';
  $('#map').style.backgroundImage = `url(${ph?.night ? MAP_ART.night : MAP_ART.day})`;
  $('#map').innerHTML = LOC_KEYS.map((k) => {
    const L = LOCS[k];
    const closed = !open.includes(k);
    const here = wait?.kind === 'phaseEnd' ? g.alive().concat(g.players.filter((p) => p.out)).filter((p) => p.choice?.loc === k && (g.lastResults || []).some((r) => r.loc === k && r.people.includes(p.id))) : [];
    const gr = g.grail.appeared && !g.grail.holder && g.grail.loc === k;
    const sel = draft?.loc === k || (g.stage === 'result' && g.human.choice?.loc === k);
    return `<button class="loc ${closed ? 'closed' : ''} ${sel ? 'sel' : ''} ${gr ? 'grail' : ''}" data-loc="${k}" ${choosing && !closed ? '' : 'disabled'}>
      <b>${L.name}${gr ? ' ✦' : ''}</b><span>รับ ${L.cap} คน</span><small>${L.reward}</small>
      ${closed ? `<em>ปิด (เหลือไม่ถึง ${L.close} คน)</em>` : ''}
      ${here.length ? `<div class="here">${here.map((p) => `<span class="${p.isHuman ? 'me' : ''}">${esc(p.name)}</span>`).join('')}</div>` : ''}
    </button>`;
  }).join('');
  for (const b of document.querySelectorAll('.loc')) b.onclick = () => pickLoc(b.dataset.loc);
}

function pickLoc(loc) {
  const me = g.human;
  draft = { loc };
  if (loc === 'school') draft.color = me.sv.P;
  if (SPLIT[loc]) draft.split = { B: 0, A: 0, Q: 0, [me.sv.P]: SPLIT[loc] };
  if (loc === 'church') draft.ex = me.hp < me.maxHp ? 'heal' : me.tok.C ? 'curse' : 'heal';
  render();
}

function drawPanel() {
  const P = $('#panel');
  const me = g.human;
  if (g.over) { P.innerHTML = `<p>จบเกมแล้ว</p><button class="go" id="again">เล่นใหม่</button>`; $('#again').onclick = newGame; return; }
  if (wait?.kind === 'loc') {
    const ph = wait.ctx.phase;
    const tip = ph.night ? 'กลางคืน: ถ้าคนเกินที่รับได้ หรือมีจอกและมี 2 คนขึ้นไป จะต้องสู้กัน' : 'กลางวัน: ถ้าคนเกิน คนที่คะแนนน้อยที่สุด (B+A+Q+Mana+HP) ได้ก่อน คนที่เหลือไม่ได้อะไร';
    if (!draft) { P.innerHTML = `<h3>${ph.name}: เลือกสถานที่ 1 แห่ง</h3><p class="tip">${tip}</p>`; return; }
    const L = LOCS[draft.loc];
    let extra = '';
    if (draft.loc === 'school') extra = `<div class="pick">เลือกสี: ${COLORS.map((c) => `<button class="col t${c} ${draft.color === c ? 'on' : ''}" data-c="${c}">${CNAME[c]} +3</button>`).join('')}</div>`;
    if (draft.split) {
      const n = SPLIT[draft.loc];
      extra = `<div class="pick">แบ่งโทเคน ${n} อัน: ${COLORS.map((c) => `<span class="sp t${c}">${CNAME[c]} <button data-d="${c}">−</button><b>${draft.split[c]}</b><button data-u="${c}">+</button></span>`).join('')}</div>`;
    }
    if (draft.loc === 'church') {
      const ex = [['heal', `ฟื้น HP ${CHURCH_HEAL}`, true], ['curse', 'Curse 1 → Mana 2', me.tok.C >= 1],
        ...COLORS.map((c) => [`color:${c}`, `${CNAME[c]} ทั้งหมด (${me.tok[c]}) → Mana ${Math.floor(me.tok[c] / 2)}`, me.tok[c] >= 2]),
        ['cs', 'Curse 5 → Command Spell 1', me.tok.C >= 5 && me.cs < CS_MAX], ['', 'ไม่แลก', true]];
      extra = `<div class="pick col1">แลก 1 อย่าง: ${ex.map(([k, t, ok]) => `<label class="${ok ? '' : 'dim'}"><input type="radio" name="ex" value="${k}" ${draft.ex === k ? 'checked' : ''} ${ok ? '' : 'disabled'}/> ${t}</label>`).join('')}</div>`;
    }
    P.innerHTML = `<h3>${ph.name}: ${L.name}</h3><p>รางวัล: ${L.reward} · รับ ${L.cap} คน</p>${extra}<button class="go" id="ok">ยืนยัน</button><p class="tip">${tip}</p>`;
    for (const b of P.querySelectorAll('[data-c]')) b.onclick = () => { draft.color = b.dataset.c; render(); };
    for (const b of P.querySelectorAll('[data-u]')) b.onclick = () => { const c = b.dataset.u; const from = COLORS.find((x) => x !== c && draft.split[x] > 0 && x === me.sv.P) || COLORS.find((x) => x !== c && draft.split[x] > 0); if (from) { draft.split[from]--; draft.split[c]++; render(); } };
    for (const b of P.querySelectorAll('[data-d]')) b.onclick = () => { const c = b.dataset.d; if (draft.split[c] > 0) { const to = c === me.sv.P ? COLORS.find((x) => x !== c) : me.sv.P; draft.split[c]--; draft.split[to]++; render(); } };
    for (const r of P.querySelectorAll('input[name=ex]')) r.onchange = () => { draft.ex = r.value; };
    $('#ok').onclick = () => answer({ ...draft });
    return;
  }
  if (wait?.kind === 'phaseEnd') {
    const rs = wait.ctx.results;
    P.innerHTML = `<h3>ผล${wait.ctx.phase.name}</h3>` + (rs.length ? rs.map(resultHtml).join('') : '<p>ไม่มีใครเหลือ</p>') +
      `<button class="go" id="next">ถัดไป</button>${me.out ? '<button id="skipall">ข้ามไปดูตอนจบ</button>' : ''}`;
    $('#next').onclick = () => answer(null);
    if (me.out) $('#skipall').onclick = () => { skip = true; answer(null); };
    return;
  }
  P.innerHTML = me.out ? '<p>คุณตกรอบแล้ว กำลังดูต่อ…</p>' : '<p>รอผู้เล่นอื่น…</p>';
}

const nm = (id) => { const p = g.players[id]; return `<span class="${p.isHuman ? 'me' : ''}">${esc(p.name)}</span>`; };
function resultHtml(r) {
  const L = LOCS[r.loc];
  if (!r.fight) return `<div class="res"><b>${L.name}</b> ${r.got.map(nm).join(', ')} ได้รางวัล${r.missed.length ? ` · ${r.missed.map(nm).join(', ')} ไม่ได้ (คนเกิน)` : ''}</div>`;
  return `<div class="res fight"><b>⚔ ${L.name}</b>` + r.ents.map((e, i) => `<div>${i === 0 ? '🏆' : ''} ${nm(e.id)}: ${esc(e.skill)}${e.np ? ' (NP)' : ''} ATK ${e.atk}${e.boost ? ' (CS +5)' : ''}${e.healed ? ' · CS ฟื้น HP' : ''}
    ${i === 0 ? '' : e.escaped ? ' · หนีด้วย CS' : ` · HP −${e.dmg}, Curse +1`}${e.died ? ' · ตกรอบ' : ''}${e.got ? ` · ได้ ${esc(e.got)}` : ''}</div>`).join('') + `</div>`;
}

// ---------- modals ----------
function openModal(html) { $('#modal .sheet').innerHTML = html; $('#modal').hidden = false; }
function closeModal() { $('#modal').hidden = true; if (g && !g.over) render(); }

function showFight() {
  const me = g.human;
  const { loc, foes } = wait.ctx;
  const opts = g.options(me).sort((a, b) => b.p.atk - a.p.atk);
  const st = { skill: opts[0].sk.key, boost: false, heal: false, escape: false };
  const can = g.canSpell(me);
  const draw = () => {
    const used = st.boost + st.heal + st.escape;
    const atk = opts.find((o) => o.sk.key === st.skill).p.atk + (st.boost ? CS_BOOST : 0);
    openModal(`<h3>⚔ ต่อสู้ที่${LOCS[loc].name}</h3>
      <div class="foes">${foes.map((p) => `<div><b>${esc(p.name)}</b> ${p.sv.cls}${p.revealed ? ` (${esc(p.sv.name)})` : ''} · HP ${p.hp} · ${seals(p.cs)} ${tokChips(p.tok)}</div>`).join('')}</div>
      <h4>เลือกสกิล 1 อย่าง</h4>
      ${opts.map((o) => `<label class="opt"><input type="radio" name="sk" value="${o.sk.key}" ${st.skill === o.sk.key ? 'checked' : ''}/> <b>${esc(o.sk.name)}${o.sk.np ? ' (NP)' : ''}</b> ATK ${o.p.atk} <small>จ่าย ${payText(o.p.pay)}</small></label>`).join('')}
      <h4>Command Spell (เหลือ ${me.cs}${can ? '' : ', ใช้ไม่ได้'})</h4>
      ${[['boost', `ATK +${CS_BOOST}`], ['heal', `ฟื้น HP ${CS_HEAL} ก่อนสู้`], ['escape', 'ถ้าแพ้ ให้หนี (ไม่เสีย HP ไม่โดน Curse ไม่ได้รางวัล)']].map(([k, t]) =>
        `<label class="opt ${can ? '' : 'dim'}"><input type="checkbox" data-cs="${k}" ${st[k] ? 'checked' : ''} ${can && (st[k] || used < me.cs) ? '' : 'disabled'}/> ${t}</label>`).join('')}
      <p>ATK ของคุณ: <b>${atk}</b> · คนที่ ATK สูงสุดชนะ เสมอกันให้คนคะแนนน้อยกว่าชนะ</p>
      <button class="go" id="fightgo">สู้!</button>`);
    for (const r of document.querySelectorAll('input[name=sk]')) r.onchange = () => { st.skill = r.value; draw(); };
    for (const c of document.querySelectorAll('[data-cs]')) c.onchange = () => { st[c.dataset.cs] = c.checked; draw(); };
    $('#fightgo').onclick = () => answer({ ...st });
  };
  draw();
}

function showOver() {
  const w = g.winner;
  openModal(`<h3>${w ? (w.isHuman ? '🏆 คุณชนะ!' : `🏆 ${esc(w.name)} ชนะ`) : 'ทุกคนแพ้'}</h3><p>${esc(g.how)}</p>
    <div class="foes">${g.players.map((p) => `<div class="${p.out ? 'dim' : ''}"><b>${esc(p.name)}</b> ${esc(p.sv.name)} (${p.sv.cls}) · HP ${Math.max(0, p.hp)}${p.out ? ' · ตกรอบ' : ''}</div>`).join('')}</div>
    <button class="go" id="again2">เล่นใหม่</button> <button id="closeover">ดูกระดาน</button>`);
  $('#again2').onclick = () => { closeModal(); newGame(); };
  $('#closeover').onclick = closeModal;
}

function showRules() {
  openModal(`<h3>กติกาโดยย่อ (v2.0)</h3><ul>
    <li>8 คน 8 วัน วันละ 4 ช่วง: กลางวัน 1, กลางวัน 2, กลางคืน 1, กลางคืน 2</li>
    <li>ทุกช่วง ทุกคนเลือกสถานที่ 1 แห่งพร้อมกันแบบลับ</li>
    <li>กลางวันคนเกิน: คนคะแนนน้อยสุด (B+A+Q+Mana+HP) ได้ก่อน ที่เหลือไม่ได้</li>
    <li>กลางคืนคนเกิน หรือที่ที่มีจอกมี 2 คนขึ้นไป: ต่อสู้ ใช้สกิลคนละ 1 อย่าง ATK สูงสุดชนะ คนแพ้เสีย HP เท่าส่วนต่าง ATK และได้ Curse 1</li>
    <li>เริ่มวัน: Mana +1, สีสุ่ม +1, Passive (มีครบ 3 สีฟื้น HP 2), Curse 3+ เสีย HP 2</li>
    <li>Mana จ่ายแทนสีที่ขาดได้ แต่ไม่นับเป็นเงื่อนไขปลดล็อก</li>
    <li>จอกปรากฏเมื่อเหลือ 2 คน · ชนะ: เหลือคนสุดท้าย หรือถือจอกตอนจบวันที่ 8 ไม่งั้นทุกคนแพ้</li>
    <li>ทุกคนเห็นคลาส HP และโทเคนของกันและกัน ชื่อ Servant และสกิลเห็นเมื่อใช้ NP</li></ul>
    <p class="tip">เดโมนี้มีแค่ Artoria ตามกระดาษ อีก 7 ตัวใช้รูปแบบเดียวกับ Artoria แต่สลับสีหลัก/รอง</p>
    <button class="go" id="closer">ปิด</button>`);
  $('#closer').onclick = closeModal;
}

newGame();
