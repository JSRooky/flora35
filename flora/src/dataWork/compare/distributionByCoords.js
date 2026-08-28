import { getFeatureLonLat } from "../buildSeasonalityStats";
import { normalizeLatinName } from "../normalizeLatinName";

export const DISTRIBUTION_BIN_COUNT = 40;

export const DISTRIBUTION_TAXON_MODES = {
  ALL: "all",
  SPECIES: "species",
  GENUS: "genus",
  FAMILY: "family"
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

function featureTaxonKey(feature, mode) {
  const properties = feature?.properties ?? {};
  if (mode === DISTRIBUTION_TAXON_MODES.FAMILY) {
    return normalizeLatinName(properties.family);
  }
  if (mode === DISTRIBUTION_TAXON_MODES.GENUS) {
    return extractGenusKey(properties.name_latin);
  }
  return normalizeLatinName(properties.name_latin);
}

function featureTaxonLabel(feature, mode) {
  const properties = feature?.properties ?? {};
  if (mode === DISTRIBUTION_TAXON_MODES.FAMILY) {
    return String(properties.family ?? "").trim() || "Без семейства";
  }
  if (mode === DISTRIBUTION_TAXON_MODES.GENUS) {
    const raw = String(properties.name_latin ?? "")
      .trim()
      .split(/\s+/)[0];
    if (!raw) {
      return "Без рода";
    }
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }
  return String(properties.name_latin ?? "").trim() || "Без названия";
}

function matchesTaxon(feature, mode, taxonKey) {
  if (!mode || mode === DISTRIBUTION_TAXON_MODES.ALL || !taxonKey) {
    return true;
  }
  return featureTaxonKey(feature, mode) === taxonKey;
}

function collectCoords(features, mode, taxonKey) {
  const points = [];
  (Array.isArray(features) ? features : []).forEach((feature) => {
    if (!matchesTaxon(feature, mode, taxonKey)) {
      return;
    }
    const coords = getFeatureLonLat(feature);
    if (coords) {
      points.push(coords);
    }
  });
  return points;
}

function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

function toDegrees(radians) {
  return (radians * 180) / Math.PI;
}

/**
 * Средняя широта (арифметика) и круговое среднее долготы.
 * @param {{ lat: number, lon: number }[]} points
 * @returns {{ meanLat: number|null, meanLon: number|null }}
 */
export function meanDirectionFromPoints(points) {
  const list = Array.isArray(points) ? points : [];
  if (list.length === 0) {
    return { meanLat: null, meanLon: null };
  }

  let latSum = 0;
  let sinLon = 0;
  let cosLon = 0;
  list.forEach((point) => {
    latSum += point.lat;
    const radians = toRadians(point.lon);
    sinLon += Math.sin(radians);
    cosLon += Math.cos(radians);
  });

  return {
    meanLat: latSum / list.length,
    meanLon: toDegrees(Math.atan2(sinLon, cosLon))
  };
}

function expandRange(min, max) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return { min: 0, max: 1 };
  }
  if (min === max) {
    const pad = Math.max(0.1, Math.abs(min) * 0.01);
    return { min: min - pad, max: max + pad };
  }
  return { min, max };
}

function histogram(values, min, max, binCount) {
  const counts = new Array(binCount).fill(0);
  const span = max - min || 1;
  values.forEach((value) => {
    let index = Math.floor(((value - min) / span) * binCount);
    if (index < 0) {
      index = 0;
    }
    if (index >= binCount) {
      index = binCount - 1;
    }
    counts[index] += 1;
  });
  const total = values.length;
  const shares = counts.map((count) => (total > 0 ? count / total : 0));
  const centers = counts.map((_, index) => min + ((index + 0.5) / binCount) * span);
  return { counts, shares, centers };
}

/**
 * Таксоны, встречающиеся в наборах, для выбранного ранга.
 * @param {{ features?: object[] }[]} layerInputs
 * @param {string} mode
 * @returns {{ key: string, label: string }[]}
 */
export function listDistributionTaxa(layerInputs, mode) {
  if (mode === DISTRIBUTION_TAXON_MODES.ALL) {
    return [];
  }
  const byKey = new Map();
  (Array.isArray(layerInputs) ? layerInputs : []).forEach((layer) => {
    (Array.isArray(layer?.features) ? layer.features : []).forEach((feature) => {
      const key = featureTaxonKey(feature, mode);
      if (!key || byKey.has(key)) {
        return;
      }
      byKey.set(key, { key, label: featureTaxonLabel(feature, mode) });
    });
  });
  return [...byKey.values()].sort((left, right) =>
    left.label.localeCompare(right.label, "en", { sensitivity: "base" })
  );
}

/**
 * Гистограммы доли точек по широте и долготе для каждого слоя.
 * @param {{ id: string, label?: string, features?: object[] }[]} layerInputs
 * @param {{ mode?: string, taxonKey?: string|null, binCount?: number }} [options]
 */
export function buildCoordinateDistributions(layerInputs, options = {}) {
  const mode = options.mode || DISTRIBUTION_TAXON_MODES.ALL;
  const taxonKey = options.taxonKey || null;
  const binCount = Math.max(4, options.binCount || DISTRIBUTION_BIN_COUNT);

  const layers = (Array.isArray(layerInputs) ? layerInputs : [])
    .filter((layer) => layer?.id != null && layer.id !== "")
    .map((layer) => ({
      id: String(layer.id),
      label: String(layer.label || layer.id),
      points: collectCoords(layer.features, mode, taxonKey)
    }));

  let latMin = Infinity;
  let latMax = -Infinity;
  let lonMin = Infinity;
  let lonMax = -Infinity;
  layers.forEach((layer) => {
    layer.points.forEach((point) => {
      latMin = Math.min(latMin, point.lat);
      latMax = Math.max(latMax, point.lat);
      lonMin = Math.min(lonMin, point.lon);
      lonMax = Math.max(lonMax, point.lon);
    });
  });

  const latRange = expandRange(latMin, latMax);
  const lonRange = expandRange(lonMin, lonMax);

  return {
    bounds: {
      latMin: latRange.min,
      latMax: latRange.max,
      lonMin: lonRange.min,
      lonMax: lonRange.max
    },
    layers: layers.map((layer) => {
      const mean = meanDirectionFromPoints(layer.points);
      return {
        id: layer.id,
        label: layer.label,
        pointCount: layer.points.length,
        meanLat: mean.meanLat,
        meanLon: mean.meanLon,
        lat: histogram(
          layer.points.map((point) => point.lat),
          latRange.min,
          latRange.max,
          binCount
        ),
        lon: histogram(
          layer.points.map((point) => point.lon),
          lonRange.min,
          lonRange.max,
          binCount
        )
      };
    })
  };
}
