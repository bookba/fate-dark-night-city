// npm run online:test-cards — the online game with cards changed on the admin page (B 15 Nov 2026):
// every Servant loses an NP/skill card and two deck cards and gets new ones, numbers change, and the
// Masters' cards change. The server reads the edits from its data folder like on Render; the pretend
// pages get them the way a page does (window.__OVR), then test.mjs plays a whole game with them.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const svs = ['artoria', 'emiya', 'cu', 'medusa', 'medea', 'kojiro', 'heracles', 'gilgamesh', 'hassan'];
const servants = {};
for (const k of svs) {
  servants[k] = {
    skills: [
      { o: 0, power: 14, mana: 3 }, { o: 2 },
      { name: { th: 'การ์ดทดสอบ', en: 'Test card' }, types: ['X', 'M'], power: 4, mana: 1, fx: { no8: true, mana: 2, win: 3 }, use: [{ when: 'prep', where: 'any', fx: { vp: 1 } }], limit: 'round', text: { th: 'การ์ดทดสอบของแอดมิน', en: "The admin's test card" } },
      { name: 'Test NP', types: ['N'], power: 12, mana: 5, fx: { reveal: true, once: true, zeroOpp: 'A' } },
    ],
    deck: [...Array.from({ length: 10 }, (_, j) => ({ o: j + 2 })), { o: 3, power: 9 }, { types: ['A'], power: 6, mana: 2, basic: true }, { name: 'Blink', types: ['X'], power: 2, mana: 1, fx: { move: 'next' } }],
  };
}
const game = { servants, cards: { kanshou: { power: 8 }, snake1: { power: 6, mana: 1 } } };
const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'fdnc-cards-')), 'overrides.json');
fs.writeFileSync(file, JSON.stringify({ v: 1, game }));
process.env.TEST_OVERRIDES = file;
process.env.TEST_CARD = 'Test NP';
globalThis.window = { __OVR: { game } };
const { SERVANTS } = await import('../v5/data.js');
if (SERVANTS[0].skills.length !== 4 || SERVANTS[0].skills[0].power !== 14) { console.log('FAIL: the page did not take the card edits'); process.exit(1); }
await import('./test.mjs');
