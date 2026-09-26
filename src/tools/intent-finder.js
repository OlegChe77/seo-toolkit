import '../core/app.js';
import '../styles/tools/intent.css';
import { copyText } from '../core/clipboard.js';
import { downloadCsv, toTsv } from '../core/csv.js';
import { $, debounce, fmt, fmtPct, h, lines, plural, processInChunks, fill } from '../core/dom.js';
import { storage } from '../core/storage.js';
import { toast } from '../core/toast.js';
import { CATEGORIES, DEFAULT_DICTIONARY, DICTIONARY_KEYS, classify, compileDictionary } from './intent/dictionary.js';

const PAGE = 100;
const inputEl = $('#if-input');
const dedupeEl = $('#if-dedupe');
const searchEl = $('#if-search');
const catName = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.name]));
const CONF = { high: ['badge--ok', 'высокая'], medium: ['badge--warn', 'средняя'], none: ['', '—'], manual: ['badge--accent', 'вручную'] };

let dictionary = { ...DEFAULT_DICTIONARY, ...(storage.get('intent:dictionary', null) || {}) };
let compiled = compileDictionary(dictionary);
let rows = [];
let filter = 'all';
let page = 0;
let running = false;

// ---------- Словарь ----------
function renderDictionary() {
  $('[data-dict-fields]').replaceChildren(
    ...DICTIONARY_KEYS.map(({ key, label }) => {
      const ta = h('textarea', { class: 'textarea', id: `dict-${key}`, spellcheck: 'false', dataset: { dict: key } });
      ta.value = dictionary[key] || '';
      return h('div', { class: 'field' }, h('label', { for: `dict-${key}`, text: label }), ta);
    }),
  );
}

$('[data-action="save-dict"]').addEventListener('click', () => {
  for (const ta of document.querySelectorAll('[data-dict]')) dictionary[ta.dataset.dict] = ta.value;
  storage.set('intent:dictionary', dictionary);
  compiled = compileDictionary(dictionary);
  toast('Словарь сохранён');
  if (rows.length) reclassify();
});

$('[data-action="reset-dict"]').addEventListener('click', () => {
  dictionary = { ...DEFAULT_DICTIONARY };
  storage.remove('intent:dictionary');
  compiled = compileDictionary(dictionary);
  renderDictionary();
  toast('Словарь по умолчанию восстановлен', 'info');
  if (rows.length) reclassify();
});

// ---------- Классификация ----------
async function run() {
  if (running) return;
  let queries = lines(inputEl.value);
  if (dedupeEl.checked) {
    const seen = new Set();
    queries = queries.filter((q) => {
      const k = q.toLowerCase().replace(/\s+/g, ' ');
      return seen.has(k) ? false : (seen.add(k), true);
    });
  }
  if (!queries.length) {
    rows = [];
    renderAll();
    return toast('Вставьте список запросов — по одному в строке', 'error');
  }
  running = true;
  const btn = $('[data-action="run"]');
  btn.disabled = true;
  const progress = $('[data-progress]');
  rows = await processInChunks(
    queries,
    (q, i) => ({ id: i + 1, query: q, ...classify(q, compiled), manual: false }),
    3000,
    (done, total) => {
      if (total > 3000) progress.textContent = `Обработано ${fmt(done)} из ${fmt(total)}…`;
    },
  );
  progress.textContent = '';
  btn.disabled = false;
  running = false;
  page = 0;
  renderAll();
  toast(`Готово: ${fmt(rows.length)} ${plural(rows.length, 'запрос', 'запроса', 'запросов')}`);
}

async function reclassify() {
  const updated = await processInChunks(rows, (r) => (r.manual ? r : { ...r, ...classify(r.query, compiled) }), 3000);
  rows = updated;
  renderAll();
}

// ---------- Отображение ----------
function counts() {
  const c = Object.fromEntries(CATEGORIES.map((x) => [x.id, 0]));
  for (const r of rows) c[r.category]++;
  return c;
}

function visibleRows() {
  const q = searchEl.value.trim().toLowerCase();
  return rows.filter((r) => (filter === 'all' || r.category === filter) && (!q || r.query.toLowerCase().includes(q)));
}

function renderSummary() {
  const c = counts();
  const total = rows.length || 1;
  $('[data-bar]').replaceChildren(
    ...CATEGORIES.map((cat) => h('span', { style: `width:${(c[cat.id] / total) * 100}%;background:${cat.color}`, title: `${cat.name}: ${c[cat.id]}` })),
  );
  $('[data-summary]').replaceChildren(
    ...CATEGORIES.map((cat) =>
      h(
        'div',
        { class: 'if-sum-row' },
        h('span', { class: 'if-dot', style: `background:${cat.color}` }),
        h('span', { text: cat.name }),
        h('span', { class: 'num', text: fmt(c[cat.id]) }),
        h('span', { class: 'muted', text: rows.length ? fmtPct((c[cat.id] / rows.length) * 100, 0) : '0%' }),
      ),
    ),
  );
  $('[data-filters]').replaceChildren(
    ...[{ id: 'all', name: 'Все' }, ...CATEGORIES].map((cat) => {
      const active = filter === cat.id;
      return h(
        'button',
        { type: 'button', class: `chip${active ? ' is-active' : ''}`, 'aria-pressed': String(active), dataset: { filter: cat.id } },
        cat.name,
        h('span', { class: 'chip-count', text: fmt(cat.id === 'all' ? rows.length : c[cat.id]) }),
      );
    }),
  );
}

function renderTable() {
  const box = $('[data-table]');
  const pager = $('[data-pager]');
  const list = visibleRows();
  if (!list.length) {
    box.replaceChildren(h('div', { class: 'empty' }, h('p', { text: rows.length ? 'Нет запросов, подходящих под фильтр или поиск.' : 'Вставьте запросы и нажмите «Классифицировать».' })));
    pager.replaceChildren();
    return;
  }
  const pages = Math.ceil(list.length / PAGE);
  page = Math.min(page, pages - 1);
  const slice = list.slice(page * PAGE, page * PAGE + PAGE);
  box.replaceChildren(
    h(
      'div',
      { class: 'table-wrap' },
      h(
        'table',
        { class: 'table' },
        h('thead', {}, h('tr', {}, h('th', { class: 'num', text: '#' }), h('th', { text: 'Запрос' }), h('th', { text: 'Категория' }), h('th', { text: 'Маркеры' }), h('th', { text: 'Уверенность' }))),
        h(
          'tbody',
          {},
          slice.map((r) => {
            const select = h(
              'select',
              { class: 'select select--sm if-cat-select', 'aria-label': `Категория запроса «${r.query}»`, dataset: { row: r.id } },
              CATEGORIES.map((c) => h('option', { value: c.id, text: c.name })),
            );
            select.value = r.category;
            const [cls, label] = CONF[r.manual ? 'manual' : r.confidence];
            return h(
              'tr',
              {},
              h('td', { class: 'num muted', text: r.id }),
              h('td', { class: 'if-query', text: r.query }),
              h('td', {}, select, r.reason && !r.manual ? h('div', { class: 'hint', style: 'margin-top:4px', text: r.reason }) : null),
              h('td', {}, r.markers.length ? h('div', { class: 'if-markers' }, r.markers.slice(0, 6).map((m) => h('code', { text: m }))) : h('span', { class: 'muted', text: '—' })),
              h('td', {}, h('span', { class: `badge ${cls}`, text: label })),
            );
          }),
        ),
      ),
    ),
  );
  fill(pager,
    h('span', { text: `Показаны ${fmt(page * PAGE + 1)}–${fmt(page * PAGE + slice.length)} из ${fmt(list.length)}` }),
    pages > 1
      ? h(
          'div',
          { class: 'row' },
          h('button', { type: 'button', class: 'btn btn-sm', text: '← Назад', disabled: page === 0, dataset: { page: page - 1 } }),
          h('span', { text: `${page + 1} / ${pages}` }),
          h('button', { type: 'button', class: 'btn btn-sm', text: 'Вперёд →', disabled: page >= pages - 1, dataset: { page: page + 1 } }),
        )
      : null,
  );
}

function renderAll() {
  renderSummary();
  renderTable();
}

function exportRows() {
  return [
    ['Запрос', 'Категория', 'Источник', 'Уверенность', 'Маркеры', 'Комментарий'],
    ...visibleRows().map((r) => [r.query, catName[r.category], r.manual ? 'вручную' : 'автоматически', r.manual ? '' : CONF[r.confidence][1], r.markers.join(', '), r.manual ? '' : r.reason]),
  ];
}

// ---------- События ----------
inputEl.addEventListener('input', debounce(() => {
  const n = lines(inputEl.value).length;
  $('[data-lines-info]').textContent = n ? `${fmt(n)} ${plural(n, 'строка', 'строки', 'строк')}` : '';
}, 200));

$('[data-action="run"]').addEventListener('click', run);
inputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) run();
});

$('[data-filters]').addEventListener('click', (e) => {
  const chip = e.target.closest('[data-filter]');
  if (!chip) return;
  filter = chip.dataset.filter;
  page = 0;
  renderAll();
});

searchEl.addEventListener('input', debounce(() => {
  page = 0;
  renderTable();
}, 150));

$('[data-table]').addEventListener('change', (e) => {
  const id = e.target.dataset.row;
  if (!id) return;
  const row = rows[+id - 1];
  row.category = e.target.value;
  row.manual = row.category !== row.auto;
  renderSummary();
  renderTable();
});

$('[data-pager]').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-page]');
  if (!btn || btn.disabled) return;
  page = +btn.dataset.page;
  renderTable();
  $('#if-res-title').scrollIntoView({ block: 'start' });
});

$('[data-action="clear"]').addEventListener('click', () => {
  inputEl.value = '';
  rows = [];
  searchEl.value = '';
  filter = 'all';
  $('[data-lines-info]').textContent = '';
  renderAll();
  inputEl.focus();
});

$('[data-action="example"]').addEventListener('click', () => {
  inputEl.value = [
    'купить беговые кроссовки',
    'кроссовки для бега цена',
    'как выбрать кроссовки для бега',
    'что такое пронация стопы',
    'лучшие кроссовки для марафона 2026',
    'asics или nike что лучше',
    'отзывы о кроссовках hoka',
    'спортмастер личный кабинет',
    'ozon',
    'кроссовки nike',
    'как купить кроссовки со скидкой',
    'почему болят колени после бега?',
    'заказать кроссовки с доставкой',
    'best running shoes for flat feet',
  ].join('\n');
  inputEl.dispatchEvent(new Event('input'));
  run();
});

$('[data-action="csv"]').addEventListener('click', () => downloadCsv(exportRows(), 'intent-finder.csv'));
$('[data-action="copy"]').addEventListener('click', () => {
  const data = exportRows();
  if (data.length < 2) return copyText('');
  copyText(toTsv(data), `Скопировано строк: ${fmt(data.length - 1)}`);
});

renderDictionary();
renderAll();
