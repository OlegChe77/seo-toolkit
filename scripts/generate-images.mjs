// Генерирует растровые изображения сайта из SVG-иконок: OG-картинки страниц (1200×630),
// favicon.ico, apple-touch-icon и иконки для site.webmanifest.
// Запуск: npm run images (результат сохраняется в public/ и коммитится в репозиторий).
import fs from 'node:fs';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import siteConfig from '../site.config.js';
import { categories, tools } from '../src/config/pages.js';

const pub = path.resolve('public');
const FONT = "'Segoe UI', Arial, sans-serif";
const CAT = {
  meta: ['#2f5bea', '#e7eeff'],
  content: ['#0d8466', '#e2f4ee'],
  tech: ['#7446d6', '#efe9fc'],
  research: ['#c75b0c', '#fdeee2'],
};

const iconSvg = (name) => fs.readFileSync(path.join(pub, 'icons', `${name}.svg`), 'utf8');
function place(name, x, y, size) {
  const s = iconSvg(name);
  const vb = s.match(/viewBox="([^"]+)"/)[1];
  return `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="${vb}">${s.replace(/^<svg[^>]*>|<\/svg>\s*$/g, '')}</svg>`;
}
const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function wrap(text, max) {
  const out = [''];
  for (const w of text.split(/\s+/)) {
    if ((out.at(-1) + ' ' + w).trim().length > max) out.push(w);
    else out[out.length - 1] = (out.at(-1) + ' ' + w).trim();
  }
  return out;
}
const png = (svg, width) => new Resvg(svg, { fitTo: { mode: 'width', value: width }, font: { loadSystemFonts: true, defaultFontFamily: 'Segoe UI' } }).render().asPng();
const host = new URL(siteConfig.url).host;

function frame(body, accent = '#2f5bea') {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs><radialGradient id="g" cx="0.85" cy="0.1" r="0.9"><stop offset="0" stop-color="#e3eaff"/><stop offset="1" stop-color="#f6f7f9"/></radialGradient></defs>
  <rect width="1200" height="630" fill="url(#g)"/>
  <rect x="0" y="0" width="1200" height="10" fill="${accent}"/>
  <rect x="72" y="64" width="64" height="64" rx="16" fill="#fff" stroke="#e2e5ea"/>${place('seo-gear', 78, 70, 52)}
  <text x="152" y="108" font-family="${FONT}" font-size="30" font-weight="700" fill="#141821">SEO Toolkit</text>
  ${body}
  <text x="72" y="566" font-family="${FONT}" font-size="24" fill="#636b7a">Бесплатно · без регистрации · ${esc(host)}</text>
</svg>`;
}

fs.mkdirSync(path.join(pub, 'og'), { recursive: true });
for (const t of tools) {
  const [color, soft] = CAT[t.category];
  const cat = categories.find((c) => c.id === t.category).name;
  const subtitle = t.h1.split(' — ')[1] || '';
  const lines = wrap(t.summary, 38).slice(0, 3);
  const body = `
  <rect x="72" y="176" width="${cat.length * 13 + 40}" height="44" rx="22" fill="${soft}"/>
  <text x="92" y="205" font-family="${FONT}" font-size="21" font-weight="600" fill="${color}">${esc(cat)}</text>
  <text x="72" y="306" font-family="${FONT}" font-size="76" font-weight="700" fill="#141821" letter-spacing="-1.5">${esc(t.name)}</text>
  <text x="72" y="362" font-family="${FONT}" font-size="36" font-weight="600" fill="#2447c5">${esc(subtitle)}</text>
  ${lines.map((l, i) => `<text x="72" y="${426 + i * 40}" font-family="${FONT}" font-size="28" fill="#475061">${esc(l)}</text>`).join('')}
  <rect x="800" y="150" width="330" height="330" rx="48" fill="#fff" stroke="#e2e5ea" stroke-width="2"/>
  <rect x="824" y="174" width="282" height="282" rx="36" fill="${soft}"/>
  ${place(t.icon, 855, 205, 220)}`;
  fs.writeFileSync(path.join(pub, 'og', `${t.id}.png`), png(frame(body, color), 1200));
}

// Главная и общая OG-картинка.
const homeIcons = ['search-document', 'internet-protected', 'presentation', 'networking', 'programming', 'target', 'share-folder', 'search-time', 'setting'];
const grid = homeIcons.map((n, i) => `<rect x="${760 + (i % 3) * 132}" y="${140 + Math.floor(i / 3) * 132}" width="112" height="112" rx="24" fill="#fff" stroke="#e2e5ea" stroke-width="2"/>${place(n, 774 + (i % 3) * 132, 154 + Math.floor(i / 3) * 132, 84)}`).join('');
const homeBody = `
  <text x="72" y="300" font-family="${FONT}" font-size="88" font-weight="700" fill="#141821" letter-spacing="-2">SEO Toolkit</text>
  <text x="72" y="364" font-family="${FONT}" font-size="36" fill="#475061">10 бесплатных SEO-инструментов</text>
  <text x="72" y="410" font-family="${FONT}" font-size="36" fill="#475061">прямо в браузере</text>
  ${grid}`;
fs.writeFileSync(path.join(pub, 'og-image.png'), png(frame(homeBody), 1200));

// Иконка сайта: «SEO-шестерёнка» на белой плитке.
const tile = (size, radius, pad) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" rx="${radius}" fill="#fff"/>${place('seo-gear', pad, pad, size - pad * 2)}</svg>`;
fs.writeFileSync(path.join(pub, 'favicon.svg'), tile(64, 14, 3));
fs.writeFileSync(path.join(pub, 'apple-touch-icon.png'), png(tile(180, 0, 18), 180));
fs.writeFileSync(path.join(pub, 'icon-192.png'), png(tile(192, 40, 14), 192));
fs.writeFileSync(path.join(pub, 'icon-512.png'), png(tile(512, 104, 36), 512));
fs.writeFileSync(path.join(pub, 'icon-512-maskable.png'), png(tile(512, 0, 100), 512));

// favicon.ico с PNG 32×32 и 16×16 внутри.
const sizes = [32, 16].map((s) => png(tile(64, 14, 3), s));
const header = Buffer.alloc(6 + 16 * sizes.length);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
sizes.forEach((buf, i) => {
  const s = [32, 16][i];
  const e = 6 + i * 16;
  header.writeUInt8(s, e);
  header.writeUInt8(s, e + 1);
  header.writeUInt16LE(1, e + 4);
  header.writeUInt16LE(32, e + 6);
  header.writeUInt32LE(buf.length, e + 8);
  header.writeUInt32LE(offset, e + 12);
  offset += buf.length;
});
fs.writeFileSync(path.join(pub, 'favicon.ico'), Buffer.concat([header, ...sizes]));
console.log(`Готово: ${tools.length} OG-картинок, og-image.png, favicon и иконки manifest`);
