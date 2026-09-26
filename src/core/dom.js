export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Создаёт DOM-элемент. Текст всегда вставляется как текст (безопасно).
 * attrs: class, text, dataset, style, on<Event>, trustedHtml (только для своих SVG-иконок),
 * остальные — как атрибуты/свойства.
 */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value == null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'text') el.textContent = value;
    else if (key === 'trustedHtml') el.innerHTML = value;
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key in el && typeof value !== 'string') el[key] = value;
    else el.setAttribute(key, value === true ? '' : value);
  }
  append(el, children);
  return el;
}

/** Заменяет содержимое элемента; null, false и пустые значения пропускаются. */
export function fill(el, ...children) {
  el.replaceChildren();
  append(el, children);
  return el;
}

function append(el, children) {
  for (const child of children) {
    if (child == null || child === false || child === '') continue;
    if (Array.isArray(child)) append(el, child);
    else el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

export function debounce(fn, ms = 200) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

const nf = new Intl.NumberFormat('ru-RU');
export const fmt = (n) => nf.format(n);
export const fmtPct = (n, digits = 1) =>
  `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(n)}%`;

export function plural(n, one, few, many) {
  const n10 = n % 10;
  const n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return one;
  if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return few;
  return many;
}

/** Пошаговая обработка большого массива без блокировки интерфейса. */
export async function processInChunks(items, fn, chunk = 2000, onProgress) {
  const out = new Array(items.length);
  for (let i = 0; i < items.length; i += chunk) {
    const end = Math.min(i + chunk, items.length);
    for (let j = i; j < end; j++) out[j] = fn(items[j], j);
    onProgress?.(end, items.length);
    if (end < items.length) await new Promise((r) => setTimeout(r, 0));
  }
  return out;
}

/** Строки текста без пустых. */
export const lines = (text) =>
  String(text || '')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
