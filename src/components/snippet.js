// Пример поискового сниппета (для SERP Preview и MetaLength).
import '../styles/snippet.css';
import { h } from '../core/dom.js';
import { FONTS, truncateToWidth } from '../core/measure.js';

export const SNIPPET_LIMITS = {
  desktop: { title: 600, description: 920 },
  mobile: { title: 620, description: 680 },
};

export function parseDisplayUrl(raw) {
  const value = String(raw || '').trim();
  if (!value) return null;
  try {
    const url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(value) ? value : `https://${value}`);
    const host = url.hostname.replace(/^www\./, '');
    const segments = url.pathname
      .split('/')
      .filter(Boolean)
      .map((s) => {
        try {
          return decodeURIComponent(s);
        } catch {
          return s;
        }
      });
    return { url, host, origin: `${url.protocol}//${url.hostname}`, segments };
  } catch {
    return null;
  }
}

export function renderSnippet(container, { title, description, url, device = 'desktop', limits: custom }) {
  const limits = { ...SNIPPET_LIMITS[device], ...(custom || {}) };
  const parsed = parseDisplayUrl(url);
  const host = parsed?.host || 'example.com';
  const crumbs = parsed ? [parsed.origin, ...parsed.segments].join(' › ') : 'https://example.com › страница';

  const titleText = title?.trim() || 'Заголовок страницы (Title)';
  const descText = description?.trim() || 'Описание страницы (Description). Введите текст, чтобы увидеть пример сниппета.';
  const t = device === 'desktop' ? truncateToWidth(titleText, FONTS.title, limits.title) : { text: titleText };
  const d = truncateToWidth(descText, FONTS.description, limits.description);

  const card = h(
    'div',
    { class: `snippet snippet--${device}` },
    h(
      'div',
      { class: 'snippet-site' },
      h('span', { class: 'snippet-favicon', 'aria-hidden': 'true', text: host.charAt(0).toUpperCase() }),
      h(
        'span',
        { class: 'snippet-site-text' },
        h('span', { class: 'snippet-site-name', text: host }),
        h('span', { class: 'snippet-crumbs', text: crumbs }),
      ),
    ),
    h('div', { class: `snippet-title${title?.trim() ? '' : ' is-placeholder'}`, text: t.text }),
    h('div', { class: `snippet-desc${description?.trim() ? '' : ' is-placeholder'}`, text: d.text }),
  );
  container.replaceChildren(card);
  fit(container);
  return { titleTruncated: !!t.truncated, descriptionTruncated: !!d.truncated };
}

// Десктопный сниппет имеет фиксированную ширину 600 px; в узкой колонке уменьшаем его масштаб.
const observed = new WeakSet();
function fit(container) {
  const card = container.firstElementChild;
  if (!card) return;
  const avail = container.clientWidth;
  card.style.zoom = card.classList.contains('snippet--desktop') && avail && avail < 600 ? String(avail / 600) : '';
  if (!observed.has(container) && 'ResizeObserver' in window) {
    observed.add(container);
    new ResizeObserver(() => fit(container)).observe(container);
  }
}
