/**
 * Парсер списков видов Красной книги России из Википедии (ru.wikipedia.org).
 *
 * Принимает сырой вики-текст страницы-списка (например, из API:
 *   action=query&pageids=...&prop=revisions&rvprop=content)
 * и возвращает структурированный массив видов, совместимый с
 * существующим форматом RedBookSpeciesList.
 *
 * !!! ЭКСПЕРИМЕНТАЛЬНЫЙ МОДУЛЬ !!!
 * Не подключён к UI. Предназначен для исследования структуры данных
 * Красных книг в Википедии. Для активации нужно:
 *   1. Добавить API-маршрут прокси для ru.wikipedia.org (CORS)
 *   2. Подключить parseWikipediaRedBookList к RedBookSearchPanel
 *   3. Добавить UI-элемент «Загрузить из Википедии»
 *
 * Источники данных (ru.wikipedia.org):
 *   - Красная книга России (общая): https://ru.wikipedia.org/wiki/Красная_книга_России
 *   - Покрытосеменные: pageid=94228 (478 видов, 78 семейств)
 *   - Насекомые: ~3200 видов
 *   - Региональные (Москва, СПб, Волгоград, Челябинск, Омск, и др.)
 */

// ---------------------------------------------------------------------------
// Константы
// ---------------------------------------------------------------------------

/**
 * Числовые статусы из таблицы Википедии → текстовые.
 * 0 — не оценивался / не был в предыдущем издании
 * 1 — Критически малочисленный или редкий
 * 2 — Редкий
 * 3 — Малочисленный и редкий
 */
const WIKI_STATUS_MAP = {
  "0": "Не оценивался",
  "1": "Критически малочисленный",
  "2": "Редкий",
  "3": "Малочисленный и редкий"
};

/** Коды МСОП, встречающиеся в столбце «Статус угрозы» */
const IUCN_CODES = new Set([
  "EX", "EW", "CR-iucn", "CR", "EN", "E", "VU", "V",
  "NT", "NT-near", "LC", "DD", "NE", "NOT", "?"
]);

// ---------------------------------------------------------------------------
// Regex-паттерны для вики-разметки
// ---------------------------------------------------------------------------

/** Разделитель семейств: | colspan="7" ... | Семейство {{Bt-latrus|...|...}} */
const FAMILY_ROW_RE = /^\|\s*colspan\s*=\s*["']?\d+["']?\s*.*?\|\s*Семество?\s*(.+)$/i;

/** Строка вида: | N || [[Русское название]] [Синоним] || {{Bt-latrus|Latin|opt}} [syn] || status || status2008 || iucn || priority || */
const SPECIES_ROW_RE = /^\|\s*(\d+)\s*\|\|\s*(.+?)\s*\|\|\s*(.+?)\s*\|\|\s*(\d+)\s*\|\|\s*(.+?)\s*\|\|\s*(.+?)\s*\|\|\s*([IV]+)\s*\|\|?\s*$/;

/** Шаблон {{Bt-latrus|Genus species|opt}} или {{Bt-latrus|Genus species|subsp=sub}} */
const BT_LATRUS_RE = /\{\{Bt-latrus\|([^}|]+)(?:\|[^}]*)?\}\}/;

/** Шаблон {{Bt|Genus species|subsp=sub}} (без -latrus) */
const BT_RE = /\{\{Bt\|([^}|]+)(?:\|[^}]*)?\}\}/;

/** Шаблон синонима: [{{Bt-latrus|...}}] или [Русское название] */
const SYN_RE = /\[\{\{Bt(?:-latrus)?\|([^}|]+)\}\}\]/;

/** Ссылка [[Название]] — извлекает текст внутри */
const WIKI_LINK_RE = /\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/;

/** МСОП-код: У {{VU}} D2 или И {{EN}} B2ab(iii) */
const IUCN_STATUS_RE = /([КИБУ]+)\s+\{\{([A-Z0-9-]+)\}\}\s*(.*)/;

// ---------------------------------------------------------------------------
// Хелперы для разбора отдельных полей
// ---------------------------------------------------------------------------

/**
 * Извлекает латинское название из вики-шаблона.
 * @param {string} raw
 * @returns {string}
 */
function extractLatinName(raw) {
  let match = raw.match(BT_LATRUS_RE);
  if (match) return match[1].trim();
  match = raw.match(BT_RE);
  if (match) return match[1].trim();
  // Fallback: убираем шаблоны и ссылки
  return raw.replace(/\{\{[^}]*\}\}/g, "").replace(/\[\[[^\]]*\]\]/g, "").trim();
}

/**
 * Извлекает русское название из вики-ссылки.
 * @param {string} raw
 * @returns {string}
 */
function extractRussianName(raw) {
  const match = raw.match(WIKI_LINK_RE);
  return match ? match[1].trim() : raw.replace(/\[\[[^\]]*\]\]/g, "").trim();
}

/**
 * Извлекает синоним (лат.) из шаблона в скобках.
 * @param {string} raw
 * @returns {string|null}
 */
function extractSynonym(raw) {
  const match = raw.match(SYN_RE);
  return match ? match[1].trim() : null;
}

/**
 * Извлекает русское название синонима из скобок.
 * @param {string} raw
 * @returns {string|null}
 */
function extractRussianSynonym(raw) {
  // [Стеллеропсис кавказский] — текст в скобках без шаблонов
  const bracketMatch = raw.match(/\[\[([^\]]+)\]\]/);
  if (bracketMatch) {
    return bracketMatch[1].trim();
  }
  // Если нет [[...]], но есть текст в скобках без шаблонов
  const textBracket = raw.match(/\[(.+?)\]/);
  if (textBracket && !textBracket[1].includes("{{")) {
    return textBracket[1].trim();
  }
  return null;
}

/**
 * Парсит статус МСОП.
 * @param {string} raw — например "У {{VU}} D2"
 * @returns {{ code: string, level: string, criteria: string }}
 */
function parseIucnStatus(raw) {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === "—") {
    return { code: "", level: "", criteria: "" };
  }

  const match = trimmed.match(IUCN_STATUS_RE);
  if (match) {
    return {
      code: match[2], // VU, EN, CR-iucn, etc.
      level: match[1], // У, И, КР, БУ
      criteria: match[3].trim()
    };
  }

  // Fallback: просто код
  return { code: trimmed, level: "", criteria: "" };
}

/**
 * Нормализует латинское название (как в normalizeLatinName, но inline).
 * @param {string} name
 * @returns {string}
 */
function normalizeLatinName(name) {
  return name
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/[^a-zа-яё0-9\s]/gi, "");
}

// ---------------------------------------------------------------------------
// Основной парсер
// ---------------------------------------------------------------------------

/**
 * Парсит вики-текст страницы-списка Красной книги.
 *
 * @param {string} wikitext — полный вики-текст страницы (из API)
 * @returns {{
 *   title: string,
 *   species: Array<{
 *     num: number,
 *     name_rus: string,
 *     name_latin: string,
 *     name_latin_norm: string,
 *     synonym_latin?: string,
 *     synonym_rus?: string,
 *     status: string,
 *     status2008?: string,
 *     iucn: { code: string, level: string, criteria: string },
 *     priority: string,
 *     family?: string
 *   }>,
 *   families: string[],
 *   totalRows: number,
 *   parsedRows: number,
 *   errors: string[]
 * }}
 */
export function parseWikipediaRedBookList(wikitext) {
  const errors = [];
  const species = [];
  const families = new Set();
  let currentFamily = null;
  let totalRows = 0;
  let parsedRows = 0;

  const lines = wikitext.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Пропускаем пустые строки и строки без ||
    if (!line.includes("||")) continue;

    // Проверяем, является ли строка разделителем семейств
    const familyMatch = line.match(FAMILY_ROW_RE);
    if (familyMatch) {
      const raw = familyMatch[1];
      const latin = extractLatinName(raw);
      const russian = extractRussianName(raw);
      currentFamily = russian || latin;
      if (currentFamily) {
        families.add(currentFamily);
      }
      continue;
    }

    // Проверяем, является ли строка строкой вида
    const speciesMatch = line.match(SPECIES_ROW_RE);
    if (!speciesMatch) continue;

    totalRows++;

    const [, numStr, rawRus, rawLatin, statusStr, status2008Raw, iucnRaw, priorityRaw] = speciesMatch;
    const num = parseInt(numStr, 10);

    const nameRus = extractRussianName(rawRus);
    const nameLatin = extractLatinName(rawLatin);
    const nameLatinNorm = normalizeLatinName(nameLatin);
    const synonymLatin = extractSynonym(rawLatin);
    const synonymRus = extractRussianSynonym(rawRus);
    const status = WIKI_STATUS_MAP[statusStr?.trim()] || statusStr?.trim() || "None";
    const status2008 = status2008Raw?.trim() === "—" ? null : WIKI_STATUS_MAP[status2008Raw?.trim()] || status2008Raw?.trim();
    const iucn = parseIucnStatus(iucnRaw);
    const priority = priorityRaw?.trim();

    // Пропускаем пустые названия
    if (!nameLatin && !nameRus) {
      errors.push(`Строка ${i + 1}: не удалось извлечь название`);
      continue;
    }

    parsedRows++;

    species.push({
      num,
      name_rus: nameRus,
      name_latin: nameLatin,
      name_latin_norm: nameLatinNorm,
      ...(synonymLatin ? { synonym_latin: synonymLatin } : {}),
      ...(synonymRus ? { synonym_rus: synonymRus } : {}),
      status,
      ...(status2008 ? { status_2008: status2008 } : {}),
      iucn,
      priority,
      family: currentFamily
    });
  }

  return {
    title: "Красная книга (Википедия)",
    species,
    families: Array.from(families),
    totalRows,
    parsedRows,
    errors
  };
}

// ---------------------------------------------------------------------------
// Утилита: извлечение заголовка страницы из вики-текста
// ---------------------------------------------------------------------------

/**
 * Извлекает заголовок страницы из вики-текста.
 * @param {string} wikitext
 * @returns {string}
 */
export function extractPageTitle(wikitext) {
  // Вики-текст может содержать "== Название ==" в начале
  const titleMatch = wikitext.match(/^={1,2}\s*(.+?)\s*={1,2}/m);
  if (titleMatch) return titleMatch[1].trim();

  // Или из первого заголовка таблицы
  const h2Match = wikitext.match(/==\s*(.+?)\s*==/);
  if (h2Match) return h2Match[1].trim();

  return "Неизвестно";
}

// ---------------------------------------------------------------------------
// Тестовый пример (запустить через Node.js)
// ---------------------------------------------------------------------------

/**
 * Пример использования:
 *
 *   const fs = require('fs');
 *   const wikitext = fs.readFileSync('redbook_wikitext.txt', 'utf-8');
 *   const result = parseWikipediaRedBookList(wikitext);
 *   console.log(`Видов: ${result.parsedRows}, Семейств: ${result.families.length}`);
 *   console.log(result.species.slice(0, 5));
 *
 * Для получения wikitext через curl:
 *   curl "https://ru.wikipedia.org/w/api.php?action=query&pageids=94228&prop=revisions&rvprop=content&rvslots=main&format=json"
 */
if (typeof process !== "undefined" && process.argv) {
  // Если запущен как standalone скрипт
  const runTest = async () => {
    const fs = require("fs");
    const path = require("path");

    // Проверяем, есть ли файл с вики-текстом рядом
    const testFile = path.join(__dirname, "wikipedia_redbook_test.txt");
    if (fs.existsSync(testFile)) {
      const wikitext = fs.readFileSync(testFile, "utf-8");
      const result = parseWikipediaRedBookList(wikitext);
      console.log(`=== Парсер Википедии (тест) ===`);
      console.log(`Заголовок: ${extractPageTitle(wikitext)}`);
      console.log(`Всего строк таблицы: ${result.totalRows}`);
      console.log(`Распознано видов: ${result.parsedRows}`);
      console.log(`Семейств: ${result.families.length}`);
      if (result.errors.length) {
        console.log(`Ошибок: ${result.errors.length}`);
        result.errors.slice(0, 5).forEach(e => console.log(`  - ${e}`));
      }
      console.log(`\nПервые 3 вида:`);
      result.species.slice(0, 3).forEach(s => {
        console.log(`  ${s.num}. ${s.name_rus} (${s.name_latin}) — ${s.status}, сем. ${s.family}`);
      });
      console.log(`\nПервые 5 семейств:`);
      result.families.slice(0, 5).forEach(f => console.log(`  - ${f}`));
    } else {
      console.log(`Тестовый файл не найден: ${testFile}`);
      console.log(`Для запуска теста сохраните вики-текст в wikipedia_redbook_test.txt`);
    }
  };

  // Раскомментируйте для запуска теста:
  // runTest().catch(console.error);
}

export default parseWikipediaRedBookList;
