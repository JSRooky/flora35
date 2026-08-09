import { mapOccurrencesToFeatures } from "./mapOccurrenceToFeature";

const GBIF_OCCURRENCE_SEARCH_URL = "https://api.gbif.org/v1/occurrence/search";
export const GBIF_PAGE_SIZE = 300;
/** Сколько страниц копить перед обновлением слоя карты. */
export const GBIF_MAP_UPDATE_PAGES = 4;
const FETCH_RETRY_COUNT = 2;
const FETCH_RETRY_DELAY_MS = 700;

/** Отмена запроса (в т.ч. когда браузер вместо AbortError отдаёт Failed to fetch). */
export function isGbifAbortError(error, signal) {
  if (signal?.aborted) {
    return true;
  }

  return (
    error?.name === "AbortError" ||
    error?.code === 20 ||
    (typeof DOMException !== "undefined" &&
      error instanceof DOMException &&
      error.name === "AbortError")
  );
}

/** Понятное сообщение для сетевых сбоев fetch. */
export function getGbifNetworkErrorMessage(error) {
  const message = error?.message || "";
  if (
    error?.name === "TypeError" ||
    /failed to fetch|networkerror|load failed|network request failed/i.test(message)
  ) {
    return "Не удалось связаться с GBIF. Проверьте интернет и попробуйте ещё раз.";
  }

  return message || "Не удалось загрузить данные GBIF";
}

function wait(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      const abortError = new Error("Aborted");
      abortError.name = "AbortError";
      reject(abortError);
      return;
    }

    const timer = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(timer);
      const abortError = new Error("Aborted");
      abortError.name = "AbortError";
      reject(abortError);
    };

    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function isRetryableNetworkError(error) {
  return (
    error?.name === "TypeError" ||
    /failed to fetch|networkerror|load failed|network request failed/i.test(
      error?.message || ""
    )
  );
}

/**
 * Строит WKT POLYGON из bbox [west, south, east, north].
 * Порядок вершин — против часовой стрелки (требование GBIF).
 */
export function bboxToWktPolygon(bbox) {
  const [west, south, east, north] = bbox;
  return `POLYGON((${west} ${south},${east} ${south},${east} ${north},${west} ${north},${west} ${south}))`;
}

/**
 * Собирает query-параметры Occurrence Search для региона.
 * Приоритет: gadmGid → geometry → bbox.
 */
export function buildOccurrenceSearchParams(region, extras = {}) {
  if (!region) {
    throw new Error("GBIF region is required");
  }

  const params = new URLSearchParams();
  params.set("hasCoordinate", "true");
  params.set("hasGeospatialIssue", "false");

  if (region.gadmGid) {
    params.set("gadmGid", region.gadmGid);
  } else if (region.geometry) {
    params.set("geometry", region.geometry);
  } else if (region.bbox) {
    params.set("geometry", bboxToWktPolygon(region.bbox));
  } else {
    throw new Error(`Region "${region.id}" has no spatial filter (gadmGid, geometry, or bbox)`);
  }

  Object.entries(extras).forEach(([key, value]) => {
    if (value == null || value === "") {
      return;
    }
    params.set(key, String(value));
  });

  return params;
}

/** Запрашивает одну страницу occurrence/search (с короткими повторами при сетевом сбое). */
export async function fetchOccurrencePage(params, { signal } = {}) {
  const url = `${GBIF_OCCURRENCE_SEARCH_URL}?${params.toString()}`;
  let lastError = null;

  for (let attempt = 0; attempt <= FETCH_RETRY_COUNT; attempt += 1) {
    if (signal?.aborted) {
      const abortError = new Error("Aborted");
      abortError.name = "AbortError";
      throw abortError;
    }

    try {
      const response = await fetch(url, { signal, mode: "cors", credentials: "omit" });

      if (!response.ok) {
        throw new Error(`GBIF API error: ${response.status} ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      if (isGbifAbortError(error, signal)) {
        const abortError = new Error("Aborted");
        abortError.name = "AbortError";
        throw abortError;
      }

      lastError = error;
      if (!isRetryableNetworkError(error) || attempt >= FETCH_RETRY_COUNT) {
        throw error;
      }

      await wait(FETCH_RETRY_DELAY_MS * (attempt + 1), signal);
    }
  }

  throw lastError ?? new Error("Failed to fetch");
}

/**
 * Быстрая оценка числа находок (limit=0) для текущих фильтров.
 * Возвращает count или null при ошибке/отмене.
 */
export async function previewOccurrenceCount(region, { signal, extras = {} } = {}) {
  const params = buildOccurrenceSearchParams(region, {
    ...extras,
    limit: 0,
    offset: 0
  });
  const page = await fetchOccurrencePage(params, { signal });
  return typeof page.count === "number" ? page.count : null;
}

/** yyyy-MM-dd для параметров дат GBIF. */
export function toGbifDateParam(value) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString().slice(0, 10);
}

/**
 * Добавляет фильтр lastInterpreted=день,* для подгрузки только обновлений
 * с момента последней синхронизации (день включительно, дубликаты отсекаются по ключу).
 */
export function withUpdateSinceExtras(extras = {}, syncedAt) {
  const day = toGbifDateParam(syncedAt);
  if (!day) {
    return extras;
  }

  return {
    ...extras,
    lastInterpreted: `${day},*`
  };
}

/**
 * Постранично загружает находки для региона.
 * onPage(features) — инкрементально; onProgress({ loaded, total, endOfRecords }).
 */
export async function loadOccurrencesForRegion(
  region,
  { signal, onPage, onProgress, pageSize = GBIF_PAGE_SIZE, extras = {} } = {}
) {
  let offset = 0;
  let loaded = 0;
  let total = null;
  let endOfRecords = false;

  while (!endOfRecords) {
    if (signal?.aborted) {
      const abortError = new Error("Aborted");
      abortError.name = "AbortError";
      throw abortError;
    }

    const params = buildOccurrenceSearchParams(region, {
      ...extras,
      limit: pageSize,
      offset
    });

    const page = await fetchOccurrencePage(params, { signal });
    const features = mapOccurrencesToFeatures(page.results ?? []);

    loaded += features.length;
    total = typeof page.count === "number" ? page.count : total;
    endOfRecords = Boolean(page.endOfRecords) || !(page.results?.length);

    onPage?.(features, { offset, loaded, total, endOfRecords });
    onProgress?.({ loaded, total, endOfRecords });

    if (endOfRecords) {
      break;
    }

    offset += pageSize;

    // Жёсткий лимит Occurrence Search API: offset + limit ≤ 100_000.
    if (offset >= 100000) {
      onProgress?.({ loaded, total, endOfRecords: true, truncated: true });
      break;
    }

    // Даём UI отрисовать прогресс между страницами.
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  return { loaded, total, endOfRecords: true };
}
