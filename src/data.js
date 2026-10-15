// Static game data for design v1.1: areas, Servant decks, situations, events,
// items and church quests. Numbers are starting points for balance.

export const AREAS = {
  temple: { name: 'วัดริวโด', short: 'วัด', kind: 'temple', day: 'แบ่งเลย์ไลน์: คนเดียว +4 · 2 คน +3 · 3 คน +2 มานา', night: '2 คนขึ้นไปสู้แย่งเลย์ไลน์ ผู้ชนะ +4 มานา' },
  miyama: { name: 'ย่านมิยามะ', short: 'มิยามะ', kind: 'field', day: 'สนามรบ · ตั้งหลักรอโบนัสพื้นที่', night: 'สู้แย่งการ์ดอีเวนต์ (เปิดหน้า)' },
  shinto: { name: 'ย่านชินโตะ', short: 'ชินโตะ', kind: 'field', day: 'สนามรบ · ตั้งหลักรอโบนัสพื้นที่', night: 'สู้แย่งการ์ดอีเวนต์ (คว่ำหน้า)' },
  church: { name: 'โบสถ์โคโตมิเนะ', short: 'โบสถ์', kind: 'church', day: 'ถวายมานาแลก Command Seal หรือรับเควส', night: 'ปลอดภัย · ดูมือผู้เล่น 1 คน' },
};
export const AREA_KEYS = ['temple', 'miyama', 'shinto', 'church'];
export const FIELDS = ['miyama', 'shinto'];

// capacity by masters left (design 3): temple, church, open battlefields
export function capacityFor(alive) {
  const temple = alive >= 7 ? 3 : alive === 6 ? 2 : alive === 5 ? 1 : 0;
  const church = alive >= 3 ? 1 : 0;
  const fields = alive >= 4 ? ['miyama', 'shinto'] : ['miyama'];
  return { temple, church, fields };
}

export const TYPES = {
  F: { name: 'กำลัง', icon: '⚔', color: '#ef6a5a' },
  A: { name: 'ว่องไว', icon: '➶', color: '#5ed08f' },
  M: { name: 'เวท', icon: '✦', color: '#a77be8' },
  S: { name: 'พิเศษ', icon: '◆', color: '#e8c45a' },
};

// lowered so Servants die more often (B's request after v1.1)
export const CLASS_HP = { Saber: 11, Archer: 9, Lancer: 9, Rider: 9, Caster: 8, Assassin: 8, Berserker: 14 };

// 10 attack cards per class: the type mix hints at the class
const ATTACKS = {
  Saber: 'F2 F3 F4 F4 F5 A2 A3 M1 M2 M3',
  Archer: 'A2 A3 A3 A4 A5 F2 F3 M1 M2 M3',
  Lancer: 'A1 A2 A3 A4 A5 F2 F3 F4 M1 M2',
  Rider: 'A1 A2 A3 A4 F2 F3 F4 F5 M1 M2',
  Caster: 'M1 M2 M2 M3 M4 M4 M5 A1 A2 F1',
  Assassin: 'A2 A3 A3 A4 A4 A5 F1 F2 M1 M2',
  Berserker: 'F1 F2 F3 F3 F4 F4 F5 F5 A1 M1',
};
export const attackCost = (p) => (p >= 5 ? 2 : p === 4 ? 1 : 0);

// Skill / NP effects, all automatic at reveal (design 5.2):
//   pair:{type,bonus}  +bonus when the other card is that type
//   die:n              roll n extra dice (keep the highest)
//   reduce:n           take n less damage
//   heal:n             heal n before damage
//   mana:n             gain n mana after the fight
//   foe:n              every opponent's total −n
//   splash:n           if you win, every loser loses n more HP
//   selfHit:n          lose n HP after the fight whatever happens
const sk = (name, power, cost, eff, text) => ({ name, power, cost, eff, text });

export const SERVANTS = {
  artoria: { name: 'Artoria Pendragon', cls: 'Saber', favored: 'miyama', unfavored: 'shinto',
    skills: [sk('ปลดปล่อยมานา', 4, 3, { pair: { type: 'F', bonus: 3 } }, 'คู่กับการ์ดกำลัง +3'), sk('สัญชาตญาณ', 1, 2, { die: 1 }, 'ทอยเพิ่ม 1 ลูก')],
    np: sk('Excalibur', 10, 8, { splash: 2 }, 'ชนะแล้วผู้แพ้ทุกคนเสีย HP +2') },
  siegfried: { name: 'Siegfried', cls: 'Saber', favored: 'shinto', unfavored: 'church',
    skills: [sk('เลือดมังกร', 2, 2, { reduce: 3 }, 'รับดาเมจ −3'), sk('ความกล้าหาญ', 3, 3, { pair: { type: 'F', bonus: 3 } }, 'คู่กับการ์ดกำลัง +3')],
    np: sk('Balmung', 10, 8, { splash: 2 }, 'ชนะแล้วผู้แพ้ทุกคนเสีย HP +2') },
  emiya: { name: 'EMIYA', cls: 'Archer', favored: 'shinto', unfavored: 'temple',
    skills: [sk('ตาเหยี่ยว', 2, 2, { die: 1 }, 'ทอยเพิ่ม 1 ลูก'), sk('ยิงดาบระเบิด', 5, 3, { pair: { type: 'A', bonus: 2 } }, 'คู่กับการ์ดว่องไว +2')],
    np: sk('Unlimited Blade Works', 9, 8, { die: 1, splash: 1 }, 'ทอยเพิ่ม 1 ลูก · ชนะแล้วผู้แพ้เสีย HP +1') },
  gilgamesh: { name: 'Gilgamesh', cls: 'Archer', favored: 'shinto', unfavored: 'miyama',
    skills: [sk('กฎทองคำ', 1, 2, { mana: 4 }, 'ได้มานา +4 หลังสู้'), sk('ประตูขุมทรัพย์ย่อย', 5, 3, { pair: { type: 'M', bonus: 2 } }, 'คู่กับการ์ดเวท +2')],
    np: sk('Gate of Babylon', 10, 8, { splash: 2 }, 'ชนะแล้วผู้แพ้ทุกคนเสีย HP +2') },
  cu: { name: 'Cú Chulainn', cls: 'Lancer', favored: 'miyama', unfavored: 'church',
    skills: [sk('การรบต่อเนื่อง', 2, 2, { reduce: 3 }, 'รับดาเมจ −3'), sk('อักษรรูน', 3, 2, { pair: { type: 'M', bonus: 2 } }, 'คู่กับการ์ดเวท +2')],
    np: sk('Gáe Bolg', 9, 8, { splash: 3 }, 'ชนะแล้วผู้แพ้ทุกคนเสีย HP +3') },
  diarmuid: { name: 'Diarmuid Ua Duibhne', cls: 'Lancer', favored: 'miyama', unfavored: 'shinto',
    skills: [sk('ไฝเสน่ห์', 2, 2, { foe: 2 }, 'คู่ต่อสู้ทุกคน −2'), sk('หอกคู่', 4, 3, { pair: { type: 'A', bonus: 2 } }, 'คู่กับการ์ดว่องไว +2')],
    np: sk('Gáe Dearg & Buidhe', 9, 8, { foe: 2 }, 'คู่ต่อสู้ทุกคน −2') },
  medusa: { name: 'Medusa', cls: 'Rider', favored: 'shinto', unfavored: 'church',
    skills: [sk('สายตามนตร์', 3, 4, { foe: 2 }, 'คู่ต่อสู้ทุกคน −2'), sk('โซ่ตรวน', 2, 2, { pair: { type: 'A', bonus: 2 } }, 'คู่กับการ์ดว่องไว +2')],
    np: sk('Bellerophon', 10, 8, { die: 1 }, 'ทอยเพิ่ม 1 ลูก') },
  iskandar: { name: 'Iskandar', cls: 'Rider', favored: 'miyama', unfavored: 'temple', hp: 10,
    skills: [sk('บารมี', 3, 3, { pair: { type: 'F', bonus: 2 } }, 'คู่กับการ์ดกำลัง +2'), sk('ทะลวงทัพ', 4, 3, { pair: { type: 'A', bonus: 2 } }, 'คู่กับการ์ดว่องไว +2')],
    np: sk('Ionioi Hetairoi', 10, 8, { splash: 2 }, 'ชนะแล้วผู้แพ้ทุกคนเสีย HP +2') },
  medea: { name: 'Medea', cls: 'Caster', favored: 'temple', unfavored: 'shinto',
    skills: [sk('เวทเทพ', 5, 4, { pair: { type: 'M', bonus: 2 } }, 'คู่กับการ์ดเวท +2'), sk('เขตแดนวิหาร', 1, 2, { heal: 4 }, 'ฟื้น HP 4 ก่อนคิดดาเมจ')],
    np: sk('Rule Breaker', 8, 8, { foe: 3 }, 'คู่ต่อสู้ทุกคน −3') },
  gilles: { name: 'Gilles de Rais', cls: 'Caster', favored: 'shinto', unfavored: 'church',
    skills: [sk('สัตว์ประหลาดใต้ทะเล', 4, 3, { pair: { type: 'M', bonus: 2 } }, 'คู่กับการ์ดเวท +2'), sk('ความบ้าคลั่ง', 5, 2, { selfHit: 1 }, 'เสีย HP 1 หลังสู้')],
    np: sk("Prelati's Spellbook", 8, 8, { heal: 4 }, 'ฟื้น HP 4 ก่อนคิดดาเมจ') },
  kojiro: { name: 'Sasaki Kojirō', cls: 'Assassin', favored: 'temple', unfavored: 'shinto',
    skills: [sk('ใจนิ่ง', 2, 2, { reduce: 3 }, 'รับดาเมจ −3'), sk('เพลงดาบ', 4, 3, { pair: { type: 'A', bonus: 2 } }, 'คู่กับการ์ดว่องไว +2')],
    np: sk('Tsubame Gaeshi', 9, 8, { die: 1 }, 'ทอยเพิ่ม 1 ลูก') },
  hassan: { name: 'Hassan of the Cursed Arm', cls: 'Assassin', favored: 'shinto', unfavored: 'miyama',
    skills: [sk('ซุ่มสังหาร', 4, 3, { pair: { type: 'A', bonus: 3 } }, 'คู่กับการ์ดว่องไว +3'), sk('วิชาพิษ', 2, 2, { foe: 1 }, 'คู่ต่อสู้ทุกคน −1')],
    np: sk('Zabaniya', 9, 8, { splash: 3 }, 'ชนะแล้วผู้แพ้ทุกคนเสีย HP +3') },
  heracles: { name: 'Heracles', cls: 'Berserker', favored: 'miyama', unfavored: 'temple', godHand: true,
    skills: [sk('คลั่ง', 3, 2, { pair: { type: 'F', bonus: 2 } }, 'คู่กับการ์ดกำลัง +2'), sk('ร่างเหล็ก', 3, 3, { reduce: 2 }, 'รับดาเมจ −2')],
    np: sk('Nine Lives', 10, 8, { splash: 2 }, 'ชนะแล้วผู้แพ้ทุกคนเสีย HP +2') },
  lancelot: { name: 'Lancelot', cls: 'Berserker', favored: 'shinto', unfavored: 'miyama', hp: 12, nameless: true,
    skills: [sk('อัศวินไร้ที่ติ', 3, 2, { pair: { type: 'F', bonus: 2 } }, 'คู่กับการ์ดกำลัง +2'), sk('ยุทธปัจจัย', 4, 3, { pair: { type: 'A', bonus: 2 } }, 'คู่กับการ์ดว่องไว +2')],
    np: sk('Arondight', 10, 8, { splash: 2 }, 'ชนะแล้วผู้แพ้ทุกคนเสีย HP +2') },
};
export const SERVANT_KEYS = Object.keys(SERVANTS);

export function buildDeck(key) {
  const sv = SERVANTS[key];
  const cards = ATTACKS[sv.cls].split(' ').map((c) => ({
    kind: 'atk', type: c[0], power: Number(c[1]), cost: attackCost(Number(c[1])), name: `${TYPES[c[0]].name} ${c[1]}`, eff: {},
  }));
  sv.skills.forEach((s) => cards.push({ kind: 'skill', type: 'S', power: s.power, cost: s.cost, name: s.name, eff: s.eff, text: s.text }));
  cards.push({ kind: 'np', type: 'S', power: sv.np.power, cost: sv.np.cost, name: sv.np.name, eff: sv.np.eff, text: sv.np.text, reveal: true });
  return cards;
}

export const SITUATIONS = {
  force: { name: 'คืนแห่งพละกำลัง', text: 'การ์ดกำลัง +2 พลัง' },
  speed: { name: 'คืนแห่งความเร็ว', text: 'การ์ดว่องไว +2 พลัง' },
  magic: { name: 'คืนแห่งเวทมนตร์', text: 'การ์ดเวท +2 พลัง · ทุกคน +2 มานาตอนเช้า' },
  moon: { name: 'จันทร์เต็มดวง', text: 'ทุกคนทอยเพิ่ม 1 ลูก' },
  fog: { name: 'หมอกหนา', text: 'ห้ามย้ายแบบจ่ายมานาคืนนี้ ("หนี!" ยังใช้ได้)' },
  shadow: { name: 'เงาดำจากจอก', text: 'มอนสเตอร์พลัง 12+1d6 ร่วมสู้ที่สนามรบที่ประกาศ' },
  onemind: { name: 'ใจเดียว', text: 'ลง 2 ใบประเภทเดียวกัน +3 พลัง' },
  blood: { name: 'คืนเลือด', text: 'ผู้ชนะที่ฆ่าได้ยึดมานาทั้งหมด' },
};
export const SITUATION_KEYS = Object.keys(SITUATIONS);

export const EVENTS = [
  { name: 'มานา +5', mana: 5 },
  { name: 'การ์ดไอเท็ม 1 ใบ', items: 1 },
  { name: 'ฟื้น HP 5', heal: 5 },
  { name: 'จั่วการ์ด 2 ใบ', draw: 2 },
  { name: 'ไอเท็ม 1 ใบ + มานา 2', items: 1, mana: 2 },
];

// phase: 'day' = day choice, 'fight' = card play, 'move' = night move, 'auto' = automatic
export const ITEMS = {
  mana_vial: { name: 'ขวดมานา', phase: 'day', text: 'มานา +5 (กลางวัน)' },
  potion: { name: 'ยาสมานแผล', phase: 'day fight', text: 'ฟื้น HP 5 (กลางวัน หรือ ตอนลงการ์ด)' },
  gem: { name: 'อัญมณีของโทซากะ', phase: 'fight', text: 'พลังรวม +4 ไม่เสียมานา' },
  charm: { name: 'เครื่องรางนำโชค', phase: 'fight', text: 'ทอยเพิ่ม 1 ลูก' },
  shroud: { name: 'ผ้าห่อศพของมาร์ติน', phase: 'fight', text: 'แพ้คืนนี้ไม่เสีย HP' },
  scroll: { name: 'ม้วนคาถาเคลื่อนย้าย', phase: 'move', text: 'ใช้ "หนี!" โดยไม่เสีย Command Seal' },
  hero_record: { name: 'บันทึกวีรชน', phase: 'day', text: 'ดูการ์ด Servant ของผู้เล่น 1 คน (กลางวัน)' },
  catalyst: { name: 'วัตถุเชื่อมโยง', phase: 'auto', text: 'อัญเชิญครั้งถัดไปเลือก 1 ใน 3' },
};
export const ITEM_KEYS = Object.keys(ITEMS);

export const QUESTS = {
  bounty: { name: 'ล่าค่าหัว', text: 'ชนะการต่อสู้ที่มี Servant ตาย ภายใน 2 วัน', days: 2, need: 1 },
  fields: { name: 'ชนะสนามรบ', text: 'ชนะการต่อสู้ที่มิยามะหรือชินโตะ 2 ครั้ง ภายใน 3 วัน', days: 3, need: 2 },
  revealed: { name: 'ล่าวีรชนที่เปิดเผยแล้ว', text: 'ชนะการต่อสู้กับ Servant ที่ชื่อจริงถูกเปิดแล้ว ภายใน 3 วัน', days: 3, need: 1 },
  offering: { name: 'เครื่องบูชา', text: 'มอบการ์ดไอเท็ม 2 ใบ (สำเร็จทันที)', days: 0, need: 0 },
};
export const QUEST_KEYS = Object.keys(QUESTS);

export const MASTER_NAMES = ['โทซากะ', 'มาโต้', 'ไอนซ์เบิร์น', 'โคโตมิเนะ', 'อาร์ชิบอลด์', 'เวลเว็ต', 'อุริว'];

export const MANA_START = 5;
export const MANA_MAX = 20;
export const HAND_SIZE = 3;
export const ITEM_MAX = 2;
export const SEAL_MAX = 3;
export const DEATHS_FOR_GRAIL = 7;
export const MOVE_COST = 2;
export const OFFER_PRICES = [10, 14, 18];
export const QUEST_DEPOSIT = 2;
export const MONSTER_BASE = 12;
