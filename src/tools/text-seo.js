import '../core/app.js';
import { initShare } from '../core/share.js';
import '../styles/tools/text-seo.css';
import { initSegmented } from '../components/controls.js';
import { copyText } from '../core/clipboard.js';
import { downloadCsv } from '../core/csv.js';
import { $, debounce, fmt, fmtPct, h, fill } from '../core/dom.js';
import { stem } from '../core/stem.js';
import { storage } from '../core/storage.js';
import { countParagraphs, isStopword, splitSentences, words } from '../core/text.js';
import { icon } from '../layout/icons.js';

const textEl = $('#ts-text');
const minEl = $('#ts-min');
const keysEl = $('#ts-keys');
const stopEl = $('#ts-stop');
const stemEl = $('#ts-stem');
const filterEl = $('[data-filter]');
const PAGE = 100;

const prefs = storage.get('textseo:prefs', {});
let ngram = String(prefs.ngram || 1);
if (prefs.min) minEl.value = prefs.min;
if (typeof prefs.stop === 'boolean') stopEl.checked = prefs.stop;
if (typeof prefs.stem === 'boolean') stemEl.checked = prefs.stem;
let result = null;
let shown = PAGE;

function analyze(text, { n, min, stop, useStem }) {
  const sentences = splitSentences(text);
  const sentTokens = sentences.map((s) => words(s));
  const all = sentTokens.flat();
  const total = all.length;
  const key = useStem ? stem : (w) => w;
  const significant = (w) => !isStopword(w) && (w.length > 1 || /\d/.test(w));

  // Частота слов и фраз (фразы не пересекают границы предложений).
  const map = new Map();
  for (const toks of sentTokens) {
    for (let i = 0; i + n <= toks.length; i++) {
      const slice = toks.slice(i, i + n);
      if (stop && (!significant(slice[0]) || !significant(slice[n - 1]))) continue;
      if (!stop && n === 1 && slice[0].length < 2 && !/\d/.test(slice[0])) continue;
      const k = slice.map(key).join(' ');
      let e = map.get(k);
      if (!e) map.set(k, (e = { count: 0, forms: new Map() }));
      e.count++;
      const form = slice.join(' ');
      e.forms.set(form, (e.forms.get(form) || 0) + 1);
    }
  }
  const rows = [...map.values()]
    .filter((e) => e.count >= min)
    .map((e) => {
      const forms = [...e.forms.entries()].sort((a, b) => b[1] - a[1]).map(([f]) => f);
      return { phrase: forms[0], forms, count: e.count, density: total ? ((e.count * n) / total) * 100 : 0 };
    })
    .sort((a, b) => b.count - a.count || a.phrase.localeCompare(b.phrase, 'ru'));

  // Самое частое значимое слово — для «тошноты».
  const uni = new Map();
  let stopCount = 0;
  for (const w of all) {
    if (isStopword(w)) stopCount++;
    else if (significant(w)) uni.set(key(w), (uni.get(key(w)) || 0) + 1);
  }
  let maxFreq = 0;
  for (const c of uni.values()) if (c > maxFreq) maxFreq = c;

  // Повторы.
  const doubles = [];
  const inSentence = [];
  sentTokens.forEach((toks, si) => {
    for (let i = 1; i < toks.length; i++) {
      if (toks[i] === toks[i - 1] && !/^\d+$/.test(toks[i])) doubles.push({ word: toks[i], sentence: sentences[si] });
    }
    const counts = new Map();
    for (const w of toks) if (!isStopword(w) && w.length >= 3 && !/^\d+$/.test(w)) counts.set(key(w), (counts.get(key(w)) || 0) + 1);
    for (const [k, c] of counts) {
      if (c >= 2) inSentence.push({ word: toks.find((w) => key(w) === k), count: c, sentence: sentences[si] });
    }
  });
  inSentence.sort((a, b) => b.count - a.count);

  const clean = text.replace(/\r/g, '');
  return {
    total,
    rows,
    doubles,
    inSentence,
    sentTokens,
    key,
    stats: {
      words: total,
      unique: new Set(all.map(key)).size,
      chars: [...clean].length,
      charsNoSpaces: [...clean.replace(/\s/g, '')].length,
      sentences: sentences.length,
      paragraphs: countParagraphs(text),
      avgSentence: sentences.length ? total / sentences.length : 0,
      readMin: total / 180,
      nausea: Math.sqrt(maxFreq),
      stopShare: total ? (stopCount / total) * 100 : 0,
    },
  };
}

function keywordDensity(res, input) {
  const phrases = input
    .split(/[,\n;]/)
    .map((s) => s.trim())
    .filter(Boolean);
  return phrases.map((phrase) => {
    const kw = words(phrase).map(res.key);
    let count = 0;
    if (kw.length) {
      for (const toks of res.sentTokens) {
        const keys = toks.map(res.key);
        for (let i = 0; i + kw.length <= keys.length; i++) {
          if (kw.every((w, j) => keys[i + j] === w)) count++;
        }
      }
    }
    return { phrase, count, density: res.total ? ((count * kw.length) / res.total) * 100 : 0 };
  });
}

const STAT_LABELS = [
  ['words', 'Слов', (v) => fmt(v)],
  ['unique', 'Уникальных слов', (v) => fmt(v)],
  ['chars', 'Символов с пробелами', (v) => fmt(v)],
  ['charsNoSpaces', 'Символов без пробелов', (v) => fmt(v)],
  ['sentences', 'Предложений', (v) => fmt(v)],
  ['paragraphs', 'Абзацев', (v) => fmt(v)],
  ['avgSentence', 'Слов в предложении (сред.)', (v) => fmt(Math.round(v * 10) / 10)],
  ['readMin', 'Время чтения', (v) => (v < 1 ? '< 1 мин' : `≈ ${Math.round(v)} мин`)],
  ['nausea', 'Классическая тошнота', (v) => fmt(Math.round(v * 100) / 100)],
  ['stopShare', 'Доля служебных слов', (v) => fmtPct(v)],
];

function renderStats() {
  const s = result?.stats;
  $('[data-stats]').replaceChildren(
    ...STAT_LABELS.map(([k, label, f], i) =>
      h('div', { class: `stat${i === 0 ? ' stat--accent' : ''}` }, h('div', { class: 'stat-value', text: s ? f(s[k]) : '0' }), h('div', { class: 'stat-label', text: label })),
    ),
  );
}

const emptyBlock = (text) => h('div', { class: 'empty', trustedHtml: icon('file') }, h('p', { text }));

function renderFreq() {
  const box = $('[data-freq]');
  if (!result || !result.total) return box.replaceChildren(emptyBlock('Вставьте текст, чтобы увидеть частоту слов и фраз.'));
  const q = filterEl.value.trim().toLowerCase().replace(/ё/g, 'е');
  const rows = q ? result.rows.filter((r) => r.forms.some((f) => f.includes(q))) : result.rows;
  if (!rows.length) return box.replaceChildren(emptyBlock(q ? 'Нет фраз, подходящих под фильтр.' : 'Нет повторяющихся слов или фраз с выбранными настройками.'));
  const max = rows[0].count;
  const table = h(
    'div',
    { class: 'table-wrap table-wrap--scroll' },
    h(
      'table',
      { class: 'table' },
      h('thead', {}, h('tr', {}, h('th', { class: 'num', text: '#' }), h('th', { text: ngram === '1' ? 'Слово' : 'Фраза' }), h('th', { class: 'num', text: 'Повторов' }), h('th', { class: 'num', text: 'Плотность' }))),
      h(
        'tbody',
        {},
        rows.slice(0, shown).map((r, i) =>
          h(
            'tr',
            {},
            h('td', { class: 'num muted', text: i + 1 }),
            h('td', { class: 'wrap', title: r.forms.length > 1 ? `Формы: ${r.forms.join(', ')}` : null }, r.phrase, r.forms.length > 1 ? h('span', { class: 'muted', text: ` +${r.forms.length - 1}` }) : null),
            h('td', { class: 'num' }, h('div', { class: 'bar-cell' }, h('span', { class: 'bar' }, h('span', { style: `width:${(r.count / max) * 100}%` })), fmt(r.count))),
            h('td', { class: 'num', text: fmtPct(r.density, 2) }),
          ),
        ),
      ),
    ),
  );
  const parts = [table];
  if (rows.length > shown) {
    parts.push(
      h(
        'div',
        { class: 'more-row' },
        h('button', {
          type: 'button',
          class: 'btn btn-sm',
          text: `Показать ещё (${fmt(Math.min(PAGE, rows.length - shown))} из ${fmt(rows.length - shown)})`,
          onclick: () => {
            shown += PAGE;
            renderFreq();
          },
        }),
      ),
    );
  }
  parts.push(h('p', { class: 'hint', style: 'margin-top:8px', text: `Всего ${ngram === '1' ? 'слов' : 'фраз'} в таблице: ${fmt(rows.length)}` }));
  box.replaceChildren(...parts);
}

function renderKeys() {
  const box = $('[data-keys]');
  if (!keysEl.value.trim()) return box.replaceChildren(h('p', { class: 'hint', text: 'Введите ключевые слова в поле над статистикой, чтобы узнать их плотность.' }));
  if (!result || !result.total) return box.replaceChildren(h('p', { class: 'hint', text: 'Вставьте текст для расчёта.' }));
  const rows = keywordDensity(result, keysEl.value);
  box.replaceChildren(
    h(
      'div',
      { class: 'table-wrap' },
      h(
        'table',
        { class: 'table' },
        h('thead', {}, h('tr', {}, h('th', { text: 'Ключевое слово' }), h('th', { class: 'num', text: 'Вхождений' }), h('th', { class: 'num', text: 'Плотность' }))),
        h(
          'tbody',
          {},
          rows.map((r) =>
            h(
              'tr',
              {},
              h('td', { class: 'wrap' }, r.phrase, ' ', r.count === 0 ? h('span', { class: 'badge badge--warn', text: 'нет в тексте' }) : r.density > 4 ? h('span', { class: 'badge badge--warn', text: 'высокая' }) : null),
              h('td', { class: 'num', text: fmt(r.count) }),
              h('td', { class: 'num', text: fmtPct(r.density, 2) }),
            ),
          ),
        ),
      ),
    ),
  );
}

function renderRepeats() {
  const box = $('[data-repeats]');
  if (!result || !result.total) return box.replaceChildren(h('p', { class: 'hint', text: 'Повторы появятся после ввода текста.' }));
  const items = [
    ...result.doubles.map((d) => ({ badge: h('span', { class: 'badge badge--bad', text: 'дубль подряд' }), title: `${d.word} ${d.word}`, sentence: d.sentence })),
    ...result.inSentence.map((r) => ({ badge: h('span', { class: 'badge badge--warn', text: `×${r.count} в предложении` }), title: r.word, sentence: r.sentence })),
  ];
  if (!items.length) return box.replaceChildren(h('div', { class: 'issue issue--ok', trustedHtml: icon('check') }, h('span', { text: 'Явных повторов не найдено.' })));
  const LIMIT = 40;
  const cut = (s) => (s.length > 180 ? `${s.slice(0, 180)}…` : s);
  fill(box,
    h(
      'ul',
      { class: 'repeat-list' },
      items.slice(0, LIMIT).map((it) => h('li', {}, h('strong', { text: it.title }), ' ', it.badge, h('span', { class: 'repeat-context', text: cut(it.sentence) }))),
    ),
    items.length > LIMIT ? h('p', { class: 'hint', style: 'margin-top:8px', text: `Показаны первые ${LIMIT} из ${fmt(items.length)}.` }) : null,
  );
}

function run() {
  const text = textEl.value;
  result = text.trim()
    ? analyze(text, { n: +ngram, min: +minEl.value, stop: stopEl.checked, useStem: stemEl.checked })
    : null;
  shown = PAGE;
  renderStats();
  renderFreq();
  renderKeys();
  renderRepeats();
  storage.set('textseo:prefs', { ngram, min: minEl.value, stop: stopEl.checked, stem: stemEl.checked });
}

const runDebounced = debounce(run, 250);
textEl.addEventListener('input', runDebounced);
keysEl.addEventListener('input', debounce(renderKeys, 200));
filterEl.addEventListener('input', debounce(() => {
  shown = PAGE;
  renderFreq();
}, 150));
for (const el of [minEl, stopEl, stemEl]) el.addEventListener('change', run);
const ngramSeg = initSegmented($('[data-ngram]'), (v) => {
  ngram = v;
  run();
}, ngram);

$('[data-action="clear"]').addEventListener('click', () => {
  textEl.value = '';
  filterEl.value = '';
  run();
  textEl.focus();
});

$('[data-action="example"]').addEventListener('click', () => {
  textEl.value = `Как выбрать беговые кроссовки

Беговые кроссовки подбирают по типу покрытия, весу бегуна и технике бега. Для асфальта нужны кроссовки с хорошей амортизацией, а для трейла — с агрессивным протектором.

Амортизация защищает суставы при беге по твёрдому покрытию. Если вы бегаете по парку, выбирайте кроссовки с умеренной амортизацией и устойчивой подошвой.

Размер кроссовок стоит выбирать вечером, когда стопа немного увеличивается. Между большим пальцем и носком кроссовка должно оставаться около сантиметра. Примерьте кроссовки с беговыми носками, в которых вы тренируетесь.`;
  keysEl.value = 'беговые кроссовки, амортизация, размер';
  run();
});

function reportRows() {
  if (!result) return null;
  const s = result.stats;
  const rows = [['Показатель', 'Значение']];
  for (const [k, label, f] of STAT_LABELS) rows.push([label, f(s[k])]);
  rows.push([], [ngram === '1' ? 'Слово' : `Фраза (${ngram} сл.)`, 'Повторов', 'Плотность, %']);
  for (const r of result.rows) rows.push([r.phrase, r.count, r.density.toFixed(2).replace('.', ',')]);
  if (keysEl.value.trim()) {
    rows.push([], ['Ключевое слово', 'Вхождений', 'Плотность, %']);
    for (const r of keywordDensity(result, keysEl.value)) rows.push([r.phrase, r.count, r.density.toFixed(2).replace('.', ',')]);
  }
  return rows;
}

$('[data-action="csv"]').addEventListener('click', () => downloadCsv(reportRows(), 'text-seo-report.csv'));

$('[data-action="copy"]').addEventListener('click', () => {
  if (!result) return copyText('');
  const s = result.stats;
  const lines = ['TextSEO — отчёт', ...STAT_LABELS.map(([k, label, f]) => `${label}: ${f(s[k])}`), '', `Топ ${ngram === '1' ? 'слов' : 'фраз'}:`];
  result.rows.slice(0, 30).forEach((r, i) => lines.push(`${i + 1}. ${r.phrase} — ${r.count} (${fmtPct(r.density, 2)})`));
  if (keysEl.value.trim()) {
    lines.push('', 'Ключевые слова:');
    for (const r of keywordDensity(result, keysEl.value)) lines.push(`${r.phrase} — ${r.count} (${fmtPct(r.density, 2)})`);
  }
  copyText(lines.join('\n'), 'Отчёт скопирован');
});

run();

initShare({
  tool: 'text-seo',
  getState: () => (textEl.value.trim() ? { x: textEl.value, k: keysEl.value, n: ngram, m: minEl.value, s: stopEl.checked, st: stemEl.checked } : null),
  setState: (d) => {
    textEl.value = String(d.x || '');
    keysEl.value = String(d.k || '');
    if (['1', '2', '3', '5'].includes(String(d.m))) minEl.value = String(d.m);
    stopEl.checked = d.s !== false;
    stemEl.checked = !!d.st;
    if (['1', '2', '3', '4'].includes(String(d.n))) {
      ngram = String(d.n);
      ngramSeg.set(ngram, false);
    }
    run();
  },
});
