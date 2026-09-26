// Главная: поиск по инструментам и фильтр по категориям.
import '../core/app.js';
import { $, $$ } from '../core/dom.js';

const search = $('#tool-search');
const cards = $$('[data-tools-grid] .tool-card');
const chips = $$('[data-chips] .chip');
const empty = $('[data-empty]');
let category = 'all';

function apply() {
  const terms = search.value.toLowerCase().trim().split(/\s+/).filter(Boolean);
  let visible = 0;
  for (const card of cards) {
    const inCategory = category === 'all' || card.dataset.category === category;
    const matches = terms.every((t) => card.dataset.search.includes(t));
    card.hidden = !(inCategory && matches);
    if (!card.hidden) visible++;
  }
  empty.hidden = visible > 0;
}

function setCategory(id, updateHash = true) {
  category = chips.some((c) => c.dataset.category === id) ? id : 'all';
  for (const chip of chips) {
    const active = chip.dataset.category === category;
    chip.classList.toggle('is-active', active);
    chip.setAttribute('aria-pressed', String(active));
  }
  if (updateHash) {
    const hash = category === 'all' ? '' : `#${category}`;
    history.replaceState(null, '', `${location.pathname}${location.search}${hash}`);
  }
  apply();
}

for (const chip of chips) chip.addEventListener('click', () => setCategory(chip.dataset.category));
search.addEventListener('input', apply);

// Хлебные крошки ведут на /#<категория> — открываем нужный фильтр.
function fromHash() {
  const id = location.hash.slice(1);
  if (chips.some((c) => c.dataset.category === id && id !== 'all')) {
    setCategory(id, false);
    $('#tools').scrollIntoView();
  }
}
window.addEventListener('hashchange', fromHash);
fromHash();
