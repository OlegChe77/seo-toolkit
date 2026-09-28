// Тесты оценки частотности и сложности Keyword Finder: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MODEL, chainTops, classify, contentStems, estimate, lengthCap, nice, prefixes, relevant, stem } from '../src/tools/keywords/engine.js';
import { analyze, intentOf } from '../src/tools/keywords/intent.js';

const M = MODEL;
const g = M.gamma;
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`);
const lists = (obj) => new Map(Object.entries(obj));

test('списки сшиваются через общие фразы', () => {
  const top = chainTops(lists({ д: ['дом', 'доллар', 'диван'], ди: ['диван', 'диета', 'дизайн'] }), 'ru');
  // «диван» 3-й в «д» и 1-й в «ди» — лидер «ди» и есть «диван».
  close(top.get('ди'), top.get('д') - g * Math.log10(3));
});

test('лидер дочернего списка не выше лидера родителя', () => {
  const top = chainTops(lists({ д: ['диван', 'дом'], ди: ['диета', 'диван'] }), 'ru');
  assert.equal(top.get('ди'), top.get('д'));
});

test('без общих фраз — ниже хвоста родителя', () => {
  const top = chainTops(lists({ к: ['a', 'b', 'c'], ку: ['x', 'y'] }), 'ru');
  close(top.get('ку'), top.get('к') - g * Math.log10(3) + Math.log10(M.rho));
});

test('новое слово на редкую букву оценивается ниже', () => {
  const top = chainTops(lists({ 'диван ': ['диван а', 'диван б'], 'диван п': ['x'], 'диван щ': ['y'] }), 'ru');
  assert.ok(top.get('диван щ') < top.get('диван п'));
});

test('фраза, которой нет в подсказках, получает оценку по своему списку', () => {
  const raw = estimate({ google: lists({ д: ['дом'], ди: ['диван кровать'], див: ['диван кровать'], дива: ['диван кровать'], диван: ['диван кровать', 'диван книжка'] }) }, 'ru');
  assert.ok(raw.has('диван') && raw.get('диван') > raw.get('диван книжка'));
});

test('чужие фразы в списке не сшивают списки', () => {
  const raw = estimate({ google: lists({ 'купить диван ': ['купить диван на озон', 'купить диван бу'], 'купить диван э': ['купить диван эшли', 'купить диван на озон'] }) }, 'ru');
  assert.ok(raw.get('купить диван эшли') < raw.get('купить диван бу'));
});

test('оценки Google и Яндекса усредняются, YouTube/Bing только добавляют фразы', () => {
  const g = lists({ д: ['диван', 'дом'] });
  const y = lists({ д: ['дом', 'диван'] });
  const one = estimate({ google: g }, 'ru');
  const both = estimate({ google: g, yandex: y, bing: lists({ д: ['дача'] }) }, 'ru');
  const yOnly = estimate({ yandex: y }, 'ru');
  close(both.get('диван'), (one.get('диван') + yOnly.get('диван')) / 2);
  assert.ok(both.has('дача') && both.get('дача') < both.get('дом'));
});

test('уточнение ограничено частотой основы', () => {
  const out = lengthCap(new Map([['купить диван', 5.0], ['купить диван спб', 4.8], ['купить диван москва', 4.5], ['купить диван спб хорошего качества', 4.7], ['купить диваны', 4.9]]));
  const k = Math.log10(M.kappa);
  assert.ok(out.get('купить диван спб') < 5 + k);
  assert.ok(out.get('купить диван москва') < out.get('купить диван спб'));
  assert.ok(out.get('купить диван спб хорошего качества') < 5 + 3 * k);
  assert.equal(out.get('купить диван'), 5.0);
  assert.equal(out.get('купить диваны'), 4.9); // те же слова — не уточнение
});

test('вопросительное слово делает фразу уточнением', () => {
  const out = lengthCap(new Map([['купить диван из китая', 3.0], ['как купить диван из китая', 4.0]]));
  assert.ok(out.get('как купить диван из китая') < 3.0);
});

test('релевантность по основам слов', () => {
  const stems = [[stem('купить'), stem('диван')]];
  assert.ok(relevant('купить диваны недорого', stems));
  assert.ok(!relevant('купить дивайны poe 2', stems));
  assert.ok(!relevant('диван кровать', stems));
});

test('вспомогательные функции', () => {
  assert.deepEqual(prefixes('abc'), ['a', 'ab', 'abc']);
  assert.equal(nice(12345), 12000);
  assert.equal(nice(7.4), 7);
  assert.deepEqual([20000, 5000, 500, 50].map((v) => classify(v, [10000, 1000, 100])), ['ВЧ', 'СЧ', 'НЧ', 'микро']);
});

const a = (phrase, volume) => analyze(phrase, volume, contentStems(phrase).length);

test('намерение запроса', () => {
  assert.equal(intentOf('купить диван на озоне'), 'nav');
  assert.equal(intentOf('купить диван лемана про'), 'nav');
  assert.equal(intentOf('купить диван много мебели'), 'nav');
  assert.equal(intentOf('где купить диван'), 'commercial');
  assert.equal(intentOf('купить диван кровать'), 'commercial');
  assert.equal(intentOf('обивка дивана своими руками'), 'info');
  assert.equal(intentOf('как выбрать диван'), 'info');
  assert.equal(intentOf('лучшие диваны 2026'), 'investigation');
  assert.equal(intentOf('диван'), 'general');
  assert.equal(intentOf('running shoes for women'), 'general');
  assert.equal(intentOf('best running shoes'), 'investigation');
  assert.equal(intentOf('диван топпер'), 'general'); // «топ» — только отдельным словом
});

test('цвета потенциала', () => {
  assert.equal(a('купить диван', 120000).color, 'red');
  assert.equal(a('купить диван на озоне', 500).color, 'red');
  assert.equal(a('обивка дивана своими руками', 2400).color, 'green');
  assert.equal(a('купить диван угловой раскладной недорого', 500).color, 'green');
  assert.equal(a('купить диван кровать недорого', 5000).color, 'yellow');
  assert.equal(a('ремонт холодильника электролюкс в москве официальный', 7).color, 'yellow');
  assert.equal(a('купить диван щербинка', 110).color, 'yellow');
});

test('город и потенциал', () => {
  const r = a('купить диван в москве', 30000);
  assert.ok(r.geo && r.difficulty > a('купить диван угловой', 30000).difficulty);
  assert.ok(a('диван из поддонов', 5000).potential > a('купить диван', 5000).potential);
});
