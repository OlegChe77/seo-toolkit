// Конфигурация страниц сайта. Используется и при сборке (метатеги, меню,
// sitemap), и в браузере (поиск по инструментам на главной).
// Чтобы добавить инструмент: опишите его здесь и создайте pages/<id>.html.

export const categories = [
  { id: 'meta', name: 'Метатеги и сниппеты' },
  { id: 'content', name: 'Контент и тексты' },
  { id: 'tech', name: 'Техническое SEO' },
  { id: 'research', name: 'Семантика и аудит' },
];

export const tools = [
  {
    id: 'serp-preview',
    short: 'Пример сниппета для ПК и смартфона',
    name: 'SERP Preview',
    category: 'meta',
    icon: 'search-document',
    title: 'SERP Preview — предпросмотр сниппета онлайн | SEO Toolkit',
    description:
      'Бесплатный предпросмотр поискового сниппета: введите Title, Description и URL и посмотрите пример отображения на компьютере и смартфоне.',
    h1: 'SERP Preview — предпросмотр сниппета',
    summary: 'Пример сниппета для компьютера и смартфона, счётчики символов и предупреждения о длине метатегов.',
    keywords: 'сниппет выдача title description метатеги google яндекс превью serp',
  },
  {
    id: 'robots-builder',
    short: 'Генератор robots.txt с шаблонами',
    name: 'RobotsBuilder',
    category: 'tech',
    icon: 'internet-protected',
    title: 'RobotsBuilder — генератор robots.txt онлайн | SEO Toolkit',
    description:
      'Создайте robots.txt за минуту: группы User-agent, правила Allow и Disallow, Sitemap, готовые шаблоны, проверка ошибок и скачивание файла.',
    h1: 'RobotsBuilder — генератор robots.txt',
    summary: 'Группы правил, готовые шаблоны, проверка ошибок и скачивание файла robots.txt.',
    keywords: 'robots.txt роботс disallow allow user-agent sitemap индексация краулер',
  },
  {
    id: 'text-seo',
    short: 'Частотность и плотность ключей',
    name: 'TextSEO',
    category: 'content',
    icon: 'presentation',
    title: 'TextSEO — SEO-анализ текста и плотность ключей | SEO Toolkit',
    description:
      'Анализ SEO-текста онлайн: слова и символы, частота слов и фраз, плотность ключевых слов, повторы, стоп-слова и экспорт отчёта в CSV.',
    h1: 'TextSEO — анализ SEO-текста',
    summary: 'Статистика текста, частотность слов и фраз, плотность ключевых слов и поиск повторов.',
    keywords: 'текст плотность ключевые слова частотность символы слова тошнота стоп-слова',
  },
  {
    id: 'heading-map',
    short: 'Дерево заголовков H1–H6',
    name: 'HeadingMap',
    category: 'content',
    icon: 'networking',
    title: 'HeadingMap — анализ структуры заголовков H1–H6 | SEO Toolkit',
    description:
      'Вставьте HTML-код или текст и получите дерево заголовков H1–H6: пропущенные уровни, повторяющиеся H1, одинаковые заголовки, экспорт в TXT и CSV.',
    h1: 'HeadingMap — структура заголовков H1–H6',
    summary: 'Дерево заголовков, пропуски уровней, дубли H1 и одинаковые заголовки, экспорт структуры.',
    keywords: 'заголовки h1 h2 h3 h4 h5 h6 структура иерархия html',
  },
  {
    id: 'duplicate-text',
    short: 'Процент сходства двух текстов',
    name: 'DuplicateText',
    category: 'content',
    icon: 'website',
    title: 'DuplicateText — сравнение двух текстов онлайн | SEO Toolkit',
    description:
      'Сравните два текста по словам, фрагментам и предложениям: процент сходства, подсветка совпадений, учёт регистра, пробелов и знаков препинания.',
    h1: 'DuplicateText — сравнение двух текстов',
    summary: 'Процент текстового сходства, подсветка совпадающих слов, фрагментов и предложений.',
    keywords: 'сравнение текстов сходство совпадения дубли шинглы разница',
  },
  {
    id: 'schema-builder',
    short: 'Разметка JSON-LD, 8 типов',
    name: 'SchemaBuilder',
    category: 'tech',
    icon: 'programming',
    title: 'SchemaBuilder — генератор JSON-LD Schema.org | SEO Toolkit',
    description:
      'Генератор разметки Schema.org в JSON-LD: Article, Product, Organization, LocalBusiness, WebSite, BreadcrumbList, FAQPage и Event с проверкой JSON.',
    h1: 'SchemaBuilder — генератор разметки JSON-LD',
    summary: '8 типов Schema.org, динамическая форма, проверка JSON, копирование и скачивание файла.',
    keywords: 'schema.org json-ld микроразметка структурированные данные faq product article',
  },
  {
    id: 'url-builder',
    short: 'ЧПУ и транслитерация',
    name: 'URLBuilder',
    category: 'tech',
    icon: 'share-folder',
    title: 'URLBuilder — генератор ЧПУ и URL-slug | SEO Toolkit',
    description:
      'Преобразуйте заголовки в SEO-friendly URL: транслитерация кириллицы, выбор разделителя, нижний регистр, массовая обработка списка и экспорт в CSV.',
    h1: 'URLBuilder — генератор ЧПУ и URL-slug',
    summary: 'Транслитерация кириллицы, выбор разделителя и массовая генерация slug из списка.',
    keywords: 'чпу slug url транслитерация адрес ссылка латиница',
  },
  {
    id: 'meta-length',
    short: 'Длина в символах и пикселях',
    name: 'MetaLength',
    category: 'meta',
    icon: 'setting',
    title: 'MetaLength — длина Title и Description онлайн | SEO Toolkit',
    description:
      'Проверьте длину Title и Description в символах и примерную ширину в пикселях, настройте диапазоны и проверьте список метатегов из CSV.',
    h1: 'MetaLength — длина Title и Description',
    summary: 'Символы и примерная ширина в пикселях, шкала длины и массовая проверка из списка или CSV.',
    keywords: 'длина title description пиксели символы метатеги проверка csv',
  },
  {
    id: 'intent-finder',
    short: 'Интент ключевых запросов',
    name: 'IntentFinder',
    category: 'research',
    icon: 'target',
    title: 'IntentFinder — определение интента запросов | SEO Toolkit',
    description:
      'Разделите ключевые запросы на информационные, коммерческие, навигационные и транзакционные по редактируемому словарю. Фильтры и экспорт в CSV.',
    h1: 'IntentFinder — классификация запросов по интенту',
    summary: 'Группировка запросов по намерению пользователя, редактируемый словарь и ручная проверка.',
    keywords: 'интент запросы семантика ключевые слова кластеризация коммерческие информационные',
  },
  {
    id: 'content-fresh',
    short: 'Давность обновления страниц',
    name: 'ContentFresh',
    category: 'research',
    icon: 'search-time',
    title: 'ContentFresh — анализ актуальности контента | SEO Toolkit',
    description:
      'Загрузите CSV со страницами и датами обновления: сколько дней прошло, фильтры по периодам, собственные пороги и список страниц для обновления.',
    h1: 'ContentFresh — анализ актуальности контента',
    summary: 'Давность обновления страниц, фильтры по периодам и список страниц для обновления.',
    keywords: 'актуальность контента дата обновления аудит страниц csv lastmod',
  },
].map((tool) => ({ ...tool, path: `/${tool.id}` }));

export const home = {
  id: 'index',
  path: '/',
  title: 'SEO Toolkit — 10 бесплатных SEO-инструментов онлайн',
  description:
    'Набор бесплатных SEO-инструментов в браузере: предпросмотр сниппета, robots.txt, анализ текста и заголовков, JSON-LD, ЧПУ, интент запросов и другое.',
  h1: 'SEO Toolkit',
};

export const notFound = {
  id: '404',
  path: '/404',
  title: 'Страница не найдена — SEO Toolkit',
  description: 'Такой страницы нет. Перейдите на главную SEO Toolkit или выберите один из 10 SEO-инструментов.',
  h1: 'Страница не найдена',
  noindex: true,
};

export const privacy = {
  id: 'privacy',
  path: '/privacy',
  title: 'Конфиденциальность и cookie — SEO Toolkit',
  description: 'Какие данные обрабатывает SEO Toolkit: инструменты работают в браузере, статистика Яндекс Метрики собирается только с согласия.',
  h1: 'Конфиденциальность и cookie',
  noindex: true,
};

export const allPages = [home, ...tools, privacy, notFound];

export const getCategory = (id) => categories.find((c) => c.id === id);
