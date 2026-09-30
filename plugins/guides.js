// Гайды: статьи в Markdown (content/guides/*.md) с заголовком-frontmatter.
// Читаются при сборке и в dev-режиме; из них плагин создаёт страницы /guides/<slug>.
//
// Формат файла:
// ---
// title: Title страницы
// h1: Заголовок статьи
// description: Meta Description
// summary: Короткий анонс для карточки
// date: 2026-09-30
// updated: 2026-09-30
// tools: keyword-finder, intent-finder
// icon: seo
// ---
// Текст статьи в Markdown…
import fs from 'node:fs';
import path from 'node:path';
import { Marked } from 'marked';
import { transliterate } from '../src/core/translit.js';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function anchor(text, used) {
  let id = transliterate(text.toLowerCase())
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'razdel';
  while (used.has(id)) id += '-2';
  used.add(id);
  return id;
}

function parseGuide(source, slug) {
  const m = source.replace(/^﻿/, '').match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!m) throw new Error(`Гайд ${slug}: нет блока --- с заголовком`);
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([a-z0-9]+):\s*(.*)$/i);
    if (kv) meta[kv[1]] = kv[2].trim();
  }
  for (const key of ['title', 'h1', 'description', 'summary', 'date']) {
    if (!meta[key]) throw new Error(`Гайд ${slug}: не заполнено поле ${key}`);
  }

  const toc = [];
  const used = new Set();
  const marked = new Marked({ gfm: true });
  marked.use({
    renderer: {
      heading({ tokens, depth, text }) {
        const inner = this.parser.parseInline(tokens);
        const plain = text.replace(/<[^>]+>/g, '');
        const id = anchor(plain, used);
        if (depth === 2) toc.push({ id, text: plain });
        return `<h${depth} id="${id}">${inner}</h${depth}>\n`;
      },
      link({ href, title, tokens }) {
        const inner = this.parser.parseInline(tokens);
        const external = /^https?:\/\//.test(href);
        return `<a href="${esc(href)}"${title ? ` title="${esc(title)}"` : ''}${external ? ' target="_blank" rel="noopener noreferrer"' : ''}>${inner}</a>`;
      },
    },
  });
  // Таблицы прокручиваются по горизонтали на узких экранах.
  const html = marked
    .parse(m[2])
    .replace(/<table>/g, '<div class="table-wrap"><table class="table">')
    .replace(/<\/table>/g, '</table></div>');
  const words = m[2].split(/\s+/).filter(Boolean).length;

  return {
    kind: 'guide',
    id: `guide-${slug}`,
    slug,
    path: `/guides/${slug}`,
    title: meta.title,
    h1: meta.h1,
    description: meta.description,
    summary: meta.summary,
    date: meta.date,
    updated: meta.updated || meta.date,
    tools: (meta.tools || '').split(',').map((s) => s.trim()).filter(Boolean),
    icon: meta.icon || 'search-document',
    image: `/og/guides/${slug}.png`,
    order: Number(meta.order) || 0,
    minutes: Math.max(1, Math.round(words / 170)),
    toc,
    html,
  };
}

export function loadGuides(root) {
  const dir = path.join(root, 'content', 'guides');
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => parseGuide(fs.readFileSync(path.join(dir, f), 'utf8'), f.replace(/\.md$/, '')))
    .sort((a, b) => a.order - b.order || b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));
}
