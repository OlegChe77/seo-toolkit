// Приблизительная ширина текста в пикселях (через canvas).
// Шрифты близки к тем, что используют поисковые системы, но это оценка:
// реальная ширина зависит от поисковика, устройства и установленных шрифтов.
let ctx;

export const FONTS = {
  title: '400 20px Arial, "Helvetica Neue", sans-serif',
  description: '400 14px Arial, "Helvetica Neue", sans-serif',
};

export function textWidth(text, font) {
  if (!text) return 0;
  if (!ctx) ctx = document.createElement('canvas').getContext('2d');
  ctx.font = font;
  return Math.round(ctx.measureText(text).width);
}

/** Обрезает текст по ширине с многоточием; возвращает { text, truncated }. */
export function truncateToWidth(text, font, maxWidth) {
  if (textWidth(text, font) <= maxWidth) return { text, truncated: false };
  const ell = ' …';
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (textWidth(text.slice(0, mid) + ell, font) <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  let cut = text.slice(0, lo);
  const space = cut.lastIndexOf(' ');
  if (space > lo * 0.6) cut = cut.slice(0, space);
  return { text: `${cut.replace(/[\s,.;:–—-]+$/, '')} …`, truncated: true, visibleChars: lo };
}
