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
    google: '',
    yandex: '',
    bing: '',
  },
  // Ключ IndexNow (Яндекс, Bing и др.): файл /<ключ>.txt создаётся при сборке,
  // отправка адресов — npm run indexnow.
  indexNowKey: 'ece19a454b9d31171fcedb8bc67ec356',
};
