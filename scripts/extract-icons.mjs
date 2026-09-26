// Извлекает 25 иконок из EPS-набора «SEO Marketing Flat Line» в отдельные SVG (public/icons).
// Запуск: node scripts/extract-icons.mjs <путь к .eps>
import fs from 'node:fs';
import path from 'node:path';
import { cmykKey, parseEps } from './eps-parse.mjs';

// CMYK → RGB, откалибровано по растровому превью набора.
const PALETTE = {
  '0.75,0.68,0.67,0.902': '#161616',
  '0,0,0,0': '#ffffff',
  '0.032,0.856,0.817,0.002': '#e94c3d',
  '0.386,0,0.002,0': '#8ddefc',
  '0.694,0.148,0,0': '#00adef',
  '0.004,0.008,0.211,0': '#fff8d1',
  '0.046,0.315,0.695,0': '#efb466',
  '0.018,0.198,0.844,0': '#f9cb42',
  '0.416,0,0.805,0': '#a0d062',
  '0.607,0.04,0.025,0': '#4abfe8',
  '0.318,0.458,0.628,0.065': '#aa8666',
  '0.214,0,0.584,0': '#c9e39b',
  '0.201,0.487,0,0': '#d78ee0',
};

const NAMES = [
  'seo', 'shopping-cart', 'seo-gear', 'shield', 'search-document',
  'map-pointer', 'cloud-setting', 'networking', 'dart', 'target',
  'share-folder', 'website', 'engine', 'speaker', 'programming',
  'message', 'laptop', 'presentation', 'gear-setting', 'search-time',
  'sound', 'cart', 'shopping', 'setting', 'internet-protected',
];
const COLS = [135.2, 260.4, 386, 511.6, 637.2];
const ROWS = [174, 304, 434, 564, 694];
const LABEL_OFFSET = 59; // подпись находится на 59 единиц ниже центра иконки

const src = process.argv[2];
const outDir = path.resolve('public/icons');
fs.mkdirSync(outDir, { recursive: true });

const ops = parseEps(src);
const cells = NAMES.map(() => []);
for (const o of ops) {
  const [x0, y0, x1, y1] = o.bbox;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  if (y1 < 110 || x1 - x0 > 300) continue; // заголовок, линия и фон монтажной области
  const col = COLS.reduce((b, c, i) => (Math.abs(c - cx) < Math.abs(COLS[b] - cx) ? i : b), 0);
  const row = ROWS.reduce((b, c, i) => (Math.abs(c - cy) < Math.abs(ROWS[b] - cy) ? i : b), 0);
  // Подписи под иконками: мелкие фигуры на линии подписи любого ряда.
  if (y1 - y0 < 12 && ROWS.some((r) => Math.abs(cy - (r + LABEL_OFFSET)) < 5)) continue;
  cells[row * 5 + col].push(o);
}

const f = (n) => +n.toFixed(1);
cells.forEach((list, i) => {
  const box = list.reduce((b, o) => [Math.min(b[0], o.bbox[0]), Math.min(b[1], o.bbox[1]), Math.max(b[2], o.bbox[2]), Math.max(b[3], o.bbox[3])], [Infinity, Infinity, -Infinity, -Infinity]);
  const pad = 1.5;
  const size = Math.max(box[2] - box[0], box[3] - box[1]) + pad * 2;
  const vx = (box[0] + box[2]) / 2 - size / 2;
  const vy = (box[1] + box[3]) / 2 - size / 2;
  // Соседние фигуры одного цвета и типа объединяются в один <path>.
  const parts = [];
  for (const o of list) {
    const color = PALETTE[cmykKey(o.color)] || '#000';
    const last = parts.at(-1);
    const sig = o.type === 'stroke' ? `s|${color}|${o.lw}|${o.lc}|${o.lj}` : `${o.type}|${color}`;
    if (last && last.sig === sig) last.d += o.d;
    else parts.push({ sig, d: o.d, o, color });
  }
  const body = parts
    .map(({ o, color, d }) => {
      if (o.type === 'stroke') {
        const cap = ['butt', 'round', 'square'][o.lc] || 'butt';
        const join = ['miter', 'round', 'bevel'][o.lj] || 'miter';
        return `<path fill="none" stroke="${color}" stroke-width="${o.lw}" stroke-linecap="${cap}" stroke-linejoin="${join}" d="${d}"/>`;
      }
      return `<path fill="${color}"${o.type === 'evenodd' ? ' fill-rule="evenodd"' : ''} d="${d}"/>`;
    })
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${f(vx)} ${f(vy)} ${f(size)} ${f(size)}">${body}</svg>\n`;
  fs.writeFileSync(path.join(outDir, `${NAMES[i]}.svg`), svg);
  console.log(NAMES[i].padEnd(20), String(list.length).padStart(3), 'фигур', `${(svg.length / 1024).toFixed(1)} КБ`);
});
