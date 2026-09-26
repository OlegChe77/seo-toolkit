import { icon } from '../layout/icons.js';
import { h } from './dom.js';

const ICONS = { success: 'check', error: 'alert', info: 'info' };

function container() {
  let el = document.querySelector('[data-toasts]');
  if (!el) {
    el = h('div', { class: 'toasts ym-hide-content', 'data-toasts': '', role: 'status', 'aria-live': 'polite' });
    document.body.append(el);
  }
  return el;
}

export function toast(message, type = 'success', timeout = 2600) {
  const el = h('div', { class: `toast toast--${type}` });
  el.innerHTML = icon(ICONS[type] || 'info');
  el.append(h('span', { text: message }));
  const box = container();
  box.append(el);
  while (box.children.length > 3) box.firstElementChild.remove();
  setTimeout(() => {
    el.classList.add('is-leaving');
    setTimeout(() => el.remove(), 220);
  }, timeout);
}
