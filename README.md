# SEO Toolkit

10 бесплатных SEO-инструментов, которые работают прямо в браузере. Без регистрации, API-ключей, базы данных и серверной части — сайт собирается в статические файлы и размещается на Render Static Site.

**Сайт:** https://seo-toolkit-pzj9.onrender.com

**Стек:** Vite + Vanilla JavaScript, HTML, CSS. Без фреймворков и внешних запросов: все вычисления выполняются на стороне пользователя.

![Главная страница SEO Toolkit](docs/screenshots/home.png)

## Возможности

- 10 инструментов на отдельных страницах с понятными URL, общая навигация, хлебные крошки, страница 404.
- Светлая и тёмная тема, адаптивная вёрстка для компьютеров, планшетов и смартфонов.
- Копирование результатов в один клик, экспорт в CSV (UTF-8 для Excel), TXT, JSON и robots.txt.
- Загрузка CSV в UTF-8 и Windows-1251, обработка больших списков (50 000 запросов — меньше секунды).
- SEO самого сайта: уникальные Title и Description, один H1, canonical, Open Graph, JSON-LD, sitemap.xml, robots.txt.

## Скриншоты

| SERP Preview | TextSEO |
| --- | --- |
| ![SERP Preview — пример сниппета](docs/screenshots/serp-preview.png) | ![TextSEO — статистика и частотность](docs/screenshots/text-seo.png) |
| **SchemaBuilder (тёмная тема)** | **HeadingMap (тёмная тема)** |
| ![SchemaBuilder — генератор JSON-LD](docs/screenshots/schema-builder-dark.png) | ![HeadingMap — дерево заголовков](docs/screenshots/heading-map-dark.png) |
| **IntentFinder** | **ContentFresh** |
| ![IntentFinder — интент запросов](docs/screenshots/intent-finder.png) | ![ContentFresh — актуальность контента](docs/screenshots/content-fresh.png) |

<p>
  <img src="docs/screenshots/mobile-home.png" alt="Главная на смартфоне" width="260">
  &nbsp;
  <img src="docs/screenshots/mobile-menu.png" alt="Меню инструментов на смартфоне, тёмная тема" width="260">
</p>

## Инструменты

| URL | Инструмент | Что делает |
| --- | --- | --- |
| `/serp-preview` | SERP Preview | Пример сниппета для ПК и смартфона, счётчики, предупреждения о длине |
| `/robots-builder` | RobotsBuilder | Генератор robots.txt: группы, Allow/Disallow, Sitemap, шаблоны, проверка, скачивание |
| `/text-seo` | TextSEO | Статистика текста, частота слов и фраз (1–4 слова), плотность ключей, повторы, CSV |
| `/heading-map` | HeadingMap | Дерево H1–H6 из HTML или текста, пропуски уровней, дубли, экспорт TXT/CSV |
| `/duplicate-text` | DuplicateText | Текстовое сходство двух текстов по словам, фрагментам и предложениям, подсветка |
| `/schema-builder` | SchemaBuilder | JSON-LD для 8 типов Schema.org, проверка, копирование, скачивание `.json` |
| `/url-builder` | URLBuilder | ЧПУ/slug с транслитерацией, массовая обработка, CSV |
| `/meta-length` | MetaLength | Длина Title/Description в символах и ≈пикселях, свои диапазоны, проверка списка/CSV |
| `/intent-finder` | IntentFinder | Классификация запросов по интенту по редактируемому словарю, фильтры, ручная правка |
| `/content-fresh` | ContentFresh | Давность обновления страниц из CSV, периоды, свои пороги, список на обновление |

## Запуск

Нужен Node.js 20.19+ (или 22.12+).

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # сборка в dist/
npm run preview    # проверка сборки: http://localhost:4173
```

## Домен сайта

Домен задаётся в одном месте — `site.config.js` (`url`). От него строятся canonical, Open Graph, `sitemap.xml` и `robots.txt`.
Его можно переопределить без правки кода переменной окружения при сборке: `SITE_URL=https://seo.example.com`.

## Публикация на Render

**Вариант 1 — Blueprint.** В Render: New → Blueprint → выберите репозиторий. Файл `render.yaml` создаст Static Site
с нужной командой сборки, папкой публикации, переменной `SITE_URL`, заголовками кеширования и правилами маршрутов.
Укажите в `SITE_URL` (в `render.yaml` или в настройках сервиса) фактический адрес сайта — Render может добавить к имени
суффикс, например `seo-toolkit-pzj9.onrender.com`.

**Вариант 2 — вручную.** New → Static Site:

- Build Command: `npm ci && npm run build`
- Publish Directory: `dist`
- Environment: `SITE_URL=https://ваш-домен` (без слэша в конце)
- Redirects/Rewrites: по правилу Rewrite на каждую страницу — `/serp-preview` → `/serp-preview.html`
  и так же для остальных 9 адресов из таблицы выше.

Render применяет правила, только если по пути нет файла, поэтому ассеты, `robots.txt` и `sitemap.xml` отдаются напрямую.
Не добавляйте редиректы вида `/serp-preview/` → `/serp-preview`: Render сопоставляет пути без учёта завершающего слэша,
и такое правило зацикливает страницу. Для несуществующих адресов Render сам отдаёт `404.html` с кодом 404.

## Структура

```
pages/                 HTML-страницы (контент инструментов); шапка, метатеги и подвал вставляются при сборке
plugins/site-plugin.js Vite-плагин: метатеги, меню, хлебные крошки, sitemap.xml, robots.txt, «чистые» URL в dev/preview
site.config.js         домен и название сайта
render.yaml            настройки Render Static Site
src/config/pages.js    конфигурация страниц: title, description, H1, категории
src/layout/            шаблоны шапки/подвала и SVG-иконки
src/core/              общие модули: DOM, тема, уведомления, буфер обмена, CSV, текст, даты, транслитерация
src/components/        переиспользуемые элементы: сниппет, переключатели, загрузка файлов, сортировка
src/tools/             логика каждого инструмента (+ schema/types.js, intent/dictionary.js)
src/styles/            токены и темы, раскладка, компоненты, стили инструментов
public/                favicon, apple-touch-icon, og-image
docs/screenshots/      скриншоты для README
scripts/og-image.svg   исходник изображения для соцсетей
```

Новый инструмент: добавьте запись в `src/config/pages.js`, файл `pages/<id>.html` и модуль `src/tools/<id>.js`,
затем правила маршрута в `render.yaml`. Меню, подвал, sitemap и перелинковка обновятся автоматически.

## Данные и приватность

Все вычисления выполняются в браузере. Тексты, списки и файлы не отправляются на сервер. В `localStorage` сохраняются только
настройки (тема, режимы, диапазоны, пороги, словарь интентов) и черновики RobotsBuilder, SchemaBuilder и SERP Preview.
CSV экспортируется в UTF-8 с BOM и разделителем `;` (корректно открывается в Excel с русской локалью); при загрузке
поддерживаются UTF-8 и Windows-1251.

## Ограничения

- Ширина в пикселях — оценка по шрифту Arial; реальное отображение зависит от поисковой системы и устройства.
- IntentFinder работает по словарю и простым правилам и не всегда точен; спорные запросы помечаются для ручной проверки.
- DuplicateText показывает вычисляемое сходство двух текстов, а не проверку на плагиат.
- Режим «словоформ» в TextSEO использует упрощённое выделение основы и может ошибаться.
- Сайты по URL не загружаются: HTML и таблицы пользователь вставляет сам.
