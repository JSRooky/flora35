/**
 * Web Worker для вычисления KDE.
 * Работает автономно — весь код инлайнится через Blob URL,
 * чтобы избежать проблем с bundler'ом (CRA react-scripts).
 *
 * Используется как фоллбэк для computeKde() при large datasets.
 */

const KM_PER_DEG_LAT = 110.574;
const KM_PER_DEG_LON_EQUATOR = 111.32;
const KERNEL_CUTOFF_SIGMAS = 3.5;
const PAD_SIGMAS = 3;
const MIN_BANDWIDTH_KM = 0.25;
const MAX_KERNEL_POINTS = 2500;
const BIN_KM = 2;
const TWO_PI = Math.PI * 2;

function mean(values) {
  if (!values.length) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function sampleStdDev(values) {
  if (values.length < 2) return 0;
  const avg = mean(values);
  let sumSq = 0;
  for (let i = 0; i < values.length; i++) {
    const delta = values[i] - avg;
    sumSq += delta * delta;
  }
  return Math.sqrt(sumSq / (values.length - 1));
}

function scottBandwidthKm(xs, ys) {
  if (!xs || xs.length < 2) return null;
  const sigmaX = sampleStdDev(xs);
  const sigmaY = sampleStdDev(ys);
  const sigma = Math.sqrt((sigmaX ** 2 + sigmaY ** 2) / 2);
  if (!Number.isFinite(sigma) || sigma <= 0) return MIN_BANDWIDTH_KM;
  return Math.max(MIN_BANDWIDTH_KM, sigma * xs.length ** (-1 / 6));
}

function binPoints(xy, weights) {
  if (xy.length <= MAX_KERNEL_POINTS) {
    return { xy, weights, binned: false };
  }
  const bins = new Map();
  for (let i = 0; i < xy.length; i++) {
    const pair = xy[i];
    const key = `${Math.round(pair[0] / BIN_KM)}:${Math.round(pair[1] / BIN_KM)}`;
    const w = weights[i];
    const prev = bins.get(key);
    if (!prev) {
      bins.set(key, { x: pair[0] * w, y: pair[1] * w, w });
    } else {
      prev.x += pair[0] * w;
      prev.y += pair[1] * w;
      prev.w += w;
    }
  }
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
  if (q > KERNEL_CUTOFF_SIGMAS * KERNEL_CUTOFF_SIGMAS) return 0;
  return Math.exp(-0.5 * q) / (TWO_PI * h2);
}

/**
 * Основная функция KDE — вычисляет grid + изоплеты.
 * @param {number[][]} coords - [[lon, lat], ...]
 * @param {number} bandwidthScale
 * @param {number} gridSize
 * @returns {object} KDE result
 */
function computeKdeSync(coords, bandwidthScale, gridSize) {
  const cols = Math.max(16, Math.round(gridSize) || 96);
  const rows = cols;

  if (coords.length < 2) {
    return {
      uniqueLocalities: coords.length,
      sampledCount: 0,
      binned: false,
      bandwidthKm: null,
      bandwidthScale: bandwidthScale,
      peakDensityPerKm2: null,
      cellKm2: null,
      area50Km2: null,
      area95Km2: null,
      threshold50: null,
      threshold95: null,
      reason: "need_two_points",
      grid: null,
      overlay: { type: "FeatureCollection", features: [] }
    };
  }

  // Projector
  const originLon = mean(coords.map((p) => p[0]));
  const originLat = mean(coords.map((p) => p[1]));
  const kmLon = Math.max(
    KM_PER_DEG_LON_EQUATOR * Math.cos((originLat * Math.PI) / 180),
    1e-6
  );

  const toKmX = (lon) => (lon - originLon) * kmLon;
  const toKmY = (lat) => (lat - originLat) * KM_PER_DEG_LAT;
  const toLon = (x) => originLon + x / kmLon;
  const toLat = (y) => originLat + y / KM_PER_DEG_LAT;

  const rawXy = coords.map(([lon, lat]) => [toKmX(lon), toKmY(lat)]);
  const rawWeights = rawXy.map(() => 1);

  const sample = binPoints(rawXy, rawWeights);
  const autoH = scottBandwidthKm(sample.xy.map((p) => p[0]), sample.xy.map((p) => p[1]));
  if (autoH == null) {
    return {
      uniqueLocalities: coords.length,
      sampledCount: 0, binned: false, bandwidthKm: null,
      bandwidthScale: bandwidthScale,
      peakDensityPerKm2: null, cellKm2: null,
      area50Km2: null, area95Km2: null,
      threshold50: null, threshold95: null,
      reason: "need_two_points", grid: null,
      overlay: { type: "FeatureCollection", features: [] }
    };
  }

  const bandwidthKm = autoH * bandwidthScale;
  const cutoff = KERNEL_CUTOFF_SIGMAS * bandwidthKm;
  const xs = sample.xy.map((p) => p[0]);
  const ys = sample.xy.map((p) => p[1]);
  const pad = PAD_SIGMAS * bandwidthKm;
  const xmin = Math.min(...xs) - pad;
  const xmax = Math.max(...xs) + pad;
  const ymin = Math.min(...ys) - pad;
  const ymax = Math.max(...ys) + pad;
  const dx = (xmax - xmin) / cols;
  const dy = (ymax - ymin) / rows;
  const cellKm2 = dx * dy;

  if (!Number.isFinite(cellKm2) || cellKm2 <= 0) {
    return {
      uniqueLocalities: coords.length, sampledCount: sample.xy.length, binned: sample.binned,
      bandwidthKm, bandwidthScale: bandwidthScale,
      peakDensityPerKm2: null, cellKm2, area50Km2: null, area95Km2: null,
      threshold50: null, threshold95: null, reason: "grid_failed",
      grid: null, overlay: { type: "FeatureCollection", features: [] }
    };
  }

  // Compute density grid
  const values = new Float64Array(cols * rows);
  let peakDensityPerKm2 = 0;

  for (let row = 0; row < rows; row++) {
    const y = ymin + (row + 0.5) * dy;
    for (let col = 0; col < cols; col++) {
      const x = xmin + (col + 0.5) * dx;
      let density = 0;
      for (let i = 0; i < sample.xy.length; i++) {
        const dxp = x - sample.xy[i][0];
        const dyp = y - sample.xy[i][1];
        if (Math.abs(dxp) > cutoff || Math.abs(dyp) > cutoff) continue;
        density += sample.weights[i] * gaussianKernel(dxp, dyp, bandwidthKm);
      }
      values[row * cols + col] = density;
      if (density > peakDensityPerKm2) peakDensityPerKm2 = density;
    }
  }

  // Rank cells by density
  const ranked = [];
  for (let i = 0; i < values.length; i++) {
    if (values[i] > 0) ranked.push({ density: values[i], index: i });
  }
  ranked.sort((a, b) => b.density - a.density);

  const totalMass = ranked.reduce((sum, c) => sum + c.density * cellKm2, 0);
  if (!(totalMass > 0) || !(peakDensityPerKm2 > 0)) {
    return {
      uniqueLocalities: coords.length, sampledCount: sample.xy.length, binned: sample.binned,
      bandwidthKm, bandwidthScale: bandwidthScale,
      peakDensityPerKm2, cellKm2, area50Km2: null, area95Km2: null,
      threshold50: null, threshold95: null, reason: "flat",
      grid: { cols, rows, max: peakDensityPerKm2, values: Array.from(values) },
      overlay: { type: "FeatureCollection", features: [] }
    };
  }

  // Compute 50% and 95% isopleths
  let mass = 0;
  let area50Km2 = 0;
  let area95Km2 = 0;
  let threshold50 = null;
  let threshold95 = null;

  for (let i = 0; i < ranked.length; i++) {
    const cell = ranked[i];
    mass += cell.density * cellKm2;
    if (threshold50 == null) {
      area50Km2 += cellKm2;
      if (mass >= 0.5 * totalMass) threshold50 = cell.density;
    }
    if (threshold95 == null) {
      area95Km2 += cellKm2;
      if (mass >= 0.95 * totalMass) threshold95 = cell.density;
    }
  }

  if (threshold50 == null) threshold50 = ranked[ranked.length - 1].density;
  if (threshold95 == null) threshold95 = ranked[ranked.length - 1].density;

  // Build mask and isopleth features
  const mask95 = new Uint8Array(values.length);
  const mask50 = new Uint8Array(values.length);
  for (let i = 0; i < values.length; i++) {
    mask95[i] = values[i] >= threshold95 ? 1 : 0;
    mask50[i] = values[i] >= threshold50 ? 1 : 0;
  }

  function buildIsopleth(mask, level, color, label) {
    const parts = [];
    for (let row = 0; row < rows; row++) {
      let col = 0;
      while (col < cols) {
        if (!mask[row * cols + col]) { col++; continue; }
        let end = col + 1;
        while (end < cols && mask[row * cols + end]) end++;
        const x0 = xmin + col * dx;
        const y0 = ymin + row * dy;
        const x1 = xmin + end * dx;
        const y1 = ymin + (row + 1) * dy;
        const ring = [
          [toLon(x0), toLat(y0)],
          [toLon(x1), toLat(y0)],
          [toLon(x1), toLat(y1)],
          [toLon(x0), toLat(y1)],
          [toLon(x0), toLat(y0)]
        ];
        parts.push([ring]);
        col = end;
      }
    }
    if (!parts.length) return null;
    return {
      type: "Feature",
      properties: { mass: level, level: String(level * 100) + "%", color, label },
      geometry: { type: "MultiPolygon", coordinates: parts }
    };
  }

  const feature95 = buildIsopleth(mask95, 0.95, "#f4a261", "95% массы");
  const feature50 = buildIsopleth(mask50, 0.5, "#c2410c", "ядро 50%");

  return {
    uniqueLocalities: coords.length,
    sampledCount: sample.xy.length,
    binned: sample.binned,
    bandwidthKm,
    bandwidthScale: bandwidthScale,
    peakDensityPerKm2,
    cellKm2,
    area50Km2,
    area95Km2,
    threshold50,
    threshold95,
    reason: null,
    grid: { cols, rows, max: peakDensityPerKm2, values: Array.from(values) },
    overlay: {
      type: "FeatureCollection",
      features: [feature95, feature50].filter(Boolean)
    }
  };
}

// Message handler
self.onmessage = function(e) {
  const { id, coords, bandwidthScale, gridSize } = e.data;
  try {
    const result = computeKdeSync(coords, bandwidthScale, gridSize);
    self.postMessage({ id, result });
  } catch (error) {
    self.postMessage({ id, error: error.message || String(error) });
  }
};
