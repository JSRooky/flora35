import mapboxgl from "mapbox-gl";
import { bbox, booleanPointInPolygon, center, point } from "@turf/turf";
import {
  BOUNDS_LAYER_DEFINITIONS,
  BOUNDS_LAYER_KINDS,
  buildBoundsFeatureDocId,
  getBoundsFeatureKey,
  getBoundsFeatureTitle
} from "../firebase/boundsCollectionFirestore";
import {
  BOUNDS_DISPLAY_FIELDS,
  formatBoundsPropertyValue,
  getBoundsFeatureAreaDisplay,
  getBoundsFeatureFillColor
} from "./boundsPropertyLabels";
import { loadBoundsLayerGeoJSONFromFirestore } from "../firebase/loadBoundsFromFirestore";
import { applyMapCursor, getToolFeatures, getFirstLocationsLayerId } from "./addLocationsLayer";
import { safeQueryRenderedFeatures } from "./safeQueryRenderedFeatures";

const EMPTY_COLLECTION = {
  type: "FeatureCollection",
  features: []
};

const dataCache = new Map();
const mapsWithCursorHandlers = new WeakSet();
let boundsFeaturePopup = null;
let boundsFeaturePopupDetailsHandler = null;
let boundsFeaturePopupIsolateHandler = null;

const TITLE_PROPERTY_KEYS = new Set(["title", "NAME_RU", "NAME"]);

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function updateBoundsFeatureIsolateButton(button, isIsolated) {
  if (!button) {
    return;
  }

  if (isIsolated) {
    button.textContent = "Показать все";
    button.title = "Снова показать остальные полигоны ООПТ и заповедников";
    return;
  }

  button.textContent = "Изолировать";
  button.title = "Скрыть остальные полигоны ООПТ и заповедников";
}

function buildBoundsFeaturePopupHtml(hit, { pointsCount = null, speciesCount = null, isIsolated = false } = {}) {
  const layerId = hit.definition.id;
  const properties = hit.feature.properties ?? {};
  const title = getBoundsFeatureTitle(properties) || "ООПТ";
  const accentColor = getBoundsFeatureFillColor(layerId, properties);
  const fields = BOUNDS_DISPLAY_FIELDS[layerId] ?? [];
  const detailRows = fields.flatMap((field) => {
    if (TITLE_PROPERTY_KEYS.has(field.key)) {
      return [];
    }

    const value = formatBoundsPropertyValue(field, properties);

    if (value == null) {
      return [];
    }

    return [
      '<div class="shared-point-popup-row">',
      `<span class="shared-point-popup-label">${escapeHtml(field.label)}:</span>`,
      `<span class="shared-point-popup-value">${escapeHtml(value)}</span>`,
      "</div>"
    ];
  });
  const areaDisplay = getBoundsFeatureAreaDisplay(layerId, hit.feature);

  if (areaDisplay) {
    detailRows.push(
      '<div class="shared-point-popup-row">',
      '<span class="shared-point-popup-label">Площадь:</span>',
      `<span class="shared-point-popup-value">${escapeHtml(areaDisplay)}</span>`,
      "</div>"
    );
  }

  if (pointsCount != null) {
    detailRows.push(
      '<div class="shared-point-popup-row">',
      '<span class="shared-point-popup-label">Точек:</span>',
      `<span class="shared-point-popup-value">${escapeHtml(String(pointsCount))}</span>`,
      "</div>"
    );
  }

  if (speciesCount != null) {
    detailRows.push(
      '<div class="shared-point-popup-row">',
      '<span class="shared-point-popup-label">Видов:</span>',
      `<span class="shared-point-popup-value">${escapeHtml(String(speciesCount))}</span>`,
      "</div>"
    );
  }

  const lines = [
    '<div class="bounds-feature-popup-heading">',
    `<span class="bounds-feature-popup-dot" style="background-color:${escapeHtml(accentColor)}"></span>`,
    `<div class="bounds-feature-popup-title">${escapeHtml(title)}</div>`,
    "</div>"
  ];

  if (detailRows.length > 0) {
    lines.push(`<div class="shared-point-popup-details">${detailRows.join("")}</div>`);
  }

  lines.push(
    '<div class="feature-popup-actions shared-point-popup-actions">',
    '<button type="button" class="feature-popup-action-btn" data-bounds-feature-details>Подробнее</button>',
    `<button type="button" class="feature-popup-action-btn" data-bounds-feature-isolate title="${escapeHtml(
      isIsolated
        ? "Снова показать остальные полигоны ООПТ и заповедников"
        : "Скрыть остальные полигоны ООПТ и заповедников"
    )}">${escapeHtml(isIsolated ? "Показать все" : "Изолировать")}</button>`,
    "</div>"
  );

  return lines.join("");
}

/**
 * Ключ объекта bounds для featureVisibility — в том же формате, что и ключи
 * каталога панели ООПТ (см. buildBoundsCatalogFromGeoJSON), чтобы включение
 * видимости через popup совпадало с состоянием чекбоксов в панели.
 */
export function getBoundsFeatureVisibilityKey(hit) {
  const layerId = hit?.definition?.id;
  const feature = hit?.feature;

  if (!layerId || !feature) {
    return null;
  }

  const cached = dataCache.get(layerId);
  const featureIndex = cached ? cached.features.indexOf(feature) : -1;

  return getBoundsFeatureKey(layerId, feature.properties ?? {}, featureIndex >= 0 ? featureIndex : 0);
}

function getBoundsFeaturePopupCoordinates(feature, lngLat) {
  if (lngLat && typeof lngLat.lng === "number" && typeof lngLat.lat === "number") {
    return [lngLat.lng, lngLat.lat];
  }

  return center(feature).geometry.coordinates;
}

/** Показывает всплывающее окно со сведениями о полигоне bounds. */
export function showBoundsFeaturePopup(
  map,
  hit,
  lngLat,
  { onOpenDetails, onIsolate, isIsolated = false, filters = {} } = {}
) {
  if (!map || !hit?.definition || !hit?.feature) {
    return;
  }

  hideBoundsFeaturePopup();

  const pointsSummary = getBoundsContainedPointsSummary(hit.feature, filters);
  const speciesSummary = getBoundsContainedSpeciesSummary(hit.feature, filters);

  const popup = new mapboxgl.Popup({
    closeButton: true,
    closeOnClick: false,
    className: "bounds-feature-popup",
    anchor: "bottom",
    offset: 12,
    maxWidth: "320px"
  });

  popup
    .setLngLat(getBoundsFeaturePopupCoordinates(hit.feature, lngLat))
    .setHTML(
      buildBoundsFeaturePopupHtml(hit, {
        pointsCount: pointsSummary.count,
        speciesCount: speciesSummary.count,
        isIsolated
      })
    );

  popup.on("close", () => {
    if (boundsFeaturePopup !== popup) {
      return;
    }

    boundsFeaturePopup = null;
    boundsFeaturePopupDetailsHandler = null;
    boundsFeaturePopupIsolateHandler = null;
  });

  boundsFeaturePopup = popup;
  popup.addTo(map);

  const popupElement = popup.getElement();

  if (onOpenDetails) {
    const detailsButton = popupElement?.querySelector("[data-bounds-feature-details]");

    if (detailsButton) {
      boundsFeaturePopupDetailsHandler = (event) => {
        event.preventDefault();
        onOpenDetails(hit);
      };
      detailsButton.addEventListener("click", boundsFeaturePopupDetailsHandler);
    }
  }

  if (onIsolate) {
    const isolateButton = popupElement?.querySelector("[data-bounds-feature-isolate]");

    if (isolateButton) {
      boundsFeaturePopupIsolateHandler = (event) => {
        event.preventDefault();
        const nextIsIsolated = onIsolate(hit);
        updateBoundsFeatureIsolateButton(
          isolateButton,
          typeof nextIsIsolated === "boolean" ? nextIsIsolated : false
        );
      };
      isolateButton.addEventListener("click", boundsFeaturePopupIsolateHandler);
    }
  }
}

/** Скрывает и снимает обработчики popup со сведениями о полигоне bounds. */
export function hideBoundsFeaturePopup() {
  const popupElement = boundsFeaturePopup?.getElement();

  if (boundsFeaturePopupDetailsHandler && popupElement) {
    const detailsButton = popupElement.querySelector("[data-bounds-feature-details]");

    if (detailsButton) {
      detailsButton.removeEventListener("click", boundsFeaturePopupDetailsHandler);
    }
  }

  if (boundsFeaturePopupIsolateHandler && popupElement) {
    const isolateButton = popupElement.querySelector("[data-bounds-feature-isolate]");

    if (isolateButton) {
      isolateButton.removeEventListener("click", boundsFeaturePopupIsolateHandler);
    }
  }

  boundsFeaturePopupDetailsHandler = null;
  boundsFeaturePopupIsolateHandler = null;

  if (!boundsFeaturePopup) {
    return;
  }

  boundsFeaturePopup.remove();
  boundsFeaturePopup = null;
}

/** Приближает карту к полигону и показывает popup после анимации. */
export function flyToBoundsFeature(map, feature, hit, options = {}) {
  if (!map || !feature?.geometry || !hit) {
    return;
  }

  const {
    padding = 48,
    maxZoom = 11,
    duration = 800,
    onOpenDetails,
    onIsolate,
    isIsolated = false,
    filters = {}
  } = options;
  const bounds = bbox(feature);
  let popupShown = false;

  const showPopupOnce = () => {
    if (popupShown) {
      return;
    }

    popupShown = true;
    showBoundsFeaturePopup(map, hit, null, { onOpenDetails, onIsolate, isIsolated, filters });
  };

  map.once("moveend", showPopupOnce);
  map.fitBounds(
    [
      [bounds[0], bounds[1]],
      [bounds[2], bounds[3]]
    ],
    { padding, maxZoom, duration }
  );

  setTimeout(showPopupOnce, duration + 100);
}

function getInteractiveBoundsLayerIds(map) {
  return BOUNDS_LAYER_DEFINITIONS.filter(
    (definition) => definition.kind === BOUNDS_LAYER_KINDS.POLYGON
  )
    .flatMap((definition) => [getFillLayerId(definition.id), getOutlineLayerId(definition.id)])
    .filter(
      (layerId) =>
        map.getLayer(layerId) && map.getLayoutProperty(layerId, "visibility") !== "none"
    );
}

function getBoundsLayerDefinitionForFeatureLayerId(layerId) {
  return BOUNDS_LAYER_DEFINITIONS.find(
    (definition) =>
      layerId === getFillLayerId(definition.id) || layerId === getOutlineLayerId(definition.id)
  );
}

function getFeatureIdentityKey(properties = {}) {
  const rawKey = properties.nid ?? properties.OSM_ID ?? properties.id;
  return rawKey != null ? String(rawKey) : null;
}

/**
 * mapboxgl.queryRenderedFeatures возвращает геометрию, обрезанную по тайлу —
 * для больших полигонов (например, заповедников) это делает площадь и форму
 * некорректными. Подменяем на полную геометрию из уже загруженного GeoJSON.
 */
function resolveFullBoundsFeature(definition, feature) {
  const cached = dataCache.get(definition.id);
  const targetKey = getFeatureIdentityKey(feature.properties);

  if (!cached || targetKey == null) {
    return feature;
  }

  const fullFeature = cached.features.find(
    (candidate) => getFeatureIdentityKey(candidate.properties) === targetKey
  );

  return fullFeature ?? feature;
}

function findBoundsFeatureAtPoint(map, point) {
  const layerIds = getInteractiveBoundsLayerIds(map);
  if (!layerIds.length) {
    return null;
  }

  const features = safeQueryRenderedFeatures(map, point, { layers: layerIds });
  if (!features.length) {
    return null;
  }

  const feature = features[0];
  const definition = getBoundsLayerDefinitionForFeatureLayerId(feature.layer.id);
  if (!definition) {
    return null;
  }

  return { definition, feature: resolveFullBoundsFeature(definition, feature) };
}

const PAINT_BY_LAYER = {
  nature_reserve_polygon: {
    fillColor: [
      "match",
      ["get", "BOUNDARY"],
      "national_park",
      "#52966a",
      "protected_area",
      "#5fa67a",
      "boundary",
      "#78b088",
      "#68a878"
    ],
    outlineColor: [
      "match",
      ["get", "BOUNDARY"],
      "national_park",
      "#3d7352",
      "protected_area",
      "#4a8260",
      "boundary",
      "#5f9470",
      "#508a62"
    ],
    fillOpacity: 0.22
  },
  oopt_pol: {
    fillColor: "#6b94c4",
    outlineColor: "#4a72a8",
    fillOpacity: 0.22
  }
};

function getSourceId(layerId) {
  return `bounds-${layerId}`;
}

function getFillLayerId(layerId) {
  return `bounds-${layerId}-fill`;
}

function getOutlineLayerId(layerId) {
  return `bounds-${layerId}-outline`;
}

function getCircleLayerId(layerId) {
  return `bounds-${layerId}-circle`;
}

function getMapLayerIds(definition) {
  if (definition.kind === BOUNDS_LAYER_KINDS.POINT) {
    return [getCircleLayerId(definition.id)];
  }

  return [getFillLayerId(definition.id), getOutlineLayerId(definition.id)];
}

function getVisibleDocIdsForLayer(layerId, featureVisibility = {}) {
  const prefix = `${layerId}:`;

  return new Set(
    Object.entries(featureVisibility)
      .filter(([featureKey, visible]) => visible && featureKey.startsWith(prefix))
      .map(([featureKey]) => featureKey.slice(prefix.length))
  );
}

function filterGeoJSONByDocIds(fullGeojson, visibleDocIds) {
  const features = fullGeojson.features.filter((feature, featureIndex) => {
    const docId = buildBoundsFeatureDocId(feature.properties ?? {}, featureIndex);
    return visibleDocIds.has(docId);
  });

  return {
    type: "FeatureCollection",
    features
  };
}

/** Возвращает полигон границ в точке клика или null. */
export function getBoundsFeatureAtClick(map, event) {
  if (!map || !event?.point) {
    return null;
  }

  const hit = findBoundsFeatureAtPoint(map, event.point);
  if (!hit) {
    return null;
  }

  return hit;
}

/** Проверяет, попадает ли точка клика в видимый полигон границ. */
export function isBoundsFeatureAtPoint(map, point) {
  return Boolean(map && point && findBoundsFeatureAtPoint(map, point));
}

function attachBoundsCursorHandlers(map, definition) {
  if (definition.kind !== BOUNDS_LAYER_KINDS.POLYGON) {
    return;
  }

  [getFillLayerId(definition.id), getOutlineLayerId(definition.id)].forEach((layerId) => {
    // applyMapCursor уважает setMapCursorOverride (например, crosshair при
    // указании места находки) — прямая запись в style.cursor его перебивала бы.
    map.on("mouseenter", layerId, () => {
      applyMapCursor(map, "pointer");
    });

    map.on("mouseleave", layerId, () => {
      applyMapCursor(map, "");
    });
  });
}

function attachBoundsInteractions(map) {
  if (mapsWithCursorHandlers.has(map)) {
    return;
  }

  mapsWithCursorHandlers.add(map);
  BOUNDS_LAYER_DEFINITIONS.forEach((definition) => attachBoundsCursorHandlers(map, definition));
}

function setLayersVisibility(map, definition, visible) {
  const visibility = visible ? "visible" : "none";
  getMapLayerIds(definition).forEach((layerId) => {
    map.setLayoutProperty(layerId, "visibility", visibility);
  });
}

function ensureBoundsLayer(map, definition) {
  const sourceId = getSourceId(definition.id);
  const paint = PAINT_BY_LAYER[definition.id];

  if (!map.getSource(sourceId)) {
    map.addSource(sourceId, {
      type: "geojson",
      data: EMPTY_COLLECTION
    });
  }

  const beforeId = getFirstLocationsLayerId(map);

  if (definition.kind === BOUNDS_LAYER_KINDS.POLYGON) {
    const fillLayerId = getFillLayerId(definition.id);
    const outlineLayerId = getOutlineLayerId(definition.id);

    if (!map.getLayer(fillLayerId)) {
      map.addLayer(
        {
          id: fillLayerId,
          type: "fill",
          source: sourceId,
          layout: {
            visibility: "none"
          },
          paint: {
            "fill-color": paint.fillColor,
            "fill-opacity": paint.fillOpacity ?? 0.28,
            "fill-antialias": true
          }
        },
        beforeId
      );
    }

    if (!map.getLayer(outlineLayerId)) {
      map.addLayer(
        {
          id: outlineLayerId,
          type: "line",
          source: sourceId,
          layout: {
            visibility: "none"
          },
          paint: {
            "line-color": paint.outlineColor,
            "line-width": 1.25,
            "line-opacity": 0.55
          }
        },
        beforeId
      );
    }

    attachBoundsInteractions(map);
    return;
  }

  const circleLayerId = getCircleLayerId(definition.id);

  if (!map.getLayer(circleLayerId)) {
    map.addLayer(
      {
        id: circleLayerId,
        type: "circle",
        source: sourceId,
        layout: {
          visibility: "none"
        },
        paint: {
          "circle-color": paint.circleColor,
          "circle-radius": paint.circleRadius ?? 6,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 1.5,
          "circle-opacity": 0.9
        }
      },
      beforeId
    );
  }
}

/** Добавляет на карту пустые слои границ (данные подгружаются из Firestore по запросу). */
export function addBoundsLayers(map) {
  BOUNDS_LAYER_DEFINITIONS.forEach((definition) => ensureBoundsLayer(map, definition));
}

/** Сбрасывает кэш GeoJSON, загруженный из Firestore. */
export function clearBoundsLayerCache() {
  dataCache.clear();
}

/** Загружает GeoJSON слоя из Firestore или возвращает кэш. */
export async function ensureBoundsLayerGeoJSON(layerId) {
  if (dataCache.has(layerId)) {
    return dataCache.get(layerId);
  }

  const geojson = await loadBoundsLayerGeoJSONFromFirestore(layerId);

  if (!geojson.features.length) {
    throw new Error(
      "В Firestore нет данных для этого слоя. Выполните npm run import:firestore-bounds"
    );
  }

  dataCache.set(layerId, geojson);
  return geojson;
}

/** Возвращает уже загруженный GeoJSON слоя из кэша без обращения к Firestore. */
export function getCachedBoundsLayerGeoJSON(layerId) {
  return dataCache.get(layerId) ?? null;
}

function applyLayerFeatureVisibility(map, definition, featureVisibility = {}) {
  const layerId = definition.id;
  const source = map.getSource(getSourceId(layerId));
  const visibleDocIds = getVisibleDocIdsForLayer(layerId, featureVisibility);

  if (!visibleDocIds.size) {
    if (source) {
      source.setData(EMPTY_COLLECTION);
    }
    setLayersVisibility(map, definition, false);
    return;
  }

  const fullGeojson = dataCache.get(layerId);
  if (!fullGeojson) {
    return;
  }

  source.setData(filterGeoJSONByDocIds(fullGeojson, visibleDocIds));
  setLayersVisibility(map, definition, true);
}

/** Синхронизирует видимость отдельных объектов bounds на карте. */
export async function syncBoundsFeaturesVisibility(map, featureVisibility = {}) {
  const errors = {};

  BOUNDS_LAYER_DEFINITIONS.forEach((definition) => ensureBoundsLayer(map, definition));

  const layersNeedingData = BOUNDS_LAYER_DEFINITIONS.filter(({ id }) =>
    getVisibleDocIdsForLayer(id, featureVisibility).size
  );

  await Promise.all(
    layersNeedingData.map(async (definition) => {
      try {
        await ensureBoundsLayerGeoJSON(definition.id);
      } catch (error) {
        errors[definition.id] = error?.message || String(error);
      }
    })
  );

  BOUNDS_LAYER_DEFINITIONS.forEach((definition) => {
    try {
      applyLayerFeatureVisibility(map, definition, featureVisibility);
    } catch (error) {
      errors[definition.id] = error?.message || String(error);
    }
  });

  return errors;
}

/**
 * Считает уникальные виды (по name_latin, иначе name_ru) среди точек находок
 * из текущей выборки, попавших внутрь полигона ООПТ или заповедника.
 * В список попадают только виды с русским или латинским названием
 * (плейсхолдер «Без названия» не используется).
 */
export function getBoundsContainedSpeciesSummary(boundsFeature, filters = {}) {
  if (!boundsFeature?.geometry) {
    return { count: 0, species: [] };
  }

  const speciesByKey = new Map();

  getToolFeatures(filters).forEach((feature) => {
    const coordinates = feature.geometry?.coordinates;
    if (!coordinates) {
      return;
    }

    if (!booleanPointInPolygon(point(coordinates), boundsFeature)) {
      return;
    }

    const nameLatin = String(feature.properties?.name_latin ?? "").trim();
    const nameRu = String(feature.properties?.name_ru ?? "").trim();
    const speciesKey = nameLatin || nameRu;

    if (!speciesKey || speciesByKey.has(speciesKey)) {
      return;
    }

    speciesByKey.set(speciesKey, {
      nameRu,
      nameLatin,
      regnum: feature.properties?.regnum || "",
      family: feature.properties?.family || "",
      point: feature
    });
  });

  const species = [...speciesByKey.values()]
    .filter((entry) => entry.nameRu || entry.nameLatin)
    .sort((left, right) => {
      const leftLabel = left.nameRu || left.nameLatin;
      const rightLabel = right.nameRu || right.nameLatin;
      return leftLabel.localeCompare(rightLabel, "ru");
    });

  return {
    count: species.length,
    species
  };
}

/** Считает точки находок из текущей выборки, попавшие внутрь полигона ООПТ или заповедника. */
export function getBoundsContainedPointsSummary(boundsFeature, filters = {}) {
  if (!boundsFeature?.geometry) {
    return { count: 0, points: [] };
  }

  const points = getToolFeatures(filters)
    .filter((feature) => {
      const coordinates = feature.geometry?.coordinates;
      if (!coordinates) {
        return false;
      }

      return booleanPointInPolygon(point(coordinates), boundsFeature);
    })
    .sort((left, right) => {
      const nameA = left.properties?.name_ru ?? "";
      const nameB = right.properties?.name_ru ?? "";
      return nameA.localeCompare(nameB, "ru");
    });

  return {
    count: points.length,
    points
  };
}
