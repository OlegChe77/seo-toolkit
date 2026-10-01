// Разбор robots.txt и проверка, открыт ли адрес для робота, — по правилам Google и Яндекса:
// берётся группа с самым точным User-agent (или «*»), из подходящих правил побеждает самое длинное,
// при равной длине — Allow. «*» — любая последовательность символов, «$» в конце — конец адреса.

/** { groups: [{ agents, rules: [{ type, path }], crawlDelay }], sitemaps } — формат RobotsBuilder. */
export function parseRobots(text) {
  const groups = [];
  const sitemaps = [];
  let current = null;
  let lastWasAgent = false;
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    if (key === 'user-agent') {
      if (!current || !lastWasAgent) groups.push((current = { agents: [], rules: [], crawlDelay: '' }));
      current.agents.push(value);
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (key === 'sitemap') sitemaps.push(value);
    else if (!current) continue;
    else if (key === 'allow' || key === 'disallow') current.rules.push({ type: key === 'allow' ? 'Allow' : 'Disallow', path: value });
    else if (key === 'crawl-delay') current.crawlDelay = value;
  }
  return { groups, sitemaps };
}

const escape = (s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&');

function matches(pattern, path) {
  const anchored = pattern.endsWith('$');
  const body = anchored ? pattern.slice(0, -1) : pattern;
  return new RegExp(`^${body.split('*').map(escape).join('.*')}${anchored ? '$' : ''}`).test(path);
}

/** Открыт ли путь (pathname + search) для робота agent: { allowed, rule }. */
export function isAllowed(robots, agent, path) {
  const name = agent.toLowerCase();
  let best = 0;
  let chosen = [];
  for (const g of robots.groups) {
    for (const a of g.agents.map((x) => x.toLowerCase())) {
      if (a === '*' || !name.startsWith(a)) continue;
      if (a.length > best) [best, chosen] = [a.length, [g]];
      else if (a.length === best && !chosen.includes(g)) chosen.push(g);
    }
  }
  if (!chosen.length) chosen = robots.groups.filter((g) => g.agents.includes('*'));
  let hit = null;
  for (const rule of chosen.flatMap((g) => g.rules)) {
    if (!rule.path || !matches(rule.path, path)) continue;
    if (!hit || rule.path.length > hit.path.length || (rule.path.length === hit.path.length && rule.type === 'Allow')) hit = rule;
  }
  return { allowed: !hit || hit.type === 'Allow', rule: hit };
}
