// Data for the v5.0 demo (design paper v5.0, 25 Oct 2026): rules from the official
// Dominate Grail War manual. One stage (the Fuyuki board), the 7 Fate/stay night Masters and
// the 7 Servants of the 5th war. Sources: [p.N] manual page, [4G] play reports used in paper
// v3.0, [GZ] GIGAZINE, [NW] Fate/Domination NamuWiki (placeholders only). ph = placeholder.

export const TYPES = { S: 'กำลัง', A: 'ว่องไว', M: 'เวท', X: 'พิเศษ', N: 'NP' };

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
export const START_MANA = 4; // ph: the manual prints it on each Master board, unreadable
export const CS_MANA = 4; // [p.10]
export const CS_POWER = 2; // [p.10]
export const CS_VP = 2; // [p.10]
export const SAKURA_FROM = 5; // ph: Engraved Fate stays off early in a 7-player game [p.14]
export const MAX_ROUNDS = 20; // safety stop for endless ties at the cut line

// paper section 5 [p.14–15], details [4G]
export const MASTERS = [
  { key: 'shirou', tok: 'ชิ', name: 'เอมิยะ ชิโร่', short: 'ชิโร่', en: 'Emiya Shirou', color: '#c2553a', mana: 2, cs: 3, level: 'กลาง',
    abil: [['未熟 ไม่ชำนาญ', 'มานาเริ่ม 2 ต่ำกว่าคนอื่น'], ['投影 Projection', 'การ์ดพิเศษ Kanshou & Bakuya อยู่ในมือตลอด ใช้แล้วกลับมือ'], ['全て遠き理想郷 Avalon', 'ไม่ตกรอบตอนคัดออกหลังรอบ 8']] },
  { key: 'rin', tok: 'ริ', name: 'โทซากะ ริน', short: 'ริน', en: 'Tohsaka Rin', color: '#b8323a', mana: 4, cs: 2, gems: 10, level: 'กลาง',
    abil: [['絶対服従の命令 Absolute Obedience Order', 'เริ่มเกม Command Spell ขาด 1 ดวง เหลือ 2'], ['宝石魔術 Jewel Magecraft', 'อัญมณี 10 อัน ใช้ในตาของตัวเอง: ลงการ์ดพิเศษ Gand (1 อัน) · จ่ายแทนมานา (1 อัน = 1) · แลกการ์ดในมือ (1 อัน รอบละครั้ง) · จำนวนอันเป็นค่าแทน']] },
  { key: 'sakura', tok: 'ซา', name: 'มาโต้ ซากุระ', short: 'ซากุระ', en: 'Matou Sakura', color: '#7b52c7', mana: 4, cs: 3, level: 'สูง',
    abil: [['刻まれた宿命 Engraved Fate', `เริ่มรอบถูกบังคับเสียมานา 2 ได้ 2 VP · เล่น 7 คนเริ่มทำงานรอบ ${SAKURA_FROM} (รอบเป็นค่าแทน)`], ['隠された秘密 Hidden Secret', 'เริ่มรอบไคลแมกซ์ถ้าไม่ได้อันดับ 1: มานาไม่จำกัด ลงการ์ดเพิ่มได้ 1 ใบ'], ['日常の象徴 Symbol of Everyday Life', 'คู่มือไม่ได้บอกผล ยังไม่มีผลในเดโม']] },
  { key: 'illya', tok: 'อิ', name: 'อิลิยาสฟีล ฟอน ไอน์ซเบิร์น', short: 'อิลิยา', en: 'Illyasviel', color: '#9aa0b8', mana: 6, cs: 3, level: 'ง่าย',
    abil: [['最高傑作 Masterpiece · 聖杯 Holy Grail', 'มานาเริ่ม 6 สูงกว่าคนอื่น · ได้มานา +1 ทุกรอบ']] },
  { key: 'shinji', tok: 'ชน', name: 'มาโต้ ชินจิ', short: 'ชินจิ', en: 'Matou Shinji', color: '#5f8a3c', mana: 4, cs: 3, level: 'สูง',
    abil: [['吸魔命令 Absorbing Command', 'เข้าย่านมิยามะแต่ละครั้งได้มานา +1 (จำนวนเป็นค่าแทน)'], ['道化 Clown', 'เล่น 7 คน: อยู่อันดับสุดท้ายคนเดียวตอนจบรอบ 8 = ชนะทันที'], ['偽臣の書 Book of False Attendant', 'คู่มือไม่ได้บอกผล ยังไม่มีผลในเดโม']] },
  { key: 'kuzuki', tok: 'คุ', name: 'คุซุกิ โซอิจิโร่', short: 'คุซุกิ', en: 'Kuzuki Souichirou', color: '#56627a', mana: 4, cs: 3, level: 'สูง',
    abil: [['平穏 Calm', 'ที่โรงฝึกเวทไม่ได้มานา ได้ VP เท่ากันแทน'], ['暗殺拳「蛇」 Snake', 'การ์ดพิเศษ Snake 2 ใบอยู่ในสำรับ (มานา 0 พลัง 5)'], ['実直 Straightforward', 'ย้ายโรงฝึกเวท → มิยามะ มานา 0']] },
  { key: 'kirei', tok: 'คิ', name: 'โคโตมิเนะ คิเรย์', short: 'คิเรย์', en: 'Kotomine Kirei', color: '#3a3430', mana: 4, cs: 3, level: 'ง่าย',
    abil: [['監督役 Supervisor', 'ตอนชื่อจริงยังซ่อน: ไปลาดตระเวนได้จากทุกที่ แม้ติดพัน (มานา 2)'], ['代行者 Proxy', 'ตอนชื่อจริงเปิดแล้ว: พลังรวม +2']] },
];

// special cards [p.18]: K&B and Gand stay in hand and come back after use; Snake is shuffled in
export const KANSHOU = { name: 'Kanshou & Bakuya', type: 'S', power: 5, mana: 1, fx: { needMana: true }, special: true, text: 'การ์ดพิเศษของชิโร่ · มานา 1 พลัง 5 · ต้องมีมานา 8 ขึ้นไป [4G] · ใช้แล้วกลับมือ' };
export const GAND = { name: 'Gand', type: 'M', power: 1, mana: 0, fx: { gand: true }, special: true, text: 'การ์ดพิเศษของริน · ใช้อัญมณี 1 อัน · ใช้แล้วกลับมือ (พลังและจำนวนอัญมณีเป็นค่าแทน)' };
export const GEM_GAND = 1;
export const GEM_SWAP = 1;

const c = (type, power, mana, fx = null) => ({ type, power, mana, fx });
const G = { guard: true }; // a Special-type card: safe from Mystic Eyes of Petrification

// 12 attack cards per Servant: all numbers ph (unreadable in the manual), shaped by its notes.
// NP/skill cards: names [p.15–17], effects [p.15–17] and [4G], numbers ph unless marked.
export const SERVANTS = [
  { key: 'artoria', cls: 'Saber', name: 'Artoria Pendragon',
    deck: [c('S', 6, 3), c('S', 5, 2), c('S', 4, 1), c('S', 4, 1), c('S', 3, 0), c('S', 3, 0), c('M', 3, 1), c('M', 2, 0), c('A', 3, 1), c('A', 2, 0), c('X', 2, 0, G), c('S', 2, 0)],
    skills: [
      { name: 'Excalibur', type: 'N', power: 12, mana: 8, fx: { reveal: true }, text: '真名解放 · มานา 8 พลัง 12 · พลังสูงอันดับ 1–2 ของ NP ทั้งหมด [p.15] (พลังจากการ์ดตัวอย่าง p.4)' },
      { name: 'Invisible Air', type: 'S', power: 4, mana: 2, fx: { zeroOpp: 'S' }, text: 'ตอนปะทะ: การ์ดกำลังของคู่ต่อสู้พลังพื้นฐานเป็น 0 [4G] (มานาและพลังเป็นค่าแทน)' },
      { name: 'Magic Resistance', type: 'M', power: 3, mana: 2, fx: { zeroOpp: 'M' }, text: 'ตอนปะทะ: การ์ดเวทของคู่ต่อสู้พลังพื้นฐานเป็น 0 (ผลและตัวเลขเป็นค่าแทน)' },
    ] },
  { key: 'emiya', cls: 'Archer', name: 'EMIYA',
    deck: [c('A', 4, 1), c('A', 3, 0), c('A', 3, 0), c('M', 4, 2), c('M', 3, 1), c('S', 3, 1), c('S', 2, 0), c('A', 5, 2), c('X', 2, 0, G), c('M', 2, 0, { mana: 1 }), c('A', 2, 0), c('M', 2, 0)],
    skills: [
      { name: 'Unlimited Blade Works', type: 'N', power: 4, mana: 6, fx: { reveal: true, ubw: 4 }, text: '真名解放 · เอาสำรับทั้งหมดขึ้นมือ แล้วลงการ์ดโจมตีได้ถึง 4 ใบ [p.15][4G] (มานาและพลังเป็นค่าแทน)' },
      { name: 'Caladbolg II', type: 'N', power: 5, mana: 4, fx: { reveal: true, once: true, terrainMul: 3, win: 4 }, text: '真名解放 · ครั้งเดียวต่อเกม · ได้เปรียบพื้นที่ × 3 · ชนะได้ VP +4 [4G] (มานาและพลังเป็นค่าแทน)' },
      { name: "Mind's Eye (True)", type: 'A', power: 3, mana: 2, fx: { terrainMul: 2 }, text: 'ได้เปรียบพื้นที่ × 2 (ผลและตัวเลขเป็นค่าแทน จากที่คู่มือว่า Archer เก่งใช้ได้เปรียบพื้นที่)' },
    ] },
  { key: 'cu', cls: 'Lancer', name: 'Cú Chulainn',
    deck: [c('A', 5, 2), c('A', 4, 1), c('A', 4, 1), c('A', 3, 0), c('A', 3, 0), c('S', 4, 2), c('S', 3, 1), c('A', 6, 3), c('M', 2, 0), c('X', 2, 0, G), c('A', 2, 0), c('S', 2, 0)],
    skills: [
      { name: 'Gáe Bolg (แทง)', type: 'N', power: 4, mana: 6, fx: { reveal: true, once: true, duel: true }, text: '真名解放 · ครั้งเดียวต่อเกม · ตอนปะทะ: สู้ 1 ต่อ 1 คู่ต่อสู้ [แพ้] [p.16][4G] (มานาและพลังเป็นค่าแทน)' },
      { name: 'Gáe Bolg (ขว้าง)', type: 'N', power: 10, mana: 7, fx: { reveal: true, perFoe: 1 }, text: '真名解放 · พลัง 10 · ชนะแล้วได้ VP +1 ต่อคู่ต่อสู้ 1 คน [p.16][4G] (มานาและจำนวน VP เป็นค่าแทน)' },
      { name: 'Battle Continuation', type: 'A', power: 2, mana: 2, fx: { move: true }, text: 'ตอนใช้: ถอนตัวไปพื้นที่อื่นได้ (ยกเว้นโรงฝึกเวท) [p.16] (วิธีถอนตัวและตัวเลขเป็นค่าแทน)' },
    ] },
  { key: 'medusa', cls: 'Rider', name: 'Medusa',
    deck: [c('A', 3, 1), c('A', 3, 0), c('A', 3, 0), c('A', 2, 0), c('S', 3, 1), c('S', 5, 2), c('M', 3, 1), c('A', 5, 2), c('X', 2, 0, G), c('A', 2, 0), c('A', 1, 0), c('S', 3, 0)],
    skills: [
      { name: 'Bellerophon', type: 'N', power: 8, mana: 9, fx: { reveal: true, bell: true }, text: '真名解放 · ตอนใช้: ย้ายได้ไม่สนการติดพัน แล้วยึดได้เปรียบพื้นที่ของคู่ต่อสู้ทั้งหมด [p.16][4G] (มานาและพลังเป็นค่าแทน)' },
      { name: 'Mystic Eyes of Petrification', type: 'M', power: 0, mana: 5, fx: { petrify: true }, text: 'ตอนปะทะ: คู่ต่อสู้ที่ไม่ได้ลงการ์ดชนิดพิเศษ [แพ้] ทั้งหมด [4G] (มานาเป็นค่าแทน)' },
      { name: 'Riding', type: 'A', power: 1, mana: 3, fx: { riding: 3 }, text: 'ลงการ์ดพลังไม่เกิน 3 เพิ่มได้กี่ใบก็ได้ [p.16][GZ] (มานาและพลังเป็นค่าแทน)' },
    ] },
  { key: 'medea', cls: 'Caster', name: 'Medea',
    deck: [c('M', 5, 2), c('M', 4, 1), c('M', 4, 1), c('M', 3, 0), c('M', 3, 0, { mana: 1 }), c('M', 6, 3), c('M', 2, 0, { mana: 1 }), c('A', 2, 0), c('S', 1, 0), c('X', 3, 1, G), c('M', 2, 0), c('A', 3, 1)],
    skills: [
      { name: 'Rule Breaker', type: 'N', power: 0, mana: 3, fx: { reveal: true, once: true, ruleBreaker: 10 }, text: '真名解放 · ครั้งเดียวต่อเกม · ตอนปะทะ: คู่ต่อสู้ที่มี Command Spell ไม่เกิน 1 ดวง [แพ้] และเหลือ 0 ดวง · ตัวเองพลัง +10 [p.16][4G] (มานาเป็นค่าแทน)' },
      { name: 'Hecatic Graea', type: 'M', power: 8, mana: 5, fx: {}, text: 'มานา 5 พลัง 8 (ตัวเลขเป็นค่าแทน)' },
      { name: 'Territory Creation', type: 'M', power: 2, mana: 4, fx: { residual: true, workshopVP: 1, workshopMana: 1 }, text: 'ค้าง: ตั้งแต่รอบถัดไป รอบที่อยู่โรงฝึกเวทได้มานา +1 และ 1 VP · ยิ่งเปิดเร็วยิ่งคุ้ม [p.16] (ตัวเลขเป็นค่าแทน)' },
    ] },
  { key: 'kojiro', cls: 'Assassin', name: 'Sasaki Kojirō',
    deck: [c('A', 5, 2), c('A', 5, 1), c('A', 4, 1), c('A', 4, 0), c('A', 3, 0), c('S', 3, 1), c('A', 7, 3), c('M', 2, 0), c('X', 2, 0, G), c('A', 3, 0), c('S', 2, 0), c('A', 3, 0)],
    skills: [
      { name: 'ดาบที่หนึ่ง', type: 'A', power: 6, mana: 4, fx: { sword: 1 }, text: 'ดาบของ Tsubame Gaeshi (ตัวเลขเป็นค่าแทน)' },
      { name: 'ดาบที่สอง', type: 'A', power: 4, mana: 2, fx: { sword: 2, cancel: true }, text: 'ตอนปะทะ: ถ้าเราลงการ์ดก่อน ผลการ์ดของคู่ต่อสู้ในสนามรบนี้ไม่ทำงาน [p.17][4G] (ตัวเลขเป็นค่าแทน)' },
      { name: 'ดาบที่สาม', type: 'A', power: 3, mana: 2, fx: { sword: 3, extra: 1 }, text: 'ลงการ์ดเพิ่มได้ 1 ใบ [p.17] · ลงดาบครบ 3 ใบพร้อมกัน = 燕返し Tsubame Gaeshi พลัง +8 และเปิดชื่อจริง (ตัวเลขเป็นค่าแทน)' },
    ] },
  { key: 'heracles', cls: 'Berserker', name: 'Heracles',
    deck: [c('S', 9, 4), c('S', 7, 3), c('S', 7, 3), c('S', 4, 2), c('S', 4, 1), c('S', 3, 1), c('S', 3, 0), c('A', 3, 1), c('A', 2, 0), c('A', 2, 0), c('X', 1, 0, G), c('M', 2, 0)],
    skills: [1, 2, 3].map((n) => ({ name: `God Hand ${n}`, type: 'S', power: 5, mana: 1, fx: { godHand: 3, once: true }, text: 'ตอนปะทะ: ถ้าแพ้ ยังได้ 3 VP [4G] และ VP ที่ผู้ชนะได้ลดลง 3 · ใบละครั้งต่อเกม (ครั้งเดียว จำนวนที่ลด มานา และพลังเป็นค่าแทน)' })),
  },
];
export const TSUBAME = 8; // ph
export const SNAKE = [c('S', 5, 0), c('A', 5, 0)].map((x) => ({ ...x, name: 'Snake', special: true })); // power [4G], mana [4G], types ph

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
