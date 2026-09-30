// Отправляет адреса сайта в поисковые системы по протоколу IndexNow (Яндекс, Bing, Seznam и др.).
// Запускайте после публикации изменений: npm run indexnow
// Ключ задаётся в site.config.js (indexNowKey); файл /<ключ>.txt создаётся при сборке.
import siteConfig from '../site.config.js';
import { allPages } from '../src/config/pages.js';
import { loadGuides } from '../plugins/guides.js';

const site = (process.env.SITE_URL || siteConfig.url).replace(/\/+$/, '');
const key = siteConfig.indexNowKey;
if (!key) throw new Error('Не задан indexNowKey в site.config.js');

const urlList = [...allPages.filter((p) => !p.noindex), ...loadGuides('.')].map((p) => (p.path === '/' ? `${site}/` : `${site}${p.path}`));
const body = JSON.stringify({ host: new URL(site).host, key, keyLocation: `${site}/${key}.txt`, urlList });

const keyCheck = await fetch(`${site}/${key}.txt`);
if (!keyCheck.ok || (await keyCheck.text()).trim() !== key) throw new Error('Файл ключа не найден на сайте — сначала опубликуйте сборку');

for (const endpoint of ['https://api.indexnow.org/indexnow', 'https://yandex.com/indexnow']) {
  const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' }, body });
  console.log(`${endpoint}: ${res.status} ${res.statusText} — отправлено адресов: ${urlList.length}`);
}
