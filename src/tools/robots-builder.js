import '../core/app.js';
import { initShare } from '../core/share.js';
import '../styles/tools/robots.css';
import { copyText } from '../core/clipboard.js';
import { downloadFile } from '../core/csv.js';
import { $, h } from '../core/dom.js';
import { highlightRobots } from '../core/highlight.js';
import { storage } from '../core/storage.js';
import { toast } from '../core/toast.js';
import { icon } from '../layout/icons.js';

const rule = (type, path) => ({ type, path });
const group = (agents, rules = [], crawlDelay = '') => ({ agents, rules, crawlDelay });

const TEMPLATES = {
  'allow-all': [group(['*'], [rule('Disallow', '')])],
  'disallow-all': [group(['*'], [rule('Disallow', '/')])],
  service: [
    group(['*'], [
      rule('Disallow', '/admin/'),
      rule('Disallow', '/login/'),
      rule('Disallow', '/tmp/'),
      rule('Disallow', '/search/'),
      rule('Disallow', '/*?utm_'),
      rule('Disallow', '/*&utm_'),
    ]),
  ],
  wordpress: [
    group(['*'], [
      rule('Disallow', '/wp-admin/'),
      rule('Allow', '/wp-admin/admin-ajax.php'),
      rule('Disallow', '/wp-login.php'),
      rule('Disallow', '/*?s='),
      rule('Disallow', '/search/'),
      rule('Disallow', '/*?replytocom='),
      rule('Disallow', '/feed/'),
    ]),
  ],
  shop: [
    group(['*'], [
      rule('Disallow', '/cart/'),
      rule('Disallow', '/checkout/'),
      rule('Disallow', '/account/'),
      rule('Disallow', '/search/'),
      rule('Disallow', '/*?sort='),
      rule('Disallow', '/*&sort='),
      rule('Disallow', '/*?filter='),
      rule('Disallow', '/compare/'),
    ]),
  ],
  ai: [
    group(['*'], [rule('Disallow', '')]),
    group(['GPTBot', 'ChatGPT-User', 'CCBot', 'Google-Extended', 'ClaudeBot', 'PerplexityBot', 'Bytespider'], [rule('Disallow', '/')]),
  ],
};

const DEFAULT_STATE = () => ({ groups: [group(['*'], [rule('Disallow', '')])], sitemaps: [''] });

let state = storage.get('robots:state', null) || DEFAULT_STATE();
if (!Array.isArray(state.groups) || !Array.isArray(state.sitemaps)) state = DEFAULT_STATE();

const groupsEl = $('[data-groups]');
const sitemapsEl = $('[data-sitemaps]');
const outputEl = $('[data-output]');
const issuesEl = $('[data-issues]');

const iconBtn = (label, action, extra = {}) =>
  h('button', {
    type: 'button',
    class: 'btn btn-sm btn-ghost btn-icon btn-danger',
    'aria-label': label,
    title: label,
    trustedHtml: icon('x'),
    dataset: { action, ...extra },
  });

function renderGroups() {
  groupsEl.replaceChildren(
    ...state.groups.map((g, gi) =>
      h(
        'div',
        { class: 'rb-group', dataset: { g: gi } },
        h(
          'div',
          { class: 'rb-group-head' },
          h('span', { class: 'rb-group-title', text: `Группа ${gi + 1}` }),
          h('button', {
            type: 'button',
            class: 'btn btn-sm btn-ghost btn-danger',
            dataset: { action: 'remove-group', g: gi },
            trustedHtml: `${icon('trash')}Удалить группу`,
          }),
        ),
        h(
          'div',
          { class: 'field' },
          h('span', { class: 'label', text: 'User-agent' }),
          h(
            'div',
            { class: 'rb-agents' },
            g.agents.length
              ? g.agents.map((a, ai) =>
                  h(
                    'span',
                    { class: 'rb-agent' },
                    a,
                    h('button', {
                      type: 'button',
                      'aria-label': `Удалить ${a}`,
                      trustedHtml: icon('x'),
                      dataset: { action: 'remove-agent', g: gi, a: ai },
                    }),
                  ),
                )
              : h('span', { class: 'hint', text: 'Добавьте хотя бы одного робота' }),
          ),
          h(
            'div',
            { class: 'rb-add-agent' },
            h('input', {
              class: 'input input--sm',
              type: 'text',
              list: 'rb-agents',
              placeholder: 'Googlebot, Yandex, * …',
              'aria-label': `Добавить User-agent в группу ${gi + 1}`,
              dataset: { agentInput: gi },
            }),
            h('button', {
              type: 'button',
              class: 'btn btn-sm',
              dataset: { action: 'add-agent', g: gi },
              trustedHtml: `${icon('plus')}Добавить`,
            }),
          ),
        ),
        h(
          'div',
          { class: 'field' },
          h('span', { class: 'label', text: 'Правила' }),
          h(
            'div',
            { class: 'rb-rules' },
            g.rules.map((r, ri) =>
              h(
                'div',
                { class: 'rb-rule' },
                h(
                  'select',
                  {
                    class: 'select select--sm',
                    'aria-label': 'Тип правила',
                    dataset: { field: 'type', g: gi, r: ri },
                  },
                  ['Disallow', 'Allow'].map((t) => h('option', { value: t, text: t, selected: r.type === t })),
                ),
                h('input', {
                  class: 'input input--sm',
                  type: 'text',
                  value: r.path,
                  placeholder: '/admin/',
                  spellcheck: 'false',
                  'aria-label': 'Путь',
                  dataset: { field: 'path', g: gi, r: ri },
                }),
                iconBtn('Удалить правило', 'remove-rule', { g: gi, r: ri }),
              ),
            ),
          ),
        ),
        h(
          'div',
          { class: 'rb-foot' },
          h('button', {
            type: 'button',
            class: 'btn btn-sm',
            dataset: { action: 'add-rule', g: gi },
            trustedHtml: `${icon('plus')}Добавить правило`,
          }),
          h(
            'label',
            { class: 'rb-delay' },
            'Crawl-delay',
            h('input', {
              class: 'input input--sm',
              type: 'text',
              inputmode: 'decimal',
              value: g.crawlDelay,
              placeholder: 'сек.',
              dataset: { field: 'crawlDelay', g: gi },
            }),
          ),
        ),
      ),
    ),
  );
}

function renderSitemaps() {
  sitemapsEl.replaceChildren(
    ...state.sitemaps.map((s, si) =>
      h(
        'div',
        { class: 'rb-sitemap' },
        h('input', {
          class: 'input input--sm',
          type: 'text',
          inputmode: 'url',
          value: s,
          placeholder: 'https://example.com/sitemap.xml',
          spellcheck: 'false',
          'aria-label': `Sitemap ${si + 1}`,
          dataset: { field: 'sitemap', s: si },
        }),
        iconBtn('Удалить Sitemap', 'remove-sitemap', { s: si }),
      ),
    ),
  );
}

function generate() {
  const blocks = state.groups.map((g) => {
    const lines = g.agents.map((a) => `User-agent: ${a}`);
    const rules = g.rules.filter((r) => r.type === 'Disallow' || r.path.trim());
    if (!rules.length) lines.push('Disallow:');
    for (const r of rules) lines.push(`${r.type}: ${r.path.trim()}`.trimEnd());
    if (String(g.crawlDelay).trim()) lines.push(`Crawl-delay: ${String(g.crawlDelay).trim()}`);
    return lines.join('\n');
  });
  const sitemaps = state.sitemaps.map((s) => s.trim()).filter(Boolean);
  let text = blocks.join('\n\n');
  if (sitemaps.length) text += `${text ? '\n\n' : ''}${sitemaps.map((s) => `Sitemap: ${s}`).join('\n')}`;
  return `${text}\n`;
}

function validate() {
  const out = [];
  const add = (type, text) => out.push({ type, text });
  if (!state.groups.length) add('bad', 'Нет ни одной группы правил. Добавьте группу User-agent.');
  const agentSeen = new Map();

  state.groups.forEach((g, gi) => {
    const n = `Группа ${gi + 1}`;
    if (!g.agents.length) add('bad', `${n}: не указан User-agent.`);
    for (const a of g.agents) {
      const key = a.toLowerCase();
      if (agentSeen.has(key)) add('warn', `User-agent «${a}» указан в группах ${agentSeen.get(key)} и ${gi + 1}. Лучше объединить правила в одну группу.`);
      else agentSeen.set(key, gi + 1);
    }
    const seen = new Set();
    const byPath = new Map();
    for (const r of g.rules) {
      const p = r.path.trim();
      if (!p) {
        if (r.type === 'Allow') add('warn', `${n}: пустое правило Allow пропущено.`);
        continue;
      }
      if (!/^[/*]/.test(p)) add('bad', `${n}: путь «${p}» должен начинаться с «/» или «*».`);
      if (/\s/.test(p)) add('bad', `${n}: путь «${p}» содержит пробелы.`);
      if (/[^\x20-\x7E]/.test(p)) add('warn', `${n}: путь «${p}» содержит не-ASCII символы. Рекомендуется URL-кодирование: ${encodeURI(p)}`);
      if (p.includes('$') && !p.endsWith('$')) add('warn', `${n}: символ «$» в пути «${p}» имеет смысл только в конце.`);
      if (/^https?:\/\//i.test(p)) add('bad', `${n}: указывайте путь без домена (например, /page/), а не «${p}».`);
      const key = `${r.type}:${p}`;
      if (seen.has(key)) add('warn', `${n}: правило «${r.type}: ${p}» повторяется.`);
      seen.add(key);
      if (byPath.has(p) && byPath.get(p) !== r.type) add('warn', `${n}: для пути «${p}» заданы и Allow, и Disallow — такое правило неоднозначно.`);
      byPath.set(p, r.type);
      if (r.type === 'Disallow' && p === '/' && g.agents.includes('*')) add('warn', 'Для всех роботов (User-agent: *) закрыт весь сайт — страницы не будут сканироваться.');
    }
    const delay = String(g.crawlDelay).trim();
    if (delay) {
      if (!/^\d+(\.\d+)?$/.test(delay)) add('bad', `${n}: Crawl-delay должен быть числом (секунды).`);
      else add('info', `${n}: Crawl-delay учитывают не все роботы — например, Googlebot его игнорирует.`);
    }
  });

  const sitemaps = state.sitemaps.map((s) => s.trim()).filter(Boolean);
  for (const s of sitemaps) {
    let ok = false;
    try {
      ok = /^https?:$/.test(new URL(s).protocol);
    } catch {
      ok = false;
    }
    if (!ok) add('bad', `Sitemap «${s}» — нужен полный URL, начинающийся с https://`);
  }
  if (!sitemaps.length) add('info', 'Рекомендуется указать адрес карты сайта (Sitemap).');

  const size = new Blob([generate()]).size;
  if (size > 500 * 1024) add('bad', 'Размер файла больше 500 КБ — часть правил может быть проигнорирована.');

  if (!out.some((i) => i.type === 'bad' || i.type === 'warn')) out.unshift({ type: 'ok', text: 'Ошибок не найдено.' });
  return out;
}

function update() {
  const text = generate();
  outputEl.innerHTML = highlightRobots(text.trimEnd());
  issuesEl.replaceChildren(
    ...validate().map((i) =>
      h(
        'li',
        { class: `issue issue--${i.type}`, trustedHtml: icon(i.type === 'ok' ? 'check' : i.type === 'info' ? 'info' : 'alert') },
        h('span', { text: i.text }),
      ),
    ),
  );
  storage.set('robots:state', state);
}

function renderAll() {
  renderGroups();
  renderSitemaps();
  update();
}

function addAgent(gi) {
  const input = groupsEl.querySelector(`[data-agent-input="${gi}"]`);
  const values = input.value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
  if (!values.length) {
    input.focus();
    return;
  }
  const g = state.groups[gi];
  for (const v of values) if (!g.agents.some((a) => a.toLowerCase() === v.toLowerCase())) g.agents.push(v);
  renderAll();
  groupsEl.querySelector(`[data-agent-input="${gi}"]`)?.focus();
}

document.addEventListener('input', (e) => {
  const { field, g, r, s } = e.target.dataset;
  if (!field) return;
  if (field === 'sitemap') state.sitemaps[+s] = e.target.value;
  else if (field === 'crawlDelay') state.groups[+g].crawlDelay = e.target.value;
  else state.groups[+g].rules[+r][field] = e.target.value;
  update();
});

groupsEl.addEventListener('change', (e) => {
  if (e.target.dataset.field === 'type') {
    const { g, r } = e.target.dataset;
    state.groups[+g].rules[+r].type = e.target.value;
    update();
  }
});

groupsEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.dataset.agentInput != null) {
    e.preventDefault();
    addAgent(+e.target.dataset.agentInput);
  }
});

document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const { action, g, r, a, s } = btn.dataset;
  switch (action) {
    case 'add-group':
      state.groups.push(group([], [rule('Disallow', '')]));
      renderAll();
      groupsEl.querySelector(`[data-agent-input="${state.groups.length - 1}"]`)?.focus();
      return;
    case 'remove-group':
      state.groups.splice(+g, 1);
      break;
    case 'add-agent':
      return addAgent(+g);
    case 'remove-agent':
      state.groups[+g].agents.splice(+a, 1);
      break;
    case 'add-rule':
      state.groups[+g].rules.push(rule('Disallow', ''));
      renderAll();
      groupsEl.querySelectorAll(`[data-field="path"][data-g="${g}"]`).forEach((el, i, all) => i === all.length - 1 && el.focus());
      return;
    case 'remove-rule':
      state.groups[+g].rules.splice(+r, 1);
      break;
    case 'add-sitemap':
      state.sitemaps.push('');
      renderAll();
      sitemapsEl.querySelector('.rb-sitemap:last-child input')?.focus();
      return;
    case 'remove-sitemap':
      state.sitemaps.splice(+s, 1);
      break;
    case 'reset':
      state = DEFAULT_STATE();
      toast('Настройки сброшены', 'info');
      break;
    case 'copy':
      return copyText(generate(), 'robots.txt скопирован');
    case 'download':
      downloadFile(generate(), 'robots.txt', 'text/plain;charset=utf-8');
      return toast('Файл robots.txt сохранён');
    default:
      return;
  }
  renderAll();
});

$('#rb-template').addEventListener('change', (e) => {
  const tpl = TEMPLATES[e.target.value];
  if (!tpl) return;
  state.groups = structuredClone(tpl);
  if (!state.sitemaps.length) state.sitemaps = [''];
  e.target.value = '';
  renderAll();
  toast('Шаблон применён. Sitemap сохранён без изменений', 'info');
});

renderAll();

initShare({
  tool: 'robots-builder',
  getState: () => ({ g: state.groups, s: state.sitemaps }),
  setState: (d) => {
    if (!Array.isArray(d.g)) throw new Error('Некорректные данные');
    state = {
      groups: d.g.map((g) => ({
        agents: (g.agents || []).map(String),
        rules: (g.rules || []).map((r) => ({ type: r.type === 'Allow' ? 'Allow' : 'Disallow', path: String(r.path || '') })),
        crawlDelay: String(g.crawlDelay || ''),
      })),
      sitemaps: Array.isArray(d.s) && d.s.length ? d.s.map(String) : [''],
    };
    renderAll();
  },
});
