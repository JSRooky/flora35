import { toInatSpatialRegion } from "../externalSources/regions";
import { mapObservationsToFeatures } from "./mapObservationToFeature";

/** Запросы к API iNaturalist — только загрузка и оценка объёма; карта и инструменты читают inatStore. */
const INAT_OBSERVATIONS_URL = "https://api.inaturalist.org/v1/observations";
export const INAT_PAGE_SIZE = 200;
export const INAT_MAP_UPDATE_PAGES = 4;
/** Пауза между страницами — лимит iNat ~60 req/min. */
export const INAT_PAGE_DELAY_MS = 1100;
export const INAT_API_RESULT_LIMIT = 10000;

const FETCH_RETRY_COUNT = 2;
const FETCH_RETRY_DELAY_MS = 700;

export const INAT_QUALITY_MODES = {
  RESEARCH: "research",
  CASUAL: "casual",
  ALL: "all"
};

export function isInatAbortError(error, signal) {
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

export function getInatNetworkErrorMessage(error) {
  const message = error?.message || "";
  if (
    error?.name === "TypeError" ||
    /failed to fetch|networkerror|load failed|network request failed/i.test(message)
  ) {
    return "Не удалось связаться с iNaturalist. Проверьте интернет и попробуйте ещё раз.";
  }

  return message || "Не удалось загрузить данные iNaturalist";
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
 * Собирает query-параметры Observations API для региона.
 * qualityGrade: research | casual | all (без фильтра quality_grade).
 */
export function buildObservationSearchParams(region, { qualityGrade = INAT_QUALITY_MODES.RESEARCH, page = 1, perPage = INAT_PAGE_SIZE, extras = {} } = {}) {
  const spatial = toInatSpatialRegion(region);
  if (!spatial) {
    throw new Error(`Region "${region?.id}" has no iNaturalist spatial filter`);
  }

  const params = new URLSearchParams();
  params.append("has[]", "geo");

  if (spatial.placeId != null) {
    params.set("place_id", String(spatial.placeId));
  } else if (spatial.bbox) {
    const [west, south, east, north] = spatial.bbox;
    params.set("swlat", String(south));
    params.set("swlng", String(west));
    params.set("nelat", String(north));
    params.set("nelng", String(east));
  } else {
    throw new Error(`Region "${region.id}" has no iNaturalist placeId or bbox`);
  }

  if (qualityGrade && qualityGrade !== INAT_QUALITY_MODES.ALL) {
    params.set("quality_grade", qualityGrade);
  }

  params.set("page", String(page));
  params.set("per_page", String(perPage));

  Object.entries(extras).forEach(([key, value]) => {
    if (value == null || value === "") {
      return;
    }

    if (key === "iconicTaxa") {
      const values = Array.isArray(value) ? value : [value];
      values.forEach((taxon) => {
        if (taxon != null && taxon !== "") {
          params.append("iconic_taxa[]", String(taxon));
        }
      });
      return;
    }

    if (key === "year" || key === "month") {
      params.set(key, String(value));
      return;
    }

    params.set(key, String(value));
  });

  return params;
}

export async function fetchObservationPage(params, { signal } = {}) {
  const url = `${INAT_OBSERVATIONS_URL}?${params.toString()}`;
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
        throw new Error(`iNaturalist API error: ${response.status} ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      if (isInatAbortError(error, signal)) {
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

export async function previewObservationCount(
  region,
  { signal, qualityGrade = INAT_QUALITY_MODES.RESEARCH, extras = {} } = {}
) {
  const params = buildObservationSearchParams(region, {
    qualityGrade,
    page: 1,
    perPage: 1,
    extras
  });
  const page = await fetchObservationPage(params, { signal });
  return typeof page.total_results === "number" ? page.total_results : null;
}

export function withInatUpdateSinceExtras(extras = {}, syncedAt) {
  if (!syncedAt) {
    return extras;
  }

  const date = syncedAt instanceof Date ? syncedAt : new Date(syncedAt);
  if (Number.isNaN(date.getTime())) {
    return extras;
  }

  return {
    ...extras,
    updated_since: date.toISOString()
  };
}

/**
 * Постранично загружает наблюдения для региона.
 * onPage(features) — инкрементально; onProgress({ loaded, total, endOfRecords }).
 */
export async function loadObservationsForRegion(
  region,
  {
    signal,
    onPage,
    onProgress,
    pageSize = INAT_PAGE_SIZE,
    qualityGrade = INAT_QUALITY_MODES.RESEARCH,
    extras = {},
    pageDelayMs = INAT_PAGE_DELAY_MS
  } = {}
) {
  let page = 1;
  let loaded = 0;
  let total = null;
  let endOfRecords = false;
  let truncated = false;

  while (!endOfRecords) {
    if (signal?.aborted) {
      const abortError = new Error("Aborted");
      abortError.name = "AbortError";
      throw abortError;
    }

    const params = buildObservationSearchParams(region, {
      qualityGrade,
      page,
      perPage: pageSize,
      extras
    });

    const response = await fetchObservationPage(params, { signal });
    const features = mapObservationsToFeatures(response.results ?? []);

    loaded += features.length;
    total = typeof response.total_results === "number" ? response.total_results : total;

    const totalPages =
      total != null && pageSize > 0 ? Math.ceil(Math.min(total, INAT_API_RESULT_LIMIT) / pageSize) : null;
    endOfRecords =
      !(response.results?.length) ||
      (totalPages != null && page >= totalPages) ||
      loaded >= INAT_API_RESULT_LIMIT;

    if (loaded >= INAT_API_RESULT_LIMIT && total != null && total > INAT_API_RESULT_LIMIT) {
      truncated = true;
    }

    onPage?.(features, { page, loaded, total, endOfRecords, truncated });
    onProgress?.({ loaded, total, endOfRecords, truncated });

    if (endOfRecords) {
      break;
    }

    page += 1;

    if (page * pageSize > INAT_API_RESULT_LIMIT) {
      truncated = true;
      onProgress?.({ loaded, total, endOfRecords: true, truncated: true });
      break;
    }

    await wait(pageDelayMs, signal);
  }

  if (loaded >= INAT_API_RESULT_LIMIT && total != null && total > INAT_API_RESULT_LIMIT) {
    truncated = true;
  }

  return { loaded, total, endOfRecords: true, truncated };
}
