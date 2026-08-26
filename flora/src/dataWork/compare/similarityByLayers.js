import { normalizeLatinName } from "../normalizeLatinName";
import { DIVERSITY_GROUP_MODES, countSpeciesByLayers } from "./countSpeciesByLayers";

export const SIMILARITY_LEVELS = {
  SPECIES: "species",
  GENUS: "genus",
  FAMILY: "family",
  OVERALL: "overall"
};

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

/**
 * Pearson r. null только если меньше двух наблюдений.
 * При нулевой дисперсии: 1, если ряды совпадают, иначе 0.
 * @param {number[]} xs
 * @param {number[]} ys
 * @returns {number|null}
 */
export function pearsonR(xs, ys) {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) {
    return null;
  }
  let sumX = 0;
  let sumY = 0;
  let sumXX = 0;
  let sumYY = 0;
  let sumXY = 0;
  let equal = true;
  for (let i = 0; i < n; i += 1) {
    const x = Number(xs[i]) || 0;
    const y = Number(ys[i]) || 0;
    if (x !== y) {
      equal = false;
    }
    sumX += x;
    sumY += y;
    sumXX += x * x;
    sumYY += y * y;
    sumXY += x * y;
  }
  const cov = n * sumXY - sumX * sumY;
  const varX = n * sumXX - sumX * sumX;
  const varY = n * sumYY - sumY * sumY;
  if (varX <= 0 || varY <= 0) {
    return equal ? 1 : 0;
  }
  const r = cov / Math.sqrt(varX * varY);
  if (!Number.isFinite(r)) {
    return equal ? 1 : 0;
  }
  return Math.max(-1, Math.min(1, r));
}

export function formatSimilarityCoef(value) {
  if (value == null || !Number.isFinite(value)) {
    return "—";
  }
  if (value === 0) {
    return "0";
  }
  return String(Number(value.toFixed(6)));
}

export function determinationR2(r) {
  if (r == null || !Number.isFinite(r)) {
    return null;
  }
  return r * r;
}

function pairFromCountRows(rows, leftId, rightId) {
  const xs = [];
  const ys = [];
  (rows ?? []).forEach((row) => {
    if (row.unnamed) {
      return;
    }
    xs.push(row.counts?.[leftId] || 0);
    ys.push(row.counts?.[rightId] || 0);
  });
  const r = pearsonR(xs, ys);
  return { n: xs.length, r, r2: determinationR2(r) };
}

function indexLayerTaxa(features) {
  const pointsBySpecies = new Map();
  const speciesByGenus = new Map();
  const generaByFamily = new Map();
  const speciesByFamily = new Map();

  (Array.isArray(features) ? features : []).forEach((feature) => {
    const properties = feature?.properties ?? {};
    const species = normalizeLatinName(properties.name_latin);
    const genus = extractGenusKey(properties.name_latin);
    const family = normalizeLatinName(properties.family);

    if (species) {
      pointsBySpecies.set(species, (pointsBySpecies.get(species) || 0) + 1);
      if (genus) {
        if (!speciesByGenus.has(genus)) {
          speciesByGenus.set(genus, new Set());
        }
        speciesByGenus.get(genus).add(species);
      }
      if (family) {
        if (!speciesByFamily.has(family)) {
          speciesByFamily.set(family, new Set());
        }
        speciesByFamily.get(family).add(species);
      }
    }
    if (family && genus) {
      if (!generaByFamily.has(family)) {
        generaByFamily.set(family, new Set());
      }
      generaByFamily.get(family).add(genus);
    }
  });

  return { pointsBySpecies, speciesByGenus, generaByFamily, speciesByFamily };
}

function pushUnionCounts(xs, ys, leftMap, rightMap, sizeOf) {
  const keys = new Set([...leftMap.keys(), ...rightMap.keys()]);
  keys.forEach((key) => {
    xs.push(sizeOf(leftMap.get(key)));
    ys.push(sizeOf(rightMap.get(key)));
  });
}

function sizeOrCount(value) {
  if (!value) {
    return 0;
  }
  if (typeof value === "number") {
    return value;
  }
  return value.size || 0;
}

/**
 * Общее сходство: один вектор из трёх блоков —
 * роды в каждом семействе, виды в каждом роде, точки каждого вида.
 */
export function overallSimilarityVectors(leftFeatures, rightFeatures) {
  const left = indexLayerTaxa(leftFeatures);
  const right = indexLayerTaxa(rightFeatures);
  const xs = [];
  const ys = [];
  pushUnionCounts(xs, ys, left.generaByFamily, right.generaByFamily, sizeOrCount);
  pushUnionCounts(xs, ys, left.speciesByGenus, right.speciesByGenus, sizeOrCount);
  pushUnionCounts(xs, ys, left.pointsBySpecies, right.pointsBySpecies, sizeOrCount);
  return { xs, ys };
}

function pairOverall(leftFeatures, rightFeatures) {
  const { xs, ys } = overallSimilarityVectors(leftFeatures, rightFeatures);
  const r = pearsonR(xs, ys);
  return { n: xs.length, r, r2: determinationR2(r) };
}

/**
 * Попарное сходство слоёв на четырёх уровнях.
 * @param {{ id: string, label?: string, features?: object[] }[]} layerInputs
 */
export function computeLayerSimilarity(layerInputs) {
  const layers = (Array.isArray(layerInputs) ? layerInputs : [])
    .filter((layer) => layer?.id != null && layer.id !== "")
    .map((layer) => ({
      id: String(layer.id),
      label: String(layer.label || layer.id),
      features: Array.isArray(layer.features) ? layer.features : []
    }));

  const species = countSpeciesByLayers(layers, DIVERSITY_GROUP_MODES.SPECIES);
  const genera = countSpeciesByLayers(layers, DIVERSITY_GROUP_MODES.GENUS);
  const families = countSpeciesByLayers(layers, DIVERSITY_GROUP_MODES.FAMILY);

  const pairs = [];
  for (let i = 0; i < layers.length; i += 1) {
    for (let j = i + 1; j < layers.length; j += 1) {
      const left = layers[i];
      const right = layers[j];
      pairs.push({
        leftId: left.id,
        rightId: right.id,
        leftLabel: left.label,
        rightLabel: right.label,
        species: pairFromCountRows(species.rows, left.id, right.id),
        genus: pairFromCountRows(genera.rows, left.id, right.id),
        family: pairFromCountRows(families.rows, left.id, right.id),
        overall: pairOverall(left.features, right.features)
      });
    }
  }

  return {
    layers: layers.map(({ id, label }) => ({ id, label })),
    pairs
  };
}

export const SIMILARITY_TABLE_LEVELS = [
  { key: "species", label: "Виды" },
  { key: "genus", label: "Роды" },
  { key: "family", label: "Семейства" },
  { key: "overall", label: "Общее" }
];

export const SIMILARITY_TABLE_METRICS = [
  { key: "n", label: "n" },
  { key: "r", label: "R" },
  { key: "r2", label: "R²" }
];

function pairMetricValue(pair, levelKey, metricKey) {
  const cell = pair?.[levelKey];
  if (!cell) {
    return metricKey === "n" ? 0 : null;
  }
  if (metricKey === "n") {
    return cell.n;
  }
  return metricKey === "r" ? cell.r : cell.r2;
}

function csvCell(value) {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function formatSimilarityCsv(result) {
  const pairs = result?.pairs ?? [];
  const header = ["Уровень", "Показатель", ...pairs.map((pair) => `${pair.leftLabel} · ${pair.rightLabel}`)];
  const lines = [header.map(csvCell).join(",")];
  SIMILARITY_TABLE_LEVELS.forEach((level) => {
    SIMILARITY_TABLE_METRICS.forEach((metric) => {
      lines.push(
        [
          level.label,
          metric.label,
          ...pairs.map((pair) => {
            const value = pairMetricValue(pair, level.key, metric.key);
            return metric.key === "n" ? value : formatSimilarityCoef(value);
          })
        ]
          .map(csvCell)
          .join(",")
      );
    });
  });
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

export function downloadSimilarityCsv(result) {
  const blob = new Blob([formatSimilarityCsv(result)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const datePart = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `flora35-similarity-${datePart}.csv`;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
