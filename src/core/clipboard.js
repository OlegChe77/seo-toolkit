import { toast } from './toast.js';

export async function copyText(text, successMessage = 'Скопировано в буфер обмена') {
  if (!text || !String(text).trim()) {
    toast('Нечего копировать — сначала получите результат', 'error');
    return false;
  }
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Запасной вариант для старых браузеров и небезопасного контекста.
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:-1000px;opacity:0';
    document.body.append(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    if (!ok) {
      toast('Не удалось скопировать. Выделите текст и нажмите Ctrl+C', 'error');
      return false;
    }
  }
  toast(successMessage, 'success');
  return true;
}
