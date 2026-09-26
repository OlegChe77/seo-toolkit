import '../core/app.js';
import '../styles/tools/heading-map.css';
import { initSegmented } from '../components/controls.js';
import { copyText } from '../core/clipboard.js';
import { downloadCsv, downloadFile } from '../core/csv.js';
import { $, debounce, fmt, h, plural } from '../core/dom.js';
import { storage } from '../core/storage.js';
import { toast } from '../core/toast.js';
import { icon } from '../layout/icons.js';

const inputEl = $('#hm-input');
const detectedEl = $('[data-detected]');
let mode = storage.get('headingmap:mode', 'auto');
let headings = [];

const clean = (s) => s.replace(/\s+/g, ' ').trim();
const looksLikeHtml = (src) => /<h[1-6][\s>/]/i.test(src);

// HTML разбирается через DOMParser: скрипты не выполняются, ресурсы не загружаются,
// в интерфейс попадает только текст заголовков.
function parseHtml(src) {
  const doc = new DOMParser().parseFromString(src, 'text/html');
  return Array.from(doc.querySelectorAll('h1, h2, h3, h4, h5, h6'), (el) => ({
    level: Number(el.tagName[1]),
    text: clean(el.textContent || ''),
  }));
}

function parseText(src) {
  const out = [];
  for (const line of src.split(/\r?\n/)) {
    let m = line.match(/^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (m) {
      out.push({ level: m[1].length, text: clean(m[2]) });
      continue;
    }
    m = line.match(/^\s*[HhНн]([1-6])\s*[:.)\-–—]\s*(.*)$/);
    if (m) out.push({ level: Number(m[1]), text: clean(m[2]) });
  }
  return out;
}

function analyze(list) {
  const flags = list.map(() => []);
  const issues = [];
  const h1 = list.filter((x) => x.level === 1);

  if (!list.length) return { flags, issues };
  if (!h1.length) issues.push({ type: 'bad', text: 'Нет заголовка H1. Добавьте один основной заголовок страницы.' });
  if (h1.length > 1) {
    issues.push({ type: 'bad', text: `Найдено ${h1.length} ${plural(h1.length, 'заголовок', 'заголовка', 'заголовков')} H1. Обычно на странице один основной H1.` });
    let seen = 0;
    list.forEach((x, i) => x.level === 1 && seen++ > 0 && flags[i].push(['bad', 'повторный H1']));
  }
  if (list[0].level !== 1) issues.push({ type: 'warn', text: `Первый заголовок — H${list[0].level}, а не H1.` });

  let skips = 0;
  list.forEach((x, i) => {
    if (i > 0 && x.level > list[i - 1].level + 1) {
      skips++;
      const missing = Array.from({ length: x.level - list[i - 1].level - 1 }, (_, k) => `H${list[i - 1].level + k + 1}`).join(', ');
      flags[i].push(['warn', `пропущен ${missing}`]);
    }
    if (!x.text) flags[i].push(['warn', 'пустой']);
  });
  if (skips) issues.push({ type: 'warn', text: `Пропуски уровней вложенности: ${skips}. Заголовки лучше вкладывать последовательно (H2 → H3 → H4).` });

  const empty = list.filter((x) => !x.text).length;
  if (empty) issues.push({ type: 'warn', text: `Пустых заголовков: ${empty}.` });

  const groups = new Map();
  list.forEach((x, i) => {
    if (!x.text) return;
    const key = x.text.toLowerCase().replace(/ё/g, 'е');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(i);
  });
  const dups = [...groups.values()].filter((g) => g.length > 1);
  for (const g of dups) {
    for (const i of g) flags[i].push(['info', `дубль ×${g.length}`]);
    issues.push({ type: 'warn', text: `Одинаковые заголовки (×${g.length}): «${list[g[0]].text}».` });
  }
  if (!issues.length) issues.push({ type: 'ok', text: 'Структура заголовков без явных ошибок.' });
  return { flags, issues };
}

function render() {
  const src = inputEl.value;
  const effective = mode === 'auto' ? (looksLikeHtml(src) ? 'html' : 'text') : mode;
  detectedEl.textContent = src.trim() && mode === 'auto' ? `Определён формат: ${effective === 'html' ? 'HTML' : 'текст'}` : '';
  headings = src.trim() ? (effective === 'html' ? parseHtml(src) : parseText(src)) : [];
  const { flags, issues } = analyze(headings);
  headings.forEach((x, i) => (x.flags = flags[i]));

  const counts = [1, 2, 3, 4, 5, 6].map((l) => headings.filter((x) => x.level === l).length);
  $('[data-counts]').replaceChildren(
    h('div', { class: 'stat stat--accent' }, h('div', { class: 'stat-value', text: fmt(headings.length) }), h('div', { class: 'stat-label', text: 'Всего' })),
    ...counts.map((c, i) => h('div', { class: 'stat' }, h('div', { class: 'stat-value', text: fmt(c) }), h('div', { class: 'stat-label', text: `H${i + 1}` }))),
  );

  const issuesEl = $('[data-issues]');
  if (!src.trim()) issuesEl.replaceChildren(h('li', { class: 'issue issue--info', trustedHtml: icon('info') }, h('span', { text: 'Вставьте HTML-код или текст, чтобы проверить заголовки.' })));
  else if (!headings.length) issuesEl.replaceChildren(h('li', { class: 'issue issue--warn', trustedHtml: icon('alert') }, h('span', { text: 'Заголовки не найдены. Проверьте формат ввода.' })));
  else issuesEl.replaceChildren(...issues.map((it) => h('li', { class: `issue issue--${it.type}`, trustedHtml: icon(it.type === 'ok' ? 'check' : 'alert') }, h('span', { text: it.text }))));

  const tree = $('[data-tree]');
  if (!headings.length) {
    tree.replaceChildren(h('div', { class: 'empty', trustedHtml: icon('tool-heading') }, h('p', { text: 'Здесь появится дерево заголовков H1–H6.' })));
  } else {
    tree.replaceChildren(
      h(
        'ol',
        { class: 'hm-tree' },
        headings.map((x, i) =>
          h(
            'li',
            { class: 'hm-node', style: `--lvl:${x.level}`, dataset: { level: x.level } },
            h('span', { class: 'hm-num', text: i + 1 }),
            h('span', { class: `hm-badge hm-h${x.level}`, text: `H${x.level}` }),
            h('span', { class: `hm-text${x.text ? '' : ' is-empty'}`, text: x.text || '(пустой заголовок)' }),
            x.flags.length ? h('span', { class: 'hm-flags' }, x.flags.map(([t, label]) => h('span', { class: `badge badge--${t}`, text: label }))) : null,
          ),
        ),
      ),
    );
  }
  storage.set('headingmap:mode', mode);
}

const toTxt = () => headings.map((x) => `${'  '.repeat(x.level - 1)}H${x.level} ${x.text || '(пустой)'}`).join('\n');

inputEl.addEventListener('input', debounce(render, 200));
initSegmented($('[data-mode]'), (v) => {
  mode = v;
  render();
}, mode);

$('[data-action="clear"]').addEventListener('click', () => {
  inputEl.value = '';
  render();
  inputEl.focus();
});

$('[data-action="example"]').addEventListener('click', () => {
  inputEl.value = `<header><h1>Беговые кроссовки</h1></header>
<main>
  <h2>Как выбрать кроссовки</h2>
  <h3>По типу покрытия</h3>
  <h3>По весу бегуна</h3>
  <h2>Популярные модели</h2>
  <h4>Для асфальта</h4>
  <h4>Для трейла</h4>
  <h2>Как выбрать кроссовки</h2>
  <h2></h2>
</main>
<footer><h1>Подпишитесь на рассылку</h1></footer>`;
  render();
});

$('[data-action="copy"]').addEventListener('click', () => copyText(toTxt(), 'Структура заголовков скопирована'));

$('[data-action="txt"]').addEventListener('click', () => {
  if (!headings.length) return toast('Нет заголовков для экспорта', 'error');
  downloadFile(`﻿${toTxt()}\n`, 'headings.txt', 'text/plain;charset=utf-8');
  toast('Файл headings.txt сохранён');
});

$('[data-action="csv"]').addEventListener('click', () => {
  downloadCsv(
    [['№', 'Уровень', 'Заголовок', 'Замечания'], ...headings.map((x, i) => [i + 1, `H${x.level}`, x.text, x.flags.map((f) => f[1]).join(', ')])],
    'headings.csv',
  );
});

render();
