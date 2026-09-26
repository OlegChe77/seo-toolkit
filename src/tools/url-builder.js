import '../core/app.js';
import '../styles/tools/url-builder.css';
import { initSegmented } from '../components/controls.js';
import { copyText } from '../core/clipboard.js';
import { downloadCsv } from '../core/csv.js';
import { $, debounce, fmt, h, lines, plural, fill } from '../core/dom.js';
import { storage } from '../core/storage.js';
import { isStopword, normalizeWord } from '../core/text.js';
import { transliterate } from '../core/translit.js';
import { art, icon } from '../layout/icons.js';

const el = {
  scheme: $('#ub-scheme'),
  max: $('#ub-max'),
  base: $('#ub-base'),
  lower: $('#ub-lower'),
  stop: $('#ub-stop'),
  dedupe: $('#ub-dedupe'),
  title: $('#ub-title'),
  slug: $('#ub-slug'),
  list: $('#ub-list'),
};
const MAX_ROWS = 1000;

const prefs = storage.get('url:prefs', {});
let sep = prefs.sep === '_' ? '_' : '-';
for (const k of ['scheme', 'max', 'base']) if (prefs[k] != null) el[k].value = prefs[k];
for (const k of ['lower', 'stop', 'dedupe']) if (typeof prefs[k] === 'boolean') el[k].checked = prefs[k];

let rows = [];

export function slugify(title, o) {
  let s = String(title || '').trim();
  if (o.stop) {
    s = s
      .split(/\s+/)
      .filter((w) => !isStopword(normalizeWord(w.replace(/[^\p{L}\p{N}'’-]/gu, ''))))
      .join(' ');
  }
  if (o.lower) s = s.toLowerCase();
  s = transliterate(s, o.scheme);
  s = s.normalize('NFKD').replace(/[̀-ͯ]/g, ''); // é → e
  s = s.replace(/['’`"«»„“]/g, ''); // don't → dont
  s = s.replace(/[^A-Za-z0-9]+/g, o.sep);
  const esc = o.sep === '-' ? '\\-' : '_';
  s = s.replace(new RegExp(`${esc}{2,}`, 'g'), o.sep).replace(new RegExp(`^${esc}|${esc}$`, 'g'), '');
  if (o.max > 0 && s.length > o.max) {
    const cut = s.slice(0, o.max + 1);
    const at = cut.lastIndexOf(o.sep);
    s = (at > 0 ? cut.slice(0, at) : s.slice(0, o.max)).replace(new RegExp(`${esc}$`), '');
  }
  return s;
}

const options = () => ({ sep, scheme: el.scheme.value, max: +el.max.value, lower: el.lower.checked, stop: el.stop.checked });

function fullUrl(slug) {
  const base = el.base.value.trim();
  if (!base || !slug) return '';
  return base.endsWith('/') ? `${base}${slug}` : `${base}/${slug}`;
}

function updateSingle() {
  const slug = slugify(el.title.value, options());
  el.slug.value = slug;
  $('[data-slug-len]').textContent = slug ? `${fmt(slug.length)} симв.` : '';
  $('[data-full-url]').textContent = fullUrl(slug);
}

function updateBulk() {
  const o = options();
  const seen = new Map();
  rows = lines(el.list.value).map((title) => {
    let slug = slugify(title, o);
    let dup = false;
    if (slug) {
      const n = (seen.get(slug) || 0) + 1;
      seen.set(slug, n);
      if (n > 1) {
        dup = true;
        if (el.dedupe.checked) slug = `${slug}${sep}${n}`;
      }
    }
    return { title, slug, url: fullUrl(slug), dup };
  });

  const dups = rows.filter((r) => r.dup).length;
  $('[data-bulk-info]').textContent = rows.length
    ? `${fmt(rows.length)} ${plural(rows.length, 'строка', 'строки', 'строк')}${dups ? ` · повторов: ${fmt(dups)}` : ''}`
    : '';

  const box = $('[data-bulk-table]');
  if (!rows.length) {
    box.replaceChildren(h('div', { class: 'empty', trustedHtml: art('share-folder', 56) }, h('p', { text: 'Результаты появятся здесь после вставки списка.' })));
    return;
  }
  const hasBase = !!el.base.value.trim();
  fill(box,
    h(
      'div',
      { class: 'table-wrap table-wrap--scroll' },
      h(
        'table',
        { class: 'table' },
        h('thead', {}, h('tr', {}, h('th', { class: 'num', text: '#' }), h('th', { text: 'Заголовок' }), h('th', { text: 'Slug' }), hasBase ? h('th', { text: 'URL' }) : null, h('th', { text: '' }))),
        h(
          'tbody',
          {},
          rows.slice(0, MAX_ROWS).map((r, i) =>
            h(
              'tr',
              {},
              h('td', { class: 'num muted', text: i + 1 }),
              h('td', { class: 'wrap', text: r.title }),
              h('td', { class: 'ub-slug-cell' }, r.slug || h('span', { class: 'muted', text: '—' }), r.dup ? h('span', { class: 'badge badge--warn', style: 'margin-left:6px', text: 'повтор' }) : null),
              hasBase ? h('td', { class: 'ub-slug-cell', text: r.url }) : null,
              h('td', {}, h('button', { type: 'button', class: 'btn btn-sm btn-ghost btn-icon', title: 'Копировать', 'aria-label': `Копировать slug строки ${i + 1}`, dataset: { copyRow: i }, trustedHtml: icon('copy') })),
            ),
          ),
        ),
      ),
    ),
    rows.length > MAX_ROWS ? h('p', { class: 'hint', style: 'margin-top:8px', text: `Показаны первые ${fmt(MAX_ROWS)} строк. Копирование и экспорт содержат все ${fmt(rows.length)}.` }) : null,
  );
}

function updateAll() {
  updateSingle();
  updateBulk();
  storage.set('url:prefs', { sep, scheme: el.scheme.value, max: el.max.value, base: el.base.value, lower: el.lower.checked, stop: el.stop.checked, dedupe: el.dedupe.checked });
}

el.title.addEventListener('input', updateSingle);
el.list.addEventListener('input', debounce(updateBulk, 200));
el.base.addEventListener('input', debounce(updateAll, 200));
for (const k of ['scheme', 'max', 'lower', 'stop', 'dedupe']) el[k].addEventListener('change', updateAll);
initSegmented($('[data-sep]'), (v) => {
  sep = v;
  updateAll();
}, sep);

$('[data-action="copy-slug"]').addEventListener('click', () => copyText(el.slug.value, 'Slug скопирован'));

$('[data-bulk-table]').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-copy-row]');
  if (!btn) return;
  const r = rows[+btn.dataset.copyRow];
  copyText(r.url || r.slug, 'Скопировано');
});

$('[data-action="copy-all"]').addEventListener('click', () => {
  copyText(rows.map((r) => r.url || r.slug).join('\n'), `Скопировано строк: ${fmt(rows.length)}`);
});

$('[data-action="csv"]').addEventListener('click', () => {
  const hasBase = !!el.base.value.trim();
  downloadCsv([['Заголовок', 'Slug', ...(hasBase ? ['URL'] : [])], ...rows.map((r) => [r.title, r.slug, ...(hasBase ? [r.url] : [])])], 'url-slugs.csv');
});

$('[data-action="clear"]').addEventListener('click', () => {
  el.list.value = '';
  updateBulk();
  el.list.focus();
});

$('[data-action="example"]').addEventListener('click', () => {
  el.list.value = [
    'Как выбрать беговые кроссовки в 2026 году',
    'Лучшие модели для трейла: обзор и сравнение',
    'Уход за обувью — 7 простых советов',
    'Щётка для замши: зачем она нужна?',
    'Running shoes: what’s new & trending',
    'Как выбрать беговые кроссовки в 2026 году',
  ].join('\n');
  updateBulk();
});

updateAll();
