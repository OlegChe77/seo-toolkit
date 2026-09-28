import '../core/app.js';
import '../styles/tools/keyword-finder.css';
import { initSortHeaders } from '../components/controls.js';
import { copyText } from '../core/clipboard.js';
import { downloadCsv, toTsv } from '../core/csv.js';
import { $, $$, debounce, fill, fmt, h, lines, plural } from '../core/dom.js';
import { storage } from '../core/storage.js';
import { toast } from '../core/toast.js';
import { buildAdvice } from './keywords/advice.js';
import { MODEL, REGIONS, SOURCES, calibrate, findKeywords } from './keywords/engine.js';

const PAGE = 100;
const CLASSES = ['ВЧ', 'СЧ', 'НЧ', 'микро'];
const COLORS = { green: 'Быстрые', yellow: 'Средние', red: 'Дорогие' };
const POT = { green: 'Быстрый', yellow: 'Средний', red: 'Дорогой' };
const RANK = { green: 2, yellow: 1, red: 0 };

const seedsEl = $('#kf-seeds');
const langEl = $('#kf-lang');
const regionEl = $('#kf-region');
const questionsEl = $('#kf-questions');
const deepEl = $('#kf-deep');
const searchEl = $('#kf-search');
const sourceEls = $$('[data-source]');
const drawer = $('[data-drawer]');
const drawerBg = $('[data-drawer-bg]');

let data = null;
let running = false;
let page = 0;
let color = null;
let cls = null;
const sort = { key: 'potential', dir: 'desc' };
let lastFocus = null;

const calibKey = () => `kf:calib:${langEl.value}:${regionEl.value}`;

// ---------- Форма ----------
regionEl.replaceChildren(...Object.entries(REGIONS).map(([id, r]) => h('option', { value: id, text: r.label })));

function restoreForm() {
  const f = storage.get('kf:form', null);
  if (!f) return;
  seedsEl.value = f.seeds || '';
  langEl.value = f.lang || 'ru';
  regionEl.value = REGIONS[f.region] ? f.region : 'ru';
  questionsEl.checked = !!f.questions;
  deepEl.checked = !!f.deep;
  for (const el of sourceEls) el.checked = (f.sources || []).includes(el.dataset.source);
}

function saveForm() {
  storage.set('kf:form', {
    seeds: seedsEl.value,
    lang: langEl.value,
    region: regionEl.value,
    questions: questionsEl.checked,
    deep: deepEl.checked,
    sources: sourceEls.filter((el) => el.checked).map((el) => el.dataset.source),
  });
}

function setProgress(done, total, stage) {
  const bar = $('[data-progress-bar]');
  const text = $('[data-progress]');
  if (!total) {
    bar.hidden = true;
    text.textContent = '';
    return;
  }
  bar.hidden = false;
  $('[data-progress-fill]').style.width = `${Math.round((done / total) * 100)}%`;
  text.textContent = `${stage === 2 ? 'Второй уровень: ' : ''}получено подсказок ${fmt(done)} из ${fmt(total)}…`;
}

async function run() {
  if (running) return;
  const seeds = lines(seedsEl.value).slice(0, 5);
  if (!seeds.length) {
    seedsEl.focus();
    return toast('Введите слово или фразу — например, «купить диван»', 'error');
  }
  saveForm();
  closeAdvice();
  running = true;
  const btn = $('[data-action="run"]');
  btn.disabled = true;
  try {
    data = await findKeywords({
      seeds,
      lang: langEl.value,
      region: regionEl.value,
      sources: ['google', ...sourceEls.filter((el) => el.checked).map((el) => el.dataset.source)],
      questions: questionsEl.checked,
      deep: deepEl.checked,
      model: { ...MODEL, ...(storage.get(calibKey(), null) || {}) },
      onProgress: setProgress,
    });
    if (!data.rows.length) {
      toast(data.stats.failures ? 'Поисковики не ответили. Проверьте интернет или блокировщик рекламы и повторите.' : 'Подсказок не нашлось — попробуйте другую фразу', 'error');
    } else {
      toast(`Найдено ${fmt(data.rows.length)} ${plural(data.rows.length, 'фраза', 'фразы', 'фраз')}`);
    }
    page = 0;
    color = cls = null;
    searchEl.value = '';
    renderAll();
  } finally {
    setProgress(0, 0);
    btn.disabled = false;
    running = false;
  }
}

function reset() {
  closeAdvice();
  data = null;
  seedsEl.value = searchEl.value = '';
  questionsEl.checked = deepEl.checked = false;
  color = cls = null;
  saveForm();
  renderAll();
  seedsEl.focus();
}

// ---------- Таблица ----------
function visibleRows() {
  const terms = searchEl.value.toLowerCase().split(/\s+/).filter(Boolean);
  const list = data.rows.filter((r) => (!color || r.color === color) && (!cls || r.cls === cls) && terms.every((t) => r.phrase.includes(t)));
  const cmp = {
    phrase: (a, b) => a.phrase.localeCompare(b.phrase, 'ru'),
    // Сначала зелёные, потом жёлтые, потом красные; внутри — по потенциалу.
    potential: (a, b) => RANK[a.color] - RANK[b.color] || a.potential - b.potential,
  }[sort.key] || ((a, b) => a[sort.key] - b[sort.key]);
  const dir = sort.dir === 'asc' ? 1 : -1;
  return list.sort((a, b) => cmp(a, b) * dir);
}

const chip = (active, dataset, ...children) =>
  h('button', { type: 'button', class: `chip${active ? ' is-active' : ''}`, 'aria-pressed': String(active), dataset }, ...children);

function renderFilters() {
  const count = (fn) => data.rows.filter(fn).length;
  fill($('[data-colors]'), ...Object.entries(COLORS).map(([c, label]) =>
    chip(color === c, { color: c }, h('span', { class: `kf-dot kf-dot--${c}` }), label, h('span', { class: 'chip-count', text: fmt(count((r) => r.color === c)) })),
  ));
  fill($('[data-classes]'),
    chip(!cls, { cls: '' }, 'Все', h('span', { class: 'chip-count', text: fmt(data.rows.length) })),
    ...CLASSES.map((c) => chip(cls === c, { cls: c }, c, h('span', { class: 'chip-count', text: fmt(count((r) => r.cls === c)) }))),
  );
}

const sortButton = (key, label, dflt = 'desc') => h('button', { type: 'button', class: 'th-sort', dataset: { key, default: dflt }, text: label });

function renderTable() {
  const box = $('[data-table]');
  const pager = $('[data-pager]');
  const list = visibleRows();
  if (!list.length) {
    fill(box, h('div', { class: 'empty' }, h('p', { text: 'Нет фраз, подходящих под фильтр.' })));
    pager.replaceChildren();
    return;
  }
  const pages = Math.ceil(list.length / PAGE);
  page = Math.min(page, pages - 1);
  const slice = list.slice(page * PAGE, page * PAGE + PAGE);
  const thead = h(
    'thead',
    {},
    h('tr', {},
      h('th', {}, sortButton('phrase', 'Фраза', 'asc')),
      h('th', {}, sortButton('potential', 'Потенциал')),
      h('th', { class: 'num' }, sortButton('volume', '≈ в месяц')),
      h('th', { class: 'num', title: 'Оценка конкуренции 1–99 по виду запроса и спросу' }, sortButton('difficulty', 'Сложность', 'asc')),
      h('th', { text: 'Класс' }),
      h('th', { text: 'Источники' }),
    ),
  );
  initSortHeaders(thead, sort, () => {
    page = 0;
    renderTable();
  });
  fill(box, h('div', { class: 'table-wrap' }, h('table', { class: 'table kf-table' }, thead, h('tbody', {}, slice.map((r) =>
    h('tr', { class: `kf-row kf-row--${r.color}${r.seed ? ' is-seed' : ''}`, dataset: { phrase: r.phrase } },
      h('td', {}, h('button', { type: 'button', class: `kf-phrase kf-c-${r.color}`, title: 'Советы по фразе', text: r.phrase })),
      h('td', {}, h('button', { type: 'button', class: `kf-pot kf-pot--${r.color}`, title: 'Советы по фразе', text: POT[r.color] })),
      h('td', { class: 'num' }, fmt(r.volume), h('small', { class: 'kf-range', text: `${fmt(r.low)}–${fmt(r.high)}` })),
      h('td', { class: 'num', text: r.difficulty }),
      h('td', {}, h('span', { class: `kf-cls kf-cls--${r.cls === 'микро' ? 'micro' : r.cls}`, text: r.cls })),
      h('td', { class: 'kf-src', text: r.sources.map((s) => SOURCES[s]?.label || s).join(', ') }),
    ),
  )))));
  fill(pager,
    h('span', { text: `Показаны ${fmt(page * PAGE + 1)}–${fmt(page * PAGE + slice.length)} из ${fmt(list.length)}` }),
    pages > 1
      ? h('div', { class: 'row' },
          h('button', { type: 'button', class: 'btn btn-sm', text: '← Назад', disabled: page === 0, dataset: { page: page - 1 } }),
          h('span', { text: `${page + 1} / ${pages}` }),
          h('button', { type: 'button', class: 'btn btn-sm', text: 'Вперёд →', disabled: page >= pages - 1, dataset: { page: page + 1 } }),
        )
      : null,
  );
}

function renderWords() {
  fill($('[data-words]'), data.words.map((w) =>
    h('li', {}, h('button', { type: 'button', class: 'kf-word', dataset: { word: w.word } }, w.word, ' ', h('span', { class: 'muted', text: `${w.count} ${plural(w.count, 'фраза', 'фразы', 'фраз')}` }))),
  ));
}

function renderAll() {
  $('[data-results]').hidden = !data;
  if (!data) return;
  renderFilters();
  renderTable();
  renderWords();
  const s = data.stats;
  $('[data-meta]').textContent =
    `Запросов к подсказкам: ${fmt(s.requests)}${s.failures ? `, без ответа: ${fmt(s.failures)}` : ''}, время: ${String(s.seconds).replace('.', ',')} с. ` +
    (s.calibrated ? 'Шкала откалибрована по вашим данным.' : 'Шкала не откалибрована — цифры ориентировочные.');
}

function exportRows() {
  return [
    ['Фраза', 'Потенциал', 'Частотность (оценка)', 'От', 'До', 'Сложность', 'Класс', 'Источники'],
    ...visibleRows().map((r) => [r.phrase, POT[r.color], r.volume, r.low, r.high, r.difficulty, r.cls, r.sources.map((s) => SOURCES[s]?.label || s).join(', ')]),
  ];
}

// ---------- Панель советов ----------
function openAdvice(phrase) {
  const row = data?.rows.find((r) => r.phrase === phrase);
  if (!row) return;
  lastFocus = document.activeElement;
  fill($('[data-drawer-title]'), h('span', { class: `kf-c-${row.color}`, text: row.phrase }));
  $('[data-drawer-body]').innerHTML = buildAdvice(row, data.rows); // все значения экранированы в buildAdvice
  drawer.hidden = drawerBg.hidden = false;
  drawer.scrollTop = 0;
  document.body.style.overflow = 'hidden';
  $('[data-action="close-drawer"]').focus();
}

function closeAdvice() {
  if (drawer.hidden) return;
  drawer.hidden = drawerBg.hidden = true;
  document.body.style.overflow = '';
  lastFocus?.focus?.();
}

// ---------- Калибровка ----------
function parseCalibration(text) {
  const rows = [];
  for (const line of lines(text)) {
    const m = line.match(/^(.+?)[\t;,]\s*([\d\s ]+)$/) || line.match(/^(.*\D)\s+(\d[\d ]*)$/);
    if (!m) continue;
    const volume = Number(m[2].replace(/[\s ]/g, ''));
    const phrase = m[1].replace(/[+!"[\]]/g, '').trim();
    if (phrase && volume > 0) rows.push({ phrase, volume });
  }
  return rows;
}

function showCalibState() {
  const c = storage.get(calibKey(), null);
  const badge = $('[data-calib-state]');
  badge.hidden = !c;
  badge.textContent = c ? `откалибровано по ${c.n} ${plural(c.n, 'фразе', 'фразам', 'фразам')}` : '';
}

async function runCalibration() {
  const rows = parseCalibration($('#kf-calib-rows').value).slice(0, 30);
  const out = $('[data-calib-out]');
  if (rows.length < 3) return toast('Нужно минимум 3 строки вида «фраза; число»', 'error');
  const btn = $('[data-action="calibrate"]');
  btn.disabled = true;
  fill(out, h('p', { class: 'hint', text: `Считаю оценки для ${rows.length} ${plural(rows.length, 'фразы', 'фраз', 'фраз')}…` }));
  try {
    const r = await calibrate(rows, langEl.value, regionEl.value, (d, t) => {
      out.firstChild.textContent = `Получено подсказок ${fmt(d)} из ${fmt(t)}…`;
    });
    if (r.error) {
      fill(out, h('p', { class: 'hint', text: r.error }));
      return;
    }
    storage.set(calibKey(), { a: r.a, b: r.b, spread: r.spread, n: r.n });
    showCalibState();
    const pct = (v) => String(v).replace('.', ',');
    fill(out,
      h('p', {}, 'Готово. Типичная ошибка: ', h('strong', { text: `×${pct(r.medianErrorBefore)}` }), ' до калибровки → ', h('strong', { text: `×${pct(r.medianErrorAfter)}` }),
        ` после. Диапазон в таблице теперь ±×${pct(r.spread)}. Калибровка сохранена в этом браузере для выбранных языка и региона — повторите поиск.`),
      r.missing.length ? h('p', { class: 'hint', text: `Не удалось оценить: ${r.missing.join(', ')}` }) : null,
      h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
        h('thead', {}, h('tr', {}, h('th', { text: 'Фраза' }), h('th', { class: 'num', text: 'Ваши данные' }), h('th', { class: 'num', text: 'Оценка до' }), h('th', { class: 'num', text: 'После' }))),
        h('tbody', {}, r.rows.map((x) => h('tr', {}, h('td', { text: x.phrase }), h('td', { class: 'num', text: fmt(x.actual) }), h('td', { class: 'num', text: fmt(x.before) }), h('td', { class: 'num', text: fmt(x.after) })))),
      )),
    );
  } finally {
    btn.disabled = false;
  }
}

// ---------- События ----------
$('[data-action="run"]').addEventListener('click', run);
$('[data-action="reset"]').addEventListener('click', reset);
seedsEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) run();
});
$('[data-action="example"]').addEventListener('click', () => {
  seedsEl.value = 'купить диван';
  langEl.value = 'ru';
  regionEl.value = 'ru';
  run();
});
langEl.addEventListener('change', () => {
  regionEl.value = langEl.value === 'en' ? 'us' : 'ru';
  showCalibState();
});
regionEl.addEventListener('change', showCalibState);

$('[data-colors]').addEventListener('click', (e) => {
  const b = e.target.closest('[data-color]');
  if (!b) return;
  color = color === b.dataset.color ? null : b.dataset.color;
  page = 0;
  renderFilters();
  renderTable();
});
$('[data-classes]').addEventListener('click', (e) => {
  const b = e.target.closest('[data-cls]');
  if (!b) return;
  cls = b.dataset.cls || null;
  page = 0;
  renderFilters();
  renderTable();
});
searchEl.addEventListener('input', debounce(() => {
  page = 0;
  renderTable();
}, 150));
$('[data-words]').addEventListener('click', (e) => {
  const b = e.target.closest('[data-word]');
  if (!b) return;
  searchEl.value = b.dataset.word;
  page = 0;
  renderTable();
});
$('[data-table]').addEventListener('click', (e) => {
  if (e.target.closest('.th-sort')) return;
  const tr = e.target.closest('tr[data-phrase]');
  if (tr) openAdvice(tr.dataset.phrase);
});
$('[data-pager]').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-page]');
  if (!btn || btn.disabled) return;
  page = +btn.dataset.page;
  renderTable();
  $('#kf-res-title').scrollIntoView({ block: 'start' });
});

$('[data-action="close-drawer"]').addEventListener('click', closeAdvice);
drawerBg.addEventListener('click', closeAdvice);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeAdvice();
});
$('[data-drawer-body]').addEventListener('click', (e) => {
  const b = e.target.closest('[data-copy]');
  if (b) copyText(b.dataset.copy);
});

$('[data-action="csv"]').addEventListener('click', () => downloadCsv(exportRows(), 'keyword-finder.csv'));
$('[data-action="copy"]').addEventListener('click', () => {
  const rows = exportRows();
  copyText(rows.length > 1 ? toTsv(rows) : '', `Скопировано фраз: ${fmt(rows.length - 1)}`);
});
$('[data-action="calibrate"]').addEventListener('click', runCalibration);
$('[data-action="calib-reset"]').addEventListener('click', () => {
  storage.remove(calibKey());
  showCalibState();
  fill($('[data-calib-out]'), h('p', { class: 'hint', text: 'Калибровка сброшена.' }));
});

restoreForm();
showCalibState();
