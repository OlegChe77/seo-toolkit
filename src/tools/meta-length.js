import '../core/app.js';
import { initShare } from '../core/share.js';
import '../styles/tools/meta-length.css';
import { initDropzone, initSegmented } from '../components/controls.js';
import { renderSnippet } from '../components/snippet.js';
import { copyText } from '../core/clipboard.js';
import { downloadCsv, parseCsv, toTsv } from '../core/csv.js';
import { $, $$, debounce, fmt, h, plural, fill } from '../core/dom.js';
import { FONTS, textWidth } from '../core/measure.js';
import { storage } from '../core/storage.js';
import { toast } from '../core/toast.js';

const DEFAULT_RANGES = { title: { min: 30, max: 60, px: 600 }, description: { min: 70, max: 160, px: 920 } };
const MAX_ROWS = 1000;

let ranges = storage.get('meta:ranges', null);
if (!ranges?.title || !ranges?.description) ranges = structuredClone(DEFAULT_RANGES);
let device = storage.get('meta:device', 'desktop');
let rows = [];

const titleEl = $('#ml-title');
const descEl = $('#ml-desc');
const bulkEl = $('#ml-bulk');
const onlyBadEl = $('#ml-only-bad');

// ---------- Оценка ----------
function evaluate(kind, text) {
  const value = String(text || '').trim();
  const r = ranges[kind];
  const len = [...value].length;
  const px = textWidth(value, FONTS[kind]);
  let status = 'ok';
  let label = 'В пределах диапазона';
  if (!len) {
    status = 'empty';
    label = 'Пусто';
  } else if (len > r.max) {
    status = 'bad';
    label = `Длиннее ${r.max} симв.`;
  } else if (len < r.min) {
    status = 'warn';
    label = `Короче ${r.min} симв.`;
  } else if (px > r.px) {
    status = 'warn';
    label = `Шире ≈${r.px} px`;
  }
  return { value, len, px, status, label };
}

const badgeClass = (s) => ({ ok: 'badge--ok', warn: 'badge--warn', bad: 'badge--bad', empty: '' })[s];

// ---------- Одиночная проверка ----------
function renderScale(kind, res) {
  const r = ranges[kind];
  const scaleMax = Math.max(r.max * 1.3, res.len, 1);
  const pct = (n) => `${Math.min(100, (n / scaleMax) * 100)}%`;
  const el = $(`[data-scale="${kind}"]`);
  el.replaceChildren(
    h('span', { class: 'ml-zone ml-zone--warn', style: `width:${pct(r.min)}` }),
    h('span', { class: 'ml-zone ml-zone--ok', style: `width:calc(${pct(r.max)} - ${pct(r.min)})` }),
    h('span', { class: 'ml-zone ml-zone--bad', style: 'flex:1' }),
    h('span', { class: `ml-fill is-${res.status === 'empty' ? 'ok' : res.status}`, style: `width:${pct(res.len)}` }),
  );
}

function updateSingle() {
  for (const [kind, input] of [['title', titleEl], ['description', descEl]]) {
    const res = evaluate(kind, input.value);
    renderScale(kind, res);
    const counter = $(`[data-counter="${kind}"]`);
    counter.textContent = `${fmt(res.len)} симв. · ≈${fmt(res.px)} px`;
    counter.className = `counter ${res.status === 'ok' ? 'is-ok' : res.status === 'warn' ? 'is-warn' : res.status === 'bad' ? 'is-bad' : ''}`;
    const r = ranges[kind];
    $(`[data-status="${kind}"]`).replaceChildren(
      res.status === 'empty'
        ? `Ориентир: ${r.min}–${r.max} симв., до ≈${r.px} px`
        : h('span', { class: `badge ${badgeClass(res.status)}`, text: res.label }),
    );
  }
  renderSnippet($('[data-snippet]'), { title: titleEl.value, description: descEl.value, url: '', device, limits: device === 'desktop' ? { title: ranges.title.px, description: ranges.description.px } : null });
  $('[data-frame]').className = `snippet-frame${device === 'mobile' ? ' snippet-frame--mobile' : ''}`;
}

// ---------- Диапазоны ----------
function fillRanges() {
  for (const input of $$('[data-range]')) {
    const [kind, key] = input.dataset.range.split('.');
    input.value = ranges[kind][key];
  }
}

$$('[data-range]').forEach((input) =>
  input.addEventListener('input', () => {
    const [kind, key] = input.dataset.range.split('.');
    const n = Number(input.value);
    input.classList.toggle('is-invalid', !Number.isFinite(n) || n < 0 || input.value === '');
    if (!Number.isFinite(n) || n < 0 || input.value === '') return;
    ranges[kind][key] = n;
    const bad = ranges[kind].min > ranges[kind].max;
    $(`[data-range="${kind}.min"]`).classList.toggle('is-invalid', bad);
    storage.set('meta:ranges', ranges);
    updateSingle();
    updateBulkDebounced();
  }),
);

$('[data-action="reset-ranges"]').addEventListener('click', () => {
  ranges = structuredClone(DEFAULT_RANGES);
  storage.set('meta:ranges', ranges);
  fillRanges();
  $$('[data-range]').forEach((i) => i.classList.remove('is-invalid'));
  updateSingle();
  updateBulk();
  toast('Диапазоны сброшены', 'info');
});

// ---------- Массовая проверка ----------
const HEADER = {
  url: /^(url|адрес|ссылка|страница|page|address|loc)$/i,
  title: /^(title|заголовок|тайтл|meta ?title)$/i,
  description: /^(description|описание|meta ?description|дескрипшн)$/i,
};

function parseBulk(text) {
  if (!text.trim()) return [];
  const delimiter = text.includes('\t') ? '\t' : text.includes('|') ? '|' : undefined;
  const table = parseCsv(text, delimiter);
  if (!table.length) return [];
  let cols = null;
  const head = table[0].map((c) => c.trim());
  if (head.some((c) => HEADER.title.test(c) || HEADER.description.test(c))) {
    cols = {
      url: head.findIndex((c) => HEADER.url.test(c)),
      title: head.findIndex((c) => HEADER.title.test(c)),
      description: head.findIndex((c) => HEADER.description.test(c)),
    };
    table.shift();
  }
  return table.map((row) => {
    if (cols) return { url: row[cols.url] ?? '', title: row[cols.title] ?? '', description: row[cols.description] ?? '' };
    if (row.length >= 3) return { url: row[0], title: row[1], description: row.slice(2).join(' ') };
    return { url: '', title: row[0] ?? '', description: row[1] ?? '' };
  });
}

function updateBulk() {
  rows = parseBulk(bulkEl.value).map((r, i) => ({ ...r, n: i + 1, t: evaluate('title', r.title), d: evaluate('description', r.description) }));
  const problems = rows.filter((r) => r.t.status !== 'ok' || r.d.status !== 'ok').length;
  $('[data-bulk-info]').textContent = rows.length
    ? `${fmt(rows.length)} ${plural(rows.length, 'страница', 'страницы', 'страниц')} · с замечаниями: ${fmt(problems)}`
    : '';

  const box = $('[data-bulk-table]');
  const list = onlyBadEl.checked ? rows.filter((r) => r.t.status !== 'ok' || r.d.status !== 'ok') : rows;
  if (!list.length) {
    box.replaceChildren(h('div', { class: 'empty' }, h('p', { text: rows.length ? 'Все метатеги в пределах диапазонов.' : 'Вставьте список или загрузите CSV, чтобы проверить метатеги массово.' })));
    return;
  }
  const hasUrl = rows.some((r) => r.url);
  const cell = (res) =>
    h(
      'td',
      { class: 'ml-cell-text' },
      res.value || h('span', { class: 'muted', text: '—' }),
      h('span', { class: 'ml-metric' }, `${fmt(res.len)} симв. · ≈${fmt(res.px)} px `, h('span', { class: `badge ${badgeClass(res.status)}`, text: res.label })),
    );
  fill(box,
    h(
      'div',
      { class: 'table-wrap table-wrap--scroll' },
      h(
        'table',
        { class: 'table' },
        h('thead', {}, h('tr', {}, h('th', { class: 'num', text: '#' }), hasUrl ? h('th', { text: 'URL' }) : null, h('th', { text: 'Title' }), h('th', { text: 'Description' }))),
        h(
          'tbody',
          {},
          list.slice(0, MAX_ROWS).map((r) =>
            h('tr', {}, h('td', { class: 'num muted', text: r.n }), hasUrl ? h('td', { class: 'ml-url', text: r.url }) : null, cell(r.t), cell(r.d)),
          ),
        ),
      ),
    ),
    list.length > MAX_ROWS ? h('p', { class: 'hint', style: 'margin-top:8px', text: `Показаны первые ${fmt(MAX_ROWS)} строк. Экспорт и копирование содержат все.` }) : null,
  );
}

const updateBulkDebounced = debounce(updateBulk, 250);

function exportRows() {
  return [
    ['URL', 'Title', 'Title, символов', 'Title, px (≈)', 'Статус Title', 'Description', 'Description, символов', 'Description, px (≈)', 'Статус Description'],
    ...rows.map((r) => [r.url, r.t.value, r.t.len, r.t.px, r.t.label, r.d.value, r.d.len, r.d.px, r.d.label]),
  ];
}

// ---------- События ----------
titleEl.addEventListener('input', updateSingle);
descEl.addEventListener('input', updateSingle);
bulkEl.addEventListener('input', updateBulkDebounced);
onlyBadEl.addEventListener('change', updateBulk);

const deviceSeg = initSegmented($('[data-device]'), (v) => {
  device = v;
  storage.set('meta:device', v);
  updateSingle();
}, device);

initDropzone($('[data-dropzone]'), (text, file) => {
  bulkEl.value = text.replace(/^﻿/, '');
  updateBulk();
  toast(`Файл ${file.name} загружен: ${fmt(rows.length)} ${plural(rows.length, 'строка', 'строки', 'строк')}`);
});

$('[data-action="clear-single"]').addEventListener('click', () => {
  titleEl.value = '';
  descEl.value = '';
  updateSingle();
  titleEl.focus();
});

$('[data-action="clear-bulk"]').addEventListener('click', () => {
  bulkEl.value = '';
  updateBulk();
});

$('[data-action="example"]').addEventListener('click', () => {
  bulkEl.value = [
    'url\ttitle\tdescription',
    '/catalog/running\tКроссовки для бега — каталог, цены и доставка\tБолее 300 моделей беговых кроссовок для асфальта, трейла и зала. Подбор по размеру, примерка при получении.',
    '/blog/how-to-choose\tКак выбрать кроссовки\tКороткое описание.',
    '/catalog/trail\tКроссовки для трейлраннинга с защитой от камней и влаги — лучшие модели сезона 2026 года с доставкой\tТрейловые модели с агрессивным протектором.',
    '/contacts\tКонтакты\t',
  ].join('\n');
  updateBulk();
});

$('[data-action="csv"]').addEventListener('click', () => downloadCsv(exportRows(), 'meta-length.csv'));
$('[data-action="copy"]').addEventListener('click', () => {
  if (!rows.length) return copyText('');
  copyText(toTsv(exportRows()), 'Таблица скопирована — её можно вставить в Excel или Google Таблицы');
});

fillRanges();
updateSingle();
updateBulk();

const validRange = (r) => r && ['min', 'max', 'px'].every((k) => Number.isFinite(Number(r[k])) && Number(r[k]) >= 0);

initShare({
  tool: 'meta-length',
  getState: () => (titleEl.value || descEl.value || bulkEl.value.trim() ? { t: titleEl.value, d: descEl.value, b: bulkEl.value, r: ranges, m: device } : null),
  setState: (d) => {
    titleEl.value = String(d.t || '');
    descEl.value = String(d.d || '');
    bulkEl.value = String(d.b || '');
    if (validRange(d.r?.title) && validRange(d.r?.description)) {
      const num = (r) => ({ min: Number(r.min), max: Number(r.max), px: Number(r.px) });
      ranges = { title: num(d.r.title), description: num(d.r.description) };
      fillRanges();
    }
    if (d.m === 'mobile' || d.m === 'desktop') {
      device = d.m;
      deviceSeg.set(d.m, false);
    }
    updateSingle();
    updateBulk();
  },
});
