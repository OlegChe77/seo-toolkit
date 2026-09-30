// Keyword Finder: сбор фраз из подсказок поисковиков и оценка частотности без API.
//
// Подсказки Google, YouTube и Bing запрашиваются прямо из браузера (JSONP). Яндекс так не отдаёт,
// поэтому его подсказки идут пачкой через наш посредник (server/, адрес — suggestApi в site.config.js).
// Если посредник недоступен, оценка строится только по Google.
//
// Как считается частотность. Подсказки упорядочены по популярности, поэтому соседние списки
// можно «сшить»: список для «купить дива» и список для «купить диван» содержат общие фразы,
// и по их позициям видно, во сколько раз лидер одного списка популярнее лидера другого.
// Цепочка начинается с одной буквы (её лидер — один из самых частых запросов языка, MODEL.top)
// и идёт буква за буквой до нужной фразы. Частота пункта на позиции r: лидер списка · r^-gamma.
// Уточнение не может быть чаще своей основы, умноженной на kappa за каждое добавленное слово.
// Итог — порядок величины; калибровка по цифрам из Вордстата: log10 V = a + b · log10 V_est.
import { analyze } from './intent.js';

const log10 = Math.log10;
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;

export const normalize = (text) => String(text).toLowerCase().replace(/ё/g, 'е').split(/\s+/).filter(Boolean).join(' ');

// gl — страна для Google, lr — код региона Яндекса.
export const REGIONS = {
  ru: { label: 'Россия', gl: 'ru', lr: '225' },
  msk: { label: 'Москва', gl: 'ru', lr: '213' },
  spb: { label: 'Санкт-Петербург', gl: 'ru', lr: '2' },
  by: { label: 'Беларусь', gl: 'by', lr: '149' },
  kz: { label: 'Казахстан', gl: 'kz', lr: '159' },
  ua: { label: 'Украина', gl: 'ua', lr: '187' },
  us: { label: 'США', gl: 'us', lr: '84' },
  gb: { label: 'Великобритания', gl: 'gb', lr: '102' },
};

// Адрес посредника подсказок Яндекса подставляется при сборке (vite.config.js).
export const SUGGEST_API = typeof __SUGGEST_API__ === 'string' ? __SUGGEST_API__.replace(/\/+$/, '') : '';

const google = (q, lang, gl, extra = '') =>
  `https://suggestqueries.google.com/complete/search?client=firefox&hl=${lang}&gl=${gl}&ie=utf-8&oe=utf-8${extra}&q=${encodeURIComponent(q)}`;

export const SOURCES = {
  google: { label: 'Google', url: (q, lang, gl) => google(q, lang, gl), param: 'callback', parse: (d) => d[1] },
  yandex: { label: 'Яндекс', batch: true },
  youtube: { label: 'YouTube', url: (q, lang, gl) => google(q, lang, gl, '&ds=yt'), param: 'callback', parse: (d) => d[1] },
  bing: {
    label: 'Bing',
    url: (q, lang, gl) => `https://api.bing.com/qsonhs.aspx?type=cb&mkt=${lang}-${gl.toUpperCase()}&q=${encodeURIComponent(q)}`,
    param: 'cb',
    parse: (d) => (d?.AS?.Results || []).flatMap((r) => (r.Suggests || []).map((s) => s.Txt)),
  },
};

// Частотность оценивается по Google и Яндексу (среднее в логарифмах): у YouTube и Bing мало
// данных по длинным фразам, они только добавляют новые фразы.
export const VOLUME_SOURCES = ['google', 'yandex'];

export const ALPHABETS = { ru: 'абвгдежзийклмнопрстуфхцчшщэюя', en: 'abcdefghijklmnopqrstuvwxyz' };
export const QUESTIONS = {
  ru: ['как', 'где', 'что', 'почему', 'зачем', 'когда', 'сколько', 'какой', 'можно ли', 'лучший'],
  en: ['how', 'what', 'where', 'why', 'when', 'which', 'can', 'best', 'is', 'does'],
};
const STOPWORDS = new Set(`в во на и с со к ко по за из от до для о об при у а но или же ли не без под над
через что как где это the a an of to in on for and or with by at from is are`.split(/\s+/));
const QUESTION_WORDS = new Set(['что', 'как', 'где', 'how', 'what', 'where', 'why', 'when', 'which']);

// Грубая доля слов, начинающихся с буквы (1 — самая частая). Задаёт только старт цепочки.
const weights = (letters, values) => Object.fromEntries([...letters].map((c, i) => [c, values[i]]));
const LETTER_WEIGHT = {
  ru: weights('пскводмнтрзбаиглучяешфхэцжюйщ', [1, .85, .8, .75, .55, .55, .6, .6, .45, .45, .35, .4, .35, .3, .3, .25, .25, .2, .15, .12, .12, .12, .1, .1, .06, .08, .04, .02, .03]),
  en: weights('scpmbatdrfhwglinevokujyqxz', [1, .9, .8, .7, .7, .7, .7, .6, .55, .5, .5, .5, .45, .45, .4, .4, .35, .2, .3, .2, .15, .15, .1, .05, .03, .05]),
};

export const MODEL = {
  top: 3e7, // частотность лидера подсказок на одну частую букву
  gamma: 0.7, // падение частоты по позиции в списке: v ~ r^-gamma
  rho: 0.6, // лидер дочернего списка к последнему пункту родителя, если общих фраз нет
  rhoExact: 0.5, // лидер списка продолжений фразы к самой фразе
  kappa: 0.3, // уточнение (+1 значимое слово) не чаще kappa · частоты основы
  a: 0, // калибровка
  b: 1,
  spread: 3, // во сколько раз оценка может ошибаться (для диапазона)
};

const DEEP_LIMIT = 15;
const MAX_RESULTS = 1500;

export const prefixes = (phrase) => Array.from({ length: phrase.length }, (_, k) => phrase.slice(0, k + 1));

/** Грубая основа: без конечных гласных (диван → диван, кровать → кроват). */
export function stem(w) {
  while (w.length > 3 && 'аеиоуыэюяьйaeiouy'.includes(w.at(-1))) w = w.slice(0, -1);
  return w;
}

/** Значимые основы (отсортированы). Вопросительные слова значимы: «как купить диван» — уточнение «купить диван». */
export const contentStems = (phrase) =>
  [...new Set(phrase.split(' ').filter((w) => w && (!STOPWORDS.has(w) || QUESTION_WORDS.has(w))).map(stem))].sort();

// ---------- Оценка частотности ----------

/** log10 частоты лидера каждого списка, по цепочке от более коротких запросов. */
export function chainTops(lists, lang, m = MODEL) {
  const g = m.gamma;
  const top = new Map();
  for (const q of [...lists.keys()].sort((a, b) => a.length - b.length)) {
    const items = lists.get(q);
    let parent = null;
    for (let k = q.length - 1; k > 0 && parent === null; k--) if (top.has(q.slice(0, k))) parent = q.slice(0, k);
    if (parent === null) {
      top.set(q, log10(m.top * Math.sqrt(LETTER_WEIGHT[lang][q[0]] ?? 0.05)) - 0.5 * (q.length - 1));
      continue;
    }
    const tp = top.get(parent);
    const plist = lists.get(parent);
    const pos = new Map(items.map((x, j) => [x, j]));
    const shared = [];
    plist.forEach((x, i) => {
      if (pos.has(x)) shared.push(tp - g * log10(i + 1) + g * log10(pos.get(x) + 1));
    });
    const nq = normalize(q);
    let t;
    if (shared.length) t = mean(shared);
    else if (plist.includes(nq)) t = tp - g * log10(plist.indexOf(nq) + 1) + log10(m.rhoExact);
    else {
      // Без общих фраз: чуть ниже хвоста родителя; для нового слова на редкую букву — ещё ниже.
      const letter = q.length > 1 && q.at(-2) === ' ' ? LETTER_WEIGHT[lang][q.at(-1)] ?? 0.05 : 1;
      t = tp - g * log10(Math.max(plist.length, 1)) + log10(m.rho * letter) - (items.length ? 0 : 0.5);
    }
    top.set(q, Math.min(t, tp));
  }
  return top;
}

/** log10 частоты каждой фразы по одному источнику (среднее по всем спискам, где она есть). */
function sourceValues(lists, top, m) {
  const obs = new Map();
  const add = (x, v) => (obs.get(x) || obs.set(x, []).get(x)).push(v);
  for (const [q, items] of lists) items.forEach((x, r) => add(x, top.get(q) - m.gamma * log10(r + 1)));
  // Точная фраза, которой нет в подсказках, чуть популярнее своего первого продолжения.
  for (const q of lists.keys()) {
    const nq = normalize(q);
    if (nq === q && !obs.has(nq)) add(nq, top.get(q) - log10(m.rhoExact));
  }
  return new Map([...obs].map(([x, v]) => [x, mean(v)]));
}

/** Только настоящие продолжения набранного текста: чужие популярные фразы для цепочки не годятся. */
function completions(lists) {
  const out = new Map();
  for (const [q, items] of lists) {
    const p = normalize(q) + (q.endsWith(' ') ? ' ' : '');
    out.set(q, items.filter((x) => x.startsWith(p)));
  }
  return out;
}

/** Сырые log10-оценки (без калибровки): { source: Map(query → items) } → Map(phrase → log10). */
export function estimate(allLists, lang, m = MODEL) {
  const lists = Object.fromEntries(Object.entries(allLists).map(([s, l]) => [s, completions(l)]));
  const tops = {};
  const perSource = {};
  for (const s of VOLUME_SOURCES) {
    if (!lists[s]?.size) continue;
    tops[s] = chainTops(lists[s], lang, m);
    perSource[s] = sourceValues(lists[s], tops[s], m);
  }
  const out = new Map();
  const values = Object.values(perSource);
  for (const x of new Set(values.flatMap((v) => [...v.keys()]))) out.set(x, mean(values.filter((v) => v.has(x)).map((v) => v.get(x))));
  // Фразы только из YouTube/Bing: ниже последнего пункта Google/Яндекса по тому же запросу.
  for (const [s, byQuery] of Object.entries(lists)) {
    if (perSource[s]) continue;
    for (const [q, items] of byQuery) {
      const bounds = Object.keys(tops)
        .filter((v) => tops[v].has(q))
        .map((v) => tops[v].get(q) - m.gamma * log10(lists[v].get(q).length + 1) + log10(m.rho));
      if (!bounds.length) continue;
      const bound = mean(bounds);
      for (const x of items) if (!out.has(x)) out.set(x, bound);
    }
  }
  return lengthCap(out, m);
}

function* combinations(arr, k, start = 0, acc = []) {
  if (acc.length === k) return yield acc;
  for (let i = start; i < arr.length; i++) yield* combinations(arr, k, i + 1, [...acc, arr[i]]);
}

/**
 * Подсказки ставят длинные уточнения почти вровень с короткими, а ищут их намного реже.
 * Поэтому фраза не может быть популярнее своей основы (фразы из части её слов), умноженной
 * на kappa за каждое добавленное значимое слово. Ограничение мягкое (1/v = 1/оценка + 1/предел),
 * чтобы уточнения не слипались в одно число.
 */
export function lengthCap(values, m = MODEL) {
  const stems = new Map([...values.keys()].map((x) => [x, contentStems(x)]));
  const levels = new Map();
  for (const x of values.keys()) {
    const n = stems.get(x).length;
    (levels.get(n) || levels.set(n, []).get(n)).push(x);
  }
  const best = new Map(); // набор основ → частота самой популярной фразы с ним
  const out = new Map();
  for (const n of [...levels.keys()].sort((a, b) => a - b)) {
    for (const x of levels.get(n)) {
      let v = values.get(x);
      let cand = null;
      if (n <= 8) {
        for (let k = 1; k < n; k++) {
          for (const c of combinations(stems.get(x), k)) {
            const b = best.get(c.join('|'));
            if (b !== undefined && (!cand || k > cand[0] || (k === cand[0] && b > cand[1]))) cand = [k, b];
          }
        }
      }
      if (cand) {
        const cap = cand[1] + (n - cand[0]) * log10(m.kappa);
        const lo = Math.min(v, cap);
        v = lo - log10(1 + 10 ** (lo - Math.max(v, cap)));
      }
      out.set(x, v);
    }
    for (const x of levels.get(n)) {
      const key = stems.get(x).join('|');
      if (key) best.set(key, Math.max(best.get(key) ?? out.get(x), out.get(x)));
    }
  }
  return out;
}

export const calibrated = (raw, m) => 10 ** (m.a + m.b * raw);

export function nice(v) {
  if (v < 10) return Math.max(0, Math.round(v));
  const p = 10 ** (Math.floor(log10(v)) - 1);
  return Math.round(v / p) * p;
}

export function classify(v, [hi, mid, lo]) {
  return v >= hi ? 'ВЧ' : v >= mid ? 'СЧ' : v >= lo ? 'НЧ' : 'микро';
}

export const relevant = (phrase, seedStems) => {
  const words = phrase.split(' ');
  return seedStems.some((stems) => stems.every((s) => words.some((w) => w.startsWith(s))));
};

// ---------- Подсказки: JSONP из браузера ----------

const cache = new Map();
const limits = {};
let seq = 0;

function limiter(n) {
  let active = 0;
  const queue = [];
  const next = () => {
    if (active >= n || !queue.length) return;
    active++;
    const { fn, resolve, reject } = queue.shift();
    fn().then(resolve, reject).finally(() => {
      active--;
      next();
    });
  };
  return (fn) => new Promise((resolve, reject) => {
    queue.push({ fn, resolve, reject });
    next();
  });
}

function jsonp(url, param, timeout = 8000) {
  return new Promise((resolve, reject) => {
    const cb = `__seotkKf${seq++}`;
    const script = document.createElement('script');
    const finish = (fn, arg) => {
      clearTimeout(timer);
      window[cb] = () => {}; // поздний ответ после таймаута не должен падать
      script.remove();
      fn(arg);
    };
    const timer = setTimeout(() => finish(reject, new Error('timeout')), timeout);
    window[cb] = (data) => {
      finish(resolve, data);
      delete window[cb];
    };
    script.onerror = () => finish(reject, new Error('network'));
    script.referrerPolicy = 'no-referrer';
    script.src = `${url}&${param}=${cb}`;
    document.head.append(script);
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clean = (list) => [...new Set((list || []).filter((x) => typeof x === 'string').map(normalize).filter(Boolean))];

/** Список подсказок (нормализованных, без дублей) или null, если источник не ответил. */
async function fetchSuggest(source, query, lang, gl, stats) {
  const key = `${source}|${lang}|${gl}|${query}`;
  if (cache.has(key)) return cache.get(key);
  const src = SOURCES[source];
  limits[source] ||= limiter(6);
  return limits[source](async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      stats.requests++;
      try {
        const items = clean(src.parse(await jsonp(src.url(query, lang, gl), src.param)));
        cache.set(key, items);
        return items;
      } catch {
        await sleep(600 * (attempt + 1));
      }
    }
    stats.failures++;
    return null;
  });
}

const YANDEX_BATCH = 400; // как LIMITS.batch в server/proxy.js
const YANDEX_TIMEOUT = 60000; // бесплатный сервер Render просыпается до минуты (заранее его будит core/wake.js)

/** Подсказки Яндекса пачками через посредник: Map(запрос → подсказки). stats.yandex = 'ok' | 'error'. */
async function fetchYandex(queries, lang, lr, stats) {
  const out = new Map();
  const key = (q) => `yandex|${lang}|${lr}|${q}`;
  const need = queries.filter((q) => (cache.has(key(q)) ? (out.set(q, cache.get(key(q))), false) : true));
  for (let i = 0; i < need.length && stats.yandex !== 'error'; i += YANDEX_BATCH) {
    const part = need.slice(i, i + YANDEX_BATCH);
    try {
      const res = await fetch(`${SUGGEST_API}/yandex`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queries: part, lr, lang }),
        signal: AbortSignal.timeout(YANDEX_TIMEOUT),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { results } = await res.json();
      stats.yandexRequests += part.length;
      for (const q of part) {
        if (!Array.isArray(results?.[q])) continue;
        cache.set(key(q), clean(results[q]));
        out.set(q, cache.get(key(q)));
      }
      stats.yandex = 'ok';
    } catch {
      stats.yandex = 'error';
    }
  }
  if (!need.length && stats.yandex !== 'error') stats.yandex = 'ok';
  return out;
}

/** onProgress(готово, всего, ждём ли Яндекс). */
async function fetchPlan(plan, lang, region, into, stats, onProgress) {
  const jobs = [];
  for (const [s, queries] of Object.entries(plan)) for (const q of queries) if (!into[s]?.has(q)) jobs.push([s, q]);
  const yandex = jobs.filter(([s]) => s === 'yandex').map(([, q]) => q);
  const jsonpJobs = jobs.filter(([s]) => s !== 'yandex');
  let done = 0;
  let yandexPending = yandex.length > 0;
  const tick = (n) => onProgress?.((done += n), jobs.length, yandexPending && done >= jsonpJobs.length);
  await Promise.all([
    ...jsonpJobs.map(async ([s, q]) => {
      const items = await fetchSuggest(s, q, lang, region.gl, stats);
      if (items) (into[s] ||= new Map()).set(q, items);
      tick(1);
    }),
    yandex.length &&
      fetchYandex(yandex, lang, region.lr, stats).then((res) => {
        for (const [q, items] of res) (into.yandex ||= new Map()).set(q, items);
        yandexPending = false;
        tick(yandex.length);
      }),
  ]);
}

/** Источники для запросов: Google всегда, Яндекс — если выбран и посредник настроен. */
function usableSources(sources, stats) {
  const list = [...new Set(['google', ...sources.filter((s) => SOURCES[s])])];
  if (list.includes('yandex') && !SUGGEST_API) {
    stats.yandex = 'disabled';
    return list.filter((s) => s !== 'yandex');
  }
  return list;
}

// ---------- Поиск ----------

/** calibrations: { g?, gy? } — калибровки шкалы для каждого набора источников (см. scaleKey). */
export async function findKeywords({ seeds, lang, region, sources, questions, deep, calibrations = {}, thresholds = [10000, 1000, 100], onProgress }) {
  const t0 = performance.now();
  const stats = { requests: 0, failures: 0, yandexRequests: 0, yandex: null };
  const reg = REGIONS[region] || REGIONS.ru;
  seeds = [...new Set(seeds.map(normalize).filter(Boolean))].slice(0, 5);
  const disc = usableSources(sources, stats);
  const anchors = [...seeds, ...(questions ? seeds.flatMap((s) => QUESTIONS[lang].map((w) => `${w} ${s}`)) : [])];
  const expansions = [...seeds.map((s) => `${s} `), ...seeds.flatMap((s) => [...ALPHABETS[lang]].map((c) => `${s} ${c}`))];

  const plan = Object.fromEntries(disc.map((s) => [s, new Set([...anchors, ...expansions])]));
  for (const s of VOLUME_SOURCES) if (plan[s]) for (const a of anchors) for (const p of prefixes(a)) plan[s].add(p);
  const lists = {};
  await fetchPlan(plan, lang, reg, lists, stats, (d, t, waiting) => onProgress?.(d, t, 1, waiting));

  const seedStems = seeds.map((s) => {
    const st = s.split(' ').filter((w) => !STOPWORDS.has(w)).map(stem);
    return st.length ? st : s.split(' ');
  });
  if (deep) {
    const raw = estimate(lists, lang);
    const best = [...raw.keys()]
      .filter((x) => !anchors.includes(x) && relevant(x, seedStems))
      .sort((a, b) => raw.get(b) - raw.get(a))
      .slice(0, DEEP_LIMIT);
    const extra = new Set(best.map((x) => `${x} `));
    const deepSources = disc.filter((s) => s !== 'yandex' || stats.yandex !== 'error');
    await fetchPlan(Object.fromEntries(deepSources.map((s) => [s, extra])), lang, reg, lists, stats, (d, t, waiting) => onProgress?.(d, t, 2, waiting));
  }

  const calibration = calibrations[scaleKey(stats)];
  const model = { ...MODEL, ...(calibration || {}) };
  const raw = estimate(lists, lang, model);
  const seenIn = new Map();
  for (const [s, byQuery] of Object.entries(lists)) {
    for (const items of byQuery.values()) {
      for (const x of items) if (relevant(x, seedStems)) (seenIn.get(x) || seenIn.set(x, new Set()).get(x)).add(s);
    }
  }
  for (const a of seeds) if (!seenIn.has(a)) seenIn.set(a, new Set());

  let rows = [];
  for (const [x, srcs] of seenIn) {
    if (!raw.has(x)) continue;
    const v = calibrated(raw.get(x), model);
    const stems = contentStems(x);
    rows.push({
      phrase: x,
      volume: nice(v),
      low: nice(v / model.spread),
      high: nice(v * model.spread),
      cls: classify(v, thresholds),
      sources: [...srcs].sort(),
      words: x.split(' ').length,
      seed: seeds.includes(x),
      stems,
      ...analyze(x, v, stems.length),
    });
  }
  rows.sort((a, b) => b.volume - a.volume);
  rows = rows.slice(0, MAX_RESULTS);

  const skip = new Set([...seeds.flatMap((s) => s.split(' ')), ...STOPWORDS]);
  const skipStems = [...skip].filter((s) => s.length > 3).map(stem);
  const count = new Map();
  for (const r of rows) {
    for (const w of new Set(r.phrase.split(' '))) {
      if (skip.has(w) || w.length < 2 || skipStems.some((s) => w.startsWith(s))) continue;
      const c = count.get(w) || { word: w, count: 0, volume: 0 };
      c.count++;
      c.volume += r.volume;
      count.set(w, c);
    }
  }
  const words = [...count.values()].sort((a, b) => b.count - a.count).slice(0, 40);

  return {
    rows,
    words,
    stats: { ...stats, seconds: Math.round((performance.now() - t0) / 100) / 10, calibrated: !!calibration },
  };
}

/** Подгонка шкалы под реальные цифры (например, из Вордстата). rows: [{ phrase, volume }]. */
export async function calibrate(rows, lang, region, sources, onProgress) {
  const stats = { requests: 0, failures: 0, yandexRequests: 0, yandex: null };
  rows = rows.map((r) => ({ phrase: normalize(r.phrase), volume: r.volume })).filter((r) => r.phrase && r.volume > 0).slice(0, 30);
  const chain = new Set(rows.flatMap((r) => prefixes(r.phrase)));
  const plan = Object.fromEntries(usableSources(sources, stats).filter((s) => VOLUME_SOURCES.includes(s)).map((s) => [s, chain]));
  const lists = {};
  await fetchPlan(plan, lang, REGIONS[region] || REGIONS.ru, lists, stats, onProgress);
  const raw = estimate(lists, lang, { ...MODEL });
  const pairs = rows.filter((r) => raw.has(r.phrase)).map((r) => ({ x: raw.get(r.phrase), y: log10(r.volume), ...r }));
  if (pairs.length < 3) return { error: 'Нужно минимум 3 фразы, для которых удалось получить подсказки.' };

  const fit = (pts) => {
    const mx = mean(pts.map((p) => p.x));
    const my = mean(pts.map((p) => p.y));
    let b = 1;
    if (pts.length >= 8) {
      const sxx = pts.reduce((s, p) => s + (p.x - mx) ** 2, 0);
      if (sxx > 1e-9) b = Math.min(1.5, Math.max(0.3, pts.reduce((s, p) => s + (p.x - mx) * (p.y - my), 0) / sxx));
    }
    return [my - b * mx, b];
  };
  const [a, b] = fit(pairs);
  const loo = pairs.map((p, i) => {
    const [fa, fb] = fit(pairs.filter((_, j) => j !== i));
    return (p.y - (fa + fb * p.x)) ** 2;
  });
  const rmse = Math.sqrt(mean(loo));
  const median = (arr) => arr.sort((u, v) => u - v)[Math.floor(arr.length / 2)];
  const round2 = (v) => Math.round(v * 100) / 100;
  return {
    a,
    b,
    spread: round2(Math.max(1.5, 10 ** rmse)),
    n: pairs.length,
    medianErrorBefore: round2(10 ** median(pairs.map((p) => Math.abs(p.y - p.x)))),
    medianErrorAfter: round2(10 ** median(pairs.map((p) => Math.abs(p.y - (a + b * p.x))))),
    rows: pairs.map((p) => ({ phrase: p.phrase, actual: p.volume, before: nice(10 ** p.x), after: nice(10 ** (a + b * p.x)) })),
    missing: rows.filter((r) => !raw.has(r.phrase)).map((r) => r.phrase),
    scale: scaleKey(stats),
  };
}

/** Шкала зависит от источников оценки: только Google ('g') или Google + Яндекс ('gy'). */
export const scaleKey = (stats) => (stats.yandex === 'ok' ? 'gy' : 'g');
