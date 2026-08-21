import { PROPERTY_LABELS } from "../../components/featurePropertyLabels";
import { normalizeLatinName } from "../normalizeLatinName";
import {
  formatTempSourceLabel,
  getTempLayers,
  isRegionTempLayer
} from "../../tempLayers/tempLayerStore";

export const UNNAMED_SPECIES_KEY = "__unnamed__";
export const COMPARE_SET_MIN = 2;
export const COMPARE_SET_MAX = 8;

/** Поля точек, которые можно включить в сравнение (галочки в строке слоя). */
export const COMPARE_DATA_FIELDS = [
  "name_latin",
  "name_ru",
  "regnum",
  "family",
  "found_year",
  "found_month",
  "status",
  "found_by",
  "identified_by",
  "source",
  "region_id",
  "basisOfRecord"
];

export const COMPARE_SPECIES_FIELD = "name_latin";

function hasFieldValue(value) {
  if (value == null) {
    return false;
  }
  if (typeof value === "boolean") {
    return true;
  }
  return String(value).trim() !== "";
}

export function getCompareFieldLabel(fieldId) {
  return PROPERTY_LABELS[fieldId] || fieldId;
}

/**
 * Какие сравниваемые поля реально заполнены хотя бы у одной точки слоя.
 * @param {object[]|undefined} features
 * @returns {string[]}
 */
export function listPresentCompareFields(features) {
  const present = new Set();
  (Array.isArray(features) ? features : []).forEach((feature) => {
    const properties = feature?.properties ?? {};
    COMPARE_DATA_FIELDS.forEach((fieldId) => {
      if (hasFieldValue(properties[fieldId])) {
        present.add(fieldId);
      }
    });
  });
  return COMPARE_DATA_FIELDS.filter((fieldId) => present.has(fieldId));
}

/**
 * Стартовые галочки: латынь включена, если она есть — по ней уже считается таблица видов.
 * @param {string[]} presentFields
 * @returns {Record<string, boolean>}
 */
export function createDefaultFieldChecks(presentFields) {
  return Object.fromEntries(
    (presentFields ?? []).map((fieldId) => [fieldId, fieldId === COMPARE_SPECIES_FIELD])
  );
}

function emptyCounts(layerIds) {
  return Object.fromEntries(layerIds.map((id) => [id, 0]));
}

function displayLatin(rawLatin, key) {
  if (key === UNNAMED_SPECIES_KEY) {
    return "Без названия";
  }
  const trimmed = String(rawLatin ?? "").trim();
  return trimmed || key;
}

/**
 * Список временных слоёв с точками — кандидаты для сравнения.
 * @param {object[]|undefined} layers
 * @returns {{ id: string, label: string, source: string, pointCount: number, features: object[] }[]}
 */
export function listCompareTempLayerOptions(layers = getTempLayers()) {
  return (layers ?? [])
    .filter((layer) => layer && !isRegionTempLayer(layer))
    .map((layer) => {
      const features = Array.isArray(layer.features) ? layer.features : [];
      const name = String(layer.label || layer.taxonName || "").trim() || "Слой";
      const sourceLabel = formatTempSourceLabel(layer.source);
      return {
        id: String(layer.id),
        label: `${name} · ${sourceLabel}`,
        source: layer.source,
        pointCount: features.length,
        features
      };
    });
}

/**
 * Считает точки каждого вида в каждом наборе.
 * Число колонок не ограничено двумя — подходит для 3–8 слоёв.
 *
 * @param {{ id: string, label?: string, features?: object[] }[]} layerInputs
 * @returns {{
 *   layers: { id: string, label: string }[],
 *   rows: {
 *     key: string,
 *     nameLatin: string,
 *     nameRu: string,
 *     unnamed: boolean,
 *     counts: Record<string, number>,
 *     total: number
 *   }[]
 * }}
 */
export function countSpeciesByLayers(layerInputs) {
  const layers = (Array.isArray(layerInputs) ? layerInputs : [])
    .filter((layer) => layer?.id != null && layer.id !== "")
    .map((layer) => ({
      id: String(layer.id),
      label: String(layer.label || layer.id),
      features: Array.isArray(layer.features) ? layer.features : []
    }));

  const layerIds = layers.map((layer) => layer.id);
  const byKey = new Map();

  layers.forEach((layer) => {
    layer.features.forEach((feature) => {
      const properties = feature?.properties ?? {};
      const rawLatin = properties.name_latin;
      const key = normalizeLatinName(rawLatin) || UNNAMED_SPECIES_KEY;
      let row = byKey.get(key);
      if (!row) {
        row = {
          key,
          nameLatin: displayLatin(rawLatin, key),
          nameRu: String(properties.name_ru ?? "").trim(),
          unnamed: key === UNNAMED_SPECIES_KEY,
          counts: emptyCounts(layerIds)
        };
        byKey.set(key, row);
      } else {
        if (!row.nameRu && properties.name_ru) {
          row.nameRu = String(properties.name_ru).trim();
        }
        if (
          !row.unnamed &&
          row.nameLatin === key &&
          typeof rawLatin === "string" &&
          rawLatin.trim()
        ) {
          row.nameLatin = rawLatin.trim();
        }
      }
      row.counts[layer.id] += 1;
    });
  });

  const rows = [...byKey.values()]
    .map((row) => ({
      ...row,
      total: layerIds.reduce((sum, id) => sum + (row.counts[id] || 0), 0)
    }))
    .sort((left, right) => {
      if (left.unnamed !== right.unnamed) {
        return left.unnamed ? 1 : -1;
      }
      if (right.total !== left.total) {
        return right.total - left.total;
      }
      return left.nameLatin.localeCompare(right.nameLatin, "en", { sensitivity: "base" });
    });

  return {
    layers: layers.map(({ id, label }) => ({ id, label })),
    rows
  };
}
