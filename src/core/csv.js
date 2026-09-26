// Чтение и запись CSV с корректной поддержкой UTF-8 и русского текста.
import { toast } from './toast.js';

const DELIMITER = ';'; // Excel с русской локалью открывает такие файлы по столбцам.

function escapeCell(value) {
  let s = value == null ? '' : String(value);
  // Защита от CSV-инъекций: строка, начинающаяся с формульного символа, не станет формулой.
  if (typeof value === 'string' && /^[=+@\t\r]|^-[^\d\s]/.test(s)) s = `'${s}`;
  if (/[";\r\n,]/.test(s) || /^\s|\s$/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(rows) {
  return rows.map((row) => row.map(escapeCell).join(DELIMITER)).join('\r\n');
}

export function downloadFile(content, filename, mime = 'text/plain;charset=utf-8') {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Скачивает CSV в UTF-8 с BOM — так Excel правильно показывает кириллицу. */
export function downloadCsv(rows, filename) {
  if (!rows || rows.length < 2) {
    toast('Нет данных для экспорта', 'error');
    return false;
  }
  downloadFile(`﻿${toCsv(rows)}`, filename, 'text/csv;charset=utf-8');
  toast(`Файл ${filename} сохранён`, 'success');
  return true;
}

/** Табличный текст (TSV) для вставки в Excel / Google Таблицы. */
export const toTsv = (rows) =>
  rows.map((row) => row.map((c) => String(c ?? '').replace(/[\t\r\n]+/g, ' ')).join('\t')).join('\n');

function detectDelimiter(text) {
  const firstLine = text.split(/\r?\n/).find((l) => l.trim()) || '';
  const counts = { '\t': 0, ';': 0, ',': 0 };
  let inQuotes = false;
  for (const ch of firstLine) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && ch in counts) counts[ch]++;
  }
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return best[1] > 0 ? best[0] : ',';
}

/** Разбор CSV/TSV по RFC 4180 с автоопределением разделителя. */
export function parseCsv(text, delimiter) {
  const src = String(text || '').replace(/^﻿/, '');
  const sep = delimiter || detectDelimiter(src);
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQuotes = false;
      } else cell += ch;
    } else if (ch === '"' && cell === '') inQuotes = true;
    else if (ch === sep) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some((c) => c !== ''));
}

/** Читает файл как текст: UTF-8, а при ошибке декодирования — Windows-1251. */
export async function readTextFile(file) {
  const buf = await file.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder('windows-1251').decode(buf);
  }
}
