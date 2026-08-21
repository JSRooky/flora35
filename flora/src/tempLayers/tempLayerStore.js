import { stampFeatureRegionIds } from "../externalSources/regionVisibility";
import { getExternalRegionById } from "../externalSources/regions";
import { TEMP_LAYER_MARKER_PALETTE } from "./tempLayerPalette";

export { TEMP_LAYER_MARKER_PALETTE } from "./tempLayerPalette";

const listeners = new Set();

function cloneFeature(feature) {
  try {
    return JSON.parse(JSON.stringify(feature));
  } catch {
    return {
      type: "Feature",
      id: feature?.id,
      geometry: feature?.geometry ?? null,
      properties: { ...(feature?.properties ?? {}) }
    };
  }
}

function cloneJson(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return null;
  }
}

function normalizeOverlays(raw) {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((entry) => {
      const features = (Array.isArray(entry?.features) ? entry.features : [])
        .map((feature) => cloneJson(feature))
        .filter((feature) => feature?.geometry);
      if (!features.length) {
        return null;
      }
      return {
        kind: String(entry?.kind || "shape"),
        label: String(entry?.label || "").trim() || "Фигура",
        features
      };
    })
    .filter(Boolean);
}

function cloneSnapshotFeature(feature) {
  const cloned = cloneFeature(feature);
  if (!cloned.properties) {
    cloned.properties = {};
  }
  delete cloned.properties.temp_layer_id;
  delete cloned.properties.temp_marker_color;
  return cloned;
}

function cloneFeatures(features) {
  return (features ?? []).map((feature) => cloneFeature(feature));
}

function featureStableKey(feature) {
  const properties = feature?.properties ?? {};
  if (properties.gbif_key != null && properties.gbif_key !== "") {
    return `gbif:${properties.gbif_key}`;
  }
  if (properties.inat_id != null && properties.inat_id !== "") {
    return `inat:${properties.inat_id}`;
  }
  if (feature?.id != null && feature.id !== "") {
    return String(feature.id);
  }
  return "";
}

export const TEMP_SOURCE_IDS = {
  GBIF: "gbif",
  INAT: "inat",
  MAP: "map",
  REGIONS: "regions"
};

export const TEMP_SOURCE_TINTS = {
  [TEMP_SOURCE_IDS.GBIF]: "#3b82f6",
  [TEMP_SOURCE_IDS.INAT]: "#22c55e",
  [TEMP_SOURCE_IDS.MAP]: "#6b7280"
};

export function normalizeTempSource(source) {
  if (source === TEMP_SOURCE_IDS.REGIONS || source === "regions") {
    return TEMP_SOURCE_IDS.REGIONS;
  }
  if (source === "inat" || source === "inaturalist") {
    return TEMP_SOURCE_IDS.INAT;
  }
  if (source === TEMP_SOURCE_IDS.MAP || source === "local" || source === "merged") {
    return TEMP_SOURCE_IDS.MAP;
  }
  return TEMP_SOURCE_IDS.GBIF;
}

export function formatTempSourceLabel(source) {
  const normalized = normalizeTempSource(source);
  if (normalized === TEMP_SOURCE_IDS.INAT) {
    return "iNat";
  }
  if (normalized === TEMP_SOURCE_IDS.MAP) {
    return "Карта";
  }
  if (normalized === TEMP_SOURCE_IDS.REGIONS) {
    return "Регионы";
  }
  return "GBIF";
}

function parseHexRgb(hex) {
  const value = String(hex || "").replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(value)) {
    return null;
  }
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16)
  ];
}

function toHexRgb(r, g, b) {
  return `#${[r, g, b]
    .map((channel) =>
      Math.max(0, Math.min(255, Math.round(channel)))
        .toString(16)
        .padStart(2, "0")
    )
    .join("")}`;
}

function mixHex(left, right, amount) {
  const a = parseHexRgb(left);
  const b = parseHexRgb(right);
  if (!a || !b) {
    return normalizeTempLayerMarkerColor(left) || normalizeTempLayerMarkerColor(right);
  }
  const t = Math.max(0, Math.min(1, amount));
  return toHexRgb(
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t
  );
}

function shadeHex(hex, amount) {
  if (amount === 0) {
    return hex;
  }
  return mixHex(hex, amount > 0 ? "#ffffff" : "#000000", Math.abs(amount));
}

/** Цвет маркеров источника: чуть отличается от цвета плашки. */
export function resolveTempSourceMarkerColor(baseColor, source) {
  const src = normalizeTempSource(source);
  const tint = TEMP_SOURCE_TINTS[src];
  const mixed = baseColor ? mixHex(baseColor, tint, 0.3) : tint;
  return src === TEMP_SOURCE_IDS.INAT ? shadeHex(mixed, 0.1) : shadeHex(mixed, -0.12);
}

function createEmptyStaging() {
  return {
    source: null,
    taxonKey: null,
    taxonName: null,
    taxonMode: null,
    gbifTaxonKey: null,
    familyKey: null,
    inatTaxonId: null,
    taxonKeys: [],
    regionIds: [],
    features: [],
    keys: new Set()
  };
}

let staging = createEmptyStaging();

const HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{6})$/;

export function normalizeTempLayerMarkerColor(color) {
  if (typeof color !== "string") {
    return null;
  }
  const value = color.trim();
  return HEX_COLOR_RE.test(value) ? value.toLowerCase() : null;
}

/** @type {Array<{
 *   id: string,
 *   label: string,
 *   source: string,
 *   groupKey: string,
 *   taxonName: string,
 *   taxonMode: string | null,
 *   taxonKey: string | null,
 *   familyKey: string | null,
 *   inatTaxonId: string | number | null,
 *   regionIds: string[],
 *   createdAt: string,
 *   visible: boolean,
 *   heatmapEnabled: boolean,
 *   markerColor: string | null,
 *   features: object[]
 * }>} */
let layers = [];

function emit() {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // подписчик не должен ломать остальных
    }
  });
}

export function isRegionTempLayer(layer) {
  return layer?.kind === "regions" || layer?.source === TEMP_SOURCE_IDS.REGIONS;
}

export function getRegionOverlayFeatureIso(feature, fallbackIndex = 0) {
  const properties = feature?.properties ?? {};
  const iso = properties.iso || properties.ISO_1 || properties.shapeISO;
  if (iso != null && String(iso).trim() !== "") {
    return String(iso);
  }
  return `overlay-${fallbackIndex}`;
}

export function isRegionOverlayBufferFeature(feature) {
  return feature?.properties?.overlayRole === "buffer";
}

function layerHasRegionOverlays(layer) {
  return (Array.isArray(layer?.overlays) ? layer.overlays : []).some(
    (overlay) => overlay?.kind === "regions"
  );
}

function restyleRegionOverlayFeature(feature, index, { style, featureColors }) {
  const iso = getRegionOverlayFeatureIso(feature, index);
  let color = feature?.properties?.color;
  if (featureColors === null) {
    color = style?.fillColor || color;
  } else if (featureColors && featureColors[iso]) {
    color = featureColors[iso];
  } else if (style?.fillColor && !color) {
    color = style.fillColor;
  }
  return {
    ...feature,
    properties: {
      ...(feature?.properties ?? {}),
      iso,
      overlayRole: "region",
      color,
      fillOpacity: style?.fillOpacity ?? feature?.properties?.fillOpacity
    }
  };
}

/** Полигоны регионов с видимых временных слоёв (без кольца буфера). */
export function listVisibleRegionOverlayPolygons() {
  const features = [];
  const seenGroups = new Set();
  layers.forEach((layer) => {
    if (!layer.visible || !layerHasRegionOverlays(layer)) {
      return;
    }
    const key = layerGroupKey(layer);
    if (seenGroups.has(key)) {
      return;
    }
    seenGroups.add(key);
    normalizeOverlays(layer.overlays).forEach((overlay) => {
      if (overlay.kind !== "regions") {
        return;
      }
      overlay.features.forEach((feature, index) => {
        if (isRegionOverlayBufferFeature(feature)) {
          return;
        }
        const type = feature?.geometry?.type;
        if (type !== "Polygon" && type !== "MultiPolygon") {
          return;
        }
        features.push(restyleRegionOverlayFeature(feature, features.length + index, {}));
      });
    });
  });
  return features;
}

export function getVisibleRegionOverlayEditState() {
  const features = listVisibleRegionOverlayPolygons();
  if (!features.length) {
    return {
      active: false,
      features: [],
      isos: [],
      style: null,
      featureColors: null,
      bufferKm: 0
    };
  }

  const layer = layers.find((item) => item.visible && layerHasRegionOverlays(item));
  const isos = [...new Set(features.map((feature) => String(feature.properties?.iso || "")))].filter(
    Boolean
  );
  return {
    active: true,
    features,
    isos,
    style: layer?.regionStyle && typeof layer.regionStyle === "object" ? layer.regionStyle : null,
    featureColors:
      layer?.regionFeatureColors && typeof layer.regionFeatureColors === "object"
        ? layer.regionFeatureColors
        : null,
    bufferKm: Number.isFinite(Number(layer?.bufferKm)) ? Number(layer.bufferKm) : 0
  };
}

/** Заливка, обводка и буфер — сразу на все видимые временные слои с регионами. */
export function patchVisibleRegionOverlays({ style, featureColors, bufferKm } = {}) {
  const nextStyle = style && typeof style === "object" ? style : undefined;
  const nextColors = featureColors;
  const nextBuffer = bufferKm === undefined ? undefined : Number(bufferKm) || 0;
  let changed = false;

  layers = layers.map((layer) => {
    if (!layer.visible || !layerHasRegionOverlays(layer)) {
      return layer;
    }
    changed = true;
    const overlays = normalizeOverlays(layer.overlays).map((overlay) => {
      if (overlay.kind !== "regions") {
        return overlay;
      }
      let features = overlay.features.filter((feature) => !isRegionOverlayBufferFeature(feature));
      if (nextStyle !== undefined || nextColors !== undefined) {
        features = features.map((feature, index) =>
          restyleRegionOverlayFeature(feature, index, {
            style: nextStyle ?? layer.regionStyle,
            featureColors: nextColors === undefined ? layer.regionFeatureColors : nextColors
          })
        );
      }
      return { ...overlay, features };
    });
    return {
      ...layer,
      overlays,
      regionStyle: nextStyle ?? layer.regionStyle,
      regionFeatureColors: nextColors === undefined ? layer.regionFeatureColors : nextColors,
      bufferKm: nextBuffer === undefined ? layer.bufferKm : nextBuffer
    };
  });

  if (changed) {
    emit();
  }
  return changed;
}

export function subscribeTempLayers(listener) {
  listeners.add(listener);
  listener();
  return () => listeners.delete(listener);
}

export function getTempLayers() {
  return layers;
}

export function getTempLayerStaging() {
  return staging;
}

export function getTempLayerStagingCount() {
  return staging.features.length;
}

export function getTempTaxonGroupKey(input = {}) {
  const taxonKeys = Array.isArray(input.taxonKeys)
    ? [...new Set(input.taxonKeys.map(String).filter(Boolean))].sort()
    : [];
  const taxonKey =
    input.gbifTaxonKey ?? input.taxonKey ?? "";
  const familyKey = input.familyKey ?? "";
  const inatTaxonId = input.inatTaxonId ?? "";
  const name = String(input.taxonName || input.scientificName || "").trim().toLowerCase();
  const mode = String(input.taxonMode || input.mode || "");
  if (taxonKeys.length > 1) {
    return `taxa:${mode}:${taxonKeys.join(",")}`;
  }
  if (taxonKey !== "" && taxonKey != null) {
    return `taxon:${mode}:${taxonKey}`;
  }
  if (familyKey !== "" && familyKey != null) {
    return `family:${mode}:${familyKey}`;
  }
  if (inatTaxonId !== "" && inatTaxonId != null) {
    return `inat:${inatTaxonId}`;
  }
  if (name) {
    return `name:${name}`;
  }
  return "";
}

function layerGroupKey(layer) {
  return layer?.groupKey || getTempTaxonGroupKey(layer) || `id:${layer?.id}`;
}

function taxonFingerprint(source, taxon) {
  if (!taxon) {
    return null;
  }
  return [
    normalizeTempSource(source),
    taxon.mode ?? "",
    taxon.taxonKey ?? "",
    taxon.familyKey ?? "",
    taxon.inatTaxonId ?? "",
    taxon.scientificName ?? ""
  ].join("|");
}

export function prepareTempLayerStaging({ source, taxon, bundleKey } = {}) {
  const nextKey = bundleKey || taxonFingerprint(source, taxon);
  if (staging.taxonKey && staging.taxonKey !== nextKey) {
    staging = createEmptyStaging();
  }

  staging.source = normalizeTempSource(source ?? staging.source);
  staging.taxonKey = nextKey;
  staging.taxonName = taxon?.scientificName ?? staging.taxonName;
  staging.taxonMode = taxon?.mode ?? staging.taxonMode;
  staging.gbifTaxonKey = taxon?.taxonKey ?? staging.gbifTaxonKey;
  staging.familyKey = taxon?.familyKey ?? staging.familyKey;
  staging.inatTaxonId = taxon?.inatTaxonId ?? staging.inatTaxonId;
  if (Array.isArray(taxon?.taxonKeys) && taxon.taxonKeys.length) {
    staging.taxonKeys = taxon.taxonKeys;
  }
}

export function upsertTempLayerStagingFeatures(features, regionId) {
  if (!Array.isArray(features) || features.length === 0) {
    if (regionId && !staging.regionIds.includes(regionId)) {
      staging.regionIds = [...staging.regionIds, regionId];
    }
    return { added: 0 };
  }

  stampFeatureRegionIds(features, regionId);
  let added = 0;

  features.forEach((feature) => {
    const key = featureStableKey(feature);
    if (!key || staging.keys.has(key)) {
      return;
    }
    staging.keys.add(key);
    staging.features.push(feature);
    added += 1;
  });

  if (regionId && !staging.regionIds.includes(regionId)) {
    staging.regionIds = [...staging.regionIds, regionId];
  }

  return { added };
}

export function clearTempLayerStaging() {
  staging = createEmptyStaging();
  emit();
}

function sourceLabel(source) {
  const normalized = normalizeTempSource(source);
  if (normalized === TEMP_SOURCE_IDS.INAT) {
    return "iNaturalist";
  }
  if (normalized === TEMP_SOURCE_IDS.MAP) {
    return "Карта";
  }
  if (normalized === TEMP_SOURCE_IDS.REGIONS) {
    return "Регионы";
  }
  return "GBIF";
}

function normalizeFilterSnapshot(snapshot) {
  if (!Array.isArray(snapshot)) {
    return [];
  }
  return snapshot
    .map((entry) => {
      const label = String(entry?.label || "").trim();
      if (!label) {
        return null;
      }
      const details = Array.isArray(entry?.details)
        ? entry.details.map((item) => String(item || "").trim()).filter(Boolean)
        : [];
      return {
        id: String(entry?.id || ""),
        label,
        details
      };
    })
    .filter(Boolean);
}

export function listTempLayerOriginItems({
  filterSnapshot,
  overlays,
  taxonName,
  layers: plaqueLayers
} = {}) {
  const items = [];
  normalizeFilterSnapshot(filterSnapshot).forEach((entry) => {
    items.push({
      label: entry.label,
      details: entry.details
    });
  });
  (overlays || []).forEach((overlay) => {
    const label = String(overlay?.label || "").trim();
    if (label && !items.some((item) => item.label === label)) {
      items.push({ label, details: [] });
    }
  });
  if (items.length > 0) {
    return items;
  }
  if (taxonName) {
    items.push({ label: taxonName, details: [] });
  }
  const regionIds = new Set();
  (plaqueLayers || []).forEach((layer) => {
    (layer.regionIds || []).forEach((id) => regionIds.add(id));
  });
  if (regionIds.size === 1) {
    items.push({ label: "1 регион", details: [] });
  } else if (regionIds.size > 1) {
    items.push({ label: `${regionIds.size} регионов`, details: [] });
  }
  return items;
}

function classifySnapshotSource(feature) {
  const inferred = inferFeatureTempSource(feature);
  if (inferred === TEMP_SOURCE_IDS.INAT) {
    return TEMP_SOURCE_IDS.INAT;
  }
  if (inferred === TEMP_SOURCE_IDS.GBIF) {
    return TEMP_SOURCE_IDS.GBIF;
  }
  return TEMP_SOURCE_IDS.MAP;
}

function formatSnapshotDate(iso) {
  const date = iso ? new Date(iso) : new Date();
  const safe = Number.isNaN(date.getTime()) ? new Date() : date;
  const day = String(safe.getDate()).padStart(2, "0");
  const month = String(safe.getMonth() + 1).padStart(2, "0");
  return `${day}.${month}.${safe.getFullYear()}`;
}

const DATED_SNAPSHOT_LABEL = /^(\d{2}\.\d{2}\.\d{4}) · (\d{3})$/;

function collectUsedSnapshotSerials(dateLabel) {
  const used = new Set();
  const remember = (text) => {
    const match = DATED_SNAPSHOT_LABEL.exec(String(text || "").trim());
    if (match && match[1] === dateLabel) {
      used.add(match[2]);
    }
  };

  layers.forEach((layer) => {
    remember(layer.label);
    remember(layer.taxonName);
  });
  archiveIndex.forEach((entry) => remember(entry.title));
  return used;
}

function allocateSnapshotSerial(dateLabel) {
  const used = collectUsedSnapshotSerials(dateLabel);
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    const serial = String(Math.floor(Math.random() * 1000)).padStart(3, "0");
    if (!used.has(serial)) {
      return serial;
    }
  }
  for (let index = 0; index < 1000; index += 1) {
    const serial = String(index).padStart(3, "0");
    if (!used.has(serial)) {
      return serial;
    }
  }
  return String(Date.now() % 1000).padStart(3, "0");
}

function buildDatedSnapshotLabel(createdAt) {
  const dateLabel = formatSnapshotDate(createdAt);
  return `${dateLabel} · ${allocateSnapshotSerial(dateLabel)}`;
}

function buildLayerLabel({ source, taxonName, regionIds }) {
  const parts = [];
  if (taxonName) {
    parts.push(taxonName);
  } else {
    parts.push(sourceLabel(source));
  }
  if (regionIds.length === 1) {
    const region = getExternalRegionById(regionIds[0]);
    if (region?.label) {
      parts.push(region.label);
    }
  } else if (regionIds.length > 1) {
    parts.push(`${regionIds.length} рег.`);
  }
  return parts.join(" · ");
}

function createLayerId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function commitTempLayerStaging() {
  if (staging.features.length === 0) {
    return null;
  }

  const source = normalizeTempSource(staging.source);
  const groupKey =
    getTempTaxonGroupKey({
      taxonKey: staging.gbifTaxonKey,
      familyKey: staging.familyKey,
      inatTaxonId: staging.inatTaxonId,
      taxonName: staging.taxonName,
      taxonMode: staging.taxonMode,
      taxonKeys: staging.taxonKeys
    }) || `id:${createLayerId()}`;
  const sibling = layers.find(
    (layer) => layerGroupKey(layer) === groupKey && normalizeTempSource(layer.source) !== source
  );
  const sameSource = layers.find(
    (layer) => layerGroupKey(layer) === groupKey && normalizeTempSource(layer.source) === source
  );
  const markerColor = sibling?.markerColor ?? sameSource?.markerColor ?? null;
  const taxonFields = {
    taxonName: staging.taxonName || sibling?.taxonName || "",
    taxonMode: staging.taxonMode ?? sibling?.taxonMode ?? null,
    taxonKey: staging.gbifTaxonKey ?? sibling?.taxonKey ?? null,
    familyKey: staging.familyKey ?? sibling?.familyKey ?? null,
    inatTaxonId: staging.inatTaxonId ?? sibling?.inatTaxonId ?? null,
    taxonKeys: staging.taxonKeys?.length ? staging.taxonKeys : sibling?.taxonKeys
  };

  if (sameSource) {
    const keys = new Set(sameSource.features.map((feature) => featureStableKey(feature)));
    const features = [...sameSource.features];
    staging.features.forEach((feature) => {
      const key = featureStableKey(feature);
      if (!key || keys.has(key)) {
        return;
      }
      keys.add(key);
      features.push(cloneFeatures([feature])[0]);
    });
    const regionIds = [...sameSource.regionIds];
    staging.regionIds.forEach((regionId) => {
      if (!regionIds.includes(regionId)) {
        regionIds.push(regionId);
      }
    });
    const merged = {
      ...sameSource,
      ...taxonFields,
      groupKey,
      source,
      markerColor,
      archiveId: sameSource.archiveId ?? sibling?.archiveId ?? null,
      regionIds,
      features,
      label: buildLayerLabel({ source, taxonName: taxonFields.taxonName, regionIds })
    };
    layers = layers.map((layer) => (layer.id === sameSource.id ? merged : { ...layer, groupKey: layerGroupKey(layer) === groupKey ? groupKey : layer.groupKey, markerColor: layerGroupKey(layer) === groupKey ? markerColor : layer.markerColor }));
    staging = createEmptyStaging();
    emit();
    return merged;
  }

  const regionIds = [...staging.regionIds];
  const layer = {
    id: createLayerId(),
    label: buildLayerLabel({ source, taxonName: taxonFields.taxonName, regionIds }),
    source,
    groupKey,
    ...taxonFields,
    regionIds,
    createdAt: new Date().toISOString(),
    visible: true,
    heatmapEnabled: sibling ? Boolean(sibling.heatmapEnabled) : false,
    markerColor,
    archiveId: sameSource?.archiveId ?? sibling?.archiveId ?? null,
    features: cloneFeatures(staging.features)
  };

  layers = layers.map((item) =>
    layerGroupKey(item) === groupKey ? { ...item, groupKey, markerColor } : item
  );
  layers = [layer, ...layers];
  staging = createEmptyStaging();
  emit();
  return layer;
}

/**
 * Сохраняет текущую отфильтрованную выборку карты во временный слой.
 * Точки с уже существующих временных слоёв тоже входят в снимок (без дублей).
 * Исходные временные слои скрываются, чтобы на карте осталась только выборка.
 */
export function createTempLayerFromFilterSnapshot({ features, filters, overlays } = {}) {
  const filterSnapshot = normalizeFilterSnapshot(filters);
  const overlaySnapshot = normalizeOverlays(overlays);
  const buckets = {
    [TEMP_SOURCE_IDS.GBIF]: [],
    [TEMP_SOURCE_IDS.INAT]: [],
    [TEMP_SOURCE_IDS.MAP]: []
  };
  const seen = new Set();

  (Array.isArray(features) ? features : []).forEach((feature) => {
    const key = featureStableKey(feature);
    if (key) {
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
    }
    const source = classifySnapshotSource(feature);
    buckets[source].push(cloneSnapshotFeature(feature));
  });

  const created = [];
  const groupKey = `filter:${createLayerId()}`;
  const createdAt = new Date().toISOString();
  const label = buildDatedSnapshotLabel(createdAt);

  [
    TEMP_SOURCE_IDS.GBIF,
    TEMP_SOURCE_IDS.INAT,
    TEMP_SOURCE_IDS.MAP
  ].forEach((source) => {
    const list = buckets[source];
    if (!list.length) {
      return;
    }
    created.push({
      id: createLayerId(),
      label,
      source,
      groupKey,
      taxonName: label,
      taxonMode: "filter-snapshot",
      taxonKey: null,
      familyKey: null,
      inatTaxonId: null,
      regionIds: [],
      createdAt,
      visible: true,
      heatmapEnabled: false,
      markerColor: null,
      archiveId: null,
      filterSnapshot,
      overlays: overlaySnapshot,
      features: list
    });
  });

  if (created.length === 0) {
    if (overlaySnapshot.length === 0) {
      return { ok: false, reason: "empty" };
    }
    created.push({
      id: createLayerId(),
      label,
      source: TEMP_SOURCE_IDS.MAP,
      groupKey,
      taxonName: label,
      taxonMode: "filter-snapshot",
      taxonKey: null,
      familyKey: null,
      inatTaxonId: null,
      regionIds: [],
      createdAt,
      visible: true,
      heatmapEnabled: false,
      markerColor: null,
      archiveId: null,
      filterSnapshot,
      overlays: overlaySnapshot,
      features: []
    });
  }

  const createdIds = new Set(created.map((layer) => layer.id));
  layers = [
    ...created,
    ...layers.map((layer) =>
      createdIds.has(layer.id) ? layer : { ...layer, visible: false }
    )
  ];
  emit();
  return { ok: true, layers: created };
}

function nextUnusedMarkerColor() {
  const used = new Set(
    layers.map((layer) => normalizeTempLayerMarkerColor(layer.markerColor)).filter(Boolean)
  );
  return TEMP_LAYER_MARKER_PALETTE.find((color) => !used.has(color)) ?? TEMP_LAYER_MARKER_PALETTE[0];
}

export function commitRegionSelectionTempLayer({
  label,
  isos = [],
  features = [],
  bufferKm = 0
} = {}) {
  const regionIds = [...new Set((isos ?? []).filter(Boolean).map(String))];
  const polygonFeatures = (features ?? []).filter((feature) => {
    const type = feature?.geometry?.type;
    return type === "Polygon" || type === "MultiPolygon";
  });
  if (regionIds.length === 0 || polygonFeatures.length === 0) {
    return null;
  }

  const id = createLayerId();
  const title = String(label || "").trim() || `Субъекты (${regionIds.length})`;
  const markerColor = nextUnusedMarkerColor();
  const overlayFeatures = cloneFeatures(polygonFeatures).map((feature) => ({
    ...feature,
    properties: {
      ...(feature.properties ?? {}),
      overlayRole: "region",
      color: markerColor,
      fillOpacity: 0.18
    }
  }));
  const layer = {
    id,
    kind: "regions",
    label: title,
    source: TEMP_SOURCE_IDS.REGIONS,
    groupKey: `regions:${id}`,
    taxonName: title,
    taxonMode: null,
    taxonKey: null,
    familyKey: null,
    inatTaxonId: null,
    regionIds,
    bufferKm: Number.isFinite(Number(bufferKm)) ? Number(bufferKm) : 0,
    createdAt: new Date().toISOString(),
    visible: true,
    heatmapEnabled: false,
    markerColor,
    archiveId: null,
    overlays: [
      {
        kind: "regions",
        label: title,
        features: overlayFeatures
      }
    ],
    features: []
  };
  layers = [layer, ...layers];
  emit();
  return layer;
}

function mergeUniqueFeatures(existing, incoming) {
  const keys = new Set(
    (existing ?? []).map((feature) => featureStableKey(feature)).filter(Boolean)
  );
  const features = [...(existing ?? [])];
  let added = 0;
  (incoming ?? []).forEach((feature) => {
    if (!feature?.geometry) {
      return;
    }
    const cloned = cloneSnapshotFeature(feature);
    const key = featureStableKey(cloned);
    if (key && keys.has(key)) {
      return;
    }
    if (key) {
      keys.add(key);
    }
    features.push(cloned);
    added += 1;
  });
  return { features, added };
}

function mergeRegionIds(existing, incoming) {
  const next = [...(existing ?? [])];
  (incoming ?? []).forEach((id) => {
    const value = id == null ? "" : String(id);
    if (value && !next.includes(value)) {
      next.push(value);
    }
  });
  return next;
}

function bucketFeaturesBySource(features) {
  const buckets = {
    [TEMP_SOURCE_IDS.GBIF]: [],
    [TEMP_SOURCE_IDS.INAT]: [],
    [TEMP_SOURCE_IDS.MAP]: []
  };
  (features ?? []).forEach((feature) => {
    if (!feature?.geometry) {
      return;
    }
    buckets[classifySnapshotSource(feature)].push(cloneSnapshotFeature(feature));
  });
  return buckets;
}

function createPointSourceLayer(base, source, features) {
  return {
    id: createLayerId(),
    kind: "points",
    label: base.label,
    source,
    groupKey: layerGroupKey(base),
    taxonName: base.taxonName,
    taxonMode: base.taxonMode ?? null,
    taxonKey: base.taxonKey ?? null,
    familyKey: base.familyKey ?? null,
    inatTaxonId: base.inatTaxonId ?? null,
    regionIds: [...(base.regionIds || [])],
    bufferKm: base.bufferKm ?? 0,
    createdAt: base.createdAt,
    visible: base.visible,
    heatmapEnabled: Boolean(base.heatmapEnabled),
    markerColor: base.markerColor ?? null,
    archiveId: base.archiveId ?? null,
    filterSnapshot: normalizeFilterSnapshot(base.filterSnapshot),
    overlays: [],
    features
  };
}

function mergeBucketsIntoPlaque(base, buckets, regionIds) {
  const groupKey = layerGroupKey(base);
  let nextLayers = [...layers];
  let added = 0;

  [TEMP_SOURCE_IDS.GBIF, TEMP_SOURCE_IDS.INAT, TEMP_SOURCE_IDS.MAP].forEach((source) => {
    const incoming = buckets[source] ?? [];
    if (incoming.length === 0) {
      return;
    }
    const existing = nextLayers.find(
      (layer) =>
        !isRegionTempLayer(layer) &&
        !layerHasRegionOverlays(layer) &&
        layerGroupKey(layer) === groupKey &&
        normalizeTempSource(layer.source) === source
    );
    if (existing) {
      const merged = mergeUniqueFeatures(existing.features, incoming);
      added += merged.added;
      nextLayers = nextLayers.map((layer) =>
        layer.id === existing.id
          ? {
              ...layer,
              regionIds: mergeRegionIds(layer.regionIds, regionIds),
              features: merged.features
            }
          : layer
      );
      return;
    }
    added += incoming.length;
    nextLayers = [
      createPointSourceLayer(
        { ...base, regionIds: mergeRegionIds(base.regionIds, regionIds) },
        source,
        mergeUniqueFeatures([], incoming).features
      ),
      ...nextLayers
    ];
  });

  nextLayers = nextLayers.map((layer) => {
    if (layer.id !== base.id) {
      return layer;
    }
    return {
      ...layer,
      regionIds: mergeRegionIds(layer.regionIds, regionIds),
      features: []
    };
  });

  layers = nextLayers;
  return added;
}

function explodeMixedRegionPointLayers(list) {
  const extra = [];
  const next = (list ?? []).map((layer) => {
    const holdsRegionOverlay = isRegionTempLayer(layer) || layerHasRegionOverlays(layer);
    if (!holdsRegionOverlay || !(layer.features?.length > 0)) {
      return layer;
    }
    const buckets = bucketFeaturesBySource(layer.features);
    [TEMP_SOURCE_IDS.GBIF, TEMP_SOURCE_IDS.INAT, TEMP_SOURCE_IDS.MAP].forEach((source) => {
      if (!buckets[source].length) {
        return;
      }
      extra.push(createPointSourceLayer(layer, source, buckets[source]));
    });
    return { ...layer, features: [] };
  });
  return extra.length > 0 ? [...extra, ...next] : list;
}

/**
 * Кладёт точки в видимый временный слой с контурами регионов.
 * Если такого слоя нет, создаёт его из переданных overlays.
 */
export function saveFeaturesIntoRegionOverlayTempLayer({
  features = [],
  overlays = [],
  regionIds = [],
  label
} = {}) {
  const incoming = Array.isArray(features) ? features.filter((feature) => feature?.geometry) : [];
  if (incoming.length === 0) {
    return { ok: false, reason: "empty" };
  }

  layers = explodeMixedRegionPointLayers(layers);
  const buckets = bucketFeaturesBySource(incoming);
  const target = layers.find((layer) => layer.visible && layerHasRegionOverlays(layer));
  if (target) {
    const added = mergeBucketsIntoPlaque(target, buckets, regionIds);
    emit();
    return { ok: true, appended: true, added, layer: target };
  }

  const overlaySnapshot = normalizeOverlays(overlays);
  if (overlaySnapshot.length === 0) {
    return { ok: false, reason: "no-overlay" };
  }

  const id = createLayerId();
  const createdAt = new Date().toISOString();
  const title = String(label || "").trim() || overlaySnapshot[0]?.label || "Регионы";
  const markerColor = nextUnusedMarkerColor();
  const layer = {
    id,
    kind: "regions",
    label: title,
    source: TEMP_SOURCE_IDS.REGIONS,
    groupKey: `regions:${id}`,
    taxonName: title,
    taxonMode: null,
    taxonKey: null,
    familyKey: null,
    inatTaxonId: null,
    regionIds: mergeRegionIds([], regionIds),
    bufferKm: 0,
    createdAt,
    visible: true,
    heatmapEnabled: false,
    markerColor,
    archiveId: null,
    overlays: overlaySnapshot,
    features: []
  };
  layers = [
    layer,
    ...layers.map((item) => ({ ...item, visible: false }))
  ];
  const added = mergeBucketsIntoPlaque(layer, buckets, regionIds);
  emit();
  return { ok: true, appended: false, added, layer };
}

export function setTempLayerLabel(layerId, nextLabel) {
  const title = String(nextLabel || "").trim();
  if (!title) {
    return { ok: false, reason: "empty" };
  }
  const plaqueLayers = getWorkingPlaqueLayers(layerId);
  if (plaqueLayers.length === 0) {
    return { ok: false, reason: "missing" };
  }
  const ids = new Set(plaqueLayers.map((layer) => layer.id));
  layers = layers.map((layer) =>
    ids.has(layer.id) ? { ...layer, label: title, taxonName: title } : layer
  );
  emit();
  return { ok: true };
}

export function setTempLayerVisible(layerId, visible) {
  layers = layers.map((layer) =>
    layer.id === layerId ? { ...layer, visible: Boolean(visible) } : layer
  );
  emit();
}

export function setTempLayerHeatmapEnabled(layerId, enabled) {
  const target = layers.find((layer) => layer.id === layerId);
  const groupKey = target ? layerGroupKey(target) : null;
  const next = Boolean(enabled);
  const groupHasPoints = Boolean(
    groupKey &&
      layers.some((layer) => layerGroupKey(layer) === groupKey && (layer.features?.length > 0))
  );
  if (isRegionTempLayer(target) && !(target.features?.length > 0) && !groupHasPoints) {
    return;
  }
  layers = layers.map((layer) =>
    layer.id === layerId || (groupKey && layerGroupKey(layer) === groupKey)
      ? { ...layer, heatmapEnabled: next }
      : layer
  );
  emit();
}

export function setAllTempLayersHeatmapEnabled(enabled) {
  const next = Boolean(enabled);
  layers = layers.map((layer) => {
    const key = layerGroupKey(layer);
    const groupHasPoints = layers.some(
      (item) => layerGroupKey(item) === key && (item.features?.length > 0)
    );
    if (!groupHasPoints) {
      return layer;
    }
    return { ...layer, heatmapEnabled: next };
  });
  emit();
}

export function setTempLayerMarkerColor(layerId, color) {
  const markerColor = normalizeTempLayerMarkerColor(color);
  const target = layers.find((layer) => layer.id === layerId);
  const groupKey = target ? layerGroupKey(target) : null;
  layers = layers.map((layer) =>
    layer.id === layerId || (groupKey && layerGroupKey(layer) === groupKey)
      ? { ...layer, markerColor }
      : layer
  );
  emit();
}

export function deleteTempLayer(layerId) {
  const target = layers.find((layer) => layer.id === layerId);
  const groupKey = target ? layerGroupKey(target) : null;
  layers = layers.filter((layer) => {
    if (layer.id === layerId) {
      return false;
    }
    if (groupKey && !groupKey.startsWith("id:") && layerGroupKey(layer) === groupKey) {
      return false;
    }
    return true;
  });
  emit();
}

function normalizePersistedLayer(layer) {
  const source = normalizeTempSource(layer?.source);
  const groupKey =
    layer?.groupKey ||
    getTempTaxonGroupKey(layer) ||
    (layer?.id ? `id:${layer.id}` : `id:${createLayerId()}`);
  return {
    ...layer,
    kind: layer?.kind === "regions" ? "regions" : layer?.kind ?? "points",
    source,
    groupKey,
    taxonMode: layer?.taxonMode ?? null,
    taxonKey: layer?.taxonKey ?? layer?.gbifTaxonKey ?? null,
    familyKey: layer?.familyKey ?? null,
    inatTaxonId: layer?.inatTaxonId ?? null,
    heatmapEnabled: Boolean(layer?.heatmapEnabled),
    markerColor: normalizeTempLayerMarkerColor(layer?.markerColor),
    archiveId: layer?.archiveId ? String(layer.archiveId) : null,
    filterSnapshot: normalizeFilterSnapshot(layer?.filterSnapshot),
    overlays: normalizeOverlays(layer?.overlays)
  };
}

export function replaceTempLayers(nextLayers) {
  layers = explodeMixedRegionPointLayers(
    Array.isArray(nextLayers) ? nextLayers.map(normalizePersistedLayer) : []
  );
  emit();
}

function stampGroupFeatures(rawFeatures, layerId, markerColor, source) {
  const tempSource = source ? normalizeTempSource(source) : null;
  return (rawFeatures ?? []).map((feature) => {
    const properties = {
      ...feature.properties,
      temp_layer_id: layerId
    };
    if (markerColor) {
      properties.temp_marker_color = markerColor;
    }
    const inferred = inferFeatureTempSource(feature) || tempSource;
    if (inferred) {
      properties.temp_source = inferred;
    }
    return {
      ...feature,
      properties
    };
  });
}

function inferFeatureTempSource(feature) {
  const properties = feature?.properties ?? {};
  const raw = String(properties.source || "").toLowerCase();
  if (raw === "gbif" || raw === "inat" || raw === "inaturalist") {
    return normalizeTempSource(raw);
  }
  if (properties.gbif_key != null && properties.gbif_key !== "") {
    return TEMP_SOURCE_IDS.GBIF;
  }
  if (properties.inat_id != null && properties.inat_id !== "") {
    return TEMP_SOURCE_IDS.INAT;
  }
  return null;
}

export function getTempLayerFeatureGroups() {
  const groups = [];

  if (staging.features.length > 0) {
    groups.push({
      id: "staging",
      markerColor: null,
      features: stampGroupFeatures(staging.features, "staging", null)
    });
  }

  layers.forEach((layer) => {
    if (!layer.visible || !Array.isArray(layer.features) || layer.features.length === 0) {
      return;
    }
    groups.push({
      id: layer.id,
      markerColor: layer.markerColor
        ? resolveTempSourceMarkerColor(layer.markerColor, layer.source)
        : null,
      features: stampGroupFeatures(
        layer.features,
        layer.id,
        layer.markerColor
          ? resolveTempSourceMarkerColor(layer.markerColor, layer.source)
          : null,
        layer.source
      )
    });
  });

  return groups;
}

export function getVisibleTempLayerFeatures() {
  return getTempLayerFeatureGroups().flatMap((group) => group.features);
}

export function getVisibleTempLayerOverlays() {
  const overlays = [];
  const seenGroups = new Set();

  layers.forEach((layer) => {
    if (!layer.visible) {
      return;
    }
    const key = layerGroupKey(layer);
    if (seenGroups.has(key)) {
      return;
    }
    seenGroups.add(key);
    const overlayOwner =
      layers.find(
        (item) => layerGroupKey(item) === key && normalizeOverlays(item.overlays).length > 0
      ) || layer;
    normalizeOverlays(overlayOwner.overlays).forEach((overlay) => overlays.push(overlay));
  });

  return overlays;
}

/** Все точки временных слоёв и staging, включая скрытые слои. */
export function getAllTempLayerFeatures() {
  const features = [];
  if (Array.isArray(staging.features) && staging.features.length > 0) {
    features.push(...staging.features);
  }
  layers.forEach((layer) => {
    if (Array.isArray(layer?.features) && layer.features.length > 0) {
      features.push(...layer.features);
    }
  });
  return features;
}

export function getAllTempLayerFeatureCount() {
  return getAllTempLayerFeatures().length;
}

/** Группы для кластеризации «по слоям»: одна единица на плашку (GBIF+iNat вместе). */
export function getTempLayerPlaqueFeatureGroups() {
  const groups = [];

  if (staging.features.length > 0) {
    groups.push({
      id: "staging",
      markerColor: null,
      features: stampGroupFeatures(staging.features, "staging", null)
    });
  }

  const byPlaque = new Map();
  layers.forEach((layer) => {
    if (!layer.visible || !Array.isArray(layer.features) || layer.features.length === 0) {
      return;
    }
    const key = layerGroupKey(layer);
    let group = byPlaque.get(key);
    if (!group) {
      group = {
        id: key,
        markerColor: layer.markerColor ?? null,
        featureLists: []
      };
      byPlaque.set(key, group);
    }
    group.featureLists.push(
      stampGroupFeatures(
        layer.features,
        layer.id,
        layer.markerColor
          ? resolveTempSourceMarkerColor(layer.markerColor, layer.source)
          : null,
        layer.source
      )
    );
    if (!group.markerColor && layer.markerColor) {
      group.markerColor = layer.markerColor;
    }
  });

  byPlaque.forEach((group) => {
    groups.push({
      id: group.id,
      markerColor: group.markerColor,
      features: group.featureLists.flat()
    });
  });

  return groups;
}

export function listTempLayerPlaques() {
  const plaques = [];
  const indexByKey = new Map();

  layers.forEach((layer) => {
    const key = layerGroupKey(layer);
    let plaque = indexByKey.get(key);
    if (!plaque) {
      plaque = {
        key,
        taxonName: layer.taxonName || "",
        label: layer.taxonName || layer.label || sourceLabel(layer.source),
        markerColor: layer.markerColor ?? null,
        filterSnapshot: normalizeFilterSnapshot(layer.filterSnapshot),
        overlays: normalizeOverlays(layer.overlays),
        layers: []
      };
      indexByKey.set(key, plaque);
      plaques.push(plaque);
    }
    plaque.layers.push(layer);
    if (!plaque.markerColor && layer.markerColor) {
      plaque.markerColor = layer.markerColor;
    }
    if (!plaque.filterSnapshot.length && layer.filterSnapshot?.length) {
      plaque.filterSnapshot = normalizeFilterSnapshot(layer.filterSnapshot);
    }
    if (!plaque.overlays?.length && layer.overlays?.length) {
      plaque.overlays = normalizeOverlays(layer.overlays);
    }
    if (!plaque.taxonName && layer.taxonName) {
      plaque.taxonName = layer.taxonName;
      plaque.label = layer.taxonName;
    }
  });

  return plaques;
}

export function serializeTempLayers() {
  return layers.map((layer) => serializeLayer(layer));
}

/** @type {Array<object>} */
let archiveIndex = [];

export function getTempLayerArchiveIndex() {
  return archiveIndex;
}

export function replaceTempLayerArchiveIndex(entries) {
  archiveIndex = Array.isArray(entries) ? entries : [];
  emit();
}

export function getTempLayerGroupKey(layer) {
  return layerGroupKey(layer);
}

export function getWorkingPlaqueLayers(layerId) {
  const target = layers.find((layer) => layer.id === layerId);
  if (!target) {
    return [];
  }
  const key = layerGroupKey(target);
  return layers.filter((layer) => layerGroupKey(layer) === key);
}

export function removeWorkingPlaque(layerId) {
  const plaqueLayers = getWorkingPlaqueLayers(layerId);
  if (plaqueLayers.length === 0) {
    return [];
  }
  const ids = new Set(plaqueLayers.map((layer) => layer.id));
  layers = layers.filter((layer) => !ids.has(layer.id));
  emit();
  return plaqueLayers;
}

export function restorePlaqueLayers(nextLayers) {
  const incoming = explodeMixedRegionPointLayers(
    Array.isArray(nextLayers) ? nextLayers.map(normalizePersistedLayer) : []
  );
  if (incoming.length === 0) {
    return { ok: false, reason: "empty" };
  }

  const incomingKeys = new Set(incoming.map((layer) => layerGroupKey(layer)));
  const conflict = layers.some((layer) => incomingKeys.has(layerGroupKey(layer)));
  if (conflict) {
    return { ok: false, reason: "group-conflict" };
  }

  layers = [
    ...incoming.map((layer) => ({ ...layer, visible: true })),
    ...layers
  ];
  emit();
  return { ok: true };
}

function serializeLayer(layer) {
  return {
    id: layer.id,
    kind: isRegionTempLayer(layer) ? "regions" : layer.kind ?? "points",
    label: layer.label,
    source: normalizeTempSource(layer.source),
    groupKey: layerGroupKey(layer),
    taxonName: layer.taxonName,
    taxonMode: layer.taxonMode ?? null,
    taxonKey: layer.taxonKey ?? null,
    familyKey: layer.familyKey ?? null,
    inatTaxonId: layer.inatTaxonId ?? null,
    regionIds: layer.regionIds,
    bufferKm: layer.bufferKm ?? 0,
    regionStyle: layer.regionStyle ?? null,
    regionFeatureColors: layer.regionFeatureColors ?? null,
    createdAt: layer.createdAt,
    visible: layer.visible,
    heatmapEnabled: Boolean(layer.heatmapEnabled),
    markerColor: layer.markerColor ?? null,
    archiveId: layer.archiveId ?? null,
    filterSnapshot: normalizeFilterSnapshot(layer.filterSnapshot),
    overlays: normalizeOverlays(layer.overlays),
    features: layer.features
  };
}

export function buildArchiveRecordFromLayerId(layerId) {
  const plaqueLayers = getWorkingPlaqueLayers(layerId);
  if (plaqueLayers.length === 0) {
    return null;
  }

  const now = new Date().toISOString();
  const archiveId =
    plaqueLayers.find((layer) => layer.archiveId)?.archiveId || createLayerId();
  const createdAt =
    plaqueLayers
      .map((layer) => layer.createdAt)
      .filter(Boolean)
      .sort()[0] || now;
  const title =
    plaqueLayers.find((layer) => layer.taxonName)?.taxonName ||
    plaqueLayers[0].label ||
    "Временный слой";

  return {
    archiveId,
    groupKey: layerGroupKey(plaqueLayers[0]),
    title,
    markerColor: plaqueLayers[0].markerColor ?? null,
    createdAt,
    archivedAt: now,
    updatedAt: now,
    layers: plaqueLayers.map((layer) => ({
      ...serializeLayer(layer),
      archiveId
    }))
  };
}

export function toArchiveIndexEntry(record) {
  const recordLayers = Array.isArray(record?.layers) ? record.layers : [];
  const regionIds = new Set();
  let pointCount = 0;
  let filterSnapshot = [];
  const overlayLabels = [];
  recordLayers.forEach((layer) => {
    if (isRegionTempLayer(layer)) {
      (layer.regionIds || []).forEach((id) => regionIds.add(id));
      pointCount += layer.features?.length ?? 0;
      if (!filterSnapshot.length && layer.filterSnapshot?.length) {
        filterSnapshot = normalizeFilterSnapshot(layer.filterSnapshot);
      }
      (layer.overlays || []).forEach((overlay) => {
        const label = String(overlay?.label || "").trim();
        if (label && !overlayLabels.includes(label)) {
          overlayLabels.push(label);
        }
      });
      return;
    }
    pointCount += layer.features?.length ?? 0;
    (layer.regionIds || []).forEach((id) => regionIds.add(id));
    if (!filterSnapshot.length && layer.filterSnapshot?.length) {
      filterSnapshot = normalizeFilterSnapshot(layer.filterSnapshot);
    }
    (layer.overlays || []).forEach((overlay) => {
      const label = String(overlay?.label || "").trim();
      if (label && !overlayLabels.includes(label)) {
        overlayLabels.push(label);
      }
    });
  });

  return {
    archiveId: record.archiveId,
    groupKey: record.groupKey,
    title: record.title || "Временный слой",
    markerColor: record.markerColor ?? null,
    createdAt: record.createdAt,
    archivedAt: record.archivedAt,
    updatedAt: record.updatedAt,
    sources: recordLayers.map((layer) => normalizeTempSource(layer.source)),
    pointCount,
    regionCount: regionIds.size,
    filterSnapshot,
    overlayLabels
  };
}
