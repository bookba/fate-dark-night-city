// Static game data: areas, classes, Servants, item cards.
// Numbers follow docs/game-design.md and are starting points for balance.

export const AREAS = {
  temple: { name: 'วัดริวโด', short: 'วัด', desc: 'มานา 2–7 · เลย์ไลน์' },
  forest: { name: 'ป่าไอนซ์เบิร์น', short: 'ป่า', desc: 'มานา 1–4 · ฟื้น HP 10% · ซ่อนง่าย (+1)' },
  shinto: { name: 'ย่านชินโตะ', short: 'ชินโตะ', desc: 'มานา 1–3 · การ์ด 1 ใบ (ทอย 3–6)' },
  church: { name: 'โบสถ์โคโตมิเนะ', short: 'โบสถ์', desc: 'ฟื้น HP 20% · เศษ Command Seal (ทอย 6)' },
  school: { name: 'โรงเรียนโฮมูระฮาระ', short: 'โรงเรียน', desc: 'มานา 1–6 · กับดัก (ทอย 1 = HP −10)' },
};
export const AREA_KEYS = Object.keys(AREAS);

export const CLASSES = {
  Saber: { hp: 100, atk: 3, def: 3, agi: 2, passive: 'ต้านเวท: ดาเมจจาก Caster ลดครึ่ง' },
  Archer: { hp: 80, atk: 3, def: 2, agi: 3, passive: 'อิสระ: โจมตีก่อนเสมอในรอบแรก' },
  Lancer: { hp: 85, atk: 3, def: 2, agi: 4, passive: 'ต้านเวท (อ่อน): ดาเมจจาก Caster −25%' },
  Rider: { hp: 90, atk: 2, def: 2, agi: 4, passive: 'ขี่พาหนะ: ทอยหนี +2' },
  Caster: { hp: 70, atk: 2, def: 2, agi: 2, passive: 'สร้างเขตแดน: มานา +2 ทุกเฟส' },
  Assassin: { hp: 70, atk: 3, def: 1, agi: 4, passive: 'ซ่อนเร้น: ทอยซ่อน +2' },
  Berserker: { hp: 130, atk: 4, def: 2, agi: 1, passive: 'คลั่ง: ATK +1 (รวมแล้ว) แต่ใช้สกิลส่วนตัวไม่ได้' },
};

// Skill kinds understood by the combat engine (see engine.js#doAction):
//   dmg      — replaces the attack: rolls `dice` d6 (+ATK if addAtk, +bonus)
//   buff     — applies an effect and still makes a normal attack
//   defend2  — defend, rolling twice and keeping the better roll
//   heal     — heals `amount` instead of attacking
//   passive  — not selectable; handled elsewhere
export const SERVANTS = {
  artoria: {
    name: 'Artoria Pendragon', cls: 'Saber', favored: 'forest', unfavored: 'shinto',
    np: { name: 'Excalibur', cost: 12, special: 'extra', desc: '4d6+ATK ดาเมจ +6 (ค่า NP 12 เพราะจุดอ่อน)' },
    weakness: 'มานาที่ใช้ NP +2',
    skills: [
      { id: 'mana_burst', name: 'ปลดปล่อยมานา', cost: 3, kind: 'dmg', dice: 2, addAtk: true, bonus: 2, desc: 'โจมตี 2d6+ATK+2' },
      { id: 'instinct', name: 'สัญชาตญาณ', cost: 2, kind: 'defend2', desc: 'ป้องกัน ทอย 2 ครั้งเอาค่าดีกว่า' },
    ],
  },
  siegfried: {
    name: 'Siegfried', cls: 'Saber', favored: 'forest', unfavored: 'church',
    np: { name: 'Balmung', cost: 10, special: 'extra', desc: '4d6+ATK ดาเมจ +6' },
    weakness: 'ถูกซุ่มโจมตีโดยคนที่รู้ชื่อ ดาเมจ ×2',
    skills: [
      { id: 'dragon_blood', name: 'เลือดมังกร', cost: 2, kind: 'buff', desc: 'รับดาเมจ −5 รอบนี้ + โจมตีปกติ' },
      { id: 'valor', name: 'ความกล้าหาญ', cost: 3, kind: 'buff', desc: 'ATK +2 สองรอบ + โจมตีปกติ' },
    ],
  },
  emiya: {
    name: 'EMIYA', cls: 'Archer', favored: 'shinto', unfavored: 'school', hp: 70,
    np: { name: 'Unlimited Blade Works', cost: 10, special: 'pierce', desc: '4d6+ATK ทะลุการป้องกัน' },
    weakness: 'HP ต่ำสุดในคลาส (70)',
    skills: [
      { id: 'hawk_eye', name: 'ตาเหยี่ยว', cost: 2, kind: 'passive', desc: 'นอกการต่อสู้: จ่าย 2 มานาอัตโนมัติ เห็นคนซ่อนตัวในพื้นที่' },
      { id: 'broken_phantasm', name: 'ยิงดาบระเบิด', cost: 4, kind: 'dmg', dice: 3, addAtk: false, bonus: 0, desc: 'ดาเมจ 3d6' },
    ],
  },
  gilgamesh: {
    name: 'Gilgamesh', cls: 'Archer', favored: 'church', unfavored: 'forest',
    np: { name: 'Gate of Babylon', cost: 10, special: 'pierce', desc: '4d6+ATK ทะลุการป้องกัน' },
    weakness: 'หยิ่ง: รอบแรกป้องกันไม่ได้',
    skills: [
      { id: 'golden_rule', name: 'กฎทองคำ', cost: 0, kind: 'passive', desc: 'ติดตัว: มานา +2 ทุกเฟส' },
      { id: 'gate_mini', name: 'ประตูขุมทรัพย์ย่อย', cost: 3, kind: 'dmg', dice: 2, addAtk: true, bonus: 0, desc: 'โจมตี 2d6+ATK' },
    ],
  },
  cu: {
    name: 'Cú Chulainn', cls: 'Lancer', favored: 'forest', unfavored: 'church',
    np: { name: 'Gáe Bolg', cost: 10, special: 'pierce', desc: '4d6+ATK ทะลุการป้องกันและหลบไม่ได้' },
    weakness: 'ห้ามหนี (geis) ตอนกลางคืน',
    skills: [
      { id: 'battle_cont', name: 'การรบต่อเนื่อง', cost: 0, kind: 'passive', desc: 'ติดตัว: HP < 20 ครั้งแรก ฟื้น 15' },
      { id: 'runes', name: 'อักษรรูน', cost: 2, kind: 'buff', desc: 'DEF +2 สองรอบ + โจมตีปกติ' },
    ],
  },
  diarmuid: {
    name: 'Diarmuid Ua Duibhne', cls: 'Lancer', favored: 'forest', unfavored: 'shinto',
    np: { name: 'Gáe Dearg & Buidhe', cost: 10, special: 'pierce', desc: '4d6+ATK ทะลุการป้องกัน' },
    weakness: 'แพ้ทาง Saber ที่รู้ชื่อ: รับดาเมจ +3',
    skills: [
      { id: 'love_spot', name: 'ไฝเสน่ห์', cost: 2, kind: 'buff', desc: 'อีกฝ่าย ATK −1 รอบนี้ + โจมตีปกติ' },
      { id: 'twin_spears', name: 'หอกคู่', cost: 3, kind: 'dmg', dice: 1, addAtk: true, bonus: 0, hits: 2, desc: 'โจมตี 2 ครั้ง ครั้งละ 1d6+ATK' },
    ],
  },
  medusa: {
    name: 'Medusa', cls: 'Rider', favored: 'school', unfavored: 'church',
    np: { name: 'Bellerophon', cost: 10, special: 'first', desc: '4d6+ATK โจมตีก่อนเสมอ' },
    weakness: 'ถ้าอีกฝ่ายรู้ชื่อ สายตามนตร์ใช้ไม่ได้ผล',
    skills: [
      { id: 'mystic_eyes', name: 'สายตามนตร์', cost: 4, kind: 'buff', desc: 'อีกฝ่ายทอย d6 ≤ 2 = เสียรอบ + โจมตีปกติ' },
      { id: 'chains', name: 'โซ่ตรวน', cost: 2, kind: 'buff', desc: 'อีกฝ่ายหนีไม่ได้รอบนี้ + โจมตีปกติ' },
    ],
  },
  iskandar: {
    name: 'Iskandar', cls: 'Rider', favored: 'shinto', unfavored: 'forest',
    np: { name: 'Ionioi Hetairoi', cost: 14, special: 'dice5', desc: '5d6+ATK (แพงสุด 14 มานา)' },
    weakness: 'NP แพงสุด (14 มานา)',
    skills: [
      { id: 'charisma', name: 'บารมี', cost: 3, kind: 'buff', desc: 'ATK+1 DEF+1 ตลอดการต่อสู้ + โจมตีปกติ' },
      { id: 'charge', name: 'ทะลวงทัพ', cost: 3, kind: 'dmg', dice: 2, addAtk: true, bonus: 0, first: true, desc: 'โจมตีก่อน 2d6+ATK' },
    ],
  },
  medea: {
    name: 'Medea', cls: 'Caster', favored: 'temple', unfavored: 'shinto',
    np: { name: 'Rule Breaker', cost: 10, special: 'dispel', desc: '4d6+ATK และลบบัฟของอีกฝ่าย' },
    weakness: 'ประชิดอ่อน: ATK −1 ในรอบแรก',
    skills: [
      { id: 'divine_magic', name: 'เวทเทพ', cost: 4, kind: 'dmg', dice: 3, addAtk: false, bonus: 0, desc: 'ดาเมจเวท 3d6' },
      { id: 'temple_heal', name: 'เขตแดนวิหาร', cost: 3, kind: 'heal', amount: 15, desc: 'ฟื้น HP 15 (แทนการโจมตี)' },
    ],
  },
  gilles: {
    name: 'Gilles de Rais', cls: 'Caster', favored: 'shinto', unfavored: 'church',
    np: { name: "Prelati's Spellbook", cost: 10, special: 'drain', desc: '4d6+ATK และฟื้น HP 15' },
    weakness: 'ฟื้น HP จากพื้นที่ไม่ได้',
    skills: [
      { id: 'sea_horror', name: 'สัตว์ประหลาดใต้ทะเล', cost: 3, kind: 'dmg', dice: 2, addAtk: false, bonus: 0, dot: true, desc: 'ดาเมจ 2d6 รอบนี้และรอบหน้า' },
      { id: 'madness', name: 'ความบ้าคลั่ง', cost: 2, kind: 'buff', desc: 'ATK +2, DEF −1 ตลอดการต่อสู้ + โจมตีปกติ' },
    ],
  },
  kojiro: {
    name: 'Sasaki Kojirō', cls: 'Assassin', favored: 'temple', unfavored: 'shinto',
    np: { name: 'Tsubame Gaeshi', cost: 10, special: 'pierce', desc: '4d6+ATK ทะลุการป้องกัน' },
    weakness: 'ผลลบจากพื้นที่ไม่ถนัดเป็น 2 เท่า',
    skills: [
      { id: 'minds_eye', name: 'ใจนิ่ง', cost: 2, kind: 'buff', desc: 'หลบทั้งรอบถ้าทอย d6 ≥ 4 + โจมตีปกติ' },
      { id: 'swallow', name: 'เพลงดาบ', cost: 3, kind: 'dmg', dice: 2, addAtk: true, bonus: 0, desc: 'โจมตี 2d6+ATK' },
    ],
  },
  hassan: {
    name: 'Hassan of the Cursed Arm', cls: 'Assassin', favored: 'shinto', unfavored: 'church',
    np: { name: 'Zabaniya', cost: 10, special: 'extra', desc: '4d6+ATK ดาเมจ +6' },
    weakness: 'ถูกพบตอนซ่อนตัว = เสีย HP 15',
    skills: [
      { id: 'assassinate', name: 'ซุ่มสังหาร', cost: 3, kind: 'dmg', dice: 1, addAtk: true, bonus: 0, ambushX2: true, desc: '1d6+ATK ถ้าซุ่มโจมตีอยู่: ก่อน และดาเมจ ×2' },
      { id: 'poison', name: 'วิชาพิษ', cost: 2, kind: 'buff', desc: 'อีกฝ่ายเสีย HP 5 ทุกเฟส 2 เฟส + โจมตีปกติ' },
    ],
  },
  heracles: {
    name: 'Heracles', cls: 'Berserker', favored: 'forest', unfavored: 'school',
    np: { name: 'God Hand', cost: 10, special: 'extra', desc: '4d6+ATK ดาเมจ +6' },
    weakness: 'หนีไม่ได้ ใช้การ์ดไม่ได้',
    skills: [
      { id: 'god_hand', name: 'God Hand', cost: 0, kind: 'passive', desc: 'ติดตัว: ตายครั้งแรกฟื้น HP 50%' },
    ],
  },
  lancelot: {
    name: 'Lancelot', cls: 'Berserker', favored: 'shinto', unfavored: 'forest',
    np: { name: 'Knight of Owner', cost: 10, special: 'extra', desc: '4d6+ATK ดาเมจ +6' },
    weakness: 'ทุกรอบต้องโจมตี (ป้องกันไม่ได้)',
    skills: [
      { id: 'nameless', name: 'ไร้นาม', cost: 0, kind: 'passive', desc: 'ติดตัว: ชื่อจริงไม่ถูกเปิดจาก NP ครั้งแรก' },
    ],
  },
};
export const SERVANT_KEYS = Object.keys(SERVANTS);

// where: 'any' = in or out of combat, 'combat' = only in combat, 'field' = only outside, 'passive' = automatic
export const CARDS = {
  gem: { name: 'อัญมณีเวทของโทซากะ', rarity: 'หายาก', where: 'combat', desc: 'ระเบิด 3d6×2 ดาเมจ ทะลุการป้องกัน ไม่ใช้มานา' },
  mana_vial: { name: 'ขวดมานา', rarity: 'ทั่วไป', where: 'any', desc: 'มานา +5' },
  potion: { name: 'ยาสมานแผล', rarity: 'ทั่วไป', where: 'any', desc: 'ฟื้น HP 30' },
  charm: { name: 'เครื่องรางนำโชค', rarity: 'ทั่วไป', where: 'combat', desc: 'รอบนี้ทอยลูกเต๋า 2 ชุด เอาชุดที่ดีกว่า' },
  shroud: { name: 'ผ้าห่อศพของมาร์ติน', rarity: 'หายาก', where: 'combat', desc: 'กันดาเมจทั้งหมด 1 รอบ' },
  familiar: { name: 'Familiar สอดแนม', rarity: 'ทั่วไป', where: 'field', desc: 'เฟสนี้เห็นคนซ่อนตัวในพื้นที่ของตัวเอง' },
  ward_stone: { name: 'ศิลาเขตแดน', rarity: 'ทั่วไป', where: 'field', desc: 'เฟสนี้ซ่อนตัวสำเร็จแน่นอน' },
  scroll: { name: 'ม้วนคาถาเคลื่อนย้าย', rarity: 'หายาก', where: 'combat', desc: 'หนีออกจากการต่อสู้ทันที' },
  black_keys: { name: 'ดาบดำ (Black Keys)', rarity: 'ทั่วไป', where: 'combat', desc: 'ปา (1d6+2)×2 ดาเมจ ทะลุการป้องกัน' },
  hero_record: { name: 'บันทึกวีรชน', rarity: 'หายาก', where: 'field', desc: 'รู้ชื่อจริง + จุดอ่อนของเป้าหมาย (รู้คนเดียว)' },
  origin_bullet: { name: 'กระสุนต้นกำเนิด', rarity: 'ตำนาน', where: 'passive', desc: 'อัตโนมัติ: ยกเลิก NP ของอีกฝ่าย 1 ครั้ง' },
  catalyst: { name: 'วัตถุเชื่อมโยง', rarity: 'ตำนาน', where: 'passive', desc: 'อัตโนมัติ: อัญเชิญครั้งถัดไปเลือก Servant เอง' },
};
// Draw weights: common 3, rare 2, legendary 1
export const CARD_POOL = Object.entries(CARDS).flatMap(([k, c]) =>
  Array(c.rarity === 'ทั่วไป' ? 3 : c.rarity === 'หายาก' ? 2 : 1).fill(k));

export const MASTER_NAMES = ['โทซากะ', 'มาโต้', 'ไอนซ์เบิร์น', 'โคโตมิเนะ', 'อาร์ชิบอลด์', 'เวลเว็ต', 'อุริว'];

export const MANA_MAX = 20;
export const CARD_MAX = 3;
export const SEAL_MAX = 3;
export const DEATHS_FOR_GRAIL = 7;
export const MAX_ROUNDS = 3;
