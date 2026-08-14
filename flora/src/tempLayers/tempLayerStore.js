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

function createEmptyStaging() {
  return {
    source: null,
    taxonKey: null,
    taxonName: null,
    regionIds: [],
    features: [],
    keys: new Set()
  };
}

let staging = createEmptyStaging();
/** @type {Array<{
 *   id: string,
 *   label: string,
 *   source: string,
 *   taxonName: string,
 *   regionIds: string[],
 *   createdAt: string,
 *   visible: boolean,
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

function taxonFingerprint(source, taxon) {
  if (!taxon) {
    return null;
  }
  return [
    source,
    taxon.mode ?? "",
    taxon.taxonKey ?? "",
    taxon.familyKey ?? "",
    taxon.inatTaxonId ?? "",
    taxon.scientificName ?? ""
  ].join("|");
}

export function prepareTempLayerStaging({ source, taxon } = {}) {
  const nextKey = taxonFingerprint(source, taxon);
  if (staging.taxonKey && staging.taxonKey !== nextKey) {
    staging = createEmptyStaging();
  }

  staging.source = source ?? staging.source;
  staging.taxonKey = nextKey;
  staging.taxonName = taxon?.scientificName ?? staging.taxonName;
}

export function upsertTempLayerStagingFeatures(features, regionId) {
  if (!Array.isArray(features) || features.length === 0) {
    if (regionId && !staging.regionIds.includes(regionId)) {
      staging.regionIds = [...staging.regionIds, regionId];
    }
    emit();
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

  emit();
  return { added };
}

export function clearTempLayerStaging() {
  staging = createEmptyStaging();
  emit();
}

function sourceLabel(source) {
  return source === "inat" ? "iNaturalist" : "GBIF";
}

function buildLayerLabel({ source, taxonName, regionIds }) {
  const parts = [sourceLabel(source)];
  if (taxonName) {
    parts.push(taxonName);
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

  const layer = {
    id: createLayerId(),
    label: buildLayerLabel(staging),
    source: staging.source || "gbif",
    taxonName: staging.taxonName || "",
    regionIds: [...staging.regionIds],
    createdAt: new Date().toISOString(),
    visible: true,
    features: cloneFeatures(staging.features)
  };

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

export function deleteTempLayer(layerId) {
  layers = layers.filter((layer) => layer.id !== layerId);
  emit();
}

export function replaceTempLayers(nextLayers) {
  layers = Array.isArray(nextLayers) ? nextLayers : [];
  emit();
}

export function getVisibleTempLayerFeatures() {
  const features = [];

  staging.features.forEach((feature) => {
    features.push({
      ...feature,
      properties: {
        ...feature.properties,
        temp_layer_id: "staging"
      }
    });
  });

  layers.forEach((layer) => {
    if (!layer.visible || !Array.isArray(layer.features)) {
      return;
    }
    layer.features.forEach((feature) => {
      features.push({
        ...feature,
        properties: {
          ...feature.properties,
          temp_layer_id: layer.id
        }
      });
    });
  });
  return features;
}

export function serializeTempLayers() {
  return layers.map((layer) => ({
    id: layer.id,
    label: layer.label,
    source: layer.source,
    taxonName: layer.taxonName,
    regionIds: layer.regionIds,
    createdAt: layer.createdAt,
    visible: layer.visible,
    features: layer.features
  }));
}
