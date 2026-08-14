import { toGbifSpatialRegion } from "../externalSources/regions";
import { mapOccurrencesToFeatures } from "./mapOccurrenceToFeature";

const GBIF_OCCURRENCE_SEARCH_URL = "https://api.gbif.org/v1/occurrence/search";
export const GBIF_PAGE_SIZE = 300;
/** Сколько страниц копить перед обновлением слоя карты (~24k точек при page=300). */
export const GBIF_MAP_UPDATE_PAGES = 80;
/** Одновременных page-запросов внутри одной серии (осторожный параллелизм). */
export const GBIF_PAGE_CONCURRENCY = 3;
const FETCH_RETRY_COUNT = 2;
const FETCH_RETRY_DELAY_MS = 700;
const FETCH_RETRY_429_DELAY_MS = 1500;

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

function isRetryableHttpStatus(status) {
  return status === 429 || status === 503 || (status >= 500 && status < 600);
}

function parseRetryAfterMs(response) {
  const raw = response.headers?.get?.("Retry-After");
  if (!raw) {
    return null;
  }

  const asSeconds = Number(raw);
  if (Number.isFinite(asSeconds) && asSeconds >= 0) {
    return asSeconds * 1000;
  }

  const asDate = Date.parse(raw);
  if (!Number.isNaN(asDate)) {
    return Math.max(0, asDate - Date.now());
  }

  return null;
}

function createHttpError(status, statusText, retryAfterMs = null) {
  const error = new Error(`GBIF API error: ${status} ${statusText}`);
  error.status = status;
  error.retryAfterMs = retryAfterMs;
  return error;
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
  const spatial = toGbifSpatialRegion(region);
  if (!spatial) {
    throw new Error("GBIF region is required");
  }

  const params = new URLSearchParams();
  params.set("hasCoordinate", "true");
  params.set("hasGeospatialIssue", "false");

  if (spatial.gadmGid) {
    params.set("gadmGid", spatial.gadmGid);
  } else if (spatial.geometry) {
    params.set("geometry", spatial.geometry);
  } else if (spatial.bbox) {
    params.set("geometry", bboxToWktPolygon(spatial.bbox));
  } else {
    throw new Error(`Region "${spatial.id ?? region?.id}" has no spatial filter (gadmGid, geometry, or bbox)`);
  }

  Object.entries(extras).forEach(([key, value]) => {
    if (value == null || value === "") {
      return;
    }
    params.set(key, String(value));
  });

  return params;
}

/**
 * Запрашивает одну страницу occurrence/search (с короткими повторами при
 * сетевом сбое, 429 и 5xx). onRateLimited вызывается при ответе 429.
 */
export async function fetchOccurrencePage(params, { signal, onRateLimited } = {}) {
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
        const retryAfterMs = parseRetryAfterMs(response);
        throw createHttpError(response.status, response.statusText, retryAfterMs);
      }

      return await response.json();
    } catch (error) {
      if (isGbifAbortError(error, signal)) {
        const abortError = new Error("Aborted");
        abortError.name = "AbortError";
        throw abortError;
      }

      lastError = error;
      const status = error?.status;
      const retryableHttp = typeof status === "number" && isRetryableHttpStatus(status);
      const retryable =
        isRetryableNetworkError(error) || retryableHttp;

      if (!retryable || attempt >= FETCH_RETRY_COUNT) {
        throw error;
      }

      if (status === 429) {
        onRateLimited?.();
      }

      const delayMs =
        status === 429
          ? error.retryAfterMs ?? FETCH_RETRY_429_DELAY_MS * (attempt + 1)
          : FETCH_RETRY_DELAY_MS * (attempt + 1);
      await wait(delayMs, signal);
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
 * Следующий UTC-день после syncedAt (yyyy-MM-dd).
 * Нужен потому что lastInterpreted у GBIF — дневная точность с закрытой нижней границей:
 * фильтр `день,*` снова включает все записи дня синка и превью «Обновлений» не обнуляется.
 */
export function toNextGbifDateParam(value) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

/**
 * Добавляет фильтр lastInterpreted=день,* для подгрузки обновлений
 * после дня последней синхронизации (нижняя граница — следующий день).
 * Дубликаты по ключу всё равно отсекаются при upsert.
 */
export function withUpdateSinceExtras(extras = {}, syncedAt) {
  const day = toNextGbifDateParam(syncedAt);
  if (!day) {
    return extras;
  }

  return {
    ...extras,
    lastInterpreted: `${day},*`
  };
}

function throwIfAborted(signal) {
  if (signal?.aborted) {
    const abortError = new Error("Aborted");
    abortError.name = "AbortError";
    throw abortError;
  }
}

/**
 * Постранично загружает находки для региона.
 * onPage(features) — инкрементально; onProgress({ loaded, total, endOfRecords, truncated }).
 *
 * softLimit — мягкая отсечка по offset (для серийной загрузки): дальше пагинация GBIF
 * сильно замедляется, серию лучше дробить (годы → месяцы).
 *
 * Страницы запрашиваются пулом (по умолчанию 3); в store/UI отдаются строго по возрастанию offset.
 * При 429 concurrency временно падает до 1 до конца серии.
 */
export async function loadOccurrencesForRegion(
  region,
  {
    signal,
    onPage,
    onProgress,
    pageSize = GBIF_PAGE_SIZE,
    extras = {},
    softLimit = null,
    concurrency = GBIF_PAGE_CONCURRENCY
  } = {}
) {
  let loaded = 0;
  let total = null;
  let truncated = false;

  const offsetCap =
    softLimit != null ? Math.min(softLimit, 100000) : 100000;
  let nextFetchOffset = 0;
  let nextApplyOffset = 0;
  /** Не запрашивать offset >= этого значения (после endOfRecords / truncate). */
  let fetchLimit = offsetCap;

  const ready = new Map();
  const inFlight = new Map();
  let effectiveConcurrency = Math.max(1, concurrency);

  const markRateLimited = () => {
    effectiveConcurrency = 1;
  };

  const canScheduleMore = () =>
    nextFetchOffset < fetchLimit && !signal?.aborted;

  const scheduleOne = () => {
    if (!canScheduleMore() || inFlight.size >= effectiveConcurrency) {
      return false;
    }

    const offset = nextFetchOffset;
    nextFetchOffset += pageSize;

    const task = (async () => {
      const params = buildOccurrenceSearchParams(region, {
        ...extras,
        limit: pageSize,
        offset
      });
      const page = await fetchOccurrencePage(params, {
        signal,
        onRateLimited: markRateLimited
      });
      const features = mapOccurrencesToFeatures(page.results ?? []);
      const endOfRecords =
        Boolean(page.endOfRecords) || !(page.results?.length);
      return {
        offset,
        features,
        count: typeof page.count === "number" ? page.count : null,
        endOfRecords
      };
    })()
      .then((result) => {
        ready.set(offset, result);
      })
      .catch((error) => {
        ready.set(offset, { offset, error });
      })
      .finally(() => {
        inFlight.delete(offset);
      });

    inFlight.set(offset, task);
    return true;
  };

  const waitForAnyInFlight = async () => {
    if (inFlight.size === 0) {
      return;
    }
    await Promise.race(inFlight.values());
  };

  const drainInFlight = async () => {
    while (inFlight.size > 0) {
      await waitForAnyInFlight();
    }
  };

  while (scheduleOne()) {
    // заполняем пул
  }

  while (
    inFlight.size > 0 ||
    ready.has(nextApplyOffset) ||
    canScheduleMore()
  ) {
    throwIfAborted(signal);

    while (scheduleOne()) {
      // добираем слоты (в т.ч. после снижения concurrency слоты уже заняты)
    }

    if (!ready.has(nextApplyOffset)) {
      if (inFlight.size === 0) {
        break;
      }
      await waitForAnyInFlight();
      continue;
    }

    const result = ready.get(nextApplyOffset);
    ready.delete(nextApplyOffset);

    if (result.error) {
      throw result.error;
    }

    if (result.count != null) {
      total = result.count;
    }
    loaded += result.features.length;

    onPage?.(result.features, {
      offset: nextApplyOffset,
      loaded,
      total,
      endOfRecords: result.endOfRecords,
      truncated: false
    });
    onProgress?.({
      loaded,
      total,
      endOfRecords: result.endOfRecords,
      truncated: false
    });

    if (result.endOfRecords) {
      fetchLimit = nextApplyOffset;
      nextFetchOffset = Math.min(nextFetchOffset, fetchLimit);
      await drainInFlight();
      ready.clear();
      break;
    }

    nextApplyOffset += pageSize;

    if (nextApplyOffset >= offsetCap) {
      truncated = true;
      fetchLimit = nextApplyOffset;
      nextFetchOffset = Math.min(nextFetchOffset, fetchLimit);
      onProgress?.({ loaded, total, endOfRecords: true, truncated: true });
      await drainInFlight();
      ready.clear();
      break;
    }

    // Даём UI отрисовать прогресс между применёнными страницами.
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  throwIfAborted(signal);
  return { loaded, total, endOfRecords: true, truncated };
}
