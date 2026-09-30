// Шаблоны раздела «Гайды» (выполняются при сборке).
import { tools } from '../config/pages.js';
import { art, icon } from './icons.js';
import { renderToolCard } from './templates.js';

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
export const humanDate = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
};

const toolById = (id) => tools.find((t) => t.id === id);

export function renderGuideCard(g, headingTag = 'h3') {
  return `<article class="guide-card">
  <span class="tool-icon guide-icon">${art(g.icon, 36)}</span>
  <div class="guide-card-body">
    <${headingTag} class="guide-card-title"><a href="${g.path}">${esc(g.h1)}</a></${headingTag}>
    <p class="guide-card-desc">${esc(g.summary)}</p>
    <p class="guide-meta">${icon('clock')}${g.minutes} мин чтения</p>
  </div>
</article>`;
}

/** Карточки гайдов для главной и страницы раздела. */
export function renderGuideCards(guides = [], limit = Infinity) {
  return guides
    .slice(0, limit)
    .map((g) => renderGuideCard(g))
    .join('\n');
}

export function renderGuideArticle(g, guides = []) {
  const related = guides.filter((x) => x.slug !== g.slug);
  // Сначала гайды про те же инструменты.
  related.sort((a, b) => b.tools.filter((t) => g.tools.includes(t)).length - a.tools.filter((t) => g.tools.includes(t)).length);
  const guideTools = g.tools.map(toolById).filter(Boolean);
  const toc = g.toc.length
    ? `<nav class="guide-toc" aria-label="Содержание"><p class="guide-toc-title">Содержание</p><ol>${g.toc.map((t) => `<li><a href="#${t.id}">${esc(t.text)}</a></li>`).join('')}</ol></nav>`
    : '';
  const toolLinks = guideTools.length
    ? `<div class="guide-aside-tools"><p class="guide-toc-title">Инструменты</p><ul>${guideTools
        .map((t) => `<li><a href="${t.path}" data-goal="guide_tool_click"><span class="tool-icon tool-icon--sm cat-${t.category}">${art(t.icon, 26)}</span>${esc(t.name)}</a></li>`)
        .join('')}</ul></div>`
    : '';
  return `<div class="page-hero">
  <div class="container">
    <nav class="breadcrumbs" aria-label="Хлебные крошки">
      <ol>
        <li><a href="/">Главная</a></li>
        <li><a href="/guides">Гайды</a></li>
        <li><span aria-current="page">${esc(g.h1)}</span></li>
      </ol>
    </nav>
    <div class="hero-row">
      <span class="tool-icon tool-icon--lg guide-icon">${art(g.icon, 46, { lazy: false })}</span>
      <div>
        <h1>${esc(g.h1)}</h1>
        <p class="lead">${esc(g.summary)}</p>
        <p class="guide-meta">${icon('clock')}${g.minutes} мин чтения · обновлено <time datetime="${g.updated}">${humanDate(g.updated)}</time></p>
      </div>
    </div>
  </div>
</div>
<div class="container guide-layout">
  <aside class="guide-aside">${toc}${toolLinks}</aside>
  <article class="panel prose guide-body">
${g.html}
  </article>
</div>
${
  guideTools.length
    ? `<section class="section" aria-labelledby="guide-tools-title">
  <div class="container">
    <div class="section-head"><h2 id="guide-tools-title">Инструменты из гайда</h2></div>
    <div class="tools-grid tools-grid--compact">${guideTools.map((t) => renderToolCard(t).replace(`href="${t.path}"`, `href="${t.path}" data-goal="guide_tool_click"`)).join('\n')}</div>
  </div>
</section>`
    : ''
}
${
  related.length
    ? `<section class="related" aria-labelledby="guide-related-title">
  <div class="container">
    <div class="section-head">
      <h2 id="guide-related-title">Другие гайды</h2>
      <a class="link-arrow" href="/guides">Все гайды${icon('arrow-right')}</a>
    </div>
    <div class="guides-grid">${related.slice(0, 3).map((x) => renderGuideCard(x)).join('\n')}</div>
  </div>
</section>`
    : ''
}`;
}
