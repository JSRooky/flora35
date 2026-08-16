import { stampFeatureRegionIds } from "../externalSources/regionVisibility";
import { getExternalRegionById } from "../externalSources/regions";

const listeners = new Set();

function cloneFeatures(features) {
  return JSON.parse(JSON.stringify(features ?? []));
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
  INAT: "inat"
};

export const TEMP_SOURCE_TINTS = {
  [TEMP_SOURCE_IDS.GBIF]: "#3b82f6",
  [TEMP_SOURCE_IDS.INAT]: "#22c55e"
};

export function normalizeTempSource(source) {
  if (source === "inat" || source === "inaturalist") {
    return TEMP_SOURCE_IDS.INAT;
  }
  return TEMP_SOURCE_IDS.GBIF;
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
export const TEMP_LAYER_MARKER_PALETTE = [
  "#d5254c",
  "#d85a1c",
  "#c18b14",
  "#20a04c",
  "#16958a",
  "#3267e0",
  "#7e43e3",
  "#d02e7a",
  "#ae2222",
  "#ba4318",
  "#4d7b15",
  "#16756f",
  "#233c85",
  "#6f2ed3",
  "#78716d",
  "#e84763",
  "#ed751e",
  "#e1b316",
  "#2dc160",
  "#1eb6a6",
  "#4584ec",
  "#8f62ed",
  "#e44e9c",
  "#d02c2c",
  "#64a016"
];

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
  return normalizeTempSource(source) === TEMP_SOURCE_IDS.INAT ? "iNaturalist" : "GBIF";
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
  layers = layers.map((layer) =>
    layer.id === layerId || (groupKey && layerGroupKey(layer) === groupKey)
      ? { ...layer, heatmapEnabled: next }
      : layer
  );
  emit();
}

export function setAllTempLayersHeatmapEnabled(enabled) {
  const next = Boolean(enabled);
  layers = layers.map((layer) => ({ ...layer, heatmapEnabled: next }));
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
    source,
    groupKey,
    taxonMode: layer?.taxonMode ?? null,
    taxonKey: layer?.taxonKey ?? layer?.gbifTaxonKey ?? null,
    familyKey: layer?.familyKey ?? null,
    inatTaxonId: layer?.inatTaxonId ?? null,
    heatmapEnabled: Boolean(layer?.heatmapEnabled),
    markerColor: normalizeTempLayerMarkerColor(layer?.markerColor)
  };
}

export function replaceTempLayers(nextLayers) {
  layers = Array.isArray(nextLayers) ? nextLayers.map(normalizePersistedLayer) : [];
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
    const inferred = tempSource || inferFeatureTempSource(feature);
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
        layers: []
      };
      indexByKey.set(key, plaque);
      plaques.push(plaque);
    }
    plaque.layers.push(layer);
    if (!plaque.markerColor && layer.markerColor) {
      plaque.markerColor = layer.markerColor;
    }
    if (!plaque.taxonName && layer.taxonName) {
      plaque.taxonName = layer.taxonName;
      plaque.label = layer.taxonName;
    }
  });

  return plaques;
}

export function serializeTempLayers() {
  return layers.map((layer) => ({
    id: layer.id,
    label: layer.label,
    source: normalizeTempSource(layer.source),
    groupKey: layerGroupKey(layer),
    taxonName: layer.taxonName,
    taxonMode: layer.taxonMode ?? null,
    taxonKey: layer.taxonKey ?? null,
    familyKey: layer.familyKey ?? null,
    inatTaxonId: layer.inatTaxonId ?? null,
    regionIds: layer.regionIds,
    createdAt: layer.createdAt,
    visible: layer.visible,
    heatmapEnabled: Boolean(layer.heatmapEnabled),
    markerColor: layer.markerColor ?? null,
    features: layer.features
  }));
}
