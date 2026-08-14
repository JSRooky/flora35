import { previewOccurrenceCount } from "../gbif/gbifClient";
import { GBIF_KINGDOMS, buildTaxonSearchExtras } from "../gbif/taxonFilters";
import {
  INAT_QUALITY_MODES,
  previewObservationCount
} from "../inaturalist/inatClient";
import { toGbifSpatialRegion, toInatSpatialRegion } from "./regions";

/** Оценка среднего размера одной точки в колоночном снимке IndexedDB. */
export const AVG_EXTERNAL_FEATURE_BYTES = 120;

const PREVIEW_CONCURRENCY = 4;
/** iNat ~60 req/min — ниже параллелизм и пауза между запросами. */
const INAT_PREVIEW_CONCURRENCY = 2;
const INAT_PREVIEW_DELAY_MS = 600;

export const KINGDOM_TO_INAT_ICONIC = {
  plantae: "Plantae",
  animalia: "Animalia",
  fungi: "Fungi",
  protozoa: "Protozoa"
};

/**
 * @typedef {{
 *   plantae: number | null,
 *   animalia: number | null,
 *   fungi: number | null,
 *   protozoa: number | null,
 *   total: number | null,
 *   bytes: number | null,
 *   status: "idle" | "loading" | "ready" | "error" | "unavailable",
 *   error?: string | null
 * }} RegionKingdomPreview
 */

function emptyPreview() {
  return {
    plantae: null,
    animalia: null,
    fungi: null,
    protozoa: null,
    total: null,
    bytes: null,
    status: "idle",
    error: null
  };
}

function sumKnownCounts(preview) {
  let sum = 0;
  let any = false;
  for (const kingdom of GBIF_KINGDOMS) {
    const value = preview[kingdom.id];
    if (typeof value === "number") {
      sum += value;
      any = true;
    }
  }
  return any ? sum : null;
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

function kingdomsForPreview(taxonKingdomId) {
  if (!taxonKingdomId) {
    return GBIF_KINGDOMS;
  }
  const match = GBIF_KINGDOMS.find((item) => item.id === taxonKingdomId);
  return match ? [match] : GBIF_KINGDOMS;
}

function mergeTaxonExtras(baseExtras, taxonExtras) {
  if (!taxonExtras || typeof taxonExtras !== "object") {
    return baseExtras;
  }
  return { ...baseExtras, ...taxonExtras };
}

async function fetchGbifRegionPreview(region, { signal, onRegion, taxonExtras, taxonKingdomId }) {
  const preview = emptyPreview();
  preview.status = "loading";
  onRegion?.(region.id, { ...preview });

  const spatial = toGbifSpatialRegion(region);
  if (!spatial) {
    preview.status = "error";
    preview.error = "Нет GADM-идентификатора";
    onRegion?.(region.id, { ...preview });
    return;
  }

  try {
    for (const kingdom of kingdomsForPreview(taxonKingdomId)) {
      if (signal?.aborted) {
        return;
      }

      const count = await previewOccurrenceCount(spatial, {
        signal,
        extras: mergeTaxonExtras(buildTaxonSearchExtras({ kingdomId: kingdom.id }), taxonExtras)
      });
      preview[kingdom.id] = typeof count === "number" ? count : null;
      preview.total = sumKnownCounts(preview);
      preview.bytes =
        preview.total != null ? preview.total * AVG_EXTERNAL_FEATURE_BYTES : null;
      onRegion?.(region.id, { ...preview, status: "loading" });
    }

    preview.status = "ready";
    preview.error = null;
    onRegion?.(region.id, { ...preview });
  } catch (error) {
    if (signal?.aborted) {
      return;
    }
    preview.status = "error";
    preview.error = error?.message || "Ошибка оценки";
    onRegion?.(region.id, { ...preview });
  }
}

async function fetchInatRegionPreview(region, { signal, onRegion, taxonExtras, taxonKingdomId }) {
  const preview = emptyPreview();
  preview.status = "loading";
  onRegion?.(region.id, { ...preview });

  const spatial = toInatSpatialRegion(region);
  if (!spatial) {
    preview.status = "unavailable";
    preview.error = "Нет placeId iNaturalist";
    onRegion?.(region.id, { ...preview });
    return;
  }

  try {
    const hasTaxonId = taxonExtras?.taxon_id != null && taxonExtras.taxon_id !== "";
    const kingdoms = hasTaxonId
      ? kingdomsForPreview(taxonKingdomId).slice(0, taxonKingdomId ? undefined : 1)
      : kingdomsForPreview(taxonKingdomId);
    for (const kingdom of kingdoms) {
      if (signal?.aborted) {
        return;
      }

      const iconic = KINGDOM_TO_INAT_ICONIC[kingdom.id];
      const extras = hasTaxonId
        ? { ...taxonExtras }
        : mergeTaxonExtras(iconic ? { iconicTaxa: iconic } : {}, taxonExtras);
      const count = await previewObservationCount(spatial, {
        signal,
        qualityGrade: INAT_QUALITY_MODES.RESEARCH,
        extras
      });
      preview[kingdom.id] = typeof count === "number" ? count : null;
      preview.total = sumKnownCounts(preview);
      preview.bytes =
        preview.total != null ? preview.total * AVG_EXTERNAL_FEATURE_BYTES : null;
      onRegion?.(region.id, { ...preview, status: "loading" });
      await wait(INAT_PREVIEW_DELAY_MS, signal);
    }

    preview.status = "ready";
    preview.error = null;
    onRegion?.(region.id, { ...preview });
  } catch (error) {
    if (signal?.aborted || error?.name === "AbortError") {
      return;
    }
    preview.status = "error";
    preview.error = error?.message || "Ошибка оценки";
    onRegion?.(region.id, { ...preview });
  }
}

/**
 * Оценивает число находок по царствам для списка регионов.
 * @param {object[]} regions
 * @param {{
 *   source?: "gbif" | "inat",
 *   signal?: AbortSignal,
 *   onRegion?: (regionId: string, preview: RegionKingdomPreview) => void
 * }} [options]
 */
export async function fetchRegionKingdomPreviews(
  regions,
  { source = "gbif", signal, onRegion, taxonExtras = null, taxonKingdomId = null } = {}
) {
  const list = Array.isArray(regions) ? regions : [];
  let cursor = 0;
  const concurrency =
    source === "inat"
      ? Math.min(INAT_PREVIEW_CONCURRENCY, Math.max(1, list.length))
      : Math.min(PREVIEW_CONCURRENCY, Math.max(1, list.length));
  const fetchOne = source === "inat" ? fetchInatRegionPreview : fetchGbifRegionPreview;

  async function worker() {
    while (cursor < list.length) {
      if (signal?.aborted) {
        return;
      }

      const index = cursor;
      cursor += 1;
      const region = list[index];
      if (!region) {
        continue;
      }

      await fetchOne(region, { signal, onRegion, taxonExtras, taxonKingdomId });
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);
}

export function createEmptyRegionPreviewMap(regions) {
  const map = {};
  (regions ?? []).forEach((region) => {
    map[region.id] = emptyPreview();
  });
  return map;
}

function emptyTaxonCount() {
  return { count: null, status: "idle", error: null };
}

async function fetchOneRegionTaxonCount(region, { source, extras, signal }) {
  if (source === "inat") {
    const spatial = toInatSpatialRegion(region);
    if (!spatial) {
      return { count: null, status: "unavailable", error: "Нет placeId iNaturalist" };
    }
    const count = await previewObservationCount(spatial, {
      signal,
      qualityGrade: INAT_QUALITY_MODES.RESEARCH,
      extras
    });
    return {
      count: typeof count === "number" ? count : null,
      status: "ready",
      error: null
    };
  }

  const spatial = toGbifSpatialRegion(region);
  if (!spatial) {
    return { count: null, status: "error", error: "Нет GADM-идентификатора" };
  }
  const count = await previewOccurrenceCount(spatial, { signal, extras });
  return {
    count: typeof count === "number" ? count : null,
    status: "ready",
    error: null
  };
}

/**
 * Одна оценка на регион для выбранного таксона (без разбивки по царствам).
 */
export async function fetchRegionTaxonCounts(
  regions,
  { source = "gbif", extras = {}, signal, onRegion } = {}
) {
  const list = Array.isArray(regions) ? regions : [];
  let cursor = 0;
  const concurrency =
    source === "inat"
      ? Math.min(INAT_PREVIEW_CONCURRENCY, Math.max(1, list.length))
      : Math.min(PREVIEW_CONCURRENCY, Math.max(1, list.length));

  async function worker() {
    while (cursor < list.length) {
      if (signal?.aborted) {
        return;
      }

      const index = cursor;
      cursor += 1;
      const region = list[index];
      if (!region) {
        continue;
      }

      onRegion?.(region.id, { ...emptyTaxonCount(), status: "loading" });
      try {
        const result = await fetchOneRegionTaxonCount(region, { source, extras, signal });
        if (signal?.aborted) {
          return;
        }
        onRegion?.(region.id, result);
        if (source === "inat") {
          await wait(INAT_PREVIEW_DELAY_MS, signal);
        }
      } catch (error) {
        if (signal?.aborted || error?.name === "AbortError") {
          return;
        }
        onRegion?.(region.id, {
          count: null,
          status: "error",
          error: error?.message || "Ошибка оценки"
        });
      }
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);
}

export function createEmptyRegionTaxonCountMap(regions) {
  const map = {};
  (regions ?? []).forEach((region) => {
    map[region.id] = emptyTaxonCount();
  });
  return map;
}

