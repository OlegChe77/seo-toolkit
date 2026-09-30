// Кластеризация запросов по составу слов (без данных поисковой выдачи).
//
// Запросы обрабатываются от самых частотных (и коротких) к редким. Первый запрос кластера —
// его «голова»; следующий запрос присоединяется к кластеру, чья голова лучше всего совпадает
// с ним по значимым словам (без стоп-слов, по упрощённой основе). Сила группировки задаёт,
// насколько строгим должно быть совпадение.
import { stem } from '../../core/stem.js';
import { STOPWORDS, words } from '../../core/text.js';

export const STRENGTHS = {
  soft: 'Мягкая',
  medium: 'Средняя',
  strict: 'Строгая',
};

export const INTENTS = {
  informational: 'Информационный',
  commercial: 'Коммерческий',
  navigational: 'Навигационный',
  transactional: 'Транзакционный',
};

// Интенты Keyword Finder → категории IntentFinder.
export const FROM_KEYWORD_FINDER = { info: 'informational', investigation: 'commercial', commercial: 'transactional', nav: 'navigational' };

/** Значимые основы запроса (уникальные, отсортированные). */
export function stemsOf(query) {
  return [...new Set(words(query).filter((w) => !STOPWORDS.has(w) && (w.length > 1 || /\d/.test(w))).map(stem))].sort();
}

function overlap(a, b) {
  const set = new Set(b);
  let n = 0;
  for (const x of a) if (set.has(x)) n++;
  return n;
}

// Оценка совпадения запроса с головой кластера; -1 — не подходит.
function score(q, head, strength) {
  const common = overlap(q, head);
  if (!common) return -1;
  const containsHead = common === head.length;
  const jaccard = common / (q.length + head.length - common);
  if (strength === 'strict') return containsHead ? common / q.length : -1;
  if (strength === 'medium') return containsHead || jaccard >= 0.5 ? jaccard + (containsHead ? 1 : 0) : -1;
  const minShare = common / Math.min(q.length, head.length);
  return minShare >= 0.5 ? jaccard + minShare : -1;
}

/**
 * items: [{ query, volume?, intent? }]
 * Возвращает { clusters: [{ id, name, items, volume, intent }], stats }.
 */
export function clusterize(items, { strength = 'medium', splitIntents = false } = {}) {
  const seen = new Set();
  const list = [];
  for (const it of items) {
    const query = String(it.query || '').trim().replace(/\s+/g, ' ');
    const key = query.toLowerCase().replace(/ё/g, 'е');
    if (!query || seen.has(key)) continue;
    seen.add(key);
    list.push({ query, volume: Number(it.volume) > 0 ? Number(it.volume) : 0, intent: INTENTS[it.intent] ? it.intent : '', stems: stemsOf(query) });
  }
  list.sort((a, b) => b.volume - a.volume || a.stems.length - b.stems.length || a.query.localeCompare(b.query, 'ru'));

  const clusters = [];
  const index = new Map(); // основа → кластеры, у головы которых она есть
  for (const item of list) {
    let best = null;
    let bestScore = -1;
    if (item.stems.length) {
      const candidates = new Set();
      for (const s of item.stems) for (const c of index.get(s) || []) candidates.add(c);
      for (const c of candidates) {
        if (splitIntents && item.intent && c.head.intent && item.intent !== c.head.intent) continue;
        const sc = score(item.stems, c.head.stems, strength);
        if (sc > bestScore || (sc === bestScore && sc >= 0 && c.volume > best.volume)) {
          best = c;
          bestScore = sc;
        }
      }
    }
    if (best && bestScore >= 0) {
      best.items.push(item);
      best.volume += item.volume;
    } else {
      const c = { id: clusters.length + 1, head: item, items: [item], volume: item.volume };
      clusters.push(c);
      for (const s of item.stems) (index.get(s) || index.set(s, []).get(s)).push(c);
    }
  }

  for (const c of clusters) {
    c.name = c.head.query;
    const votes = {};
    for (const it of c.items) if (it.intent) votes[it.intent] = (votes[it.intent] || 0) + 1;
    c.intent = Object.entries(votes).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
  }
  const grouped = clusters.filter((c) => c.items.length > 1);
  return {
    clusters,
    stats: {
      queries: list.length,
      clusters: grouped.length,
      singles: clusters.length - grouped.length,
      groupedQueries: grouped.reduce((n, c) => n + c.items.length, 0),
      hasVolume: list.some((x) => x.volume > 0),
      hasIntent: list.some((x) => x.intent),
    },
  };
}

// Разбор вставленного списка: «запрос», «запрос<TAB>частотность», «запрос;частотность;интент».
const INTENT_WORDS = Object.fromEntries(
  Object.entries(INTENTS).flatMap(([id, name]) => [[id, id], [name.toLowerCase(), id], [name.toLowerCase().replace(/ый$/, 'ые'), id]]),
);

export function parseList(text) {
  const out = [];
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const cells = line.includes('\t') ? line.split('\t') : line.split(/;/);
    const query = cells[0].trim();
    if (!query) continue;
    let volume = 0;
    let intent = '';
    for (const cell of cells.slice(1)) {
      const c = cell.trim();
      const n = Number(c.replace(/[\s  ]/g, ''));
      if (c && Number.isFinite(n) && !volume) volume = n;
      else if (INTENT_WORDS[c.toLowerCase()]) intent = INTENT_WORDS[c.toLowerCase()];
    }
    out.push({ query, volume, intent });
  }
  return out;
}
