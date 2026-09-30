import '../core/app.js';
import '../styles/tools/cluster.css';
import { initSegmented } from '../components/controls.js';
import { copyText } from '../core/clipboard.js';
import { downloadCsv, toTsv } from '../core/csv.js';
import { $, debounce, fill, fmt, fmtPct, h, lines, plural } from '../core/dom.js';
import { receive } from '../core/handoff.js';
import { initShare } from '../core/share.js';
import { storage } from '../core/storage.js';
import { toast } from '../core/toast.js';
import { icon } from '../layout/icons.js';
import { INTENTS, STRENGTHS, clusterize, parseList } from './cluster/cluster.js';

const PAGE = 40;
const HINTS = {
  soft: 'Мягкая: объединяет запросы, у которых совпадает хотя бы половина значимых слов. Кластеры крупнее, но в один может попасть несколько близких тем.',
  medium: 'Средняя: запрос попадает в кластер, если содержит все слова главного запроса или совпадает с ним больше чем наполовину. Подходит в большинстве случаев.',
  strict: 'Строгая: запрос попадает в кластер, только если содержит все значимые слова главного запроса. Кластеры мелкие и точные.',
};

const inputEl = $('#kc-input');
const splitEl = $('#kc-split');
const searchEl = $('#kc-search');
const sortEl = $('#kc-sort');
const singlesEl = $('#kc-singles');

const prefs = storage.get('cluster:prefs', {});
let strength = STRENGTHS[prefs.strength] ? prefs.strength : 'medium';
if (typeof prefs.split === 'boolean') splitEl.checked = prefs.split;
if (prefs.sort) sortEl.value = prefs.sort;

let result = null;
let shown = PAGE;

const intentName = (id) => INTENTS[id] || '';

function run({ quiet = false } = {}) {
  const items = parseList(inputEl.value);
  if (!items.length) {
    result = null;
    render();
    if (!quiet) toast('Вставьте список запросов — по одному в строке', 'error');
    return;
  }
  result = clusterize(items, { strength, splitIntents: splitEl.checked });
  shown = PAGE;
  render();
  storage.set('cluster:prefs', { strength, split: splitEl.checked, sort: sortEl.value });
  if (!quiet) toast(`Готово: ${fmt(result.stats.clusters)} ${plural(result.stats.clusters, 'кластер', 'кластера', 'кластеров')}`);
}

function sortedClusters() {
  const q = searchEl.value.trim().toLowerCase();
  const list = result.clusters.filter((c) => c.items.length > 1 && (!q || c.items.some((it) => it.query.toLowerCase().includes(q))));
  const by = {
    volume: (a, b) => b.volume - a.volume || b.items.length - a.items.length,
    size: (a, b) => b.items.length - a.items.length || b.volume - a.volume,
    name: (a, b) => a.name.localeCompare(b.name, 'ru'),
  }[sortEl.value];
  return list.sort(by);
}

function singles() {
  const q = searchEl.value.trim().toLowerCase();
  return result.clusters.filter((c) => c.items.length === 1 && (!q || c.name.toLowerCase().includes(q)));
}

function stat(value, label, accent) {
  return h('div', { class: `stat${accent ? ' stat--accent' : ''}` }, h('div', { class: 'stat-value', text: value }), h('div', { class: 'stat-label', text: label }));
}

function itemRow(it, isHead, hasVolume) {
  return h(
    'li',
    { class: isHead ? 'is-head' : '' },
    h('span', { text: it.query }),
    hasVolume && it.volume ? h('span', { class: 'muted nowrap', text: fmt(it.volume) }) : null,
  );
}

function clusterCard(c, open, hasVolume) {
  const details = h(
    'details',
    { class: 'kc-cluster', open },
    h(
      'summary',
      {},
      h('span', { class: 'kc-name', text: c.name }),
      h(
        'span',
        { class: 'kc-badges' },
        h('span', { class: 'badge', text: `${c.items.length} ${plural(c.items.length, 'запрос', 'запроса', 'запросов')}` }),
        hasVolume ? h('span', { class: 'badge badge--accent', text: `Σ ${fmt(c.volume)}` }) : null,
        c.intent ? h('span', { class: 'badge badge--info', text: intentName(c.intent) }) : null,
      ),
    ),
    h('ul', { class: 'kc-items' }, c.items.map((it, i) => itemRow(it, i === 0, hasVolume))),
    h(
      'div',
      { class: 'kc-card-actions' },
      h('button', { type: 'button', class: 'btn btn-sm btn-ghost', dataset: { copyCluster: c.id }, trustedHtml: `${icon('copy')}Копировать кластер` }),
    ),
  );
  details.querySelector('summary').insertAdjacentHTML('beforeend', icon('chevron-down'));
  return details;
}

function render() {
  $('[data-results]').hidden = !result;
  if (!result) return;
  const s = result.stats;
  const totalVolume = result.clusters.reduce((n, c) => n + c.volume, 0);
  fill(
    $('[data-stats]'),
    stat(fmt(s.clusters), plural(s.clusters, 'кластер', 'кластера', 'кластеров'), true),
    stat(fmt(s.queries), 'запросов всего'),
    stat(s.queries ? fmtPct((s.groupedQueries / s.queries) * 100, 0) : '0%', 'попали в кластеры'),
    stat(fmt(s.singles), 'одиночных'),
    s.hasVolume ? stat(fmt(totalVolume), 'суммарная частотность') : null,
  );

  const list = sortedClusters();
  const solo = singlesEl.checked ? singles() : [];
  const cards = list.slice(0, shown).map((c, i) => clusterCard(c, i < 4, s.hasVolume));
  if (shown >= list.length && solo.length) {
    cards.push(
      h(
        'details',
        { class: 'kc-cluster kc-singles' },
        h('summary', {}, h('span', { class: 'kc-name', text: 'Одиночные запросы' }), h('span', { class: 'badge', text: fmt(solo.length) })),
        h('ul', { class: 'kc-items' }, solo.map((c) => itemRow(c.head, false, s.hasVolume))),
      ),
    );
  }
  fill($('[data-clusters]'), cards.length ? cards : h('div', { class: 'empty' }, h('p', { text: 'Нет кластеров, подходящих под поиск.' })));
  fill(
    $('[data-more]'),
    shown < list.length
      ? h('button', {
          type: 'button',
          class: 'btn btn-sm',
          text: `Показать ещё (${fmt(Math.min(PAGE, list.length - shown))} из ${fmt(list.length - shown)})`,
          onclick: () => {
            shown += PAGE;
            render();
          },
        })
      : null,
  );
}

function exportRows() {
  const rows = [['Кластер', 'Запрос', 'Частотность', 'Интент', 'Запросов в кластере']];
  const list = [...sortedClusters(), ...(singlesEl.checked ? singles() : [])];
  for (const c of list) for (const it of c.items) rows.push([c.name, it.query, it.volume || '', intentName(it.intent), c.items.length]);
  return rows;
}

// Список для поля ввода: «запрос<TAB>частотность<TAB>интент».
function toInput(items) {
  return items
    .map((it) => [it.query, it.volume || '', intentName(it.intent)].join('\t').replace(/\t+$/, ''))
    .join('\n');
}

// ---------- События ----------
initSegmented(
  $('[data-strength]'),
  (v) => {
    strength = v;
    $('[data-strength-hint]').textContent = HINTS[v];
    if (result) run({ quiet: true });
  },
  strength,
);
$('[data-strength-hint]').textContent = HINTS[strength];

$('[data-action="run"]').addEventListener('click', () => run());
inputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) run();
});
inputEl.addEventListener('input', debounce(() => {
  const n = lines(inputEl.value).length;
  $('[data-lines-info]').textContent = n ? `${fmt(n)} ${plural(n, 'строка', 'строки', 'строк')}` : '';
}, 200));
splitEl.addEventListener('change', () => result && run({ quiet: true }));
sortEl.addEventListener('change', () => {
  storage.set('cluster:prefs', { strength, split: splitEl.checked, sort: sortEl.value });
  render();
});
singlesEl.addEventListener('change', render);
searchEl.addEventListener('input', debounce(() => {
  shown = PAGE;
  render();
}, 150));

$('[data-clusters]').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-copy-cluster]');
  if (!btn) return;
  const c = result.clusters.find((x) => x.id === +btn.dataset.copyCluster);
  copyText(c.items.map((it) => it.query).join('\n'), `Скопировано запросов: ${fmt(c.items.length)}`);
});

$('[data-action="csv"]').addEventListener('click', () => downloadCsv(exportRows(), 'key-cluster.csv'));
$('[data-action="copy"]').addEventListener('click', () => {
  const rows = exportRows();
  copyText(rows.length > 1 ? toTsv(rows) : '', `Скопировано строк: ${fmt(rows.length - 1)}`);
});

$('[data-action="clear"]').addEventListener('click', () => {
  inputEl.value = '';
  searchEl.value = '';
  result = null;
  $('[data-lines-info]').textContent = '';
  render();
  inputEl.focus();
});

$('[data-action="example"]').addEventListener('click', () => {
  inputEl.value = [
    'купить диван;12000',
    'диван купить недорого;3400',
    'купить диван в москве;2900',
    'угловой диван;8000',
    'купить угловой диван;2100',
    'угловой диван с оттоманкой;1300',
    'диван кровать;15000',
    'диван кровать купить;4100',
    'диван кровать для ежедневного сна;900',
    'как выбрать диван;1600',
    'как выбрать диван для гостиной;320',
    'обивка для дивана какую выбрать;500',
    'перетяжка дивана;2600',
    'перетяжка дивана цена;700',
  ].join('\n');
  inputEl.dispatchEvent(new Event('input'));
  run();
});

// Переданные из Keyword Finder или IntentFinder запросы.
const passed = receive('key-cluster');
if (passed?.items?.length) {
  inputEl.value = toInput(passed.items);
  inputEl.dispatchEvent(new Event('input'));
  const hasIntent = passed.items.some((it) => it.intent);
  if (hasIntent && passed.from === 'intent-finder') splitEl.checked = true;
  run({ quiet: true });
  toast(`Получено запросов: ${fmt(result?.stats.queries || 0)} — из ${passed.from === 'intent-finder' ? 'IntentFinder' : 'Keyword Finder'}`, 'info');
}

initShare({
  tool: 'key-cluster',
  getState: () => (result ? { i: inputEl.value, s: strength, p: splitEl.checked } : null),
  setState: (d) => {
    inputEl.value = d.i || '';
    splitEl.checked = !!d.p;
    strength = STRENGTHS[d.s] ? d.s : 'medium';
    $('[data-strength] [data-value="' + strength + '"]')?.click();
    inputEl.dispatchEvent(new Event('input'));
    run({ quiet: true });
  },
});
