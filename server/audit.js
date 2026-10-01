// SEO-анализ сайта: сервер загружает страницу, robots.txt и sitemap.xml по адресу, который ввёл посетитель,
// и отдаёт их браузеру. Разбор и оценка выполняются в браузере (src/tools/audit/). Ничего не сохраняется.
//
// Защита от SSRF: только http(s) на стандартных портах и только публичные IP-адреса. Адрес проверяется
// в момент каждого соединения (lookup), в том числе после редиректов, — подмена DNS между проверкой
// и запросом ничего не даст.
import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import zlib from 'node:zlib';
import { HttpError } from './proxy.js';

export const AUDIT_LIMITS = {
  pageBytes: 3 * 1024 * 1024, // дальше страницу не читаем — для анализа хватит начала
  robotsBytes: 256 * 1024,
  sitemapBytes: 3 * 1024 * 1024,
  sitemapUrls: 500,
  timeout: 12000,
  redirects: 5,
  concurrency: 6, // одновременных проверок на сервере
  window: 10 * 60 * 1000,
  perIp: 30, // проверок с одного IP за окно
  global: 600,
};

// Мобильный браузер + метка робота: поисковики оценивают сайты по мобильной версии, а многие сайты
// отдают неизвестным роботам компьютерную вёрстку без viewport.
const UA = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36 (compatible; SEOToolkitBot/1.0; +https://seotoolkitru.onrender.com/seo-audit)';

// ---------- Адреса ----------

function isPublicV4(ip) {
  const [a, b, c] = ip.split('.').map(Number);
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT
  if (a === 169 && b === 254) return false; // link-local, метаданные облаков
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  return true;
}

/** Можно ли подключаться к этому IP: только публичные адреса. */
export function isPublicAddress(address) {
  const kind = net.isIP(address);
  if (kind === 4) return isPublicV4(address);
  if (kind !== 6) return false;
  const a = address.toLowerCase();
  const mapped = a.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPublicV4(mapped[1]);
  if (a === '::' || a === '::1' || a.startsWith('::ffff:')) return false;
  const first = parseInt(a.split(':')[0] || '0', 16);
  if ((first & 0xfe00) === 0xfc00) return false; // fc00::/7
  if ((first & 0xffc0) === 0xfe80) return false; // fe80::/10
  if ((first & 0xff00) === 0xff00) return false; // multicast
  if (first === 0x2002 || a.startsWith('64:ff9b:') || a.startsWith('2001:db8:')) return false; // туннели с IPv4 внутри, документация
  return true;
}

function safeLookup(hostname, options, callback) {
  dns.lookup(hostname, { all: true, verbatim: true }, (err, addresses) => {
    if (err) return callback(err);
    if (!addresses.length || addresses.some((x) => !isPublicAddress(x.address))) {
      return callback(Object.assign(new Error('private address'), { code: 'EPRIVATE' }));
    }
    if (options?.all) return callback(null, addresses);
    const pick = addresses.find((x) => !options?.family || x.family === options.family) || addresses[0];
    return callback(null, pick.address, pick.family);
  });
}

/** Адрес из формы → URL (без схемы — https://). Бросает HttpError(400) для неподходящих адресов. */
export function normalizeTarget(input) {
  let raw = String(input || '').trim();
  if (!raw) throw new HttpError(400, 'Введите адрес сайта');
  if (raw.length > 2000) throw new HttpError(400, 'Слишком длинный адрес');
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) raw = `https://${raw.replace(/^\/+/, '')}`;
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new HttpError(400, 'Это не похоже на адрес сайта');
  }
  checkUrl(url);
  url.hash = '';
  return url;
}

function checkUrl(url) {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new HttpError(400, 'Поддерживаются только адреса http:// и https://');
  if (url.username || url.password) throw new HttpError(400, 'Адрес с логином и паролем проверить нельзя');
  if (url.port && !['80', '443'].includes(url.port)) throw new HttpError(400, 'Проверяются только сайты на стандартных портах 80 и 443');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(host) ? !isPublicAddress(host) : !host.includes('.') || /\.(local|internal|localhost)$/i.test(host) || host === 'localhost') {
    throw new HttpError(400, 'Адреса внутренних сетей проверять нельзя');
  }
}

// ---------- Загрузка ----------

function charsetOf(contentType, head) {
  const fromHeader = /charset=["']?([\w-]+)/i.exec(contentType || '')?.[1];
  if (fromHeader) return fromHeader;
  const ascii = head.toString('latin1');
  return /<meta[^>]+charset=["']?([\w-]+)/i.exec(ascii)?.[1] || 'utf-8';
}

function decode(buffer, contentType) {
  try {
    return new TextDecoder(charsetOf(contentType, buffer.subarray(0, 4096)).toLowerCase()).decode(buffer);
  } catch {
    return new TextDecoder('utf-8').decode(buffer);
  }
}

/**
 * Один запрос без перехода по редиректам. Сертификат не блокирует загрузку: страница публичная, а ошибку
 * сертификата (tls) мы показываем в отчёте — посетители сайта её тоже увидят.
 */
export function fetchOnce(url, { maxBytes = AUDIT_LIMITS.pageBytes, timeout = AUDIT_LIMITS.timeout } = {}) {
  return new Promise((resolve, reject) => {
    checkUrl(url);
    const lib = url.protocol === 'https:' ? https : http;
    const started = performance.now();
    let done = false;
    const finish = (fn, value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      fn(value);
    };
    const req = lib.request(url, {
      method: 'GET',
      lookup: safeLookup,
      rejectUnauthorized: false,
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Accept-Language': 'ru,en;q=0.8',
      },
    }, (res) => {
      const ttfb = Math.round(performance.now() - started);
      const tls = url.protocol === 'https:' && !res.socket.authorized ? String(res.socket.authorizationError || 'CERT_ERROR') : null;
      const base = { url: url.href, status: res.statusCode, headers: res.headers, ttfb, tls };
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return finish(resolve, { ...base, location: res.headers.location, body: Buffer.alloc(0), time: ttfb, transfer: 0, truncated: false });
      }
      const enc = String(res.headers['content-encoding'] || '').toLowerCase().trim();
      const unzip = { gzip: zlib.createGunzip, 'x-gzip': zlib.createGunzip, br: zlib.createBrotliDecompress, deflate: zlib.createInflate }[enc];
      const stream = unzip ? res.pipe(unzip()) : res;
      const chunks = [];
      let size = 0;
      let transfer = 0;
      let truncated = false;
      const end = () => {
        const body = Buffer.concat(chunks);
        finish(resolve, { ...base, body, time: Math.round(performance.now() - started), transfer, truncated });
      };
      res.on('data', (c) => (transfer += c.length));
      stream.on('data', (c) => {
        if (truncated) return;
        size += c.length;
        if (size > maxBytes) {
          truncated = true;
          chunks.push(c.subarray(0, c.length - (size - maxBytes)));
          end();
          req.destroy();
        } else chunks.push(c);
      });
      stream.on('end', end);
      stream.on('error', (e) => (chunks.length ? end() : finish(reject, e)));
    });
    const timer = setTimeout(() => req.destroy(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })), timeout);
    req.on('error', (e) => finish(reject, e));
    req.end();
  });
}

/** Запрос с переходом по редиректам; redirects — цепочка { url, status }. */
async function follow(start, options = {}) {
  const redirects = [];
  let url = start;
  for (let hop = 0; hop <= AUDIT_LIMITS.redirects; hop++) {
    const res = await fetchOnce(url, options);
    if (!res.location) return { ...res, redirects };
    redirects.push({ url: url.href, status: res.status });
    try {
      url = new URL(res.location, url);
    } catch {
      throw new HttpError(502, 'Сайт отвечает редиректом на некорректный адрес');
    }
    if (redirects.some((r) => r.url === url.href)) throw new HttpError(502, 'Сайт зациклил редиректы');
  }
  throw new HttpError(502, `Больше ${AUDIT_LIMITS.redirects} редиректов подряд`);
}

function explain(e) {
  if (e instanceof HttpError) return e;
  const code = e?.code || '';
  if (code === 'EPRIVATE') return new HttpError(400, 'Адреса внутренних сетей проверять нельзя');
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return new HttpError(422, 'Сайт не найден — проверьте адрес');
  if (code === 'ETIMEDOUT') return new HttpError(504, `Сайт не ответил за ${AUDIT_LIMITS.timeout / 1000} секунд`);
  if (code === 'ECONNREFUSED' || code === 'ECONNRESET' || code === 'EHOSTUNREACH') return new HttpError(502, 'Не удалось подключиться к сайту');
  return new HttpError(502, 'Не удалось загрузить страницу');
}

// ---------- robots.txt и sitemap.xml ----------

const unescapeXml = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").trim();

/** Разбор sitemap: { index, total, urls: [[loc, lastmod]], children }. */
export function parseSitemap(xml) {
  const index = /<sitemapindex[\s>]/i.test(xml);
  const blocks = xml.match(/<(url|sitemap)>[\s\S]*?<\/\1>/gi) || [];
  const urls = [];
  for (const b of blocks) {
    const loc = /<loc>([\s\S]*?)<\/loc>/i.exec(b)?.[1];
    if (!loc) continue;
    urls.push([unescapeXml(loc.replace(/<!\[CDATA\[|\]\]>/g, '')), /<lastmod>([\s\S]*?)<\/lastmod>/i.exec(b)?.[1]?.trim() || '']);
  }
  return { index, total: urls.length, urls };
}

async function getText(url, maxBytes) {
  const res = await follow(url, { maxBytes });
  let body = res.body;
  if (body[0] === 0x1f && body[1] === 0x8b) {
    try {
      body = zlib.gunzipSync(body); // sitemap.xml.gz без Content-Encoding
    } catch {
      /* оставляем как есть */
    }
  }
  return { url: res.url, status: res.status, text: res.status === 200 ? decode(body, res.headers['content-type']) : '', truncated: res.truncated };
}

const safely = (promise) => promise.catch((e) => ({ error: explain(e).message }));

async function loadSitemap(origin, robotsText) {
  const declared = [...(robotsText || '').matchAll(/^\s*sitemap\s*:\s*(\S+)/gim)].map((m) => m[1]);
  const candidates = declared.length ? declared : [`${origin}/sitemap.xml`];
  let first = null;
  for (const href of candidates.slice(0, 3)) {
    let url;
    try {
      url = new URL(href, origin);
      checkUrl(url);
    } catch {
      continue;
    }
    const res = await safely(getText(url, AUDIT_LIMITS.sitemapBytes));
    first ||= { ...res, declared: declared.length > 0 };
    if (res.status !== 200 || !/<(urlset|sitemapindex)[\s>]/i.test(res.text)) continue;
    const parsed = parseSitemap(res.text);
    let urls = parsed.urls;
    let child = null;
    if (parsed.index && urls.length) {
      // Индекс sitemap: смотрим первый вложенный файл — для оценки свежести этого хватит.
      try {
        const sub = await getText(new URL(urls[0][0]), AUDIT_LIMITS.sitemapBytes);
        child = { url: sub.url, status: sub.status };
        if (sub.status === 200) urls = parseSitemap(sub.text).urls;
      } catch (e) {
        child = { url: urls[0][0], error: explain(e).message };
      }
    }
    return {
      found: true, url: res.url, status: res.status, declared: declared.length > 0, index: parsed.index, files: parsed.index ? parsed.total : 1,
      total: parsed.index ? null : parsed.total, child, urls: urls.slice(0, AUDIT_LIMITS.sitemapUrls), truncated: res.truncated,
    };
  }
  return { found: false, declared: declared.length > 0, url: first?.url || candidates[0], status: first?.status, error: first?.error };
}

// ---------- Проверка ----------

const HEADERS = ['content-type', 'content-encoding', 'content-language', 'x-robots-tag', 'cache-control', 'strict-transport-security', 'last-modified', 'link', 'server'];
const pick = (headers) => Object.fromEntries(HEADERS.filter((k) => headers[k] != null).map((k) => [k, String(headers[k])]));

/** Первый ответ без перехода по редиректам: { status, location } или { error }. */
async function probe(url) {
  try {
    const res = await fetchOnce(url, { maxBytes: 64 * 1024, timeout: 6000 });
    return { url: url.href, status: res.status, location: res.location ? new URL(res.location, url).href : null };
  } catch (e) {
    return { url: url.href, error: explain(e).message };
  }
}

export async function runAudit(input) {
  const start = normalizeTarget(input);
  const page = await follow(start).catch((e) => {
    throw explain(e);
  });
  const final = new URL(page.url);
  const contentType = String(page.headers['content-type'] || '');
  const isHtml = /html|xml/i.test(contentType) || (!contentType && /<html/i.test(page.body.subarray(0, 2048).toString('latin1')));

  // Зеркало www: только для домена второго уровня и его www-версии (у поддоменов зеркала обычно нет).
  const host = final.hostname;
  const altHost = host.startsWith('www.') ? host.slice(4) : host.split('.').length === 2 ? `www.${host}` : null;
  const [robots, httpVersion, mirror] = await Promise.all([
    safely(getText(new URL('/robots.txt', final.origin), AUDIT_LIMITS.robotsBytes)),
    final.protocol === 'https:' ? probe(new URL(`http://${final.host}/`)) : null,
    altHost ? probe(new URL(`${final.protocol}//${altHost}/`)) : null,
  ]);
  const sitemap = await safely(loadSitemap(final.origin, robots.status === 200 ? robots.text : ''));

  return {
    input: start.href,
    url: final.href,
    status: page.status,
    redirects: page.redirects,
    ttfb: page.ttfb,
    time: page.time,
    bytes: page.body.length,
    transfer: page.transfer,
    truncated: page.truncated,
    certError: page.tls,
    headers: pick(page.headers),
    html: isHtml ? decode(page.body, contentType) : '',
    robots,
    sitemap,
    http: httpVersion,
    mirror,
    checkedAt: new Date().toISOString(),
  };
}

// ---------- Лимиты ----------

export function createAuditor({ run = runAudit, now = Date.now } = {}) {
  const counters = new Map();
  let active = 0;
  const queue = [];

  function take(key, max) {
    const t = now();
    let c = counters.get(key);
    if (!c || t - c.start > AUDIT_LIMITS.window) counters.set(key, (c = { start: t, count: 0 }));
    if (c.count >= max) return false;
    c.count++;
    return true;
  }

  const slot = () => (active < AUDIT_LIMITS.concurrency ? Promise.resolve(active++) : new Promise((r) => queue.push(r)).then(() => active++));
  const release = () => {
    active--;
    queue.shift()?.();
  };

  return async function audit(body, ip) {
    if (!body || typeof body !== 'object' || typeof body.url !== 'string') throw new HttpError(400, 'Нужен адрес сайта: { "url": "…" }');
    normalizeTarget(body.url); // ошибки адреса — до счётчиков
    if (!take(`ip:${ip}`, AUDIT_LIMITS.perIp)) throw new HttpError(429, 'Слишком много проверок подряд — повторите через несколько минут');
    if (!take('*', AUDIT_LIMITS.global)) throw new HttpError(503, 'Сервер проверки перегружен — повторите позже');
    await slot();
    try {
      return await run(body.url);
    } finally {
      release();
    }
  };
}
