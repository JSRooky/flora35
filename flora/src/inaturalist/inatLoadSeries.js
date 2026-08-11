import {
  INAT_API_RESULT_LIMIT,
  INAT_PAGE_DELAY_MS,
  previewObservationCount,
  loadObservationsForRegion
} from "./inatClient";

/** Группы iconic taxa для серий загрузки (каждая серия — отдельный запрос к API). */
export const INAT_ICONIC_TAXA_SERIES = [
  "Plantae",
  "Animalia",
  "Aves",
  "Insecta",
  "Arachnida",
  "Fungi",
  "Amphibia",
  "Reptilia",
  "Actinopterygii",
  "Mollusca",
  "Chromista",
  "Protozoa"
];

const YEAR_SERIES_START = 1950;
const PREVIEW_DELAY_MS = 400;

function wait(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      const abortError = new Error("Aborted");
      abortError.name = "AbortError";
      reject(abortError);
      return;
    }

    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        const abortError = new Error("Aborted");
        abortError.name = "AbortError";
        reject(abortError);
      },
      { once: true }
    );
  });
}

function normalizeSeriesExtras(extras = {}) {
  const { iconicTaxa, year, month, ...rest } = extras;
  return {
    ...rest,
    ...(iconicTaxa ? { iconicTaxa } : {}),
    ...(year != null ? { year } : {}),
    ...(month != null ? { month } : {})
  };
}

function buildSeriesItem({ id, label, extras = {} }) {
  const normalizedExtras = normalizeSeriesExtras(extras);
  return {
    id,
    label,
    extras: normalizedExtras
  };
}

function buildIconicTaxaSeries() {
  return INAT_ICONIC_TAXA_SERIES.map((taxon) =>
    buildSeriesItem({
      id: `taxon-${taxon}`,
      label: taxon,
      extras: { iconicTaxa: taxon }
    })
  );
}

function buildYearSeriesForExtras(baseExtras, { taxonLabel = null } = {}) {
  const currentYear = new Date().getFullYear();
  const series = [];

  for (let year = currentYear; year >= YEAR_SERIES_START; year -= 1) {
    const prefix = taxonLabel ? `${taxonLabel}, ` : "";
    series.push(
      buildSeriesItem({
        id: `year-${taxonLabel ?? "all"}-${year}`,
        label: `${prefix}${year}`,
        extras: { ...baseExtras, year }
      })
    );
  }

  return series;
}

function buildMonthSeriesForExtras(baseExtras, year, { taxonLabel = null } = {}) {
  const series = [];

  for (let month = 1; month <= 12; month += 1) {
    const prefix = taxonLabel ? `${taxonLabel}, ` : "";
    series.push(
      buildSeriesItem({
        id: `month-${taxonLabel ?? "all"}-${year}-${month}`,
        label: `${prefix}${year}-${String(month).padStart(2, "0")}`,
        extras: { ...baseExtras, year, month }
      })
    );
  }

  return series;
}

/**
 * Оценивает минимальное число серий при загрузке региона.
 * Точное число может вырасти, если отдельная серия упрётся в лимит API.
 */
export function estimateInatLoadSeriesCount(previewCount) {
  if (previewCount == null || previewCount <= INAT_API_RESULT_LIMIT) {
    return 1;
  }

  return INAT_ICONIC_TAXA_SERIES.length;
}

/**
 * Планирует серии загрузки: один запрос или разбиение по iconic taxa.
 * @returns {Promise<Array<{ id: string, label: string, extras: object }>>}
 */
export async function planInatLoadSeries(
  region,
  { qualityGrade, extras = {}, previewCount = null, signal } = {}
) {
  const total =
    previewCount ??
    (await previewObservationCount(region, { signal, qualityGrade, extras }));

  if (total == null || total <= INAT_API_RESULT_LIMIT) {
    return [buildSeriesItem({ id: "all", label: "Все наблюдения", extras })];
  }

  return buildIconicTaxaSeries().map((item) =>
    buildSeriesItem({
      id: item.id,
      label: item.label,
      extras: { ...extras, ...item.extras }
    })
  );
}

/**
 * Если серия вернула truncated, дробим её по годам (и при необходимости по месяцам).
 */
async function expandTruncatedSeries(region, series, { qualityGrade, signal }) {
  const baseExtras = { ...series.extras };
  delete baseExtras.year;
  delete baseExtras.month;

  const taxonLabel = baseExtras.iconicTaxa ?? null;
  const yearSeries = buildYearSeriesForExtras(baseExtras, { taxonLabel });
  const expanded = [];

  for (const yearItem of yearSeries) {
    if (signal?.aborted) {
      break;
    }

    await wait(PREVIEW_DELAY_MS, signal);

    const count = await previewObservationCount(region, {
      signal,
      qualityGrade,
      extras: yearItem.extras
    });

    if (count == null || count === 0) {
      continue;
    }

    if (count <= INAT_API_RESULT_LIMIT) {
      expanded.push(yearItem);
      continue;
    }

    expanded.push(
      ...buildMonthSeriesForExtras(baseExtras, yearItem.extras.year, { taxonLabel })
    );
  }

  return expanded.length > 0
    ? expanded
    : buildYearSeriesForExtras(baseExtras, { taxonLabel });
}

/**
 * Загружает наблюдения сериями и объединяет их в store через upsert.
 * onPage / onProgress — как у loadObservationsForRegion, но по всем сериям суммарно.
 */
export async function loadObservationsInSeries(
  region,
  {
    signal,
    qualityGrade,
    extras = {},
    previewCount = null,
    pageSize,
    pageDelayMs = INAT_PAGE_DELAY_MS,
    seriesDelayMs = INAT_PAGE_DELAY_MS,
    onPage,
    onProgress,
    onSeriesStart,
    onSeriesComplete
  } = {}
) {
  const initialPlan = await planInatLoadSeries(region, {
    qualityGrade,
    extras,
    previewCount,
    signal
  });

  const queue = [...initialPlan];
  const completedSeries = [];
  let seriesOrdinal = 0;
  let truncatedSeriesCount = 0;
  const totals = { loaded: 0, previewTotal: previewCount };

  while (queue.length > 0) {
    if (signal?.aborted) {
      const abortError = new Error("Aborted");
      abortError.name = "AbortError";
      throw abortError;
    }

    const series = queue.shift();
    seriesOrdinal += 1;
    const currentSeriesIndex = seriesOrdinal;

    onSeriesStart?.({
      series,
      index: currentSeriesIndex,
      planned: initialPlan.length,
      queued: queue.length + 1
    });

    const seriesPageCallback = (features, meta) => {
      totals.loaded += features.length;
      onPage?.(features, {
        ...meta,
        series,
        seriesIndex: currentSeriesIndex,
        loadedTotal: totals.loaded
      });
    };

    const seriesProgressCallback = (progress) => {
      if (typeof progress.total === "number") {
        totals.previewTotal = progress.total;
      }
      onProgress?.({
        ...progress,
        series,
        seriesIndex: currentSeriesIndex,
        loadedTotal: totals.loaded
      });
    };

    const result = await loadObservationsForRegion(region, {
      signal,
      qualityGrade,
      extras: { ...extras, ...series.extras },
      pageSize,
      pageDelayMs,
      onPage: seriesPageCallback,
      onProgress: seriesProgressCallback
    });

    completedSeries.push({ series, result });

    onSeriesComplete?.({
      series,
      index: currentSeriesIndex,
      result
    });

    if (result.truncated) {
      truncatedSeriesCount += 1;
      const expanded = await expandTruncatedSeries(region, series, {
        qualityGrade,
        signal
      });
      queue.unshift(...expanded);
    }

    if (queue.length > 0) {
      await wait(seriesDelayMs, signal);
    }
  }

  return {
    loaded: totals.loaded,
    total: totals.previewTotal,
    seriesCount: completedSeries.length,
    truncatedSeriesCount,
    completedSeries,
    multiSeries: completedSeries.length > 1
  };
}
