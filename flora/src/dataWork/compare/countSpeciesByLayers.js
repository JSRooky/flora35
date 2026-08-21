import { PROPERTY_LABELS, REGNUM_ORDER } from "../../components/featurePropertyLabels";
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

export const DIVERSITY_GROUP_MODES = {
  SPECIES: "species",
  GENUS: "genus",
  FAMILY: "family"
};

export const DIVERSITY_REGNUM_NONE = "__none__";

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

export function normalizeCompareRegnum(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  return raw || DIVERSITY_REGNUM_NONE;
}

/**
 * Царства, встречающиеся на плашках, в порядке REGNUM_ORDER.
 * @param {object[]} plaques
 * @returns {string[]}
 */
export function listDiversityRegnumKeys(plaques) {
  const present = new Set();
  (Array.isArray(plaques) ? plaques : []).forEach((plaque) => {
    (Array.isArray(plaque?.layers) ? plaque.layers : []).forEach((layer) => {
      (Array.isArray(layer?.features) ? layer.features : []).forEach((feature) => {
        present.add(normalizeCompareRegnum(feature?.properties?.regnum));
      });
    });
  });
  const ordered = [];
  REGNUM_ORDER.forEach((code) => {
    if (present.has(code)) {
      ordered.push(code);
    }
  });
  if (present.has(DIVERSITY_REGNUM_NONE)) {
    ordered.push(DIVERSITY_REGNUM_NONE);
  }
  [...present]
    .sort((left, right) => left.localeCompare(right, "en"))
    .forEach((key) => {
      if (!ordered.includes(key)) {
        ordered.push(key);
      }
    });
  return ordered;
}

function displayLatin(rawLatin, key) {
  if (key === UNNAMED_SPECIES_KEY) {
    return "Без названия";
  }
  const trimmed = String(rawLatin ?? "").trim();
  return trimmed || key;
}

function extractGenusKey(nameLatin) {
  const normalized = normalizeLatinName(nameLatin);
  if (!normalized) {
    return null;
  }
  const first = normalized.split(" ")[0];
  if (!first || first === "x" || first === "×") {
    return null;
  }
  return first;
}

function resolveFeatureGroup(properties, mode) {
  if (mode === DIVERSITY_GROUP_MODES.FAMILY) {
    const raw = String(properties.family ?? "").trim();
    const key = normalizeLatinName(raw) || UNNAMED_SPECIES_KEY;
    return {
      key,
      nameLatin: raw || "Без семейства",
      nameRu: "",
      unnamed: key === UNNAMED_SPECIES_KEY
    };
  }
  if (mode === DIVERSITY_GROUP_MODES.GENUS) {
    const key = extractGenusKey(properties.name_latin);
    if (!key) {
      return {
        key: UNNAMED_SPECIES_KEY,
        nameLatin: "Без рода",
        nameRu: "",
        unnamed: true
      };
    }
    const rawFirst = String(properties.name_latin ?? "")
      .trim()
      .split(/\s+/)[0];
    const display = rawFirst
      ? rawFirst.charAt(0).toUpperCase() + rawFirst.slice(1)
      : key.charAt(0).toUpperCase() + key.slice(1);
    return { key, nameLatin: display, nameRu: "", unnamed: false };
  }

  const rawLatin = properties.name_latin;
  const key = normalizeLatinName(rawLatin) || UNNAMED_SPECIES_KEY;
  return {
    key,
    nameLatin: displayLatin(rawLatin, key),
    nameRu: String(properties.name_ru ?? "").trim(),
    unnamed: key === UNNAMED_SPECIES_KEY
  };
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
 * @param {{ includeGbif?: boolean, includeInat?: boolean, allowedRegnums?: Set<string>|null }} [options]
 * @returns {{ id: string, label: string, features: object[] }[]}
 */
export function plaquesToCompareLayerInputs(plaques, options = {}) {
  const includeGbif = options.includeGbif !== false;
  const includeInat = options.includeInat !== false;
  const allowedRegnums = options.allowedRegnums ?? null;
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
        const layerFeatures = Array.isArray(layer?.features) ? layer.features : [];
        if (!allowedRegnums) {
          return layerFeatures;
        }
        return layerFeatures.filter((feature) =>
          allowedRegnums.has(normalizeCompareRegnum(feature?.properties?.regnum))
        );
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
 * Считает точки каждой группы (вид / род / семейство) в каждом наборе.
 *
 * @param {{ id: string, label?: string, features?: object[] }[]} layerInputs
 * @param {string} [groupMode]
 */
export function countSpeciesByLayers(layerInputs, groupMode = DIVERSITY_GROUP_MODES.SPECIES) {
  const mode = Object.values(DIVERSITY_GROUP_MODES).includes(groupMode)
    ? groupMode
    : DIVERSITY_GROUP_MODES.SPECIES;
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
      const group = resolveFeatureGroup(properties, mode);
      let row = byKey.get(group.key);
      if (!row) {
        row = {
          key: group.key,
          nameLatin: group.nameLatin,
          nameRu: group.nameRu,
          unnamed: group.unnamed,
          counts: emptyCounts(layerIds)
        };
        byKey.set(group.key, row);
      } else {
        if (!row.nameRu && group.nameRu) {
          row.nameRu = group.nameRu;
        }
        if (
          !row.unnamed &&
          row.nameLatin === row.key &&
          group.nameLatin &&
          group.nameLatin !== row.key
        ) {
          row.nameLatin = group.nameLatin;
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
export function formatDiversityCsv(comparison, summary = null, groupMode = DIVERSITY_GROUP_MODES.SPECIES) {
  const layers = Array.isArray(comparison?.layers) ? comparison.layers : [];
  const rows = Array.isArray(comparison?.rows) ? comparison.rows : [];
  const lines = [];
  const nameHeader =
    groupMode === DIVERSITY_GROUP_MODES.GENUS
      ? "Род"
      : groupMode === DIVERSITY_GROUP_MODES.FAMILY
        ? "Семейство"
        : "Латинское название";
  const showRu = groupMode === DIVERSITY_GROUP_MODES.SPECIES;
  const groupNoun =
    groupMode === DIVERSITY_GROUP_MODES.GENUS
      ? "Родов"
      : groupMode === DIVERSITY_GROUP_MODES.FAMILY
        ? "Семейств"
        : "Именованных видов";

  if (summary) {
    lines.push([groupNoun, summary.namedSpeciesTotal ?? 0].map(csvCell).join(","));
    lines.push(["Общих для всех слоёв", summary.sharedNamedSpecies ?? 0].map(csvCell).join(","));
    lines.push("");
    lines.push(["Слой", groupNoun, "Точек"].map(csvCell).join(","));
    (summary.layers ?? []).forEach((layer) => {
      lines.push([layer.label, layer.uniqueSpecies, layer.pointCount].map(csvCell).join(","));
    });
    lines.push("");
  }

  const headers = showRu
    ? [nameHeader, "Русское название", ...layers.map((layer) => layer.label), "Всего"]
    : [nameHeader, ...layers.map((layer) => layer.label), "Всего"];
  lines.push(headers.map(csvCell).join(","));
  rows.forEach((row) => {
    const cells = showRu
      ? [
          row.nameLatin,
          row.nameRu || "",
          ...layers.map((layer) => row.counts?.[layer.id] || 0),
          row.total
        ]
      : [row.nameLatin, ...layers.map((layer) => row.counts?.[layer.id] || 0), row.total];
    lines.push(cells.map(csvCell).join(","));
  });

  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

/** Скачивает CSV разнообразия. */
export function downloadDiversityCsv(comparison, summary, groupMode) {
  const blob = new Blob([formatDiversityCsv(comparison, summary, groupMode)], {
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
