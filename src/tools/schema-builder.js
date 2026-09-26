import '../core/app.js';
import '../styles/tools/schema.css';
import { copyText } from '../core/clipboard.js';
import { downloadFile } from '../core/csv.js';
import { $, h } from '../core/dom.js';
import { highlightJsonLdScript } from '../core/highlight.js';
import { storage } from '../core/storage.js';
import { toast } from '../core/toast.js';
import { icon } from '../layout/icons.js';
import { clean, SCHEMA_TYPES, splitLines } from './schema/types.js';

const typeEl = $('#sb-type');
const form = $('[data-form]');
const wrapEl = $('#sb-wrap');
const outputEl = $('[data-output]');
const issuesEl = $('[data-issues]');
const URL_LIST_KEYS = new Set(['image', 'sameAs']);

const byId = (id) => SCHEMA_TYPES.find((t) => t.id === id) || SCHEMA_TYPES[0];

function defaults(def) {
  const v = {};
  for (const f of def.fields) {
    if (f.type === 'select' && f.noEmpty) v[f.key] = f.options[0][0];
    if (f.type === 'list') v[f.key] = Array.from({ length: f.min || 1 }, () => ({}));
  }
  return v;
}

const saved = storage.get('schema:state', null);
const state = {
  type: byId(saved?.type).id,
  values: saved?.values && typeof saved.values === 'object' ? saved.values : {},
  wrap: saved?.wrap ?? true,
};
wrapEl.checked = state.wrap;

const current = () => byId(state.type);
function values() {
  if (!state.values[state.type]) state.values[state.type] = defaults(current());
  return state.values[state.type];
}

typeEl.replaceChildren(...SCHEMA_TYPES.map((t) => h('option', { value: t.id, text: t.label })));
typeEl.value = state.type;

// ---------- Форма ----------
function renderField(f, value, data) {
  const id = data.list ? `sf-${data.list}-${data.index}-${f.key}` : `sf-${f.key}`;
  const full = f.full || f.type === 'textarea' || f.type === 'lines';
  const common = { id, dataset: data, 'aria-required': f.required ? 'true' : null };
  let control;
  if (f.type === 'textarea' || f.type === 'lines') {
    control = h('textarea', { ...common, class: 'textarea', rows: f.type === 'lines' ? 3 : 4, placeholder: f.placeholder || '' });
    control.value = value || '';
  } else if (f.type === 'select') {
    control = h(
      'select',
      { ...common, class: 'select' },
      f.noEmpty ? null : h('option', { value: '', text: '— не указано —' }),
      f.options.map(([val, label]) => h('option', { value: val, text: label })),
    );
    control.value = value || (f.noEmpty ? f.options[0][0] : '');
  } else {
    const type = { url: 'url', email: 'email', date: 'date', datetime: 'datetime-local' }[f.type] || 'text';
    control = h('input', {
      ...common,
      class: 'input',
      type,
      inputmode: f.type === 'number' ? 'decimal' : null,
      placeholder: f.placeholder || (f.type === 'url' ? 'https://' : ''),
      spellcheck: f.type === 'url' || f.type === 'email' ? 'false' : null,
    });
    control.value = value || '';
  }
  return h(
    'div',
    { class: `field${full ? ' field--full' : ''}` },
    h('label', { for: id }, f.label, f.required ? h('span', { class: 'req', 'aria-hidden': 'true', text: '*' }) : null),
    control,
    f.hint ? h('span', { class: 'hint', text: f.hint }) : null,
  );
}

function renderList(f, v) {
  const items = v[f.key] || (v[f.key] = []);
  return h(
    'div',
    { class: 'sb-list' },
    h('span', { class: 'label', text: f.label }),
    items.map((item, i) =>
      h(
        'div',
        { class: 'sb-item', role: 'group', 'aria-label': `${f.itemLabel} ${i + 1}` },
        h(
          'div',
          { class: 'sb-item-head' },
          h('span', { text: `${f.itemLabel} ${i + 1}` }),
          h('button', {
            type: 'button',
            class: 'btn btn-sm btn-ghost btn-danger',
            dataset: { action: 'remove-item', list: f.key, index: i },
            disabled: items.length <= 1,
            trustedHtml: `${icon('trash')}Удалить`,
          }),
        ),
        f.fields.map((sub) => renderField(sub, item[sub.key], { list: f.key, index: i, key: sub.key })),
      ),
    ),
    h('div', {}, h('button', { type: 'button', class: 'btn btn-sm', dataset: { action: 'add-item', list: f.key }, trustedHtml: `${icon('plus')}Добавить: ${f.itemLabel.toLowerCase()}` })),
  );
}

function visibleFields(def, v) {
  return def.fields.filter((f) => !f.showIf || f.showIf(v));
}

function renderForm() {
  const def = current();
  const v = values();
  form.replaceChildren(
    ...visibleFields(def, v).map((f) => {
      if (f.section) return h('div', { class: 'sb-section', text: f.section });
      if (f.type === 'list') return renderList(f, v);
      return renderField(f, v[f.key], { key: f.key });
    }),
  );
}

// ---------- Генерация и проверка ----------
const isNumeric = (s) => /^-?\d+(\.\d+)?$/.test(String(s).trim());

function prepared(def, v) {
  const out = { ...v };
  for (const f of def.fields) if (f.type === 'number' && out[f.key] && isNumeric(out[f.key])) out[f.key] = Number(out[f.key]);
  return out;
}

function buildJson() {
  const def = current();
  const body = clean(def.build(prepared(def, values()))) || { '@type': def.id };
  // «</script>» внутри значения закрыл бы тег на странице; экранирование «\/» допустимо в JSON.
  return JSON.stringify({ '@context': 'https://schema.org', ...body }, null, 2).replace(/<\/(script)/gi, '<\\/$1');
}

const isUrl = (s) => /^https?:\/\/[^\s/?#]+\.[^\s]+$/i.test(String(s).trim()) || /^https?:\/\/localhost/i.test(String(s).trim());

function checkField(f, value, where, add) {
  const val = String(value ?? '').trim();
  const name = `${where}«${f.label}»`;
  if (f.required && !val) return add('bad', `Заполните обязательное поле ${name}.`);
  if (!val) return;
  if (f.type === 'url' && !isUrl(val)) add('warn', `${name}: укажите полный адрес, начиная с https://`);
  if (f.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) add('warn', `${name}: проверьте формат e-mail.`);
  if (f.type === 'number' && !isNumeric(val)) add('warn', `${name}: укажите число, дробную часть отделяйте точкой (например, 4990.50).`);
  if (f.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(val)) add('warn', `${name}: дата должна быть в формате ГГГГ-ММ-ДД.`);
  if (f.type === 'datetime' && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(val)) add('warn', `${name}: укажите дату и время.`);
  if (f.type === 'lines' && URL_LIST_KEYS.has(f.key)) {
    const bad = splitLines(val).filter((u) => !isUrl(u));
    if (bad.length) add('warn', `${name}: некорректные адреса — ${bad.slice(0, 3).join(', ')}${bad.length > 3 ? '…' : ''}`);
  }
}

function validate(json) {
  const def = current();
  const v = values();
  const list = [];
  const add = (type, text) => list.push({ type, text });

  try {
    JSON.parse(json);
    add('ok', 'JSON синтаксически корректен.');
  } catch (e) {
    add('bad', `Ошибка JSON: ${e.message}`);
  }

  for (const f of visibleFields(def, v)) {
    if (f.section) continue;
    if (f.type === 'list') {
      const items = v[f.key] || [];
      items.forEach((item, i) => f.fields.forEach((sub) => checkField(sub, item[sub.key], `${f.itemLabel} ${i + 1}: `, add)));
      continue;
    }
    checkField(f, v[f.key], '', add);
  }

  const has = (k) => String(v[k] ?? '').trim() !== '';
  if (def.id === 'Product') {
    if (!has('price') && !has('ratingValue')) add('info', 'Для расширенных результатов товара обычно нужны цена (Offer) или рейтинг.');
    if (has('price') && !has('priceCurrency')) add('warn', 'Укажите валюту цены.');
    if (has('ratingValue') !== has('reviewCount')) add('warn', 'Для рейтинга укажите и среднюю оценку, и количество отзывов.');
  }
  if (def.id === 'WebSite' && has('searchUrl') && !v.searchUrl.includes('{search_term_string}')) add('bad', 'Шаблон поиска должен содержать {search_term_string}.');
  if (def.id === 'BreadcrumbList') {
    const items = (v.items || []).filter((it) => it.name);
    if (items.length < 2) add('warn', 'Цепочка обычно содержит минимум два уровня.');
    if (items.slice(0, -1).some((it) => !String(it.item || '').trim())) add('warn', 'Для всех уровней, кроме последнего, укажите URL.');
  }
  if (def.id === 'Event') {
    if (has('startDate') && has('endDate') && v.endDate < v.startDate) add('warn', 'Окончание раньше начала мероприятия.');
    if (has('startDate') && !has('timezone')) add('info', 'Укажите часовой пояс, чтобы время события трактовалось однозначно.');
    if (has('price') && !has('priceCurrency')) add('warn', 'Укажите валюту цены билета.');
  }
  if (def.id === 'LocalBusiness' && has('latitude') !== has('longitude')) add('warn', 'Для координат укажите и широту, и долготу.');

  const problems = list.filter((i) => i.type === 'bad' || i.type === 'warn').length;
  if (!problems) add('ok', 'Обязательные поля заполнены, форматы значений корректны.');
  return list;
}

function update() {
  const json = buildJson();
  outputEl.innerHTML = highlightJsonLdScript(json, wrapEl.checked);
  issuesEl.replaceChildren(
    ...validate(json).map((i) =>
      h('li', { class: `issue issue--${i.type}`, trustedHtml: icon(i.type === 'ok' ? 'check' : i.type === 'info' ? 'info' : 'alert') }, h('span', { text: i.text })),
    ),
  );
  state.wrap = wrapEl.checked;
  storage.set('schema:state', state);
}

// ---------- События ----------
function onValue(e) {
  const { key, list, index } = e.target.dataset;
  if (!key) return;
  const v = values();
  if (list) v[list][+index][key] = e.target.value;
  else v[key] = e.target.value;
  const def = current();
  if (!list && def.fields.find((f) => f.key === key)?.rerender) renderForm();
  update();
}

form.addEventListener('input', onValue);
form.addEventListener('change', onValue);

form.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const v = values();
  const items = v[btn.dataset.list];
  if (btn.dataset.action === 'add-item') {
    items.push({});
    renderForm();
    form.querySelector(`[data-key][data-list="${btn.dataset.list}"][data-index="${items.length - 1}"]`)?.focus();
  } else if (btn.dataset.action === 'remove-item' && items.length > 1) {
    items.splice(+btn.dataset.index, 1);
    renderForm();
  }
  update();
});

typeEl.addEventListener('change', () => {
  state.type = typeEl.value;
  renderForm();
  update();
});

wrapEl.addEventListener('change', update);

$('[data-action="reset"]').addEventListener('click', () => {
  state.values[state.type] = defaults(current());
  renderForm();
  update();
  toast('Форма очищена', 'info');
});

$('[data-action="copy"]').addEventListener('click', () => {
  const json = buildJson();
  const text = wrapEl.checked ? `<script type="application/ld+json">\n${json}\n</script>` : json;
  copyText(text, 'Код JSON-LD скопирован');
});

$('[data-action="download"]').addEventListener('click', () => {
  downloadFile(`${buildJson()}\n`, `schema-${state.type.toLowerCase()}.json`, 'application/ld+json;charset=utf-8');
  toast(`Файл schema-${state.type.toLowerCase()}.json сохранён`);
});

renderForm();
update();
