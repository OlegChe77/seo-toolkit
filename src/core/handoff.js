// Передача данных в другой инструмент: результат цепочки (Keyword Finder → IntentFinder → KeyCluster)
// или готовое состояние инструмента из SEO-анализа сайта. Данные кладутся в sessionStorage текущей
// вкладки: большие списки не упираются в длину адреса и никуда не отправляются.
import { reachGoal } from './goals.js';
import { toast } from './toast.js';

const KEY = 'seotk:handoff';
const STATE_KEY = 'seotk:prefill'; // состояние в формате ссылки «Поделиться», см. share.js
const TTL = 30 * 60 * 1000;

function put(key, toolId, payload, goal) {
  try {
    sessionStorage.setItem(key, JSON.stringify({ to: toolId, at: Date.now(), payload }));
  } catch {
    toast('Данных слишком много для передачи — скопируйте их и вставьте вручную', 'error');
    return;
  }
  reachGoal(goal || `handoff_${toolId}`, () => {
    location.href = `/${toolId}`;
  });
}

function take(key, toolId) {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const item = JSON.parse(raw);
    if (item.to !== toolId || Date.now() - item.at > TTL) return null;
    sessionStorage.removeItem(key);
    return item.payload;
  } catch {
    return null;
  }
}

/** Сохраняет данные и открывает страницу инструмента toolId. */
export const sendTo = (toolId, payload, goal) => put(KEY, toolId, payload, goal);

/** Забирает данные, переданные этому инструменту (один раз). */
export const receive = (toolId) => take(KEY, toolId);

/** Открывает инструмент с готовым состоянием (то же, что восстанавливается из ссылки «Поделиться»). */
export const openWithState = (toolId, state, goal) => put(STATE_KEY, toolId, state, goal);

export const receiveState = (toolId) => take(STATE_KEY, toolId);
