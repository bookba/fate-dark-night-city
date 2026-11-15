// Draws the site's background, an original "dark night city": a moonlit sky with a faint magic
// circle, a skyline with lit windows, a bridge over the river, mist. Nothing copied from anywhere.
// Run: node scripts/make-night-city.mjs  ->  src/art/map/night-city.webp (needs Playwright + ImageMagick)
// The admin page can swap the picture (รูปภาพ > แผนที่ / ฉากหลัง), so this only has to run again to redraw it.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'src/art/map/night-city.webp');
const W = 2400, H = 1350;

let seed = 20261115; // the same picture every run
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const r = (a, b) => a + rnd() * (b - a);
const f = (n) => Math.round(n * 10) / 10;

// ---- sky ----
let stars = '';
for (let i = 0; i < 520; i++) {
  const y = Math.pow(rnd(), 1.7) * H * 0.62, x = rnd() * W;
  const big = rnd() < 0.06;
  stars += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(big ? r(1.4, 2.2) : r(0.5, 1.2))}" fill="${rnd() < 0.15 ? '#ffd9b0' : '#dfe8ff'}" opacity="${f(r(0.25, big ? 1 : 0.8))}"/>`;
}
const MX = 1760, MY = 300, MR = 118; // the moon

// the magic circle around the moon: rings, a star of two triangles, marks like letters
function circle(cx, cy, R) {
  let s = `<g fill="none" stroke="#e7c46a" stroke-linecap="round">`;
  s += `<circle cx="${cx}" cy="${cy}" r="${R}" stroke-width="2.2" opacity=".5"/>`;
  s += `<circle cx="${cx}" cy="${cy}" r="${R - 16}" stroke-width="1" opacity=".45"/>`;
  s += `<circle cx="${cx}" cy="${cy}" r="${R * 0.72}" stroke-width="1.4" opacity=".4"/>`;
  s += `<circle cx="${cx}" cy="${cy}" r="${R + 34}" stroke-width="1" stroke-dasharray="2 14" opacity=".45"/>`;
  const tri = (rot) => [0, 1, 2].map((k) => { const a = rot + k * 2 * Math.PI / 3; return `${f(cx + Math.cos(a) * R * 0.72)},${f(cy + Math.sin(a) * R * 0.72)}`; }).join(' ');
  s += `<polygon points="${tri(-Math.PI / 2)}" stroke-width="1.3" opacity=".38"/><polygon points="${tri(Math.PI / 2)}" stroke-width="1.3" opacity=".38"/>`;
  for (let k = 0; k < 48; k++) { // the band of marks between the two outer rings
    const a = k / 48 * 2 * Math.PI, rr = R - 8;
    const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
    const t = a + Math.PI / 2, l = r(3, 6);
    const kind = k % 3;
    if (kind === 0) s += `<line x1="${f(x - Math.cos(t) * l)}" y1="${f(y - Math.sin(t) * l)}" x2="${f(x + Math.cos(t) * l)}" y2="${f(y + Math.sin(t) * l)}" stroke-width="1.4" opacity=".55"/>`;
    else if (kind === 1) s += `<circle cx="${f(x)}" cy="${f(y)}" r="2" stroke-width="1.1" opacity=".5"/>`;
    else s += `<line x1="${f(x - Math.cos(a) * l)}" y1="${f(y - Math.sin(a) * l)}" x2="${f(x + Math.cos(a) * l)}" y2="${f(y + Math.sin(a) * l)}" stroke-width="1.4" opacity=".55"/>`;
  }
  return s + '</g>';
}

// thin clouds drifting over the sky
let clouds = '';
for (let i = 0; i < 9; i++) {
  const y = r(140, 640), x = r(-200, W), w = r(380, 900), h = r(14, 34);
  clouds += `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(w / 2)}" ry="${f(h)}" fill="${y < 420 ? '#3a4470' : '#5a2f55'}" opacity="${f(r(0.18, 0.34))}"/>`;
}

// ---- the city, three rows: far (hazy), middle, near (darkest) ----
function skyline(base, minH, maxH, minW, maxW, fill, winColors, winChance, spires) {
  let blocks = '', wins = '';
  let x = -40;
  while (x < W + 40) {
    const w = r(minW, maxW);
    let h = r(minH, maxH);
    if (rnd() < 0.08) h *= 1.55; // a tall tower now and then
    const top = base - h;
    blocks += `<rect x="${f(x)}" y="${f(top)}" width="${f(w + 1)}" height="${f(H - top)}"/>`;
    const roof = rnd();
    if (spires && h > maxH * 0.95 && roof < 0.6) blocks += `<polygon points="${f(x + w / 2 - 3)},${f(top)} ${f(x + w / 2)},${f(top - r(40, 90))} ${f(x + w / 2 + 3)},${f(top)}"/>`;
    else if (roof < 0.25) blocks += `<rect x="${f(x + w * 0.25)}" y="${f(top - 14)}" width="${f(w * 0.5)}" height="15"/>`;
    else if (roof < 0.35) blocks += `<polygon points="${f(x)},${f(top)} ${f(x + w / 2)},${f(top - w * 0.35)} ${f(x + w)},${f(top)}"/>`;
    if (winColors) { // lit windows on a grid, most of them dark
      const cw = 5, ch = 7, gx = 10, gy = 14;
      for (let wy = top + 12; wy < base + 220; wy += gy) for (let wx = x + 7; wx < x + w - cw - 4; wx += gx) {
        if (rnd() > winChance) continue;
        wins += `<rect x="${f(wx)}" y="${f(wy)}" width="${cw}" height="${ch}" fill="${winColors[(rnd() * winColors.length) | 0]}" opacity="${f(r(0.35, 0.95))}"/>`;
      }
    }
    x += w + r(-2, 6);
  }
  return `<g fill="${fill}">${blocks}</g><g>${wins}</g>`;
}

// a suspension bridge across the river on the left
function bridge() {
  const y = 1120, x0 = -60, x1 = 1050, t1 = 230, t2 = 790, th = 260;
  let s = `<g fill="#070a14" stroke="#070a14">`;
  s += `<rect x="${x0}" y="${y}" width="${x1 - x0}" height="16" stroke="none"/>`;
  for (const t of [t1, t2]) s += `<rect x="${t - 12}" y="${y - th}" width="24" height="${th + 40}" stroke="none"/><rect x="${t - 18}" y="${y - th - 10}" width="36" height="14" stroke="none"/>`;
  const cable = (a, b, sag) => `<path d="M${a} ${y - th + 4} Q${(a + b) / 2} ${y - th + 4 + sag} ${b} ${y - th + 4}" fill="none" stroke-width="3"/>`;
  s += cable(t1, t2, 230) + `<path d="M${x0} ${y - 40} Q${(x0 + t1) / 2} ${y - 150} ${t1} ${y - th + 4}" fill="none" stroke-width="3"/>` + `<path d="M${t2} ${y - th + 4} Q${(t2 + x1) / 2} ${y - 150} ${x1} ${y - 30}" fill="none" stroke-width="3"/>`;
  for (let x = t1 + 22; x < t2 - 10; x += 22) { // hangers
    const u = (x - t1) / (t2 - t1), cy = (y - th + 4) + 230 * 2 * u * (1 - u) * 1; // quadratic: 2u(1-u)*sag is the curve's drop
    s += `<line x1="${x}" y1="${f(cy)}" x2="${x}" y2="${y}" stroke-width="1"/>`;
  }
  s += '</g>';
  let lamps = '';
  for (let x = x0 + 20; x < x1; x += 46) lamps += `<circle cx="${x}" cy="${y - 3}" r="2.6" fill="#ffcf7a" opacity=".9"/>`;
  return s + lamps;
}

// the river: dark water with the lights' reflections
let ripples = '';
for (let i = 0; i < 260; i++) {
  const x = rnd() * W, y = r(1150, H), w = r(8, 60);
  ripples += `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="1.6" fill="${rnd() < 0.7 ? '#ffc874' : '#8fb7ff'}" opacity="${f(r(0.08, 0.35))}"/>`;
}
for (let i = 0; i < 70; i++) { // the moon's path on the water
  const y = r(1150, H), w = r(20, 120);
  ripples += `<rect x="${f(MX - w / 2 + r(-50, 50))}" y="${f(y)}" width="${f(w)}" height="2" fill="#f4ecd8" opacity="${f(r(0.12, 0.45))}"/>`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs>
  <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#03050c"/><stop offset=".38" stop-color="#0a1129"/><stop offset=".64" stop-color="#1c1640"/><stop offset=".8" stop-color="#4a1d3e"/><stop offset=".86" stop-color="#2a1430"/><stop offset="1" stop-color="#05060d"/>
  </linearGradient>
  <radialGradient id="glow" cx="${MX}" cy="${MY}" r="560" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#f6e6c4" stop-opacity=".55"/><stop offset=".22" stop-color="#d7a56a" stop-opacity=".18"/><stop offset=".55" stop-color="#8a2a48" stop-opacity=".1"/><stop offset="1" stop-color="#8a2a48" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="moon" cx=".42" cy=".38" r=".7">
    <stop offset="0" stop-color="#fffaf0"/><stop offset=".7" stop-color="#efe3c6"/><stop offset="1" stop-color="#d9c49a"/>
  </radialGradient>
  <radialGradient id="cityglow" cx="${W * 0.45}" cy="1080" r="1300" gradientUnits="userSpaceOnUse" gradientTransform="translate(0 756) scale(1 .3)">
    <stop offset="0" stop-color="#e0584e" stop-opacity=".7"/><stop offset=".45" stop-color="#8a2a4c" stop-opacity=".32"/><stop offset="1" stop-color="#7a2648" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="mist" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6a4a7a" stop-opacity="0"/><stop offset=".5" stop-color="#6a4a7a" stop-opacity=".28"/><stop offset="1" stop-color="#6a4a7a" stop-opacity="0"/></linearGradient>
  <linearGradient id="water" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#120d22"/><stop offset="1" stop-color="#03040a"/></linearGradient>
  <filter id="soft" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="18"/></filter>
  <filter id="haze"><feGaussianBlur stdDeviation="1.4"/></filter>
  <filter id="haze2"><feGaussianBlur stdDeviation="5"/></filter>
</defs>
<rect width="${W}" height="${H}" fill="url(#sky)"/>
<rect width="${W}" height="${H}" fill="url(#glow)"/>
<g>${stars}</g>
<g filter="url(#soft)">${clouds}</g>
${circle(MX, MY, 250)}
<circle cx="${MX}" cy="${MY}" r="${MR + 22}" fill="#f6e6c4" opacity=".12"/>
<circle cx="${MX}" cy="${MY}" r="${MR}" fill="url(#moon)"/>
<g fill="#c9b48a" opacity=".22" filter="url(#haze2)"><circle cx="${MX - 34}" cy="${MY - 20}" r="22"/><circle cx="${MX + 30}" cy="${MY + 26}" r="15"/><circle cx="${MX + 8}" cy="${MY - 52}" r="10"/><circle cx="${MX - 52}" cy="${MY + 40}" r="12"/><circle cx="${MX + 52}" cy="${MY - 14}" r="8"/></g>
<rect width="${W}" height="${H}" fill="url(#cityglow)"/>
<g filter="url(#haze)" opacity=".85">${skyline(1030, 160, 400, 40, 110, '#231e45', ['#b9a6ff'], 0.04, true)}</g>
<rect x="0" y="880" width="${W}" height="220" fill="url(#mist)"/>
${skyline(1075, 90, 280, 50, 130, '#100e22', ['#ffc874', '#ffe2a8', '#9cc4ff'], 0.12, true)}
${skyline(1135, 50, 170, 70, 170, '#07070f', ['#ffb35c', '#ffd38a'], 0.09, false)}
<rect x="0" y="1135" width="${W}" height="${H - 1135}" fill="url(#water)"/>
<g>${ripples}</g>
${bridge()}
<rect x="0" y="1128" width="${W}" height="40" fill="url(#mist)"/>
</svg>`;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nightcity-'));
fs.writeFileSync(path.join(tmp, 'bg.svg'), svg);
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H } });
await page.setContent(`<html><body style="margin:0">${svg}</body></html>`);
await page.screenshot({ path: path.join(tmp, 'bg.png') });
await browser.close();
execFileSync('convert', [path.join(tmp, 'bg.png'), '-quality', '82', '-define', 'webp:method=6', OUT]);
console.log('wrote', path.relative(ROOT, OUT), fs.statSync(OUT).size, 'bytes');
