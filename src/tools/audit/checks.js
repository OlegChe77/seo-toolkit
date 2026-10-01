// SEO-анализ страницы: разбор HTML, полученного сервером (server/audit.js), проверки и оценка 0–100.
// Каждая проверка: { group, id, title, status: ok | warn | fail | info, weight, value, advice, tool?, guide? }.
// Оценка — взвешенная доля пройденных проверок (warn — половина веса); info в оценку не входит.
import { tools } from '../../config/pages.js';
import { stem } from '../../core/stem.js';
import { STOPWORDS, words as splitWords } from '../../core/text.js';
import { isAllowed, parseRobots } from './robots.js';

export const GROUPS = [
  { id: 'index', name: 'Индексация' },
  { id: 'meta', name: 'Метатеги и сниппет' },
  { id: 'content', name: 'Контент и структура' },
  { id: 'tech', name: 'Техника и скорость' },
  { id: 'links', name: 'Адрес и ссылки' },
  { id: 'markup', name: 'Микроразметка и соцсети' },
];

const STATUS_SCORE = { ok: 1, warn: 0.5, fail: 0 };
// Если страница не может попасть в поиск, остальное неважно — оценка не выше этой.
const CRITICAL = new Set(['status', 'html', 'noindex', 'robots']);
const CRITICAL_CAP = 35;

export const grade = (score) =>
  score >= 90 ? { id: 'great', label: 'Отлично' } : score >= 75 ? { id: 'good', label: 'Хорошо' } : score >= 50 ? { id: 'mid', label: 'Есть что улучшить' } : { id: 'bad', label: 'Нужна серьёзная работа' };

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const plural = (n, one, few, many) => {
  const m10 = n % 10;
  const m100 = n % 100;
  return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many;
};
const sameHost = (a, b) => a.replace(/^www\./, '') === b.replace(/^www\./, '');
const sameUrl = (a, b) => a.replace(/\/$/, '') === b.replace(/\/$/, '');

// ---------- Факты о странице ----------

function textOf(doc) {
  const body = doc.body?.cloneNode(true);
  if (!body) return '';
  body.querySelectorAll('script, style, noscript, template, svg, iframe, object').forEach((n) => n.remove());
  const parts = [];
  const walker = doc.createTreeWalker(body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) parts.push(walker.currentNode.nodeValue);
  return clean(parts.join(' '));
}

function ldTypes(value, out) {
  if (Array.isArray(value)) value.forEach((v) => ldTypes(v, out));
  else if (value && typeof value === 'object') {
    for (const t of [].concat(value['@type'] || [])) out.add(String(t));
    if (value['@graph']) ldTypes(value['@graph'], out);
  }
  return out;
}

function dateFrom(value) {
  const d = value ? new Date(value) : null;
  return d && !Number.isNaN(d.getTime()) && d.getFullYear() > 1995 ? d : null;
}

/** Всё, что нужно проверкам, — одним объектом. */
export function extract(data) {
  const doc = new DOMParser().parseFromString(data.html || '', 'text/html');
  const url = new URL(data.url);
  let base = url;
  try {
    const href = doc.querySelector('base[href]')?.getAttribute('href');
    if (href) base = new URL(href, url);
  } catch {
    /* некорректный <base> — считаем от адреса страницы */
  }
  const abs = (href) => {
    try {
      return new URL(href, base);
    } catch {
      return null;
    }
  };
  const meta = (sel) => clean(doc.querySelector(sel)?.getAttribute('content')) || null;
  const all = (sel) => [...doc.querySelectorAll(sel)];

  const titles = all('title').map((t) => clean(t.textContent));
  const robotsMeta = all('meta[name="robots" i], meta[name="googlebot" i], meta[name="yandex" i]').map((m) => (m.getAttribute('content') || '').toLowerCase());
  const xRobots = (data.headers['x-robots-tag'] || '').toLowerCase();
  const canonicals = all('link[rel~="canonical" i][href]').map((l) => abs(l.getAttribute('href'))?.href).filter(Boolean);
  const headings = all('h1, h2, h3, h4, h5, h6').map((h) => [Number(h.tagName[1]), clean(h.textContent)]);
  const text = textOf(doc);
  const wordList = splitWords(text);

  const images = all('img');
  const anchors = all('a[href]').map((a) => ({ href: a.getAttribute('href').trim(), url: abs(a.getAttribute('href')), rel: (a.getAttribute('rel') || '').toLowerCase() }));
  const links = anchors.filter((a) => a.url && /^https?:$/.test(a.url.protocol));
  const internal = links.filter((a) => sameHost(a.url.hostname, url.hostname));

  const ld = all('script[type="application/ld+json" i]').map((s) => {
    try {
      return { ok: true, types: [...ldTypes(JSON.parse(s.textContent), new Set())], json: JSON.parse(s.textContent) };
    } catch {
      return { ok: false, types: [] };
    }
  });
  const ldDates = [];
  const collectDates = (v) => {
    if (Array.isArray(v)) v.forEach(collectDates);
    else if (v && typeof v === 'object') {
      for (const k of ['dateModified', 'datePublished']) if (typeof v[k] === 'string') ldDates.push([k, v[k]]);
      Object.values(v).forEach((x) => typeof x === 'object' && collectDates(x));
    }
  };
  ld.filter((x) => x.ok).forEach((x) => collectDates(x.json));

  const insecure = url.protocol === 'https:'
    ? all('img[src], script[src], iframe[src], source[src], audio[src], video[src], link[rel~="stylesheet" i][href]')
        .map((el) => el.getAttribute('src') || el.getAttribute('href'))
        .filter((src) => /^http:\/\//i.test(src || ''))
    : [];

  const sitemapEntry = data.sitemap?.urls?.find(([loc]) => sameUrl(loc, url.href));
  const dates = [
    ['dateModified (разметка)', ldDates.find(([k]) => k === 'dateModified')?.[1]],
    ['article:modified_time', meta('meta[property="article:modified_time" i]')],
    ['lastmod в sitemap.xml', sitemapEntry?.[1]],
    ['datePublished (разметка)', ldDates.find(([k]) => k === 'datePublished')?.[1]],
    ['article:published_time', meta('meta[property="article:published_time" i]')],
  ].map(([source, v]) => ({ source, date: dateFrom(v) })).filter((d) => d.date);

  return {
    url,
    doc,
    titles,
    title: titles[0] ?? null,
    description: meta('meta[name="description" i]'),
    noindex: robotsMeta.some((c) => /noindex|none/.test(c)) || /noindex|none/.test(xRobots),
    noindexSource: robotsMeta.some((c) => /noindex|none/.test(c)) ? 'meta robots' : 'X-Robots-Tag',
    canonicals,
    headings,
    h1: headings.filter(([l]) => l === 1).map(([, t]) => t),
    text,
    words: wordList,
    lang: doc.documentElement.getAttribute('lang'),
    viewport: meta('meta[name="viewport" i]'),
    charset: !!doc.querySelector('meta[charset], meta[http-equiv="content-type" i]') || /charset=/i.test(data.headers['content-type'] || ''),
    favicon: !!doc.querySelector('link[rel~="icon" i]'),
    og: Object.fromEntries(['title', 'description', 'image', 'url', 'type'].map((k) => [k, meta(`meta[property="og:${k}" i]`)])),
    ld,
    microdata: all('[itemscope][itemtype]').map((el) => el.getAttribute('itemtype').split('/').pop()),
    images: { total: images.length, noAlt: images.filter((i) => !i.hasAttribute('alt')).length },
    links: { total: links.length, internal: internal.length, external: links.length - internal.length, nofollowInternal: internal.filter((a) => a.rel.includes('nofollow')).length },
    insecure,
    blockingScripts: doc.head ? doc.head.querySelectorAll('script[src]:not([async]):not([defer]):not([type="module"])').length : 0,
    dates,
    lastModifiedHeader: dateFrom(data.headers['last-modified']),
  };
}

// ---------- Ссылки на инструменты с готовыми данными ----------

const toolName = (id) => tools.find((t) => t.id === id)?.name || id;
const tool = (id, label, state) => ({ id, name: toolName(id), label, state });

// ---------- Проверки ----------

export function runChecks(data, f = extract(data)) {
  const out = [];
  const add = (group, id, title, status, weight, value, advice, extra = {}) => out.push({ group, id, title, status, weight, value, advice, ...extra });
  const path = f.url.pathname + f.url.search;
  const robots = data.robots?.status === 200 ? parseRobots(data.robots.text) : null;
  const robotsState = robots && robots.groups.length ? { g: robots.groups, s: robots.sitemaps } : null;
  const metaState = { t: f.title || '', d: f.description || '', b: '', m: 'desktop' };
  const serpState = { t: f.title || '', d: f.description || '', u: f.url.href, m: 'desktop' };
  const headingState = f.headings.length ? { h: f.headings.slice(0, 300) } : null;
  const textState = f.text ? { x: f.text.slice(0, 60000), k: f.h1[0] || '', n: 1, m: '2', s: true, st: false } : null;

  // --- Индексация ---
  if (data.status === 200) add('index', 'status', 'Ответ сервера', 'ok', 15, '200 OK — страница доступна');
  else {
    add('index', 'status', 'Ответ сервера', 'fail', 15, `Код ${data.status}`,
      data.status >= 500
        ? 'Сервер отвечает ошибкой — поисковики не проиндексируют страницу, а при долгих сбоях уберут её из поиска. Проверьте сервер и хостинг.'
        : 'Страница отвечает ошибкой — в поиск она не попадёт. Проверьте адрес: если страница переехала, настройте 301-редирект на новый адрес.');
  }
  if (!data.html) {
    add('index', 'html', 'Тип содержимого', 'fail', 10, data.headers['content-type'] || 'не указан',
      'По этому адресу не HTML-страница. Для анализа укажите адрес обычной страницы сайта.');
  }

  const temp = data.redirects.filter((r) => r.status === 302 || r.status === 307);
  if (data.redirects.length === 0) add('index', 'redirects', 'Редиректы', 'ok', 3, 'Страница открывается сразу');
  else if (data.redirects.length === 1 && !temp.length) add('index', 'redirects', 'Редиректы', 'ok', 3, `1 редирект (${data.redirects[0].status})`);
  else {
    add('index', 'redirects', 'Редиректы', 'warn', 3, data.redirects.map((r) => `${r.status} ${r.url}`).join(' → ') + ` → ${data.url}`,
      [data.redirects.length > 1 ? `Цепочка из ${data.redirects.length} редиректов замедляет загрузку и теряет часть веса ссылок — ведите ссылки сразу на конечный адрес.` : '',
        temp.length ? 'Есть временный редирект (302/307): для постоянного переезда нужен 301, иначе поисковик может оставить в поиске старый адрес.' : ''].filter(Boolean).join(' '));
  }

  if (f.noindex) {
    add('index', 'noindex', 'Запрет индексации', 'fail', 15, `noindex в ${f.noindexSource}`,
      'Страница закрыта от индексации — в поиске её не будет. Если это не намеренно, уберите noindex из meta robots или заголовка X-Robots-Tag.');
  } else add('index', 'noindex', 'Запрет индексации', 'ok', 15, 'Индексация разрешена');

  if (robots) {
    const blocked = [['Googlebot', 'Google'], ['YandexBot', 'Яндекс']]
      .map(([bot, name]) => ({ name, ...isAllowed(robots, bot, path) }))
      .filter((r) => !r.allowed);
    if (blocked.length) {
      add('index', 'robots', 'robots.txt', 'fail', 12, `Закрыта для: ${blocked.map((b) => `${b.name} (Disallow: ${b.rule.path})`).join(', ')}`,
        'robots.txt запрещает поисковикам обходить эту страницу. Уберите или уточните правило Disallow, если страница должна быть в поиске.',
        { tool: tool('robots-builder', 'Исправить robots.txt', robotsState), guide: 'robots-txt' });
    } else {
      add('index', 'robots', 'robots.txt', 'ok', 12, 'Страница открыта для Google и Яндекса',
        robots.groups.length ? '' : 'Файл есть, но правил в нём нет.', { tool: robotsState ? tool('robots-builder', 'Открыть robots.txt в RobotsBuilder', robotsState) : null });
    }
  } else if (data.robots?.status >= 500) {
    add('index', 'robots', 'robots.txt', 'warn', 6, `robots.txt отвечает кодом ${data.robots.status}`,
      'Когда robots.txt отвечает ошибкой сервера, Google может приостановить обход всего сайта. Проверьте, что файл отдаётся с кодом 200.',
      { tool: tool('robots-builder', 'Создать robots.txt'), guide: 'robots-txt' });
  } else {
    add('index', 'robots', 'robots.txt', 'warn', 3, data.robots?.error || 'Файл не найден',
      'robots.txt не найден — сайт открыт для обхода целиком, но служебные страницы (корзина, поиск, фильтры) тоже попадут в индекс. Создайте файл и укажите в нём Sitemap.',
      { tool: tool('robots-builder', 'Создать robots.txt'), guide: 'robots-txt' });
  }

  const sm = data.sitemap;
  const freshState = sm?.found && sm.urls?.length
    ? { x: ['url;published;updated', ...sm.urls.map(([loc, lastmod]) => `${loc};;${lastmod}`)].join('\n'), f: 'auto' }
    : null;
  if (sm?.found) {
    const size = sm.index ? `индекс из ${sm.files} ${plural(sm.files, 'файла', 'файлов', 'файлов')}` : `${sm.total} ${plural(sm.total, 'адрес', 'адреса', 'адресов')}`;
    if (sm.declared) add('index', 'sitemap', 'Sitemap', 'ok', 4, `${sm.url} — ${size}`, '', { tool: freshState ? tool('content-fresh', 'Проверить свежесть страниц', freshState) : null });
    else {
      add('index', 'sitemap', 'Sitemap', 'warn', 4, `${sm.url} — ${size}, но не указан в robots.txt`,
        'Добавьте в robots.txt строку «Sitemap: ' + sm.url + '» — так карту сайта найдут все поисковики, а не только те, куда вы её отправили вручную.',
        { tool: tool('robots-builder', 'Добавить Sitemap в robots.txt', robotsState), guide: 'robots-txt' });
    }
  } else {
    add('index', 'sitemap', 'Sitemap', 'warn', 4, sm?.status ? `${sm.url} — код ${sm.status}` : 'Не найден',
      'Карта сайта не найдена. Sitemap.xml помогает поисковикам быстрее находить новые и обновлённые страницы — создайте её (обычно это делает CMS или плагин) и укажите в robots.txt.',
      { tool: tool('robots-builder', 'Указать Sitemap в robots.txt', robotsState), guide: 'robots-txt' });
  }

  if (!f.canonicals.length) {
    add('index', 'canonical', 'Canonical', 'warn', 4, 'Не указан',
      'Без rel="canonical" при дублях (адреса с UTM-метками, параметрами, со слэшем и без) поисковик сам выберет основную страницу — не всегда ту. Добавьте <link rel="canonical" href="…"> с адресом этой страницы.');
  } else if (new Set(f.canonicals).size > 1) {
    add('index', 'canonical', 'Canonical', 'warn', 4, f.canonicals.join(', '), 'На странице несколько разных canonical — поисковики проигнорируют их все. Оставьте один.');
  } else if (!sameUrl(f.canonicals[0], f.url.href)) {
    add('index', 'canonical', 'Canonical', 'warn', 4, `Указывает на ${f.canonicals[0]}`,
      'Canonical ведёт на другой адрес — поисковик считает эту страницу дублем и в поиск поставит ту. Если это не намеренно, укажите в canonical адрес самой страницы.');
  } else add('index', 'canonical', 'Canonical', 'ok', 4, 'Указывает на эту страницу');

  // --- Метатеги ---
  const tl = f.title?.length || 0;
  if (!f.title) {
    add('meta', 'title', 'Title', 'fail', 10, 'Нет тега <title>', 'Title — главный текст сниппета в поиске и важный сигнал для ранжирования. Напишите уникальный заголовок 30–65 символов с главным ключом ближе к началу.',
      { tool: tool('serp-preview', 'Составить Title в SERP Preview', serpState), guide: 'title-i-description' });
  } else {
    const status = tl >= 30 && tl <= 65 ? 'ok' : 'warn';
    const advice = tl < 30 ? 'Title короткий: добавьте уточнение — тип страницы, выгоду, город или бренд, чтобы заголовок отвечал на запрос полнее.'
      : tl > 65 ? 'Title длинный: в выдаче он обрежется. Перенесите главное в первые 60 символов.' : '';
    add('meta', 'title', 'Title', f.titles.length > 1 ? 'warn' : status, 10, `«${f.title}» — ${tl} ${plural(tl, 'символ', 'символа', 'символов')}`,
      [advice, f.titles.length > 1 ? `На странице ${f.titles.length} тега <title> — оставьте один.` : ''].filter(Boolean).join(' '),
      { tool: tool(status === 'ok' ? 'serp-preview' : 'meta-length', status === 'ok' ? 'Посмотреть сниппет' : 'Подобрать длину Title', status === 'ok' ? serpState : metaState), guide: 'title-i-description' });
  }

  const dl = f.description?.length || 0;
  if (!f.description) {
    add('meta', 'description', 'Description', 'warn', 6, 'Нет meta description',
      'Без description поисковик соберёт описание сниппета из случайного куска текста. Напишите 1–2 предложения (70–160 символов) с ключом и выгодой для читателя.',
      { tool: tool('meta-length', 'Составить Description', metaState), guide: 'title-i-description' });
  } else {
    const ok = dl >= 70 && dl <= 170;
    add('meta', 'description', 'Description', ok ? 'ok' : 'warn', 6, `${dl} ${plural(dl, 'символ', 'символа', 'символов')}`,
      ok ? '' : dl < 70 ? 'Описание короткое — сниппет получится бедным. Добавьте выгоду и призыв к действию, 70–160 символов.' : 'Описание длинное и обрежется в выдаче. Уложите главное в 160 символов.',
      { tool: tool(ok ? 'serp-preview' : 'meta-length', ok ? 'Посмотреть сниппет' : 'Подобрать длину Description', ok ? serpState : metaState), guide: 'title-i-description' });
  }

  if (f.title && f.h1[0]) {
    const significant = (s) => new Set(splitWords(s).filter((w) => w.length > 2 && !STOPWORDS.has(w)).map(stem));
    const t = significant(f.title);
    const shared = [...significant(f.h1[0])].filter((w) => t.has(w));
    if (shared.length) add('meta', 'focus', 'Title и H1 об одном', 'ok', 3, 'Есть общие ключевые слова');
    else {
      add('meta', 'focus', 'Title и H1 об одном', 'warn', 3, `Title: «${f.title}», H1: «${f.h1[0]}»`,
        'Title и H1 не имеют общих слов — поисковику сложнее понять, по какому запросу показывать страницу. Выберите главную фразу и используйте её в обоих.',
        { tool: tool('keyword-finder', 'Подобрать ключевую фразу', null) });
    }
  }

  // --- Контент ---
  if (!f.h1.length) {
    add('content', 'h1', 'Заголовок H1', 'fail', 8, 'Нет H1', 'H1 — главный заголовок страницы. Добавьте один H1 с главной ключевой фразой.',
      { tool: tool('heading-map', 'Разобрать заголовки', headingState), guide: 'zagolovki-h1-h6' });
  } else if (f.h1.length > 1 || !f.h1[0]) {
    add('content', 'h1', 'Заголовок H1', 'warn', 8, f.h1.length > 1 ? `${f.h1.length} шт.: ${f.h1.slice(0, 3).map((h) => `«${h}»`).join(', ')}` : 'H1 пустой',
      f.h1.length > 1 ? 'На странице несколько H1 — оставьте один главный, остальные сделайте H2.' : 'H1 есть, но без текста — впишите в него главную фразу страницы.',
      { tool: tool('heading-map', 'Разобрать заголовки', headingState), guide: 'zagolovki-h1-h6' });
  } else add('content', 'h1', 'Заголовок H1', 'ok', 8, `«${f.h1[0]}»`, '', { tool: headingState ? tool('heading-map', 'Посмотреть структуру заголовков', headingState) : null });

  const skips = f.headings.filter(([level], i) => i > 0 && level > f.headings[i - 1][0] + 1).length;
  const h2 = f.headings.filter(([l]) => l === 2).length;
  if (skips || (!h2 && f.words.length > 400)) {
    add('content', 'headings', 'Структура заголовков', 'warn', 3, skips ? `Пропусков уровней: ${skips}` : 'Длинный текст без подзаголовков H2',
      skips ? 'Уровни заголовков идут с пропусками (например, после H2 сразу H4). Держите иерархию по порядку — так структуру лучше понимают и поисковики, и экранные чтецы.'
        : 'Разбейте текст подзаголовками H2 с уточняющими запросами — так страница будет ранжироваться по большему числу фраз.',
      { tool: tool('heading-map', 'Разобрать заголовки', headingState), guide: 'zagolovki-h1-h6' });
  } else if (f.headings.length) add('content', 'headings', 'Структура заголовков', 'ok', 3, `${f.headings.length} ${plural(f.headings.length, 'заголовок', 'заголовка', 'заголовков')}, без пропусков`, '', { tool: tool('heading-map', 'Посмотреть дерево заголовков', headingState) });

  const wc = f.words.length;
  add('content', 'text', 'Объём текста', wc >= 300 ? 'ok' : 'warn', 5, `${wc} ${plural(wc, 'слово', 'слова', 'слов')}`,
    wc >= 300 ? '' : wc < 100 ? 'Текста почти нет — поисковику не из чего понять, о чём страница. Добавьте полезный текст: ответы на вопросы, описание, характеристики.' : 'Текста мало. Расширьте его ответами на частые вопросы и уточнениями из подсказок поисковиков.',
    { tool: textState ? tool('text-seo', 'Проанализировать текст', textState) : tool('keyword-finder', 'Найти темы для текста', null) });

  if (wc >= 150) {
    const counts = new Map();
    for (const w of f.words) if (w.length > 3 && !STOPWORDS.has(w)) counts.set(stem(w), (counts.get(stem(w)) || 0) + 1);
    const [topStem, topCount] = [...counts].sort((a, b) => b[1] - a[1])[0] || ['', 0];
    const share = topCount / wc;
    const word = f.words.find((w) => stem(w) === topStem) || topStem;
    if (share > 0.05 && topCount >= 10) {
      add('content', 'stuffing', 'Переспам', 'warn', 3, `«${word}» — ${(share * 100).toFixed(1).replace('.', ',')}% текста (${topCount} раз)`,
        'Одно слово повторяется слишком часто — это похоже на переоптимизацию. Замените часть повторов синонимами и местоимениями.',
        { tool: tool('text-seo', 'Найти повторы', textState) });
    } else add('content', 'stuffing', 'Переспам', 'ok', 3, word ? `Самое частое слово «${word}» — ${(share * 100).toFixed(1).replace('.', ',')}%` : 'Нет');
  }

  if (f.images.total) {
    const missing = f.images.noAlt;
    add('content', 'alt', 'Alt у картинок', missing / f.images.total <= 0.1 ? 'ok' : 'warn', 4, `Без alt: ${missing} из ${f.images.total}`,
      missing / f.images.total <= 0.1 ? '' : 'Опишите картинки в атрибуте alt: так они попадут в поиск по картинкам, а поисковик лучше поймёт тему страницы. Для декоративных картинок оставьте alt="".');
  } else add('content', 'alt', 'Alt у картинок', 'info', 0, 'Картинок на странице нет');

  const latest = f.dates.length ? f.dates.reduce((a, b) => (b.date > a.date ? b : a)) : null;
  const freshTool = freshState ? tool('content-fresh', 'Проверить свежесть всех страниц', freshState) : tool('content-fresh', 'Открыть ContentFresh', null);
  if (!latest) {
    add('content', 'fresh', 'Дата обновления', 'info', 0, 'Не указана',
      'Поисковики любят свежие страницы. Укажите дату обновления: dateModified в разметке Article или lastmod в sitemap.xml — и обновляйте контент хотя бы раз в год.',
      { tool: freshTool, guide: 'aktualizaciya-kontenta' });
  } else {
    const days = Math.floor((Date.now() - latest.date.getTime()) / 864e5);
    add('content', 'fresh', 'Дата обновления', days > 365 ? 'warn' : 'ok', 2, `${latest.date.toLocaleDateString('ru-RU')} (${latest.source})`,
      days > 365 ? 'Страница не обновлялась больше года. Освежите цифры, примеры и даты — устаревший контент постепенно теряет позиции.' : '',
      { tool: freshTool, guide: 'aktualizaciya-kontenta' });
  }

  // --- Техника ---
  if (f.url.protocol !== 'https:') {
    add('tech', 'https', 'HTTPS', 'fail', 8, 'Сайт открывается по http://',
      'Без HTTPS браузеры помечают сайт как «Не защищено», а поисковики ранжируют ниже. Подключите SSL-сертификат (у большинства хостингов он бесплатный) и настройте 301-редирект на https.');
  } else if (data.certError) {
    add('tech', 'https', 'HTTPS', 'fail', 10, `Сертификат недействителен (${data.certError})`,
      'Браузер покажет посетителям предупреждение об опасности, большинство уйдёт. Продлите или переустановите SSL-сертификат.');
  } else add('tech', 'https', 'HTTPS', 'ok', 8, 'Защищённое соединение, сертификат действителен');

  if (data.http && !data.http.error) {
    const toHttps = data.http.location?.startsWith('https://');
    const permanent = [301, 308].includes(data.http.status);
    if (toHttps && permanent) add('tech', 'http-redirect', 'Редирект с http на https', 'ok', 4, `${data.http.status} → https`);
    else {
      add('tech', 'http-redirect', 'Редирект с http на https', 'warn', 4,
        toHttps ? `Временный редирект ${data.http.status}` : `http-версия отвечает кодом ${data.http.status} без перехода на https`,
        toHttps ? 'Замените временный редирект на постоянный 301.' : 'http- и https-версии открываются отдельно — для поисковика это дубли. Настройте 301-редирект с http на https.');
    }
  }

  if (data.mirror && !data.mirror.error) {
    const loc = data.mirror.location ? new URL(data.mirror.location) : null;
    const glued = loc && loc.hostname === f.url.hostname;
    const host = new URL(data.mirror.url).hostname;
    if (glued && [301, 308].includes(data.mirror.status)) add('tech', 'mirror', 'Зеркало с www и без', 'ok', 3, `${host} → ${f.url.hostname}`);
    else if (glued || data.mirror.status === 200) {
      add('tech', 'mirror', 'Зеркало с www и без', 'warn', 3, glued ? `${host}: временный редирект ${data.mirror.status}` : `${host} открывается отдельно (код 200)`,
        glued ? 'Используйте постоянный 301-редирект на основное зеркало.' : 'Сайт открывается и с www, и без — это два сайта-дубля. Выберите основное зеркало и настройте 301-редирект со второго.');
    }
  }

  if (!f.viewport) {
    add('tech', 'viewport', 'Мобильная версия', 'fail', 6, 'Нет meta viewport',
      'Без <meta name="viewport" content="width=device-width, initial-scale=1"> страница на телефоне будет мелкой. Google оценивает сайты по мобильной версии.');
  } else add('tech', 'viewport', 'Мобильная версия', 'ok', 6, 'meta viewport указан');

  const ttfb = data.ttfb;
  add('tech', 'ttfb', 'Время ответа сервера', ttfb < 600 ? 'ok' : ttfb < 1500 ? 'warn' : 'fail', 5, `${ttfb} мс`,
    ttfb < 600 ? '' : 'Сервер отвечает медленно — это замедляет загрузку и обход сайта роботами. Включите кэширование страниц, проверьте тариф хостинга и тяжёлые плагины. Замер сделан с нашего сервера в США — из России цифра может отличаться.');

  const kb = Math.round(data.bytes / 1024);
  add('tech', 'size', 'Размер HTML', data.truncated ? 'fail' : kb > 500 ? 'warn' : 'ok', 2, data.truncated ? 'Больше 3 МБ' : `${kb} КБ`,
    kb > 500 || data.truncated ? 'HTML-код очень тяжёлый: проверьте встроенные картинки (base64), огромные списки и инлайн-скрипты.' : '');

  const enc = (data.headers['content-encoding'] || '').toLowerCase();
  if (data.bytes > 10240) {
    add('tech', 'compression', 'Сжатие', /gzip|br|deflate|zstd/.test(enc) ? 'ok' : 'warn', 3, enc ? enc : 'Не включено',
      enc ? '' : 'Сервер отдаёт HTML без сжатия. Включите gzip или brotli в настройках сервера — страница станет легче в 3–5 раз.');
  }

  if (f.insecure.length) {
    add('tech', 'mixed', 'Смешанный контент', 'warn', 3, `${f.insecure.length} ${plural(f.insecure.length, 'ресурс', 'ресурса', 'ресурсов')} по http://`,
      'На https-странице есть картинки, скрипты или стили по http:// — браузер их заблокирует или покажет «Не защищено». Замените адреса на https://.');
  } else if (f.url.protocol === 'https:') add('tech', 'mixed', 'Смешанный контент', 'ok', 3, 'Все ресурсы по https');

  add('tech', 'blocking', 'Блокирующие скрипты', f.blockingScripts > 3 ? 'warn' : 'ok', 2, `${f.blockingScripts} в <head> без async/defer`,
    f.blockingScripts > 3 ? 'Скрипты в <head> без async или defer задерживают отрисовку страницы. Добавьте им defer или перенесите в конец страницы.' : '');

  add('tech', 'lang', 'Язык страницы', f.lang ? 'ok' : 'warn', 2, f.lang ? `lang="${f.lang}"` : 'Не указан',
    f.lang ? '' : 'Укажите язык в теге <html lang="ru"> — это помогает поисковикам и программам чтения с экрана.');
  if (!f.charset) add('tech', 'charset', 'Кодировка', 'warn', 1, 'Не указана', 'Укажите <meta charset="utf-8"> первой строкой в <head>, иначе текст может отображаться «кракозябрами».');
  add('tech', 'favicon', 'Фавикон', f.favicon ? 'ok' : 'warn', 1, f.favicon ? 'Указан' : 'Не указан в HTML',
    f.favicon ? '' : 'Значок сайта показывается рядом с адресом в выдаче Яндекса и Google. Добавьте <link rel="icon" href="/favicon.ico">.');

  // --- Адрес и ссылки ---
  const problems = [];
  if (f.url.pathname.length > 115) problems.push('длинный адрес');
  if (/[A-Z]/.test(f.url.pathname)) problems.push('заглавные буквы');
  if (f.url.pathname.includes('_')) problems.push('подчёркивания');
  if (/%[0-9A-F]{2}/i.test(f.url.pathname)) problems.push('кириллица или спецсимволы');
  if ([...f.url.searchParams.keys()].length > 2) problems.push('много параметров');
  add('links', 'url', 'Адрес страницы (ЧПУ)', problems.length ? 'warn' : 'ok', 3, problems.length ? problems.join(', ') : f.url.pathname,
    problems.length ? 'Понятный адрес из латиницы в нижнем регистре через дефисы лучше запоминается и чаще кликается. Меняйте адреса существующих страниц только с 301-редиректом со старых.' : '',
    { tool: problems.length ? tool('url-builder', 'Сделать ЧПУ', { t: f.h1[0] || f.title || '', l: '', o: {} }) : null, guide: problems.length ? 'chpu' : undefined });

  const li = f.links.internal;
  add('links', 'internal', 'Внутренние ссылки', li >= 5 ? 'ok' : 'warn', 3, `Внутренних: ${li}, внешних: ${f.links.external}`,
    li >= 5 ? (f.links.nofollowInternal ? `Внутренних ссылок с nofollow: ${f.links.nofollowInternal} — для своих страниц он не нужен.` : '') : 'Мало ссылок на другие страницы сайта: робот хуже находит страницы, а вес не перераспределяется. Добавьте меню, хлебные крошки и ссылки на похожие материалы.');

  // --- Микроразметка ---
  const types = [...new Set([...f.ld.flatMap((x) => x.types), ...f.microdata])];
  const broken = f.ld.filter((x) => !x.ok).length;
  if (broken) {
    add('markup', 'schema', 'Микроразметка Schema.org', 'fail', 4, `Ошибок в JSON-LD: ${broken}`,
      'Блок JSON-LD с ошибкой синтаксиса поисковики пропускают целиком. Проверьте запятые и кавычки или соберите разметку заново.',
      { tool: tool('schema-builder', 'Собрать разметку заново'), guide: 'mikrorazmetka-json-ld' });
  } else if (types.length) add('markup', 'schema', 'Микроразметка Schema.org', 'ok', 4, types.slice(0, 8).join(', '), '', { guide: 'mikrorazmetka-json-ld' });
  else {
    add('markup', 'schema', 'Микроразметка Schema.org', 'warn', 4, 'Не найдена',
      'Разметка помогает поисковику понять страницу и может дать расширенный сниппет: хлебные крошки, рейтинг, цену, FAQ. Начните с Organization или WebSite для главной, Article — для статей, Product — для товаров.',
      { tool: tool('schema-builder', 'Создать разметку JSON-LD'), guide: 'mikrorazmetka-json-ld' });
  }

  const ogMissing = ['title', 'description', 'image'].filter((k) => !f.og[k]);
  add('markup', 'og', 'Open Graph', ogMissing.length ? 'warn' : 'ok', 3, ogMissing.length ? `Нет: ${ogMissing.map((k) => `og:${k}`).join(', ')}` : 'og:title, og:description, og:image',
    ogMissing.length ? 'Без Open Graph ссылка в мессенджерах и соцсетях будет без картинки и с случайным описанием. Добавьте og:title, og:description и og:image (1200×630).' : '');

  return out;
}

// ---------- Итог ----------

export function analyze(data) {
  const facts = extract(data);
  const checks = runChecks(data, facts);
  const scored = checks.filter((c) => c.status in STATUS_SCORE);
  const total = scored.reduce((s, c) => s + c.weight, 0);
  let score = Math.round((scored.reduce((s, c) => s + c.weight * STATUS_SCORE[c.status], 0) / total) * 100);
  const critical = checks.filter((c) => CRITICAL.has(c.id) && c.status === 'fail');
  if (critical.length) score = Math.min(score, CRITICAL_CAP);
  const counts = { ok: 0, warn: 0, fail: 0, info: 0 };
  for (const c of checks) counts[c.status]++;

  // Инструменты, которые помогут: по проблемам, от важных к мелким; Keyword Finder — всегда как следующий шаг.
  const order = { fail: 0, warn: 1, info: 2, ok: 3 };
  const issues = checks.filter((c) => c.status === 'fail' || c.status === 'warn').sort((a, b) => order[a.status] - order[b.status] || b.weight - a.weight);
  const helpers = new Map();
  for (const c of issues) {
    if (!c.tool) continue;
    const h = helpers.get(c.tool.id) || { ...c.tool, reasons: [] };
    h.reasons.push(c.title);
    helpers.set(c.tool.id, h);
  }
  if (!helpers.has('keyword-finder')) {
    helpers.set('keyword-finder', { ...tool('keyword-finder', 'Подобрать ключевые слова', null), reasons: ['Подобрать ключевые фразы для страницы и новых материалов'] });
  }

  return {
    score,
    grade: grade(score),
    critical: critical.map((c) => c.title),
    counts,
    checks,
    issues,
    helpers: [...helpers.values()],
    facts: { title: facts.title, description: facts.description, h1: facts.h1[0] || null, words: facts.words.length, url: facts.url.href, seed: facts.h1[0] || facts.title || '' },
  };
}
