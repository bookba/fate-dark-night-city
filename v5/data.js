// Data for the v5.2 demo (design paper v5.2, 29 Oct 2026): the game rules follow the official
// Dominate Grail War manual; the 7 Fate/stay night Masters and 9 Servants (7 dealt at random) use
// the card abilities and power values of Fate/Domination. Sources: [FD] fatedomination.fandom.com
// (text only, the numbers printed on card images are unknown), [p.N] manual page, [4G] play
// reports used in paper v3.0. ph = placeholder.

export const TYPES = { S: 'กำลัง', A: 'ว่องไว', M: 'เวท', X: 'พิเศษ', N: 'NP', Z: 'ไม่มีชนิด' };
export const ALL_TYPES = ['S', 'A', 'M', 'X', 'N']; // Z (Archer Class) has no type, so it never matches one
// a card can have more than one type [p.4]: c.types lists them, e.g. Excalibur is NP and Strength
export const hasType = (c, t) => (c.types ? c.types.includes(t) : c.type === t);

// paper section 8.0: the numbered steps of a round, and the 9 windows where cards are used
export const STEPS = {
  '1.1': 'จั่วจนมี 3 ใบ', '1.2': 'เปิดการ์ดสถานการณ์', '1.3': 'วางการ์ดอีเวนต์', '1.4': 'ช่วงเตรียมการ',
  '2.1': 'ช่วงก่อนวางหมาก', '2.2': 'วางหมาก', '2.3': 'ช่วงหลังวางหมาก',
  '3.1': 'ช่วงก่อนย้าย', '3.2': 'ย้าย', '3.3': 'ช่วงหลังย้าย', '3.4': 'ลงการ์ด', '3.5': 'ช่วงหลังลงการ์ด',
  '4.1': 'ผลตอนปะทะ', '4.2': 'ตัดสินผู้ชนะ', '5.1': 'ช่วงจบรอบ', '5.2': 'เก็บของ ส่งผู้เริ่ม',
};
export const WINDOWS = {
  prep: { code: '1.4', name: 'เตรียมการ' },
  prePlace: { code: '2.1', name: 'ก่อนวางหมาก' },
  postPlace: { code: '2.3', name: 'หลังวางหมาก' },
  preMove: { code: '3.1', name: 'ก่อนย้าย' },
  postMove: { code: '3.3', name: 'หลังย้าย' },
  onUse: { code: '3.4', name: 'ตอนใช้' }, // effects of the cards laid in step 3.4
  postCards: { code: '3.5', name: 'หลังลงการ์ด' },
  clash: { code: '4.1', name: 'ตอนปะทะ' }, // effects of the cards laid, battlefields only
  end: { code: '5.1', name: 'จบรอบ' },
};
// permanent [FD]: the card stays in play after the round and works from the round it was laid
export const WHEN_NAME = { ...Object.fromEntries(Object.entries(WINDOWS).map(([k, w]) => [k, w.name])), always: 'ตลอด', permanent: 'ถาวร' };
export const WHERE = { any: 'ทุกที่', field: 'สนามรบ', miyama: 'มิยามะ', shinto: 'ชินโตะ', workshop: 'โรงฝึกเวท', recon: 'ลาดตระเวน' };
export const COND = { engaged: 'ติดพัน', hidden: 'ชื่อจริงยังซ่อน', duel: 'สู้ 1 ต่อ 1' };
// the label of each effect of the current cards (paper section 9): a card's effects are a list of
// lines { when, where, cond }. Window cards list theirs in c.use; for the others it comes from fx.
const FX_WHEN = {
  reveal: 'onUse', mana: 'onUse', move: 'onUse', bell: 'onUse', ubw: 'onUse', riding: 'onUse', riderDraw: 'onUse', hide: 'onUse', playVP: 'onUse',
  terrainMul: 'onUse', pierce: 'onUse', ruleBreaker: 'onUse', block: 'onUse', gate: 'onUse', archer: 'onUse',
  petrify: 'clash', duel: 'clash', zeroOpp: 'clash', godHand: 'clash', zab: 'clash', win: 'clash', strike: 'clash', excal: 'clash', npTop: 'clash',
  rain: 'clash', strike1: 'clash', enuma: 'clash', presence: 'clash', luck: 'clash',
  permanent: 'permanent',
};
export function cardLines(c) {
  if (c.use) return c.use.map((u) => ({ when: u.when, where: u.where || 'any', cond: u.cond || null }));
  const ws = new Set(Object.keys(c.fx || {}).map((k) => FX_WHEN[k]).filter(Boolean));
  return ['onUse', 'clash', 'permanent'].filter((w) => ws.has(w)).map((w) => ({ when: w, where: w === 'clash' ? 'field' : w === 'onUse' ? 'any' : null, cond: c.fx?.hiddenOnly ? 'hidden' : null }));
}

// paper section 4 and 8
export const AREAS = {
  workshop: { name: 'โรงฝึกเวท', en: 'Magic Workshop', field: false },
  miyama: { name: 'ย่านมิยามะ', en: 'Miyama', field: true, bonus: 2 }, // bonus [p.11]
  shinto: { name: 'ย่านชินโตะ', en: 'Shinto', field: true, bonus: 3 }, // bonus [p.11]
  recon: { name: 'ลาดตระเวน', en: 'Recon', field: false },
};
export const PATH = ['workshop', 'miyama', 'shinto', 'recon'];
export const STEP_COST = [1, 2, 2]; // [4G], totals 3 and 5 [p.9]
export const WORKSHOP = [2, 1, 1, 1]; // [p.8]
export const TERRAIN = [3, 1]; // [p.12]
export const RECON_VP = 2; // on entering [p.9]
export const HAND = 3; // [p.8]
export const PLAY = 2; // cards chosen in the battle prep step [p.10]
export const SKILL_MANA = 8; // NP/skill cards need 8 mana [p.10]
export const MANA_MAX = 12; // the mana track [p.4]
export const REGULAR = 8; // [p.11]
export const START_MANA = 4; // [FD] "every Master starts with 4 mana unless the card says otherwise"
export const CS_MANA = 4; // [p.10]
export const CS_POWER = 2; // [p.10]
export const CS_VP = 2; // [p.10]
export const UBW_PLAY = 4; // [FD] Unlimited Blade Works: play 0–4 basic cards instead of 2
export const RIDE_MAX = 3; // [FD] Rider Class: up to 3 more hand cards of base power 3 or less
export const MANA_X = 16; // [FD] Caster Class costs X = 16 − 2 × the round
export const GEM_REPEAT = 3; // [FD] in the climax Rin may pick the same gem option up to 3 times
export const MAX_ROUNDS = 20; // safety stop for endless ties at the cut line

// paper section 5 [FD]: abilities of Fate/Domination; numbers the wiki leaves out are ph
export const MASTERS = [
  { key: 'shirou', tok: 'ชิ', name: 'เอมิยะ ชิโร่', short: 'ชิโร่', en: 'Emiya Shirou', color: '#c2553a', mana: 2, cs: 3, level: 'กลาง',
    abil: [['Kanshou & Bakuya', 'อยู่ในช่องสกิล ลงเพิ่มนอกเหนือการ์ด 2 ใบได้ ต้องมีมานา 8 · กำลัง พลัง 5 มานา 1'], ['Avalon', 'ครั้งแรกที่จะตกรอบ เสียมานาทั้งหมดแทน ไม่ตกรอบ']] },
  { key: 'rin', tok: 'ริ', name: 'โทซากะ ริน', short: 'ริน', en: 'Tohsaka Rin', color: '#b8323a', mana: 4, cs: 3, gems: 10, level: 'กลาง',
    abil: [['Gem', 'อัญมณี 10 ใบ ใบละครั้งต่อเกม · ตอนลงการ์ด เลือกได้อย่างละครั้งต่อรอบ: ได้มานา 1 · ลง Gandr Shot ชั่วคราว (เวท พลัง 1 ลงเพิ่ม) · ทิ้ง 1–3 ใบแล้วจั่วเท่ากัน · ไคลแมกซ์เลือกอย่างเดิมได้ถึง 3 ครั้ง'], ['Short Temper', 'รอบ 1 ต้องใช้ Command Spell 1 ดวง · ถ้าใช้รับมานา หลังต่อสู้เสียมานา 4']] },
  { key: 'sakura', tok: 'ซา', name: 'มาโต้ ซากุระ', short: 'ซากุระ', en: 'Matou Sakura', color: '#7b52c7', mana: 4, cs: 3, level: 'สูง',
    abil: [['Broken Vessel', 'จบรอบ ถ้าทุกคนมี VP มากกว่าเรา ได้การ์ด Black Shadow (เตรียมการ: จ่ายมานา 2 ได้ 2 VP)'], ['The Tainted Grail', 'จบรอบ 8 ถ้าไม่ได้อันดับ 1: มานาไม่จำกัด และลงการ์ดเพิ่มได้ 1 ใบจนจบเกม · Black Shadow ใช้ไม่ได้อีก']] },
  { key: 'illya', tok: 'อิ', name: 'อิลิยาสฟีล ฟอน ไอน์ซเบิร์น', short: 'อิลิยา', en: 'Illyasviel', color: '#9aa0b8', mana: 6, cs: 3, level: 'ง่าย',
    abil: [['Holy Grail', 'มานาเริ่ม 6 · จบรอบได้มานา 1'], ['Dress of Heaven', 'ตั้งแต่รอบ 8 ต้นรอบได้ 2 VP ถ้ารอบก่อนอยู่สนามรบเดียวกับคนที่ตกรอบ']] },
  { key: 'shinji', tok: 'ชน', name: 'มาโต้ ชินจิ', short: 'ชินจิ', en: 'Matou Shinji', color: '#5f8a3c', mana: 4, cs: 3, level: 'สูง',
    abil: [['Immoral', 'เข้าย่านมิยามะได้มานา 1'], ['Poor Leadership', 'แพ้การต่อสู้เสีย Command Spell 1 ดวง'], ['Unworthy', 'Book of the False Attendant: Command Spell หมดครั้งแรก เปลี่ยนเป็น Servant ที่ไม่มีใครได้แบบสุ่ม ชื่อจริงกลับไปซ่อน ได้ Command Spell 3 ดวง']] },
  { key: 'kuzuki', tok: 'คุ', name: 'คุซุกิ โซอิจิโร่', short: 'คุซุกิ', en: 'Kuzuki Souichirou', color: '#56627a', mana: 4, cs: 3, level: 'สูง',
    abil: [['Snake', 'การ์ด Snake 2 ใบอยู่ในสำรับ (กำลัง 5/0 · ว่องไว 5/0)'], ['ไม่ใช้เวทมนตร์', 'ไม่ได้มานาจากโรงฝึกเวท · ย้ายออกจากโรงฝึกเวทจ่ายน้อยลง 1'], ['หลังต่อสู้', 'ถ้ารอบนี้ไม่ได้ VP เลย ได้ 1 VP (2 VP ถ้าอยู่โรงฝึกเวทคนเดียว)']] },
  { key: 'kirei', tok: 'คิ', name: 'โคโตมิเนะ คิเรย์', short: 'คิเรย์', en: 'Kotomine Kirei', color: '#3a3430', mana: 4, cs: 3, level: 'ง่าย',
    abil: [['Supervisor', 'ตอนชื่อจริงซ่อน: เห็นคลาส Servant ของทุกคน · ตอนย้าย จ่ายมานา 2 ไปลาดตระเวนได้จากทุกที่ แม้ติดพัน (Impartial)'], ['Executor', 'ตอนชื่อจริงเปิดแล้ว: ตอนปะทะ พลังรวม +2']] },
];

// Master cards: K&B sits in Shirou's skill slot and is laid on top of the 2 cards [FD]; Gandr Shot
// is one of Rin's gem options, a card for one fight only; Black Shadow is what Sakura gets from Broken
// Vessel, used once in the prep window. Snake is shuffled into Kuzuki's deck.
export const KANSHOU = { name: 'Kanshou & Bakuya', type: 'S', power: 5, mana: 1, fx: { needMana: true, extra: 1 }, special: true, text: 'การ์ดของชิโร่ อยู่ในช่องสกิล · ลงเพิ่มนอกเหนือการ์ด 2 ใบ [FD] · ต้องมีมานา 8 [FD] · กำลัง พลัง 5 มานา 1 [4G]' };
export const GANDR = { name: 'Gandr Shot', type: 'M', power: 1, mana: 0, fx: { extra: 1 }, special: true, temp: true, text: 'อัญมณีของริน · เวท พลังพื้นฐาน 1 [FD] · ลงเพิ่มนอกเหนือการ์ด 2 ใบ ใช้รอบเดียวแล้วหายไป' };
export const BLACK_SHADOW = { name: 'Black Shadow', type: 'X', power: 0, mana: 2, special: true, consume: true, windowOnly: true, use: [{ when: 'prep', fx: { vp: 2 } }], text: 'การ์ดของซากุระจาก Broken Vessel · เตรียมการ: จ่ายมานา 2 ได้ 2 VP [FD] · ใช้แล้วหายไป · ใช้ไม่ได้หลังได้ The Tainted Grail' };

// basic cards [FD]: type and power from the wiki; the mana is printed on the card image only, so
// it is ph = power − 3, at least 0. The 3 basic Special-type cards are ph 1 power, 1 mana.
const c = (type, power, fx = null, extra = {}) => ({ type, power, mana: Math.max(0, power - 3), fx, basic: true, ...extra });
const PREP = { type: 'X', power: 1, mana: 1, basic: true, name: 'Preparation', fx: { terrainMul: 2, win: 2 }, text: 'ตอนใช้: ได้เปรียบพื้นที่ ×2 · ตอนปะทะ: ถ้าชนะ ได้ 2 VP [FD] (พลังและมานาเป็นค่าแทน)' };
const SURVEIL = { type: 'X', power: 1, mana: 1, basic: true, name: 'Surveil', fx: { move: 'next' }, text: 'ตอนใช้: ย้ายตามลูกศรไปพื้นที่ถัดไป 1 ช่อง การ์ดตามไปด้วย ไม่สนการติดพัน [FD] (พลังและมานาเป็นค่าแทน)' };
const LUCK = { type: 'X', power: 1, mana: 1, basic: true, name: 'Luck', fx: { luck: true }, text: 'ตอนปะทะ: ไม่สนสถานะ [แพ้] · ถ้าแพ้ไปก่อนแล้ว ลงใบนี้ไม่ได้ [FD] (พลังและมานาเป็นค่าแทน)' };
const n = (card, k) => Array.from({ length: k }, () => ({ ...card }));
const S = (p) => c('S', p); const A = (p) => c('A', p); const M = (p) => c('M', p);
// Heracles' Berserker Class cards: in the deck but not basic cards [FD]
const BERSERKER = (type, power, mana) => ({ type, power, mana, fx: null, cls: true, name: 'Berserker Class', text: `การ์ดคลาสของ Heracles ในสำรับ · ไม่ใช่การ์ดพื้นฐาน · ${type === 'S' ? 'กำลัง' : 'ว่องไว'} พลัง ${power} มานา ${mana} [FD]${type === 'A' ? ' (มานาเท่ากำลัง 7 อนุมาน)' : ''}` });

// note: what the manual says about the Servant [p.15–17]. NP/skill cards: names, types and effects
// [FD]; numbers [FD] where the wiki text gives them, else ph (v5.1 values for the same card).
export const SERVANTS = [
  { key: 'artoria', cls: 'Saber', name: 'Artoria Pendragon', note: 'ใช้ได้ทั้งบุกและกันแบบง่าย · Excalibur พลังสูงอันดับ 1–2 ของ NP ทั้งหมด',
    deck: [S(2), S(3), ...n(S(4), 3), S(5), A(3), M(2), M(3), ...n(LUCK, 2), SURVEIL],
    skills: [
      { name: 'Excalibur', type: 'N', types: ['N', 'S'], power: 12, mana: 8, fx: { reveal: true, excal: 4 }, text: 'เปิดชื่อจริง · ตอนปะทะ: ช่วงไคลแมกซ์พลังรวม +4 · ถ้าชนะในรอบไคลแมกซ์ "เหลือ 2 คน" ชนะเกมทันที [FD] · พลัง 12 มานา 8 [FD]' },
      { name: 'Invisible Air', type: 'N', types: ['N', 'M'], power: 4, mana: 4, fx: { hiddenDisc: 2, zeroOpp: 'S' }, text: 'ชื่อจริงยังซ่อน: มานา −2 · ตอนปะทะ: การ์ดกำลังของคู่ต่อสู้ในสนามรบเราพลังพื้นฐานเป็น 0 [FD] (พลังและมานาเป็นค่าแทน)' },
      { name: 'Saber Class', type: 'X', power: 3, mana: 2, fx: { permanent: true, npTop: true, zeroOpp: 'M' }, text: 'ถาวร · ตอนปะทะ: ถ้าเราลง NP มานาสูงสุดในสนามรบ ได้ 1 VP (2 VP ถ้า NP นั้นมานา 4 ขึ้นไป) · Magic Resistance: การ์ดเวทของคู่ต่อสู้พลังพื้นฐานเป็น 0 [FD] (พลังและมานาเป็นค่าแทน)' },
    ] },
  { key: 'emiya', cls: 'Archer', name: 'EMIYA', note: 'เก่งใช้พลังจากได้เปรียบพื้นที่ · UBW เอาสำรับทั้งหมดขึ้นมือ ลงการ์ดได้หลายใบ',
    deck: [S(2), S(3), ...n(A(2), 2), A(3), A(4), M(2), M(3), M(4), SURVEIL, ...n(PREP, 2)],
    skills: [
      { name: 'Caladbolg II', type: 'N', types: ['N', 'A'], power: 5, mana: 4, fx: { reveal: true, once: true, terrainMul: 3, win: 4 }, text: 'เปิดชื่อจริง · ครั้งเดียวต่อเกม · ตอนใช้: ได้เปรียบพื้นที่ ×3 · ตอนปะทะ: ถ้าชนะ ได้ 4 VP [FD] (พลังและมานาเป็นค่าแทน)' },
      { name: 'Unlimited Blade Works', type: 'X', power: 4, mana: 6, fx: { reveal: true, ubw: UBW_PLAY, permanent: true }, text: 'เปิดชื่อจริง · ตอนใช้: การ์ดทั้งหมดในสำรับและกองทิ้งขึ้นมือ แล้วลงการ์ดได้ถึง 4 ใบ · ถาวร: จั่วการ์ดไม่ได้ ลงการ์ด 0–4 ใบแทน 2 ใบ · การ์ดในมือเหลือ 0 ใบ UBW ปิด [FD] (พลังและมานาเป็นค่าแทน)' },
      { name: 'Rho Aias', type: 'X', power: 3, mana: 2, fx: { zeroOpp: 'A' }, text: 'ตอนปะทะ: การ์ดว่องไวของคู่ต่อสู้พลังพื้นฐานเป็น 0 [FD] (พลังและมานาเป็นค่าแทน)' },
    ] },
  { key: 'cu', cls: 'Lancer', name: 'Cú Chulainn', note: 'แทง: สู้ 1 ต่อ 1 ชนะแน่นอน · ขว้าง: สู้กับหลายคนได้ VP มาก',
    deck: [S(2), S(3), A(2), ...n(A(4), 3), A(5), M(2), M(4), M(5), ...n(SURVEIL, 2)],
    skills: [
      { name: 'Gáe Bolg (แทง)', type: 'N', types: ['N', 'A'], power: 4, mana: 6, fx: { reveal: true, pierce: 2, duel: true }, text: 'เปิดชื่อจริง · ตอนใช้: มานาของใบนี้ +2 ถาวร · ตอนปะทะ: ถ้ามีคู่ต่อสู้คนเดียว คนนั้น [แพ้] [FD] (พลังและมานาเป็นค่าแทน)' },
      { name: 'Gáe Bolg (ขว้าง)', type: 'N', types: ['N', 'A'], power: 10, mana: 7, fx: { reveal: true, strike: 1 }, text: 'เปิดชื่อจริง · ตอนปะทะ: หลังต่อสู้ได้ 1 VP ต่อคู่ต่อสู้ 1 คน · ถ้าชนะ คู่ต่อสู้แต่ละคนเสีย VP เท่ากัน [FD] (พลังและมานาเป็นค่าแทน)' },
      { name: 'Lancer Class', type: 'A', types: ['A', 'X'], power: 5, mana: 2, fx: { move: 'any' }, text: 'ตอนใช้: ย้ายไปพื้นที่ไหนก็ได้ยกเว้นโรงฝึกเวท การ์ดตามไปด้วย [FD] · พลัง 5 [FD] (มานาเป็นค่าแทน)' },
    ] },
  { key: 'medusa', cls: 'Rider', name: 'Medusa', note: 'Bellerophon ย้าย สู้ และแย่งได้เปรียบพื้นที่ของคู่ต่อสู้ในทีเดียว · Riding ลงการ์ดหลายใบเพิ่มพลัง · ถ้าเงื่อนไขครบ ทำให้หลายคนแพ้ได้',
    deck: [S(2), S(3), S(5), ...n(A(3), 2), A(4), A(5), ...n(M(3), 2), SURVEIL, ...n(PREP, 2)],
    skills: [
      { name: 'Bellerophon', type: 'N', power: 8, mana: 9, fx: { reveal: true, bell: true }, text: 'เปิดชื่อจริง · ตอนใช้: ย้ายไปพื้นที่หนึ่ง (หรืออยู่สนามรบเดิม) การ์ดตามไปด้วย · ที่สนามรบ ยึดช่องได้เปรียบพื้นที่ทั้ง 2 ช่อง (+3 และ +1) คนอื่นเสียได้เปรียบพื้นที่ [FD] (พลังและมานาเป็นค่าแทน)' },
      { name: 'Petrification', type: 'M', power: 0, mana: 5, fx: { reveal: true, petrify: true }, text: 'เปิดชื่อจริง · ตอนปะทะ: คู่ต่อสู้ในสนามรบที่ไม่ได้ลงการ์ดชนิดพิเศษรอบนี้ [แพ้] ทั้งหมด [FD] (มานาเป็นค่าแทน)' },
      { name: 'Rider Class', type: 'X', power: 1, mana: 3, fx: { riding: RIDE_MAX, riderDraw: 1 }, text: 'ตอนใช้: ถ้าลงคู่กับการ์ดพื้นฐาน จั่ว 1 ใบ · ลงการ์ดจากมือที่พลังพื้นฐานไม่เกิน 3 เพิ่มได้ถึง 3 ใบ [FD] (พลังและมานาเป็นค่าแทน)' },
    ] },
  { key: 'medea', cls: 'Caster', name: 'Medea', note: 'เล่นยาก · ยิ่งเปิด Territory Creation เร็ว ยิ่งได้ใช้โรงฝึกเวทคุ้ม · Rule Breaker เป็นใบเดียวที่ยุ่งกับ Command Spell ของ Master อื่นได้',
    deck: [A(2), A(3), A(4), M(2), ...n(M(3), 2), ...n(M(4), 2), M(5), LUCK, SURVEIL, PREP],
    skills: [
      { name: 'Rule Breaker', type: 'N', types: ['N', 'S'], power: 0, mana: 3, fx: { reveal: true, once: true, ruleBreaker: 10 }, text: 'เปิดชื่อจริง · ครั้งเดียวต่อเกม · ตอนใช้: เลือก Master 1 คนในสนามรบเรา เขาเสีย Command Spell 1 ดวง · ก่อนเสียมีไม่เกิน 1 ดวง เขา [แพ้] · ก่อนเสียไม่มีเลย เราพลังรวม +10 [FD] (มานาเป็นค่าแทน)' },
      { name: 'Rain of Light', type: 'M', power: 3, mana: 2, fx: { reveal: true, rain: true }, text: 'เปิดชื่อจริง · ตอนปะทะ: ถ้าเราแพ้ Rule Breaker ที่ใช้ไปแล้วกลับช่องสกิล ใช้ได้อีกครั้ง [FD] (พลังและมานาเป็นค่าแทน)' },
      { name: 'Caster Class', type: 'M', power: 2, mana: 0, fx: { permanent: true, manaX: true, workshop: { mana: 1, vp: 2 } }, text: 'Territory Creation · ถาวร: ทุกครั้งที่วางหมากที่โรงฝึกเวท ได้มานา 1 และ 2 VP · มานา X = 16 − รอบ × 2 [FD] (พลังเป็นค่าแทน)' },
    ] },
  { key: 'kojiro', cls: 'Assassin', name: 'Sasaki Kojirō', note: 'การ์ดเกือบทั้งหมดเป็นชนิดว่องไว · ดาบแต่ละใบมีผลต่างกัน เช่นขัดความสามารถของคู่ต่อสู้ หรือลงการ์ดเพิ่ม · ลงดาบทั้ง 3 ใบพร้อมกัน เกิด Tsubame Gaeshi',
    deck: [S(2), S(3), S(4), A(2), ...n(A(3), 2), A(4), ...n(A(5), 2), ...n(LUCK, 2), SURVEIL],
    skills: [
      { name: '1st Strike', type: 'A', power: 2, mana: 1, fx: { sword: 1, no8: true, strike1: 2 }, text: 'ดาบที่หนึ่ง · ไม่ต้องมีมานา 8 · ตอนปะทะ: ปิดใบนี้ แล้วลงการ์ดกำลังพื้นฐานจากมือ 1 ใบ · ถ้าลงได้ ได้มานา 2 และปิดการ์ดพื้นฐานของคนอื่นในสนามรบเรา 1 ใบ [FD] (พลังและมานาเป็นค่าแทน)' },
      { name: '2nd Strike', type: 'A', power: 4, mana: 2, fx: { sword: 2, block: true }, text: 'ดาบที่สอง · ตอนใช้: คู่ต่อสู้ใช้ผล "ตอนใช้" "ตอนปะทะ" และ Command Spell ในสนามรบเราไม่ได้ · ไม่ยกเลิกผลที่ใช้ไปแล้ว [FD] (พลังและมานาเป็นค่าแทน)' },
      { name: '3rd Strike', type: 'A', power: 3, mana: 2, fx: { sword: 3, strike3: true }, text: 'ดาบที่สาม · ลงเพิ่มได้ถ้าลงการ์ดว่องไวอีก 2 ใบขึ้นไป · ลงพร้อม 1st Strike และ 2nd Strike: เปิดชื่อจริง พลังรวม +3 (Tsubame Gaeshi) [FD] (พลังและมานาเป็นค่าแทน)' },
    ] },
  { key: 'heracles', cls: 'Berserker', name: 'Heracles', note: 'พลังสูงโดยไม่ต้องใช้ NP · God Hand: แพ้แล้วยังได้ VP และลด VP ที่คู่ต่อสู้ได้',
    deck: [...n(S(2), 2), S(3), ...n(S(5), 2), BERSERKER('S', 7, 3), BERSERKER('S', 9, 5), A(2), A(4), BERSERKER('A', 7, 3), ...n(LUCK, 2)],
    skills: [1, 2, 3].map((k) => ({ name: `God Hand ${k}`, type: 'N', power: 5, mana: 1, fx: { reveal: true, godHand: 3 }, text: 'เปิดชื่อจริง · ตอนปะทะ: ถ้าแพ้ ได้ 3 VP และผู้ชนะแต่ละคนเสีย 3 VP · แล้วใบนี้ออกจากเกม God Hand ใบที่เหลือพลัง +3 ถาวร [FD] (พลังและมานาเป็นค่าแทน)' })),
  },
  // paper section 6.1: the two Servants the manual adds beyond the 5th war [p.17]
  { key: 'gilgamesh', cls: 'Archer', name: 'Gilgamesh', extra: true, note: 'วีรวิญญาณสีทองที่ไม่มีใครรู้ตัวตน · เพิ่มพลังจากได้เปรียบพื้นที่ และเพิ่ม VP ที่ได้ · Enuma Elish พลังสูง ควรใช้บ่อย',
    deck: [S(2), S(3), S(4), A(2), A(3), A(4), M(2), M(3), M(4), ...n(LUCK, 2), PREP],
    skills: [
      { name: 'Enuma Elish', type: 'N', power: 12, mana: 9, fx: { reveal: true, enuma: true }, text: 'เปิดชื่อจริง · ตอนปะทะ: คู่ต่อสู้ที่มีการ์ด NP/สกิลชนิดพิเศษลงอยู่หรือถาวรอยู่ [แพ้] ทั้งหมด [FD] · มานา 9 [FD] (พลังเป็นค่าแทน)' },
      { name: 'Gate of Babylon', type: 'N', power: 2, mana: 0, fx: { reveal: true, gate: true, terrainMul: 2 }, text: 'เปิดชื่อจริง · ตอนใช้: เลือกชนิดเพิ่มเองจากกำลัง ว่องไว เวท · มานา X = จำนวนชนิดที่เลือก (0–3 อนุมาน) · ได้เปรียบพื้นที่ ×2 [FD] (พลังเป็นค่าแทน)' },
      { name: 'Archer Class', type: 'Z', power: 2, mana: 3, fx: { archer: 3, archerLose: 5 }, text: 'Independent Action · ไม่มีชนิด [FD] · ลงได้เฉพาะครึ่งแรกของลำดับเล่นรอบนี้ · ตอนใช้: ได้ 3 VP · ถ้าแพ้การต่อสู้รอบนี้ เสีย 5 VP [FD] (พลังและมานาเป็นค่าแทน)' },
    ] },
  { key: 'hassan', cls: 'Assassin', name: 'Hassan of the Cursed Arm', extra: true, note: 'วีรวิญญาณนักฆ่าตัวจริง · สำหรับคนเล่นเก่ง · การ์ดโจมตีส่วนใหญ่อ่อน สู้ตรงๆ ยาก · ทำเงื่อนไขให้ครบแล้วใช้ Zabaniya พลิกเกมได้',
    deck: [S(2), S(3), S(4), A(3), A(4), A(5), M(2), ...n(M(3), 2), ...n(SURVEIL, 2), PREP],
    skills: [
      { name: 'Zabaniya', type: 'N', types: ['N', 'A'], power: 5, mana: 6, fx: { reveal: true, hiddenOnly: true, zab: true }, text: 'เปิดชื่อจริง · ลงได้เฉพาะตอนชื่อจริงยังซ่อน · ตอนปะทะ: ถ้าชนะคู่ต่อสู้ VP ที่ได้จากการต่อสู้นี้ ×2 · ถ้าเหลือคู่แข่งในเกมคนเดียว คนนั้น [แพ้] แทน [FD] (พลังและมานาเป็นค่าแทน)' },
      { name: 'Metamorphosis', type: 'A', power: 3, mana: 3, fx: { permanent: true, hide: true, playVP: 2 }, text: 'Self-Modification · ถาวร · ตอนใช้: ซ่อนชื่อจริงกลับ และได้ 2 VP [FD] (พลังและมานาเป็นค่าแทน)' },
      { name: 'Assassin Class', type: 'A', power: 2, mana: 2, fx: { presence: true }, text: 'Presence Concealment · ตอนปะทะ: หลังคิดพลัง คู่ต่อสู้พลังสูงสุด [แพ้] ถ้าเราพลังน้อยกว่าเขา ไม่มีคนอื่นพลังมากกว่าเรา และในสนามรบมี 3 คนขึ้นไป [FD] (พลังและมานาเป็นค่าแทน)' },
    ] },
];
export const TSUBAME = 3; // [FD]
export const SNAKE = [{ type: 'S', power: 5, mana: 0 }, { type: 'A', power: 5, mana: 0 }].map((x) => ({ ...x, fx: null, name: 'Snake', special: true, text: `การ์ดของคุซุกิในสำรับ · ${x.type === 'S' ? 'กำลัง' : 'ว่องไว'} พลัง 5 มานา 0 [4G] (ชนิดเป็นค่าแทน)` }));

// paper section 9: the four example cards written in the new label format. They are not real
// cards; the start screen can shuffle them in ("การ์ดตัวอย่าง") to try the card windows.
// u: one effect line { when (WINDOWS key), where (WHERE key), cond (COND key), fx }
const ex = (type, power, mana) => ({ type, power, mana, fx: null });
export const SAMPLE = [
  { ...ex('A', 2, 0), name: 'ตัวอย่าง · เก็บมานา', sample: true, use: [{ when: 'postPlace', where: 'workshop', fx: { mana: 1 } }], text: 'หลังวางหมาก · โรงฝึกเวท: ได้มานา +1' },
  { ...ex('M', 3, 2), name: 'ตัวอย่าง · สอดแนม', sample: true, use: [{ when: 'prep', where: 'any', fx: { peek: true } }], text: 'เตรียมการ: ดูอีเวนต์ชินโตะที่คว่ำอยู่' },
  { ...ex('S', 4, 2), name: 'ตัวอย่าง · ฝ่าวงล้อม', sample: true, use: [{ when: 'preMove', where: 'field', cond: 'engaged', fx: { freeMove: true } }], text: 'ก่อนย้าย · สนามรบ · ติดพัน: ย้ายได้แม้ติดพัน' },
];
export const SAMPLE_NP = { name: 'ตัวอย่าง · รายงานลาดตระเวน', type: 'N', power: 6, mana: 8, fx: {}, sample: true, limit: 'round', use: [{ when: 'end', where: 'recon', fx: { vp: 2 } }], text: 'จบรอบ · ลาดตระเวน: ได้ VP +2 · รอบละครั้ง' };

// paper section 11: 10 regular situation cards (8 used) and 3 climax ones [p.6, 11].
// Supply mana and rules ph (the v4.x list renamed).
const sit = (name, mana, fx, text) => ({ name, mana, fx, text });
export const SITUATIONS = [
  sit('ความโกรธเดือดพล่าน', 3, { up: 'S', n: 2 }, 'การ์ดกำลังพลัง +2'),
  sit('คืนก่อนพายุ', 3, { up: 'A', n: 2 }, 'การ์ดว่องไวพลัง +2'),
  sit('การไหลอันสมบูรณ์', 3, { up: 'M', n: 2 }, 'การ์ดเวทพลัง +2'),
  sit('คำสาปแห่งความชั่วร้ายทั้งปวง', 0, { noNP: true }, 'ห้ามใช้การ์ด NP'),
  sit('เงาแห่งความชั่วร้ายทั้งปวง', 0, { noNP: true }, 'ห้ามใช้การ์ด NP'),
  sit('ฆาตกรต่อเนื่องแห่งมิยามะ', 3, { extraEvent: 'miyama' }, 'เพิ่มอีเวนต์ที่ย่านมิยามะ 1 ใบ'),
  sit('ความวุ่นวายที่ชินโตะ', 3, { extraEvent: 'shinto' }, 'เพิ่มอีเวนต์ที่ย่านชินโตะ 1 ใบ'),
  sit('จุดเปลี่ยน', 4, { bonusUp: 2 }, 'VP ที่ผู้ชนะได้เพิ่ม +2'),
  sit('ทิวทัศน์อนาคตอันไกล', 0, { unify: 3 }, 'หงายการ์ดชนิดเดียวกัน 2 ใบพลัง +3'),
  sit('คืนที่เงียบสงบ', 2, {}, 'ไม่มีกฎเพิ่ม'),
];
export const CLIMAX = {
  4: sit('ไคลแมกซ์: เหลือ 4 คนขึ้นไป', 4, {}, 'จบรอบคัดออกจนเหลือไม่เกิน 2 คน'),
  3: sit('ไคลแมกซ์: เหลือ 3 คน', 4, {}, 'จบรอบคัดออกจนเหลือไม่เกิน 2 คน'),
  2: sit('ไคลแมกซ์: เหลือ 2 คน', 5, {}, 'จบรอบคนที่ VP น้อยกว่าออก'),
};

// 20 event cards: VP for that battlefield + a local rule [p.4]. List ph (the v4.x objects).
const ev = (name, vp, fx, text) => ({ name, vp, fx, text });
export const EVENTS = [
  ev('ยึดที่สูง', 3, { terrainUp: 1 }, 'ได้เปรียบพื้นที่ +1'),
  ev('จุดพักฟื้น', 2, { winMana: 2 }, 'ผู้ชนะได้มานา +2'),
  ev('ศึกสิ้นหวัง', 4, { underdog: 2 }, 'คนที่ VP น้อยสุดที่นี่พลัง +2'),
  ev('ช่วยอิลิยา', 5, {}, 'VP สูงสุดในกองอีเวนต์'),
  ev('เลื่อนขั้น', 3, { hiddenUp: 5 }, 'คนที่ชื่อจริงยังซ่อนพลัง +5'),
  ev('ผนึก', 3, { noSpecial: true }, 'การ์ดชนิดพิเศษพลัง 0'),
  ev('ดวลเพื่อเกียรติ', 2, { up: 'A', n: 2 }, 'การ์ดว่องไวพลัง +2'),
  ev('ร่างแกร่ง', 2, { up: 'S', n: 2 }, 'การ์ดกำลังพลัง +2'),
  ev('แท่นบูชายัญ', 2, { up: 'M', n: 2 }, 'การ์ดเวทพลัง +2'),
  ev('เผชิญชะตา', 3, { lowUp: 3 }, 'การ์ดพลัง 1–2 พลัง +3'),
  ev('ผลสีเงิน', 3, { unify: 4 }, 'หงายการ์ดชนิดเดียวกัน 2 ใบพลัง +4'),
  ev('การต่อสู้', 3, { up: 'S', n: 1 }, 'การ์ดกำลังพลัง +1'),
  ev('การยิง', 3, { up: 'A', n: 1 }, 'การ์ดว่องไวพลัง +1'),
  ev('แดนศักดิ์สิทธิ์', 3, { up: 'M', n: 1 }, 'การ์ดเวทพลัง +1'),
  ev('ลานกว้าง', 2, {}, 'ไม่มีกฎเพิ่ม'),
  ev('สะพานฟุยุกิ', 3, {}, 'ไม่มีกฎเพิ่ม'),
  ev('ศึกใหญ่', 4, {}, 'ไม่มีกฎเพิ่ม'),
  ev('คลังมานา', 2, { winMana: 3 }, 'ผู้ชนะได้มานา +3'),
  ev('หมอกหนา', 2, { noTerrain: true }, 'ได้เปรียบพื้นที่ไม่มีผล'),
  ev('ผู้เห็นเหตุการณ์', 2, { loserVP: 1 }, 'ผู้แพ้ได้ 1 VP'),
];
