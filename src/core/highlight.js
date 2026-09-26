// Простая подсветка синтаксиса. Весь пользовательский текст экранируется.
import { escapeHtml } from './dom.js';

const span = (cls, text) => `<span class="${cls}">${escapeHtml(text)}</span>`;

const JSON_TOKEN =
  /("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|([{}[\],])/g;

export function highlightJson(code) {
  let out = '';
  let last = 0;
  for (const m of code.matchAll(JSON_TOKEN)) {
    out += escapeHtml(code.slice(last, m.index));
    if (m[1]) out += m[2] ? span('tk-key', m[1]) + span('tk-punct', m[2]) : span('tk-str', m[1]);
    else if (m[3]) out += span('tk-lit', m[3]);
    else if (m[4]) out += span('tk-num', m[4]);
    else out += span('tk-punct', m[5]);
    last = m.index + m[0].length;
  }
  return out + escapeHtml(code.slice(last));
}

/** Подсветка JSON-LD, обёрнутого в тег <script>. */
export function highlightJsonLdScript(json, wrap) {
  if (!wrap) return highlightJson(json);
  return `${span('tk-tag', '<script type="application/ld+json">')}\n${highlightJson(json)}\n${span('tk-tag', '</script>')}`;
}

export function highlightRobots(text) {
  return text
    .split('\n')
    .map((line) => {
      if (/^\s*#/.test(line)) return span('tk-comment', line);
      const m = line.match(/^(\s*)([A-Za-z-]+)(\s*:)(.*)$/);
      if (!m) return escapeHtml(line);
      const [, indent, dir, colon, rest] = m;
      const hashAt = rest.indexOf('#');
      const value = hashAt >= 0 ? rest.slice(0, hashAt) : rest;
      const comment = hashAt >= 0 ? rest.slice(hashAt) : '';
      return (
        escapeHtml(indent) +
        span('tk-dir', dir) +
        span('tk-punct', colon) +
        span(/^user-agent$/i.test(dir) ? 'tk-key' : 'tk-str', value) +
        (comment ? span('tk-comment', comment) : '')
      );
    })
    .join('\n');
}
