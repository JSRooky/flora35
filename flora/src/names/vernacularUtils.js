/** Есть ли кириллица в строке. */
export function containsCyrillic(text) {
  return /[а-яё]/i.test(String(text ?? ""));
}

/** Русское ли обиходное имя (по языку или кириллице). */
export function isRussianVernacular(name, language = null) {
  if (!name) {
    return false;
  }

  const lang = String(language ?? "").toLowerCase();
  if (lang === "rus" || lang === "ru") {
    return true;
  }

  return containsCyrillic(name);
}

/** Выбирает русское имя из массива vernacularNames GBIF. */
export function pickRussianVernacular(vernacularNames) {
  if (!Array.isArray(vernacularNames)) {
    return null;
  }

  const russian = vernacularNames.find(
    (item) =>
      item?.vernacularName &&
      isRussianVernacular(item.vernacularName, item.language)
  );

  return russian?.vernacularName ?? null;
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
