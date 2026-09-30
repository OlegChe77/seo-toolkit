// HTML-шаблоны общих частей сайта. Выполняются при сборке (Vite-плагин),
// поэтому меню, хлебные крошки и метатеги попадают в статический HTML.
import { content } from '../config/content.js';
import { categories, chain, getCategory, home, tools } from '../config/pages.js';
import { art, icon, logo } from './icons.js';

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// JSON внутри <script> не должен содержать "</script>".
const jsonLd = (data) =>
  `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;

const absUrl = (site, path) => (path === '/' ? `${site}/` : `${site}${path}`);

// Главный инструмент: крупная карточка первой в сетке, пункт меню, ссылка в шапке и первое место в «Других инструментах».
const featuredTool = tools.find((t) => t.featured);

// Код счётчика Яндекс Метрики (как в интерфейсе Метрики, номер берётся из site.config.js).
// Счётчик запускается только после согласия на cookie: сразу, если согласие уже сохранено,
// или по кнопке «Принять» на плашке (src/core/consent.js вызывает window.seotkLoadMetrika).
// В url передаётся адрес без части после #: там лежат данные из ссылок «Поделиться».
const metrikaScript = (id) => `<!-- Yandex.Metrika counter -->
<script type="text/javascript">
  window.seotkMetrikaId = ${id};
  window.seotkLoadMetrika = function () {
    if (window.ym) return;
    (function(m,e,t,r,i,k,a){
        m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
        m[i].l=1*new Date();
        for (var j = 0; j < document.scripts.length; j++) {if (document.scripts[j].src === r) { return; }}
        k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)
    })(window, document,'script','https://mc.yandex.ru/metrika/tag.js?id=${id}', 'ym');

    ym(${id}, 'init', {ssr:true, webvisor:true, clickmap:true, ecommerce:"dataLayer", referrer: document.referrer, url: location.href.split('#')[0], accurateTrackBounce:true, trackLinks:true});
  };
  try { var c = JSON.parse(localStorage.getItem('seotk:cookie-consent')); if (c && c.analytics) window.seotkLoadMetrika(); } catch (e) {}
</script>
<!-- /Yandex.Metrika counter -->`;

// Тема применяется до отрисовки, чтобы не было вспышки светлой темы.
const themeBoot = `<script>(function(){try{var t=localStorage.getItem('seotk:theme');if(t)t=JSON.parse(t);if(t!=='dark'&&t!=='light')t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme='light'}})()</script>`;

export function renderHead(page, site) {
  const url = absUrl(site.url, page.path);
  const isTool = tools.includes(page);
  const isGuide = page.kind === 'guide';
  const image = `${site.url}${page.image || (isTool ? `/og/${page.id}.png` : '/og-image.png')}`;
  const imageAlt = isGuide ? page.h1 : isTool ? `${page.name} — ${page.h1.split(' — ')[1] || page.h1}` : `SEO Toolkit — ${tools.length} бесплатных SEO-инструментов`;
  const v = site.verification || {};
  const lines = [
    `<meta charset="UTF-8">`,
    `<meta name="viewport" content="width=device-width, initial-scale=1">`,
    site.metrika ? metrikaScript(site.metrika) : '',
    `<title>${esc(page.title)}</title>`,
    `<meta name="description" content="${esc(page.description)}">`,
    page.noindex
      ? `<meta name="robots" content="noindex, follow">`
      : `<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">\n<link rel="canonical" href="${esc(url)}">`,
    v.google ? `<meta name="google-site-verification" content="${esc(v.google)}">` : '',
    v.yandex ? `<meta name="yandex-verification" content="${esc(v.yandex)}">` : '',
    v.bing ? `<meta name="msvalidate.01" content="${esc(v.bing)}">` : '',
    `<meta property="og:type" content="${isGuide ? 'article' : 'website'}">`,
    isGuide ? `<meta property="article:published_time" content="${page.date}">\n<meta property="article:modified_time" content="${page.updated}">` : '',
    `<meta property="og:site_name" content="${esc(site.name)}">`,
    `<meta property="og:locale" content="${esc(site.locale)}">`,
    `<meta property="og:title" content="${esc(page.title)}">`,
    `<meta property="og:description" content="${esc(page.description)}">`,
    `<meta property="og:url" content="${esc(url)}">`,
    `<meta property="og:image" content="${esc(image)}">`,
    `<meta property="og:image:type" content="image/png">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta property="og:image:alt" content="${esc(imageAlt)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${esc(page.title)}">`,
    `<meta name="twitter:description" content="${esc(page.description)}">`,
    `<meta name="twitter:image" content="${esc(image)}">`,
    `<meta name="theme-color" content="#f6f7f9" media="(prefers-color-scheme: light)">`,
    `<meta name="theme-color" content="#0e1116" media="(prefers-color-scheme: dark)">`,
    `<meta name="color-scheme" content="light dark">`,
    `<link rel="icon" href="/favicon.svg" type="image/svg+xml">`,
    `<link rel="icon" href="/favicon.ico" sizes="32x32">`,
    `<link rel="apple-touch-icon" href="/apple-touch-icon.png">`,
    `<link rel="manifest" href="/site.webmanifest">`,
    themeBoot,
  ].filter(Boolean);

  if (!page.noindex) lines.push(jsonLd({ '@context': 'https://schema.org', '@graph': structuredData(page, site, url, image) }));
  return lines.join('\n');
}

function faqEntity(id) {
  const faq = content[id]?.faq;
  if (!faq?.length) return null;
  return {
    '@type': 'FAQPage',
    mainEntity: faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
  };
}

const organization = (site) => ({ '@type': 'Organization', '@id': `${site.url}/#org`, name: site.name, url: `${site.url}/`, logo: `${site.url}/icon-512.png` });

function structuredData(page, site, url, image) {
  const website = { '@type': 'WebSite', '@id': `${site.url}/#website`, name: site.name, url: `${site.url}/`, inLanguage: site.lang, description: home.description };
  const crumbs = (...items) => ({
    '@type': 'BreadcrumbList',
    itemListElement: [{ name: 'Главная', item: `${site.url}/` }, ...items].map((x, i) => ({ '@type': 'ListItem', position: i + 1, ...x })),
  });
  if (page.kind === 'guide') {
    return [
      {
        '@type': 'Article',
        '@id': `${url}#article`,
        headline: page.h1,
        description: page.description,
        image,
        datePublished: page.date,
        dateModified: page.updated,
        inLanguage: site.lang,
        mainEntityOfPage: url,
        author: organization(site),
        publisher: organization(site),
        about: page.tools.map((id) => tools.find((t) => t.id === id)).filter(Boolean).map((t) => ({ '@type': 'WebApplication', name: t.name, url: absUrl(site.url, t.path) })),
      },
      crumbs({ name: 'Гайды', item: `${site.url}/guides` }, { name: page.h1, item: url }),
    ];
  }
  if (page.id === 'guides') {
    return [
      {
        '@type': 'CollectionPage',
        '@id': `${url}#page`,
        name: page.h1,
        description: page.description,
        url,
        inLanguage: site.lang,
        isPartOf: { '@id': `${site.url}/#website` },
        mainEntity: {
          '@type': 'ItemList',
          itemListElement: (site.guides || []).map((g, i) => ({ '@type': 'ListItem', position: i + 1, name: g.h1, url: absUrl(site.url, g.path) })),
        },
      },
      crumbs({ name: 'Гайды', item: url }),
    ];
  }
  if (page.id === 'index') {
    const faq = faqEntity('index');
    return [
      website,
      {
        '@type': 'ItemList',
        name: 'SEO-инструменты',
        itemListElement: tools.map((t, i) => ({ '@type': 'ListItem', position: i + 1, name: t.name, url: absUrl(site.url, t.path) })),
      },
      faq && { ...faq, '@id': `${url}#faq` },
    ].filter(Boolean);
  }
  const cat = getCategory(page.category);
  const faq = faqEntity(page.id);
  return [
    {
      '@type': 'WebApplication',
      '@id': `${url}#app`,
      name: page.name,
      alternateName: page.h1,
      description: page.description,
      url,
      image,
      applicationCategory: 'BusinessApplication',
      applicationSubCategory: 'SEO',
      operatingSystem: 'Any',
      browserRequirements: 'Требуется современный браузер с поддержкой JavaScript',
      inLanguage: site.lang,
      isAccessibleForFree: true,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'RUB' },
      isPartOf: { '@id': `${site.url}/#website` },
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Главная', item: `${site.url}/` },
        { '@type': 'ListItem', position: 2, name: cat.name, item: `${site.url}/#${cat.id}` },
        { '@type': 'ListItem', position: 3, name: page.name, item: url },
      ],
    },
    faq && { ...faq, '@id': `${url}#faq` },
  ].filter(Boolean);
}

/** Текст об инструменте и частые вопросы (видимая часть разметки FAQPage). */
export function renderSeoContent(page) {
  const c = content[page.id];
  if (!c) return '';
  const faq = c.faq
    .map(([q, a], i) => `<details class="faq-item"${i === 0 ? ' open' : ''}><summary><h3>${esc(q)}</h3>${icon('chevron-down')}</summary><p>${esc(a)}</p></details>`)
    .join('');
  return `<section class="panel seo-content" aria-labelledby="about-${page.id}">
  <div class="seo-content-grid">
    <div class="seo-text">
      <h2 id="about-${page.id}">${esc(c.heading)}</h2>
      ${c.intro.map((p) => `<p>${p}</p>`).join('\n      ')}
    </div>
    <div class="faq">
      <h2>Частые вопросы</h2>
      ${faq}
    </div>
  </div>
</section>`;
}

function navGroups(currentId) {
  return categories
    .map((cat) => {
      const items = tools
        .filter((t) => t.category === cat.id)
        .map(
          (t) => `<li><a class="nav-link${t.id === currentId ? ' is-current' : ''}${t.featured ? ' nav-link--featured' : ''}" href="${t.path}"${
            t.id === currentId ? ' aria-current="page"' : ''
          }><span class="tool-icon tool-icon--sm cat-${cat.id}">${art(t.icon, 26)}</span><span><span class="nav-link-name">${esc(t.name)}${
            t.featured ? ' <span class="badge-new">главный</span>' : ''
          }</span><span class="nav-link-desc">${esc(t.short)}</span></span></a></li>`,
        )
        .join('');
      return `<div class="nav-group"><p class="nav-group-title">${esc(cat.name)}</p><ul>${items}</ul></div>`;
    })
    .join('');
}

export function renderHeader(page, site = {}) {
  return `<a class="skip-link" href="#main">Перейти к содержимому</a>
<header class="site-header">
  <div class="container header-inner">
    <a class="logo" href="/" aria-label="SEO Toolkit — на главную">${logo}<span class="logo-text">SEO Toolkit</span></a>
    <nav class="main-nav" aria-label="Инструменты">
      <details class="nav-menu" data-nav-menu>
        <summary class="nav-summary">${icon('menu', 'icon nav-icon-menu')}<span>Инструменты</span>${icon('chevron-down', 'icon nav-icon-chevron')}</summary>
        <div class="nav-panel">
          <div class="nav-panel-inner">${navGroups(page.id)}</div>
          <div class="nav-panel-footer"><a href="/">${icon('home')}Главная</a><a href="/guides">${icon('book')}Гайды по SEO</a><a href="/#tools">Все инструменты${icon('arrow-right')}</a></div>
        </div>
      </details>
    </nav>
    <a class="header-link${page.kind === 'guide' || page.id === 'guides' ? ' is-current' : ''}" href="/guides">${icon('book')}<span>Гайды</span></a>
    ${featuredTool && page.id !== featuredTool.id ? `<a class="header-feature" href="${featuredTool.path}">${icon('search')}<span>Подбор ключей</span></a>` : ''}
    <button class="icon-btn theme-toggle" type="button" data-theme-toggle aria-label="Переключить тему" title="Переключить тему">${icon('moon', 'icon icon-moon')}${icon('sun', 'icon icon-sun')}</button>
  </div>
</header>`;
}

const CHAIN_STEPS = { 'keyword-finder': 'Подбор ключей', 'intent-finder': 'Интент запросов', 'key-cluster': 'Кластеры и страницы' };

/** Шаги сбора семантики над Keyword Finder, IntentFinder и KeyCluster. */
export function renderChain(page) {
  if (!chain.includes(page.id)) return '';
  const items = chain
    .map((id, i) => {
      const t = tools.find((x) => x.id === id);
      const current = id === page.id;
      return `<li${current ? ' class="is-current"' : ''}><a href="${t.path}"${current ? ' aria-current="step"' : ''}><span class="chain-num">${i + 1}</span><span><b>${esc(t.name)}</b><small>${esc(CHAIN_STEPS[id])}</small></span></a></li>`;
    })
    .join('');
  return `<nav class="chain" aria-label="Сбор семантики по шагам"><ol>${items}</ol></nav>`;
}

export function renderHero(page) {
  const cat = getCategory(page.category);
  return `<div class="page-hero">
  <div class="container">
    <nav class="breadcrumbs" aria-label="Хлебные крошки">
      <ol>
        <li><a href="/">Главная</a></li>
        <li><a href="/#${cat.id}">${esc(cat.name)}</a></li>
        <li><span aria-current="page">${esc(page.name)}</span></li>
      </ol>
    </nav>
    <div class="hero-row">
      <span class="tool-icon tool-icon--lg cat-${cat.id}">${art(page.icon, 46, { lazy: false })}</span>
      <div>
        <h1>${esc(page.h1)}</h1>
        <p class="lead">${esc(page.summary)}</p>
      </div>
    </div>
  </div>
</div>`;
}

export function renderToolCard(tool, headingTag = 'h3') {
  const cat = getCategory(tool.category);
  return `<article class="tool-card${tool.featured ? ' tool-card--featured' : ''}" data-category="${cat.id}" data-search="${esc(
    `${tool.name} ${tool.h1} ${tool.summary} ${tool.keywords} ${cat.name}`.toLowerCase(),
  )}">
  <div class="tool-card-top">
    <span class="tool-icon cat-${cat.id}">${art(tool.icon, 36)}</span>
    ${tool.featured ? `<span class="tag tag--featured">${icon('sparkle')}Главный инструмент</span>` : `<span class="tag cat-${cat.id}">${esc(cat.name)}</span>`}
  </div>
  <${headingTag} class="tool-card-title"><a href="${tool.path}">${esc(tool.name)}</a></${headingTag}>
  <p class="tool-card-desc">${esc(tool.summary)}</p>
  <span class="tool-card-cta" aria-hidden="true">Открыть инструмент${icon('arrow-right')}</span>
</article>`;
}

export function renderToolCards() {
  return tools.map((t) => renderToolCard(t)).join('\n');
}

export function renderCategoryChips() {
  const count = (id) => tools.filter((t) => t.category === id).length;
  return [
    `<button type="button" class="chip is-active" data-category="all" aria-pressed="true">Все <span class="chip-count">${tools.length}</span></button>`,
    ...categories.map(
      (c) =>
        `<button type="button" class="chip" data-category="${c.id}" aria-pressed="false">${esc(c.name)} <span class="chip-count">${count(c.id)}</span></button>`,
    ),
  ].join('');
}

export function renderRelated(page, site = {}) {
  const same = tools.filter((t) => t.category === page.category && t.id !== page.id);
  const idx = tools.findIndex((t) => t.id === page.id);
  const rest = [...tools.slice(idx + 1), ...tools.slice(0, idx)].filter(
    (t) => t.category !== page.category,
  );
  // Главный инструмент всегда первым: на него ведут ссылки со всех страниц.
  const lead = featuredTool && featuredTool.id !== page.id ? [featuredTool] : [];
  const picked = [...lead, ...[...same, ...rest].filter((t) => !lead.includes(t))].slice(0, 4);
  return `<section class="related" aria-labelledby="related-title">
  <div class="container">
    <div class="section-head">
      <h2 id="related-title">Другие инструменты</h2>
      <a class="link-arrow" href="/#tools">Все ${tools.length} инструментов${icon('arrow-right')}</a>
    </div>
    <div class="tools-grid tools-grid--compact">${picked.map((t) => renderToolCard(t)).join('\n')}</div>
    ${renderToolGuides(page, site.guides)}
  </div>
</section>`;
}

/** Ссылки на гайды, в которых используется инструмент. */
function renderToolGuides(page, guides = []) {
  const list = guides.filter((g) => g.tools.includes(page.id)).slice(0, 4);
  if (!list.length) return '';
  return `<div class="tool-guides">
      <h3>${icon('book')}Гайды по теме</h3>
      <ul>${list.map((g) => `<li><a href="${g.path}">${esc(g.h1)}</a><span class="muted"> · ${g.minutes} мин</span></li>`).join('')}</ul>
    </div>`;
}

export function renderFooter(site = {}) {
  const cols = categories
    .map(
      (cat) => `<div class="footer-col"><p class="footer-title">${esc(cat.name)}</p><ul>${tools
        .filter((t) => t.category === cat.id)
        .map((t) => `<li><a href="${t.path}">${esc(t.name)}</a></li>`)
        .join('')}</ul></div>`,
    )
    .join('');
  const guides = site.guides || [];
  const guideCol = guides.length
    ? `<div class="footer-col"><p class="footer-title"><a href="/guides">Гайды</a></p><ul>${guides
        .slice(0, 6)
        .map((g) => `<li><a href="${g.path}">${esc(g.navTitle || g.h1)}</a></li>`)
        .join('')}</ul></div>`
    : '';
  return `<footer class="site-footer">
  <div class="container footer-grid">
    <div class="footer-about">
      <a class="logo" href="/">${logo}<span class="logo-text">SEO Toolkit</span></a>
      <p>Бесплатные SEO-инструменты, которые работают прямо в браузере. Без регистрации и API-ключей — тексты и файлы обрабатываются на вашем устройстве.</p>
      <p class="footer-also">Другие наши сервисы: <a href="https://rastr.onrender.com/" target="_blank" rel="noopener">Растр</a> — конвертер картинок и документов в браузере; <a href="https://ytkombain.onrender.com/" target="_blank" rel="noopener">YouTube Комбайн</a> — бесплатные инструменты для YouTube.</p>
      <p class="footer-note">Обезличенная статистика посещений собирается Яндекс Метрикой только с вашего согласия. Содержимое полей и результаты инструментов в неё не передаются.</p>
    </div>
    <nav class="footer-nav" aria-label="Все инструменты и гайды">${cols}${guideCol}</nav>
  </div>
  <div class="container footer-bottom">
    <span>© ${new Date().getFullYear()} SEO Toolkit · Иконки: набор «SEO Marketing Flat Line», автор rixwan</span>
    <span><a href="/privacy">Конфиденциальность и cookie</a>${site.metrika ? ' · <button type="button" class="link-btn" data-cookie-settings>Настройки cookie</button>' : ''} · <a href="/sitemap.xml">Карта сайта</a></span>
  </div>
</footer>
<div class="toasts ym-hide-content" data-toasts role="status" aria-live="polite"></div>`;
}

export function renderSitemap(site, pages) {
  const date = new Date().toISOString().slice(0, 10);
  const urls = pages
    .filter((p) => !p.noindex)
    .map((p) => {
      const priority = p.id === 'index' ? '1.0' : p.kind === 'guide' ? '0.6' : p.id === 'guides' ? '0.7' : '0.8';
      return `  <url>\n    <loc>${esc(absUrl(site.url, p.path))}</loc>\n    <lastmod>${p.updated || date}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>${priority}</priority>\n  </url>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

export function renderRobots(site) {
  return [
    'User-agent: *',
    'Allow: /',
    '',
    '# Яндекс: не индексировать дубли страниц с рекламными метками',
    'Clean-param: utm_source&utm_medium&utm_campaign&utm_term&utm_content&yclid&gclid&fbclid /',
    '',
    `Sitemap: ${site.url}/sitemap.xml`,
    '',
  ].join('\n');
}

/** Краткое описание сайта для ИИ-ассистентов (формат llmstxt.org). */
export function renderLlms(site) {
  const list = categories
    .map((c) => `## ${c.name}\n\n${tools.filter((t) => t.category === c.id).map((t) => `- [${t.name}](${site.url}${t.path}): ${t.summary}`).join('\n')}`)
    .join('\n\n');
  const guides = (site.guides || []).map((g) => `- [${g.h1}](${site.url}${g.path}): ${g.summary}`).join('\n');
  return `# ${site.name}\n\n> ${home.description}\n\nВсе инструменты бесплатные и работают в браузере без регистрации. Главный инструмент — Keyword Finder: подбор ключевых слов с примерной частотностью по подсказкам Google и Яндекса.\n\n${list}\n${guides ? `\n## Гайды\n\n${guides}\n` : ''}`;
}

export { art, icon };
