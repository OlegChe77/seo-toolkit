// Пересобирает раздел routes в render.yaml: по правилу rewrite на каждую страницу и каждый гайд.
// Запускайте после добавления инструмента или гайда: npm run routes
//
// Отдельные правила вместо шаблона /guides/:slug нужны потому, что шаблон переписывает на
// несуществующий файл любой адрес, и Render отвечает на опечатку пустой страницей с кодом 200.
import fs from 'node:fs';
import path from 'node:path';
import { allPages, notFound } from '../src/config/pages.js';
import { loadGuides } from '../plugins/guides.js';

const root = path.resolve('.');
const file = path.join(root, 'render.yaml');
const yaml = fs.readFileSync(file, 'utf8');
const start = yaml.indexOf('    routes:');
if (start < 0) throw new Error('В render.yaml не найден раздел routes');

const pages = [
  ...allPages.filter((p) => p.path && p.path !== '/' && p.id !== notFound.id).map((p) => [p.path, `${p.path}.html`]),
  ...loadGuides(root).map((g) => [g.path, `${g.path}.html`]),
];
const rule = (source, destination) => `      - type: rewrite\n        source: ${source}\n        destination: ${destination}\n`;
const routes = [
  '    routes:\n',
  '    # Генерируется scripts/render-routes.mjs (npm run routes) — не правьте вручную.\n',
  '    # Render сопоставляет пути без учёта завершающего слэша, поэтому /page/ и /page\n',
  '    # обрабатываются одинаково: оба варианта отдают /page.html. Не используйте здесь redirect.\n',
  ...pages.flatMap(([p, dest]) => [rule(`${p}/`, dest), rule(p, dest)]),
].join('');

fs.writeFileSync(file, yaml.slice(0, start) + routes);
console.log(`render.yaml: правил rewrite — ${pages.length * 2}`);
