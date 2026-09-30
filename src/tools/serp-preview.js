import '../core/app.js';
import { initShare } from '../core/share.js';
import { initSegmented } from '../components/controls.js';
import { parseDisplayUrl, renderSnippet, SNIPPET_LIMITS } from '../components/snippet.js';
import { copyText } from '../core/clipboard.js';
import { $, escapeHtml, fmt, h } from '../core/dom.js';
import { FONTS, textWidth } from '../core/measure.js';
import { storage } from '../core/storage.js';
import { icon } from '../layout/icons.js';

const RANGES = {
  title: { min: 30, max: 60, px: SNIPPET_LIMITS.desktop.title },
  description: { min: 70, max: 160, px: SNIPPET_LIMITS.desktop.description },
};

const inputs = { title: $('#serp-title'), description: $('#serp-desc'), url: $('#serp-url') };
const snippetEl = $('[data-snippet]');
const frame = $('[data-frame]');
const issuesEl = $('[data-issues]');
const draft = storage.get('serp:draft', {});
let device = storage.get('serp:device', 'desktop');

for (const [key, el] of Object.entries(inputs)) el.value = draft[key] || '';

function status(len, px, range) {
  if (!len) return 'empty';
  if (len < range.min) return 'short';
  if (len > range.max) return 'long';
  if (px > range.px) return 'wide';
  return 'ok';
}

function updateField(key) {
  const value = inputs[key].value.trim();
  const counter = $(`[data-counter="${key}"]`);
  if (key === 'url') {
    counter.textContent = `${fmt(value.length)} симв.`;
    return null;
  }
  const range = RANGES[key];
  const px = textWidth(value, FONTS[key]);
  const st = status(value.length, px, range);
  counter.textContent = `${fmt(value.length)} симв. · ≈${fmt(px)} px`;
  const cls = { ok: 'is-ok', empty: '', short: 'is-warn', wide: 'is-warn', long: 'is-bad' }[st];
  counter.className = `counter ${cls}`;
  const meter = $(`[data-meter="${key}"]`);
  meter.style.width = `${Math.min(100, (px / range.px) * 100)}%`;
  meter.className = `meter-fill ${cls || 'is-ok'}`;
  return { value, px, st, range };
}

function issue(type, text) {
  const iconName = { ok: 'check', warn: 'alert', bad: 'alert', info: 'info' }[type];
  return h('li', { class: `issue issue--${type}`, trustedHtml: icon(iconName) }, h('span', { text }));
}

function update() {
  const t = updateField('title');
  const d = updateField('description');
  updateField('url');
  renderSnippet(snippetEl, {
    title: inputs.title.value,
    description: inputs.description.value,
    url: inputs.url.value,
    device,
  });
  frame.className = `snippet-frame${device === 'mobile' ? ' snippet-frame--mobile' : ''}`;

  const list = [];
  const url = inputs.url.value.trim();
  if (t.st === 'empty') list.push(issue('bad', 'Title не заполнен.'));
  else if (t.st === 'short') list.push(issue('warn', `Title короткий (${t.value.length} симв.). Добавьте ключевые слова и уточнение.`));
  else if (t.st === 'long') list.push(issue('bad', `Title длинный (${t.value.length} симв., ≈${t.px} px) — вероятно, будет обрезан.`));
  else if (t.st === 'wide') list.push(issue('warn', `Title в пределах ${RANGES.title.max} символов, но широкий (≈${t.px} px) — на компьютере может быть обрезан.`));
  else list.push(issue('ok', `Длина Title в пределах ориентира (${t.value.length} симв.).`));

  if (d.st === 'empty') list.push(issue('warn', 'Description не заполнен — поисковик сформирует описание сам.'));
  else if (d.st === 'short') list.push(issue('warn', `Description короткий (${d.value.length} симв.). Раскройте суть и выгоду страницы.`));
  else if (d.st === 'long') list.push(issue('bad', `Description длинный (${d.value.length} симв., ≈${d.px} px) — вероятно, будет обрезан.`));
  else if (d.st === 'wide') list.push(issue('warn', `Description в пределах ${RANGES.description.max} символов, но широкий (≈${d.px} px) — может быть сокращён.`));
  else list.push(issue('ok', `Длина Description в пределах ориентира (${d.value.length} симв.).`));

  if (url) {
    const parsed = parseDisplayUrl(url);
    if (!parsed || !/^https?:$/.test(parsed.url.protocol) || !parsed.host.includes('.')) list.push(issue('bad', 'URL выглядит некорректно. Пример: https://example.com/page'));
    else if (!/^https?:\/\//i.test(url)) list.push(issue('info', 'Укажите протокол (https://) — в предпросмотре он подставлен автоматически.'));
    if (url.length > 100) list.push(issue('warn', `URL длинный (${url.length} симв.). Короткие адреса легче читать.`));
  }
  if (t.value && d.value && t.value.toLowerCase() === d.value.toLowerCase()) list.push(issue('warn', 'Title и Description совпадают — лучше сделать их разными.'));
  issuesEl.replaceChildren(...list);

  storage.set('serp:draft', { title: inputs.title.value, description: inputs.description.value, url: inputs.url.value });
}

for (const el of Object.values(inputs)) el.addEventListener('input', update);

const deviceSeg = initSegmented(
  $('[data-device]'),
  (value) => {
    device = value;
    storage.set('serp:device', value);
    update();
  },
  device,
);

$('[data-action="clear"]').addEventListener('click', () => {
  for (const el of Object.values(inputs)) el.value = '';
  update();
  inputs.title.focus();
});

$('[data-action="example"]').addEventListener('click', () => {
  inputs.title.value = 'Кроссовки для бега — каталог, цены и доставка по России';
  inputs.description.value =
    'Более 300 моделей беговых кроссовок для асфальта, трейла и зала. Подбор по размеру и типу стопы, примерка при получении, возврат 30 дней.';
  inputs.url.value = 'https://example.com/catalog/running-shoes';
  update();
});

$('[data-action="copy-html"]').addEventListener('click', () => {
  const title = inputs.title.value.trim();
  const desc = inputs.description.value.trim();
  const url = inputs.url.value.trim();
  if (!title && !desc) return copyText('');
  const out = [];
  if (title) out.push(`<title>${escapeHtml(title)}</title>`);
  if (desc) out.push(`<meta name="description" content="${escapeHtml(desc)}">`);
  if (url) out.push(`<link rel="canonical" href="${escapeHtml(url)}">`);
  copyText(out.join('\n'), 'HTML-код метатегов скопирован');
});

$('[data-action="copy-report"]').addEventListener('click', () => {
  const title = inputs.title.value.trim();
  const desc = inputs.description.value.trim();
  if (!title && !desc) return copyText('');
  const report = [
    'SERP Preview — отчёт',
    `Title: ${title || '—'}`,
    `Длина Title: ${title.length} симв., ≈${textWidth(title, FONTS.title)} px`,
    `Description: ${desc || '—'}`,
    `Длина Description: ${desc.length} симв., ≈${textWidth(desc, FONTS.description)} px`,
    `URL: ${inputs.url.value.trim() || '—'}`,
    '',
    'Замечания:',
    ...Array.from(issuesEl.children, (li) => `• ${li.textContent}`),
    '',
    'Ширина в пикселях — приблизительная оценка.',
  ];
  copyText(report.join('\n'), 'Отчёт скопирован');
});

update();

initShare({
  tool: 'serp-preview',
  getState: () => {
    const [t, d, u] = [inputs.title.value, inputs.description.value, inputs.url.value];
    return t || d || u ? { t, d, u, m: device } : null;
  },
  setState: (s) => {
    inputs.title.value = String(s.t || '');
    inputs.description.value = String(s.d || '');
    inputs.url.value = String(s.u || '');
    if (s.m === 'mobile' || s.m === 'desktop') deviceSeg.set(s.m);
    update();
  },
});
