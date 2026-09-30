import '../core/app.js';
import { initShare } from '../core/share.js';
import '../styles/tools/duplicate.css';
import { initSegmented } from '../components/controls.js';
import { copyText } from '../core/clipboard.js';
import { $, debounce, fmt, fmtPct, h, plural } from '../core/dom.js';
import { storage } from '../core/storage.js';

const aEl = $('#dt-a');
const bEl = $('#dt-b');
const nEl = $('#dt-n');
const caseEl = $('#dt-case');
const punctEl = $('#dt-punct');
const spaceEl = $('#dt-space');

const prefs = storage.get('duplicate:prefs', {});
let mode = prefs.mode || 'words';
if (prefs.n) nEl.value = prefs.n;
for (const [el, key] of [[caseEl, 'case'], [punctEl, 'punct'], [spaceEl, 'space']]) if (typeof prefs[key] === 'boolean') el.checked = prefs[key];

let last = null;

const opts = () => ({ ignoreCase: caseEl.checked, ignorePunct: punctEl.checked, ignoreSpace: spaceEl.checked, n: +nEl.value });

/** Токены с позициями в исходном тексте. */
function tokenize(text, o) {
  const re = o.ignorePunct ? /[\p{L}\p{N}]+/gu : /\S+/g;
  const out = [];
  for (const m of text.matchAll(re)) {
    out.push({ start: m.index, end: m.index + m[0].length, norm: o.ignoreCase ? m[0].toLowerCase() : m[0] });
  }
  return out;
}

function sentences(text, o) {
  const out = [];
  for (const m of text.matchAll(/[^.!?…\n]+(?:[.!?…]+|$)/gm)) {
    const raw = m[0];
    const lead = raw.length - raw.trimStart().length;
    const trimmed = raw.trim();
    if (!/[\p{L}\p{N}]/u.test(trimmed)) continue;
    let norm = trimmed;
    if (o.ignoreCase) norm = norm.toLowerCase();
    if (o.ignorePunct) norm = norm.replace(/[^\p{L}\p{N}\s]+/gu, '');
    norm = o.ignoreSpace ? norm.replace(/\s+/g, '') : norm;
    out.push({ start: m.index + lead, end: m.index + lead + trimmed.length, norm, words: (trimmed.match(/[\p{L}\p{N}]+/gu) || []).length });
  }
  return out;
}

const jaccard = (a, b) => {
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return { inter, union, value: union ? (inter / union) * 100 : 0 };
};

function compare(textA, textB, o) {
  if (mode === 'sentences') {
    const sa = sentences(textA, o);
    const sb = sentences(textB, o);
    const setA = new Set(sa.map((s) => s.norm));
    const setB = new Set(sb.map((s) => s.norm));
    const j = jaccard(setA, setB);
    const markA = sa.map((s) => setB.has(s.norm));
    const markB = sb.map((s) => setA.has(s.norm));
    const wordsA = sa.reduce((n, s) => n + s.words, 0);
    const wordsB = sb.reduce((n, s) => n + s.words, 0);
    const mwA = sa.reduce((n, s, i) => n + (markA[i] ? s.words : 0), 0);
    const mwB = sb.reduce((n, s, i) => n + (markB[i] ? s.words : 0), 0);
    return {
      similarity: j.value,
      common: j.inter,
      commonLabel: 'Общих предложений',
      unitsA: sa,
      unitsB: sb,
      markA,
      markB,
      matchedA: mwA,
      totalA: wordsA,
      matchedB: mwB,
      totalB: wordsB,
      fragments: sa.filter((_, i) => markA[i]).map((s) => ({ start: s.start, end: s.end, words: s.words })),
    };
  }

  const ta = tokenize(textA, o);
  const tb = tokenize(textB, o);
  let setA;
  let setB;
  let markA;
  let markB;
  if (mode === 'words') {
    setA = new Set(ta.map((t) => t.norm));
    setB = new Set(tb.map((t) => t.norm));
    markA = ta.map((t) => setB.has(t.norm));
    markB = tb.map((t) => setA.has(t.norm));
  } else {
    const n = Math.max(1, o.n);
    const shingles = (toks) => {
      const keys = [];
      for (let i = 0; i + n <= toks.length; i++) keys.push(toks.slice(i, i + n).map((t) => t.norm).join('\u0001'));
      return keys;
    };
    const ka = shingles(ta);
    const kb = shingles(tb);
    setA = new Set(ka);
    setB = new Set(kb);
    markA = new Array(ta.length).fill(false);
    markB = new Array(tb.length).fill(false);
    ka.forEach((k, i) => setB.has(k) && markA.fill(true, i, i + n));
    kb.forEach((k, i) => setA.has(k) && markB.fill(true, i, i + n));
  }
  const j = jaccard(setA, setB);

  // Непрерывные совпадающие участки текста A.
  const fragments = [];
  for (let i = 0; i < ta.length; i++) {
    if (!markA[i]) continue;
    let k = i;
    while (k + 1 < ta.length && markA[k + 1]) k++;
    fragments.push({ start: ta[i].start, end: ta[k].end, words: k - i + 1 });
    i = k;
  }
  return {
    similarity: j.value,
    common: j.inter,
    commonLabel: mode === 'words' ? 'Общих уникальных слов' : 'Общих фрагментов',
    unitsA: ta,
    unitsB: tb,
    markA,
    markB,
    matchedA: markA.filter(Boolean).length,
    totalA: ta.length,
    matchedB: markB.filter(Boolean).length,
    totalB: tb.length,
    fragments,
  };
}

/** Текст с подсветкой: соседние совпавшие токены объединяются в один <mark>. */
function renderHighlighted(el, text, units, marks) {
  const nodes = [];
  let pos = 0;
  let i = 0;
  while (i < units.length) {
    if (!marks[i]) {
      i++;
      continue;
    }
    let k = i;
    while (k + 1 < units.length && marks[k + 1]) k++;
    const start = units[i].start;
    const end = units[k].end;
    if (start > pos) nodes.push(document.createTextNode(text.slice(pos, start)));
    nodes.push(h('mark', { text: text.slice(start, end) }));
    pos = end;
    i = k + 1;
  }
  if (pos < text.length) nodes.push(document.createTextNode(text.slice(pos)));
  el.replaceChildren(...nodes);
}

function stat(value, label, accent) {
  return h('div', { class: `stat${accent ? ' stat--accent' : ''}` }, h('div', { class: 'stat-value', text: value }), h('div', { class: 'stat-label', text: label }));
}

const pct = (a, b) => (b ? (a / b) * 100 : 0);

function run() {
  const o = opts();
  const textA = aEl.value;
  const textB = bEl.value;
  const wc = (t) => (t.match(/[\p{L}\p{N}]+/gu) || []).length;
  $('[data-count="a"]').textContent = `${fmt(wc(textA))} ${plural(wc(textA), 'слово', 'слова', 'слов')}`;
  $('[data-count="b"]').textContent = `${fmt(wc(textB))} ${plural(wc(textB), 'слово', 'слова', 'слов')}`;

  const spaceLabel = $('[data-space-label]');
  spaceEl.disabled = mode !== 'sentences';
  spaceLabel.classList.toggle('is-disabled', spaceEl.disabled);
  $('[data-shingle-field]').hidden = mode !== 'shingles';
  $('[data-mode-hint]').textContent = {
    words: 'Сравниваются наборы уникальных слов без учёта их порядка. Пробелы в этом режиме не влияют на результат.',
    shingles: 'Сравниваются последовательности из нескольких слов подряд — так находятся совпадающие фрагменты. Пробелы не влияют на результат.',
    sentences: 'Сравниваются предложения целиком. При игнорировании пробелов лишние и отсутствующие пробелы не считаются различием.',
  }[mode];

  const unit = mode === 'sentences' ? 'слов в совпавших предложениях' : 'слов';
  if (!textA.trim() || !textB.trim()) {
    last = null;
    $('[data-stats]').replaceChildren(stat('—', 'Сходство', true), stat('—', 'Совпадение в A'), stat('—', 'Совпадение в B'), stat('—', 'Совпадающих слов'));
    $('[data-view="a"]').textContent = textA;
    $('[data-view="b"]').textContent = textB;
    $('[data-fragments]').replaceChildren(h('p', { class: 'hint', text: 'Вставьте оба текста, чтобы увидеть совпадения.' }));
    $('[data-frag-count]').textContent = '';
  } else {
    const r = compare(textA, textB, o);
    last = { r, o, mode };
    $('[data-stats]').replaceChildren(
      stat(fmtPct(r.similarity), 'Сходство', true),
      stat(fmtPct(pct(r.matchedA, r.totalA)), `Совпадение в A (${fmt(r.matchedA)} из ${fmt(r.totalA)} ${unit})`),
      stat(fmtPct(pct(r.matchedB, r.totalB)), `Совпадение в B (${fmt(r.matchedB)} из ${fmt(r.totalB)} ${unit})`),
      stat(fmt(r.matchedA + r.matchedB), 'Совпадающих слов в A и B'),
      stat(fmt(r.common), r.commonLabel),
    );
    renderHighlighted($('[data-view="a"]'), textA, r.unitsA, r.markA);
    renderHighlighted($('[data-view="b"]'), textB, r.unitsB, r.markB);

    const frags = [...r.fragments].sort((x, y) => y.words - x.words);
    const LIMIT = 50;
    $('[data-frag-count]').textContent = frags.length ? `Найдено: ${fmt(frags.length)}` : '';
    $('[data-fragments]').replaceChildren(
      frags.length
        ? h(
            'ul',
            { class: 'frag-list' },
            frags.slice(0, LIMIT).map((f) => {
              const txt = textA.slice(f.start, f.end);
              return h('li', {}, h('span', { class: 'badge badge--accent', text: `${f.words} ${plural(f.words, 'слово', 'слова', 'слов')}` }), h('span', { text: txt.length > 400 ? `${txt.slice(0, 400)}…` : txt }));
            }),
          )
        : h('p', { class: 'hint', text: 'Совпадающих фрагментов не найдено.' }),
      frags.length > LIMIT ? h('p', { class: 'hint', style: 'margin-top:8px', text: `Показаны ${LIMIT} самых длинных фрагментов.` }) : '',
    );
  }
  storage.set('duplicate:prefs', { mode, n: nEl.value, case: caseEl.checked, punct: punctEl.checked, space: spaceEl.checked });
}

const runDebounced = debounce(run, 250);
aEl.addEventListener('input', runDebounced);
bEl.addEventListener('input', runDebounced);
for (const el of [nEl, caseEl, punctEl, spaceEl]) el.addEventListener('change', run);
const modeSeg = initSegmented($('[data-mode]'), (v) => {
  mode = v;
  run();
}, mode);

$('[data-action="clear"]').addEventListener('click', () => {
  aEl.value = '';
  bEl.value = '';
  run();
  aEl.focus();
});

$('[data-action="swap"]').addEventListener('click', () => {
  [aEl.value, bEl.value] = [bEl.value, aEl.value];
  run();
});

$('[data-action="example"]').addEventListener('click', () => {
  aEl.value =
    'Беговые кроссовки подбирают по типу покрытия, весу бегуна и технике бега. Для асфальта нужны кроссовки с хорошей амортизацией. Размер лучше выбирать вечером, когда стопа немного увеличивается.';
  bEl.value =
    'Кроссовки для бега выбирают по типу покрытия, весу бегуна и технике бега. Для асфальта нужны кроссовки с хорошей амортизацией. Перед покупкой обязательно примерьте обе пары.';
  run();
});

$('[data-action="copy"]').addEventListener('click', () => {
  if (!last) return copyText('');
  const { r, o } = last;
  const modeName = { words: 'по словам', shingles: `по фрагментам (${o.n} сл.)`, sentences: 'по предложениям' }[last.mode];
  const report = [
    'DuplicateText — отчёт о текстовом сходстве',
    `Режим: ${modeName}`,
    `Настройки: регистр — ${o.ignoreCase ? 'игнорируется' : 'учитывается'}, знаки препинания — ${o.ignorePunct ? 'игнорируются' : 'учитываются'}${last.mode === 'sentences' ? `, пробелы — ${o.ignoreSpace ? 'игнорируются' : 'учитываются'}` : ''}`,
    `Сходство: ${fmtPct(r.similarity)}`,
    `Совпадение в тексте A: ${fmtPct(pct(r.matchedA, r.totalA))} (${r.matchedA} из ${r.totalA})`,
    `Совпадение в тексте B: ${fmtPct(pct(r.matchedB, r.totalB))} (${r.matchedB} из ${r.totalB})`,
    `${r.commonLabel}: ${r.common}`,
    '',
    'Показатель отражает вычисляемое текстовое сходство и не является проверкой на плагиат.',
  ];
  copyText(report.join('\n'), 'Отчёт скопирован');
});

run();

initShare({
  tool: 'duplicate-text',
  getState: () => (last ? { a: aEl.value, b: bEl.value, m: mode, n: nEl.value, c: caseEl.checked, p: punctEl.checked, s: spaceEl.checked } : null),
  setState: (d) => {
    aEl.value = String(d.a || '');
    bEl.value = String(d.b || '');
    if (['words', 'shingles', 'sentences'].includes(d.m)) {
      mode = d.m;
      modeSeg.set(d.m, false);
    }
    if ([...nEl.options].some((o) => o.value === String(d.n))) nEl.value = String(d.n);
    caseEl.checked = d.c !== false;
    punctEl.checked = d.p !== false;
    spaceEl.checked = d.s !== false;
    run();
  },
});
