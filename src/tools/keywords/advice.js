// Советы по ключевой фразе: по её типу, сложности и соседним фразам из результатов поиска.
import { escapeHtml as h, fmt } from '../../core/dom.js';
import { transliterate } from '../../core/translit.js';

const STOP = new Set('в во на и с со к ко по за из от до для о об при у а но или же ли не без под над через что как где это the a an of to in on for and or with by at from is are'.split(' '));
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const year = new Date().getFullYear();

export const LABEL = { green: 'Быстрый результат', yellow: 'Средний', red: 'Дорогой' };
export const TERM = { green: '1–3 месяца', yellow: '3–6 месяцев', red: '6–12 месяцев и больше' };

const slug = (p) =>
  '/' + transliterate(p.split(' ').filter((w) => !STOP.has(w)).join(' ')).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const within = (small, big) => small.every((s) => big.includes(s));

function neighbours(row, rows) {
  const ext = rows.filter((r) => r.phrase !== row.phrase && r.stems.length > row.stems.length && within(row.stems, r.stems));
  const variants = rows.filter((r) => r.phrase !== row.phrase && r.stems.length === row.stems.length && within(row.stems, r.stems));
  return { ext: ext.sort((a, b) => b.volume - a.volume), variants };
}

function coWords(row, rows, ext) {
  // Без чужих площадок и городов: «авито», «спб» в тексте не помогут.
  const clean = (list) => list.filter((r) => r.intent !== 'nav' && !r.geo);
  const pool = clean(ext).length >= 3 ? clean(ext) : clean(rows.filter((r) => r.phrase !== row.phrase && r.stems.some((s) => row.stems.includes(s))));
  const count = new Map();
  for (const r of pool) {
    for (const w of new Set(r.phrase.split(' '))) {
      if (w.length < 3 || STOP.has(w) || row.stems.some((s) => w.startsWith(s))) continue;
      count.set(w, (count.get(w) || 0) + 1);
    }
  }
  return [...count].filter(([, c]) => c > 1).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([w]) => w);
}

function meta(row) {
  const ru = /[а-я]/.test(row.phrase);
  const P = cap(row.phrase);
  const site = ru ? 'Ваш сайт' : 'Your Site';
  const t = {
    commercial: row.service
      ? [`${P} — цены, выезд мастера | ${site}`, `${P}: цены на услуги, выезд в день обращения, гарантия на работы. Оставьте заявку или позвоните.`,
         `${P} — Prices & Booking | ${site}`, `${P}: transparent prices, same-day visits and a work guarantee. Book online or call us.`]
      : [`${P} — цены, доставка | ${site}`, `${P}: цены, фото и отзывы покупателей. Доставка, гарантия, помощь в выборе — оформите заказ онлайн.`,
         `${P} — Prices & Delivery | ${site}`, `${P}: prices, photos and customer reviews. Fast delivery and warranty — order online.`],
    info: [`${P}${row.question ? ': пошагово и без ошибок' : ': инструкция с фото'}`, `${P} — понятная инструкция: что понадобится, пошаговый порядок, частые ошибки и советы.`,
           `${P}: Step-by-Step Guide`, `${P} — a clear guide: what you need, step-by-step instructions and common mistakes.`],
    investigation: [`${P} — рейтинг ${year} и отзывы`, `${P}: сравнение по цене и качеству, плюсы и минусы, реальные отзывы. Поможем выбрать.`,
                    `${P} — ${year} Reviews & Top Picks`, `${P}: honest comparison, pros and cons, real reviews. We help you choose.`],
    general: [`${P} — цены, виды и советы | ${site}`, `${P}: виды, цены и советы по выбору. Каталог с фото, доставка и гарантия.`,
              `${P} — Types, Prices & Tips | ${site}`, `${P}: types, prices and buying tips. Catalog with photos, delivery and warranty.`],
  }[row.intent];
  const [title, desc] = ru ? t.slice(0, 2) : t.slice(2);
  return { title, desc, h1: P, url: slug(row.phrase) };
}

const PAGE = {
  commercial: (r) =>
    r.service
      ? 'Страница услуги, а не статья: цена «от», что входит в работу, выезд и сроки, гарантия, примеры работ, форма заявки и телефон на первом экране.'
      : 'Страница категории или товара, а не статья: цены, фото, наличие, кнопка «Купить», доставка и оплата, отзывы, фильтры по размеру, цвету и цене.',
  info: () => 'Статья-инструкция. Короткий ответ — в первом абзаце (2–3 предложения), дальше по шагам с фото или видео, в конце — ссылка на ваш товар или услугу.',
  investigation: () => 'Обзор, рейтинг или сравнение: таблица сравнения, честные плюсы и минусы, реальные фото, вывод «что выбрать» и ссылки на товары.',
  general: () =>
    'Намерение неясно. Откройте выдачу по этой фразе: если в топе магазины — делайте категорию, если статьи — статью. Чаще всего подходит категория с блоком советов по выбору.',
};

function checklist(row, ext) {
  const items = [
    'Фраза — в Title (ближе к началу), в H1 и в первом абзаце. Точное вхождение 1–2 раза, дальше — формы слов и синонимы.',
    'Под этот запрос — одна страница на сайте, иначе страницы будут конкурировать между собой.',
    'Поставьте 2–5 внутренних ссылок на страницу с похожих страниц — с текстом, близким к запросу.',
  ];
  if (row.geo) items.push('Город в Title, H1 и тексте; адрес, телефон, карта и часы работы на странице; карточка в Яндекс Бизнесе и Google Business Profile; разметка LocalBusiness.');
  if (row.question) items.push('Блок «Вопросы и ответы» с разметкой FAQPage: короткий точный ответ повышает шанс попасть в быстрый ответ поисковика.');
  if (row.intent === 'commercial') items.push('Разметка Product/Offer (цена, наличие) или Service, отзывы с оценкой, фото; страница должна грузиться быстрее 2,5 с на телефоне.');
  if (row.intent === 'info') items.push('Оглавление, картинки или видео, разметка Article/HowTo, дата обновления.');
  if (row.intent === 'investigation') items.push('Таблица сравнения, дата обновления рейтинга, разметка Review; обновляйте рейтинг хотя бы раз в год.');
  items.push(
    {
      green: 'Объём текста: 600–1200 слов по делу — здесь хватит хорошей страницы без больших вложений.',
      yellow: 'Объём текста: 1200–2000 слов, плюс 3–7 внешних ссылок с тематических сайтов (каталоги, статьи, упоминания).',
      red: 'Нужны сильные внешние ссылки (10+ тематических), большой ассортимент или экспертный контент и возраст сайта.',
    }[row.color],
  );
  if (ext.length) items.push(`Добавьте на страницу подзаголовки под уточнения: ${ext.slice(0, 3).map((r) => `«${h(r.phrase)}»`).join(', ')}.`);
  return items;
}

const pill = (r) => `<span class="kf-pill kf-pill--${r.color}">${h(r.phrase)} · ${fmt(r.volume)}</span>`;

/** HTML панели советов (все значения экранированы). */
export function buildAdvice(row, rows) {
  const { ext, variants } = neighbours(row, rows);
  const head = `<div class="kf-adv-head"><span class="kf-pot kf-pot--${row.color}">${LABEL[row.color]}</span>
    <span>≈ ${fmt(row.volume)} в месяц · сложность ${row.difficulty}/99 · срок до топа: ${TERM[row.color]}</span></div>`;

  if (row.intent === 'nav') {
    // Те же слова, кроме названия площадки.
    const alt = rows
      .filter((r) => r.intent !== 'nav' && r.color !== 'red' && r.stems.filter((s) => row.stems.includes(s)).length >= row.stems.length - 1)
      .sort((a, b) => b.potential - a.potential)
      .slice(0, 5);
    return `${head}<p class="kf-verdict">Это запрос про чужую площадку: человек хочет попасть именно туда, поэтому свой сайт по нему не продвинуть.</p>
      <ol class="kf-adv-list">
        <li>Если продаёте этот товар — разместите его на этой площадке и оптимизируйте карточку: ключ в названии, 5+ фото, подробные характеристики, ответы на вопросы, первые отзывы.</li>
        <li>Не создавайте на своём сайте страницу под эту фразу.</li>
        ${alt.length ? `<li>Для своего сайта берите фразы без названия площадки: ${alt.map((r) => `«${h(r.phrase)}»`).join(', ')}.</li>` : ''}
      </ol>`;
  }

  const m = meta(row);
  const words = coWords(row, rows, ext);
  const verdict = {
    green: `Хороший спрос при низкой конкуренции — берите в работу первой. Достаточно одной качественной страницы, первые переходы возможны через ${TERM.green}.`,
    yellow: 'Рабочий запрос, но конкуренция заметная: нужна сильная страница и немного внешних ссылок. Хорошо идёт в паре с зелёными уточнениями на той же странице.',
    red: 'В топе крупные магазины и агрегаторы: понадобятся месяцы работы и бюджет на ссылки. Быстрее получить трафик рекламой (Яндекс Директ, Google Ads), а в SEO заходить через уточнения.',
  }[row.color];
  const easier = row.color === 'red' ? ext.filter((r) => r.color !== 'red').sort((a, b) => b.potential - a.potential).slice(0, 6) : [];
  const field = (label, value, max) => `<dt>${label}${max ? ` <small class="${value.length > max ? 'is-bad' : ''}">${value.length}/${max}</small>` : ''}</dt>
    <dd><code>${h(value)}</code><button type="button" class="btn btn-sm btn-ghost" data-copy="${h(value)}">Копировать</button></dd>`;

  return `${head}<p class="kf-verdict">${verdict}</p>
    ${row.color === 'red' ? `<div class="kf-adv-box"><strong>Начните с уточнений:</strong> ${easier.length ? easier.map(pill).join(' ') : 'подходящих не нашлось — включите «Глубже» и повторите поиск.'}</div>` : ''}
    <section class="kf-adv-card"><h3>Какую страницу сделать</h3><p>${PAGE[row.intent](row)}</p></section>
    <section class="kf-adv-card"><h3>Заготовки</h3><dl class="kf-adv-meta">
      ${field('Title', m.title, 60)}${field('H1', m.h1)}${field('Description', m.desc, 160)}${field('URL', m.url)}
    </dl></section>
    <section class="kf-adv-card"><h3>Слова для текста</h3>${
      words.length
        ? `<p class="kf-adv-words">${words.map((w) => `<span class="kf-pill">${h(w)}</span>`).join(' ')}</p><p class="hint">Так ищут вместе с этой фразой — используйте в подзаголовках и тексте.</p>`
        : '<p class="hint">Мало данных — включите «Глубже».</p>'
    }</section>
    <section class="kf-adv-card"><h3>Та же страница охватит</h3>${
      ext.length || variants.length
        ? `<ul class="kf-adv-ext">${variants.concat(ext).slice(0, 8).map((r) => `<li><span class="kf-dot kf-dot--${r.color}"></span>${h(r.phrase)} <small>${fmt(r.volume)}</small></li>`).join('')}</ul>`
        : '<p class="hint">Уточнений не найдено.</p>'
    }</section>
    <section class="kf-adv-card"><h3>Что сделать</h3><ol class="kf-adv-list">${checklist(row, ext).map((i) => `<li>${i}</li>`).join('')}</ol></section>
    <p class="hint">Советы общие — по типу запроса. Сложность — оценка по виду фразы и спросу, а не по реальной выдаче: перед запуском откройте топ-10 и проверьте, кто там.</p>`;
}
