/** Есть ли кириллица в строке. */
export function containsCyrillic(text) {
  return /[а-яё]/i.test(String(text ?? ""));
}

/** Буквы, характерные для украинского/белорусского, но не для русского. */
const NON_RUSSIAN_CYRILLIC_CHARS = /[іїєґў]/i;

const RUSSIAN_LANGUAGE_CODES = new Set(["ru", "rus", "russian"]);
const NON_RUSSIAN_LANGUAGE_CODES = new Set([
  "uk",
  "ukr",
  "ukrainian",
  "be",
  "bel",
  "belarusian",
  "by"
]);

function normalizeLanguageCode(language) {
  return String(language ?? "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-")
    .split("-")[0];
}

/** Похоже ли имя на украинское/белорусское по орфографии. */
export function looksNonRussianCyrillic(name) {
  return NON_RUSSIAN_CYRILLIC_CHARS.test(String(name ?? ""));
}

/**
 * Русское ли обиходное имя.
 * Явно отсекает украинский/белорусский по коду языка и по буквам і/ї/є/ґ/ў.
 */
export function isRussianVernacular(name, language = null) {
  if (!name) {
    return false;
  }

  const lang = normalizeLanguageCode(language);

  if (lang && NON_RUSSIAN_LANGUAGE_CODES.has(lang)) {
    return false;
  }

  if (looksNonRussianCyrillic(name)) {
    return false;
  }

  if (lang && RUSSIAN_LANGUAGE_CODES.has(lang)) {
    return true;
  }

  // Без языка принимаем только «обычную» кириллицу без uk/be-маркеров.
  if (!lang) {
    return containsCyrillic(name);
  }

  // Другой явный язык (en, de, …) — не считаем русским даже при кириллице.
  return false;
}

/** Выбирает русское имя из массива vernacularNames GBIF. */
export function pickRussianVernacular(vernacularNames) {
  const all = collectRussianVernaculars(vernacularNames);
  return all[0] ?? null;
}

/** Все уникальные русские имена из массива vernacularNames GBIF. */
export function collectRussianVernaculars(vernacularNames) {
  if (!Array.isArray(vernacularNames)) {
    return [];
  }

  const seen = new Set();
  const names = [];

  vernacularNames.forEach((item) => {
    const name = String(item?.vernacularName ?? "").trim();
    if (!name || !isRussianVernacular(name, item.language)) {
      return;
    }

    const key = name.toLowerCase();
    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    names.push(name);
  });

  return names;
}

/** Нормализует латинское имя до binomial (Genus species) без авторства. */
export function normalizeLatinName(nameLatin) {
  const trimmed = String(nameLatin ?? "").trim();
  if (!trimmed) {
    return "";
  }

  const withoutAuth = trimmed.replace(/\s*\([^)]*\)\s*$/, "").trim();
  const parts = withoutAuth.split(/\s+/).filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0]} ${parts[1]}`;
  }

  return withoutAuth;
}

/** Ключ кэша по латинскому названию. */
export function nameLatinCacheKey(nameLatin) {
  return normalizeLatinName(nameLatin).toLowerCase();
}
