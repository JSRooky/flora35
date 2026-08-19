import mapboxgl from "mapbox-gl";
import { bbox, booleanPointInPolygon, polygon } from "@turf/turf";
import { applyMapCursor, getFirstLocationsLayerId } from "./addLocationsLayer";
import {
  createDefaultRegionBoundsSettings,
  normalizeRegionBoundsSettings
} from "./regionBoundsSettings";
import { safeQueryRenderedFeatures } from "./safeQueryRenderedFeatures";

export const REGION_BOUNDS_SOURCE_ID = "region-bounds";
export const REGION_BOUNDS_FILL_LAYER_ID = "region-bounds-fill";
export const REGION_BOUNDS_OUTLINE_LAYER_ID = "region-bounds-outline";

const EMPTY_COLLECTION = {
  type: "FeatureCollection",
  features: []
};

const HOVER_FILL_OPACITY_BOOST = 0.23;
const SELECTED_FILL_OPACITY_BOOST = 0.32;
const HOVER_LINE_WIDTH_BOOST = 1.1;
const SELECTED_LINE_WIDTH_BOOST = 1.6;

let regionSelectListener = null;
let cachedRegionCollection = null;

let regionBoundsPaintSettings = createDefaultRegionBoundsSettings();

function buildFillPaint(settings = regionBoundsPaintSettings) {
  const fillOpacity = Number(settings.fillOpacity);
  const hoverOpacity = Math.min(1, fillOpacity + HOVER_FILL_OPACITY_BOOST);
  return {
    "fill-color": settings.fillColor,
    "fill-opacity": [
      "case",
      ["boolean", ["feature-state", "selected"], false],
      Math.min(1, fillOpacity + SELECTED_FILL_OPACITY_BOOST),
      ["boolean", ["feature-state", "hover"], false],
      hoverOpacity,
      fillOpacity
    ],
    "fill-antialias": true
  };
}

function buildOutlinePaint(settings = regionBoundsPaintSettings) {
  const lineWidth = Number(settings.lineWidth);
  return {
    "line-color": settings.lineColor,
    "line-width": [
      "case",
      ["boolean", ["feature-state", "selected"], false],
      lineWidth + SELECTED_LINE_WIDTH_BOOST,
      ["boolean", ["feature-state", "hover"], false],
      lineWidth + HOVER_LINE_WIDTH_BOOST,
      lineWidth
    ],
    "line-opacity": 0.9
  };
}

function applyPaintToRegionBoundsLayers(map, settings) {
  if (map.getLayer(REGION_BOUNDS_FILL_LAYER_ID)) {
    Object.entries(buildFillPaint(settings)).forEach(([property, value]) => {
      map.setPaintProperty(REGION_BOUNDS_FILL_LAYER_ID, property, value);
    });
  }
  if (map.getLayer(REGION_BOUNDS_OUTLINE_LAYER_ID)) {
    Object.entries(buildOutlinePaint(settings)).forEach(([property, value]) => {
      map.setPaintProperty(REGION_BOUNDS_OUTLINE_LAYER_ID, property, value);
    });
  }
}

/** Применяет настройки отображения контуров регионов. */
export function applyRegionBoundsPaintSettings(map, settings) {
  regionBoundsPaintSettings = normalizeRegionBoundsSettings(settings);
  if (!map?.getLayer) {
    return;
  }
  applyPaintToRegionBoundsLayers(map, regionBoundsPaintSettings);
}

let regionBoundsDataPromise = null;

function shiftPosition(position, deltaLon) {
  if (!Array.isArray(position) || position.length < 2) {
    return position;
  }
  return [position[0] + deltaLon, position[1], ...position.slice(2)];
}

/** Убирает скачок через 180° между соседними точками кольца. */
function unwrapRing(ring) {
  if (!Array.isArray(ring) || ring.length === 0) {
    return ring;
  }

  const unwrapped = [];
  for (const position of ring) {
    if (!Array.isArray(position) || position.length < 2) {
      unwrapped.push(position);
      continue;
    }

    let lon = position[0];
    if (unwrapped.length > 0) {
      const prevLon = unwrapped[unwrapped.length - 1][0];
      while (lon - prevLon > 180) {
        lon -= 360;
      }
      while (lon - prevLon < -180) {
        lon += 360;
      }
    }
    unwrapped.push([lon, position[1], ...position.slice(2)]);
  }

  if (unwrapped.length > 1) {
    unwrapped[unwrapped.length - 1] = unwrapped[0].slice();
  }
  return unwrapped;
}

function ringMeanLon(ring) {
  let sum = 0;
  let count = 0;
  for (const position of ring ?? []) {
    if (Array.isArray(position) && typeof position[0] === "number") {
      sum += position[0];
      count += 1;
    }
  }
  return count > 0 ? sum / count : 0;
}

function unwrapPolygon(polygonRings) {
  return (polygonRings ?? []).map(unwrapRing);
}

function isRingInsideOuter(innerRing, outerRing) {
  if (!Array.isArray(innerRing) || innerRing.length < 4 || !Array.isArray(outerRing) || outerRing.length < 4) {
    return false;
  }
  const sample = innerRing[Math.floor(innerRing.length / 2)];
  if (!Array.isArray(sample) || sample.length < 2) {
    return false;
  }
  try {
    return booleanPointInPolygon(sample, polygon([outerRing]));
  } catch {
    return false;
  }
}

/**
 * В GeoJSON у Polygon первое кольцо — внешний контур, остальные — дыры.
 * Если острова записаны как «дыры» внешнего кольца, заливка пропадает.
 * Такие кольца поднимаем в отдельные полигоны MultiPolygon.
 */
function repairDetachedPolygonRings(rings) {
  if (!Array.isArray(rings) || rings.length <= 1) {
    return { type: "Polygon", coordinates: rings ?? [] };
  }

  const outer = rings[0];
  const holes = [];
  const detached = [];
  for (let index = 1; index < rings.length; index += 1) {
    if (isRingInsideOuter(rings[index], outer)) {
      holes.push(rings[index]);
    } else {
      detached.push(rings[index]);
    }
  }

  if (detached.length === 0) {
    return { type: "Polygon", coordinates: rings };
  }

  return {
    type: "MultiPolygon",
    coordinates: [[outer, ...holes], ...detached.map((ring) => [ring])]
  };
}

function flattenRepairedPolygons(polygons) {
  const parts = [];
  for (const rings of polygons ?? []) {
    const repaired = repairDetachedPolygonRings(rings);
    if (repaired.type === "Polygon") {
      parts.push(repaired.coordinates);
    } else {
      parts.push(...repaired.coordinates);
    }
  }
  return parts;
}

const ANTIMERIDIAN_CUT_EPS = 0.02;
const ANTIMERIDIAN_SNAP_DEG = 0.05;

function isAntimeridianCutPoint(position) {
  return Array.isArray(position) && Math.abs(Math.abs(position[0]) - 180) < ANTIMERIDIAN_CUT_EPS;
}

function dropClosingVertex(ring) {
  if (!Array.isArray(ring) || ring.length < 2) {
    return ring?.slice() ?? [];
  }
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (
    Array.isArray(first) &&
    Array.isArray(last) &&
    first[0] === last[0] &&
    first[1] === last[1]
  ) {
    return ring.slice(0, -1);
  }
  return ring.slice();
}

function pointDistanceDeg(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function closeRing(ring) {
  const closed = ring.slice();
  if (closed.length === 0) {
    return closed;
  }
  const first = closed[0];
  const last = closed[closed.length - 1];
  if (pointDistanceDeg(first, last) > 1e-12) {
    closed.push(first.slice());
  }
  return closed;
}

/** Рёбра вдоль 180° — искусственный разрез; остальное — береговые цепочки. */
function extractCoastChains(ring) {
  const points = dropClosingVertex(ring);
  const count = points.length;
  if (count < 2) {
    return [];
  }

  const isCutEdge = (index) =>
    isAntimeridianCutPoint(points[index]) &&
    isAntimeridianCutPoint(points[(index + 1) % count]);

  let start = 0;
  for (let index = 0; index < count; index += 1) {
    if (isCutEdge(index)) {
      start = (index + 1) % count;
      break;
    }
  }

  const chains = [];
  let current = [];
  for (let step = 0; step < count; step += 1) {
    const index = (start + step) % count;
    if (current.length === 0) {
      current.push(points[index]);
    }
    if (isCutEdge(index)) {
      if (current.length >= 2) {
        chains.push(current);
      }
      current = [];
    } else {
      current.push(points[(index + 1) % count]);
    }
  }
  if (current.length >= 2) {
    chains.push(current);
  }
  return chains;
}

function polygonHasAntimeridianCut(polygon) {
  const points = dropClosingVertex(polygon?.[0] ?? []);
  const count = points.length;
  for (let index = 0; index < count; index += 1) {
    if (
      isAntimeridianCutPoint(points[index]) &&
      isAntimeridianCutPoint(points[(index + 1) % count])
    ) {
      return true;
    }
  }
  return false;
}

function concatChains(left, right, fromEnd, toStart) {
  const head = isAntimeridianCutPoint(fromEnd) ? left.slice(0, -1) : left;
  const tail = isAntimeridianCutPoint(toStart) ? right.slice(1) : right;
  return head.concat(tail);
}

function joinCoastChains(chains) {
  const remaining = chains.map((chain) => chain.slice());
  let merged = true;

  while (merged) {
    merged = false;
    outer: for (let i = 0; i < remaining.length; i += 1) {
      for (let j = 0; j < remaining.length; j += 1) {
        if (i === j) {
          continue;
        }

        const left = remaining[i];
        const right = remaining[j];
        const leftStart = left[0];
        const leftEnd = left[left.length - 1];
        const rightStart = right[0];
        const rightEnd = right[right.length - 1];

        if (pointDistanceDeg(leftEnd, rightStart) < ANTIMERIDIAN_SNAP_DEG) {
          remaining[i] = concatChains(left, right, leftEnd, rightStart);
          remaining.splice(j, 1);
          merged = true;
          break outer;
        }
        if (pointDistanceDeg(leftEnd, rightEnd) < ANTIMERIDIAN_SNAP_DEG) {
          remaining[i] = concatChains(left, right.slice().reverse(), leftEnd, rightEnd);
          remaining.splice(j, 1);
          merged = true;
          break outer;
        }
        if (pointDistanceDeg(leftStart, rightStart) < ANTIMERIDIAN_SNAP_DEG) {
          remaining[i] = concatChains(left.slice().reverse(), right, leftStart, rightStart);
          remaining.splice(j, 1);
          merged = true;
          break outer;
        }
        if (pointDistanceDeg(leftStart, rightEnd) < ANTIMERIDIAN_SNAP_DEG) {
          remaining[i] = concatChains(right, left, rightEnd, leftStart);
          remaining.splice(j, 1);
          merged = true;
          break outer;
        }
      }
    }
  }

  return remaining.map((chain) => {
    const withoutCut = chain.filter((position) => !isAntimeridianCutPoint(position));
    return closeRing(withoutCut.length >= 3 ? withoutCut : chain);
  });
}

/** Сшивает половины субъекта, разрезанные по 180-му меридиану. Острова без разреза не трогает. */
function stitchAntimeridianPolygons(polygons) {
  const untouched = [];
  const chains = [];

  for (const polygon of polygons) {
    if (!polygonHasAntimeridianCut(polygon)) {
      untouched.push(polygon);
      continue;
    }
    chains.push(...extractCoastChains(polygon[0] ?? []));
  }

  if (chains.length === 0) {
    return polygons;
  }

  const stitched = joinCoastChains(chains).map((ring) => [ring]);
  return untouched.concat(stitched);
}

/**
 * Полигоны вроде Чукотки режутся по 180-му меридиану: в одном кольце
 * оказываются 179° и −180°, и заливка тянется через всю карту.
 * Кольца разворачиваем, западные куски сдвигаем на +360°, чтобы субъект
 * остался справа от Камчатки, затем сшиваем разрез.
 */
function normalizeAntimeridianCollection(collection) {
  if (!collection || !Array.isArray(collection.features)) {
    return collection;
  }

  return {
    ...collection,
    features: collection.features.map((feature, index) => {
      const geometry = feature?.geometry;
      if (!geometry) {
        return { ...feature, id: index };
      }

      if (geometry.type === "Polygon") {
        const repaired = repairDetachedPolygonRings(unwrapPolygon(geometry.coordinates));
        return {
          ...feature,
          id: index,
          geometry: repaired
        };
      }

      if (geometry.type !== "MultiPolygon") {
        return { ...feature, id: index };
      }

      const polygons = flattenRepairedPolygons((geometry.coordinates ?? []).map(unwrapPolygon));
      const means = polygons.map((polygon) => ringMeanLon(polygon[0]));
      const hasEast = means.some((lon) => lon > 90);
      const hasWest = means.some((lon) => lon < 0);
      const shifted =
        hasEast && hasWest
          ? polygons.map((polygon, polygonIndex) =>
              means[polygonIndex] < 0
                ? polygon.map((ring) => ring.map((pos) => shiftPosition(pos, 360)))
                : polygon
            )
          : polygons;
      const coordinates = stitchAntimeridianPolygons(shifted);

      const iso = feature.properties?.iso;
      return {
        ...feature,
        id: iso || index,
        geometry: {
          type: coordinates.length === 1 ? "Polygon" : "MultiPolygon",
          coordinates: coordinates.length === 1 ? coordinates[0] : coordinates
        }
      };
    })
  };
}

export function loadRegionBoundsGeoJSON() {
  if (!regionBoundsDataPromise) {
    regionBoundsDataPromise = import("../bounds/ru-subjects-contour.geojson")
      .then((module) => {
        const data = module.default ?? module;
        if (typeof data === "string") {
          return fetch(data).then((response) => {
            if (!response.ok) {
              throw new Error(`Не удалось загрузить границы регионов (${response.status})`);
            }
            return response.json();
          });
        }
        return data;
      })
      .then((data) => {
        const normalized = normalizeAntimeridianCollection(data);
        cachedRegionCollection = normalized;
        return normalized;
      });
  }

  return regionBoundsDataPromise;
}

/** Каталог субъектов из загруженного GeoJSON. */
export function buildRegionCatalog(collection = cachedRegionCollection) {
  const features = collection?.features ?? [];
  return features
    .map((feature) => {
      const properties = feature.properties ?? {};
      const iso = properties.iso ? String(properties.iso) : null;
      if (!iso) {
        return null;
      }
      return {
        iso,
        name: properties.name || properties.name_en || iso,
        nameEn: properties.name_en || "",
        fo: properties.fo || "Прочие",
        feature
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name, "ru"));
}

export function getCachedRegionCatalog() {
  return cachedRegionCollection ? buildRegionCatalog(cachedRegionCollection) : [];
}

export function getRegionEntryByIso(iso) {
  if (!iso) {
    return null;
  }
  return getCachedRegionCatalog().find((entry) => entry.iso === iso) ?? null;
}

/** Фильтр видимых субъектов по ISO; null — показать все. */
export function applyRegionBoundsIsoFilter(map, visibleIsos) {
  if (!map?.getLayer) {
    return;
  }

  const filter =
    visibleIsos == null
      ? null
      : visibleIsos.length === 0
        ? ["==", ["get", "iso"], "__none__"]
        : ["match", ["get", "iso"], visibleIsos, true, false];

  [REGION_BOUNDS_FILL_LAYER_ID, REGION_BOUNDS_OUTLINE_LAYER_ID].forEach((layerId) => {
    if (map.getLayer(layerId)) {
      map.setFilter(layerId, filter);
    }
  });
}

export function setRegionBoundsSelectedIso(map, iso) {
  if (!map?.getSource || !map.getSource(REGION_BOUNDS_SOURCE_ID)) {
    return;
  }

  const state = mapsWithRegionHover.get(map) ?? {
    hoveredId: null,
    selectedId: null,
    attached: false
  };
  mapsWithRegionHover.set(map, state);

  if (state.selectedId != null && state.selectedId !== iso) {
    map.setFeatureState(
      { source: REGION_BOUNDS_SOURCE_ID, id: state.selectedId },
      { selected: false }
    );
  }

  if (iso != null) {
    map.setFeatureState({ source: REGION_BOUNDS_SOURCE_ID, id: iso }, { selected: true });
  }

  state.selectedId = iso ?? null;
}

export function flyToRegionBoundsFeature(map, feature, { padding = 48, maxZoom = 6, duration = 800 } = {}) {
  if (!map || !feature?.geometry) {
    return;
  }

  const bounds = bbox(feature);
  map.fitBounds(
    [
      [bounds[0], bounds[1]],
      [bounds[2], bounds[3]]
    ],
    { padding, maxZoom, duration }
  );
}

export function setRegionBoundsSelectHandler(handler) {
  regionSelectListener = typeof handler === "function" ? handler : null;
}

export function getRegionFeatureAtClick(map, event) {
  if (!map || !event?.point) {
    return null;
  }

  const hits = safeQueryRenderedFeatures(map, event.point).filter(
    (hit) => hit.layer?.id === REGION_BOUNDS_FILL_LAYER_ID
  );
  const feature = hits[0];
  if (!feature) {
    return null;
  }

  const iso = getRegionFeatureId(feature);
  return getRegionEntryByIso(iso) ?? {
    iso,
    name: getRegionFeatureTitle(feature),
    nameEn: feature.properties?.name_en || "",
    fo: feature.properties?.fo || "Прочие",
    feature
  };
}

function setRegionBoundsVisibility(map, visible) {
  const visibility = visible ? "visible" : "none";
  [REGION_BOUNDS_FILL_LAYER_ID, REGION_BOUNDS_OUTLINE_LAYER_ID].forEach((layerId) => {
    if (map.getLayer(layerId)) {
      map.setLayoutProperty(layerId, "visibility", visibility);
    }
  });
  if (!visible) {
    clearRegionHover(map);
  }
}

function applyRegionBoundsData(map, data) {
  const source = map.getSource(REGION_BOUNDS_SOURCE_ID);
  if (source && typeof source.setData === "function" && data) {
    source.setData(data);
  }
}

const mapsWithRegionHover = new WeakMap();
let regionHoverPopup = null;

function escapeHtml(text) {
  return String(text ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getRegionFeatureId(feature) {
  if (feature?.id != null && feature.id !== "") {
    return feature.id;
  }
  return null;
}

function getRegionFeatureTitle(feature) {
  const properties = feature?.properties ?? {};
  return properties.name || properties.name_en || properties.iso || "Регион";
}

function hideRegionHoverPopup() {
  if (regionHoverPopup) {
    regionHoverPopup.remove();
    regionHoverPopup = null;
  }
}

function showRegionHoverPopup(map, lngLat, title) {
  if (!regionHoverPopup) {
    regionHoverPopup = new mapboxgl.Popup({
      closeButton: false,
      closeOnClick: false,
      closeOnMove: false,
      offset: 12,
      className: "point-hover-tooltip region-hover-tooltip"
    });
  }

  regionHoverPopup
    .setLngLat(lngLat)
    .setHTML(`<div class="point-tooltip-name-ru">${escapeHtml(title)}</div>`)
    .addTo(map);

  const popupElement = regionHoverPopup.getElement();
  popupElement?.classList.add("point-hover-tooltip--visible");
}

function clearRegionHover(map) {
  const hoveredId = mapsWithRegionHover.get(map)?.hoveredId;
  if (hoveredId != null && map.getSource(REGION_BOUNDS_SOURCE_ID)) {
    map.setFeatureState(
      { source: REGION_BOUNDS_SOURCE_ID, id: hoveredId },
      { hover: false }
    );
  }
  const state = mapsWithRegionHover.get(map);
  if (state) {
    state.hoveredId = null;
  }
  hideRegionHoverPopup();
}

function hasPointLayerUnderCursor(map, point) {
  const hits = safeQueryRenderedFeatures(map, point);
  return hits.some((hit) => {
    const type = hit.layer?.type;
    return type === "circle" || type === "symbol";
  });
}

function setRegionHover(map, feature, lngLat, point) {
  const nextId = getRegionFeatureId(feature);
  const state = mapsWithRegionHover.get(map) ?? { hoveredId: null, selectedId: null, attached: false };
  mapsWithRegionHover.set(map, state);

  if (state.hoveredId != null && state.hoveredId !== nextId) {
    map.setFeatureState(
      { source: REGION_BOUNDS_SOURCE_ID, id: state.hoveredId },
      { hover: false }
    );
  }

  if (nextId != null && state.hoveredId !== nextId) {
    map.setFeatureState({ source: REGION_BOUNDS_SOURCE_ID, id: nextId }, { hover: true });
  }
  state.hoveredId = nextId;

  if (hasPointLayerUnderCursor(map, point)) {
    hideRegionHoverPopup();
    return;
  }

  showRegionHoverPopup(map, lngLat, getRegionFeatureTitle(feature));
}

function attachRegionHoverHandlers(map) {
  const state = mapsWithRegionHover.get(map) ?? { hoveredId: null, selectedId: null, attached: false };
  mapsWithRegionHover.set(map, state);
  if (state.attached) {
    return;
  }
  state.attached = true;

  map.on("mousemove", REGION_BOUNDS_FILL_LAYER_ID, (event) => {
    const feature = event.features?.[0];
    if (!feature) {
      return;
    }
    applyMapCursor(map, "pointer");
    setRegionHover(map, feature, event.lngLat, event.point);
  });

  map.on("mouseleave", REGION_BOUNDS_FILL_LAYER_ID, () => {
    applyMapCursor(map, "");
    clearRegionHover(map);
  });

  map.on("click", REGION_BOUNDS_FILL_LAYER_ID, (event) => {
    if (hasPointLayerUnderCursor(map, event.point)) {
      return;
    }
    const feature = event.features?.[0];
    if (!feature) {
      return;
    }
    const iso = getRegionFeatureId(feature);
    const entry = getRegionEntryByIso(iso) ?? {
      iso,
      name: getRegionFeatureTitle(feature),
      nameEn: feature.properties?.name_en || "",
      fo: feature.properties?.fo || "Прочие",
      feature
    };
    regionSelectListener?.(entry);
  });
}

/** Добавляет контуры субъектов РФ. По умолчанию слой скрыт. */
export function addRegionBoundsLayer(map, { loadData = false } = {}) {
  if (!map) {
    return;
  }

  if (!map.getSource(REGION_BOUNDS_SOURCE_ID)) {
    map.addSource(REGION_BOUNDS_SOURCE_ID, {
      type: "geojson",
      data: EMPTY_COLLECTION,
      promoteId: "iso",
      generateId: false
    });
  }

  if (loadData) {
    loadRegionBoundsGeoJSON()
      .then((data) => {
        applyRegionBoundsData(map, data);
      })
      .catch((error) => {
        console.error("Не удалось загрузить границы регионов России", error);
      });
  }


  const beforeId = getFirstLocationsLayerId(map);

  if (!map.getLayer(REGION_BOUNDS_FILL_LAYER_ID)) {
    map.addLayer(
      {
        id: REGION_BOUNDS_FILL_LAYER_ID,
        type: "fill",
        source: REGION_BOUNDS_SOURCE_ID,
        layout: {
          visibility: "none"
        },
        paint: buildFillPaint()
      },
      beforeId
    );
  }

  if (!map.getLayer(REGION_BOUNDS_OUTLINE_LAYER_ID)) {
    map.addLayer(
      {
        id: REGION_BOUNDS_OUTLINE_LAYER_ID,
        type: "line",
        source: REGION_BOUNDS_SOURCE_ID,
        layout: {
          visibility: "none"
        },
        paint: buildOutlinePaint()
      },
      beforeId
    );
  }

  attachRegionHoverHandlers(map);
  applyPaintToRegionBoundsLayers(map, regionBoundsPaintSettings);
}

/** Включает или выключает контуры регионов. */
export function setRegionBoundsEnabled(map, enabled) {
  if (!map) {
    return;
  }

  addRegionBoundsLayer(map, { loadData: enabled });
  setRegionBoundsVisibility(map, enabled);
}
