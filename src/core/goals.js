// Цели Яндекс Метрики. Срабатывают, только если посетитель разрешил статистику
// (иначе счётчик не загружен и функция просто вызывает done).
export function reachGoal(name, done) {
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    done?.();
  };
  const id = window.seotkMetrikaId;
  if (typeof window.ym === 'function' && id) {
    try {
      window.ym(id, 'reachGoal', name, undefined, finish);
    } catch {
      /* счётчик недоступен — продолжаем без цели */
    }
    setTimeout(finish, 300); // не ждём Метрику дольше, чем нужно для отправки
  } else {
    finish();
  }
}

/** Элементы с атрибутом data-goal отправляют цель при клике. */
export function initGoalLinks() {
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-goal]');
    if (el) reachGoal(el.dataset.goal);
  });
}
