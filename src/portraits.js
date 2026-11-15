// Placeholder class portraits, drawn as inline SVG so the demo needs no image
// files. To use real art later, point CLASS_ART[cls] at an image URL instead.

const THEMES = {
  Saber: { bg: '#1c3366', glow: '#ffd77a', accent: '#9cc2ff' },
  Archer: { bg: '#5c1621', glow: '#ff8a7a', accent: '#f2d6a0' },
  Lancer: { bg: '#123f61', glow: '#7fd4ff', accent: '#e2f2ff' },
  Rider: { bg: '#43205e', glow: '#d7a4ff', accent: '#f6e8ff' },
  Caster: { bg: '#2c1f57', glow: '#b48cff', accent: '#e6dcff' },
  Assassin: { bg: '#18241f', glow: '#7affc4', accent: '#d8e6de' },
  Berserker: { bg: '#4a0b10', glow: '#ff3b3b', accent: '#ffb0a0' },
};

const BODY = '<path d="M50 420 C55 305 100 240 150 232 C200 240 245 305 250 420 Z" fill="#07080d"/>';
const HEAD = '<circle cx="150" cy="168" r="44" fill="#07080d"/>';
const HOOD = '<path d="M150 98 C100 110 92 170 100 230 L200 230 C208 170 200 110 150 98 Z" fill="#07080d"/>';

function weapon(cls, t) {
  const g = t.glow, a = t.accent;
  switch (cls) {
    case 'Saber': return `<g transform="rotate(-18 150 230)" filter="url(#glow)">
      <path d="M143 40 L157 40 L160 300 L150 326 L140 300 Z" fill="${a}"/>
      <rect x="112" y="296" width="76" height="12" rx="4" fill="${g}"/>
      <rect x="144" y="306" width="12" height="54" fill="${g}"/><circle cx="150" cy="366" r="9" fill="${g}"/></g>`;
    case 'Archer': return `<g filter="url(#glow)" fill="none" stroke="${g}" stroke-width="7" stroke-linecap="round">
      <path d="M205 60 Q 290 230 205 400"/><line x1="205" y1="60" x2="205" y2="400" stroke="${a}" stroke-width="2"/>
      <line x1="40" y1="230" x2="250" y2="230" stroke="${a}" stroke-width="4"/>
      <path d="M250 230 L230 218 M250 230 L230 242" stroke="${a}" stroke-width="5"/></g>`;
    case 'Lancer': return `<g filter="url(#glow)"><line x1="60" y1="410" x2="238" y2="70" stroke="${a}" stroke-width="7" stroke-linecap="round"/>
      <path d="M238 70 L262 22 L250 76 L268 84 Z" fill="${g}"/><path d="M230 86 L252 50 L246 96 Z" fill="${g}"/></g>`;
    case 'Rider': return `<g filter="url(#glow)" fill="${g}" opacity=".9">
      ${[0, 1, 2, 3].map((i) => `<path d="M140 230 C ${100 - i * 18} ${150 - i * 22} ${50 - i * 8} ${150 - i * 30} ${20 + i * 2} ${180 - i * 28} C ${70 - i * 6} ${200 - i * 18} ${100} ${220} 140 238 Z" opacity="${0.9 - i * 0.15}"/>`).join('')}
      ${[0, 1, 2, 3].map((i) => `<path d="M160 230 C ${200 + i * 18} ${150 - i * 22} ${250 + i * 8} ${150 - i * 30} ${280 - i * 2} ${180 - i * 28} C ${230 + i * 6} ${200 - i * 18} ${200} ${220} 160 238 Z" opacity="${0.9 - i * 0.15}"/>`).join('')}</g>`;
    case 'Caster': return `<g filter="url(#glow)"><line x1="232" y1="120" x2="222" y2="410" stroke="${a}" stroke-width="7" stroke-linecap="round"/>
      <circle cx="233" cy="104" r="20" fill="${g}"/>
      <g fill="none" stroke="${g}" stroke-width="2" opacity=".8"><circle cx="150" cy="330" r="70"/><circle cx="150" cy="330" r="56"/>
      <path d="M150 260 L211 365 L89 365 Z"/><path d="M150 400 L89 295 L211 295 Z"/></g></g>`;
    case 'Assassin': return `<g filter="url(#glow)"><ellipse cx="150" cy="172" rx="30" ry="38" fill="${a}"/>
      <path d="M128 162 L146 168 L128 176 Z M172 162 L154 168 L172 176 Z" fill="#07080d"/>
      <path d="M140 196 L160 196" stroke="#07080d" stroke-width="3"/>
      <path d="M70 300 L120 270 L118 278 Z M230 300 L180 270 L182 278 Z" fill="${g}"/></g>`;
    case 'Berserker': return `<g filter="url(#glow)"><circle cx="134" cy="166" r="6" fill="${g}"/><circle cx="166" cy="166" r="6" fill="${g}"/>
      <g stroke="${g}" stroke-width="9" stroke-linecap="round" opacity=".9">
      <line x1="60" y1="250" x2="140" y2="390"/><line x1="110" y1="240" x2="190" y2="390"/><line x1="160" y1="240" x2="240" y2="380"/></g></g>`;
    default: return '';
  }
}

function svgFor(cls) {
  const t = THEMES[cls];
  const hooded = cls === 'Assassin' || cls === 'Caster';
  const behind = cls === 'Rider' ? weapon(cls, t) : '';
  const front = cls === 'Rider' ? '' : weapon(cls, t);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 420">
  <defs>
    <radialGradient id="bg" cx="50%" cy="40%" r="75%"><stop offset="0" stop-color="${t.bg}"/><stop offset="1" stop-color="#05060a"/></radialGradient>
    <radialGradient id="halo" cx="50%" cy="40%" r="50%"><stop offset="0" stop-color="${t.glow}" stop-opacity=".55"/><stop offset="1" stop-color="${t.glow}" stop-opacity="0"/></radialGradient>
    <filter id="glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>
  <rect width="300" height="420" fill="url(#bg)"/>
  <circle cx="150" cy="170" r="150" fill="url(#halo)"/>
  <g fill="none" stroke="${t.glow}" stroke-opacity=".18"><circle cx="150" cy="170" r="120"/><circle cx="150" cy="170" r="135" stroke-dasharray="4 8"/></g>
  ${behind}${BODY}${hooded ? HOOD : HEAD}${front}
  <text x="150" y="404" text-anchor="middle" font-family="Georgia,serif" font-size="30" letter-spacing="6" fill="${t.glow}" opacity=".85">${cls.toUpperCase()}</text>
</svg>`;
}

export const CLASS_ART = Object.fromEntries(Object.keys(THEMES).map((cls) =>
  [cls, `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgFor(cls))}`]));

export const CLASS_COLOR = Object.fromEntries(Object.entries(THEMES).map(([k, v]) => [k, v.glow]));
