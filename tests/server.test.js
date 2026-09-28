// Тесты посредника подсказок Яндекса (server/): npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HttpError, LIMITS, createProxy, parseSuggest, validate } from '../server/proxy.js';

const fakeYandex = (calls = []) => async (url) => {
  const q = new URL(url).searchParams.get('part');
  calls.push(q);
  return { ok: true, json: async () => [q, [`${q} 1`, `${q} 2`, 42]] };
};

test('проверка тела запроса', () => {
  assert.deepEqual(validate({ queries: ['а', 'а', 'б'], lr: 213 }), { queries: ['а', 'б'], lr: '213', lang: 'ru' });
  for (const bad of [null, {}, { queries: [] }, { queries: [''] }, { queries: ['x'.repeat(LIMITS.queryLength + 1)] }, { queries: ['а'], lr: '1;rm' }, { queries: ['а'], lang: 'xx' }, { queries: Array(LIMITS.batch + 1).fill('а') }]) {
    assert.throws(() => validate(bad), HttpError);
  }
});

test('разбор ответа Яндекса', () => {
  assert.deepEqual(parseSuggest(['q', ['a', 1, 'b']]), ['a', 'b']);
  assert.deepEqual(parseSuggest({}), []);
});

test('пачка: ответы по запросам и кэш', async () => {
  const calls = [];
  const proxy = createProxy({ fetchImpl: fakeYandex(calls) });
  const first = await proxy.batch({ queries: ['диван', 'кровать'], lr: '225', lang: 'ru' }, '1.1.1.1');
  assert.deepEqual(first['диван'], ['диван 1', 'диван 2']);
  await proxy.batch({ queries: ['диван'], lr: '225', lang: 'ru' }, '1.1.1.1');
  assert.deepEqual(calls, ['диван', 'кровать']); // второй раз — из кэша
  await proxy.batch({ queries: ['диван'], lr: '213', lang: 'ru' }, '1.1.1.1');
  assert.equal(calls.length, 3); // другой регион — другой ключ кэша
});

test('ограничение частоты по IP не трогает кэш', async () => {
  const proxy = createProxy({ fetchImpl: fakeYandex() });
  const many = Array.from({ length: LIMITS.batch }, (_, i) => `q${i}`);
  const per = Math.floor(LIMITS.perIp / LIMITS.batch);
  for (let i = 0; i < per; i++) await proxy.batch({ queries: many.map((q) => `${q}-${i}`), lr: '225', lang: 'ru' }, '2.2.2.2');
  await assert.rejects(proxy.batch({ queries: ['новый'], lr: '225', lang: 'ru' }, '2.2.2.2'), (e) => e.status === 429);
  await proxy.batch({ queries: ['q0-0'], lr: '225', lang: 'ru' }, '2.2.2.2'); // из кэша — можно
  await proxy.batch({ queries: ['новый'], lr: '225', lang: 'ru' }, '3.3.3.3'); // другой IP — можно
});

test('сбой Яндекса — null, без кэша', async () => {
  let n = 0;
  const proxy = createProxy({ fetchImpl: async () => { n++; throw new Error('down'); } });
  const r = await proxy.batch({ queries: ['диван'], lr: '225', lang: 'ru' }, '4.4.4.4');
  assert.equal(r['диван'], null);
  assert.equal(n, 2); // одна повторная попытка
  assert.equal(proxy.cacheSize(), 0);
});
