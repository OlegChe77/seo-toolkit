// HTTP-сервер SEO Toolkit (без зависимостей, Node.js 20+).
//   GET  /healthz — проверка и «пробуждение» бесплатного сервиса Render
//   POST /yandex  — пачка подсказок Яндекса для Keyword Finder, см. proxy.js
//   POST /audit   — загрузка страницы, robots.txt и sitemap.xml для SEO-анализа, см. audit.js
// Разрешённые сайты — переменная ALLOWED_ORIGINS (через запятую).
import http from 'node:http';
import { createAuditor } from './audit.js';
import { HttpError, LIMITS, createProxy, validate } from './proxy.js';

const PORT = Number(process.env.PORT) || 8787;
const ORIGINS = new Set(
  (process.env.ALLOWED_ORIGINS || 'https://seotoolkitru.onrender.com,http://localhost:5173,http://localhost:4173')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean),
);
const proxy = createProxy();
const audit = createAuditor();

function send(res, status, body, origin) {
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', Vary: 'Origin' };
  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Content-Type';
    headers['Access-Control-Max-Age'] = '86400';
  }
  res.writeHead(status, headers);
  res.end(body === null ? undefined : JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > LIMITS.body) {
        reject(new HttpError(413, 'Слишком большой запрос'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const origin = ORIGINS.has(req.headers.origin) ? req.headers.origin : null;
  const path = new URL(req.url, 'http://x').pathname;
  try {
    if (req.method === 'GET' && (path === '/healthz' || path === '/')) return send(res, 200, { ok: true }, origin);
    if (path !== '/yandex' && path !== '/audit') throw new HttpError(404, 'Не найдено');
    if (!origin) throw new HttpError(403, 'Запросы принимаются только с сайта SEO Toolkit');
    if (req.method === 'OPTIONS') return send(res, 204, null, origin);
    if (req.method !== 'POST') throw new HttpError(405, 'Нужен POST');
    let body;
    try {
      body = JSON.parse(await readBody(req));
    } catch (e) {
      throw e instanceof HttpError ? e : new HttpError(400, 'Некорректный JSON');
    }
    // IP клиента за прокси Render — первый адрес в X-Forwarded-For.
    const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
    if (path === '/audit') return send(res, 200, await audit(body, ip), origin);
    send(res, 200, { results: await proxy.batch(validate(body), ip) }, origin);
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    if (status === 500) console.error('Ошибка сервера:', e.message); // без текста запросов
    send(res, status, { error: e instanceof HttpError ? e.message : 'Внутренняя ошибка' }, origin);
  }
});

server.listen(PORT, () => console.log(`Посредник подсказок Яндекса слушает порт ${PORT}`));
