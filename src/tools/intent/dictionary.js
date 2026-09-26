// Словарь маркеров интента. Формат маркера:
//   слово      — точное совпадение слова;
//   слово*     — слово, начинающееся с этих букв (купи* → купить, куплю);
//   два слова  — фраза подряд (звёздочка допустима в каждом слове);
//   .ru        — маркер с точкой ищется как подстрока (домены).
import { normalizeWord, words } from '../../core/text.js';

export const CATEGORIES = [
  { id: 'informational', name: 'Информационные', short: 'Информ.', color: 'var(--cat-meta)' },
  { id: 'commercial', name: 'Коммерческие', short: 'Коммерч.', color: 'var(--cat-tech)' },
  { id: 'navigational', name: 'Навигационные', short: 'Навиг.', color: 'var(--cat-content)' },
  { id: 'transactional', name: 'Транзакционные', short: 'Транзакц.', color: 'var(--cat-research)' },
  { id: 'review', name: 'Требуют проверки', short: 'Проверить', color: 'var(--text-3)' },
];

export const DEFAULT_DICTIONARY = {
  informational: `как
что
что такое
почему
зачем
когда
кто
какой
какая
какие
сколько
чем
где находится
инструкци*
своими руками
способ*
пример*
значение
определение
причин*
симптом*
признак*
совет*
рецепт*
история
виды
правила
схема
можно ли
нужно ли
как сделать
how
what
why
when
who
which
guide
tutorial
meaning
definition
ideas
tips
examples
diy`,
  commercial: `лучш*
топ
рейтинг*
обзор*
отзыв*
сравнени*
сравнить
vs
аналог*
альтернатив*
характеристик*
какой выбрать
что лучше
стоит ли
выбор
подбор
best
top
review*
compare
comparison
versus
alternative*
specs
pros and cons`,
  transactional: `купить
куплю
покупк*
заказ*
цена
цены
цене
стоимост*
прайс*
недорог*
дешев*
скидк*
акци*
распродаж*
промокод*
купон*
доставк*
в наличии
оптом
в кредит
рассрочк*
аренд*
забронировать
бронирован*
записаться
скачать
оформить
интернет-магазин*
магазин*
buy
order
price*
cheap*
discount*
coupon*
promo code
deal*
for sale
shipping
download
subscribe
booking
rent
shop`,
  navigational: `вход
войти
личный кабинет
официальный сайт
логин
горячая линия
контакты
телефон поддержки
служба поддержки
login
log in
sign in
signin
account
official site
customer service
contact*
www
.ru
.com
.рф
.net
.org`,
  brands: `youtube
ютуб
vk
вк
вконтакте
ozon
озон
wildberries
вайлдберриз
avito
авито
госуслуги
яндекс
google
гугл
gmail
telegram
телеграм
whatsapp
сбербанк
сбер
тинькофф
т-банк
альфа-банк
втб
mail.ru
одноклассники
amazon
ebay
aliexpress
алиэкспресс
rutube
дзен
hh.ru
2гис
кинопоиск
lamoda
ламода
мвидео
днс
эльдорадо
леруа мерлен
икеа
ikea
спортмастер`,
};

export const DICTIONARY_KEYS = [
  { key: 'informational', label: 'Информационные' },
  { key: 'commercial', label: 'Коммерческие' },
  { key: 'transactional', label: 'Транзакционные' },
  { key: 'navigational', label: 'Навигационные' },
  { key: 'brands', label: 'Бренды и сайты (навигационные, меньший вес)' },
];

const WEIGHTS = { informational: 1, commercial: 1, transactional: 1, navigational: 1.5, brands: 0.6 };

function compileMarker(raw) {
  const m = normalizeWord(raw.trim());
  if (!m) return null;
  if (m.includes('.')) return { label: raw.trim(), substring: m };
  const parts = m.split(/\s+/).map((p) => ({ text: p.replace(/\*$/, ''), prefix: p.endsWith('*') }));
  if (parts.some((p) => !p.text)) return null;
  return { label: raw.trim(), parts };
}

/** Готовит словарь к быстрому поиску. */
export function compileDictionary(dict) {
  const out = {};
  for (const { key } of DICTIONARY_KEYS) {
    const exact = new Map();
    const complex = [];
    for (const line of String(dict[key] || '').split(/\r?\n/)) {
      const c = compileMarker(line);
      if (!c) continue;
      if (c.parts && c.parts.length === 1 && !c.parts[0].prefix) exact.set(c.parts[0].text, c.label);
      else complex.push(c);
    }
    out[key] = { exact, complex };
  }
  return out;
}

const tokenMatch = (token, part) => (part.prefix ? token.startsWith(part.text) : token === part.text);

function findMarkers(tokens, raw, compiled) {
  const found = [];
  for (const t of tokens) if (compiled.exact.has(t)) found.push(compiled.exact.get(t));
  for (const c of compiled.complex) {
    if (c.substring) {
      if (raw.includes(c.substring)) found.push(c.label);
      continue;
    }
    const n = c.parts.length;
    for (let i = 0; i + n <= tokens.length; i++) {
      if (c.parts.every((p, j) => tokenMatch(tokens[i + j], p))) {
        found.push(c.label);
        break;
      }
    }
  }
  return [...new Set(found)];
}

/** Классифицирует один запрос. */
export function classify(query, compiled) {
  const raw = normalizeWord(query);
  const tokens = words(query);
  const scores = { informational: 0, commercial: 0, transactional: 0, navigational: 0 };
  const markers = [];
  for (const { key } of DICTIONARY_KEYS) {
    const found = findMarkers(tokens, raw, compiled[key]);
    if (!found.length) continue;
    const target = key === 'brands' ? 'navigational' : key;
    scores[target] += found.length * WEIGHTS[key];
    markers.push(...found);
  }
  if (/\?\s*$/.test(query)) {
    scores.informational += 1;
    markers.push('?');
  }
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [[top, s1], [second, s2]] = ranked;
  if (s1 === 0) return { category: 'review', auto: 'review', confidence: 'none', markers, reason: 'нет совпадений со словарём' };
  if (s1 - s2 < 0.3) {
    const names = CATEGORIES.filter((c) => c.id === top || c.id === second).map((c) => c.name.toLowerCase());
    return { category: 'review', auto: 'review', confidence: 'none', markers, reason: `похоже на несколько интентов: ${names.join(' / ')}` };
  }
  const confidence = s1 >= 1 && s1 - s2 >= 1 ? 'high' : 'medium';
  return { category: top, auto: top, confidence, markers, reason: '' };
}
