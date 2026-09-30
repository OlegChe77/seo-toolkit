// Передача результата в следующий инструмент (Keyword Finder → IntentFinder → KeyCluster).
// Данные кладутся в sessionStorage текущей вкладки: большие списки не упираются в длину адреса
// и никуда не отправляются.
import { reachGoal } from './goals.js';
import { toast } from './toast.js';

const KEY = 'seotk:handoff';
const TTL = 30 * 60 * 1000;

/** Сохраняет данные и открывает страницу инструмента toolId. */
export function sendTo(toolId, payload, goal) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ to: toolId, at: Date.now(), payload }));
  } catch {
    toast('Список слишком большой для передачи — скопируйте его и вставьте вручную', 'error');
    return;
  }
  reachGoal(goal || `handoff_${toolId}`, () => {
    location.href = `/${toolId}`;
  });
}

/** Забирает данные, переданные этому инструменту (один раз). */
export function receive(toolId) {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const item = JSON.parse(raw);
    if (item.to !== toolId || Date.now() - item.at > TTL) return null;
    sessionStorage.removeItem(KEY);
    return item.payload;
  } catch {
    return null;
  }
}
