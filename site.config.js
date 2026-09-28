// Единственное место, где задаются домен и внешние SEO-настройки сайта.
// От url строятся canonical, Open Graph, sitemap.xml, robots.txt и llms.txt.
// Домен можно переопределить при сборке переменной окружения SITE_URL
// (например, в настройках Render: SITE_URL=https://seo.example.com).
export default {
  url: 'https://seotoolkitru.onrender.com',
  name: 'SEO Toolkit',
  lang: 'ru',
  locale: 'ru_RU',
  // Коды подтверждения прав: вставьте значения content из Google Search Console,
  // Яндекс Вебмастера и Bing Webmaster Tools — метатеги появятся на всех страницах.
  verification: {
    google: 'rxm1KmsK1Xx9RQs7D-i8IKrDVR_BwP26BMabnQyyerc',
    yandex: '6d9f1d6d4af59f2e',
    bing: '',
  },
  // Яндекс Метрика: номер счётчика. Код добавляется только в продакшн-сборку
  // и запускается после согласия посетителя на cookie.
  metrikaId: 113088591,
  // Ключ IndexNow (Яндекс, Bing и др.): файл /<ключ>.txt создаётся при сборке,
  // отправка адресов — npm run indexnow.
  indexNowKey: 'ece19a454b9d31171fcedb8bc67ec356',
  // Посредник подсказок Яндекса для Keyword Finder (папка server/, сервис seotoolkitru-api в render.yaml).
  // Можно переопределить при сборке переменной SUGGEST_API_URL; пустая строка — работать только с Google.
  suggestApi: 'https://seotoolkitru-api.onrender.com',
};
