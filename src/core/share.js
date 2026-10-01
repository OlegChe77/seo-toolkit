// Ссылки на результат: состояние инструмента сжимается и записывается в адрес после «#s=».
// Часть адреса после # браузер не отправляет на сервер, а в Метрику уходит адрес без неё,
// поэтому данные из ссылки видит только тот, у кого есть сама ссылка.
import { copyText } from './clipboard.js';
import { reachGoal } from './goals.js';
import { receiveState } from './handoff.js';
import { toast } from './toast.js';

const LONG_LINK = 8000; // длиннее — некоторые мессенджеры могут обрезать ссылку

function toBase64Url(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(str) {
  const s = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

async function pipe(bytes, stream) {
  const res = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await res.arrayBuffer());
}

/** Объект → строка для адреса. «z» — сжато deflate, «j» — без сжатия (старые браузеры). */
export async function encodeState(data) {
  const bytes = new TextEncoder().encode(JSON.stringify(data));
  if (typeof CompressionStream === 'function') return `z${toBase64Url(await pipe(bytes, new CompressionStream('deflate-raw')))}`;
  return `j${toBase64Url(bytes)}`;
}

export async function decodeState(str) {
  let bytes = fromBase64Url(str.slice(1));
  if (str[0] === 'z') bytes = await pipe(bytes, new DecompressionStream('deflate-raw'));
  else if (str[0] !== 'j') throw new Error('Неизвестный формат ссылки');
  return JSON.parse(new TextDecoder().decode(bytes));
}

const clearHash = () => history.replaceState(null, '', location.pathname + location.search);

/**
 * Подключает кнопки [data-action="share"] и восстанавливает состояние из ссылки.
 * getState() возвращает данные для ссылки (или null, если результата ещё нет),
 * setState(data) восстанавливает их. Возвращает Promise<boolean> — открыт ли результат из ссылки.
 */
export function initShare({ tool, getState, setState }) {
  document.addEventListener('click', async (e) => {
    if (!e.target.closest('[data-action="share"]')) return;
    const data = getState();
    if (!data) {
      toast('Сначала получите результат — пока делиться нечем', 'error');
      return;
    }
    try {
      const hash = `#s=${await encodeState({ v: 1, t: tool, d: data })}`;
      const url = `${location.origin}${location.pathname}${hash}`;
      history.replaceState(null, '', hash);
      const copied = await copyText(url, 'Ссылка на результат скопирована');
      if (copied && url.length > LONG_LINK) {
        toast(`Ссылка длинная (${Math.round(url.length / 1024)} КБ): некоторые мессенджеры могут её обрезать`, 'info', 5000);
      }
      reachGoal('share_link');
    } catch {
      toast('Не удалось создать ссылку', 'error');
    }
  });

  return (async () => {
    const m = location.hash.match(/^#s=([A-Za-z0-9_-]+)$/);
    if (!m) {
      // Данные, переданные из SEO-анализа сайта (openWithState в handoff.js).
      const state = receiveState(tool);
      if (state == null) return false;
      try {
        await setState(state);
        toast('Данные из SEO-анализа сайта', 'info');
        return true;
      } catch {
        return false;
      }
    }
    try {
      const payload = await decodeState(m[1]);
      if (payload?.t !== tool || payload.d == null) throw new Error('Ссылка от другого инструмента');
      await setState(payload.d);
      toast('Открыт результат из ссылки', 'info');
      // Как только данные начинают меняться, ссылка в адресе устаревает — убираем её.
      const onEdit = () => {
        clearHash();
        document.removeEventListener('input', onEdit, true);
      };
      document.addEventListener('input', onEdit, true);
      return true;
    } catch {
      clearHash();
      toast('Ссылка повреждена или устарела', 'error');
      return false;
    }
  })();
}
