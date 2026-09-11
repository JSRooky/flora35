import { getReportSourceLabel } from "../../components/report/reportSources";
import { computeAccumulation } from "./accumulation";
import { computeEooAoo } from "./eooAoo";
import { computeKde } from "./kde";
import { applyQualityFilter, describeQualityFilter } from "./qualityFilter";
import { speciesAbundance, uniqueSpeciesLatin } from "./speciesCounts";
import { computeYearTrend } from "./yearTrend";

export const ANALYSIS_METHODS = {
  EOO_AOO: "eoo-aoo",
  ACCUMULATION: "accumulation",
  YEAR_TREND: "year-trend",
  KDE: "kde"
};

export const ANALYSIS_METHOD_OPTIONS = [
  { id: ANALYSIS_METHODS.EOO_AOO, label: "Ареал" },
  { id: ANALYSIS_METHODS.ACCUMULATION, label: "Накопление" },
  { id: ANALYSIS_METHODS.YEAR_TREND, label: "Годы" },
  { id: ANALYSIS_METHODS.KDE, label: "Плотность" }
];

function buildMeta(features, filtered, sourceId, quality) {
  const { unnamed, counts } = speciesAbundance(filtered);
  const latinNames = uniqueSpeciesLatin(filtered);
  return {
    generatedAt: new Date().toISOString(),
    app: "flora35",
    source: sourceId,
    sourceLabel: getReportSourceLabel(sourceId),
    quality: describeQualityFilter(quality),
    pointCount: filtered.length,
    droppedCount: Math.max(0, features.length - filtered.length),
    speciesCount: counts.size,
    unnamedCount: unnamed,
    singleSpecies: counts.size === 1 ? latinNames[0] || null : null
  };
}

export function runAnalysis(methodId, features, { sourceId, quality, bandwidthScale } = {}) {
  const input = Array.isArray(features) ? features : [];
  const filtered = applyQualityFilter(input, quality);
  const meta = buildMeta(input, filtered, sourceId, quality);

  if (methodId === ANALYSIS_METHODS.EOO_AOO) {
    const result = computeEooAoo(filtered);
    return {
      method: methodId,
      meta,
      metrics: {
        uniqueLocalities: result.uniqueLocalities,
        eooKm2: result.eoo.areaKm2,
        eooReason: result.eoo.reason,
        aooKm2: result.aoo.areaKm2,
        aooCells: result.aoo.occupiedCells,
        cellKm: result.aoo.cellKm
      },
      series: [],
      methodology:
        "EOO — площадь выпуклой оболочки уникальных точек (IUCN: ≥3 локалитета). AOO — число занятых ячеек 2×2 км × 4 км²; сетка приближённо равновеликая (градусы → км по широте точки). Считается по всей текущей выборке, не по краснокнижному списку."
    };
  }

  if (methodId === ANALYSIS_METHODS.ACCUMULATION) {
    const result = computeAccumulation(filtered);
    return {
      method: methodId,
      meta,
      metrics: {
        sObs: result.interval.sObs,
        chao1: result.interval.estimate,
        chao1Lower: result.interval.lower,
        chao1Upper: result.interval.upper,
        coverage: result.coverage,
        f1: result.f1,
        f2: result.f2,
        named: result.named,
        unnamed: result.unnamed
      },
      series: result.curve,
      methodology:
        "Кривая — ожидаемое число видов при случайном разрежении (Hurlbert). Chao1 и 95% ДИ — оценка полного богатства по синглтонам/даблтонам (Colwell / EstimateS, логнормальный интервал). Точки без латыни в богатство не входят."
    };
  }

  if (methodId === ANALYSIS_METHODS.KDE) {
    const result = computeKde(filtered, { bandwidthScale });
    return {
      method: methodId,
      meta,
      metrics: {
        uniqueLocalities: result.uniqueLocalities,
        sampledCount: result.sampledCount,
        binned: result.binned,
        bandwidthKm: result.bandwidthKm,
        bandwidthScale: result.bandwidthScale,
        peakDensityPerKm2: result.peakDensityPerKm2,
        area50Km2: result.area50Km2,
        area95Km2: result.area95Km2,
        reason: result.reason
      },
      series: [],
      grid: result.grid,
      overlay: result.overlay,
      methodology:
        "KDE — гауссова плотность уникальных локалитетов в километровой проекции (не тепловая карта Mapbox). Ширина ядра — правило Скотта, множитель ×0,5 / авто / ×2. Изоплеты 50% и 95% — объёмные (Worton): наименьшая площадь сетки, содержащая долю массы. Это не EOO/AOO и не IUCN-ареал."
    };
  }

  const result = computeYearTrend(filtered);
  return {
    method: methodId,
    meta,
    metrics: {
      years: result.rows.length,
      withoutYear: result.withoutYear,
      findingsTrend: result.tests.findings.trend,
      findingsP: result.tests.findings.p,
      findingsSlope: result.tests.findings.slope,
      speciesTrend: result.tests.species.trend,
      speciesP: result.tests.species.p,
      speciesSlope: result.tests.species.slope,
      eooTrend: result.tests.eoo?.trend ?? null,
      eooP: result.tests.eoo?.p ?? null
    },
    series: result.rows,
    tests: result.tests,
    methodology:
      "Ряды по годам находки (без заполнения пропусков). Mann–Kendall и наклон Theil–Sen для числа находок и числа видов в год; накопленный EOO — если локалитетов не слишком много. Значимость: p < 0,05. Рост числа находок часто отражает съём (GBIF), а не экспансию вида."
  };
}
