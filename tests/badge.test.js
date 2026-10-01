// Тесты значков «SEO-оценка»: npm test
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { BADGE_SIZES, BADGE_THEMES, badgeCode, badgeGrade, badgePath } from '../src/tools/audit/badge.js';

test('оформление по оценке — те же пороги, что у отчёта', () => {
  assert.deepEqual([100, 90, 89, 75, 74, 50, 49, 0].map((s) => badgeGrade(s).id), ['great', 'great', 'good', 'good', 'mid', 'mid', 'bad', 'bad']);
});

test('для каждой темы, оценки и размера есть картинка', () => {
  assert.equal(badgePath('dark', 'banner', 87), '/badge/banner/87.svg'); // старые коды продолжают работать
  assert.equal(badgePath('light', 'banner', 87), '/badge/light/banner/87.svg');
  for (const theme of BADGE_THEMES) {
    for (const size of BADGE_SIZES) {
      for (let s = 0; s <= 100; s++) {
        const file = `public${badgePath(theme.id, size.id, s)}`;
        assert.ok(fs.existsSync(file), file);
      }
    }
  }
  const svg = fs.readFileSync('public/badge/banner/87.svg', 'utf8');
  assert.match(svg, /^<svg[^>]+width="468" height="60"/);
  assert.match(svg, />87</);
});

test('код значка: та же оценка, ссылка на проверку сайта, экранирование', () => {
  const size = BADGE_SIZES.find((s) => s.id === 'medal');
  const html = badgeCode({ origin: 'https://seotoolkitru.onrender.com', size, score: 87, site: 'example.com', date: '01.10.2026' });
  assert.match(html, /src="https:\/\/seotoolkitru\.onrender\.com\/badge\/medal\/87\.svg"/);
  assert.match(html, /href="https:\/\/seotoolkitru\.onrender\.com\/seo-audit#url=example\.com"/);
  assert.match(html, /width="150" height="150"/);
  assert.match(html, /87 из 100/);
  assert.doesNotMatch(badgeCode({ origin: 'https://x', size, score: 5, site: 'a"><script>', date: '' }), /"><script>/);
  assert.equal(badgeCode({ origin: 'https://x', size, score: 5, site: 'a.ru', date: '', format: 'md' }), '[![SEO-оценка 5 из 100 — SEO Toolkit](https://x/badge/medal/5.svg)](https://x/seo-audit#url=a.ru)');
  assert.match(badgeCode({ origin: 'https://x', size, theme: 'light', score: 5, site: 'a.ru', date: '' }), /src="https:\/\/x\/badge\/light\/medal\/5\.svg"/);
});
