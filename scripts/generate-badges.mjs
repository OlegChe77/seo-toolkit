// Значки «SEO-оценка» для сайтов, проверенных в SEO-анализе: 4 размера × оценки 0–100.
// Картинки — 3D-эмодзи Microsoft Fluent Emoji (MIT, assets/fluent-emoji/LICENSE): кубок, медаль, график, инструменты.
// Значок — SVG: фон, шкала и текст векторные (чёткие на любом экране), а 3D-картинка вставлена PNG ровно
// двойного размера — так файл весит единицы килобайт. Запуск: npm run badges (результат в public/badge/
// коммитится). Только часть оценок: npm run badges -- 96 82 63 31 (плюс PNG-превью в scratch/, см. --preview).
import fs from 'node:fs';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import { BADGE_SIZES, badgeGrade } from '../src/tools/audit/badge.js';

const out = path.resolve('public/badge');
const art = path.resolve('assets/fluent-emoji');
const FONT = "'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

// 3D-картинка, уменьшенная до двойного размера показа: { 'trophy:46': dataURI }.
const iconCache = new Map();
function iconData(name, size) {
  const key = `${name}:${size}`;
  if (!iconCache.has(key)) {
    const src = `data:image/png;base64,${fs.readFileSync(path.join(art, `${name}.png`)).toString('base64')}`;
    const px = size * 2;
    const pngData = new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${px}" height="${px}"><image width="${px}" height="${px}" xlink:href="${src}"/></svg>`).render().asPng();
    iconCache.set(key, `data:image/png;base64,${pngData.toString('base64')}`);
  }
  return iconCache.get(key);
}

const COLORS = {
  great: ['#ffe27a', '#f5a524'],
  good: ['#6ee7b7', '#10b981'],
  mid: ['#fde68a', '#f59e0b'],
  bad: ['#fca5a5', '#ef4444'],
};

function defs(g, w, h) {
  const [c1, c2] = COLORS[g.id];
  return `<defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1e2a4a"/><stop offset="1" stop-color="#0b1222"/></linearGradient>
    <radialGradient id="glow" cx="0.12" cy="0.2" r="${Math.max(w, h) > 200 ? 0.35 : 0.8}"><stop offset="0" stop-color="${c2}" stop-opacity="0.38"/><stop offset="1" stop-color="${c2}" stop-opacity="0"/></radialGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient>
    <linearGradient id="shine" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity="0.16"/><stop offset="0.5" stop-color="#ffffff" stop-opacity="0"/></linearGradient>
  </defs>`;
}

const card = (w, h, r) => `
  <rect width="${w}" height="${h}" rx="${r}" fill="url(#bg)"/>
  <rect width="${w}" height="${h}" rx="${r}" fill="url(#glow)"/>
  <rect width="${w}" height="${h / 2}" rx="${r}" fill="url(#shine)"/>
  <rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="${r - 0.5}" fill="none" stroke="#ffffff" stroke-opacity="0.16"/>`;

const img = (g, x, y, size) => `<image x="${x}" y="${y}" width="${size}" height="${size}" xlink:href="${iconData(g.icon, size)}"/>`;
const svg = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;

function ring(cx, cy, r, width, score) {
  const c = 2 * Math.PI * r;
  const arc = score > 0
    ? `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="url(#accent)" stroke-width="${width}" stroke-linecap="round" stroke-dasharray="${(c * score) / 100} ${c}" transform="rotate(-90 ${cx} ${cy})"/>`
    : '';
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#ffffff" stroke-opacity="0.12" stroke-width="${width}"/>${arc}`;
}

const DESIGNS = {
  // Кнопка 88×31, как счётчики Рунета.
  button: (s, g) => svg(88, 31, `${defs(g, 88, 31)}${card(88, 31, 6)}
    ${img(g, 4, 4, 23)}
    <text x="30" y="12.5" font-family="${FONT}" font-size="7.5" font-weight="700" letter-spacing="0.6" fill="#a9b4cc">SEO-ОЦЕНКА</text>
    <text x="30" y="26" font-family="${FONT}" font-weight="700" fill="#ffffff"><tspan font-size="13.5">${s}</tspan><tspan font-size="8" fill="#a9b4cc" dx="1">/100</tspan></text>`),

  // Плашка 180×50.
  plate: (s, g) => svg(180, 50, `${defs(g, 180, 50)}${card(180, 50, 10)}
    ${img(g, 7, 6, 38)}
    <text x="51" y="19" font-family="${FONT}" font-size="10" font-weight="700" letter-spacing="0.5" fill="#a9b4cc">SEO-ОЦЕНКА</text>
    <text x="51" y="41" font-family="${FONT}" font-weight="700" fill="#ffffff"><tspan font-size="22">${s}</tspan><tspan font-size="11" fill="#a9b4cc" dx="2">из 100</tspan></text>
    <text x="171" y="19" text-anchor="end" font-family="${FONT}" font-size="11" font-weight="700" fill="url(#accent)">${g.label}</text>
    <text x="171" y="40" text-anchor="end" font-family="${FONT}" font-size="8.5" fill="#7d89a6">SEO Toolkit</text>`),

  // Медаль 150×150.
  medal: (s, g) => svg(150, 150, `${defs(g, 150, 150)}${card(150, 150, 22)}
    ${ring(75, 62, 42, 8, s)}
    <text x="75" y="70" text-anchor="middle" font-family="${FONT}" font-size="30" font-weight="700" fill="#ffffff">${s}</text>
    <text x="75" y="84" text-anchor="middle" font-family="${FONT}" font-size="9.5" fill="#a9b4cc">из 100</text>
    ${img(g, 100, 78, 34)}
    <text x="75" y="125" text-anchor="middle" font-family="${FONT}" font-size="13" font-weight="700" fill="url(#accent)">${g.label}</text>
    <text x="75" y="140" text-anchor="middle" font-family="${FONT}" font-size="8.5" letter-spacing="0.4" fill="#7d89a6">SEO-ОЦЕНКА · SEO TOOLKIT</text>`),

  // Баннер 468×60.
  banner: (s, g) => svg(468, 60, `${defs(g, 468, 60)}${card(468, 60, 12)}
    ${img(g, 9, 7, 46)}
    <text x="64" y="24" font-family="${FONT}" font-size="11" font-weight="700" letter-spacing="0.6" fill="#a9b4cc">SEO-ОЦЕНКА САЙТА</text>
    <text x="64" y="47" font-family="${FONT}" font-weight="700" fill="#ffffff"><tspan font-size="22">${s}</tspan><tspan font-size="12" fill="#a9b4cc" dx="3">из 100</tspan><tspan font-size="14" fill="url(#accent)" dx="10">${g.label}</tspan></text>
    <rect x="296" y="20" width="156" height="8" rx="4" fill="#ffffff" fill-opacity="0.12"/>
    ${s > 0 ? `<rect x="296" y="20" width="${Math.max(8, (156 * s) / 100)}" height="8" rx="4" fill="url(#accent)"/>` : ''}
    <text x="452" y="45" text-anchor="end" font-family="${FONT}" font-size="10.5" fill="#a9b4cc">Проверено в <tspan font-weight="700" fill="#ffffff">SEO Toolkit</tspan> ›</text>`),
};

const args = process.argv.slice(2);
const preview = args.includes('--preview') ? path.resolve(args[args.indexOf('--preview') + 1] || 'badge-preview') : null;
const scores = args.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 100);
const list = scores.length ? scores : Array.from({ length: 101 }, (_, i) => i);
let bytes = 0;
for (const size of BADGE_SIZES) {
  fs.mkdirSync(path.join(out, size.id), { recursive: true });
  for (const s of list) {
    // Пробелы между тегами не нужны — значок грузится на чужих сайтах, каждый байт на счету.
    const code = DESIGNS[size.id](s, badgeGrade(s)).replace(/>\s+</g, '><').trim();
    fs.writeFileSync(path.join(out, size.id, `${s}.svg`), code);
    bytes += code.length;
    if (preview) {
      fs.mkdirSync(preview, { recursive: true });
      const pngData = new Resvg(code, { fitTo: { mode: 'width', value: size.w * 2 }, font: { loadSystemFonts: true, defaultFontFamily: 'Segoe UI' } }).render().asPng();
      fs.writeFileSync(path.join(preview, `${size.id}-${s}.png`), pngData);
    }
  }
}
console.log(`Готово: ${list.length * BADGE_SIZES.length} значков, ${Math.round(bytes / 1024)} КБ`);
