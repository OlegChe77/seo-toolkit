// Тесты серверной части SEO-анализа (server/audit.js): npm test
import assert from 'node:assert/strict';
import http from 'node:http';
import { test } from 'node:test';
import { AUDIT_LIMITS, createAuditor, fetchOnce, isPublicAddress, normalizeTarget, parseSitemap } from '../server/audit.js';
import { HttpError } from '../server/proxy.js';

test('публичные и внутренние IP-адреса', () => {
  for (const ip of ['8.8.8.8', '93.184.216.34', '2a00:1450:4010:c05::64', '172.32.0.1']) assert.equal(isPublicAddress(ip), true, ip);
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '::1', '::', 'fe80::1', 'fd00::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1', '2002:7f00:1::1', 'localhost', 'abc']) {
    assert.equal(isPublicAddress(ip), false, ip);
  }
});

test('адрес из формы', () => {
  assert.equal(normalizeTarget('example.com').href, 'https://example.com/');
  assert.equal(normalizeTarget(' http://example.com/a?b=1#x ').href, 'http://example.com/a?b=1');
  for (const bad of ['', 'ftp://example.com', 'http://localhost/', 'http://127.0.0.1/', 'http://[::1]/', 'http://2130706433/', 'http://10.0.0.1/', 'http://example.com:8080/', 'http://user:pass@example.com/', 'http://intranet/', 'http://printer.local/', 'javascript:alert(1)']) {
    assert.throws(() => normalizeTarget(bad), HttpError, bad);
  }
});

test('к локальному серверу не подключается даже напрямую', async () => {
  const server = http.createServer((req, res) => res.end('secret'));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  try {
    await assert.rejects(fetchOnce(new URL(`http://127.0.0.1:${port}/`)), HttpError);
    await assert.rejects(fetchOnce(new URL('http://127.0.0.1/')), HttpError);
  } finally {
    server.close();
  }
});

test('имя, которое указывает на внутренний адрес, отклоняется при соединении', async () => {
  // localhost.localtest.me и подобные сервисы отвечают 127.0.0.1; здесь проверяем сам lookup на «localhost.»
  await assert.rejects(fetchOnce(new URL('http://localhost./')), (e) => e instanceof HttpError || e.code === 'EPRIVATE');
});

test('разбор sitemap', () => {
  const xml = `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    <url><loc>https://example.com/a?x=1&amp;y=2</loc><lastmod>2026-05-01</lastmod></url>
    <url><loc><![CDATA[https://example.com/b]]></loc></url></urlset>`;
  assert.deepEqual(parseSitemap(xml), { index: false, total: 2, urls: [['https://example.com/a?x=1&y=2', '2026-05-01'], ['https://example.com/b', '']] });
  const index = parseSitemap('<sitemapindex><sitemap><loc>https://example.com/s1.xml</loc></sitemap></sitemapindex>');
  assert.equal(index.index, true);
  assert.equal(index.urls[0][0], 'https://example.com/s1.xml');
});

test('лимиты проверок', async () => {
  let t = 0;
  const audit = createAuditor({ run: async (url) => ({ url }), now: () => t });
  for (let i = 0; i < AUDIT_LIMITS.perIp; i++) await audit({ url: 'example.com' }, '1.1.1.1');
  await assert.rejects(audit({ url: 'example.com' }, '1.1.1.1'), (e) => e.status === 429);
  assert.deepEqual(await audit({ url: 'example.com' }, '2.2.2.2'), { url: 'example.com' });
  t += AUDIT_LIMITS.window + 1;
  assert.deepEqual(await audit({ url: 'example.com' }, '1.1.1.1'), { url: 'example.com' });
  await assert.rejects(audit({ url: 'http://127.0.0.1/' }, '3.3.3.3'), (e) => e.status === 400);
  await assert.rejects(audit({}, '3.3.3.3'), (e) => e.status === 400);
});
