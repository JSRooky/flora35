import { collectOccurrenceCoords } from "./eooAoo";

export const KDE_GRID_SIZE = 96;
export const KDE_BANDWIDTH_SCALES = [0.5, 1, 2];

const KM_PER_DEG_LAT = 110.574;
const KM_PER_DEG_LON_EQUATOR = 111.32;
const KERNEL_CUTOFF_SIGMAS = 3.5;
const PAD_SIGMAS = 3;
const MIN_BANDWIDTH_KM = 0.25;
const MAX_KERNEL_POINTS = 2500;
const BIN_KM = 2;
const TWO_PI = Math.PI * 2;

function mean(values) {
  if (!values.length) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sampleStdDev(values) {
  if (values.length < 2) {
    return 0;
  }
  const avg = mean(values);
  let sumSq = 0;
  values.forEach((value) => {
    const delta = value - avg;
    sumSq += delta * delta;
  });
  return Math.sqrt(sumSq / (values.length - 1));
}

function makeProjector(coords) {
  const originLon = mean(coords.map((pair) => pair[0]));
  const originLat = mean(coords.map((pair) => pair[1]));
  const kmLon = Math.max(
    KM_PER_DEG_LON_EQUATOR * Math.cos((originLat * Math.PI) / 180),
    1e-6
  );
  return {
    toKm(lon, lat) {
      return [(lon - originLon) * kmLon, (lat - originLat) * KM_PER_DEG_LAT];
    },
    toLonLat(x, y) {
      return [originLon + x / kmLon, originLat + y / KM_PER_DEG_LAT];
    }
  };
}

/** Изотропный Scott / Silverman для d = 2: h = n^(−1/6) · σ. */
export function scottBandwidthKm(xy) {
  if (!xy || xy.length < 2) {
    return null;
  }
  const xs = xy.map((pair) => pair[0]);
  const ys = xy.map((pair) => pair[1]);
  const sigma = Math.sqrt(
    (sampleStdDev(xs) ** 2 + sampleStdDev(ys) ** 2) / 2
  );
  if (!Number.isFinite(sigma) || sigma <= 0) {
    return MIN_BANDWIDTH_KM;
  }
  return Math.max(MIN_BANDWIDTH_KM, sigma * xy.length ** (-1 / 6));
}

function binPoints(xy, weights) {
  if (xy.length <= MAX_KERNEL_POINTS) {
    return { xy, weights, binned: false };
  }

  const bins = new Map();
  xy.forEach((pair, index) => {
    const key = `${Math.round(pair[0] / BIN_KM)}:${Math.round(pair[1] / BIN_KM)}`;
    const weight = weights[index];
    const prev = bins.get(key);
    if (!prev) {
      bins.set(key, { x: pair[0] * weight, y: pair[1] * weight, w: weight });
      return;
    }
    prev.x += pair[0] * weight;
    prev.y += pair[1] * weight;
    prev.w += weight;
  });

  const outXy = [];
  const outWeights = [];
  bins.forEach((bin) => {
    outXy.push([bin.x / bin.w, bin.y / bin.w]);
    outWeights.push(bin.w);
  });
  return { xy: outXy, weights: outWeights, binned: true };
}

function gaussianKernel(dx, dy, bandwidthKm) {
  const h2 = bandwidthKm * bandwidthKm;
  const q = (dx * dx + dy * dy) / h2;
  if (q > KERNEL_CUTOFF_SIGMAS * KERNEL_CUTOFF_SIGMAS) {
    return 0;
  }
  return Math.exp(-0.5 * q) / (TWO_PI * h2);
}

function isoplethFeature(mask, cols, rows, xmin, ymin, dx, dy, toLonLat, properties) {
  const parts = [];
  for (let row = 0; row < rows; row += 1) {
    let col = 0;
    while (col < cols) {
      if (!mask[row * cols + col]) {
        col += 1;
        continue;
      }
      let end = col + 1;
      while (end < cols && mask[row * cols + end]) {
        end += 1;
      }
      const x0 = xmin + col * dx;
      const y0 = ymin + row * dy;
      const x1 = xmin + end * dx;
      const y1 = ymin + (row + 1) * dy;
      const ring = [
        toLonLat(x0, y0),
        toLonLat(x1, y0),
        toLonLat(x1, y1),
        toLonLat(x0, y1),
        toLonLat(x0, y0)
      ];
      parts.push([ring]);
      col = end;
    }
  }

  if (!parts.length) {
    return null;
  }

  return {
    type: "Feature",
    properties,
    geometry: {
      type: "MultiPolygon",
      coordinates: parts
    }
  };
}

/**
 * Гауссово KDE уникальных локалитетов в локальной километровой проекции.
 * Изоплеты — объёмные (Worton): наименьшая площадь, содержащая 50% и 95% массы.
 */
export function computeKde(features, { bandwidthScale = 1, gridSize = KDE_GRID_SIZE } = {}) {
  const coords = collectOccurrenceCoords(features);
  const scale = Number.isFinite(bandwidthScale) && bandwidthScale > 0 ? bandwidthScale : 1;
  const cols = Math.max(16, Math.round(gridSize) || KDE_GRID_SIZE);
  const rows = cols;

  const empty = {
    uniqueLocalities: coords.length,
    sampledCount: 0,
    binned: false,
    bandwidthKm: null,
    bandwidthScale: scale,
    peakDensityPerKm2: null,
    cellKm2: null,
    area50Km2: null,
    area95Km2: null,
    threshold50: null,
    threshold95: null,
    reason: coords.length < 2 ? "need_two_points" : "empty",
    grid: null,
    overlay: { type: "FeatureCollection", features: [] }
  };

  if (coords.length < 2) {
    return empty;
  }

  const projector = makeProjector(coords);
  const rawXy = coords.map(([lon, lat]) => projector.toKm(lon, lat));
  const rawWeights = rawXy.map(() => 1);
  const sample = binPoints(rawXy, rawWeights);
  const autoH = scottBandwidthKm(sample.xy);
  if (autoH == null) {
    return { ...empty, reason: "need_two_points" };
  }

  const bandwidthKm = autoH * scale;
  const cutoff = KERNEL_CUTOFF_SIGMAS * bandwidthKm;
  const xs = sample.xy.map((pair) => pair[0]);
  const ys = sample.xy.map((pair) => pair[1]);
  const pad = PAD_SIGMAS * bandwidthKm;
  const xmin = Math.min(...xs) - pad;
  const xmax = Math.max(...xs) + pad;
  const ymin = Math.min(...ys) - pad;
  const ymax = Math.max(...ys) + pad;
  const dx = (xmax - xmin) / cols;
  const dy = (ymax - ymin) / rows;
  const cellKm2 = dx * dy;

  if (!Number.isFinite(cellKm2) || cellKm2 <= 0) {
    return { ...empty, reason: "grid_failed", sampledCount: sample.xy.length, binned: sample.binned };
  }

  const values = new Array(cols * rows).fill(0);
  let peakDensityPerKm2 = 0;

  for (let row = 0; row < rows; row += 1) {
    const y = ymin + (row + 0.5) * dy;
    for (let col = 0; col < cols; col += 1) {
      const x = xmin + (col + 0.5) * dx;
      let density = 0;
      for (let i = 0; i < sample.xy.length; i += 1) {
        const dxp = x - sample.xy[i][0];
        const dyp = y - sample.xy[i][1];
        if (Math.abs(dxp) > cutoff || Math.abs(dyp) > cutoff) {
          continue;
        }
        density += sample.weights[i] * gaussianKernel(dxp, dyp, bandwidthKm);
      }
      values[row * cols + col] = density;
      if (density > peakDensityPerKm2) {
        peakDensityPerKm2 = density;
      }
    }
  }

  const ranked = values
    .map((density, index) => ({ density, index }))
    .filter((cell) => cell.density > 0)
    .sort((left, right) => right.density - left.density);

  const totalMass = ranked.reduce((sum, cell) => sum + cell.density * cellKm2, 0);
  if (!(totalMass > 0) || !(peakDensityPerKm2 > 0)) {
    return {
      ...empty,
      sampledCount: sample.xy.length,
      binned: sample.binned,
      bandwidthKm,
      reason: "flat"
    };
  }

  let mass = 0;
  let area50Km2 = 0;
  let area95Km2 = 0;
  let threshold50 = null;
  let threshold95 = null;
  ranked.forEach((cell) => {
    mass += cell.density * cellKm2;
    if (threshold50 == null) {
      area50Km2 += cellKm2;
      if (mass >= 0.5 * totalMass) {
        threshold50 = cell.density;
      }
    }
    if (threshold95 == null) {
      area95Km2 += cellKm2;
      if (mass >= 0.95 * totalMass) {
        threshold95 = cell.density;
      }
    }
  });

  if (threshold50 == null) {
    threshold50 = ranked[ranked.length - 1].density;
  }
  if (threshold95 == null) {
    threshold95 = ranked[ranked.length - 1].density;
  }

  const mask95 = values.map((density) => density >= threshold95);
  const mask50 = values.map((density) => density >= threshold50);
  const feature95 = isoplethFeature(mask95, cols, rows, xmin, ymin, dx, dy, projector.toLonLat, {
    mass: 0.95,
    level: "95",
    color: "#f4a261",
    label: "95% массы"
  });
  const feature50 = isoplethFeature(mask50, cols, rows, xmin, ymin, dx, dy, projector.toLonLat, {
    mass: 0.5,
    level: "50",
    color: "#c2410c",
    label: "ядро 50%"
  });

  return {
    uniqueLocalities: coords.length,
    sampledCount: sample.xy.length,
    binned: sample.binned,
    bandwidthKm,
    bandwidthScale: scale,
    peakDensityPerKm2,
    cellKm2,
    area50Km2,
    area95Km2,
    threshold50,
    threshold95,
    reason: null,
    grid: {
      cols,
      rows,
      max: peakDensityPerKm2,
      values
    },
    overlay: {
      type: "FeatureCollection",
      features: [feature95, feature50].filter(Boolean)
    }
  };
}
