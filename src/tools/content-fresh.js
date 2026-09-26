import '../core/app.js';
import '../styles/tools/content-fresh.css';
import { compareValues, initDropzone, initSortHeaders } from '../components/controls.js';
import { copyText } from '../core/clipboard.js';
import { downloadCsv, parseCsv } from '../core/csv.js';
import { daysBetween, formatDate, isoDate, parseDate, todayUtc } from '../core/dates.js';
import { $, $$, debounce, fmt, h, plural, fill } from '../core/dom.js';
import { storage } from '../core/storage.js';
import { toast } from '../core/toast.js';
import { art, icon } from '../layout/icons.js';

const DEFAULT_T = [30, 90, 180];
const PAGE = 100;
const BUCKETS = [
  { status: 'Актуально', badge: 'badge--ok' },
  { status: 'Нормально', badge: 'badge--info' },
  { status: 'Проверить', badge: 'badge--warn' },
  { status: 'Обновить', badge: 'badge--bad' },
];

const inputEl = $('#cf-input');
const refEl = $('#cf-ref');
const formatEl = $('#cf-date-format');
const tInputs = $$('[data-threshold]');
const colSelects = { url: $('#cf-col-url'), published: $('#cf-col-pub'), updated: $('#cf-col-upd') };

let thresholds = storage.get('fresh:thresholds', DEFAULT_T);
if (!Array.isArray(thresholds) || thresholds.length !== 3) thresholds = [...DEFAULT_T];
let table = [];
let header = null;
let mapping = { url: 0, published: 1, updated: 2 };
let rows = [];
let filter = 'all';
let page = 0;
const sort = { key: 'days', dir: 'desc' };

const bucketLabel = (i) => {
  const [a, b, c] = thresholds;
  return [`до ${a} дн.`, `${a}–${b} дн.`, `${b}–${c} дн.`, `более ${c} дн.`][i];
};
const bucketOf = (days) => (days <= thresholds[0] ? 0 : days <= thresholds[1] ? 1 : days <= thresholds[2] ? 2 : 3);

// ---------- Разбор таблицы ----------
const HEAD = {
  url: /^(url|uri|адрес|ссылка|страница|page|address|loc|link)/i,
  published: /(publish|опублик|публикац|created|создан|pubdate|date ?pub)/i,
  updated: /(updat|modif|обновл|изменен|lastmod|last ?mod)/i,
};

function detectColumns() {
  header = null;
  const first = table[0] || [];
  const isHeader = first.some((c) => HEAD.url.test(c) || HEAD.published.test(c) || HEAD.updated.test(c)) && !first.some((c) => parseDate(c));
  if (isHeader) {
    header = first;
    const find = (re) => first.findIndex((c) => re.test(c));
    mapping = { url: Math.max(0, find(HEAD.url)), published: find(HEAD.published), updated: find(HEAD.updated) };
    if (mapping.published < 0 && mapping.updated < 0) mapping = { url: 0, published: 1, updated: 2 };
  } else {
    mapping = { url: 0, published: first.length > 1 ? 1 : -1, updated: first.length > 2 ? 2 : -1 };
  }
}

function fillMapping() {
  const width = Math.max(0, ...table.slice(0, 50).map((r) => r.length));
  const names = Array.from({ length: width }, (_, i) => (header?.[i] ? `${i + 1}: ${header[i]}` : `Столбец ${i + 1}`));
  for (const [key, select] of Object.entries(colSelects)) {
    select.replaceChildren(
      ...(key === 'url' ? [] : [h('option', { value: '-1', text: '— нет —' })]),
      ...names.map((n, i) => h('option', { value: String(i), text: n })),
    );
    select.value = String(mapping[key]);
  }
  $('[data-map]').hidden = !table.length;
}

function loadText(text) {
  table = parseCsv(text);
  detectColumns();
  fillMapping();
  page = 0;
  compute();
}

// ---------- Расчёт ----------
function compute() {
  const ref = refEl.value ? parseDate(refEl.value)?.time ?? todayUtc() : todayUtc();
  const fmtSel = formatEl.value;
  const body = header ? table.slice(1) : table;
  rows = body
    .map((r, i) => {
      const url = (r[mapping.url] || '').trim();
      const pubRaw = mapping.published >= 0 ? (r[mapping.published] || '').trim() : '';
      const updRaw = mapping.updated >= 0 ? (r[mapping.updated] || '').trim() : '';
      const published = parseDate(pubRaw, fmtSel);
      const updated = parseDate(updRaw, fmtSel);
      const last = updated || published;
      const notes = [];
      if (pubRaw && !published) notes.push(`не распознана дата публикации «${pubRaw}»`);
      if (updRaw && !updated) notes.push(`не распознана дата обновления «${updRaw}»`);
      if (published && updated && updated.time < published.time) notes.push('обновление раньше публикации');
      const days = last ? daysBetween(last.time, ref) : null;
      if (days != null && days < 0) notes.push('дата в будущем');
      return {
        n: i + 1,
        url,
        published,
        updated,
        days,
        bucket: days == null ? -1 : bucketOf(Math.max(0, days)),
        notes,
      };
    })
    .filter((r) => r.url || r.published || r.updated);
  renderAll();
}

// ---------- Отображение ----------
const sortValue = (r, key) =>
  key === 'days' ? r.days ?? -Infinity : key === 'published' ? r.published?.time ?? -Infinity : key === 'updated' ? r.updated?.time ?? -Infinity : r.url;

function sortedRows(list) {
  const dir = sort.dir === 'asc' ? 1 : -1;
  return [...list].sort((a, b) => compareValues(sortValue(a, sort.key), sortValue(b, sort.key)) * dir || a.n - b.n);
}

function visibleRows() {
  if (filter === 'all') return rows;
  if (filter === 'error') return rows.filter((r) => r.bucket === -1);
  return rows.filter((r) => r.bucket === +filter);
}

function renderStats() {
  const valid = rows.filter((r) => r.days != null);
  const days = valid.map((r) => Math.max(0, r.days)).sort((a, b) => a - b);
  const avg = days.length ? Math.round(days.reduce((s, d) => s + d, 0) / days.length) : 0;
  const median = days.length ? days[Math.floor((days.length - 1) / 2)] : 0;
  const count = (b) => rows.filter((r) => r.bucket === b).length;
  const stat = (value, label, cls = '') => h('div', { class: `stat ${cls}` }, h('div', { class: 'stat-value', text: value }), h('div', { class: 'stat-label', text: label }));
  $('[data-stats]').replaceChildren(
    stat(fmt(rows.length), 'Страниц всего', 'stat--accent'),
    stat(days.length ? `${fmt(avg)} дн.` : '—', 'Средняя давность'),
    stat(days.length ? `${fmt(median)} дн.` : '—', 'Медиана'),
    ...BUCKETS.map((b, i) => stat(fmt(count(i)), `${b.status}: ${bucketLabel(i)}`)),
    stat(fmt(count(-1)), 'Без распознанной даты'),
  );
}

function renderFilters() {
  const count = (b) => rows.filter((r) => r.bucket === b).length;
  const items = [
    { id: 'all', name: 'Все', n: rows.length },
    ...BUCKETS.map((_, i) => ({ id: String(i), name: bucketLabel(i), n: count(i) })),
    { id: 'error', name: 'Ошибки дат', n: count(-1) },
  ];
  $('[data-filters]').replaceChildren(
    ...items.map((it) =>
      h(
        'button',
        { type: 'button', class: `chip${filter === it.id ? ' is-active' : ''}`, 'aria-pressed': String(filter === it.id), dataset: { filter: it.id } },
        it.name,
        h('span', { class: 'chip-count', text: fmt(it.n) }),
      ),
    ),
  );
}

function sortButton(key, label, dflt = 'desc') {
  return h('button', { type: 'button', class: 'th-sort', dataset: { key, default: dflt }, text: label });
}

function renderTable() {
  const box = $('[data-table]');
  const pager = $('[data-pager]');
  const list = sortedRows(visibleRows());
  if (!list.length) {
    box.replaceChildren(h('div', { class: 'empty', trustedHtml: art('search-time', 56) }, h('p', { text: rows.length ? 'Нет страниц в выбранном периоде.' : 'Загрузите CSV или вставьте таблицу, чтобы увидеть отчёт.' })));
    pager.replaceChildren();
    return;
  }
  const pages = Math.ceil(list.length / PAGE);
  page = Math.min(page, pages - 1);
  const slice = list.slice(page * PAGE, page * PAGE + PAGE);
  const thead = h(
    'thead',
    {},
    h(
      'tr',
      {},
      h('th', {}, sortButton('url', 'URL', 'asc')),
      h('th', {}, sortButton('published', 'Опубликовано')),
      h('th', {}, sortButton('updated', 'Обновлено')),
      h('th', { class: 'num' }, sortButton('days', 'Дней с обновления')),
      h('th', { text: 'Статус' }),
    ),
  );
  box.replaceChildren(
    h(
      'div',
      { class: 'table-wrap' },
      h(
        'table',
        { class: 'table' },
        thead,
        h(
          'tbody',
          {},
          slice.map((r) =>
            h(
              'tr',
              { class: r.bucket === 3 ? 'row-bad' : r.bucket === 2 ? 'row-warn' : '' },
              h('td', { class: 'cf-url', text: r.url || '—' }),
              h('td', { class: 'nowrap', text: formatDate(r.published) || '—' }),
              h('td', { class: 'nowrap', text: formatDate(r.updated) || '—' }),
              h('td', { class: 'num', text: r.days == null ? '—' : fmt(r.days) }),
              h(
                'td',
                {},
                r.bucket >= 0 ? h('span', { class: `badge ${BUCKETS[r.bucket].badge}`, text: BUCKETS[r.bucket].status }) : h('span', { class: 'badge badge--bad', text: 'Нет даты' }),
                r.notes.length ? h('div', { class: 'hint', style: 'margin-top:4px', text: r.notes.join('; ') }) : null,
              ),
            ),
          ),
        ),
      ),
    ),
  );
  initSortHeaders(thead, sort, () => {
    page = 0;
    renderTable();
  });
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

function todoRows() {
  return rows.filter((r) => r.bucket >= 2).sort((a, b) => b.days - a.days);
}

function renderTodo() {
  const box = $('[data-todo]');
  $('[data-todo-sub]').textContent = `Страницы, которые не обновлялись более ${thresholds[1]} дней`;
  const todo = todoRows();
  if (!todo.length) {
    box.replaceChildren(h('p', { class: 'hint', text: rows.length ? 'Давно не обновлявшихся страниц нет.' : 'Список появится после загрузки данных.' }));
    return;
  }
  const group = (bucket, title, badge) => {
    const list = todo.filter((r) => r.bucket === bucket);
    if (!list.length) return null;
    return h(
      'div',
      { class: 'cf-todo-group' },
      h('h3', {}, h('span', { class: `badge ${badge}`, text: fmt(list.length) }), title),
      h('ol', { class: 'cf-todo-list' }, list.map((r) => h('li', {}, h('span', { class: 'cf-url', text: r.url || '(без URL)' }), h('span', { class: 'muted nowrap', text: `${fmt(r.days)} дн.` })))),
    );
  };
  fill(box,
    group(3, `Обновить в первую очередь — ${bucketLabel(3)}`, 'badge--bad'),
    group(2, `Проверить актуальность — ${bucketLabel(2)}`, 'badge--warn'),
  );
}

function renderAll() {
  renderStats();
  renderFilters();
  renderTable();
  renderTodo();
}

// ---------- Пороги ----------
function fillThresholds() {
  tInputs.forEach((el, i) => (el.value = thresholds[i]));
}

tInputs.forEach((el) =>
  el.addEventListener(
    'input',
    debounce(() => {
      const next = tInputs.map((x) => Number(x.value));
      const ok = next.every((n) => Number.isInteger(n) && n > 0) && next[0] < next[1] && next[1] < next[2];
      $('[data-threshold-error]').textContent = ok ? '' : 'Пороги должны быть целыми положительными числами по возрастанию.';
      tInputs.forEach((x) => x.classList.toggle('is-invalid', !ok));
      if (!ok) return;
      thresholds = next;
      storage.set('fresh:thresholds', thresholds);
      compute();
    }, 250),
  ),
);

$('[data-action="reset-thresholds"]').addEventListener('click', () => {
  thresholds = [...DEFAULT_T];
  storage.set('fresh:thresholds', thresholds);
  fillThresholds();
  tInputs.forEach((x) => x.classList.remove('is-invalid'));
  $('[data-threshold-error]').textContent = '';
  compute();
});

// ---------- Экспорт ----------
function reportRows(list) {
  return [
    ['URL', 'Дата публикации', 'Дата обновления', 'Дней с обновления', 'Период', 'Статус', 'Замечания'],
    ...list.map((r) => [r.url, isoDate(r.published), isoDate(r.updated), r.days ?? '', r.bucket >= 0 ? bucketLabel(r.bucket) : '', r.bucket >= 0 ? BUCKETS[r.bucket].status : 'Нет даты', r.notes.join('; ')]),
  ];
}

$('[data-action="csv"]').addEventListener('click', () => downloadCsv(reportRows(sortedRows(rows)), 'content-freshness.csv'));
$('[data-action="csv-todo"]').addEventListener('click', () => downloadCsv(reportRows(todoRows()), 'content-to-update.csv'));
$('[data-action="copy-todo"]').addEventListener('click', () => {
  const todo = todoRows();
  copyText(todo.map((r) => r.url).filter(Boolean).join('\n'), `Скопировано адресов: ${fmt(todo.length)}`);
});

// ---------- События ----------
inputEl.addEventListener('input', debounce(() => loadText(inputEl.value), 300));
refEl.addEventListener('change', compute);
formatEl.addEventListener('change', compute);
for (const [key, select] of Object.entries(colSelects)) {
  select.addEventListener('change', () => {
    mapping[key] = +select.value;
    compute();
  });
}

$('[data-filters]').addEventListener('click', (e) => {
  const chip = e.target.closest('[data-filter]');
  if (!chip) return;
  filter = chip.dataset.filter;
  page = 0;
  renderFilters();
  renderTable();
});

$('[data-pager]').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-page]');
  if (!btn || btn.disabled) return;
  page = +btn.dataset.page;
  renderTable();
  $('#cf-table-title').scrollIntoView({ block: 'start' });
});

initDropzone($('[data-dropzone]'), (text, file) => {
  inputEl.value = text.replace(/^﻿/, '');
  loadText(inputEl.value);
  toast(`Файл ${file.name} загружен: ${fmt(rows.length)} ${plural(rows.length, 'строка', 'строки', 'строк')}`);
});

$('[data-action="clear"]').addEventListener('click', () => {
  inputEl.value = '';
  table = [];
  header = null;
  filter = 'all';
  loadText('');
  toast('Данные очищены', 'info');
});

$('[data-action="example"]').addEventListener('click', () => {
  const ago = (d) => {
    const t = new Date(todayUtc() - d * 86400000);
    return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
  };
  inputEl.value = [
    'url;published;updated',
    `https://example.com/blog/how-to-choose-running-shoes;${ago(900)};${ago(12)}`,
    `https://example.com/blog/marathon-training-plan;${ago(700)};${ago(75)}`,
    `https://example.com/blog/trail-running-guide;${ago(640)};${ago(150)}`,
    `https://example.com/blog/best-shoes-2024;${ago(800)};`,
    `https://example.com/catalog/running;${ago(1200)};${ago(3)}`,
    `https://example.com/blog/knee-pain-after-running;${ago(420)};${ago(260)}`,
    `https://example.com/blog/shoe-care;15.03.2023;`,
    `https://example.com/blog/draft;;`,
  ].join('\n');
  loadText(inputEl.value);
});

fillThresholds();
loadText(inputEl.value);
