// Vite-плагин сайта:
//  • вставляет в каждую страницу метатеги, шапку, хлебные крошки и подвал;
//  • заменяет {{icon:name}} на inline-SVG;
//  • в dev/preview открывает страницы по «чистым» URL (/serp-preview) и отдаёт 404.html;
//  • при сборке переносит HTML из dist/pages в корень dist и создаёт sitemap.xml, robots.txt,
//    llms.txt, site.webmanifest и файл ключа IndexNow.
import fs from 'node:fs';
import path from 'node:path';
import { allPages, home, notFound, tools } from '../src/config/pages.js';
import {
  art,
  icon,
  renderCategoryChips,
  renderFooter,
  renderHead,
  renderHeader,
  renderHero,
  renderLlms,
  renderRelated,
  renderRobots,
  renderSeoContent,
  renderSitemap,
  renderToolCards,
} from '../src/layout/templates.js';

const pageById = new Map(allPages.map((p) => [p.id, p]));
const pathToId = new Map(allPages.map((p) => [p.path, p.id]));

export function pageInputs(root) {
  return Object.fromEntries(allPages.map((p) => [p.id, path.resolve(root, 'pages', `${p.id}.html`)]));
}

function renderPage(html, page, site) {
  const isTool = tools.includes(page);
  const parts = {
    head: renderHead(page, site),
    header: renderHeader(page, site),
    hero: isTool ? renderHero(page) : '',
    related: isTool ? renderRelated(page) : '',
    'seo-content': renderSeoContent(page),
    footer: renderFooter(site),
    'tool-cards': renderToolCards(),
    'category-chips': renderCategoryChips(),
  };
  return html
    .replace(/<!--@([\w-]+)-->/g, (m, key) => parts[key] ?? m)
    .replace(/\{\{icon:([\w-]+)\}\}/g, (_, name) => icon(name))
    .replace(/\{\{art:([\w-]+)(?::(\d+))?\}\}/g, (_, name, size) => art(name, Number(size) || 40));
}

// Возвращает id страницы для «чистого» URL или null.
function resolveCleanPath(pathname) {
  if (pathname === '/' || pathname === '/index.html') return { id: 'index' };
  const trimmed = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  const id = pathToId.get(trimmed);
  if (!id || id === notFound.id) return null;
  return trimmed === pathname ? { id } : { redirect: trimmed };
}

// Служебные файлы, которые генерируются из конфигурации сайта.
function generatedFiles(site) {
  const files = {
    'sitemap.xml': ['application/xml', renderSitemap(site, allPages)],
    'robots.txt': ['text/plain', renderRobots(site)],
    'llms.txt': ['text/plain', renderLlms(site)],
    'site.webmanifest': [
      'application/manifest+json',
      JSON.stringify(
        {
          name: `${site.name} — SEO-инструменты онлайн`,
          short_name: site.name,
          description: home.description,
          lang: site.lang,
          start_url: '/',
          scope: '/',
          display: 'standalone',
          background_color: '#f6f7f9',
          theme_color: '#2f5bea',
          icons: [
            { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: '/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        null,
        2,
      ),
    ],
  };
  if (site.indexNowKey) files[`${site.indexNowKey}.txt`] = ['text/plain', site.indexNowKey];
  return files;
}

export default function sitePlugin(site) {
  let outDir = 'dist';
  let isBuild = false;

  const devMiddleware = (mode) => (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    const [pathname, query = ''] = req.url.split('?');
    const qs = query ? `?${query}` : '';

    const generated = mode === 'dev' && generatedFiles(site)[pathname.slice(1)];
    if (generated) {
      res.setHeader('Content-Type', `${generated[0]}; charset=utf-8`);
      return res.end(generated[1]);
    }

    const match = resolveCleanPath(pathname);
    if (match?.redirect) {
      res.statusCode = 301;
      res.setHeader('Location', match.redirect + qs);
      return res.end();
    }
    if (match) {
      req.url = (mode === 'dev' ? `/pages/${match.id}.html` : `/${match.id}.html`) + qs;
      return next();
    }

    // Неизвестный путь без расширения — отдаём страницу 404, как на хостинге.
    const isAsset = /\.[a-z0-9]+$/i.test(pathname) || pathname.startsWith('/@') || pathname.startsWith('/src/') || pathname.startsWith('/node_modules/') || pathname.startsWith('/pages/');
    if (!isAsset) {
      if (mode === 'preview') {
        const file = path.resolve(outDir, '404.html');
        if (fs.existsSync(file)) {
          res.statusCode = 404;
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          return res.end(fs.readFileSync(file));
        }
      } else {
        req.url = '/pages/404.html';
        res.statusCode = 404;
      }
    }
    return next();
  };

  return {
    name: 'seo-toolkit-site',

    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
      isBuild = config.command === 'build';
    },

    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        const id = path.basename(ctx.filename, '.html');
        const page = pageById.get(id) ?? home;
        // Счётчик Метрики подключается только в продакшн-сборке, чтобы не учитывать визиты разработки.
        return renderPage(html, page, { ...site, metrika: isBuild ? site.metrikaId : null });
      },
    },

    configureServer(server) {
      server.middlewares.use(devMiddleware('dev'));
    },

    configurePreviewServer(server) {
      server.middlewares.use(devMiddleware('preview'));
    },

    closeBundle() {
      const pagesDir = path.join(outDir, 'pages');
      if (fs.existsSync(pagesDir)) {
        for (const file of fs.readdirSync(pagesDir)) {
          fs.renameSync(path.join(pagesDir, file), path.join(outDir, file));
        }
        fs.rmSync(pagesDir, { recursive: true, force: true });
      }
      if (fs.existsSync(outDir)) {
        for (const [name, [, body]] of Object.entries(generatedFiles(site))) fs.writeFileSync(path.join(outDir, name), body);
      }
    },
  };
}
