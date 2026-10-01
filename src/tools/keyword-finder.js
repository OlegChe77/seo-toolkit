import '../core/app.js';
import '../styles/tools/keyword-finder.css';
import { initSortHeaders } from '../components/controls.js';
import { copyText } from '../core/clipboard.js';
import { downloadCsv, toTsv } from '../core/csv.js';
import { $, $$, debounce, fill, fmt, h, lines, plural } from '../core/dom.js';
import { reachGoal } from '../core/goals.js';
import { sendTo } from '../core/handoff.js';
import { initShare } from '../core/share.js';
import { storage } from '../core/storage.js';
import { toast } from '../core/toast.js';
import { buildAdvice } from './keywords/advice.js';
import { FROM_KEYWORD_FINDER } from './cluster/cluster.js';
import { REGIONS, SOURCES, SUGGEST_API, blockedText, calibrate, contentStems, findKeywords } from './keywords/engine.js';
import { analyze } from './keywords/intent.js';

const PAGE = 100;
const CLASSES = ['ВЧ', 'СЧ', 'НЧ', 'микро'];
const COLORS = { green: 'Быстрые', yellow: 'Средние', red: 'Дорогие' };
const POT = { green: 'Быстрый', yellow: 'Средний', red: 'Дорогой' };
const RANK = { green: 2, yellow: 1, red: 0 };

// «Золотая» фраза — все показатели сразу в лучшей зоне: быстрый потенциал (сложность до 40 при спросе
// от 300 в месяц, значит класс не ниже НЧ и запрос не про чужую площадку) и не больше трёх слов.
// Это оценка Keyword Finder, а не обещание позиций.
const GOLD_MAX_WORDS = 3;
const isGold = (r) => r.color === 'green' && r.words <= GOLD_MAX_WORDS;
const rank = (r) => (r.gold ? 3 : RANK[r.color]);

const seedsEl = $('#kf-seeds');
const langEl = $('#kf-lang');
const regionEl = $('#kf-region');
const questionsEl = $('#kf-questions');
const deepEl = $('#kf-deep');
const exactEl = $('#kf-exact');
const searchEl = $('#kf-search');
const sourceEls = $$('[data-source]');
const drawer = $('[data-drawer]');
const drawerBg = $('[data-drawer-bg]');

let data = null;
let running = false;
let page = 0;
let color = null;
let cls = null;
const selected = new Set(); // фразы, отмеченные галочками
const sort = { key: 'potential', dir: 'desc' };
let lastFocus = null;

const yandexEl = $('[data-source="yandex"]');
const selectedSources = () => sourceEls.filter((el) => el.checked && !el.disabled).map((el) => el.dataset.source);
// Калибровка хранится отдельно для шкалы «только Google» (g) и «Google + Яндекс» (gy).
const calibKey = (scale = yandexEl.checked && !yandexEl.disabled ? 'gy' : 'g') => `kf:calib:${langEl.value}:${regionEl.value}:${scale}`;

if (!SUGGEST_API) {
  yandexEl.checked = false;
  yandexEl.disabled = true;
  yandexEl.closest('label').title = 'Сервер подсказок Яндекса не настроен';
}

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
  exactEl.checked = f.exact !== false; // по умолчанию — точное слово
  for (const el of sourceEls) if (!el.disabled) el.checked = (f.sources || []).includes(el.dataset.source);
  // Настройки до появления Яндекса (без v: 2): включаем его по умолчанию для русского.
  if (f.v !== 2 && !yandexEl.disabled) yandexEl.checked = langEl.value === 'ru';
}

function saveForm() {
  storage.set('kf:form', {
    v: 2,
    seeds: seedsEl.value,
    lang: langEl.value,
    region: regionEl.value,
    questions: questionsEl.checked,
    deep: deepEl.checked,
    exact: exactEl.checked,
    sources: selectedSources(),
  });
}

function yandexErrorText(status) {
  if (status === 429) return 'Яндекс: слишком много поисков с вашего адреса — частотность посчитана только по Google. Повторите через 10 минут.';
  if (status === 503) return 'Сервер подсказок Яндекса сейчас перегружен — частотность посчитана только по Google. Повторите позже.';
  return 'Яндекс не ответил — частотность посчитана только по Google';
}

function setProgress(done, total, stage, waitingYandex) {
  const bar = $('[data-progress-bar]');
  const text = $('[data-progress]');
  if (!total) {
    bar.hidden = true;
    text.textContent = '';
    return;
  }
  bar.hidden = false;
  $('[data-progress-fill]').style.width = `${Math.round((done / total) * 100)}%`;
  text.textContent = waitingYandex
    ? 'Жду подсказки Яндекса — если сервер спал, он просыпается до минуты…'
    : `${stage === 2 ? 'Второй уровень: ' : ''}получено подсказок ${fmt(done)} из ${fmt(total)}…`;
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
  reachGoal('kf_search');
  running = true;
  const btn = $('[data-action="run"]');
  btn.disabled = true;
  try {
    setData(await findKeywords({
      seeds,
      lang: langEl.value,
      region: regionEl.value,
      sources: ['google', ...selectedSources()],
      questions: questionsEl.checked,
      deep: deepEl.checked,
      exact: exactEl.checked,
      calibrations: { g: storage.get(calibKey('g'), null), gy: storage.get(calibKey('gy'), null) },
      onProgress: setProgress,
    }));
    const s = data.stats;
    // Цель в Метрике: посетитель упёрся в ограничение поисковика или нашего сервера Яндекса.
    if (s.blocked.size || [429, 503].includes(s.yandexStatus)) reachGoal('kf_limit');
    if (!data.rows.length) {
      const why = s.failures ? 'Поисковики не ответили. Проверьте интернет или блокировщик рекламы и повторите.' : 'Подсказок не нашлось — попробуйте другую фразу';
      toast(s.blocked.size ? blockedText(s.blocked) : why, 'error', s.blocked.size ? 10000 : undefined);
    } else if (s.blocked.size) {
      toast(`Результаты неполные. ${blockedText(s.blocked)}`, 'info', 10000);
    } else if (s.yandex === 'error') {
      toast(yandexErrorText(s.yandexStatus), 'info', 6000);
    } else {
      toast(`Найдено ${fmt(data.rows.length)} ${plural(data.rows.length, 'фраза', 'фразы', 'фраз')}`);
    }
    searchEl.value = '';
    renderAll();
  } finally {
    setProgress(0, 0);
    btn.disabled = false;
    running = false;
  }
}

/** Новые результаты: отмечаем золотые фразы, сбрасываем фильтры и выбор. */
function setData(d) {
  data = d;
  for (const r of data.rows) r.gold = isGold(r);
  selected.clear();
  page = 0;
  color = cls = null;
}

function reset() {
  closeAdvice();
  data = null;
  selected.clear();
  seedsEl.value = searchEl.value = '';
  questionsEl.checked = deepEl.checked = false;
  exactEl.checked = true;
  color = cls = null;
  saveForm();
  renderAll();
  seedsEl.focus();
}

// ---------- Таблица ----------
function sortRows(list) {
  const cmp = {
    phrase: (a, b) => a.phrase.localeCompare(b.phrase, 'ru'),
    // Сначала золотые (короткие — выше), потом зелёные, жёлтые, красные; внутри — по потенциалу.
    potential: (a, b) => rank(a) - rank(b) || (a.gold && b.gold ? b.words - a.words : 0) || a.potential - b.potential,
  }[sort.key] || ((a, b) => a[sort.key] - b[sort.key]);
  const dir = sort.dir === 'asc' ? 1 : -1;
  return list.sort((a, b) => cmp(a, b) * dir);
}

function visibleRows() {
  const terms = searchEl.value.toLowerCase().split(/\s+/).filter(Boolean);
  const byColor = (r) => !color || (color === 'gold' ? r.gold : r.color === color);
  return sortRows(data.rows.filter((r) => byColor(r) && (!cls || r.cls === cls) && terms.every((t) => r.phrase.includes(t))));
}

/** Фразы для копирования, CSV, ссылки и передачи: отмеченные галочками, а если таких нет — все по фильтру. */
const actionRows = () => (selected.size ? sortRows(data.rows.filter((r) => selected.has(r.phrase))) : visibleRows());

const chip = (active, dataset, ...children) =>
  h('button', { type: 'button', class: `chip${active ? ' is-active' : ''}`, 'aria-pressed': String(active), dataset }, ...children);

function renderFilters() {
  const count = (fn) => data.rows.filter(fn).length;
  const gold = chip(color === 'gold', { color: 'gold' }, h('span', { class: 'kf-star', 'aria-hidden': 'true', text: '★' }), 'Золотые',
    h('span', { class: 'chip-count', text: fmt(count((r) => r.gold)) }));
  gold.classList.add('chip--gold');
  fill($('[data-colors]'), gold, ...Object.entries(COLORS).map(([c, label]) =>
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
  const check = (label, attrs) => h('label', { class: 'kf-sel-hit' }, h('input', { type: 'checkbox', class: 'kf-check', 'aria-label': label, ...attrs }));
  const thead = h(
    'thead',
    {},
    h('tr', {},
      h('th', { class: 'kf-sel' }, check('Выбрать все фразы по фильтру', { dataset: { selectAll: '' }, title: 'Выбрать все фразы по фильтру' })),
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
    h('tr', { class: `kf-row kf-row--${r.gold ? 'gold' : r.color}${r.seed ? ' is-seed' : ''}${selected.has(r.phrase) ? ' is-selected' : ''}`, dataset: { phrase: r.phrase } },
      h('td', { class: 'kf-sel' }, check(`Выбрать «${r.phrase}»`, { checked: selected.has(r.phrase) })),
      h('td', {}, r.gold
        ? h('span', { class: 'kf-gold-name' },
            h('span', { class: 'kf-crown', 'aria-hidden': 'true', text: '★' }),
            h('button', { type: 'button', class: 'kf-phrase kf-c-gold', title: 'Советы по фразе', text: r.phrase }))
        : h('button', { type: 'button', class: `kf-phrase kf-c-${r.color}`, title: 'Советы по фразе', text: r.phrase })),
      h('td', {}, r.gold
        ? h('button', { type: 'button', class: 'kf-pot kf-pot--gold', title: 'Золотая фраза: все показатели в лучшей зоне. Нажмите — появятся советы', text: '★ Золотая' })
        : h('button', { type: 'button', class: `kf-pot kf-pot--${r.color}`, title: 'Советы по фразе', text: POT[r.color] })),
      h('td', { class: 'num' }, fmt(r.volume), h('small', { class: 'kf-range', text: `${fmt(r.low)}–${fmt(r.high)}` })),
      h('td', { class: 'num', text: r.difficulty }),
      h('td', {}, h('span', { class: `kf-cls kf-cls--${r.cls === 'микро' ? 'micro' : r.cls}`, text: r.cls })),
      h('td', { class: 'kf-src', text: r.sources.map((s) => SOURCES[s]?.label || s).join(', ') }),
    ),
  )))));
  syncSelectAll();
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

// ---------- Выбор фраз ----------
/** Галочка в шапке: отмечена, если выбраны все фразы по фильтру, и «частично» — если некоторые. */
function syncSelectAll() {
  const all = $('[data-select-all]');
  if (!all) return;
  const list = visibleRows();
  const n = list.filter((r) => selected.has(r.phrase)).length;
  all.checked = n > 0 && n === list.length;
  all.indeterminate = n > 0 && n < list.length;
}

function renderSelection() {
  const n = selected.size;
  fill($('[data-selbar]'),
    n
      ? [
          h('strong', { text: `Выбрано: ${fmt(n)} ${plural(n, 'фраза', 'фразы', 'фраз')}` }),
          h('span', { class: 'hint', text: 'Копирование, CSV, ссылка и передача возьмут только их.' }),
          h('button', { type: 'button', class: 'btn btn-sm btn-ghost', dataset: { action: 'clear-selection' }, text: 'Снять выбор' }),
        ]
      : h('span', { class: 'hint', text: 'Отметьте галочками нужные фразы — скопируете, скачаете или передадите только их.' }),
  );
  for (const el of $$('[data-sel-count]')) el.textContent = n ? ` (${fmt(n)})` : '';
  $('[data-pass-hint]').textContent = n ? `Передаются выбранные фразы: ${fmt(n)}` : 'Передаются фразы с учётом выбранных фильтров';
}

function toggleRows(rows, on) {
  for (const r of rows) on ? selected.add(r.phrase) : selected.delete(r.phrase);
  // Галочки и подсветку на текущей странице меняем на месте, чтобы не терять фокус.
  const phrases = new Set(rows.map((r) => r.phrase));
  for (const tr of $$('tr[data-phrase]', $('[data-table]'))) {
    if (!phrases.has(tr.dataset.phrase)) continue;
    tr.classList.toggle('is-selected', on);
    tr.querySelector('.kf-check').checked = on;
  }
  syncSelectAll();
  renderSelection();
}

// ---------- Золотые фразы ----------
function renderGold() {
  const golds = data.rows.filter((r) => r.gold).sort((a, b) => a.words - b.words || b.potential - a.potential);
  const box = $('[data-gold]');
  box.classList.toggle('is-empty', !golds.length);
  if (!golds.length) {
    fill(box, h('p', { class: 'hint', text: 'Золотых фраз не нашлось: среди фраз до трёх слов нет быстрых. Попробуйте более короткую или общую фразу.' }));
    return;
  }
  const shown = golds.slice(0, 12);
  fill(box,
    h('div', { class: 'kf-gold-head' },
      h('span', { class: 'kf-gold-medal', 'aria-hidden': 'true', text: '★' }),
      h('div', {},
        h('h3', { text: `Золотые фразы: ${fmt(golds.length)}` }),
        h('p', { text: 'Все показатели сразу в лучшей зоне: быстрый потенциал, спрос от 300 в месяц, сложность до 40, не больше трёх слов. Начните с них — это оценка Keyword Finder, а не гарантия позиций.' }),
      ),
    ),
    h('ul', { class: 'kf-gold-list' }, shown.map((r) =>
      h('li', {}, h('button', { type: 'button', class: 'kf-gold-pill', dataset: { goldPhrase: r.phrase }, title: 'Советы по фразе' },
        r.phrase, h('span', { text: `≈ ${fmt(r.volume)} · ${r.difficulty}/99` }))),
    ), golds.length > shown.length ? h('li', { class: 'hint', text: `и ещё ${fmt(golds.length - shown.length)}` }) : null),
    h('div', { class: 'row' },
      h('button', { type: 'button', class: 'btn btn-sm kf-gold-btn', dataset: { action: 'select-gold' }, text: 'Выбрать все золотые' }),
      h('button', { type: 'button', class: 'btn btn-sm btn-ghost', dataset: { action: 'only-gold' }, text: color === 'gold' ? 'Показать все фразы' : 'Показать только золотые' }),
    ),
  );
}

function renderAll() {
  $('[data-results]').hidden = !data;
  if (!data) return;
  renderGold();
  renderFilters();
  renderTable();
  renderSelection();
  renderWords();
  const s = data.stats;
  const yandex = { ok: `, к Яндексу: ${fmt(s.yandexRequests)}`, error: ' (Яндекс не ответил — оценка только по Google)' }[s.yandex] || '';
  const cached = s.cached ? `, из памяти браузера: ${fmt(s.cached)}` : '';
  const paused = s.blocked?.size ? ` ${[...s.blocked].map((x) => SOURCES[x]?.label || x).join(', ')} временно ограничил запросы.` : '';
  $('[data-meta]').textContent =
    `Запросов к подсказкам: ${fmt(s.requests)}${yandex}${cached}${s.failures ? `, без ответа: ${fmt(s.failures)}` : ''}, время: ${String(s.seconds).replace('.', ',')} с.${paused} ` +
    (s.calibrated ? 'Шкала откалибрована по вашим данным.' : 'Шкала не откалибрована — цифры ориентировочные.');
}

function exportRows() {
  return [
    ['Фраза', 'Золотая', 'Потенциал', 'Частотность (оценка)', 'От', 'До', 'Сложность', 'Класс', 'Источники'],
    ...actionRows().map((r) => [r.phrase, r.gold ? 'да' : '', POT[r.color], r.volume, r.low, r.high, r.difficulty, r.cls, r.sources.map((s) => SOURCES[s]?.label || s).join(', ')]),
  ];
}

// ---------- Панель советов ----------
function openAdvice(phrase) {
  const row = data?.rows.find((r) => r.phrase === phrase);
  if (!row) return;
  lastFocus = document.activeElement;
  fill($('[data-drawer-title]'), h('span', { class: `kf-c-${row.gold ? 'gold' : row.color}`, text: row.phrase }));
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
    const r = await calibrate(rows, langEl.value, regionEl.value, ['google', ...selectedSources()], (d, t, waitingYandex) => {
      out.firstChild.textContent = waitingYandex ? 'Жду подсказки Яндекса…' : `Получено подсказок ${fmt(d)} из ${fmt(t)}…`;
    });
    if (r.error) {
      fill(out, h('p', { class: 'hint', text: r.error }));
      return;
    }
    storage.set(calibKey(r.scale), { a: r.a, b: r.b, spread: r.spread, n: r.n });
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
  if (!yandexEl.disabled) yandexEl.checked = langEl.value === 'ru'; // по-английски у Яндекса мало подсказок
  showCalibState();
});
regionEl.addEventListener('change', showCalibState);
yandexEl.addEventListener('change', showCalibState);

$('[data-colors]').addEventListener('click', (e) => {
  const b = e.target.closest('[data-color]');
  if (!b) return;
  color = color === b.dataset.color ? null : b.dataset.color;
  page = 0;
  renderGold();
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
  if (e.target.closest('.th-sort, .kf-sel')) return;
  const tr = e.target.closest('tr[data-phrase]');
  if (tr) openAdvice(tr.dataset.phrase);
});
$('[data-table]').addEventListener('change', (e) => {
  const box = e.target.closest('.kf-check');
  if (!box) return;
  if ('selectAll' in box.dataset) toggleRows(visibleRows(), box.checked);
  else toggleRows(data.rows.filter((r) => r.phrase === box.closest('tr').dataset.phrase), box.checked);
});
$('[data-selbar]').addEventListener('click', (e) => {
  if (e.target.closest('[data-action="clear-selection"]')) toggleRows(data.rows, false);
});
$('[data-gold]').addEventListener('click', (e) => {
  const pill = e.target.closest('[data-gold-phrase]');
  if (pill) return openAdvice(pill.dataset.goldPhrase);
  const action = e.target.closest('[data-action]')?.dataset.action;
  if (action === 'select-gold') {
    const golds = data.rows.filter((r) => r.gold);
    toggleRows(golds, true);
    toast(`Выбрано золотых фраз: ${fmt(golds.length)}`);
  } else if (action === 'only-gold') {
    color = color === 'gold' ? null : 'gold';
    page = 0;
    renderGold();
    renderFilters();
    renderTable();
  }
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

// ---------- Передача в следующий инструмент ----------
function passRows() {
  const rows = data ? actionRows() : [];
  if (!rows.length) toast('Нет фраз для передачи — сбросьте фильтры или выполните поиск', 'error');
  return rows;
}

$('[data-action="to-intent"]').addEventListener('click', () => {
  const rows = passRows();
  if (rows.length) sendTo('intent-finder', { from: 'keyword-finder', items: rows.map((r) => ({ query: r.phrase, volume: r.volume })) }, 'handoff_intent');
});
$('[data-action="to-cluster"]').addEventListener('click', () => {
  const rows = passRows();
  if (rows.length) {
    sendTo('key-cluster', { from: 'keyword-finder', items: rows.map((r) => ({ query: r.phrase, volume: r.volume, intent: FROM_KEYWORD_FINDER[r.intent] || '' })) }, 'handoff_cluster');
  }
});

// ---------- Ссылка на результат ----------
// В ссылку попадают выбранные фразы (или все по фильтру) в компактном виде;
// признаки интента пересчитываются при открытии.
function unpackRow([phrase, volume, low, high, rowCls, src, seed, difficulty, rowColor, potential]) {
  const stems = contentStems(phrase);
  return {
    phrase, volume, low, high, cls: rowCls, sources: src ? src.split(',') : [], words: phrase.split(' ').length, seed: !!seed, stems,
    ...analyze(phrase, volume, stems.length), difficulty, color: rowColor, potential,
  };
}

restoreForm();
showCalibState();
initShare({
  tool: 'keyword-finder',
  getState: () => {
    if (!data?.rows.length) return null;
    const rows = actionRows();
    const s = data.stats;
    return {
      f: { seeds: seedsEl.value, lang: langEl.value, region: regionEl.value },
      r: rows.map((r) => [r.phrase, r.volume, r.low, r.high, r.cls, r.sources.join(','), r.seed ? 1 : 0, r.difficulty, r.color, r.potential]),
      w: data.words.map((w) => [w.word, w.count, w.volume]),
      st: { requests: s.requests, yandexRequests: s.yandexRequests, failures: s.failures, seconds: s.seconds, calibrated: s.calibrated, yandex: s.yandex },
    };
  },
  setState: (d) => {
    seedsEl.value = d.f?.seeds || '';
    if (d.f?.lang) langEl.value = d.f.lang;
    if (REGIONS[d.f?.region]) regionEl.value = d.f.region;
    setData({
      rows: (d.r || []).map(unpackRow),
      words: (d.w || []).map(([word, count, volume]) => ({ word, count, volume })),
      stats: { requests: 0, yandexRequests: 0, failures: 0, seconds: 0, ...(d.st || {}) },
    });
    renderAll();
  },
});
