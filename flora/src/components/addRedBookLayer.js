import { safeQueryRenderedFeatures } from "./safeQueryRenderedFeatures";
import { getPointColorExpression } from "./pointColors";
import {
  getRedBookMatches,
  setRedBookMatches as persistRedBookMatches
} from "../redbook/redBookStore";

export const REDBOOK_SOURCE_ID = "redbook-matches";
export const REDBOOK_UNCLUSTERED_LAYER_ID = "redbook-unclustered";

const EMPTY_FEATURE_COLLECTION = {
  type: "FeatureCollection",
  features: []
};

/** @type {GeoJSON.FeatureCollection} */
let redBookCollection = EMPTY_FEATURE_COLLECTION;
let layerVisible = true;
let onPointClickCallback = null;
let interactionHandlers = null;

function applyVisibility(map) {
  if (!map?.getLayer?.(REDBOOK_UNCLUSTERED_LAYER_ID)) {
    return;
  }

  map.setLayoutProperty(
    REDBOOK_UNCLUSTERED_LAYER_ID,
    "visibility",
    layerVisible ? "visible" : "none"
  );
}

function attachInteractions(map) {
  if (!map || interactionHandlers) {
    return;
  }

  const handleClick = (event) => {
    const features = safeQueryRenderedFeatures(map, event.point, {
      layers: [REDBOOK_UNCLUSTERED_LAYER_ID]
    });
    const feature = features?.[0];
    if (!feature) {
      return;
    }

    onPointClickCallback?.(feature);
  };

  const handleEnter = () => {
    map.getCanvas().style.cursor = "pointer";
  };

  const handleLeave = () => {
    map.getCanvas().style.cursor = "";
  };

  map.on("click", REDBOOK_UNCLUSTERED_LAYER_ID, handleClick);
  map.on("mouseenter", REDBOOK_UNCLUSTERED_LAYER_ID, handleEnter);
  map.on("mouseleave", REDBOOK_UNCLUSTERED_LAYER_ID, handleLeave);

  interactionHandlers = {
    click: handleClick,
    enter: handleEnter,
    leave: handleLeave
  };
}

function addRedBookCircleLayer(map) {
  if (!map) {
    return;
  }

  if (map.getLayer(REDBOOK_UNCLUSTERED_LAYER_ID)) {
    map.setPaintProperty(
      REDBOOK_UNCLUSTERED_LAYER_ID,
      "circle-color",
      getPointColorExpression()
    );
    return;
  }

  map.addLayer({
    id: REDBOOK_UNCLUSTERED_LAYER_ID,
    type: "circle",
    source: REDBOOK_SOURCE_ID,
    paint: {
      "circle-radius": 6,
      "circle-color": getPointColorExpression(),
      "circle-stroke-width": 1.5,
      "circle-stroke-color": "#ffffff",
      "circle-opacity": 0.92
    }
  });
}

/**
 * Создаёт слой совпадений Красной книги (без кластеризации).
 * @param {import("mapbox-gl").Map} map
 * @param {{ onPointClick?: Function }} [options]
 */
export function addRedBookLayer(map, { onPointClick } = {}) {
  if (!map) {
    return;
  }

  if (onPointClick) {
    onPointClickCallback = onPointClick;
  }

  const initial = getRedBookMatches();
  redBookCollection =
    initial?.type === "FeatureCollection" ? initial : EMPTY_FEATURE_COLLECTION;

  if (map.getSource(REDBOOK_SOURCE_ID)) {
    setRedBookData(map, redBookCollection, { persist: false });
    if (!map.getLayer(REDBOOK_UNCLUSTERED_LAYER_ID)) {
      addRedBookCircleLayer(map);
    }
    if (!interactionHandlers) {
      attachInteractions(map);
    }
    applyVisibility(map);
    return;
  }

  map.addSource(REDBOOK_SOURCE_ID, {
    type: "geojson",
    data: redBookCollection
  });

  addRedBookCircleLayer(map);
  attachInteractions(map);
  applyVisibility(map);
}

/**
 * @param {import("mapbox-gl").Map|null|undefined} map
 * @param {GeoJSON.FeatureCollection|object[]|null|undefined} collectionOrFeatures
 * @param {{ persist?: boolean }} [options]
 */
export function setRedBookData(map, collectionOrFeatures, options = {}) {
  const collection = Array.isArray(collectionOrFeatures)
    ? { type: "FeatureCollection", features: collectionOrFeatures }
    : collectionOrFeatures?.type === "FeatureCollection"
      ? collectionOrFeatures
      : EMPTY_FEATURE_COLLECTION;

  redBookCollection = {
    type: "FeatureCollection",
    features: collection.features ?? []
  };

  if (options.persist !== false) {
    persistRedBookMatches(redBookCollection);
  }

  if (!map) {
    return;
  }

  if (!map.getSource(REDBOOK_SOURCE_ID)) {
    addRedBookLayer(map);
  }

  map.getSource(REDBOOK_SOURCE_ID)?.setData(redBookCollection);
  applyVisibility(map);
}

export function setRedBookVisibility(map, visible) {
  layerVisible = Boolean(visible);
  if (map) {
    applyVisibility(map);
  }
}

export function isRedBookLayerVisible() {
  return layerVisible;
}

export function getRedBookFeatures() {
  return redBookCollection.features ?? [];
}

export function getRedBookFeatureCollection() {
  return redBookCollection;
}

/**
 * Добавляет/обновляет точки на слое Красной книги (по id / redbook_match_id).
 * @param {import("mapbox-gl").Map|null|undefined} map
 * @param {object[]} features
 * @returns {{ added: number, updated: number, total: number, collection: GeoJSON.FeatureCollection }}
 */
export function upsertRedBookFeatures(map, features) {
  const incoming = Array.isArray(features) ? features : [];
  const byId = new Map();

  for (const feature of redBookCollection.features ?? []) {
    const id = String(feature.id ?? feature.properties?.redbook_match_id ?? "");
    if (id) {
      byId.set(id, feature);
    }
  }

  let added = 0;
  let updated = 0;

  for (const feature of incoming) {
    if (!feature) {
      continue;
    }
    const id = String(feature.id ?? feature.properties?.redbook_match_id ?? "");
    if (!id) {
      continue;
    }
    if (byId.has(id)) {
      updated += 1;
    } else {
      added += 1;
    }
    byId.set(id, feature);
  }

  const collection = {
    type: "FeatureCollection",
    features: Array.from(byId.values())
  };

  setRedBookData(map, collection);
  return { added, updated, total: collection.features.length, collection };
}

/**
 * Фильтр слоя по статусу (и при необходимости по царству/году — через properties).
 * @param {import("mapbox-gl").Map|null|undefined} map
 * @param {object} [filters]
 */
export function applyRedBookLocationsFilter(map, filters = {}) {
  if (!map?.getLayer?.(REDBOOK_UNCLUSTERED_LAYER_ID)) {
    return;
  }

  const parts = [];

  if (Array.isArray(filters.status) && filters.status.length > 0) {
    parts.push(["in", ["get", "status"], ["literal", filters.status]]);
  }

  if (Array.isArray(filters.regnum) && filters.regnum.length > 0) {
    const normalized = filters.regnum.map((value) =>
      value == null || value === "" ? "" : String(value).toLowerCase()
    );
    parts.push([
      "in",
      ["downcase", ["to-string", ["coalesce", ["get", "regnum"], ""]]],
      ["literal", normalized]
    ]);
  }

  if (
    filters.found_year &&
    typeof filters.found_year === "object" &&
    filters.found_year.min != null &&
    filters.found_year.max != null
  ) {
    parts.push([
      "all",
      [">=", ["get", "found_year"], filters.found_year.min],
      ["<=", ["get", "found_year"], filters.found_year.max]
    ]);
  }

  if (parts.length === 0) {
    map.setFilter(REDBOOK_UNCLUSTERED_LAYER_ID, null);
    return;
  }

  map.setFilter(
    REDBOOK_UNCLUSTERED_LAYER_ID,
    parts.length === 1 ? parts[0] : ["all", ...parts]
  );
}
