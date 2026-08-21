import { PROPERTY_LABELS } from "../../components/featurePropertyLabels";
import { normalizeLatinName } from "../normalizeLatinName";
import {
  formatTempSourceLabel,
  getTempLayers,
  isRegionTempLayer,
  normalizeTempSource,
  TEMP_SOURCE_IDS
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
 * Плашка сравнения → вход countSpeciesByLayers: все точки слоёв плашки склеены.
 * GBIF и iNat можно отключить; прочие источники (карта, регионы) всегда входят.
 * @param {object[]} plaques
 * @param {{ includeGbif?: boolean, includeInat?: boolean }} [options]
 * @returns {{ id: string, label: string, features: object[] }[]}
 */
export function plaquesToCompareLayerInputs(plaques, options = {}) {
  const includeGbif = options.includeGbif !== false;
  const includeInat = options.includeInat !== false;
  return (Array.isArray(plaques) ? plaques : [])
    .filter((plaque) => plaque?.key)
    .map((plaque) => {
      const features = (Array.isArray(plaque.layers) ? plaque.layers : []).flatMap((layer) => {
        const source = normalizeTempSource(layer?.source);
        if (source === TEMP_SOURCE_IDS.GBIF && !includeGbif) {
          return [];
        }
        if (source === TEMP_SOURCE_IDS.INAT && !includeInat) {
          return [];
        }
        return Array.isArray(layer?.features) ? layer.features : [];
      });
      const label = String(plaque.taxonName || plaque.label || plaque.key).trim() || "Слой";
      return { id: String(plaque.key), label, features };
    });
}

/**
 * Сводка по результату countSpeciesByLayers: уникальные именованные виды и пересечение всех слоёв.
 * @param {{ layers?: { id: string, label: string }[], rows?: object[] }|null|undefined} result
 * @returns {{
 *   layers: { id: string, label: string, uniqueSpecies: number, pointCount: number }[],
 *   sharedNamedSpecies: number,
 *   namedSpeciesTotal: number
 * }}
 */
export function summarizeDiversity(result) {
  const layers = Array.isArray(result?.layers) ? result.layers : [];
  const rows = Array.isArray(result?.rows) ? result.rows : [];
  const layerIds = layers.map((layer) => layer.id);
  const namedRows = rows.filter((row) => !row.unnamed);

  const layerStats = layers.map((layer) => ({
    id: layer.id,
    label: layer.label,
    uniqueSpecies: namedRows.filter((row) => (row.counts?.[layer.id] || 0) > 0).length,
    pointCount: rows.reduce((sum, row) => sum + (row.counts?.[layer.id] || 0), 0)
  }));

  const sharedNamedSpecies =
    layerIds.length === 0
      ? 0
      : namedRows.filter((row) => layerIds.every((id) => (row.counts?.[id] || 0) > 0)).length;

  return {
    layers: layerStats,
    sharedNamedSpecies,
    namedSpeciesTotal: namedRows.length
  };
}

/**
 * Строки видов, которые встречаются во всех слоях сравнения.
 * @param {{ layers?: { id: string }[], rows?: object[] }} comparison
 * @returns {object[]}
 */
export function listSharedSpeciesRows(comparison) {
  const layerIds = (comparison?.layers ?? []).map((layer) => layer.id);
  if (layerIds.length === 0) {
    return [];
  }
  return (comparison?.rows ?? []).filter(
    (row) => !row.unnamed && layerIds.every((id) => (row.counts?.[id] || 0) > 0)
  );
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

function csvCell(value) {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/**
 * CSV сравнения разнообразия: сводка слоёв, пустая строка, таблица видов.
 * @param {{ layers?: { id: string, label: string }[], rows?: object[] }} comparison
 * @param {{ layers?: { label: string, uniqueSpecies: number, pointCount: number }[], namedSpeciesTotal?: number, sharedNamedSpecies?: number }|null} [summary]
 * @returns {string}
 */
export function formatDiversityCsv(comparison, summary = null) {
  const layers = Array.isArray(comparison?.layers) ? comparison.layers : [];
  const rows = Array.isArray(comparison?.rows) ? comparison.rows : [];
  const lines = [];

  if (summary) {
    lines.push(["Именованных видов", summary.namedSpeciesTotal ?? 0].map(csvCell).join(","));
    lines.push(["Общих для всех слоёв", summary.sharedNamedSpecies ?? 0].map(csvCell).join(","));
    lines.push("");
    lines.push(["Слой", "Видов", "Точек"].map(csvCell).join(","));
    (summary.layers ?? []).forEach((layer) => {
      lines.push([layer.label, layer.uniqueSpecies, layer.pointCount].map(csvCell).join(","));
    });
    lines.push("");
  }

  lines.push(
    ["Латинское название", "Русское название", ...layers.map((layer) => layer.label), "Всего"]
      .map(csvCell)
      .join(",")
  );
  rows.forEach((row) => {
    lines.push(
      [
        row.nameLatin,
        row.nameRu || "",
        ...layers.map((layer) => row.counts?.[layer.id] || 0),
        row.total
      ]
        .map(csvCell)
        .join(",")
    );
  });

  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

/** Скачивает CSV разнообразия. */
export function downloadDiversityCsv(comparison, summary) {
  const blob = new Blob([formatDiversityCsv(comparison, summary)], {
    type: "text/csv;charset=utf-8"
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const datePart = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `flora35-diversity-${datePart}.csv`;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
