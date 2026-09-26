// Согласие на cookie: плашка «Принять / Отклонить» и кнопка «Настройки cookie» в подвале.
// Счётчик Яндекс Метрики запускается только после согласия (см. metrikaScript в layout/templates.js).
import { h } from './dom.js';
import { storage } from './storage.js';

const KEY = 'cookie-consent'; // localStorage: seotk:cookie-consent

export const getConsent = () => storage.get(KEY, null);

function save(analytics) {
  storage.set(KEY, { analytics, date: new Date().toISOString().slice(0, 10) });
}

// Удаляет cookie Метрики (_ym_uid, _ym_d и т. п.) после отказа.
function clearMetrikaCookies() {
  const host = location.hostname;
  for (const part of document.cookie.split(';')) {
    const name = part.split('=')[0].trim();
    if (!/^_ym/.test(name)) continue;
    for (const domain of ['', `; domain=${host}`, `; domain=.${host}`]) {
      document.cookie = `${name}=; Max-Age=0; path=/${domain}`;
    }
  }
}

let banner = null;

function close() {
  banner?.remove();
  banner = null;
}

function show(fromSettings = false) {
  close();
  const current = getConsent();
  banner = h(
    'section',
    { class: 'cookie-banner ym-hide-content', role: 'region', 'aria-label': 'Согласие на использование cookie' },
    h('p', { class: 'cookie-title', text: 'Мы используем cookie' }),
    h(
      'p',
      { class: 'cookie-text' },
      'Cookie Яндекс Метрики помогают понять, какими инструментами пользуются чаще. Статистика обезличена, а тексты и файлы, которые вы вводите в инструменты, не собираются. ',
      h('a', { href: '/privacy', text: 'Подробнее' }),
    ),
    fromSettings && current
      ? h('p', { class: 'cookie-state', text: current.analytics ? 'Сейчас: статистика разрешена.' : 'Сейчас: статистика отключена.' })
      : null,
    h(
      'div',
      { class: 'cookie-actions' },
      h('button', { type: 'button', class: 'btn btn-primary btn-sm', dataset: { consent: 'accept' }, text: 'Принять' }),
      h('button', { type: 'button', class: 'btn btn-sm', dataset: { consent: 'decline' }, text: 'Отклонить' }),
    ),
  );
  document.body.append(banner);
  if (fromSettings) banner.querySelector('button').focus();
}

function accept() {
  save(true);
  close();
  window.seotkLoadMetrika?.();
}

function decline() {
  const wasTracking = Boolean(window.ym);
  save(false);
  clearMetrikaCookies();
  close();
  // Уже запущенный счётчик нельзя выгрузить со страницы — перезагружаем её без Метрики.
  if (wasTracking) location.reload();
}

export function initConsent() {
  // Плашка нужна только там, где подключён счётчик (продакшн-сборка).
  if (typeof window.seotkLoadMetrika !== 'function') return;
  for (const btn of document.querySelectorAll('[data-cookie-settings][hidden]')) btn.hidden = false;
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-consent], [data-cookie-settings]');
    if (!btn) return;
    if (btn.dataset.consent === 'accept') accept();
    else if (btn.dataset.consent === 'decline') decline();
    else show(true);
  });
  if (!getConsent()) show();
}
