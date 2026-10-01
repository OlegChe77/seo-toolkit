// Будит сервер подсказок Яндекса (server/) заранее, с любой страницы сайта: бесплатный сервис Render
// засыпает после 15 минут простоя и просыпается до минуты. Запрос пустой — без данных пользователя.
const API = typeof __SUGGEST_API__ === 'string' ? __SUGGEST_API__.replace(/\/+$/, '') : '';
const KEY = 'seotk:wake';
const EVERY = 5 * 60 * 1000; // чаще не нужно: сервер засыпает только через 15 минут

export function wakeSuggestApi() {
  if (!API) return;
  try {
    if (Date.now() - Number(sessionStorage.getItem(KEY) || 0) < EVERY) return;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    // sessionStorage недоступен — просто будим при каждом открытии страницы
  }
  // no-cors: ответ не нужен, а запрос с адресов не из ALLOWED_ORIGINS (локальная сборка) не сыплет ошибками CORS.
  fetch(`${API}/healthz`, { mode: 'no-cors', cache: 'no-store' }).catch(() => {});
}
