// Работа с текстом: разбиение на слова, нормализация, стоп-слова.

// Слово: буквы/цифры, допускаются внутренние дефисы и апострофы (из-за, don't).
export const WORD_RE = /[\p{L}\p{N}]+(?:[-'’][\p{L}\p{N}]+)*/gu;

export const normalizeWord = (w) => w.toLowerCase().replace(/ё/g, 'е').replace(/’/g, "'");

export function words(text) {
  return (String(text || '').match(WORD_RE) || []).map(normalizeWord);
}

const RU_STOP = `а без более бы был была были было быть в вам вас весь во вот все всего всех вы где да даже для до его ее ей ею если есть еще же за здесь и из или им их к как ко когда кто ли либо мне может мы на надо наш не него нее нет ни них но ну о об однако он она они оно от очень по под при с со так также такой там те тем то того тоже той только том ты у уже хотя чего чей чем что чтобы чье чья эта эти это я ведь вон вообще впрочем всегда всё еще ещё зачем иногда итак какая какой кем куда лишь между меня много можно моя мой нас нельзя никогда ничего нибудь нужно об один одна перед потом потому почти про раз разве сам свою себе себя сейчас сказал совсем теперь тогда тот тут уж хоть чуть этого этой этом этот эту`;

const EN_STOP = `a about above after again against all am an and any are as at be because been before being below between both but by can could did do does doing down during each few for from further had has have having he her here hers herself him himself his how i if in into is it its itself just me more most my myself no nor not now of off on once only or other our ours ourselves out over own same she should so some such than that the their theirs them themselves then there these they this those through to too under until up very was we were what when where which while who whom why will with would you your yours yourself yourselves`;

export const STOPWORDS = new Set([...RU_STOP.split(/\s+/), ...EN_STOP.split(/\s+/)].map(normalizeWord));

export const isStopword = (w) => STOPWORDS.has(w);

export function countSentences(text) {
  const parts = String(text || '')
    .split(/(?<=[.!?…])\s+|\n+/)
    .filter((s) => /[\p{L}\p{N}]/u.test(s));
  return parts.length;
}

export function splitSentences(text) {
  return String(text || '')
    .split(/(?<=[.!?…])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => /[\p{L}\p{N}]/u.test(s));
}

export function countParagraphs(text) {
  return String(text || '')
    .split(/\n+/)
    .filter((p) => /[\p{L}\p{N}]/u.test(p)).length;
}
