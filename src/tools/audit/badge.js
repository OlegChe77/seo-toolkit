// Значки «SEO-оценка» для вставки на сайт: размеры, темы, оформление по оценке и код вставки.
// Картинки генерирует scripts/generate-badges.mjs в public/badge/.

// Не используйте рекламные размеры и слово «banner» в адресе: блокировщики прячут такие картинки на любом
// сайте (в RU AdList есть общее правило ##img[width="468"][height="60"]), поэтому баннер — 460×64 в папке wide.
export const BADGE_SIZES = [
  { id: 'button', name: 'Кнопка', w: 88, h: 31 },
  { id: 'plate', name: 'Плашка', w: 180, h: 50 },
  { id: 'medal', name: 'Медаль', w: 150, h: 150 },
  { id: 'wide', name: 'Баннер', w: 460, h: 64 },
];

export const BADGE_THEMES = [
  { id: 'dark', name: 'Тёмный' },
  { id: 'light', name: 'Светлый' },
];

/** Путь к картинке. Тёмные лежат без префикса темы: так работают коды, вставленные до появления светлых. */
export const badgePath = (theme, size, score) => `/badge/${theme === 'light' ? 'light/' : ''}${size}/${score}.svg`;

/** Оформление по оценке — те же пороги, что у оценки в отчёте (checks.js → grade). */
export const badgeGrade = (score) =>
  score >= 90 ? { id: 'great', label: 'Отлично', icon: 'trophy' }
    : score >= 75 ? { id: 'good', label: 'Хорошо', icon: 'medal' }
      : score >= 50 ? { id: 'mid', label: 'Средне', icon: 'chart' }
        : { id: 'bad', label: 'Слабо', icon: 'tools' };

const escAttr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** Код вставки: HTML или Markdown. Значок ведёт на живую проверку этого сайта. */
export function badgeCode({ origin, size, theme = 'dark', score, site, date, format = 'html' }) {
  const img = `${origin}${badgePath(theme, size.id, score)}`;
  const link = `${origin}/seo-audit#url=${encodeURIComponent(site)}`;
  const alt = `SEO-оценка ${score} из 100 — SEO Toolkit`;
  if (format === 'md') return `[![${alt}](${img})](${link})`;
  return `<a href="${escAttr(link)}" target="_blank" rel="noopener" title="${escAttr(`SEO-оценка ${site}: ${score} из 100, проверено ${date} в SEO Toolkit`)}"><img src="${escAttr(img)}" width="${size.w}" height="${size.h}" alt="${escAttr(alt)}" loading="lazy" style="border:0"></a>`;
}
