// SEO-анализ сайта: сервер (server/audit.js) загружает страницу, robots.txt и sitemap.xml,
// а проверки, оценка и отчёт считаются здесь, в браузере (audit/checks.js).
import '../core/app.js';
import '../styles/tools/seo-audit.css';
import { getCategory, tools } from '../config/pages.js';
import { copyText } from '../core/clipboard.js';
import { downloadCsv } from '../core/csv.js';
import { $, fill, fmt, h, plural } from '../core/dom.js';
import { reachGoal } from '../core/goals.js';
import { openWithState } from '../core/handoff.js';
import { toast } from '../core/toast.js';
import { GROUPS, analyze } from './audit/checks.js';

const API = typeof __SUGGEST_API__ === 'string' ? __SUGGEST_API__.replace(/\/+$/, '') : '';
const TIMEOUT = 80000; // бесплатный сервер Render просыпается до минуты, сама проверка — до 30 секунд
const CACHE_KEY = 'seotk:audit';
const CACHE_TTL = 10 * 60 * 1000; // чтобы «Назад» из инструмента не запускал проверку заново
const STATUS = { ok: 'В порядке', warn: 'Внимание', fail: 'Ошибка', info: 'Совет' };
const STEPS = ['Будим сервер проверки…', 'Загружаем страницу…', 'Смотрим robots.txt и sitemap.xml…', 'Проверяем редиректы, https и зеркало www…', 'Почти готово…'];

const form = $('[data-audit-form]');
const input = $('#sa-url');
let data = null;
let report = null;
let running = false;
const actions = new Map(); // кнопка → инструмент с данными

// ---------- Загрузка ----------

function cached(url) {
  try {
    const c = JSON.parse(sessionStorage.getItem(CACHE_KEY) || 'null');
    return c && c.key === url && Date.now() - c.at < CACHE_TTL ? c.data : null;
  } catch {
    return null;
  }
}

function remember(url, value) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ key: url, at: Date.now(), data: value }));
  } catch {
    /* большая страница не помещается — просто не кэшируем */
  }
}

async function fetchAudit(url) {
  let res;
  try {
    res = await fetch(`${API}/audit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
      signal: AbortSignal.timeout(TIMEOUT),
    });
  } catch (e) {
    throw new Error(e?.name === 'TimeoutError' ? 'Сервер проверки не ответил вовремя. Повторите через минуту.' : 'Не удалось связаться с сервером проверки. Проверьте интернет и повторите.');
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Ошибка сервера проверки (${res.status})`);
  return body;
}

let stepTimer = null;
function setBusy(on) {
  $('[data-progress]').hidden = !on;
  form.querySelector('[type="submit"]').disabled = on;
  clearInterval(stepTimer);
  if (!on) return;
  let i = 0;
  $('[data-progress-text]').textContent = STEPS[0];
  stepTimer = setInterval(() => {
    i = Math.min(i + 1, STEPS.length - 1);
    $('[data-progress-text]').textContent = STEPS[i];
  }, 5000);
}

function showError(message) {
  const box = $('[data-error]');
  box.hidden = !message;
  box.textContent = message;
}

async function run(raw, { fresh = false } = {}) {
  const value = String(raw || '').trim();
  if (!value) {
    input.focus();
    return toast('Введите адрес сайта — например, example.ru', 'error');
  }
  if (!API) return showError('Сервер проверки не настроен.');
  if (running) return;
  running = true;
  showError('');
  setBusy(true);
  history.replaceState(null, '', `${location.pathname}#url=${encodeURIComponent(value)}`);
  reachGoal('audit_run');
  try {
    data = (!fresh && cached(value)) || (await fetchAudit(value));
    remember(value, data);
    report = analyze(data);
    render();
    $('[data-results]').hidden = false;
    $('.sa-summary').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (e) {
    $('[data-results]').hidden = true;
    showError(e.message || 'Не удалось проверить сайт');
  } finally {
    running = false;
    setBusy(false);
  }
}

// ---------- Отчёт ----------

function animateScore(score) {
  const ring = $('[data-ring]');
  const c = 2 * Math.PI * 52;
  ring.style.strokeDasharray = `${c}`;
  ring.style.strokeDashoffset = `${c}`;
  requestAnimationFrame(() => (ring.style.strokeDashoffset = `${c * (1 - score / 100)}`));
  const num = $('[data-score-num]');
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return (num.textContent = score);
  const t0 = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - t0) / 900);
    num.textContent = Math.round(score * (1 - (1 - k) ** 3));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

const badge = (status) => h('span', { class: `sa-badge sa-badge--${status}`, text: STATUS[status] });

function toolButton(t, label = t.label) {
  const btn = h('button', { type: 'button', class: 'btn btn-sm', text: label });
  actions.set(btn, t);
  return btn;
}

function guideLink(slug) {
  return h('a', { class: 'btn btn-sm btn-ghost', href: `/guides/${slug}`, text: 'Гайд' });
}

function renderSummary() {
  const r = report;
  $('[data-score]').dataset.level = r.grade.id;
  animateScore(r.score);
  $('[data-grade]').textContent = r.grade.label;
  const redirected = data.input.replace(/\/$/, '') !== data.url.replace(/\/$/, '');
  fill($('[data-checked]'),
    h('a', { href: data.url, target: '_blank', rel: 'noopener nofollow', text: data.url }),
    redirected ? ` (открыт после редиректа с ${data.input})` : '',
    ` · ${new Date(data.checkedAt).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })}`,
  );
  const c = r.counts;
  fill($('[data-counts]'),
    h('li', { class: 'is-ok' }, h('b', { text: c.ok }), ` ${plural(c.ok, 'проверка пройдена', 'проверки пройдены', 'проверок пройдено')}`),
    h('li', { class: 'is-warn' }, h('b', { text: c.warn }), ` ${plural(c.warn, 'требует внимания', 'требуют внимания', 'требуют внимания')}`),
    h('li', { class: 'is-fail' }, h('b', { text: c.fail }), ` ${plural(c.fail, 'ошибка', 'ошибки', 'ошибок')}`),
  );
  const crit = $('[data-critical]');
  crit.hidden = !r.critical.length;
  crit.textContent = r.critical.length ? `Страница не может попасть в поиск (${r.critical.join(', ').toLowerCase()}), поэтому оценка не выше 35. Начните с этого.` : '';
}

function renderFacts() {
  const f = report.facts;
  const row = (label, value, hint) => [h('dt', { text: label }), h('dd', {}, value || h('span', { class: 'muted', text: 'нет' }), hint ? h('small', { text: hint }) : null)];
  fill($('[data-facts]'),
    ...row('Title', f.title, f.title ? `${f.title.length} симв.` : ''),
    ...row('Description', f.description, f.description ? `${f.description.length} симв.` : ''),
    ...row('H1', f.h1),
    ...row('Текст', `${fmt(f.words)} ${plural(f.words, 'слово', 'слова', 'слов')}`),
    ...row('Ответ сервера', `${data.status} · ${fmt(data.ttfb)} мс`, `HTML ${fmt(Math.round(data.bytes / 1024))} КБ${data.headers['content-encoding'] ? `, сжатие ${data.headers['content-encoding']}` : ''}`),
  );
}

function renderIssues() {
  const list = report.issues.slice(0, 10);
  $('[data-issues-panel]').hidden = !list.length;
  fill($('[data-issues]'), list.map((c) =>
    h('li', { class: `sa-issue sa-issue--${c.status}` },
      h('div', { class: 'sa-issue-head' }, badge(c.status), h('h3', { text: c.title })),
      h('p', { class: 'sa-issue-value', text: c.value }),
      c.advice ? h('p', { text: c.advice }) : null,
      c.tool || c.guide ? h('div', { class: 'row' }, c.tool ? toolButton(c.tool) : null, c.guide ? guideLink(c.guide) : null) : null,
    ),
  ));
}

function renderTools() {
  fill($('[data-tools]'), report.helpers.map((t) => {
    const meta = tools.find((x) => x.id === t.id);
    const cat = getCategory(meta?.category);
    return h('article', { class: 'sa-tool' },
      h('div', { class: 'sa-tool-head' },
        h('span', { class: `tool-icon tool-icon--sm cat-${cat?.id || 'research'}` }, h('img', { class: 'art', src: `/icons/${meta?.icon || 'seo'}.svg`, alt: '', width: 26, height: 26 })),
        h('div', {}, h('h3', { text: t.name }), h('p', { class: 'muted', text: meta?.short || '' })),
      ),
      h('ul', {}, t.reasons.map((reason) => h('li', { text: reason }))),
      toolButton(t, t.state || t.id === 'keyword-finder' ? 'Открыть с данными страницы' : 'Открыть инструмент'),
    );
  }));
}

function renderGroups() {
  fill($('[data-groups]'), GROUPS.map((g) => {
    const list = report.checks.filter((c) => c.group === g.id);
    if (!list.length) return null;
    const bad = list.filter((c) => c.status === 'fail' || c.status === 'warn').length;
    return h('details', { class: 'sa-group', open: bad > 0 },
      h('summary', {}, h('span', { text: g.name }), h('span', { class: `sa-group-count${bad ? ' is-bad' : ''}`, text: bad ? `${bad} ${plural(bad, 'замечание', 'замечания', 'замечаний')}` : 'всё в порядке' })),
      h('ul', { class: 'sa-checks' }, list.map((c) =>
        h('li', { class: `sa-check sa-check--${c.status}` },
          badge(c.status),
          h('div', {}, h('b', { text: c.title }), h('span', { class: 'sa-check-value', text: c.value }), c.advice && c.status !== 'ok' ? h('p', { class: 'hint', text: c.advice }) : null),
        ),
      )),
    );
  }));
}

function render() {
  actions.clear();
  renderSummary();
  renderFacts();
  renderIssues();
  renderTools();
  renderGroups();
}

// ---------- Действия ----------

function openTool(t) {
  if (t.id === 'keyword-finder') {
    const seed = report.facts.seed.split(/\s+/).slice(0, 4).join(' ');
    reachGoal('audit_tool_click', () => (location.href = `/keyword-finder${seed ? `#q=${encodeURIComponent(seed)}` : ''}`));
  } else if (t.state) openWithState(t.id, t.state, 'audit_tool_click');
  else reachGoal('audit_tool_click', () => (location.href = `/${t.id}`));
}

document.addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (btn && actions.has(btn)) openTool(actions.get(btn));
});

form.addEventListener('submit', (e) => {
  e.preventDefault();
  run(input.value);
});

$('[data-action="again"]').addEventListener('click', () => run(input.value || data?.input, { fresh: true }));

$('[data-action="share"]').addEventListener('click', async () => {
  if (!data) return;
  await copyText(`${location.origin}/seo-audit#url=${encodeURIComponent(input.value.trim() || data.input)}`, 'Ссылка на проверку скопирована');
  reachGoal('share_link');
});

$('[data-action="csv"]').addEventListener('click', () => {
  if (!report) return;
  const group = Object.fromEntries(GROUPS.map((g) => [g.id, g.name]));
  downloadCsv([
    ['Адрес', data.url, 'Оценка', report.score, report.grade.label],
    [],
    ['Раздел', 'Проверка', 'Статус', 'Значение', 'Что сделать'],
    ...report.checks.map((c) => [group[c.group], c.title, STATUS[c.status], c.value, c.advice || '']),
  ], `seo-audit-${new URL(data.url).hostname}.csv`);
});

// Адрес из ссылки: /seo-audit#url=… (кнопка «Поделиться», форма на главной) или ?url=… (форма без JavaScript).
function fromLink(search = true) {
  const raw = location.hash.match(/^#url=(.+)$/)?.[1] || (search && new URLSearchParams(location.search).get('url'));
  if (!raw) return;
  let value = raw;
  try {
    value = decodeURIComponent(raw);
  } catch {
    /* оставляем как есть */
  }
  if (value === input.value.trim() && (running || data)) return;
  input.value = value;
  run(value);
}

window.addEventListener('hashchange', () => fromLink(false));
fromLink();
