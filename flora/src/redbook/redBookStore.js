import seedList from "./redBookList.json";
import seedMatches from "./redBookMatches.json";
import { RED_BOOK_LIST_TYPE, RED_BOOK_STORAGE_KEYS } from "./constants";
import { buildRedBookSpeciesEntry, toRedBookListDocument } from "./parseRedBookList";

const EMPTY_MATCHES = {
  type: "FeatureCollection",
  features: []
};

/** @type {{ type: string, updatedAt: string|null, species: object[] }} */
let redBookList = normalizeList(seedList);

/** @type {GeoJSON.FeatureCollection} */
let redBookMatches = normalizeMatches(seedMatches);

/** @type {object|null} */
let lastMatchStats = null;

/** @type {GeoJSON.FeatureCollection|null} последний полный результат поиска (не обязательно весь на слое) */
let lastSearchCollection = null;

function normalizeList(raw) {
  const species = Array.isArray(raw?.species)
    ? raw.species
        .map((item) => buildRedBookSpeciesEntry(item.name_latin, item.status))
        .filter(Boolean)
    : [];

  return {
    type: RED_BOOK_LIST_TYPE,
    updatedAt: raw?.updatedAt ?? null,
    species
  };
}

function normalizeMatches(raw) {
  if (raw?.type === "FeatureCollection" && Array.isArray(raw.features)) {
    return {
      type: "FeatureCollection",
      features: raw.features
    };
  }
  return { ...EMPTY_MATCHES, features: [] };
}

function readStorage(key) {
  try {
    const raw = window.localStorage?.getItem(key);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeStorage(key, value) {
  try {
    window.localStorage?.setItem(key, JSON.stringify(value));
  } catch {
    // localStorage может быть недоступен — работаем только в памяти.
  }
}

/** Подтягивает список и совпадения из localStorage (поверх seed JSON). */
export function hydrateRedBookStoreFromPersistence() {
  const storedList = readStorage(RED_BOOK_STORAGE_KEYS.LIST);
  if (storedList) {
    redBookList = normalizeList(storedList);
  }

  const storedMatches = readStorage(RED_BOOK_STORAGE_KEYS.MATCHES);
  if (storedMatches) {
    redBookMatches = normalizeMatches(storedMatches);
  }

  return {
    list: redBookList,
    matches: redBookMatches
  };
}

export function getRedBookList() {
  return redBookList;
}

export function getRedBookMatches() {
  return redBookMatches;
}

export function getRedBookMatchStats() {
  return lastMatchStats;
}

export function getRedBookLastSearchCollection() {
  return lastSearchCollection;
}

/**
 * Запоминает полный результат поиска (для построчного «Добавить в слой»).
 * @param {GeoJSON.FeatureCollection|null|undefined} collection
 * @param {object|null|undefined} stats
 */
export function setRedBookLastSearchResult(collection, stats) {
  lastSearchCollection =
    collection?.type === "FeatureCollection"
      ? collection
      : null;
  if (stats !== undefined) {
    lastMatchStats = stats ?? null;
  }
  return lastSearchCollection;
}

/**
 * @param {{ type?: string, updatedAt?: string|null, species?: object[] }} list
 * @param {{ persist?: boolean }} [options]
 */
export function setRedBookList(list, options = {}) {
  redBookList = normalizeList({
    ...list,
    updatedAt: list?.updatedAt ?? new Date().toISOString()
  });

  if (options.persist !== false) {
    writeStorage(RED_BOOK_STORAGE_KEYS.LIST, toRedBookListDocument(redBookList));
  }

  return redBookList;
}

/**
 * @param {GeoJSON.FeatureCollection|object[]|null|undefined} collectionOrFeatures
 * @param {{ persist?: boolean, stats?: object|null }} [options]
 */
export function setRedBookMatches(collectionOrFeatures, options = {}) {
  const collection = Array.isArray(collectionOrFeatures)
    ? { type: "FeatureCollection", features: collectionOrFeatures }
    : normalizeMatches(collectionOrFeatures);

  redBookMatches = collection;
  if (options.stats !== undefined) {
    lastMatchStats = options.stats;
  }

  if (options.persist !== false) {
    writeStorage(RED_BOOK_STORAGE_KEYS.MATCHES, redBookMatches);
  }

  return redBookMatches;
}

export function setRedBookMatchStatsOnly(stats) {
  lastMatchStats = stats ?? null;
  return lastMatchStats;
}

export function clearRedBookMatches(options = {}) {
  lastMatchStats = null;
  lastSearchCollection = null;
  return setRedBookMatches(EMPTY_MATCHES, options);
}

export function getRedBookListDocument() {
  return toRedBookListDocument(redBookList);
}

export function downloadJsonFile(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json;charset=utf-8"
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
