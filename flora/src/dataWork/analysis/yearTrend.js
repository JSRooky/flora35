import { getFeatureLonLat } from "../buildSeasonalityStats";
import { parseYear } from "./parseYear";
import { normalizeLatinName } from "../normalizeLatinName";
import { computeEoo } from "./eooAoo";

const EOO_POINT_LIMIT = 4000;

function sign(value) {
  if (value > 0) {
    return 1;
  }
  if (value < 0) {
    return -1;
  }
  return 0;
}

function normalCdf(z) {
  const abs = Math.abs(z);
  const t = 1 / (1 + 0.2316419 * abs);
  const d = 0.3989422804 * Math.exp((-z * z) / 2);
  const p =
    d *
    t *
    (0.31938153 +
      t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z >= 0 ? 1 - p : p;
}

function median(values) {
  if (!values.length) {
    return null;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[mid];
  }
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Mann–Kendall + Theil–Sen по ряду y при равномерных x = 0..n-1.
 * Поправка на связи в дисперсии S.
 */
export function mannKendall(values) {
  const series = (values ?? []).map((value) => Number(value)).filter((value) => Number.isFinite(value));
  const n = series.length;
  if (n < 3) {
    return {
      n,
      s: 0,
      tau: null,
      z: null,
      p: null,
      slope: null,
      trend: "insufficient"
    };
  }

  let s = 0;
  const slopes = [];
  const freq = new Map();
  series.forEach((value) => {
    freq.set(value, (freq.get(value) || 0) + 1);
  });

  for (let i = 0; i < n - 1; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      const diff = series[j] - series[i];
      s += sign(diff);
      const dx = j - i;
      if (dx > 0) {
        slopes.push(diff / dx);
      }
    }
  }

  let tieTerm = 0;
  freq.forEach((count) => {
    if (count > 1) {
      tieTerm += count * (count - 1) * (2 * count + 5);
    }
  });

  const varS = Math.max(0, (n * (n - 1) * (2 * n + 5) - tieTerm) / 18);
  let z = 0;
  if (varS > 0) {
    if (s > 0) {
      z = (s - 1) / Math.sqrt(varS);
    } else if (s < 0) {
      z = (s + 1) / Math.sqrt(varS);
    }
  }
  const p = varS > 0 ? 2 * (1 - normalCdf(Math.abs(z))) : 1;
  const tauDenom = (n * (n - 1)) / 2;
  const tau = tauDenom > 0 ? s / tauDenom : null;
  const slope = median(slopes);
  let trend = "none";
  if (p != null && p < 0.05) {
    trend = s > 0 ? "increase" : s < 0 ? "decrease" : "none";
  }

  return { n, s, tau, z, p, slope, trend };
}

function emptyYearBucket() {
  return {
    findings: 0,
    species: new Set(),
    coords: []
  };
}

export function buildYearSeries(features) {
  const byYear = new Map();
  let withoutYear = 0;

  (Array.isArray(features) ? features : []).forEach((feature) => {
    const year = parseYear(feature?.properties?.found_year);
    if (year == null) {
      withoutYear += 1;
      return;
    }
    let bucket = byYear.get(year);
    if (!bucket) {
      bucket = emptyYearBucket();
      byYear.set(year, bucket);
    }
    bucket.findings += 1;
    const latin = normalizeLatinName(feature?.properties?.name_latin);
    if (latin) {
      bucket.species.add(latin);
    }
    const lonLat = getFeatureLonLat(feature);
    if (lonLat) {
      bucket.coords.push([lonLat.lon, lonLat.lat]);
    }
  });

  const years = [...byYear.keys()].sort((left, right) => left - right);
  const seenSpecies = new Set();
  const cumulativeCoords = [];
  const seenCoord = new Set();
  let cumulativeFindings = 0;
  const computeEooSeries = years.length <= 80;

  const rows = years.map((year) => {
    const bucket = byYear.get(year);
    bucket.species.forEach((key) => seenSpecies.add(key));
    cumulativeFindings += bucket.findings;
    if (computeEooSeries && cumulativeCoords.length < EOO_POINT_LIMIT) {
      bucket.coords.forEach((pair) => {
        const key = `${pair[0].toFixed(5)},${pair[1].toFixed(5)}`;
        if (!seenCoord.has(key)) {
          seenCoord.add(key);
          cumulativeCoords.push(pair);
        }
      });
    }
    const eoo =
      computeEooSeries && cumulativeCoords.length <= EOO_POINT_LIMIT
        ? computeEoo(cumulativeCoords).areaKm2
        : null;
    return {
      year,
      findings: bucket.findings,
      species: bucket.species.size,
      cumulativeFindings,
      cumulativeSpecies: seenSpecies.size,
      eooKm2: eoo
    };
  });

  return { rows, withoutYear };
}

export function computeYearTrend(features) {
  const { rows, withoutYear } = buildYearSeries(features);
  const findingsMk = mannKendall(rows.map((row) => row.findings));
  const speciesMk = mannKendall(rows.map((row) => row.species));
  const eooValues = rows.map((row) => row.eooKm2).filter((value) => value != null);
  const eooMk = eooValues.length >= 3 ? mannKendall(eooValues) : null;

  return {
    rows,
    withoutYear,
    tests: {
      findings: findingsMk,
      species: speciesMk,
      eoo: eooMk
    }
  };
}
