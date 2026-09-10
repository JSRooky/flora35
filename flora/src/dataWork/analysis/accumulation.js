import { chao1, coverage, expectedRichness } from "../compare/compareExtraStats";
import { speciesAbundance } from "./speciesCounts";

const Z_95 = 1.96;
const MAX_RAREFACTION_POINTS = 24;
const MAX_N_FOR_FULL_CURVE = 4000;

function singletonDoubleton(counts) {
  let f1 = 0;
  let f2 = 0;
  counts.forEach((value) => {
    if (value === 1) {
      f1 += 1;
    } else if (value === 2) {
      f2 += 1;
    }
  });
  return { f1, f2 };
}

function abundanceTotal(counts) {
  return [...counts.values()].reduce((sum, value) => sum + value, 0);
}

/**
 * Дисперсия Chao1 (Colwell / Chao 1987).
 * f2 > 0: классическая формула с k=(n−1)/n.
 * f2 = 0: оценка для bias-corrected Chao1.
 */
export function chao1Variance(counts) {
  const n = abundanceTotal(counts);
  if (n <= 1 || counts.size === 0) {
    return 0;
  }
  const { f1, f2 } = singletonDoubleton(counts);
  const k = (n - 1) / n;
  if (f2 > 0) {
    const ratio = f1 / f2;
    return (
      f2 *
      ((0.5 * k * ratio * ratio) ** 2 +
        k * k * ratio ** 3 +
        0.5 * k * k * ratio * ratio)
    );
  }
  return k * f1 * (f1 - 1) / 2 + (k * k * f1 * (2 * f1 - 1) ** 2) / 4;
}

/** Оценка Chao1 и 95% ДИ (логнормальный, как в EstimateS). */
export function chao1Interval(counts, z = Z_95) {
  const sObs = counts.size;
  const estimate = chao1(counts);
  const variance = chao1Variance(counts);
  const phi = estimate - sObs;

  if (phi > 0 && variance > 0) {
    const t = Math.exp(z * Math.sqrt(Math.log(1 + variance / (phi * phi))));
    return {
      sObs,
      estimate,
      variance,
      lower: sObs + phi / t,
      upper: sObs + phi * t
    };
  }

  const se = Math.sqrt(Math.max(0, variance));
  return {
    sObs,
    estimate,
    variance,
    lower: Math.max(sObs, estimate - z * se),
    upper: estimate + z * se
  };
}

export function rarefactionCurve(counts, { maxPoints = MAX_RAREFACTION_POINTS } = {}) {
  const n = abundanceTotal(counts);
  if (n <= 0) {
    return [];
  }

  if (n > MAX_N_FOR_FULL_CURVE) {
    const mid = Math.min(n, Math.round(MAX_N_FOR_FULL_CURVE / 2));
    return [
      { n: 1, s: expectedRichness(counts, 1) },
      { n: mid, s: expectedRichness(counts, mid) },
      { n, s: counts.size }
    ];
  }

  const steps = new Set([1, n]);
  const count = Math.min(maxPoints, n);
  for (let index = 1; index < count - 1; index += 1) {
    steps.add(Math.max(1, Math.round(((index + 1) / count) * n)));
  }

  return [...steps]
    .sort((left, right) => left - right)
    .map((subsampleN) => ({
      n: subsampleN,
      s: expectedRichness(counts, subsampleN)
    }));
}

export function computeAccumulation(features) {
  const { counts, unnamed, named } = speciesAbundance(features);
  const interval = chao1Interval(counts);
  const { f1, f2 } = singletonDoubleton(counts);
  return {
    named,
    unnamed,
    f1,
    f2,
    coverage: coverage(counts),
    interval,
    curve: rarefactionCurve(counts)
  };
}
