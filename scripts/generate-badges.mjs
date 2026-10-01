// Значки «SEO-оценка» для сайтов, проверенных в SEO-анализе: 2 темы × 4 размера × оценки 0–100.
// Картинки — 3D-эмодзи Microsoft Fluent Emoji (MIT, assets/fluent-emoji/LICENSE): кубок, медаль, график, инструменты.
// Значок — SVG: фон, шкала и текст векторные (чёткие на любом экране), а 3D-картинка вставлена PNG ровно
// двойного размера — так файл весит единицы килобайт. Тёмные — public/badge/<размер>/<оценка>.svg,
// светлые — public/badge/light/<размер>/<оценка>.svg (пути см. badgeUrl в src/tools/audit/badge.js).
// Запуск: npm run badges (результат коммитится). Часть оценок с PNG-превью: npm run badges -- 96 63 --preview <папка>
import fs from 'node:fs';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import { BADGE_SIZES, BADGE_THEMES, badgeGrade, badgePath } from '../src/tools/audit/badge.js';

const art = path.resolve('assets/fluent-emoji');
const FONT = "'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

const THEMES = {
  dark: {
    bg: ['#1e2a4a', '#0b1222'], border: ['#ffffff', 0.16], text: '#ffffff', muted: '#a9b4cc', faint: '#7d89a6',
    glow: 0.38, shine: 0.16, track: ['#ffffff', 0.12], pill: 0.16,
    accent: { great: ['#ffe27a', '#f5a524'], good: ['#6ee7b7', '#10b981'], mid: ['#fde68a', '#f59e0b'], bad: ['#fca5a5', '#ef4444'] },
  },
  light: {
    bg: ['#ffffff', '#eef2f9'], border: ['#0f172a', 0.12], text: '#0f172a', muted: '#55607a', faint: '#7a849b',
    glow: 0.2, shine: 0.6, track: ['#0f172a', 0.08], pill: 0.12,
    accent: { great: ['#f2a20c', '#b86e00'], good: ['#10b981', '#047857'], mid: ['#f59e0b', '#b45309'], bad: ['#ef4444', '#b91c1c'] },
  },
};

// 3D-картинка, уменьшенная до двойного размера показа.
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

function frame(t, g, w, h, r, body) {
  const [c1, c2] = t.accent[g.id];
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${t.bg[0]}"/><stop offset="1" stop-color="${t.bg[1]}"/></linearGradient>
    <radialGradient id="glow" cx="0.12" cy="0.2" r="${Math.max(w, h) > 200 ? 0.35 : 0.8}"><stop offset="0" stop-color="${c2}" stop-opacity="${t.glow}"/><stop offset="1" stop-color="${c2}" stop-opacity="0"/></radialGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient>
    <linearGradient id="shine" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity="${t.shine}"/><stop offset="0.5" stop-color="#ffffff" stop-opacity="0"/></linearGradient>
  </defs>
  <rect width="${w}" height="${h}" rx="${r}" fill="url(#bg)"/>
  <rect width="${w}" height="${h}" rx="${r}" fill="url(#glow)"/>
  <rect width="${w}" height="${h / 2}" rx="${r}" fill="url(#shine)"/>
  <rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="${r - 0.5}" fill="none" stroke="${t.border[0]}" stroke-opacity="${t.border[1]}"/>
  ${body}</svg>`;
}

const img = (g, x, y, size) => `<image x="${x}" y="${y}" width="${size}" height="${size}" xlink:href="${iconData(g.icon, size)}"/>`;
const text = (x, y, size, fill, content, extra = '') => `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" fill="${fill}" ${extra}>${content}</text>`;

function ring(t, cx, cy, r, width, score) {
  const c = 2 * Math.PI * r;
  const arc = score > 0
    ? `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="url(#accent)" stroke-width="${width}" stroke-linecap="round" stroke-dasharray="${(c * score) / 100} ${c}" transform="rotate(-90 ${cx} ${cy})"/>`
    : '';
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${t.track[0]}" stroke-opacity="${t.track[1]}" stroke-width="${width}"/>${arc}`;
}

const DESIGNS = {
  // Кнопка 88×31, как счётчики Рунета.
  button: (t, s, g) => frame(t, g, 88, 31, 6, `
    ${img(g, 4, 4, 23)}
    ${text(30, 12.5, 7.5, t.muted, 'SEO-ОЦЕНКА', 'font-weight="700" letter-spacing="0.6"')}
    ${text(30, 26, 13.5, t.text, `${s}<tspan font-size="8" fill="${t.muted}" dx="1">/100</tspan>`, 'font-weight="700"')}`),

  // Плашка 180×50.
  plate: (t, s, g) => frame(t, g, 180, 50, 10, `
    ${img(g, 7, 6, 38)}
    ${text(51, 19, 10, t.muted, 'SEO-ОЦЕНКА', 'font-weight="700" letter-spacing="0.5"')}
    ${text(51, 41, 22, t.text, `${s}<tspan font-size="11" fill="${t.muted}" dx="1">/100</tspan>`, 'font-weight="700"')}
    ${text(171, 19, 11, 'url(#accent)', g.label, 'font-weight="700" text-anchor="end"')}
    ${text(171, 40, 8.5, t.faint, 'SEO Toolkit', 'text-anchor="end"')}`),

  // Медаль 150×150.
  medal: (t, s, g) => frame(t, g, 150, 150, 22, `
    ${ring(t, 75, 62, 42, 8, s)}
    ${text(75, 70, 30, t.text, s, 'font-weight="700" text-anchor="middle"')}
    ${text(75, 84, 9.5, t.muted, 'из 100', 'text-anchor="middle"')}
    ${img(g, 100, 78, 34)}
    ${text(75, 125, 13, 'url(#accent)', g.label, 'font-weight="700" text-anchor="middle"')}
    ${text(75, 140, 8.5, t.faint, 'SEO-ОЦЕНКА · SEO TOOLKIT', 'text-anchor="middle" letter-spacing="0.4"')}`),

  // Баннер 460×64 (не 468×60 — этот рекламный размер прячут блокировщики): оценка слева,
  // словесная оценка пилюлей по центру, шкала и подпись справа.
  wide: (t, s, g) => frame(t, g, 460, 64, 12, `
    ${img(g, 10, 8, 48)}
    ${text(68, 26, 10.5, t.muted, 'SEO-ОЦЕНКА САЙТА', 'font-weight="700" letter-spacing="0.4"')}
    ${text(68, 51, 24, t.text, `${s}<tspan font-size="12" fill="${t.muted}" dx="3">из 100</tspan>`, 'font-weight="700"')}
    <rect x="198" y="19" width="94" height="26" rx="13" fill="url(#accent)" fill-opacity="${t.pill}"/>
    <rect x="198.5" y="19.5" width="93" height="25" rx="12.5" fill="none" stroke="url(#accent)" stroke-opacity="0.55"/>
    ${text(245, 37, 13, 'url(#accent)', g.label, 'font-weight="700" text-anchor="middle"')}
    <rect x="308" y="21" width="138" height="8" rx="4" fill="${t.track[0]}" fill-opacity="${t.track[1]}"/>
    ${s > 0 ? `<rect x="308" y="21" width="${Math.max(8, (138 * s) / 100)}" height="8" rx="4" fill="url(#accent)"/>` : ''}
    ${text(446, 48, 10.5, t.muted, `Проверено в <tspan font-weight="700" fill="${t.text}">SEO Toolkit</tspan> ›`, 'text-anchor="end"')}`),
};

const args = process.argv.slice(2);
const previewAt = args.indexOf('--preview');
const preview = previewAt >= 0 ? path.resolve(args[previewAt + 1] || 'badge-preview') : null;
const scores = args.filter((a, i) => i !== previewAt + 1 || previewAt < 0).map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 100);
const list = scores.length ? scores : Array.from({ length: 101 }, (_, i) => i);
let bytes = 0;
let files = 0;
for (const theme of BADGE_THEMES) {
  for (const size of BADGE_SIZES) {
    for (const s of list) {
      // Пробелы между тегами не нужны — значок грузится на чужих сайтах, каждый байт на счету.
      const code = DESIGNS[size.id](THEMES[theme.id], s, badgeGrade(s)).replace(/>\s+</g, '><').trim();
      const file = path.resolve('public', badgePath(theme.id, size.id, s).slice(1));
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, code);
      bytes += code.length;
      files++;
      if (preview) {
        fs.mkdirSync(preview, { recursive: true });
        const pngData = new Resvg(code, { fitTo: { mode: 'width', value: size.w * 2 }, font: { loadSystemFonts: true, defaultFontFamily: 'Segoe UI' } }).render().asPng();
        fs.writeFileSync(path.join(preview, `${theme.id}-${size.id}-${s}.png`), pngData);
      }
    }
  }
}
console.log(`Готово: ${files} значков, ${Math.round(bytes / 1024)} КБ`);
