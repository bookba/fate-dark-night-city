// Placeholder skill and class icons drawn as inline SVG (temporary designs).
const C = { B: '#c0392b', A: '#2e6fd1', Q: '#2a9d4b', M: '#7b4fc9', N: '#6b6f78', G: '#c9a227' };

const ring = (fill, body) => `<svg viewBox="0 0 64 64" aria-hidden="true"><defs><radialGradient id="g${fill.slice(1)}" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#fff" stop-opacity=".45"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>
  <circle cx="32" cy="32" r="30" fill="${fill}"/><circle cx="32" cy="32" r="30" fill="url(#g${fill.slice(1)})"/><circle cx="32" cy="32" r="27" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="2"/>
  <g fill="#fff" stroke="#fff" stroke-linecap="round" stroke-linejoin="round">${body}</g></svg>`;

const SWORD = '<path d="M44 14 L48 18 L28 38 L24 34 Z" stroke-width="1"/><path d="M20 34 L30 44" stroke-width="4" fill="none"/><path d="M22 42 L16 48" stroke-width="5" fill="none"/>';
const BURST = '<path d="M32 10 L36 26 L52 20 L40 32 L54 42 L36 38 L32 54 L28 38 L10 42 L24 32 L12 20 L28 26 Z" stroke-width="1"/>';
const POWER = '<path d="M32 12 L46 30 H37 V50 H27 V30 H18 Z" stroke-width="1"/>';
const WIND = '<path d="M14 26 H38 a6 6 0 1 0 -6 -6" fill="none" stroke-width="4"/><path d="M14 36 H46 a6 6 0 1 1 -6 6" fill="none" stroke-width="4"/><path d="M18 46 H30" fill="none" stroke-width="4"/>';
const BOLT = '<path d="M36 10 L18 36 H30 L26 54 L46 26 H34 Z" stroke-width="1"/>';
const STAR = '<path d="M32 8 L38 25 L56 25 L41 36 L47 54 L32 43 L17 54 L23 36 L8 25 L26 25 Z" stroke-width="1"/>';
const S3 = { B: POWER, A: WIND, Q: BOLT };

export function skillIcon(sk, sv) {
  if (sk.key === 's1') return ring(C.N, SWORD);
  if (sk.key === 's2') return ring(C.M, BURST);
  if (sk.key === 's3') return ring(C[sv.S], S3[sv.S]);
  return ring(C.G, STAR);
}

export const csIcon = {
  boost: ring('#b03434', '<path d="M32 12 L44 28 H36 V40 H28 V28 H20 Z" stroke-width="1"/><text x="32" y="55" font-size="13" font-weight="700" text-anchor="middle" stroke="none">+5</text>'),
  heal: ring('#2a9d4b', '<path d="M32 50 C14 38 12 26 20 20 C26 16 31 20 32 24 C33 20 38 16 44 20 C52 26 50 38 32 50 Z" stroke-width="1"/>'),
  escape: ring('#4a5568', '<circle cx="36" cy="15" r="5" stroke="none"/><path d="M34 22 L28 36 L36 42 L34 52 M28 36 L20 46 M31 27 L42 32 M31 27 L22 28" fill="none" stroke-width="4"/>'),
};

// a shield with the class initial, for Servants whose name is still hidden
const CLS_COL = { Saber: '#2e6fd1', Archer: '#c0392b', Lancer: '#2a9d4b', Rider: '#8e44ad', Caster: '#7b4fc9', Assassin: '#4a4a4a', Berserker: '#8b1e1e' };
export function classEmblem(cls) {
  const c = CLS_COL[cls] || '#555';
  return `<svg viewBox="0 0 100 120" aria-hidden="true"><path d="M50 4 L94 18 V58 C94 88 72 108 50 116 C28 108 6 88 6 58 V18 Z" fill="${c}" stroke="#e8c15a" stroke-width="4"/>
    <path d="M50 14 L84 25 V58 C84 82 67 98 50 105 C33 98 16 82 16 58 V25 Z" fill="#0003"/>
    <text x="50" y="74" font-size="46" font-weight="800" fill="#fff" text-anchor="middle" font-family="serif">${cls[0]}</text>
    <text x="50" y="96" font-size="11" fill="#fff" text-anchor="middle" opacity=".85">?</text></svg>`;
}
