// Описания типов Schema.org: поля формы и сборка JSON-LD.
// Значения не подставляются за пользователя: в разметку попадает только то, что он ввёл.

const CURRENCIES = ['RUB', 'USD', 'EUR', 'KZT', 'BYN', 'UAH', 'UZS', 'GBP', 'CNY', 'TRY', 'AMD', 'GEL', 'AZN', 'KGS'].map((c) => [c, c]);

const AVAILABILITY = [
  ['InStock', 'В наличии (InStock)'],
  ['OutOfStock', 'Нет в наличии (OutOfStock)'],
  ['PreOrder', 'Предзаказ (PreOrder)'],
  ['BackOrder', 'Под заказ (BackOrder)'],
  ['LimitedAvailability', 'Ограниченное количество'],
  ['OnlineOnly', 'Только онлайн'],
  ['InStoreOnly', 'Только в магазине'],
  ['SoldOut', 'Распродано (SoldOut)'],
  ['Discontinued', 'Снят с производства'],
];

const TIMEZONES = Array.from({ length: 27 }, (_, i) => {
  const off = i - 12;
  const s = `${off < 0 ? '-' : '+'}${String(Math.abs(off)).padStart(2, '0')}:00`;
  return [s, `UTC${s}`];
});

const address = (required = false) => [
  { section: 'Адрес' },
  { key: 'streetAddress', label: 'Улица, дом', type: 'text', required },
  { key: 'addressLocality', label: 'Город', type: 'text', required },
  { key: 'addressRegion', label: 'Регион', type: 'text' },
  { key: 'postalCode', label: 'Почтовый индекс', type: 'text' },
  { key: 'addressCountry', label: 'Страна (код ISO)', type: 'text', placeholder: 'RU' },
];

const buildAddress = (v) => ({
  '@type': 'PostalAddress',
  streetAddress: v.streetAddress,
  addressLocality: v.addressLocality,
  addressRegion: v.addressRegion,
  postalCode: v.postalCode,
  addressCountry: v.addressCountry,
});

export const splitLines = (s) =>
  String(s || '')
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);

const oneOrMany = (arr) => (arr.length === 1 ? arr[0] : arr);

const withTz = (date, tz) => (date && tz && /T\d{2}:\d{2}/.test(date) && !/(Z|[+-]\d{2}:\d{2})$/.test(date) ? `${date.length === 16 ? `${date}:00` : date}${tz}` : date);

export const SCHEMA_TYPES = [
  {
    id: 'Article',
    label: 'Article — статья',
    fields: [
      { key: 'articleType', label: 'Подтип', type: 'select', options: [['Article', 'Article'], ['NewsArticle', 'NewsArticle'], ['BlogPosting', 'BlogPosting']], required: true, noEmpty: true },
      { key: 'headline', label: 'Заголовок (headline)', type: 'text', required: true, hint: 'Рекомендуется до 110 символов' },
      { key: 'description', label: 'Краткое описание', type: 'textarea' },
      { key: 'image', label: 'Изображения (URL, по одному в строке)', type: 'lines', placeholder: 'https://example.com/images/cover.jpg' },
      { key: 'datePublished', label: 'Дата публикации', type: 'date', required: true },
      { key: 'dateModified', label: 'Дата изменения', type: 'date' },
      { key: 'url', label: 'URL статьи', type: 'url' },
      { section: 'Автор' },
      { key: 'authorType', label: 'Тип автора', type: 'select', options: [['Person', 'Человек (Person)'], ['Organization', 'Организация']], noEmpty: true },
      { key: 'authorName', label: 'Имя автора', type: 'text', required: true },
      { key: 'authorUrl', label: 'Страница автора (URL)', type: 'url' },
      { section: 'Издатель' },
      { key: 'publisherName', label: 'Название издателя', type: 'text' },
      { key: 'publisherLogo', label: 'Логотип издателя (URL)', type: 'url' },
    ],
    build: (v) => ({
      '@type': v.articleType || 'Article',
      headline: v.headline,
      description: v.description,
      image: oneOrMany(splitLines(v.image)),
      datePublished: v.datePublished,
      dateModified: v.dateModified,
      mainEntityOfPage: v.url ? { '@type': 'WebPage', '@id': v.url } : undefined,
      author: { '@type': v.authorType || 'Person', name: v.authorName, url: v.authorUrl },
      publisher: { '@type': 'Organization', name: v.publisherName, logo: v.publisherLogo ? { '@type': 'ImageObject', url: v.publisherLogo } : undefined },
    }),
  },
  {
    id: 'Product',
    label: 'Product — товар',
    fields: [
      { key: 'name', label: 'Название товара', type: 'text', required: true },
      { key: 'description', label: 'Описание', type: 'textarea' },
      { key: 'image', label: 'Изображения (URL, по одному в строке)', type: 'lines' },
      { key: 'brand', label: 'Бренд', type: 'text' },
      { key: 'sku', label: 'Артикул (SKU)', type: 'text' },
      { key: 'gtin', label: 'GTIN / штрихкод', type: 'text' },
      { key: 'mpn', label: 'MPN', type: 'text' },
      { section: 'Предложение (Offer)' },
      { key: 'price', label: 'Цена', type: 'number', placeholder: '4990.00' },
      { key: 'priceCurrency', label: 'Валюта', type: 'select', options: CURRENCIES },
      { key: 'availability', label: 'Наличие', type: 'select', options: AVAILABILITY },
      { key: 'itemCondition', label: 'Состояние', type: 'select', options: [['NewCondition', 'Новый'], ['UsedCondition', 'Б/у'], ['RefurbishedCondition', 'Восстановленный'], ['DamagedCondition', 'Повреждённый']] },
      { key: 'offerUrl', label: 'URL страницы товара', type: 'url' },
      { key: 'priceValidUntil', label: 'Цена действует до', type: 'date' },
      { section: 'Рейтинг (только реальные данные отзывов)' },
      { key: 'ratingValue', label: 'Средняя оценка', type: 'number', placeholder: '4.6' },
      { key: 'reviewCount', label: 'Количество отзывов', type: 'number', placeholder: '27' },
      { key: 'bestRating', label: 'Максимальная оценка', type: 'number', placeholder: '5' },
    ],
    build: (v) => ({
      '@type': 'Product',
      name: v.name,
      description: v.description,
      image: oneOrMany(splitLines(v.image)),
      brand: v.brand ? { '@type': 'Brand', name: v.brand } : undefined,
      sku: v.sku,
      gtin: v.gtin,
      mpn: v.mpn,
      offers: {
        '@type': 'Offer',
        price: v.price,
        priceCurrency: v.priceCurrency,
        availability: v.availability ? `https://schema.org/${v.availability}` : undefined,
        itemCondition: v.itemCondition ? `https://schema.org/${v.itemCondition}` : undefined,
        url: v.offerUrl,
        priceValidUntil: v.priceValidUntil,
      },
      aggregateRating: { '@type': 'AggregateRating', ratingValue: v.ratingValue, reviewCount: v.reviewCount, bestRating: v.bestRating },
    }),
  },
  {
    id: 'Organization',
    label: 'Organization — организация',
    fields: [
      { key: 'orgType', label: 'Подтип', type: 'select', options: [['Organization', 'Organization'], ['Corporation', 'Corporation'], ['NGO', 'NGO'], ['EducationalOrganization', 'EducationalOrganization'], ['OnlineStore', 'OnlineStore']], noEmpty: true },
      { key: 'name', label: 'Название', type: 'text', required: true },
      { key: 'url', label: 'Сайт (URL)', type: 'url', required: true },
      { key: 'logo', label: 'Логотип (URL)', type: 'url' },
      { key: 'description', label: 'Описание', type: 'textarea' },
      { key: 'email', label: 'E-mail', type: 'email' },
      { key: 'telephone', label: 'Телефон', type: 'text', placeholder: '+7 000 000-00-00' },
      ...address(false),
      { key: 'sameAs', label: 'Профили в соцсетях и справочниках (URL, по одному в строке)', type: 'lines' },
    ],
    build: (v) => ({
      '@type': v.orgType || 'Organization',
      name: v.name,
      url: v.url,
      logo: v.logo,
      description: v.description,
      email: v.email,
      telephone: v.telephone,
      address: buildAddress(v),
      sameAs: splitLines(v.sameAs),
    }),
  },
  {
    id: 'LocalBusiness',
    label: 'LocalBusiness — местная компания',
    fields: [
      {
        key: 'businessType',
        label: 'Вид деятельности',
        type: 'select',
        noEmpty: true,
        options: ['LocalBusiness', 'Store', 'Restaurant', 'CafeOrCoffeeShop', 'BeautySalon', 'AutoRepair', 'Dentist', 'MedicalClinic', 'HealthClub', 'Hotel', 'LegalService', 'RealEstateAgent', 'FinancialService', 'TravelAgency', 'HomeAndConstructionBusiness'].map((x) => [x, x]),
      },
      { key: 'name', label: 'Название', type: 'text', required: true },
      { key: 'url', label: 'Сайт (URL)', type: 'url' },
      { key: 'telephone', label: 'Телефон', type: 'text', placeholder: '+7 000 000-00-00' },
      { key: 'priceRange', label: 'Ценовой диапазон', type: 'text', placeholder: '₽₽ или 1000–5000 RUB' },
      { key: 'image', label: 'Изображения (URL, по одному в строке)', type: 'lines' },
      { key: 'description', label: 'Описание', type: 'textarea' },
      ...address(true),
      { section: 'Координаты и часы работы' },
      { key: 'latitude', label: 'Широта', type: 'number', placeholder: '55.7558' },
      { key: 'longitude', label: 'Долгота', type: 'number', placeholder: '37.6173' },
      { key: 'openingHours', label: 'Часы работы (по одному правилу в строке)', type: 'lines', placeholder: 'Mo-Fr 09:00-18:00\nSa 10:00-16:00', hint: 'Дни: Mo, Tu, We, Th, Fr, Sa, Su' },
      { key: 'sameAs', label: 'Профили в соцсетях и на картах (URL, по одному в строке)', type: 'lines' },
    ],
    build: (v) => ({
      '@type': v.businessType || 'LocalBusiness',
      name: v.name,
      url: v.url,
      telephone: v.telephone,
      priceRange: v.priceRange,
      image: oneOrMany(splitLines(v.image)),
      description: v.description,
      address: buildAddress(v),
      geo: { '@type': 'GeoCoordinates', latitude: v.latitude, longitude: v.longitude },
      openingHours: oneOrMany(splitLines(v.openingHours)),
      sameAs: splitLines(v.sameAs),
    }),
  },
  {
    id: 'WebSite',
    label: 'WebSite — сайт',
    fields: [
      { key: 'name', label: 'Название сайта', type: 'text', required: true },
      { key: 'url', label: 'Адрес главной страницы', type: 'url', required: true },
      { key: 'alternateName', label: 'Альтернативное название', type: 'text' },
      { key: 'description', label: 'Описание', type: 'textarea' },
      { key: 'inLanguage', label: 'Язык (код)', type: 'text', placeholder: 'ru' },
      { key: 'searchUrl', label: 'Шаблон URL поиска по сайту', type: 'text', placeholder: 'https://example.com/search?q={search_term_string}', hint: 'Должен содержать {search_term_string}', full: true },
    ],
    build: (v) => ({
      '@type': 'WebSite',
      name: v.name,
      alternateName: v.alternateName,
      url: v.url,
      description: v.description,
      inLanguage: v.inLanguage,
      potentialAction: v.searchUrl
        ? { '@type': 'SearchAction', target: { '@type': 'EntryPoint', urlTemplate: v.searchUrl }, 'query-input': 'required name=search_term_string' }
        : undefined,
    }),
  },
  {
    id: 'BreadcrumbList',
    label: 'BreadcrumbList — хлебные крошки',
    fields: [
      {
        key: 'items',
        label: 'Элементы цепочки',
        type: 'list',
        itemLabel: 'Уровень',
        min: 2,
        fields: [
          { key: 'name', label: 'Название', type: 'text', required: true },
          { key: 'item', label: 'URL', type: 'url', hint: 'У последнего элемента URL можно не указывать' },
        ],
      },
    ],
    build: (v) => ({
      '@type': 'BreadcrumbList',
      itemListElement: (v.items || [])
        .filter((it) => it.name || it.item)
        .map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: it.item })),
    }),
  },
  {
    id: 'FAQPage',
    label: 'FAQPage — вопросы и ответы',
    fields: [
      {
        key: 'items',
        label: 'Вопросы и ответы',
        type: 'list',
        itemLabel: 'Вопрос',
        min: 1,
        fields: [
          { key: 'question', label: 'Вопрос', type: 'text', required: true, full: true },
          { key: 'answer', label: 'Ответ', type: 'textarea', required: true },
        ],
      },
    ],
    build: (v) => ({
      '@type': 'FAQPage',
      mainEntity: (v.items || [])
        .filter((it) => it.question || it.answer)
        .map((it) => ({ '@type': 'Question', name: it.question, acceptedAnswer: { '@type': 'Answer', text: it.answer } })),
    }),
  },
  {
    id: 'Event',
    label: 'Event — мероприятие',
    fields: [
      { key: 'name', label: 'Название мероприятия', type: 'text', required: true },
      { key: 'startDate', label: 'Начало', type: 'datetime', required: true },
      { key: 'endDate', label: 'Окончание', type: 'datetime' },
      { key: 'timezone', label: 'Часовой пояс', type: 'select', options: TIMEZONES, hint: 'Добавляется к дате и времени' },
      { key: 'eventStatus', label: 'Статус', type: 'select', options: [['EventScheduled', 'Запланировано'], ['EventPostponed', 'Перенесено (без даты)'], ['EventRescheduled', 'Перенесено на новую дату'], ['EventCancelled', 'Отменено'], ['EventMovedOnline', 'Переведено в онлайн']] },
      {
        key: 'attendance',
        label: 'Формат',
        type: 'select',
        rerender: true,
        noEmpty: true,
        options: [['OfflineEventAttendanceMode', 'Офлайн'], ['OnlineEventAttendanceMode', 'Онлайн'], ['MixedEventAttendanceMode', 'Смешанный']],
      },
      { key: 'description', label: 'Описание', type: 'textarea' },
      { key: 'image', label: 'Изображения (URL, по одному в строке)', type: 'lines' },
      { section: 'Место проведения', showIf: (v) => v.attendance !== 'OnlineEventAttendanceMode' },
      { key: 'placeName', label: 'Название места', type: 'text', required: true, showIf: (v) => v.attendance !== 'OnlineEventAttendanceMode' },
      ...address(true)
        .slice(1)
        .map((f) => ({ ...f, showIf: (v) => v.attendance !== 'OnlineEventAttendanceMode' })),
      { section: 'Онлайн-трансляция', showIf: (v) => v.attendance && v.attendance !== 'OfflineEventAttendanceMode' },
      { key: 'onlineUrl', label: 'Ссылка на трансляцию', type: 'url', required: true, showIf: (v) => v.attendance && v.attendance !== 'OfflineEventAttendanceMode' },
      { section: 'Организатор и участники' },
      { key: 'organizerName', label: 'Организатор', type: 'text' },
      { key: 'organizerUrl', label: 'Сайт организатора', type: 'url' },
      { key: 'performer', label: 'Исполнитель / спикер', type: 'text' },
      { section: 'Билеты' },
      { key: 'price', label: 'Цена', type: 'number', placeholder: '1500' },
      { key: 'priceCurrency', label: 'Валюта', type: 'select', options: CURRENCIES },
      { key: 'availability', label: 'Наличие билетов', type: 'select', options: AVAILABILITY.slice(0, 3).concat([['SoldOut', 'Распроданы']]) },
      { key: 'offerUrl', label: 'Ссылка на покупку', type: 'url' },
      { key: 'validFrom', label: 'Продажа с', type: 'date' },
    ],
    build: (v) => {
      const offline = v.attendance !== 'OnlineEventAttendanceMode';
      const online = v.attendance && v.attendance !== 'OfflineEventAttendanceMode';
      const place = offline ? { '@type': 'Place', name: v.placeName, address: buildAddress(v) } : undefined;
      const virtual = online ? { '@type': 'VirtualLocation', url: v.onlineUrl } : undefined;
      return {
        '@type': 'Event',
        name: v.name,
        startDate: withTz(v.startDate, v.timezone),
        endDate: withTz(v.endDate, v.timezone),
        eventStatus: v.eventStatus ? `https://schema.org/${v.eventStatus}` : undefined,
        eventAttendanceMode: v.attendance ? `https://schema.org/${v.attendance}` : undefined,
        description: v.description,
        image: oneOrMany(splitLines(v.image)),
        location: place && virtual ? [place, virtual] : place || virtual,
        organizer: { '@type': 'Organization', name: v.organizerName, url: v.organizerUrl },
        performer: v.performer ? { '@type': 'Person', name: v.performer } : undefined,
        offers: {
          '@type': 'Offer',
          price: v.price,
          priceCurrency: v.priceCurrency,
          availability: v.availability ? `https://schema.org/${v.availability}` : undefined,
          url: v.offerUrl,
          validFrom: v.validFrom,
        },
      };
    },
  },
];

/** Удаляет пустые значения; объект только с @type считается пустым. */
export function clean(value) {
  if (Array.isArray(value)) {
    const arr = value.map(clean).filter((x) => x !== undefined);
    return arr.length ? arr : undefined;
  }
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      const c = clean(v);
      if (c !== undefined) out[k] = c;
    }
    const keys = Object.keys(out).filter((k) => k !== '@type' && k !== 'position');
    return keys.length ? out : undefined;
  }
  if (typeof value === 'string') {
    const s = value.trim();
    return s ? s : undefined;
  }
  return value ?? undefined;
}
