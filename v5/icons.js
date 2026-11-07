// Paper 4.6 item 14: the words that came up most are line icons, drawn like the crests on the
// cards and coloured by meaning; a tap (a hover on a computer) opens a small bubble with the name,
// one line of meaning and the value now. The emoji in the paper only say what each picture is.
import { T, lang, tplRe, anyRe } from './i18n.js';
const S = (d, o = '') => `<g${o}>${d}</g>`; // drawn once in the sprite, used by name
const F = ' fill="currentColor" stroke-width="1.2"'; // a filled shape

// key: [svg, name, meaning, colour class]
export const ICONS = {
  mana: [S('<path d="M12 3.5c3 4 6 7.3 6 10.5a6 6 0 0 1-12 0c0-3.2 3-6.5 6-10.5z"/>'), T("มานา"), T("ใช้เดินและจ่ายค่าการ์ด · สูงสุด 12 · ถึง 8 ใช้การ์ด NP/สกิลได้"), 'mana'],
  cs: [S('<path d="M12 3l7 9-7 9-7-9z"/>', F), 'Command Spell', T("ใช้ในตาของคุณ ดวงละ 1 ผล: 💧+4 · ⚡+2 (ชนะได้ 🏆+1) · ย้ายไม่สนติดพัน"), 'seal'],
  vp: [S('<path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H5v1.5A3 3 0 0 0 8 10.5M16 6h3v1.5a3 3 0 0 1-3 3M12 13v4M8.5 20h7M10 17h4"/>'), 'VP', T("แต้มชัยชนะ · VP น้อยถูกคัดออกตอนจบรอบ 8 และจบไคลแมกซ์"), 'gold'],
  power: [S('<path d="M13.5 3 6 13.5h5.5L10.5 21 18 10.5h-5.5z"/>', F), T("พลัง"), T("พลังตอนต่อสู้ · พลังรวมสูงสุดที่ไม่ ☠ แพ้ ชนะ"), 'pow'],
  hand: [S('<rect x="8.5" y="3.5" width="10" height="14" rx="1.5"/><path d="M6.5 6.2 4.6 6.8a1.5 1.5 0 0 0-1 1.8l2.8 10.4a1.5 1.5 0 0 0 1.9 1L13 18.8"/>'), T("การ์ด"), T("การ์ดในมือ · ในที่มาของพลังคือพลังจากการ์ด"), 'bone'],
  deck: [S('<rect x="5.5" y="3" width="12" height="15.5" rx="1.5"/><path d="M8 21h10a1.5 1.5 0 0 0 1.5-1.5V6.5M8.5 7l6 7.5M14.5 7l-6 7.5" stroke-width="1.5"/>'), T("สำรับ"), T("การ์ดที่เหลือในสำรับ · ไม่บอกลำดับ"), 'bone'],
  trash: [S('<path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v5.5M14 11v5.5"/>'), T("กองทิ้ง"), T("การ์ดที่ลงแล้ว วางตามด้านที่ลง · คนอื่นเห็นแค่ใบหงาย"), 'dim'],
  gem: [S('<path d="M7 4h10l3.5 5L12 20.5 3.5 9zM3.5 9h17M9.5 4 12 9l2.5-5M8 9l4 11.5L16 9"/>'), T("อัญมณี"), T("อัญมณีของรินที่เหลือ · 💧+1 · Gandr Shot · ทิ้งแล้วจั่ว"), 'gem'],
  terrain: [S('<path d="M2.5 20 9 9l4 6.5 2.5-3.5 6 8z"/><path d="M9 9V3.5l4.5 1.7L9 7"/>'), T("ได้เปรียบพื้นที่"), T("พลัง +3 คนแรก · +1 คนที่สอง ที่วางหมากในสนามรบนี้ตอนตั้งมั่น · ย้ายออกแล้วหาย"), 'ok'],
  round: [S('<path d="M6.5 3.5h11M6.5 20.5h11M8 3.5c0 5 8 5.5 8 8.5s-8 3.5-8 8.5M16 3.5c0 5-8 5.5-8 8.5s8 3.5 8 8.5"/>'), T("รอบ"), T("รอบนี้ / รอบปกติ 8 · ต่อจากนั้นเป็นรอบไคลแมกซ์"), 'bone'],
  alone: [S('<circle cx="12" cy="8" r="3.5"/><path d="M5 20.5c0-4 3-6.5 7-6.5s7 2.5 7 6.5"/>'), T("คนเดียว"), T("🏆 ที่ได้ถ้าอยู่คนเดียวในสนามรบนี้ (VP การ์ดอีเวนต์)"), 'gold'],
  duel: [S('<circle cx="8" cy="8.5" r="3"/><circle cx="16.5" cy="8.5" r="3"/><path d="M2.5 20.5c0-3.5 2.3-5.5 5.5-5.5s5.5 2 5.5 5.5M14 15.1c.8-.1 1.6-.1 2.5 0 3 .3 5 2.2 5 5.4"/>'), T("ชนะคู่ต่อสู้"), T("🏆 ที่ได้ถ้าชนะคู่ต่อสู้ในสนามรบนี้ (VP การ์ดอีเวนต์ + โบนัสสนามรบ) · เสมอแบ่งกันปัดขึ้น"), 'gold'],
  seat: [S('<path d="M7 3.5v10h10.5M7 13.5V21M17.5 13.5V21M7 9h9"/>'), T("รับได้"), T("จำนวนคนที่พื้นที่นี้รับได้"), 'dim'],
  enter: [S('<path d="M13 4h6v16h-6M3.5 12H14M10 8l4 4-4 4"/>'), T("ย้ายเข้า"), T("ผลตอนย้ายเข้าตอนปฏิบัติการ"), 'gold'],
  sit: [S('<path d="M6 4h11a2 2 0 0 1 0 4h-1v10.5a2 2 0 0 1-2 2H5a2 2 0 0 1 0-4h1z"/><path d="M9 9h4M9 12.5h4"/>'), T("การ์ดสถานการณ์"), T("เปิดรอบละใบตอนเตรียมการ · กฎเพิ่มทั้งรอบ และ 💧 ที่ทุกคนได้"), 'grail'],
  event: [S('<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/>'), T("การ์ดอีเวนต์"), T("บอก 🏆 ของสนามรบรอบนี้ · มิยามะเปิด ชินโตะคว่ำจนถึงปฏิบัติการ"), 'grail'],
  here: [S('<path d="M12 21s6.5-6 6.5-11a6.5 6.5 0 0 0-13 0c0 5 6.5 11 6.5 11z"/><circle cx="12" cy="10" r="2.3"/>'), T("คุณ"), T("หมากของคุณอยู่ที่นี่"), 'gold'],
  fight: [S('<path d="M12 21c4 0 6.5-2.6 6.5-6.3 0-3.6-2.7-5.7-3.5-9.2-1.6 1.4-2.2 3.2-2.2 4.8-1.6-1-2.6-3.1-2.3-6.3C7.2 6.4 5.5 10 5.5 14.7 5.5 18.4 8 21 12 21z"/>'), T("ต่อสู้"), T("รอบนี้มีการต่อสู้ที่นี่"), 'red'],
  engaged: [S('<rect x="2.5" y="8.5" width="10.5" height="7" rx="3.5"/><rect x="11" y="8.5" width="10.5" height="7" rx="3.5"/>'), T("ติดพัน"), T("มี 2 คนขึ้นไป เดินออกตามปกติไม่ได้ (Command Spell และการ์ดย้ายยังย้ายได้)"), 'red'],
  wait: [S('<path d="M6 17.2A7.5 6.3 0 1 1 9.5 18.4L5.5 20.5z"/><circle cx="8.6" cy="11.3" r="1" fill="currentColor"/><circle cx="12" cy="11.3" r="1" fill="currentColor"/><circle cx="15.4" cy="11.3" r="1" fill="currentColor"/>'), T("รอ"), T("ยังไม่ลงการ์ด หรือกำลังเลือก"), 'dim'],
  late: [S('<path d="M5 4.5v6.5a5 5 0 0 0 5 5h9.5M15.5 12l4 4-4 4"/>'), T("มาทีหลัง"), T("ย้ายเข้ามาหลังตั้งมั่น ไม่ได้ ⛰"), 'dim'],
  first: [S('<path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 17l-5.2 2.7 1-5.9-4.3-4.1 5.9-.8z"/>', F), T("ผู้เริ่ม"), T("ผู้เริ่มรอบนี้ · เล่นก่อน · จบรอบเลื่อนไปคนถัดไป"), 'grail'],
  crown: [S('<path d="M3.5 8.5 8 12.5l4-7 4 7 4.5-4-2 10h-13z"/>', F), T("อันดับ 1"), T("🏆 มากสุดตอนนี้ เสมอได้ทุกคน"), 'gold'],
  hidden: [S('<path d="M3 6.5c3 1 6 1 9 0s6-1 9 0c0 6-2.5 10.5-6 10.5-1.6 0-2.3-1.7-3-1.7S10.6 17 9 17c-3.5 0-6-4.5-6-10.5z"/><path d="M6.5 10.5c.8-.6 2.2-.6 3 0M14.5 10.5c.8-.6 2.2-.6 3 0"/>'), T("ซ่อนชื่อ"), T("ชื่อจริงยังซ่อน ไม่มีใครรู้ว่า Servant เป็นใคร"), 'dim'],
  open: [S('<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>'), T("เปิดชื่อ"), T("เปิดชื่อจริงแล้ว / การ์ดนี้ลงหงายแล้วเปิดชื่อจริง"), 'red'],
  cut: [S('<circle cx="6" cy="6.5" r="2.7"/><circle cx="6" cy="17.5" r="2.7"/><path d="M8.3 8 20 18M8.3 16 20 6"/>'), T("เส้นตัด"), T("จบรอบ 8 คนใต้เส้นตกรอบ · เสมอที่เส้นตกหมด"), 'red'],
  out: [S('<path d="M6 6l12 12M18 6 6 18" stroke-width="2.6"/>'), T("ตกรอบ"), T("ตกรอบแล้ว ออกจากสงคราม"), 'dim'],
  dead: [S('<path d="M12 3a7.5 7.5 0 0 0-7.5 7.5c0 2.6 1.3 4.2 3 5.3V19h9v-3.2c1.7-1.1 3-2.7 3-5.3A7.5 7.5 0 0 0 12 3z"/><circle cx="9" cy="11" r="1.7" fill="currentColor"/><circle cx="15" cy="11" r="1.7" fill="currentColor"/><path d="M10.5 19v2M13.5 19v2"/>'), T("แพ้"), T("[แพ้]: แพ้ทันทีจากผลการ์ด ไม่ว่าพลังเท่าไร"), 'red'],
  ready: [S('<circle cx="12" cy="12" r="5"/>', F), T("พร้อม"), T("ใช้ได้รอบนี้"), 'ok'],
  lock: [S('<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>'), T("ต้องมีมานา"), T("การ์ด NP/สกิลใช้ได้เมื่อมี 💧 ถึงตัวเลขนี้"), 'mana'],
  used: [S('<path d="M4.5 12.5l5 5L19.5 7" stroke-width="2.4"/>'), T("ใช้แล้ว"), T("ใช้ไปแล้ว"), 'dim'],
  perm: [S('<path d="M12 12c-2-2.6-3.7-4-5.5-4a4 4 0 0 0 0 8c1.8 0 3.5-1.4 5.5-4zm0 0c2 2.6 3.7 4 5.5 4a4 4 0 0 0 0-8c-1.8 0-3.5 1.4-5.5 4z"/>'), T("ถาวร"), T("อยู่ในสนามต่อทุกรอบ มีผลและให้พลังทุกรอบ"), 'grail'],
  once: [S('<text x="12" y="16.8" text-anchor="middle" font-size="13" font-weight="700" fill="currentColor" stroke="none">1×</text>'), T("ครั้งเดียว"), T("ใช้ได้ครั้งเดียวต่อเกม"), 'grail'],
  extra: [S('<path d="M12 5v14M5 12h14" stroke-width="2.4"/>'), T("ลงเพิ่ม"), T("ลงเพิ่มนอกเหนือการ์ด 2 ใบ"), 'sp'],
  down: [S('<rect x="5.5" y="3" width="13" height="18" rx="2"/><path d="M8.5 6.5h7v11h-7zM8.5 6.5l7 11M15.5 6.5l-7 11" stroke-width="1.2"/>'), T("คว่ำ"), T("ลงคว่ำ: พลัง 0 ไม่เสีย 💧 ไม่มีผล · คนอื่นไม่รู้ว่าเป็นใบอะไร"), 'dim'],
  onUse: [S('<path d="M8 5.5v13l10-6.5z"/>', F), T("ตอนใช้"), T("ผลทำงานตอนลงการ์ด (ขั้น 3.4) ทุกที่ · เป็นความสามารถ Action 2nd Strike ปิดได้"), 'ok'],
  clash: [S('<path d="m12 2.5 1.8 5 4.8-2.6-2 5 5 1.6-5 1.9 2.4 4.8-5-2-1.9 5-1.6-5-5 2.3 2.2-4.9L2.6 12l5-1.7-2.2-4.9 5 2.4z"/>'), T("ตอนปะทะ"), T("ผลทำงานตอนต่อสู้ (ขั้น 4.1) เฉพาะสนามรบ · เป็นความสามารถ Combat 2nd Strike ปิดได้"), 'red'],
  always: [S('<path d="M19 12a7 7 0 1 1-2.1-5M19 4.5V9h-4.5"/>'), T("ตลอด"), T("ทำงานตลอดเวลาที่การ์ดอยู่"), 'dim'],
  stay: [S('<path d="M9 3.5h6l-1 5 3.5 3.5h-11L10 8.5zM12 12v8.5"/>'), T("ค้าง"), T("รอบที่ลงยังไม่มีผล เริ่มมีผลตั้งแต่รอบถัดไป"), 'dim'],
  rules: [S('<path d="M12 6.5C10 5 7 4.5 3.5 5v13.5c3.5-.5 6.5 0 8.5 1.5 2-1.5 5-2 8.5-1.5V5C17 4.5 14 5 12 6.5zM12 6.5V20"/>'), T("กติกา"), T("กติกาแบบย่อและไอคอนทั้งหมด"), 'bone'],
  more: [S('<path d="M9 6l6 6-6 6" stroke-width="2.4"/>'), T("ดูเพิ่ม"), T("เปิดรายละเอียด"), 'grail'],
};
// the step of paper 8.0 a window card is used in, and the phases of the bar
export const WHEN_ICON = { onUse: 'onUse', clash: 'clash', always: 'always', permanent: 'perm', stay: 'stay' };

// the drawings, once per page: every icon refers to its symbol
export const sprite = () => `<svg xmlns="http://www.w3.org/2000/svg" style="position:absolute;width:0;height:0;overflow:hidden" aria-hidden="true">${Object.entries(ICONS).map(([k, [d]]) => `<symbol id="i-${k}" viewBox="0 0 24 24">${d}</symbol>`).join('')}</svg>`;
export const svg = (key) => `<svg class="i" aria-hidden="true" focusable="false"><use href="#i-${key}"/></svg>`;

const att = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
// one icon, optionally with a value after it. o.v: the value line of the bubble ("มานา 12/12"),
// o.t / o.m: another name or meaning, o.w: a short word after the value, o.cls: extra classes.
// Icons inside a card or a button that moves the game show nothing on a tap (the card or button works).
export function ic(key, val = '', o = {}) {
  const I = ICONS[key];
  if (!I) return att(val);
  const data = `${o.v != null ? ` data-v="${att(o.v)}"` : ''}${o.t ? ` data-t="${att(o.t)}"` : ''}${o.m ? ` data-m="${att(o.m)}"` : ''}`;
  const label = att([o.t || I[1], o.v ?? val].filter((x) => x !== '' && x != null).join(' '));
  return `<span class="ic c-${I[3]}${o.cls ? ` ${o.cls}` : ''}" data-ic="${key}"${data} aria-label="${label}">${svg(key)}${val !== '' && val != null ? `<b>${val}</b>` : ''}${o.w ? `<em>${o.w}</em>` : ''}</span>`;
}

// common phrases of the texts (log, notes, card tags) as icons; the text comes in escaped.
// The order matters: "ต้องมีมานา 8" before "มานา 8", "+3 VP" before "3 VP".
const N = '([+−-]?\\d+)';
const RULES = lang() === 'th' ? [
  [new RegExp(`ต้องมีมานา ${N}(?: ขึ้นไป)?`, 'g'), (m, n) => ic('lock', n)],
  [/มานา\s?([+−]\d+)/g, (m, n) => ic('mana', n)],
  [/มานา (\d+)(?!\s?VP)/g, (m, n) => ic('mana', n)],
  [new RegExp(`พลังรวม ${N}`, 'g'), (m, n) => ic('power', n)],
  [/พลัง\s?([+−]\d+)/g, (m, n) => ic('power', n)],
  [new RegExp(`${N} VP`, 'g'), (m, n) => ic('vp', n, { cls: 'r' })],
  [/ได้เปรียบ(?:พื้นที่)? ([+−]\d+)/g, (m, n) => ic('terrain', n)],
  [/\[แพ้\]/g, () => ic('dead', '', { w: T("แพ้") })],
  [/⚔/g, () => ic('fight')],
] : [
  // the other languages: the same phrases, as the dictionary writes them (lang/*.js)
  [tplRe('ต้องมีมานา {0} ขึ้นไป', N), (m, n) => ic('lock', n)],
  [tplRe('ต้องมีมานา {0}', N), (m, n) => ic('lock', n)],
  [tplRe('มานา {0}', '([+−]\\d+)'), (m, n) => ic('mana', n)],
  [tplRe('มานา {0}', '(\\d+)(?!\\s?VP)'), (m, n) => ic('mana', n)],
  [tplRe('พลังรวม {0}', N), (m, n) => ic('power', n)],
  [tplRe('พลัง {0}', '([+−]\\d+)'), (m, n) => ic('power', n)],
  [new RegExp(`${N} VP`, 'g'), (m, n) => ic('vp', n, { cls: 'r' })],
  [tplRe('ได้เปรียบพื้นที่ {0}', '([+−]\\d+)'), (m, n) => ic('terrain', n)],
  [anyRe(['[แพ้]']), () => ic('dead', '', { w: T('แพ้') })],
  [/⚔/g, () => ic('fight')],
];
// each icon goes in as a stand-in first, so a later rule never matches inside an icon's label
export function iconize(html, more = []) {
  const out = [];
  const keep = (h) => `\u0001${out.push(h) - 1}\u0002`;
  const s = [...more, ...RULES].reduce((t, [re, f]) => t.replace(re, (...a) => keep(f(...a))), String(html));
  return s.replace(/\u0001(\d+)\u0002/g, (m, i) => out[+i]);
}
