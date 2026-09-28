// Посредник для подсказок Яндекса.
// Яндекс не отдаёт подсказки браузеру с чужих сайтов (нет CORS и JSONP), поэтому Keyword Finder
// получает их через этот сервер пачкой: POST /yandex { queries, lr, lang } → { results: { запрос: [подсказки] | null } }.
// Фразы не пишутся в логи и не сохраняются — только кэш в памяти на сутки.

export const LIMITS = {
  batch: 400, // запросов в одной пачке
  queryLength: 120,
  body: 64 * 1024,
  concurrency: 8, // одновременных запросов к Яндексу
  timeout: 8000,
  ttl: 24 * 3600 * 1000,
  cache: 30000,
  window: 10 * 60 * 1000, // окно ограничения частоты
  perIp: 4000, // запросов к Яндексу (без кэша) с одного IP за окно
  global: 40000, // всего за окно — чтобы Яндекс не заблокировал сервер
};

const LANGS = new Set(['ru', 'en', 'uk', 'be', 'kk']);
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** Проверка тела запроса; возвращает { queries, lr, lang } или бросает HttpError(400). */
export function validate(body) {
  if (!body || typeof body !== 'object') throw new HttpError(400, 'Ожидается JSON-объект');
  const { queries, lr = '225', lang = 'ru' } = body;
  if (!Array.isArray(queries) || !queries.length) throw new HttpError(400, 'Нужен непустой массив queries');
  if (queries.length > LIMITS.batch) throw new HttpError(400, `Не больше ${LIMITS.batch} запросов за раз`);
  if (!queries.every((q) => typeof q === 'string' && q.trim() && q.length <= LIMITS.queryLength)) {
    throw new HttpError(400, `Каждый запрос — непустая строка до ${LIMITS.queryLength} символов`);
  }
  if (!/^\d{1,6}$/.test(String(lr))) throw new HttpError(400, 'lr — числовой код региона Яндекса');
  if (!LANGS.has(lang)) throw new HttpError(400, 'Неподдерживаемый язык');
  return { queries: [...new Set(queries)], lr: String(lr), lang };
}

/** Ответ suggest-ff.cgi: ["запрос", ["подсказка", …], …]. */
export function parseSuggest(data) {
  const list = Array.isArray(data) && Array.isArray(data[1]) ? data[1] : [];
  return list.filter((x) => typeof x === 'string');
}

function limiter(n) {
  let active = 0;
  const queue = [];
  const next = () => {
    if (active >= n || !queue.length) return;
    active++;
    const { fn, resolve } = queue.shift();
    fn().then(resolve).finally(() => {
      active--;
      next();
    });
  };
  return (fn) => new Promise((resolve) => {
    queue.push({ fn, resolve });
    next();
  });
}

/** Состояние сервера: кэш, счётчики частоты и доступ к Яндексу (fetchImpl подменяется в тестах). */
export function createProxy({ fetchImpl = fetch, now = Date.now } = {}) {
  const cache = new Map();
  const counters = new Map(); // ip → { start, count }; '*' — общий счётчик
  const limit = limiter(LIMITS.concurrency);

  function take(key, amount, max) {
    const t = now();
    let c = counters.get(key);
    if (!c || t - c.start > LIMITS.window) counters.set(key, (c = { start: t, count: 0 }));
    if (c.count + amount > max) return false;
    c.count += amount;
    return true;
  }

  async function upstream(q, lr, lang) {
    const url = `https://suggest.yandex.ru/suggest-ff.cgi?uil=${lang}&lr=${lr}&part=${encodeURIComponent(q)}`;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetchImpl(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(LIMITS.timeout) });
        if (res.ok) return parseSuggest(await res.json());
      } catch {
        /* повтор ниже */
      }
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
    return null;
  }

  async function batch({ queries, lr, lang }, ip) {
    const key = (q) => `${lr}|${lang}|${q}`;
    const fresh = (e) => e && now() - e.t < LIMITS.ttl;
    const missing = queries.filter((q) => !fresh(cache.get(key(q))));
    if (missing.length) {
      if (!take(`ip:${ip}`, missing.length, LIMITS.perIp)) throw new HttpError(429, 'Слишком много запросов, повторите через несколько минут');
      if (!take('*', missing.length, LIMITS.global)) throw new HttpError(503, 'Сервер перегружен, повторите позже');
    }
    await Promise.all(
      missing.map((q) =>
        limit(async () => {
          const items = await upstream(q, lr, lang);
          if (!items) return;
          if (cache.size >= LIMITS.cache) for (const k of [...cache.keys()].slice(0, LIMITS.cache / 10)) cache.delete(k);
          cache.set(key(q), { t: now(), items });
        }),
      ),
    );
    return Object.fromEntries(queries.map((q) => [q, fresh(cache.get(key(q))) ? cache.get(key(q)).items : null]));
  }

  return { batch, cacheSize: () => cache.size };
}
