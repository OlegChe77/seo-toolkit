// Значки «SEO-оценка» для вставки на сайт: размеры, оформление по оценке и код вставки.
// Картинки генерирует scripts/generate-badges.mjs в public/badge/<размер>/<оценка>.svg.

export const BADGE_SIZES = [
  { id: 'button', name: 'Кнопка', w: 88, h: 31 },
  { id: 'plate', name: 'Плашка', w: 180, h: 50 },
  { id: 'medal', name: 'Медаль', w: 150, h: 150 },
  { id: 'banner', name: 'Баннер', w: 468, h: 60 },
];

/** Оформление по оценке — те же пороги, что у оценки в отчёте (checks.js → grade). */
export const badgeGrade = (score) =>
  score >= 90 ? { id: 'great', label: 'Отлично', icon: 'trophy' }
    : score >= 75 ? { id: 'good', label: 'Хорошо', icon: 'medal' }
      : score >= 50 ? { id: 'mid', label: 'Средне', icon: 'chart' }
        : { id: 'bad', label: 'Слабо', icon: 'tools' };

const escAttr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** Код вставки: HTML или Markdown. Значок ведёт на живую проверку этого сайта. */
export function badgeCode({ origin, size, score, site, date, format = 'html' }) {
  const img = `${origin}/badge/${size.id}/${score}.svg`;
  const link = `${origin}/seo-audit#url=${encodeURIComponent(site)}`;
  const alt = `SEO-оценка ${score} из 100 — SEO Toolkit`;
  if (format === 'md') return `[![${alt}](${img})](${link})`;
  return `<a href="${escAttr(link)}" target="_blank" rel="noopener" title="${escAttr(`SEO-оценка ${site}: ${score} из 100, проверено ${date} в SEO Toolkit`)}"><img src="${escAttr(img)}" width="${size.w}" height="${size.h}" alt="${escAttr(alt)}" loading="lazy" style="border:0"></a>`;
}
