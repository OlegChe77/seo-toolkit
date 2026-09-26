// Транслитерация кириллицы в латиницу.
const BASE = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm',
  н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '',
  ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
  // украинский и белорусский
  і: 'i', ї: 'yi', є: 'ye', ґ: 'g', ў: 'u',
};

export const SCHEMES = {
  // Распространённый вариант для ЧПУ (близок к транслитерации Яндекса).
  url: { ...BASE },
  // Правила МВД/ICAO Doc 9303 (как в загранпаспорте).
  icao: { ...BASE, й: 'i', х: 'kh', ц: 'ts', щ: 'shch', ъ: 'ie', ю: 'iu', я: 'ia', ї: 'i', є: 'ie' },
};

export function transliterate(text, scheme = 'url') {
  const map = SCHEMES[scheme] || SCHEMES.url;
  let out = '';
  for (const ch of String(text)) {
    const lower = ch.toLowerCase();
    const tr = map[lower];
    if (tr === undefined) out += ch;
    else if (ch !== lower && tr) out += tr[0].toUpperCase() + tr.slice(1);
    else out += tr;
  }
  return out;
}
