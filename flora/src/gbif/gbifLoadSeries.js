import {
  GBIF_PAGE_SIZE,
  buildOccurrenceSearchParams,
  fetchOccurrencePage,
  loadOccurrencesForRegion,
  previewOccurrenceCount
} from "./gbifClient";

/**
 * Порог, после которого offset-пагинация GBIF заметно деградирует.
 * Выше — планируем серии (годы / месяцы), как у iNat.
 */
export const GBIF_SERIES_SOFT_LIMIT = 10000;

/** Диапазон year, покрывающий facet=year (записи вне диапазона считаем «без года»). */
const DATED_YEAR_RANGE = "1,3000";

const SERIES_DELAY_MS = 200;
const PREVIEW_DELAY_MS = 300;
const YEAR_FACET_LIMIT = 400;
const DATASET_FACET_LIMIT = 300;
/** Parallel datedCount probes for undated dataset planning. */
export const UNDATED_PROBE_CONCURRENCY = 3;

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

function stripTemporalExtras(extras = {}) {
  const { year, month, ...rest } = extras;
  return rest;
}

function stripDatasetExtras(extras = {}) {
  const { datasetKey, ...rest } = extras;
  return rest;
}

function shortDatasetLabel(datasetKey) {
  const key = String(datasetKey || "");
  return key.length <= 8 ? key : `${key.slice(0, 8)}…`;
}

function buildSeriesItem({ id, label, extras = {} }) {
  return { id, label, extras: { ...extras } };
}

function readFacetBuckets(page, fieldNames) {
  const facets = Array.isArray(page?.facets) ? page.facets : [];
  const wanted = new Set(fieldNames.map((name) => String(name).toUpperCase()));
  const facet = facets.find((item) => wanted.has(String(item?.field || "").toUpperCase()));
  if (!facet || !Array.isArray(facet.counts)) {
    return [];
  }
  return facet.counts
    .map((bucket) => ({
      name: String(bucket?.name ?? ""),
      count: typeof bucket?.count === "number" ? bucket.count : 0
    }))
    .filter((bucket) => bucket.name && bucket.count > 0);
}

async function fetchFacetBuckets(region, { signal, extras = {}, facet, facetLimit = 100 } = {}) {
  const params = buildOccurrenceSearchParams(region, {
    ...extras,
    limit: 0,
    offset: 0,
    facet,
    facetLimit
  });
  const page = await fetchOccurrencePage(params, { signal });
  return readFacetBuckets(page, [facet]);
}

function buildYearSeriesFromBuckets(baseExtras, buckets) {
  return [...buckets]
    .sort((a, b) => Number(b.name) - Number(a.name))
    .map((bucket) =>
      buildSeriesItem({
        id: `year-${bucket.name}`,
        label: bucket.name,
        extras: { ...baseExtras, year: bucket.name }
      })
    );
}

function buildMonthSeriesForYear(baseExtras, year) {
  const series = [];
  for (let month = 1; month <= 12; month += 1) {
    series.push(
      buildSeriesItem({
        id: `month-${year}-${month}`,
        label: `${year}-${String(month).padStart(2, "0")}`,
        extras: { ...baseExtras, year: String(year), month }
      })
    );
  }
  return series;
}

function buildBasisSeriesForDataset(baseExtras, datasetKey, buckets) {
  return buckets.map((bucket) =>
    buildSeriesItem({
      id: `undated-dataset-${datasetKey}-bor-${bucket.name}`,
      label: `Без года · ${shortDatasetLabel(datasetKey)} · ${bucket.name}`,
      extras: {
        ...baseExtras,
        datasetKey,
        basisOfRecord: bucket.name
      }
    })
  );
}

/**
 * Оценка числа серий для UI (минимум; точное число даст facet по годам).
 */
export function estimateGbifLoadSeriesCount(previewCount) {
  if (previewCount == null || previewCount <= GBIF_SERIES_SOFT_LIMIT) {
    return 1;
  }
  // Грубая оценка числа лет с данными + запас на проходы «без года».
  return Math.max(2, Math.ceil(previewCount / 450) + 1);
}

/**
 * Серии для записей без year: GBIF Search не умеет year IS NULL,
 * поэтому добираем датасеты, где total > count(year=1,3000).
 * Полная выгрузка датасета без year + upsert закрывает «дырки».
 */
async function planUndatedDatasetSeries(region, baseExtras, { signal, yearBucketSum = 0, total = null } = {}) {
  if (baseExtras.datasetKey) {
    return [];
  }

  const undatedEstimate =
    total != null && yearBucketSum > 0 ? Math.max(0, total - yearBucketSum) : null;
  if (undatedEstimate === 0) {
    return [];
  }

  let datasetBuckets = [];
  try {
    datasetBuckets = await fetchFacetBuckets(region, {
      signal,
      extras: baseExtras,
      facet: "datasetKey",
      facetLimit: DATASET_FACET_LIMIT
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw error;
    }
    return [];
  }

  const planned = [];
  let cursor = 0;

  async function probeBucket(bucket) {
    if (signal?.aborted) {
      const abortError = new Error("Aborted");
      abortError.name = "AbortError";
      throw abortError;
    }

    await wait(PREVIEW_DELAY_MS, signal);

    let datedCount = 0;
    try {
      datedCount =
        (await previewOccurrenceCount(region, {
          signal,
          extras: {
            ...baseExtras,
            datasetKey: bucket.name,
            year: DATED_YEAR_RANGE
          }
        })) ?? 0;
    } catch (error) {
      if (error?.name === "AbortError") {
        throw error;
      }
      // При сбое превью датасета лучше попытаться загрузить целиком.
      datedCount = 0;
    }

    const undated = Math.max(0, bucket.count - datedCount);
    if (undated <= 0) {
      return;
    }

    if (bucket.count > GBIF_SERIES_SOFT_LIMIT) {
      try {
        const borBuckets = await fetchFacetBuckets(region, {
          signal,
          extras: { ...baseExtras, datasetKey: bucket.name },
          facet: "basisOfRecord",
          facetLimit: 20
        });
        if (borBuckets.length > 0) {
          planned.push(...buildBasisSeriesForDataset(baseExtras, bucket.name, borBuckets));
          return;
        }
      } catch (error) {
        if (error?.name === "AbortError") {
          throw error;
        }
      }
    }

    planned.push(
      buildSeriesItem({
        id: `undated-dataset-${bucket.name}`,
        label: `Без года · ${shortDatasetLabel(bucket.name)}`,
        extras: { ...baseExtras, datasetKey: bucket.name }
      })
    );
  }

  async function worker() {
    while (cursor < datasetBuckets.length) {
      const index = cursor;
      cursor += 1;
      await probeBucket(datasetBuckets[index]);
    }
  }

  const workerCount = Math.min(UNDATED_PROBE_CONCURRENCY, datasetBuckets.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return planned;
}

/**
 * Планирует серии: один запрос или разбиение по годам (facet=year)
 * + проходы по датасетам для записей без года.
 */
export async function planGbifLoadSeries(
  region,
  { extras = {}, previewCount = null, signal } = {}
) {
  const total =
    previewCount ?? (await previewOccurrenceCount(region, { signal, extras }));

  if (total == null || total <= GBIF_SERIES_SOFT_LIMIT) {
    return [buildSeriesItem({ id: "all", label: "Все находки", extras })];
  }

  // Уже сужено по году/месяцу — одна серия (при truncate развернём в месяцы).
  if (extras.year != null && extras.year !== "") {
    if (extras.month != null) {
      const label = `${extras.year}-${String(extras.month).padStart(2, "0")}`;
      return [
        buildSeriesItem({
          id: `temporal-${label}`,
          label,
          extras
        })
      ];
    }

    if (total > GBIF_SERIES_SOFT_LIMIT) {
      return buildMonthSeriesForYear(stripTemporalExtras(extras), extras.year);
    }

    return [
      buildSeriesItem({
        id: `year-${extras.year}`,
        label: String(extras.year),
        extras
      })
    ];
  }

  const baseExtras = stripDatasetExtras(stripTemporalExtras(extras));
  let yearBucketSum = 0;
  let planned = [];

  try {
    const buckets = await fetchFacetBuckets(region, {
      signal,
      extras: baseExtras,
      facet: "year",
      facetLimit: YEAR_FACET_LIMIT
    });
    yearBucketSum = buckets.reduce((sum, bucket) => sum + bucket.count, 0);
    const yearSeries = buildYearSeriesFromBuckets(baseExtras, buckets);
    if (yearSeries.length > 0) {
      for (const item of yearSeries) {
        const bucketCount =
          buckets.find((bucket) => bucket.name === String(item.extras.year))?.count ?? 0;
        if (bucketCount > GBIF_SERIES_SOFT_LIMIT) {
          planned.push(...buildMonthSeriesForYear(baseExtras, item.extras.year));
        } else {
          planned.push(item);
        }
      }
    }
  } catch (error) {
    if (error?.name === "AbortError") {
      throw error;
    }
    // fallback ниже
  }

  if (planned.length === 0) {
    // Fallback без facet: годы от текущего вниз до 1900.
    const currentYear = new Date().getFullYear();
    for (let year = currentYear; year >= 1900; year -= 1) {
      planned.push(
        buildSeriesItem({
          id: `year-${year}`,
          label: String(year),
          extras: { ...baseExtras, year }
        })
      );
    }
  }

  const undatedSeries = await planUndatedDatasetSeries(region, baseExtras, {
    signal,
    yearBucketSum,
    total
  });
  planned.push(...undatedSeries);

  return planned;
}

async function expandTruncatedSeries(region, series, { signal }) {
  const baseExtras = stripTemporalExtras(series.extras);

  // Толстый датасет «без года» — дробим по basisOfRecord.
  if (series.id?.startsWith("undated-dataset-") && series.extras?.datasetKey) {
    if (series.extras?.basisOfRecord) {
      return [];
    }
    try {
      const buckets = await fetchFacetBuckets(region, {
        signal,
        extras: { ...baseExtras, datasetKey: series.extras.datasetKey },
        facet: "basisOfRecord",
        facetLimit: 20
      });
      if (buckets.length > 0) {
        return buildBasisSeriesForDataset(
          baseExtras,
          series.extras.datasetKey,
          buckets
        );
      }
    } catch (error) {
      if (error?.name === "AbortError") {
        throw error;
      }
    }
    return [];
  }

  const year = series.extras?.year;
  if (year == null || year === "" || String(year).includes(",")) {
    return [];
  }

  // Уже месяц — дальше дробить некуда.
  if (series.extras?.month != null) {
    return [];
  }

  try {
    const buckets = await fetchFacetBuckets(region, {
      signal,
      extras: { ...baseExtras, year: String(year) },
      facet: "month",
      facetLimit: 12
    });
    if (buckets.length > 0) {
      return buckets
        .sort((a, b) => Number(a.name) - Number(b.name))
        .map((bucket) =>
          buildSeriesItem({
            id: `month-${year}-${bucket.name}`,
            label: `${year}-${String(bucket.name).padStart(2, "0")}`,
            extras: { ...baseExtras, year: String(year), month: Number(bucket.name) }
          })
        );
    }
  } catch (error) {
    if (error?.name === "AbortError") {
      throw error;
    }
  }

  return buildMonthSeriesForYear(baseExtras, year);
}

/**
 * Загружает находки GBIF сериями (годы / месяцы / датасеты без года).
 */
export async function loadOccurrencesInSeries(
  region,
  {
    signal,
    extras = {},
    previewCount = null,
    pageSize = GBIF_PAGE_SIZE,
    seriesDelayMs = SERIES_DELAY_MS,
    onPage,
    onProgress,
    onSeriesStart,
    onSeriesComplete
  } = {}
) {
  const initialPlan = await planGbifLoadSeries(region, {
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
      onProgress?.({
        ...progress,
        // Не подменяем общий previewTotal счётчиком одной серии.
        total: totals.previewTotal ?? progress.total,
        series,
        seriesIndex: currentSeriesIndex,
        loadedTotal: totals.loaded
      });
    };

    const result = await loadOccurrencesForRegion(region, {
      signal,
      extras: { ...extras, ...series.extras },
      pageSize,
      softLimit: GBIF_SERIES_SOFT_LIMIT,
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
      await wait(PREVIEW_DELAY_MS, signal);
      const expanded = await expandTruncatedSeries(region, series, { signal });
      if (expanded.length > 0) {
        queue.unshift(...expanded);
      }
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
