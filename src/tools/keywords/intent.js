// Намерение и сложность ключевой фразы по её словам — без данных выдачи.
//
// Сложность (1–99) — оценка того, сколько сил уйдёт на топ: растёт с частотностью,
// у коммерческих и коротких запросов выше, у длинных и информационных ниже.
// Запросы про чужие площадки (Авито, Озон…) — «навигационные»: свой сайт по ним не продвинуть.

// В JS \b и \w понимают только латиницу, поэтому границы слов — через Unicode-классы.
const W = '[\\p{L}\\p{N}_]';
const words = (body) => new RegExp(`(?<!${W})(?:${body.replace(/\\w/g, W)})(?!${W})`, 'u');
const starts = (body) => new RegExp(`^(?:${body.replace(/\\w/g, W)})(?!${W})`, 'u');

// Маркетплейсы и крупные сети: по таким запросам ищут конкретный магазин.
const MARKETPLACES = words(String.raw`авито|avito|озон\w*|ozon|вайлдберри\w*|валберис\w*|wildberries|яндекс маркет\w*|мегамаркет\w*|алиэкспресс\w*|aliexpress|икеа|ikea|леруа\w*|леман\w* про|lemana|хофф|hoff|много мебели|олх|olx|куфар\w*|kufar|мвидео|м видео|эльдорадо|ситилинк|спортмастер\w*|ламода|lamoda|детский мир|amazon|ebay|walmart|etsy|temu`);
const BUY_QUESTION = words(String.raw`где (?:купить|заказать|найти|продают)|сколько стоит|how much|where to buy`);
const COMMERCIAL = words(String.raw`купить|куплю|покупк\w*|цен[аыуе]|стоимост\w*|заказать|доставк\w*|недорог\w*|дешев\w*|распродаж\w*|скидк\w*|акци[яи]|магазин\w*|прайс\w*|оптом|оптов\w*|рассрочк\w*|кредит\w*|аренд\w*|прокат\w*|услуг\w*|ремонт\w*|мастер\w*|вызвать|вызов|установк\w*|монтаж\w*|под ключ|бу|б/у|buy|price\w*|cost|cheap\w*|deals?|sale|discount\w*|order|shop|store|coupons?|service\w*|repair\w*|hire|rent\w*|for sale`);
const SERVICE = words(String.raw`услуг\w*|ремонт\w*|мастер\w*|вызвать|вызов|установк\w*|монтаж\w*|под ключ|service\w*|repair\w*|hire`);
const INVESTIGATION = words(String.raw`отзыв\w*|обзор\w*|рейтинг\w*|лучш\w*|топ|сравнени\w*|что лучше|или|vs|reviews?|best|top|versus|compare\w*|comparison`);
const QUESTION = starts(String.raw`как|что|почему|зачем|когда|как\w+|сколько|где|можно ли|стоит ли|нужно ли|чем|кто|how|what|why|when|which|who|where|can|is|are|does|do|should`);
const INFO = words(String.raw`своими руками|инструкци\w*|схем\w*|чертеж\w*|фото|видео|идеи|советы|размер\w*|что такое|для начинающих|самостоятельно|пошагов\w*|diy|guide|tutorial|ideas|tips|meaning|definition|for beginners`);
const GEO = words(String.raw`москв\w*|мск|спб|санкт-петербург\w*|петербург\w*|питер\w*|новосибирск\w*|екатеринбург\w*|казан[ьи]|новгород\w*|челябинск\w*|самар[аеыу]|омск\w*|ростов\w*|уф[аеуы]|красноярск\w*|перм[ьи]|воронеж\w*|волгоград\w*|краснодар\w*|саратов\w*|тюмен[ьи]|тольятти|ижевск\w*|барнаул\w*|ульяновск\w*|иркутск\w*|хабаровск\w*|ярославл\w*|владивосток\w*|махачкал\w*|томск\w*|оренбург\w*|кемерово|новокузнецк\w*|рязан[ьи]|астрахан[ьи]|пенз[аеы]|липецк\w*|киров\w*|чебоксар\w*|тул[аеы]|калининград\w*|курск\w*|ставропол\w*|сочи|тамбов\w*|твер[ьи]|белгород\w*|брянск\w*|иваново|архангельск\w*|смоленск\w*|сургут\w*|минск\w*|гомел\w*|брест\w*|гродно|витебск\w*|алмат\w*|астан\w*|шымкент\w*|караганд\w*|павлодар\w*|бишкек\w*|ташкент\w*|киев\w*|харьков\w*|одесс\w*|днепр\w*|львов\w*|днр|лнр|крым\w*|област\w*|рядом|поблизости|near me|nearby|new york|nyc|los angeles|chicago|houston|london|toronto`);

const INTENT_SHIFT = { commercial: 18, investigation: 8, general: 5, info: -5, nav: 0 };
const WORDS_SHIFT = { 0: 20, 1: 20, 2: 8, 3: 0, 4: -7 };
export const GREEN_MIN_VOLUME = 300; // зелёный — только если спрос заметный

export function intentOf(phrase) {
  if (MARKETPLACES.test(phrase)) return 'nav';
  if (BUY_QUESTION.test(phrase)) return 'commercial';
  if (INVESTIGATION.test(phrase)) return 'investigation';
  if (QUESTION.test(phrase) || INFO.test(phrase)) return 'info';
  if (COMMERCIAL.test(phrase)) return 'commercial';
  return 'general';
}

export function analyze(phrase, volume, contentWords) {
  const intent = intentOf(phrase);
  const geo = GEO.test(phrase);
  let d = 15 + 12 * Math.max(0, Math.log10(Math.max(volume, 1)) - 2);
  d += INTENT_SHIFT[intent] + (WORDS_SHIFT[contentWords] ?? -14) + (geo ? 5 : 0);
  if (intent === 'nav') d = Math.max(d, 90);
  d = Math.round(Math.min(99, Math.max(1, d)));
  const color = d >= 65 ? 'red' : d <= 40 && volume >= GREEN_MIN_VOLUME ? 'green' : 'yellow';
  return {
    difficulty: d,
    color,
    intent,
    geo,
    question: QUESTION.test(phrase),
    service: SERVICE.test(phrase),
    potential: Math.round(volume * ((100 - d) / 100) ** 2),
  };
}
