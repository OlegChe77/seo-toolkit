// HTML-шаблоны общих частей сайта. Выполняются при сборке (Vite-плагин),
// поэтому меню, хлебные крошки и метатеги попадают в статический HTML.
import { categories, tools, getCategory } from '../config/pages.js';
import { icon, logo } from './icons.js';

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

// Тема применяется до отрисовки, чтобы не было вспышки светлой темы.
const themeBoot = `<script>(function(){try{var t=localStorage.getItem('seotk:theme');if(t)t=JSON.parse(t);if(t!=='dark'&&t!=='light')t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme='light'}})()</script>`;

export function renderHead(page, site) {
  const url = absUrl(site.url, page.path);
  const lines = [
    `<meta charset="UTF-8">`,
    `<meta name="viewport" content="width=device-width, initial-scale=1">`,
    `<title>${esc(page.title)}</title>`,
    `<meta name="description" content="${esc(page.description)}">`,
    page.noindex
      ? `<meta name="robots" content="noindex, follow">`
      : `<meta name="robots" content="index, follow">\n<link rel="canonical" href="${esc(url)}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="${esc(site.name)}">`,
    `<meta property="og:locale" content="${esc(site.locale)}">`,
    `<meta property="og:title" content="${esc(page.title)}">`,
    `<meta property="og:description" content="${esc(page.description)}">`,
    `<meta property="og:url" content="${esc(url)}">`,
    `<meta property="og:image" content="${esc(site.url)}/og-image.png">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta property="og:image:alt" content="SEO Toolkit — набор SEO-инструментов">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="theme-color" content="#f6f7f9" media="(prefers-color-scheme: light)">`,
    `<meta name="theme-color" content="#0e1116" media="(prefers-color-scheme: dark)">`,
    `<meta name="color-scheme" content="light dark">`,
    `<link rel="icon" href="/favicon.svg" type="image/svg+xml">`,
    `<link rel="icon" href="/favicon.ico" sizes="32x32">`,
    `<link rel="apple-touch-icon" href="/apple-touch-icon.png">`,
    themeBoot,
  ];

  if (page.id === 'index') {
    lines.push(
      jsonLd({
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: site.name,
        url: `${site.url}/`,
        inLanguage: site.lang,
        description: page.description,
      }),
    );
  } else if (!page.noindex) {
    const cat = getCategory(page.category);
    lines.push(
      jsonLd({
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Главная', item: `${site.url}/` },
          { '@type': 'ListItem', position: 2, name: cat.name, item: `${site.url}/#${cat.id}` },
          { '@type': 'ListItem', position: 3, name: page.name, item: url },
        ],
      }),
    );
  }
  return lines.join('\n');
}

function navGroups(currentId) {
  return categories
    .map((cat) => {
      const items = tools
        .filter((t) => t.category === cat.id)
        .map(
          (t) => `<li><a class="nav-link${t.id === currentId ? ' is-current' : ''}" href="${t.path}"${
            t.id === currentId ? ' aria-current="page"' : ''
          }><span class="tool-icon tool-icon--sm cat-${cat.id}">${icon(t.icon)}</span><span><span class="nav-link-name">${esc(t.name)}</span><span class="nav-link-desc">${esc(t.short)}</span></span></a></li>`,
        )
        .join('');
      return `<div class="nav-group"><p class="nav-group-title">${esc(cat.name)}</p><ul>${items}</ul></div>`;
    })
    .join('');
}

export function renderHeader(page) {
  return `<a class="skip-link" href="#main">Перейти к содержимому</a>
<header class="site-header">
  <div class="container header-inner">
    <a class="logo" href="/" aria-label="SEO Toolkit — на главную">${logo}<span class="logo-text">SEO Toolkit</span></a>
    <nav class="main-nav" aria-label="Инструменты">
      <details class="nav-menu" data-nav-menu>
        <summary class="nav-summary">${icon('menu', 'icon nav-icon-menu')}<span>Инструменты</span>${icon('chevron-down', 'icon nav-icon-chevron')}</summary>
        <div class="nav-panel">
          <div class="nav-panel-inner">${navGroups(page.id)}</div>
          <div class="nav-panel-footer"><a href="/">${icon('home')}Главная</a><a href="/#tools">Все инструменты${icon('arrow-right')}</a></div>
        </div>
      </details>
    </nav>
    <button class="icon-btn theme-toggle" type="button" data-theme-toggle aria-label="Переключить тему" title="Переключить тему">${icon('moon', 'icon icon-moon')}${icon('sun', 'icon icon-sun')}</button>
  </div>
</header>`;
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
      <span class="tool-icon tool-icon--lg cat-${cat.id}">${icon(page.icon)}</span>
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
  return `<article class="tool-card" data-category="${cat.id}" data-search="${esc(
    `${tool.name} ${tool.h1} ${tool.summary} ${tool.keywords} ${cat.name}`.toLowerCase(),
  )}">
  <div class="tool-card-top">
    <span class="tool-icon cat-${cat.id}">${icon(tool.icon)}</span>
    <span class="tag cat-${cat.id}">${esc(cat.name)}</span>
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

export function renderRelated(page) {
  const same = tools.filter((t) => t.category === page.category && t.id !== page.id);
  const idx = tools.findIndex((t) => t.id === page.id);
  const rest = [...tools.slice(idx + 1), ...tools.slice(0, idx)].filter(
    (t) => t.category !== page.category,
  );
  const picked = [...same, ...rest].slice(0, 4);
  return `<section class="related" aria-labelledby="related-title">
  <div class="container">
    <div class="section-head">
      <h2 id="related-title">Другие инструменты</h2>
      <a class="link-arrow" href="/#tools">Все 10 инструментов${icon('arrow-right')}</a>
    </div>
    <div class="tools-grid tools-grid--compact">${picked.map((t) => renderToolCard(t)).join('\n')}</div>
  </div>
</section>`;
}

export function renderFooter() {
  const cols = categories
    .map(
      (cat) => `<div class="footer-col"><p class="footer-title">${esc(cat.name)}</p><ul>${tools
        .filter((t) => t.category === cat.id)
        .map((t) => `<li><a href="${t.path}">${esc(t.name)}</a></li>`)
        .join('')}</ul></div>`,
    )
    .join('');
  return `<footer class="site-footer">
  <div class="container footer-grid">
    <div class="footer-about">
      <a class="logo" href="/">${logo}<span class="logo-text">SEO Toolkit</span></a>
      <p>Бесплатные SEO-инструменты, которые работают прямо в браузере. Без регистрации и API-ключей — введённые данные не отправляются на сервер.</p>
    </div>
    <nav class="footer-nav" aria-label="Все инструменты">${cols}</nav>
  </div>
  <div class="container footer-bottom">
    <span>© ${new Date().getFullYear()} SEO Toolkit</span>
    <span><a href="/">Главная</a> · <a href="/sitemap.xml">Карта сайта</a></span>
  </div>
</footer>
<div class="toasts" data-toasts role="status" aria-live="polite"></div>`;
}

export function renderSitemap(site, pages) {
  const date = new Date().toISOString().slice(0, 10);
  const urls = pages
    .filter((p) => !p.noindex)
    .map(
      (p) =>
        `  <url>\n    <loc>${esc(absUrl(site.url, p.path))}</loc>\n    <lastmod>${date}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>${p.id === 'index' ? '1.0' : '0.8'}</priority>\n  </url>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

export function renderRobots(site) {
  return `User-agent: *\nAllow: /\n\nSitemap: ${site.url}/sitemap.xml\n`;
}

export { icon };
