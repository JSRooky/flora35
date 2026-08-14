import { normalizeLatinName } from "../dataWork/normalizeLatinName";
import {
  RED_BOOK_LIST_TYPE,
  RED_BOOK_STATUS_CODES,
  RED_BOOK_STATUS_NONE
} from "./constants";

const LINE_DELIMITERS = /[;|:/#~\t]+/;

/**
 * Нормализует код статуса из списка.
 * Пустое значение → "None". Известные коды МСОП — в верхнем регистре.
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeRedBookStatus(value) {
  if (value == null) {
    return RED_BOOK_STATUS_NONE;
  }

  const raw = String(value).trim();
  if (!raw) {
    return RED_BOOK_STATUS_NONE;
  }

  const upper = raw.toUpperCase();
  if (upper === "NONE") {
    return RED_BOOK_STATUS_NONE;
  }

  if (RED_BOOK_STATUS_CODES.has(upper)) {
    return upper;
  }

  return raw;
}

/**
 * @param {string} nameLatin
 * @param {unknown} status
 * @returns {{ name_latin: string, status: string, name_latin_norm: string }|null}
 */
export function buildRedBookSpeciesEntry(nameLatin, status) {
  const latin = typeof nameLatin === "string" ? nameLatin.trim().replace(/\s+/g, " ") : "";
  const nameLatinNorm = normalizeLatinName(latin);
  if (!nameLatinNorm) {
    return null;
  }

  return {
    name_latin: latin,
    name_latin_norm: nameLatinNorm,
    status: normalizeRedBookStatus(status)
  };
}

/**
 * Разбирает одну текстовую строку: «Латынь» или «Латынь; EN» / «Латынь EN».
 * @param {string} line
 * @returns {{ name_latin: string, status: string, name_latin_norm: string }|null}
 */
export function parseRedBookListLine(line) {
  if (typeof line !== "string") {
    return null;
  }

  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) {
    return null;
  }

  const delimited = trimmed.split(LINE_DELIMITERS).map((part) => part.trim()).filter(Boolean);
  if (delimited.length >= 2) {
    return buildRedBookSpeciesEntry(delimited[0], delimited[1]);
  }

  const spaceParts = trimmed.split(/\s+/);
  if (spaceParts.length >= 3) {
    const maybeStatus = spaceParts[spaceParts.length - 1];
    const statusUpper = maybeStatus.toUpperCase();
    if (RED_BOOK_STATUS_CODES.has(statusUpper) || statusUpper === "NONE") {
      const latin = spaceParts.slice(0, -1).join(" ");
      return buildRedBookSpeciesEntry(latin, maybeStatus);
    }
  }

  return buildRedBookSpeciesEntry(trimmed, RED_BOOK_STATUS_NONE);
}

/**
 * @param {unknown} item
 * @returns {{ name_latin: string, status: string, name_latin_norm: string }|null}
 */
function parseRedBookListItem(item) {
  if (typeof item === "string") {
    return parseRedBookListLine(item);
  }

  if (!item || typeof item !== "object") {
    return null;
  }

  const latin =
    item.name_latin ?? item.nameLatin ?? item.latin ?? item.species ?? item.name ?? "";
  const status = item.status ?? item.iucn ?? item.category;
  return buildRedBookSpeciesEntry(latin, status);
}

/**
 * Собирает список видов, убирая дубликаты по нормализованной латыни
 * (первый встреченный статус сохраняется).
 * @param {Array<{ name_latin: string, status: string, name_latin_norm: string }>} entries
 */
function dedupeSpecies(entries) {
  const byNorm = new Map();
  const skipped = [];

  for (const entry of entries) {
    if (!entry) {
      skipped.push({ reason: "empty" });
      continue;
    }

    if (byNorm.has(entry.name_latin_norm)) {
      skipped.push({
        reason: "duplicate",
        name_latin: entry.name_latin
      });
      continue;
    }

    byNorm.set(entry.name_latin_norm, entry);
  }

  return {
    species: Array.from(byNorm.values()),
    skipped
  };
}

/**
 * Парсит текстовый список (построчно).
 * @param {string} text
 */
export function parseRedBookListText(text) {
  const lines = String(text ?? "").split(/\r?\n/);
  const parsed = lines.map(parseRedBookListLine).filter(Boolean);
  const { species, skipped } = dedupeSpecies(parsed);

  return {
    type: RED_BOOK_LIST_TYPE,
    updatedAt: new Date().toISOString(),
    species,
    skipped,
    errors: []
  };
}

/**
 * Парсит JSON-строку или уже разобранный объект/массив.
 * @param {string|object|unknown[]} input
 */
export function parseRedBookListJson(input) {
  let data = input;
  const errors = [];

  if (typeof input === "string") {
    try {
      data = JSON.parse(input);
    } catch (error) {
      return {
        type: RED_BOOK_LIST_TYPE,
        updatedAt: new Date().toISOString(),
        species: [],
        skipped: [],
        errors: [`Некорректный JSON: ${error?.message || "parse error"}`]
      };
    }
  }

  let items = [];
  if (Array.isArray(data)) {
    items = data;
  } else if (data && typeof data === "object" && Array.isArray(data.species)) {
    items = data.species;
  } else {
    errors.push("Ожидался массив видов или объект { species: [...] }");
  }

  const parsed = items.map(parseRedBookListItem).filter(Boolean);
  const { species, skipped } = dedupeSpecies(parsed);

  return {
    type: RED_BOOK_LIST_TYPE,
    updatedAt:
      data && typeof data === "object" && typeof data.updatedAt === "string"
        ? data.updatedAt
        : new Date().toISOString(),
    species,
    skipped,
    errors
  };
}

/**
 * Автоопределение формата: JSON, если начинается с { или [, иначе текст.
 * @param {string} raw
 */
export function parseRedBookListAuto(raw) {
  const text = String(raw ?? "").trim();
  if (!text) {
    return {
      type: RED_BOOK_LIST_TYPE,
      updatedAt: new Date().toISOString(),
      species: [],
      skipped: [],
      errors: ["Пустой список"]
    };
  }

  if (text.startsWith("{") || text.startsWith("[")) {
    return parseRedBookListJson(text);
  }

  return parseRedBookListText(text);
}

/**
 * @param {{ type?: string, updatedAt?: string|null, species?: object[] }|null|undefined} list
 */
export function toRedBookListDocument(list) {
  return {
    type: RED_BOOK_LIST_TYPE,
    updatedAt: list?.updatedAt ?? new Date().toISOString(),
    species: Array.isArray(list?.species)
      ? list.species.map((item) => ({
          name_latin: item.name_latin,
          status: normalizeRedBookStatus(item.status)
        }))
      : []
  };
}
