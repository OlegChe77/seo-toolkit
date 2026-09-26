// Разбор дат из таблиц. Возвращает { y, m, d, time } (время в UTC-полночь) или null.
const MONTHS = [
  ['янв', 'jan'],
  ['фев', 'feb'],
  ['мар', 'mar'],
  ['апр', 'apr'],
  ['мая', 'май', 'may'],
  ['июн', 'jun'],
  ['июл', 'jul'],
  ['авг', 'aug'],
  ['сен', 'sep'],
  ['окт', 'oct'],
  ['ноя', 'nov'],
  ['дек', 'dec'],
];

const DAY = 86400000;

function make(y, m, d) {
  if (y < 100) y += 2000;
  if (y < 1990 || y > 2200 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const time = Date.UTC(y, m - 1, d);
  const check = new Date(time);
  if (check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) return null;
  return { y, m, d, time };
}

/** format: 'auto' | 'dmy' | 'mdy' */
export function parseDate(value, format = 'auto') {
  const s = String(value ?? '').trim().toLowerCase();
  if (!s) return null;
  let m = s.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})(?:$|[t\s])/);
  if (m) return make(+m[1], +m[2], +m[3]);

  m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})(?:$|[\s,t])/);
  if (m) {
    const a = +m[1];
    const b = +m[2];
    let mdy = format === 'mdy';
    if (format === 'auto') mdy = a <= 12 && b > 12;
    return mdy ? make(+m[3], a, b) : make(+m[3], b, a);
  }

  // Числовая дата Excel (дни с 30.12.1899).
  m = s.match(/^(\d{5})(?:[.,]\d+)?$/);
  if (m && +m[1] > 30000 && +m[1] < 80000) {
    const dt = new Date(Date.UTC(1899, 11, 30) + +m[1] * DAY);
    return make(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
  }

  // «31 января 2025», «January 31, 2025», «31 Jan 2025».
  const year = s.match(/\b(\d{4})\b/);
  const monthIdx = MONTHS.findIndex((variants) => variants.some((v) => new RegExp(`(^|[^\\p{L}])${v}`, 'u').test(s)));
  if (year && monthIdx >= 0) {
    const day = s.replace(year[1], '').match(/\b(\d{1,2})\b/);
    if (day) return make(+year[1], monthIdx + 1, +day[1]);
  }
  return null;
}

export const daysBetween = (from, to) => Math.round((to - from) / DAY);

export function todayUtc() {
  const n = new Date();
  return Date.UTC(n.getFullYear(), n.getMonth(), n.getDate());
}

export const formatDate = (p) => (p ? `${String(p.d).padStart(2, '0')}.${String(p.m).padStart(2, '0')}.${p.y}` : '');
export const isoDate = (p) => (p ? `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}` : '');
