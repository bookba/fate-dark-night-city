// Data for the v3.0 demo (design paper v3.0: Dominate Grail War, 24 Oct 2026).
// Everything marked ph (placeholder) is NOT from the original game: no public source
// lists the card numbers, so these values stand in until the real cards are known
// (paper section 13 question 2, section 14). Known values carry their source tag.

export const TYPES = { S: 'กำลัง', A: 'ว่องไว', M: 'เวท', N: 'NP', X: 'พิเศษ' };

// section 5: one-way path workshop → miyama → shinto → recon [4G]
export const AREAS = {
  workshop: { name: 'โรงฝึกเวท', jp: '魔術工房', cap: 4, field: false },
  miyama: { name: 'ย่านมิยามะ', jp: '深山町', cap: 99, field: true, bonus: 2 },
  shinto: { name: 'ย่านชินโตะ', jp: '新都', cap: 99, field: true, bonus: 3 },
  recon: { name: 'ลาดตระเวน', jp: '偵察', cap: 1, field: false },
};
export const PATH = ['workshop', 'miyama', 'shinto', 'recon'];
export const STEP_COST = [1, 2, 2]; // workshop→miyama, miyama→shinto, shinto→recon [4G]
export const WORKSHOP_MANA = [2, 1]; // first placer, everyone after [4G][RP]
export const TERRAIN = [3, 1]; // first and second placer on a battlefield [4G][RP]
export const RECON_RES = 2;
export const HAND = 3;
export const NP_MANA = 8; // NP/skill cards need 8+ mana held, then pay the card (default, question 5)
export const ROUNDS = { full: 8, casual: 4 };
export const CASUAL = { startMana: 2, alone: 2, win: { miyama: 4, shinto: 5 } }; // [RP]
export const CS_MANA = 4;
export const CS_POWER = 2;
export const CS_RES = 2;

// section 3. Starting mana: Shirou 2 [4G], Illya 6 [ฟามิซือ][4G], others "2–4" [ฟามิซือ] → 3 (ph)
export const MASTERS = [
  { key: 'shirou', name: 'เอมิยะ ชิโร่', short: 'ชิโร่', level: 'กลาง', mana: 2, cs: 3, color: '#b5462f',
    abil: ['Projection: มีมานา 8 ขึ้นไป ลงการ์ด Kanshou & Bakuya (มานา 1 พลัง 5) เพิ่มได้ 1 ใบ [4G]', 'Avalon: รอดการคัดออกครั้งแรกของไคลแมกซ์ [4G]', 'Inexperienced: ยังไม่มีข้อมูล'] },
  { key: 'rin', name: 'โทซากะ ริน', short: 'ริน', level: 'กลาง', mana: 3, manaPh: true, cs: 2, gems: 10, color: '#c0392b',
    abil: ['Jewel Magecraft: อัญมณี 10 [4G] · จ่าย Command Spell 1 ดวงเพื่อเริ่มใช้ [วิกิ] · ตอนสู้จ่ายอัญมณีได้ถึง 3 อัน อันละพลัง +1 (Gandr, ค่าแทน)', 'Absolute Obedience Order: ยังไม่มีข้อมูล'] },
  { key: 'sakura', name: 'มาโต้ ซากุระ', short: 'ซากุระ', level: 'สูง', mana: 3, manaPh: true, cs: 3, color: '#7b4fc9',
    abil: ['Engrave Fate: เริ่มรอบเสียมานา 2 ได้แต้มผลงาน 2 [4G]', 'Hidden Secret: ช่วงไคลแมกซ์ถ้าไม่ได้อันดับ 1 มานาไม่จำกัด และลงการ์ดเพิ่มได้ 1 ใบ [4G]', 'Symbol of Everyday Life: ยังไม่มีข้อมูล'] },
  { key: 'illya', name: 'อิลิยาสฟีล ฟอน ไอน์ซเบิร์น', short: 'อิลิยา', level: 'ง่าย', mana: 6, cs: 3, color: '#8a8fa3',
    abil: ['จบรอบได้มานา +1 [4G]', 'Masterpiece, Holy Grail: ยังไม่มีข้อมูล'] },
  { key: 'shinji', name: 'มาโต้ ชินจิ', short: 'ชินจิ', level: 'สูง', mana: 3, manaPh: true, cs: 3, color: '#5b7d3a',
    abil: ['เข้าย่านมิยามะได้มานา +1 และแต้มผลงาน +1 [วิกิ] (จำนวนเป็นค่าแทน)', 'ชนะพิเศษตอนเริ่มไคลแมกซ์: ยังไม่ทำ (รอความหมาย)', 'Absorbing Command, Book of False Attendant, Clown: ยังไม่มีข้อมูล'] },
  { key: 'kuzuki', name: 'คุซุกิ โซอิจิโร่', short: 'คุซุกิ', level: 'สูง', mana: 3, manaPh: true, cs: 3, color: '#4a5568',
    abil: ['Calm: ที่โรงฝึกเวทได้แต้มผลงานแทนมานา [4G]', 'Straightforward: ย้ายโรงฝึกเวท → มิยามะ ไม่เสียมานา [4G]', 'Snake: การ์ด Snake (มานา 0 พลัง 5) อยู่ในสำรับ [4G]'] },
  { key: 'kirei', name: 'โคโตมิเนะ คิเรย์', short: 'คิเรย์', level: 'ง่าย', mana: 3, manaPh: true, cs: 3, color: '#2d2a26',
    abil: ['Supervisor (ชื่อจริงยังซ่อน): จ่ายมานา 2 ไปลาดตระเวนได้จากทุกที่ [4G]', 'Proxy (ชื่อจริงเปิดแล้ว): พลังรวมตอนสู้ +2 [4G]'] },
];

// [type, power, mana, fx] — all ph except where noted
const c = (type, power, mana, fx = null) => ({ type, power, mana, fx });
const G = { guard: true }; // a Special card: not hit by "everyone without a Special card loses"

// 12 attack cards per Servant [RP]; numbers ph. Known: Berserker strength 9 [4G], Hassan agility 5 [4G]
// NP / skill cards: names [วิกิ]; effects from [4G][ฟามิซือ][GZ][วิกิ] where known, numbers ph
export const SERVANTS = [
  { key: 'artoria', cls: 'Saber', name: 'Artoria Pendragon',
    deck: [c('S', 5, 2), c('S', 4, 1), c('S', 4, 1), c('S', 3, 0), c('S', 3, 0), c('M', 4, 2), c('M', 3, 1), c('A', 3, 1), c('A', 2, 0), c('S', 6, 3), c('X', 2, 0, G), c('S', 2, 0)],
    np: [
      { name: 'Excalibur', type: 'N', power: 12, mana: 6, fx: { reveal: true, climax: 4 }, text: 'ช่วงไคลแมกซ์พลัง +4 [4G] (ไคลแมกซ์พลัง 16 [ฟามิซือ])' },
      { name: 'Invisible Air', type: 'N', power: 4, mana: 5, fx: { zeroOpp: 'S' }, text: 'การ์ดกำลังของคู่ต่อสู้ในสนามรบเดียวกัน พลังพื้นฐานเป็น 0 [4G]' },
      { name: 'Magic Resistance', type: 'M', power: 2, mana: 0, fx: { cancel: 'all' }, text: 'ยกเลิกผลพิเศษของการ์ดคู่ต่อสู้ [วิกิ] (ขอบเขตเป็นค่าแทน)' },
    ] },
  { key: 'emiya', cls: 'Archer', name: 'EMIYA',
    deck: [c('A', 4, 1), c('A', 3, 0), c('A', 3, 0), c('M', 4, 2), c('M', 3, 1), c('M', 5, 3), c('S', 3, 1), c('S', 2, 0), c('A', 5, 2), c('X', 2, 0, G), c('M', 2, 0, { mana: 1 }), c('A', 2, 0)],
    np: [
      { name: 'Unlimited Blade Works', type: 'N', power: 4, mana: 6, fx: { reveal: true, ubw: true }, text: 'เอาสำรับทั้งหมดขึ้นมือ ลงการ์ดได้ถึง 4 ใบ [4G][ฟามิซือ]' },
      { name: 'Caladbolg II', type: 'N', power: 5, mana: 4, fx: { reveal: true, once: true, terrainMul: 3, win: 4 }, text: 'ครั้งเดียวต่อเกม · ได้เปรียบพื้นที่ × 3 · ชนะแต้ม +4 [4G]' },
      { name: "Mind's Eye (True)", type: 'A', power: 2, mana: 0, fx: { ignoreTerrain: true }, text: 'ได้เปรียบพื้นที่ของคู่ต่อสู้ไม่มีผล (ค่าแทน)' },
    ] },
  { key: 'cu', cls: 'Lancer', name: 'Cú Chulainn',
    deck: [c('A', 5, 2), c('A', 4, 1), c('A', 4, 1), c('A', 3, 0), c('A', 3, 0), c('S', 4, 2), c('S', 3, 1), c('A', 6, 3), c('M', 2, 0), c('X', 2, 0, G), c('A', 2, 0, { win: 1 }), c('S', 2, 0)],
    np: [
      { name: 'Gáe Bolg (แทง)', type: 'N', power: 6, mana: 5, fx: { reveal: true, once: true, sure1v1: true }, text: 'ครั้งเดียวต่อเกม · ชนะแน่นอนในสนามรบที่สู้กัน 1 ต่อ 1 [4G][ฟามิซือ]' },
      { name: 'Gáe Bolg (ขว้าง)', type: 'N', power: 10, mana: 7, fx: { reveal: true, perFoe: true }, text: 'พลัง 10 [ฟามิซือ] · ชนะได้แต้มเพิ่มเท่าจำนวนคู่ต่อสู้ [4G]' },
      { name: 'Battle Continuation', type: 'S', power: 2, mana: 0, fx: { cont: 1 }, text: 'ถอนตัวจากการต่อสู้ที่เสียเปรียบ [วิกิ] · ถ้าแพ้ได้แต้ม 1 (ค่าแทน)' },
    ] },
  { key: 'medea', cls: 'Caster', name: 'Medea',
    deck: [c('M', 5, 2), c('M', 4, 1), c('M', 4, 1), c('M', 3, 0), c('M', 3, 0, { mana: 1 }), c('M', 6, 3), c('M', 2, 0, { mana: 1 }), c('A', 2, 0), c('S', 1, 0), c('X', 3, 1, G), c('M', 7, 4), c('A', 3, 1)],
    np: [
      { name: 'Rule Breaker', type: 'N', power: 0, mana: 5, fx: { reveal: true, once: true, ruleBreaker: 10 }, text: 'ครั้งเดียวต่อเกม · คู่ต่อสู้ที่มี Command Spell ไม่เกิน 1 ดวงแพ้ทันทีและเหลือ 0 ดวง · ตัวเองพลัง +10 [4G]' },
      { name: 'Bride of Mythology and Ashes', type: 'M', power: 3, mana: 2, fx: { mana: 2 }, text: 'ยังไม่มีข้อมูล · ได้มานา +2 (ค่าแทน)' },
      { name: 'Territory Creation', type: 'M', power: 1, mana: 0, fx: { linger: 3 }, text: 'ช่วยตั้งโรงฝึกเวทได้เร็ว [วิกิ] · ต่อเนื่อง: รอบถัดไปได้มานา +3 (ค่าแทน)' },
    ] },
  { key: 'medusa', cls: 'Rider', name: 'Medusa',
    deck: [c('A', 4, 1), c('A', 4, 1), c('A', 3, 0), c('A', 3, 0), c('S', 3, 1), c('S', 4, 2), c('M', 3, 1), c('A', 5, 2), c('X', 2, 0, G), c('A', 2, 0), c('A', 2, 0), c('S', 5, 3)],
    np: [
      { name: 'Bellerophon', type: 'N', power: 7, mana: 6, fx: { reveal: true, bell: true }, text: 'ย้ายไปพื้นที่ไหนก็ได้ไม่สนการติดพัน · ถ้าเป็นสนามรบ ยึดโทเคนได้เปรียบพื้นที่ทั้งหมด [4G]' },
      { name: 'Mystic Eyes of Petrification', type: 'M', power: 0, mana: 3, fx: { petrify: true }, text: 'คู่ต่อสู้ในสนามรบเดียวกันที่ไม่ได้ลงการ์ดพิเศษ แพ้ทั้งหมด [4G]' },
      { name: 'Riding', type: 'A', power: 1, mana: 1, fx: { riding: 3 }, text: 'ลงการ์ดเพิ่มกี่ใบก็ได้ที่พลังไม่เกิน 3 [GZ]' },
    ] },
  { key: 'heracles', cls: 'Berserker', name: 'Heracles',
    deck: [c('S', 9, 4), c('S', 6, 2), c('S', 5, 2), c('S', 5, 1), c('S', 4, 1), c('S', 4, 1), c('S', 3, 0), c('S', 3, 0), c('S', 2, 0), c('A', 3, 1), c('X', 1, 0, G), c('S', 7, 3)],
    np: [
      { name: 'God Hand', type: 'N', power: 0, mana: 4, fx: { reveal: true, godHand: 3 }, text: 'ใช้ตอนแพ้: แต้มที่ผู้ชนะได้ลดลง 3 · ตัวเองได้แต้ม 3 [4G] (ลดลง 3 เป็นค่าแทน)' },
      { name: 'Valor (ชื่อชั่วคราว)', type: 'S', power: 4, mana: 1, fx: { win: 1 }, text: 'การ์ดใบนี้ยังไม่มีข้อมูล · ชนะแต้ม +1 (ค่าแทน)' },
      { name: 'Eye of the Mind (False) (ชื่อชั่วคราว)', type: 'A', power: 2, mana: 0, fx: { ignoreTerrain: true }, text: 'การ์ดใบนี้ยังไม่มีข้อมูล · ได้เปรียบพื้นที่ของคู่ต่อสู้ไม่มีผล (ค่าแทน)' },
    ] },
  { key: 'kojiro', cls: 'Assassin', name: 'Sasaki Kojirō',
    deck: [c('A', 5, 2), c('A', 4, 1), c('A', 4, 1), c('A', 3, 0), c('A', 3, 0), c('S', 3, 1), c('A', 6, 3), c('M', 2, 0), c('X', 2, 0, G), c('A', 2, 0, { win: 1 }), c('S', 2, 0), c('A', 3, 0)],
    np: [
      { name: 'One Sword', type: 'N', power: 3, mana: 1, fx: {}, text: 'การ์ด NP · มานาและพลังต่างกันไป [4G]' },
      { name: 'Two Swords', type: 'N', power: 4, mana: 3, fx: { cancel: 'first' }, text: 'ถ้าเราลงก่อน (ลำดับก่อน) ยกเลิกผลพิเศษของการ์ดคู่ต่อสู้ [4G]' },
      { name: 'Three Swords', type: 'N', power: 5, mana: 5, fx: { tsubame: 8 }, text: 'ถ้าเคยใช้ One Sword และ Two Swords แล้ว กลายเป็น Tsubame Gaeshi พลัง +8 และเปิดชื่อจริง [4G] (+8 ค่าแทน)' },
    ] },
  { key: 'gilgamesh', cls: 'Archer', name: 'Gilgamesh',
    deck: [c('M', 5, 2), c('M', 4, 1), c('S', 4, 1), c('S', 5, 2), c('M', 3, 0), c('S', 3, 0), c('M', 6, 3), c('A', 3, 1), c('S', 2, 0), c('X', 2, 0, G), c('M', 7, 4), c('A', 2, 0)],
    np: [
      { name: 'Enuma Elish', type: 'N', power: 14, mana: 7, fx: { reveal: true }, text: 'พลังพื้นฐานสูงสุดในเกม [4G]' },
      { name: 'Gate of Babylon', type: 'N', power: 3, mana: 3, fx: { reveal: true, allTypes: true, terrainMul: 2 }, text: 'มานา 3 · มีครบทุกชนิด · ได้เปรียบพื้นที่ของตัวเอง × 2 [4G]' },
      { name: 'Independent Action', type: 'X', power: 2, mana: 0, fx: { freeMana: true, guard: true }, text: 'ยังไม่มีข้อมูล · การ์ดอีกใบไม่ต้องจ่ายมานา (ค่าแทน)' },
    ] },
  { key: 'hassan', cls: 'Assassin', name: 'Hassan of the Cursed Arm',
    deck: [c('A', 5, 1), c('A', 4, 1), c('A', 3, 0), c('A', 3, 0), c('X', 3, 0, G), c('X', 2, 0, G), c('A', 4, 1), c('S', 3, 1), c('M', 2, 0), c('A', 6, 3), c('A', 2, 0, { win: 1 }), c('S', 2, 0)],
    np: [
      { name: 'Zabaniya', type: 'N', power: 6, mana: 5, fx: { reveal: true, hidden: true, doubleRes: true }, text: 'ใช้ได้เฉพาะตอนชื่อจริงยังซ่อน · ชนะแล้วแต้มผลงานที่มีอยู่ × 2 [4G]' },
      { name: 'Presence Concealment', type: 'A', power: 1, mana: 0, fx: { ignoreTerrain: true }, text: 'ยังไม่มีข้อมูล · ได้เปรียบพื้นที่ของคู่ต่อสู้ไม่มีผล (ค่าแทน)' },
      { name: 'Self-Modification', type: 'X', power: 2, mana: 2, fx: { rehide: true, guard: true }, text: 'ซ่อนชื่อจริงที่เปิดไปแล้วกลับได้ [4G]' },
    ] },
];

// Master special cards [4G]
export const KANSHOU = { name: 'Kanshou & Bakuya', type: 'S', power: 5, mana: 1, fx: null, special: true };
export const SNAKE = { name: 'Snake', type: 'S', power: 5, mana: 0, fx: null };

// 20 event cards, all ph: v = battle results for the winner, fx = battlefield effect
const ev = (name, v, fx = null, text = '') => ({ name, v, fx, text });
export const EVENTS = [
  ev('ลานกว้าง', 2), ev('สะพานฟุยูกิ', 3), ev('ลานฝึกดาบ', 2, { up: 'S', n: 1 }, 'การ์ดกำลัง +1'),
  ev('หลังคาตึก', 2, { up: 'A', n: 1 }, 'การ์ดว่องไว +1'), ev('เส้นแร่ลับ', 2, { up: 'M', n: 1 }, 'การ์ดเวท +1'),
  ev('คลังมานา', 3, { winMana: 2 }, 'ผู้ชนะได้มานา +2'), ev('ไอมานาลอย', 1, { allMana: 1 }, 'ทุกคนที่นี่ได้มานา +1'),
  ev('หมอกหนา', 2, { noTerrain: true }, 'ได้เปรียบพื้นที่ไม่มีผล'), ev('ผู้เห็นเหตุการณ์', 2, { loserRes: 1 }, 'ผู้แพ้ได้แต้ม 1'),
  ev('ตรอกแคบ', 3, { underdog: 2 }, 'คนแต้มน้อยสุดที่นี่ พลัง +2'), ev('ศึกใหญ่', 4), ev('โกดังท่าเรือ', 1, { winMana: 3 }, 'ผู้ชนะได้มานา +3'),
  ev('สนามกีฬา', 2, { up: 'S', n: 2 }, 'การ์ดกำลัง +2'), ev('ป่าริมแม่น้ำ', 3, { up: 'A', n: 1 }, 'การ์ดว่องไว +1'),
  ev('วงเวทโบราณ', 3, { up: 'M', n: 1 }, 'การ์ดเวท +1'), ev('ตลาดกลางคืน', 2, { allMana: 1 }, 'ทุกคนที่นี่ได้มานา +1'),
  ev('พายุฝน', 4, { noTerrain: true }, 'ได้เปรียบพื้นที่ไม่มีผล'), ev('ข่าวลือ', 2, { loserRes: 1 }, 'ผู้แพ้ได้แต้ม 1'),
  ev('ทางตัน', 1, { underdog: 2 }, 'คนแต้มน้อยสุดที่นี่ พลัง +2'), ev('จุดยุทธศาสตร์', 3),
];

// 10 normal situation cards + 3 climax cards [RP]; effects all ph
const si = (name, fx, text) => ({ name, fx, text });
export const SITUATIONS = [
  si('คืนแรกของสงคราม', {}, 'ไม่มีผล'), si('ฤดูแห่งกำลัง', { up: 'S', n: 1 }, 'การ์ดกำลังทุกใบ พลัง +1'),
  si('จันทร์เต็มดวง', { up: 'M', n: 1 }, 'การ์ดเวททุกใบ พลัง +1'), si('ลมกรรโชก', { up: 'A', n: 1 }, 'การ์ดว่องไวทุกใบ พลัง +1'),
  si('เส้นแร่มานาตื่น', { workshop: 1 }, 'โรงฝึกเวทให้มานาเพิ่ม +1'), si('ศึกสองแนว', { extraEvent: true }, 'สนามรบละ 2 อีเวนต์ [GZ]'),
  si('สายลับทั่วเมือง', { recon: 1 }, 'ลาดตระเวนได้แต้มเพิ่ม +1'), si('ทางลัด', { moveCut: 1 }, 'ค่าย้ายทุกช่วง −1'),
  si('ป้อมปราการ', { terrain: 1 }, 'ได้เปรียบพื้นที่ +1'), si('คืนอันยาวนาน', { hand: 4 }, 'จั่วจนมือมี 4 ใบ'),
];
export const CLIMAX = [
  si('ไคลแมกซ์: เหลือ 4 คนขึ้นไป', { mana: 2, cutTo: 2 }, 'เริ่มรอบทุกคนได้มานา +2 · จบรอบคัดออกจนเหลือ 2 คน'),
  si('ไคลแมกซ์: เหลือ 3 คน', { mana: 3, cutTo: 2 }, 'เริ่มรอบทุกคนได้มานา +3 · จบรอบคัดออกจนเหลือ 2 คน'),
  si('ไคลแมกซ์: เหลือ 2 คน', { mana: 4, cutTo: 1 }, 'เริ่มรอบทุกคนได้มานา +4 · จบรอบคนแต้มน้อยกว่าตกรอบ'),
];
