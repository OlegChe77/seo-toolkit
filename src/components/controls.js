// Переиспользуемые элементы управления.
import { readTextFile } from '../core/csv.js';
import { toast } from '../core/toast.js';

/** Сегментированный переключатель: кнопки с data-value внутри контейнера .seg */
export function initSegmented(root, onChange, initial) {
  const buttons = Array.from(root.querySelectorAll('button[data-value]'));
  const set = (value, emit = true) => {
    for (const b of buttons) b.setAttribute('aria-pressed', String(b.dataset.value === value));
    if (emit) onChange?.(value);
  };
  for (const b of buttons) {
    b.type = 'button';
    b.addEventListener('click', () => set(b.dataset.value));
  }
  const start = buttons.some((b) => b.dataset.value === initial) ? initial : buttons[0]?.dataset.value;
  set(start, false);
  return { set, get: () => buttons.find((b) => b.getAttribute('aria-pressed') === 'true')?.dataset.value };
}

/** Зона загрузки файла: клик или перетаскивание. Вызывает onText(text, file). */
export function initDropzone(zone, onText, { accept = /\.(csv|tsv|txt)$/i, maxBytes = 20 * 1024 * 1024 } = {}) {
  const input = zone.querySelector('input[type="file"]');
  const handle = async (file) => {
    if (!file) return;
    if (!accept.test(file.name)) {
      toast('Поддерживаются файлы .csv, .tsv и .txt', 'error');
      return;
    }
    if (file.size > maxBytes) {
      toast('Файл слишком большой (максимум 20 МБ)', 'error');
      return;
    }
    try {
      onText(await readTextFile(file), file);
    } catch {
      toast('Не удалось прочитать файл', 'error');
    }
  };
  input.addEventListener('change', () => {
    handle(input.files[0]);
    input.value = '';
  });
  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.classList.add('is-over');
  });
  zone.addEventListener('dragleave', () => zone.classList.remove('is-over'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('is-over');
    handle(e.dataTransfer.files[0]);
  });
}

/** Сортировка таблицы по клику на заголовок: кнопки .th-sort[data-key] */
export function initSortHeaders(thead, state, onSort) {
  const buttons = Array.from(thead.querySelectorAll('.th-sort'));
  const sync = () => {
    for (const b of buttons) {
      if (b.dataset.key === state.key) b.dataset.dir = state.dir;
      else delete b.dataset.dir;
      b.closest('th')?.setAttribute(
        'aria-sort',
        b.dataset.key === state.key ? (state.dir === 'asc' ? 'ascending' : 'descending') : 'none',
      );
    }
  };
  for (const b of buttons) {
    b.addEventListener('click', () => {
      if (state.key === b.dataset.key) state.dir = state.dir === 'asc' ? 'desc' : 'asc';
      else {
        state.key = b.dataset.key;
        state.dir = b.dataset.default || 'desc';
      }
      sync();
      onSort();
    });
  }
  sync();
}

export function compareValues(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a ?? '').localeCompare(String(b ?? ''), 'ru', { numeric: true, sensitivity: 'base' });
}
