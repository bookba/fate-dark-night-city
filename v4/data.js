// Data for the v4.0 demo (design paper v4.0: Fate/Domination, 24 Oct 2026). One stage
// (the Fuyuki board) and only the Fate/stay night Masters and Servants.
// Sources: [NW] NamuWiki Fate/Domination pages, [v3] Dominate Grail War values from paper v3.0
// where Fate/Domination sources say nothing. ph = placeholder, not from any source.

export const TYPES = { S: 'กำลัง', A: 'ว่องไว', M: 'เวท', X: 'พิเศษ', N: 'NP' };

// paper section 5
export const AREAS = {
  workshop: { name: 'โรงฝึกเวท', en: 'Magic Workshop', field: false },
  miyama: { name: 'ย่านมิยามะ', en: 'Miyama', field: true, bonus: 2 }, // bonus [v3]
  shinto: { name: 'ย่านชินโตะ', en: 'Shinto', field: true, bonus: 3 }, // bonus [v3]
  recon: { name: 'ลาดตระเวน', en: 'Recon', field: false },
};
export const PATH = ['workshop', 'miyama', 'shinto', 'recon'];
export const STEP_COST = [1, 2, 2]; // [NW]
export const WORKSHOP = [2, 1, 1, 1]; // mana per workshop space, numbers [v3]
export const TERRAIN = [3, 1]; // geographic advantage spaces per battlefield [v3]
export const RECON_VP = 2; // [NW]
export const HAND = 3;
export const SKILL_MANA = 8; // the 8-mana rule [NW]
export const ROUNDS = 11; // 8 regular + 3 climax [NW]
export const REGULAR = 8;
export const CUT = { 8: 4, 9: 3, 10: 2 }; // players left after these rounds [NW]
export const START_MANA = 4; // [NW]
export const CS_MANA = 4; // [NW]
export const CS_POWER = 2;
export const CS_VP = 2;

// paper section 3 [NW]
export const MASTERS = [
  { key: 'shirou', name: 'เอมิยะ ชิโร่', short: 'ชิโร่', en: 'Emiya Shirou', color: '#c2553a', mana: 2, cs: 3,
    abil: [['Kanshou & Bakuya', 'การ์ดสกิลของ Master: มานา 1 พลัง 5 ชนิดกำลัง ใช้ตามกฎมานา 8'], ['Avalon', 'รอดการคัดออกได้ 1 ครั้ง (จบรอบ 8–10) แต่มานาหมด']] },
  { key: 'rin', name: 'โทซากะ ริน', short: 'ริน', en: 'Tohsaka Rin', color: '#b8323a', mana: 4, cs: 3, gems: 10,
    abil: [['Jewel Magecraft', 'อัญมณี 10 อัน · จ่ายแทนมานาได้ หรือเพิ่มพลังอันละ +1 (สูงสุด 3 ต่อรอบ, ค่าแทน)'], ['Absolute Obedience Order', 'รอบ 1 เสีย Command Spell 1 ดวง']] },
  { key: 'sakura', name: 'มาโต้ ซากุระ', short: 'ซากุระ', en: 'Matou Sakura', color: '#7b52c7', mana: 4, cs: 0,
    abil: [['ไม่มี Command Spell', ''], ['เงาดำ', 'จบรอบถ้าอยู่อันดับสุดท้ายคนเดียว จ่ายมานา 2 ได้ 2 VP'], ['จอกที่แปดเปื้อน', 'รอบไคลแมกซ์ถ้าไม่ได้อันดับ 1 มานาไม่จำกัด ลงการ์ดได้ 3 ใบ']] },
  { key: 'illya', name: 'อิลิยาสฟีล ฟอน ไอน์ซเบิร์น', short: 'อิลิยา', en: 'Illyasviel', color: '#9aa0b8', mana: 6, cs: 3,
    abil: [['ผลงานชิ้นเอก', 'เริ่มมานา 6 (อนุมาน) · ได้มานา +1 ทุกรอบปกติ']] },
  { key: 'shinji', name: 'มาโต้ ชินจิ', short: 'ชินจิ', en: 'Matou Shinji', color: '#5f8a3c', mana: 4, cs: 3,
    abil: [['คำสั่งดูดมานา', 'จบรอบที่ย่านมิยามะได้มานา +1'], ['ตัวตลก', 'ถ้า [แพ้] เสีย Command Spell 1 ดวง']] },
  { key: 'kuzuki', name: 'คุซุกิ โซอิจิโร่', short: 'คุซุกิ', en: 'Kuzuki Souichirou', color: '#56627a', mana: 4, cs: 3,
    abil: [['Snake', 'สำรับมีการ์ด Snake 2 ใบ (พลัง 5) รวม 14 ใบ'], ['หมาป่าเดียวดาย', 'โรงฝึกเวทไม่ให้มานา · ย้ายไปมิยามะฟรี · รอบที่ไม่ได้ VP ได้ +1']] },
  { key: 'kirei', name: 'โคโตมิเนะ คิเรย์', short: 'คิเรย์', en: 'Kotomine Kirei', color: '#3a3430', mana: 4, cs: 3,
    abil: [['ผู้ควบคุม', 'ตอนชื่อจริงยังซ่อน: เห็นคลาส Servant ทุกคน · ไปลาดตระเวนด้วยมานา 2 จากที่ไหนก็ได้'], ['ผู้แทน', 'ตอนชื่อจริงเปิดแล้ว: พลังรวม +2']] },
];
export const KANSHOU = { name: 'Kanshou & Bakuya', type: 'S', power: 5, mana: 1, fx: {}, text: 'การ์ดสกิลของชิโร่ ใช้ตามกฎมานา 8 [NW]', master: true };

const c = (type, power, mana, fx = null) => ({ type, power, mana, fx });
const G = { guard: true }; // a Special card: safe from Mystic Eyes of Petrification

// 12 attack cards per Servant: all numbers ph (no source lists them), shaped by [NW] notes.
// Skill cards: names and effects [NW]; numbers [NW] where the page gives them, else ph.
export const SERVANTS = [
  { key: 'artoria', cls: 'Saber', name: 'Artoria Pendragon',
    deck: [c('S', 6, 3), c('S', 5, 2), c('S', 4, 1), c('S', 4, 1), c('S', 3, 0), c('S', 3, 0), c('M', 3, 1), c('M', 2, 0), c('A', 3, 1), c('A', 2, 0), c('X', 2, 0, G), c('S', 2, 0)],
    skills: [
      { name: 'Excalibur', type: 'N', power: 12, mana: 8, fx: { reveal: true, revealPower: 15, climaxPower: 16 }, text: 'มานา 8 พลัง 12 · รอบที่เปิดชื่อจริงพลัง 15 · ไคลแมกซ์พลัง 16 [NW]' },
      { name: 'Invisible Air', type: 'S', power: 4, mana: 2, fx: { zeroOpp: 'S', manaAfter: ['Excalibur', 4] }, text: 'การ์ดกำลังของคู่ต่อสู้พลังเป็น 0 · มานา 2 ถ้ายังไม่เคยใช้ Excalibur ไม่งั้นมานา 4 [NW] (ชนิดเป็นค่าแทน)' },
      { name: 'Saber Class', type: 'X', power: 0, mana: 0, fx: { constant: true, saberVP: true }, text: 'ถาวร: ใช้ NP แล้วได้ 1 VP ถ้าเป็นรอบเปิดชื่อจริงได้ 2 VP [NW]' },
    ] },
  { key: 'emiya', cls: 'Archer', name: 'EMIYA',
    deck: [c('A', 4, 1), c('A', 3, 0), c('A', 3, 0), c('M', 4, 2), c('M', 3, 1), c('S', 3, 1), c('S', 2, 0), c('A', 5, 2), c('X', 2, 0, G), c('M', 2, 0, { mana: 1 }), c('A', 2, 0), c('M', 2, 0)],
    skills: [
      { name: 'Unlimited Blade Works', type: 'N', power: 4, mana: 6, fx: { reveal: true, ubw: 4 }, text: 'เอาสำรับทั้งหมดขึ้นมือ แล้วลงการ์ดโจมตีเพิ่มได้ถึง 4 ใบ [NW] (มานาและพลังเป็นค่าแทน)' },
      { name: 'Caladbolg II', type: 'N', power: 5, mana: 4, fx: { reveal: true, once: true, terrainMul: 3, win: 4 }, text: 'ใช้ครั้งเดียว · ได้เปรียบพื้นที่ × 3 · ชนะได้ 4 VP [NW] (มานาและพลังเป็นค่าแทน)' },
      { name: 'Archer Class', type: 'A', power: 6, mana: 0, fx: { playVP: 3, maxRound: 3, loseVP: 5 }, text: 'มานา 0 พลัง 6 · ลงแล้วได้ 3 VP · ใช้ได้แค่รอบ 1–3 · ถ้าแพ้เสีย 5 VP [NW]' },
    ] },
  { key: 'cu', cls: 'Lancer', name: 'Cú Chulainn',
    deck: [c('A', 5, 2), c('A', 4, 1), c('A', 4, 1), c('A', 3, 0), c('A', 3, 0), c('S', 4, 2), c('S', 3, 1), c('A', 6, 3), c('M', 2, 0), c('X', 2, 0, G), c('A', 2, 0), c('S', 2, 0)],
    skills: [
      { name: 'Gáe Bolg (แทง)', type: 'N', power: 4, mana: 6, fx: { reveal: true, defeatOne: true, costUp: 2 }, text: 'คู่ต่อสู้ที่พลังสูงสุด 1 คน [แพ้] · มานา 6 แพงขึ้น 2 ทุกครั้งที่ใช้ [NW] (พลังและการเลือกเป้าเป็นค่าแทน)' },
      { name: 'Gáe Bolg (ขว้าง)', type: 'N', power: 10, mana: 7, fx: { reveal: true, perFoe: 1, drain: 1 }, text: 'มานา 7 พลัง 10 · ได้ VP +1 ต่อคู่ต่อสู้ · ชนะแล้วคู่ต่อสู้เสีย 1 VP [NW] (จำนวนที่ลดเป็นค่าแทน)' },
      { name: 'Lancer Class', type: 'A', power: 3, mana: 3, fx: { move: true }, text: 'มานา 3 · ลงแล้วย้ายไปพื้นที่อื่นได้ (ยกเว้นโรงฝึกเวท) [NW] (พลังเป็นค่าแทน)' },
    ] },
  { key: 'medusa', cls: 'Rider', name: 'Medusa',
    deck: [c('A', 3, 1), c('A', 3, 0), c('A', 3, 0), c('A', 2, 0), c('S', 3, 1), c('S', 5, 2), c('M', 3, 1), c('A', 5, 2), c('X', 2, 0, G), c('A', 2, 0), c('A', 1, 0), c('S', 3, 0)],
    skills: [
      { name: 'Bellerophon', type: 'N', power: 8, mana: 9, fx: { reveal: true, bell: true }, text: 'มานา 9 พลัง 8 · ย้ายไปพื้นที่ไหนก็ได้ และยึดได้เปรียบพื้นที่ของคู่ต่อสู้ทั้งหมด [NW]' },
      { name: 'Mystic Eyes of Petrification', type: 'M', power: 0, mana: 5, fx: { petrify: true }, text: 'คู่ต่อสู้ที่ไม่ได้ลงการ์ดพิเศษ [แพ้] ทั้งหมด [NW] (มานาและพลังเป็นค่าแทน)' },
      { name: 'Rider Class', type: 'A', power: 1, mana: 3, fx: { riding: 3, extra: 2 }, text: 'มานา 3 · ลงการ์ดเพิ่มได้ 2 ใบที่พลังไม่เกิน 3 [NW] (พลังเป็นค่าแทน)' },
    ] },
  { key: 'medea', cls: 'Caster', name: 'Medea',
    deck: [c('M', 5, 2), c('M', 4, 1), c('M', 4, 1), c('M', 3, 0), c('M', 3, 0, { mana: 1 }), c('M', 6, 3), c('M', 2, 0, { mana: 1 }), c('A', 2, 0), c('S', 1, 0), c('X', 3, 1, G), c('M', 2, 0), c('A', 3, 1)],
    skills: [
      { name: 'Hecatic Graea', type: 'M', power: 8, mana: 5, fx: { returnRB: true }, text: 'มานา 5 พลัง 8 · ถ้าแพ้ Rule Breaker กลับมาใช้ได้อีก [NW]' },
      { name: 'Rule Breaker', type: 'N', power: 0, mana: 3, fx: { reveal: true, once: true, ruleBreaker: 10 }, text: 'มานา 3 · เผา Command Spell คู่ต่อสู้ 1 ดวง ถ้าคู่ต่อสู้ไม่มีแล้ว คนนั้น [แพ้] และพลัง +10 [NW]' },
      { name: 'Caster Class', type: 'M', power: 2, mana: 16, fx: { residual: true, roundDiscount: 2, workshopVP: 1, workshopMana: 1 }, text: 'มานา 16 − 2 × เลขรอบ · วางค้างถาวร พลัง +2 · รอบที่อยู่โรงฝึกเวทได้ 1 VP และมานา +1 [NW] (VP และมานาเป็นค่าแทน)' },
    ] },
  { key: 'kojiro', cls: 'Assassin', name: 'Sasaki Kojirō',
    deck: [c('A', 5, 2), c('A', 5, 1), c('A', 4, 1), c('A', 4, 0), c('A', 3, 0), c('S', 3, 1), c('A', 7, 3), c('M', 2, 0), c('X', 2, 0, G), c('A', 3, 0), c('S', 2, 0), c('A', 3, 0)],
    skills: [
      { name: 'ดาบที่หนึ่ง', type: 'N', power: 7, mana: 5, fx: {}, text: 'มานา 5 พลัง 7 [NW]' },
      { name: 'ดาบที่สอง', type: 'N', power: 5, mana: 2, fx: { cancel: true }, text: 'คู่ต่อสู้ในสนามรบเดียวกันใช้ผลสกิลไม่ได้ [NW] (มานาและพลังเป็นค่าแทน)' },
      { name: 'ดาบที่สาม', type: 'N', power: 6, mana: 2, fx: { agiExtra: 3, tsubame: 8 }, text: 'ลงการ์ดว่องไว 2 ใบด้วยกันพลัง +3 · เคยใช้ดาบที่หนึ่งและสองแล้ว = Tsubame Gaeshi พลัง +8 และเปิดชื่อจริง [NW] (ตัวเลขเป็นค่าแทน)' },
    ] },
  { key: 'heracles', cls: 'Berserker', name: 'Heracles',
    deck: [c('S', 9, 4), c('S', 7, 3), c('S', 7, 3), c('S', 4, 2), c('S', 4, 1), c('S', 3, 1), c('S', 3, 0), c('A', 3, 1), c('A', 2, 0), c('A', 2, 0), c('X', 1, 0, G), c('M', 2, 0)],
    skills: [1, 2, 3].map((n) => ({ name: `God Hand ${n}`, type: 'S', power: 5, mana: 1, fx: { godHand: 3, once: true }, text: 'ใช้ได้ใบละครั้ง · ถ้าแพ้ตอนยังมี God Hand อยู่ เสีย God Hand 1 ใบ แล้วขโมย 3 VP จากผู้ชนะ · God Hand ที่เหลือพลัง +3 ต่อใบที่เสียไป [NW] (พลังตั้งต้นอนุมาน)' })),
  },
];
export const SNAKE = [c('S', 5, 0), c('A', 5, 0)].map((x) => ({ ...x, name: 'Snake' })); // power [NW], mana [v3]

// paper section 10: 10 regular events (8 used) and 3 climax events. mana and numbers ph.
const ev = (name, mana, fx, text) => ({ name, mana, fx, text });
export const EVENTS = [
  ev('ความโกรธเดือดพล่าน', 3, { up: 'S', n: 2 }, 'การ์ดกำลังพลัง +2'),
  ev('คืนก่อนพายุ', 3, { up: 'A', n: 2 }, 'การ์ดว่องไวพลัง +2'),
  ev('การไหลอันสมบูรณ์', 3, { up: 'M', n: 2 }, 'การ์ดเวทพลัง +2'),
  ev('คำสาปแห่งความชั่วร้ายทั้งปวง', 0, { noNP: true }, 'ไม่ให้มานา · ห้ามใช้การ์ด NP'),
  ev('เงาแห่งความชั่วร้ายทั้งปวง', 0, { noNP: true }, 'ไม่ให้มานา · ห้ามใช้การ์ด NP'),
  ev('ฆาตกรต่อเนื่องแห่งมิยามะ', 3, { extraObj: 'miyama' }, 'ย่านมิยามะมีออบเจกต์ 2 ใบ'),
  ev('ความวุ่นวายที่ชินโตะ', 3, { extraObj: 'shinto' }, 'ย่านชินโตะมีออบเจกต์ 2 ใบ'),
  ev('จุดเปลี่ยน', 4, { bonusUp: 2 }, 'ไคลแมกซ์ย่อย: โบนัสสนามรบ +2'),
  ev('ทิวทัศน์อนาคตอันไกล', 0, { unify: 3 }, 'ไม่ให้มานา · หงายการ์ดชนิดเดียวกัน 2 ใบพลัง +3'),
  ev('คืนที่เงียบสงบ', 2, {}, 'ไม่มีผล (ใบที่ 10 ยังไม่รู้ ใส่ไว้แทน)'),
];
export const CLIMAX = [
  ev('คืนที่โชคชะตาหยุดนิ่ง', 4, {}, 'รอบ 9 · จบรอบเหลือ 3 คน'),
  ev('ประตูนรก', 5, {}, 'รอบ 10 · จบรอบเหลือ 2 คน'),
  ev("Heaven's Feel", 6, {}, 'รอบสุดท้าย · จบรอบคน VP มากสุดชนะ'),
];

// 20 objects: VP to the battlefield winner + a local effect. Names/VP [NW] where known, else ph.
const ob = (name, vp, fx, text, ph = false) => ({ name, vp, fx, text, ph });
export const OBJECTS = [
  ob('ยึดที่สูง', 3, { terrainUp: 1 }, 'ได้เปรียบพื้นที่ +1 (ผลเป็นค่าแทน)'),
  ob('จุดพักฟื้น', 2, { winMana: 2 }, 'ผู้ชนะได้มานา +2'),
  ob('ศึกสิ้นหวัง', 4, { underdog: 2 }, 'คนที่ VP น้อยสุดที่นี่พลัง +2 (ตัวเลขเป็นค่าแทน)'),
  ob('ช่วยอิลิยา', 5, {}, 'VP สูงสุดในกองออบเจกต์ (5 เป็นค่าแทน)'),
  ob('เลื่อนขั้น', 3, { hiddenUp: 5 }, 'คนที่ชื่อจริงยังซ่อนพลัง +5 (VP เป็นค่าแทน)'),
  ob('ผนึก', 3, { noSpecial: true }, 'การ์ดพิเศษไม่มีผลและพลัง 0 (VP เป็นค่าแทน)'),
  ob('ดวลเพื่อเกียรติ', 2, { up: 'A', n: 2 }, 'การ์ดว่องไวพลัง +2 (ชนิดเป็นค่าแทน)'),
  ob('ร่างแกร่ง', 2, { up: 'S', n: 2 }, 'การ์ดกำลังพลัง +2 (ชนิดเป็นค่าแทน)'),
  ob('แท่นบูชายัญ', 2, { up: 'M', n: 2 }, 'การ์ดเวทพลัง +2 (ชนิดเป็นค่าแทน)'),
  ob('เผชิญชะตา', 3, { lowUp: 3 }, 'การ์ดพลัง 1–2 พลัง +3 (ตัวเลขเป็นค่าแทน)'),
  ob('ผลสีเงิน', 3, { unify: 4 }, 'หงายการ์ดชนิดเดียวกัน 2 ใบพลัง +4 (VP เป็นค่าแทน)'),
  ob('การต่อสู้', 3, { up: 'S', n: 1 }, 'การ์ดกำลังพลัง +1 (ชนิดเป็นค่าแทน)'),
  ob('การยิง', 3, { up: 'A', n: 1 }, 'การ์ดว่องไวพลัง +1 (ชนิดเป็นค่าแทน)'),
  ob('แดนศักดิ์สิทธิ์', 3, { up: 'M', n: 1 }, 'การ์ดเวทพลัง +1 (ชนิดเป็นค่าแทน)'),
  ob('ลานกว้าง', 2, {}, 'ไม่มีผล', true),
  ob('สะพานฟุยุกิ', 3, {}, 'ไม่มีผล', true),
  ob('ศึกใหญ่', 4, {}, 'ไม่มีผล', true),
  ob('คลังมานา', 2, { winMana: 3 }, 'ผู้ชนะได้มานา +3', true),
  ob('หมอกหนา', 2, { noTerrain: true }, 'ได้เปรียบพื้นที่ไม่มีผล', true),
  ob('ผู้เห็นเหตุการณ์', 2, { loserVP: 1 }, 'ผู้แพ้ได้ 1 VP', true),
];
