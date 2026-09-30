// Общая инициализация каждой страницы: стили, тема, меню.
import '../styles/main.css';
import { initConsent } from './consent.js';
import { initGoalLinks } from './goals.js';
import { storage } from './storage.js';
import { wakeSuggestApi } from './wake.js';

function initTheme() {
  const btn = document.querySelector('[data-theme-toggle]');
  if (!btn) return;
  const root = document.documentElement;
  const sync = () => {
    const dark = root.dataset.theme === 'dark';
    btn.setAttribute('aria-pressed', String(dark));
    btn.setAttribute('aria-label', dark ? 'Включить светлую тему' : 'Включить тёмную тему');
    btn.title = btn.getAttribute('aria-label');
  };
  btn.addEventListener('click', () => {
    root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
    storage.set('theme', root.dataset.theme);
    sync();
  });
  sync();
}

function initNav() {
  const menu = document.querySelector('[data-nav-menu]');
  if (!menu) return;
  document.addEventListener('click', (e) => {
    if (menu.open && !menu.contains(e.target)) menu.open = false;
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && menu.open) {
      menu.open = false;
      menu.querySelector('summary')?.focus();
    }
  });
  menu.addEventListener('toggle', () => {
    // На мобильных меню занимает весь экран — блокируем прокрутку страницы.
    const full = window.matchMedia('(max-width: 767px)').matches;
    document.body.style.overflow = menu.open && full ? 'hidden' : '';
  });
}

initTheme();
initNav();
initConsent();
initGoalLinks();
wakeSuggestApi();
