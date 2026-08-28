import mapboxgl from "mapbox-gl";
import { booleanPointInPolygon, point } from "@turf/turf";
import {
  formatPropertyValue,
  getPropertyLabel
} from "./featurePropertyLabels";
import { getFeatureCollection } from "../locations/loadPoints";
import { findGbifFeatureByKey, getGbifFeatureCount, getGbifFeaturesByIndices, getGbifColumnarTable, getGbifStoreGeneration } from "../gbif/gbifStore";
import {
  createDefaultGbifProcessingFilters,
  filterGbifTableIndices
} from "../gbif/gbifProcessingFilters";
import { findInatFeatureById, getInatFeatureCount, getInatFeaturesByIndices, getInatColumnarTable, getInatStoreGeneration } from "../inaturalist/inatStore";
import {
  createDefaultInatProcessingFilters,
  filterInatTableIndices
} from "../inaturalist/inatProcessingFilters";
import { getOverlayVersion } from "../names/nameRuCache";
import { parseFoundYear } from "./yearBounds";
import {
  setCompactGbifProcessingFilters,
  setCompactHiddenPointKeys,
  setCompactInatProcessingFilters,
  setCompactLocationFilters
} from "../map/compactFilterState";
import {
  addCompactGridLayers,
  buildCompactViewportFromGeojson,
  compactCircleRadiusExpression,
  compactDensityFalseFilter,
  compactGridLayerIds,
  easeToCompactDensityCell,
  ensureCompactViewportSync,
  isCompactDensityFeature,
  isRegionContourPickActive,
  isCompactPointDisplayEnabled,
  requestCompactViewportSync
} from "../map/compactPointDisplay";
import { shouldSuppressLoadedPointLayers } from "../map/regionLoadSummary";
import {
  GBIF_SOURCE_ID,
  getGbifInteractiveLayerIds,
  getGbifSourceIds,
  isGbifClusterPieChartsEnabled,
  isGbifLayerVisible,
  setGbifData,
  setGbifHiddenPointFeatureKeys
} from "./addGbifLayer";
import {
  INAT_SOURCE_ID,
  getInatInteractiveLayerIds,
  getInatSourceIds,
  isInatClusterPieChartsEnabled,
  isInatLayerVisible,
  setInatData,
  setInatHiddenPointFeatureKeys
} from "./addInatLayer";
import { getTempLayerFeatureGroups, getVisibleTempLayerFeatures } from "../tempLayers/tempLayerStore";
import { isTempLayersVisible, getTempLayersInteractiveLayerIds, getTempLayersClusterSourceIds, isTempLayersClusterPieChartsEnabled, getTempLayerPieSegments, setTempLayersHiddenPointFeatureKeys, setTempLayersData, setTempLayersLocationFeatureFilter } from "./addTempLayersLayer";
import {
  getMergedFeatures,
  getMergedInteractiveLayerIds
} from "./addMergedLayer";
import {
  concatFeatures,
  hashLocationFilters,
  slimMapFeatures
} from "./mapPerformance";
import {
  SPECIES_SEARCH_FILTER_KEY,
  featureMatchesSpeciesSearch
} from "../locations/speciesSearchFilter";
import {
  REGION_SPECIES_ALLOWLIST_KEY,
  featureMatchesRegionSpeciesAllowlist
} from "../locations/regionSpeciesAllowlist";
import {
  applyRedBookLocationsFilter,
  getRedBookFeatures,
  getRedBookInteractiveLayerIds,
  setRedBookHiddenPointFeatureKeys
} from "./addRedBookLayer";
import { enrichFeaturesWithAttribution } from "../dataWork/pointAttributionOverlay";
import {
  DEFAULT_CLUSTER_COLOR,
  DEFAULT_POINT_COLOR,
  REGNUM_COLORS,
  getPointColorExpression,
  getPointColorForRegnum
} from "./pointColors";
import { safeQueryRenderedFeatures } from "./safeQueryRenderedFeatures";
import {
  cancelClusterHoverRequest,
  isHoverTooltipsEnabled,
  removePointHoverPopup,
  setHoverTooltipsEnabled as setHoverTooltipsEnabledInternal,
  showClusterRegnumHover,
  showPointHoverPopup
} from "./pointHoverTooltips";
import {
  DENSE_PILES_CLUSTER_LAYER_ID,
  DENSE_PILES_COUNT_LAYER_ID,
  DENSE_PILES_SOURCE_ID,
  ensureDensePilesLayers,
  getDensePileMinSize,
  listDensePiles,
  mergeDensePileLists,
  partitionFeaturesByDensePiles,
  removeDensePilesLayers,
  setDensePilesData
} from "./densePiles";
import {
  fitMapToCoincidentSpread,
  getCoincidentCoordKeys,
  getFeatureCoordinates,
  getSpreadPileFitBounds,
  restoreOriginalCoordinates,
  spreadCoincidentFeatures
} from "./spreadCoincidentPoints";

export { getPointColorForRegnum } from "./pointColors";

const PUBLIC_URL = process.env.PUBLIC_URL || "";
const PLANT_IMAGE = `${PUBLIC_URL}/images/plant.svg`;
const ANIMAL_IMAGE = `${PUBLIC_URL}/images/animal.svg`;
const MAP_PIN_IMAGE = `${PUBLIC_URL}/images/map_pin.svg`;
const MAP_PIN_SIZE_PX = 32;
/** Исходный цвет центра булавки в map_pin.svg (заменяется при открытии по share-ссылке). */
const MAP_PIN_CENTER_FILL = "#e51e1e";
/** Смещение якоря: точка привязки на 4 px выше нижнего края (остриё — на координатах). */
const MAP_PIN_ANCHOR_OFFSET_Y_PX = 4;

const CLUSTER_OPTIONS = {
  clusterMaxZoom: 14,
  clusterRadius: 50
};

/** Ключ фильтра GeoJSON-полигона в объекте filters для applyLocationsFilter. */
export const WITHIN_FEATURE_FILTER_KEY = "__withinFeature";

/** Ключ массива стабильных id скрытых точек в объекте filters. */
export const HIDDEN_FEATURE_KEYS_FILTER_KEY = "__hiddenFeatureKeys";

/** Скрывать точки без атрибута found_year. */
export const REQUIRE_FOUND_YEAR_FILTER_KEY = "__requireFoundYear";

export { SPECIES_SEARCH_FILTER_KEY } from "../locations/speciesSearchFilter";

const SHARE_PIN_CENTER_COLORS = [
  REGNUM_COLORS.plantae,
  REGNUM_COLORS.animalia,
  REGNUM_COLORS.fungi,
  REGNUM_COLORS.protozoa,
  MAP_PIN_CENTER_FILL,
  "#2563eb",
  "#ca8a04",
  "#9333ea",
  "#0891b2",
  "#db2777",
  "#059669"
];

const MARKER_RADIUS = 5;

const CLUSTER_REGNUM_KEYS = ["plantae", "animalia", "fungi", "protozoa"];

const CLUSTER_REGNUM_PROPERTIES = Object.fromEntries(
  CLUSTER_REGNUM_KEYS.map((regnum) => [
    regnum,
    [
      "+",
      [
        "case",
        ["==", ["downcase", ["coalesce", ["get", "regnum"], ""]], regnum],
        1,
        0
      ]
    ]
  ])
);

// Модульное состояние слоя: карта одна, пересборка слоёв идёт через rebuildLocationsLayers.
let locationsData = null;
/** По умолчанию один clustered-source (дешевле при больших N, чем clusterByRegnum). */
let clusterByRegnum = false;
let clusteringEnabled = true;
let clusterPieChartsEnabled = false;
/** Режим сверхплотных куч: без Mapbox-кластеризации, только кастомные кластеры ≥10. */
let denseClustersHighlightEnabled = false;
/** Раскрытые сверхплотные кучи (показывают отдельные точки). */
let expandedDensePileKeys = new Set();
/** Ключи lng,lat совпадающих точек, разведённых по клику на обычный кластер. */
let expandedCoincidentKeys = new Set();
/** Члены сверхплотных кластеров: id → features[]. */
let locationsDensePileMembers = new Map();
let markersVisible = true;
let clusterPieChartMarkersOnScreen = {};
let clusterPieChartRenderHandler = null;
let clusterPieChartMap = null;
let currentFilters = {};
/** Стабильные ключи точек, скрытых пользователем (исключаются из карты и инструментов). */
let hiddenPointKeysSet = new Set();
/** Клиентские фильтры панели «Обработка внешних данных» (не влияют на локальный слой). */
let gbifProcessingFilters = createDefaultGbifProcessingFilters();
let inatProcessingFilters = createDefaultInatProcessingFilters();
/** Совместная кластеризация GBIF+iNat в одном источнике. */
let externalUnifiedClusteringEnabled = false;
let externalLayerIncludeFlags = { includeGbif: true, includeInat: true };
/** Кэш видимых GBIF после processing + locationFilters. */
let visibleGbifCache = {
  locationFilters: null,
  processingFilters: null,
  generation: -1,
  overlayVersion: -1,
  filtersHash: null,
  features: null
};
/** Кэш видимых iNaturalist после processing + locationFilters. */
let visibleInatCache = {
  locationFilters: null,
  processingFilters: null,
  generation: -1,
  overlayVersion: -1,
  filtersHash: null,
  features: null
};
/** Processed GBIF/iNat без locationFilters — для инкрементального year scrub. */
let processedGbifCache = {
  generation: -1,
  overlayVersion: -1,
  processingFilters: null,
  features: null
};
let processedInatCache = {
  generation: -1,
  overlayVersion: -1,
  processingFilters: null,
  features: null
};
let currentFilteredFeatures = [];
let speciesPointCountsOnMap = new Map();
let interactionHandlers = null;
let onClusterExpandedCallback = null;
let onPointClickCallback = null;
let onMapBackgroundClickCallback = null;
/** Колбэк после раскрытия плотной группы (карта или список). */
let onDensePileExpandedCallback = null;
let clusterExpandRequestId = 0;
let mapCursorOverride = null;
let sharedPointPinMarker = null;
let sharedPointPinFeatureKey = null;
let sharedPointPinObjectUrl = null;
let sharedPointPopup = null;
let sharedPointPopupDetailsHandler = null;
let selectedPointPinMarker = null;
let selectedPointPinFeatureKey = null;
let selectedPointPinObjectUrl = null;

/** Источники точек для инструментов (радиус, область, heatmap…). */
let toolIncludeLocal = true;
let toolIncludeGbif = true;
let toolIncludeInat = true;
let toolIncludeMerged = true;
let toolIncludeRedBook = true;

/** Поля, показываемые в компактном окне при открытии share-ссылки. */
const SHARED_POINT_POPUP_FIELDS = ["regnum", "family", "found_year", "status"];
let mapPinSvgTemplatePromise = null;

/** Применяет курсор карты с учётом принудительного override (см. setMapCursorOverride). */
export function applyMapCursor(map, cursor) {
  map.getCanvas().style.cursor = mapCursorOverride ?? cursor;
}

/** Принудительный курсор карты (например, crosshair при указании места находки). */
export function setMapCursorOverride(map, cursor) {
  mapCursorOverride = cursor;

  if (map?.getCanvas()) {
    applyMapCursor(map, cursor ?? "");
  }
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** HTML-подсказка с русским и латинским названием вида. */
function buildPointTooltipHtml(nameRu, nameLatin, speciesPointCount) {
  const lines = [];

  if (nameRu) {
    lines.push(`<div class="point-tooltip-name-ru">${escapeHtml(nameRu)}</div>`);
  }

  if (nameLatin) {
    lines.push(`<div class="point-tooltip-name-latin">${escapeHtml(nameLatin)}</div>`);
  }

  if (lines.length === 0) {
    return '<div class="point-tooltip-name-ru">Точка данных</div>';
  }

  if (speciesPointCount > 0) {
    lines.push(
      `<div class="point-tooltip-count">${formatClusterPointsCount(speciesPointCount)} на карте</div>`
    );
  }

  return lines.join("");
}

/** HTML компактной карточки точки (share-ссылка). */
function buildSharedPointPopupHtml(feature) {
  const properties = feature?.properties ?? {};
  const { name_ru: nameRu, name_latin: nameLatin } = properties;
  const title = nameRu || nameLatin || "Точка данных";
  const lines = [`<div class="shared-point-popup-title">${escapeHtml(title)}</div>`];

  if (nameRu && nameLatin) {
    lines.push(`<div class="shared-point-popup-subtitle">${escapeHtml(nameLatin)}</div>`);
  }

  const detailRows = SHARED_POINT_POPUP_FIELDS.flatMap((key) => {
    const value = properties[key];

    if (value == null || value === "") {
      return [];
    }

    return [
      `<div class="shared-point-popup-row">`,
      `<span class="shared-point-popup-label">${escapeHtml(getPropertyLabel(key))}:</span>`,
      `<span class="shared-point-popup-value">${escapeHtml(formatPropertyValue(key, value))}</span>`,
      `</div>`
    ];
  });

  if (detailRows.length > 0) {
    lines.push(`<div class="shared-point-popup-details">${detailRows.join("")}</div>`);
  }

  lines.push(
    '<div class="feature-popup-actions shared-point-popup-actions">',
    '<button type="button" class="feature-popup-action-btn" data-shared-point-details>Подробнее</button>',
    "</div>"
  );

  return lines.join("");
}

function getFeatureSpeciesKey(feature) {
  const { name_latin: nameLatin, name_ru: nameRu } = feature?.properties ?? {};
  return nameLatin || nameRu || "";
}

function rebuildSpeciesPointCountsOnMap() {
  const counts = new Map();

  currentFilteredFeatures.forEach((feature) => {
    const key = getFeatureSpeciesKey(feature);

    if (!key) {
      return;
    }

    counts.set(key, (counts.get(key) ?? 0) + 1);
  });

  speciesPointCountsOnMap = counts;
}

function getSpeciesPointCountOnMap(nameRu, nameLatin) {
  const key = nameLatin || nameRu || "";
  return key ? (speciesPointCountsOnMap.get(key) ?? 0) : 0;
}

function setCurrentFilteredFeatures(features) {
  currentFilteredFeatures = features;
  rebuildSpeciesPointCountsOnMap();
}

function formatClusterPointsCount(count) {
  const mod10 = count % 10;
  const mod100 = count % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return `${count} точка`;
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${count} точки`;
  }

  return `${count} точек`;
}

/** Mapbox Supercluster активен только если включена обычная кластеризация и не режим сверхплотных. */
function isMapboxClusteringActive() {
  if (isCompactPointDisplayEnabled()) {
    return false;
  }
  return clusteringEnabled && !denseClustersHighlightEnabled;
}

function getDensePileLayerIds() {
  if (!denseClustersHighlightEnabled) {
    return [];
  }

  return [DENSE_PILES_CLUSTER_LAYER_ID, DENSE_PILES_COUNT_LAYER_ID];
}

function getDensePileMembers(feature) {
  const key = feature?.properties?.dense_pile_key;
  if (!key) {
    return [];
  }

  return locationsDensePileMembers.get(`dense-${key}`) ?? [];
}

function getClusterHoverLayerIds() {
  return [
    ...getClusterLayerIds(),
    ...getClusterCountLayerIds(),
    ...getDensePileLayerIds()
  ];
}

function getClusterPieChartDimensions(total) {
  if (total >= 100) {
    return { radius: 32, fontSize: 14 };
  }

  if (total >= 10) {
    return { radius: 24, fontSize: 12 };
  }

  return { radius: 18, fontSize: 11 };
}

function donutSegment(start, end, radius, innerRadius, color) {
  let segmentEnd = end;

  if (segmentEnd - start === 1) {
    segmentEnd -= 0.0001;
  }

  const startAngle = 2 * Math.PI * (start - 0.25);
  const endAngle = 2 * Math.PI * (segmentEnd - 0.25);
  const x0 = Math.cos(startAngle);
  const y0 = Math.sin(startAngle);
  const x1 = Math.cos(endAngle);
  const y1 = Math.sin(endAngle);
  const largeArc = segmentEnd - start > 0.5 ? 1 : 0;

  return `<path d="M ${radius + innerRadius * x0} ${radius + innerRadius * y0} L ${
    radius + radius * x0
  } ${radius + radius * y0} A ${radius} ${radius} 0 ${largeArc} 1 ${radius + radius * x1} ${
    radius + radius * y1
  } L ${radius + innerRadius * x1} ${radius + innerRadius * y1} A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${
    radius + innerRadius * x0
  } ${radius + innerRadius * y0}" fill="${color}" />`;
}

function getClusterPieChartSignature(props) {
  const tempSegments = getTempLayerPieSegments(props);
  if (tempSegments) {
    return `temp:${tempSegments.map((segment) => segment.count).join(":")}`;
  }
  return CLUSTER_REGNUM_KEYS.map((key) => Number(props[key]) || 0).join(":");
}

/** SVG-пончик: доли по царству или по временным слоям и общее число точек в центре. */
function createClusterPieChartElement(props) {
  const tempSegments = getTempLayerPieSegments(props);
  const segments = tempSegments
    ? tempSegments
    : CLUSTER_REGNUM_KEYS.map((key) => ({
        count: Number(props[key]) || 0,
        color: REGNUM_COLORS[key]
      }));
  const total =
    Number(props.point_count) ||
    segments.reduce((sum, segment) => sum + segment.count, 0);

  if (total <= 0) {
    return null;
  }

  const { radius, fontSize } = getClusterPieChartDimensions(total);
  const innerRadius = Math.round(radius * 0.6);
  const size = radius * 2;
  const offsets = [];
  let runningTotal = 0;

  segments.forEach((segment) => {
    offsets.push(runningTotal);
    runningTotal += segment.count;
  });

  let segmentsHtml = "";

  segments.forEach((segment, index) => {
    if (segment.count <= 0) {
      return;
    }

    segmentsHtml += donutSegment(
      offsets[index] / total,
      (offsets[index] + segment.count) / total,
      radius,
      innerRadius,
      segment.color
    );
  });

  const wrapper = document.createElement("div");
  wrapper.className = "cluster-pie-chart-marker";
  wrapper.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">
    ${segmentsHtml}
    <circle cx="${radius}" cy="${radius}" r="${innerRadius}" fill="#ffffff" />
    <text dominant-baseline="central" transform="translate(${radius}, ${radius})" text-anchor="middle" fill="#333333" font-size="${fontSize}" font-weight="700" font-family="Arial, sans-serif">${total.toLocaleString("ru-RU")}</text>
  </svg>`;

  return wrapper;
}

function removeAllClusterPieChartMarkers() {
  Object.values(clusterPieChartMarkersOnScreen).forEach((marker) => marker.remove());
  clusterPieChartMarkersOnScreen = {};
}

/** Удаляет SVG-диаграммы, не попавшие в реестр (дубликаты cluster_id из querySourceFeatures). */
function removeOrphanedClusterPieChartMarkers(map) {
  if (!map?.getContainer) {
    return;
  }

  map.getContainer().querySelectorAll(".cluster-pie-chart-marker").forEach((element) => {
    element.closest(".mapboxgl-marker")?.remove();
  });
}

function detachClusterPieChartMarkers(map = clusterPieChartMap) {
  if (clusterPieChartRenderHandler && clusterPieChartMap) {
    clusterPieChartMap.off("render", clusterPieChartRenderHandler);
  }

  removeAllClusterPieChartMarkers();
  removeOrphanedClusterPieChartMarkers(map);
  clusterPieChartRenderHandler = null;
  clusterPieChartMap = null;
}

function getVisibleClusterFeatures(map) {
  const clustersById = new Map();

  const collectFromSource = (sourceId, keyPrefix) => {
    if (!map.getSource(sourceId) || !map.isSourceLoaded(sourceId)) {
      return;
    }

    map.querySourceFeatures(sourceId).forEach((feature) => {
      const props = feature.properties;

      if (!props?.cluster) {
        return;
      }

      const clusterId = props.cluster_id;

      if (clusterId === undefined || !feature.geometry?.coordinates) {
        return;
      }

      clustersById.set(`${keyPrefix}:${clusterId}`, feature);
    });
  };

  if (markersVisible) {
    collectFromSource("locations", "locations");
  }

  // Тот же инструмент «Кластеры-диаграммы» — и для видимых слоёв GBIF и iNaturalist.
  if (isGbifLayerVisible() && isGbifClusterPieChartsEnabled()) {
    collectFromSource(GBIF_SOURCE_ID, "gbif");
  }

  if (isInatLayerVisible() && isInatClusterPieChartsEnabled()) {
    collectFromSource(INAT_SOURCE_ID, "inat");
  }

  if (isTempLayersVisible() && isTempLayersClusterPieChartsEnabled()) {
    getTempLayersClusterSourceIds().forEach((sourceId) => {
      collectFromSource(sourceId, `temp:${sourceId}`);
    });
  }

  return clustersById;
}

function updateClusterPieChartMarkers(map) {
  const showLocations = markersVisible;
  const showGbif = isGbifLayerVisible() && isGbifClusterPieChartsEnabled();
  const showInat = isInatLayerVisible() && isInatClusterPieChartsEnabled();
  const showTemp = isTempLayersVisible() && isTempLayersClusterPieChartsEnabled();

  if (
    !clusterPieChartsEnabled ||
    !isMapboxClusteringActive() ||
    clusterByRegnum ||
    (!showLocations && !showGbif && !showInat && !showTemp)
  ) {
    removeAllClusterPieChartMarkers();
    removeOrphanedClusterPieChartMarkers(map);
    return;
  }

  const clusterFeatures = getVisibleClusterFeatures(map);
  const nextMarkers = {};

  clusterFeatures.forEach((feature, markerKey) => {
    const props = feature.properties;
    const coordinates = feature.geometry.coordinates;
    const signature = getClusterPieChartSignature(props);
    let marker = nextMarkers[markerKey] ?? clusterPieChartMarkersOnScreen[markerKey];

    if (!marker) {
      const element = createClusterPieChartElement(props);

      if (!element) {
        return;
      }

      marker = new mapboxgl.Marker({ element, anchor: "center" })
        .setLngLat(coordinates)
        .addTo(map);
      marker.__pieChartSignature = signature;
    } else if (marker.__pieChartSignature !== signature) {
      marker.remove();
      const element = createClusterPieChartElement(props);

      if (!element) {
        return;
      }

      marker = new mapboxgl.Marker({ element, anchor: "center" })
        .setLngLat(coordinates)
        .addTo(map);
      marker.__pieChartSignature = signature;
    } else {
      marker.setLngLat(coordinates);
    }

    nextMarkers[markerKey] = marker;
  });

  Object.entries(clusterPieChartMarkersOnScreen).forEach(([markerKey, marker]) => {
    if (!nextMarkers[markerKey]) {
      marker.remove();
    }
  });

  clusterPieChartMarkersOnScreen = nextMarkers;
}

function attachClusterPieChartMarkers(map) {
  detachClusterPieChartMarkers(map);

  if (!clusterPieChartsEnabled || !isMapboxClusteringActive() || clusterByRegnum) {
    return;
  }

  clusterPieChartMap = map;
  clusterPieChartRenderHandler = () => updateClusterPieChartMarkers(map);
  map.on("render", clusterPieChartRenderHandler);
  updateClusterPieChartMarkers(map);
}

/** Переподключает SVG-диаграммы кластеров после смены режима группировки. */
export function refreshClusterPieChartMarkers(map) {
  attachClusterPieChartMarkers(map);
}

/** Добавляет каждой точке URL иконки по полю regnum (растение / животное). */
function enrichWithImages(data) {
  if (!data?.features) {
    return data;
  }

  return {
    ...data,
    features: data.features.map((feature) => {
      const image =
        feature.properties.regnum === "animalia"
          ? ANIMAL_IMAGE
          : PLANT_IMAGE;

      return {
        ...feature,
        properties: {
          ...feature.properties,
          image
        }
      };
    })
  };
}

function getRegnumValues(features = locationsData?.features ?? []) {
  return [
    ...new Set(
      features
        .map((feature) => {
          const raw = feature.properties?.regnum;
          if (raw == null || String(raw).trim() === "") {
            return "";
          }
          return String(raw).toLowerCase();
        })
        .filter(Boolean)
    )
  ];
}

/** ID GeoJSON-источника: общий или отдельный для каждого regnum. */
function getSourceId(regnum = null) {
  return regnum ? `locations-${regnum}` : "locations";
}

function getLayerIds(regnum = null) {
  const suffix = regnum ? `-${regnum}` : "";
  return {
    clusters: `clusters${suffix}`,
    clusterCount: `cluster-count${suffix}`,
    unclustered: regnum ? `unclustered-${regnum}` : "unclustered-point"
  };
}

/** ID слоёв с одиночными точками — зависит от кластеризации и группировки по regnum. */
/** ID слоёв с одиночными (не кластеризованными) точками — зависят от кластеризации и группировки по regnum. */
export function getUnclusteredLayerIds() {
  if (!isMapboxClusteringActive()) {
    return [getLayerIds().unclustered];
  }

  if (clusterByRegnum) {
    return getRegnumValues().map((regnum) => getLayerIds(regnum).unclustered);
  }

  return [getLayerIds().unclustered];
}

function getConfiguredLocationSourceIds() {
  if (!isMapboxClusteringActive()) {
    return [getSourceId()];
  }
  if (clusterByRegnum) {
    return [...getRegnumValues().map((regnum) => getSourceId(regnum)), getSourceId()];
  }
  return [getSourceId()];
}

function getLocationCompactGridLayerIds() {
  return getConfiguredLocationSourceIds().flatMap((sourceId) => {
    const { fillId, lineId } = compactGridLayerIds(sourceId);
    return [fillId, lineId];
  });
}

function getLocationPointClickLayerIds() {
  return [
    ...getUnclusteredLayerIds(),
    ...getConfiguredLocationSourceIds().map(
      (sourceId) => compactGridLayerIds(sourceId).fillId
    )
  ];
}

function buildPinnedKeyExclusion(key) {
  return [
    "!",
    [
      "any",
      ["==", ["to-string", ["id"]], key],
      ["==", ["to-string", ["coalesce", ["get", "finding_id"], ""]], key],
      ["==", ["to-string", ["coalesce", ["get", "redbook_match_id"], ""]], key],
      ["==", ["to-string", ["coalesce", ["get", "gbif_key"], ""]], key],
      [
        "==",
        ["concat", "gbif-", ["to-string", ["coalesce", ["get", "gbif_key"], ""]]],
        key
      ],
      ["==", ["to-string", ["coalesce", ["get", "inat_id"], ""]], key],
      [
        "==",
        ["concat", "inat-", ["to-string", ["coalesce", ["get", "inat_id"], ""]]],
        key
      ]
    ]
  ];
}

function buildUnclusteredLayerFilter() {
  const parts = [compactDensityFalseFilter()];

  if (isMapboxClusteringActive()) {
    parts.push(["!", ["has", "point_count"]]);
  }

  // Точки, временно заменённые булавкой (map_pin.svg) — share-ссылка
  // или выделение в «Сведения о точке» — не рисуем обычным маркером.
  const pinnedFeatureKeys = [
    ...new Set([sharedPointPinFeatureKey, selectedPointPinFeatureKey].filter(Boolean))
  ];

  pinnedFeatureKeys.forEach((key) => {
    parts.push(buildPinnedKeyExclusion(key));
  });

  if (parts.length === 1) {
    return parts[0];
  }

  return ["all", ...parts];
}

function applyUnclusteredLayerFilters(map) {
  const filter = buildUnclusteredLayerFilter();

  getUnclusteredLayerIds().forEach((layerId) => {
    if (!map.getLayer(layerId)) {
      return;
    }

    map.setFilter(layerId, filter);
  });

  // Тот же набор ключей — скрываем кружок на слоях GBIF / iNaturalist / Красная книга под булавкой.
  setGbifHiddenPointFeatureKeys(map, [
    sharedPointPinFeatureKey,
    selectedPointPinFeatureKey
  ]);
  setInatHiddenPointFeatureKeys(map, [
    sharedPointPinFeatureKey,
    selectedPointPinFeatureKey
  ]);
  setRedBookHiddenPointFeatureKeys(map, [
    sharedPointPinFeatureKey,
    selectedPointPinFeatureKey
  ]);
  setTempLayersHiddenPointFeatureKeys(map, [
    sharedPointPinFeatureKey,
    selectedPointPinFeatureKey
  ]);
}

/** ID первого существующего на карте слоя точек — ориентир для вставки слоёв под маркерами. */
/** ID первого существующего на карте слоя точек — ориентир, под какой слой вставлять новые. */
export function getFirstLocationsLayerId(map) {
  const layerIds = [...getClusterLayerIds(), ...getUnclusteredLayerIds()];
  return layerIds.find((layerId) => map.getLayer(layerId));
}

function getClusterLayerIds() {
  if (!isMapboxClusteringActive()) {
    return [];
  }

  if (clusterByRegnum) {
    return getRegnumValues().map((regnum) => getLayerIds(regnum).clusters);
  }

  return [getLayerIds().clusters];
}

function getClusterCountLayerIds() {
  if (!isMapboxClusteringActive()) {
    return [];
  }

  if (clusterByRegnum) {
    return getRegnumValues().map((regnum) => getLayerIds(regnum).clusterCount);
  }

  return [getLayerIds().clusterCount];
}

function getAllLocationsLayerIds() {
  return [
    ...getClusterLayerIds(),
    ...getClusterCountLayerIds(),
    ...getUnclusteredLayerIds(),
    ...getLocationCompactGridLayerIds(),
    ...getDensePileLayerIds()
  ];
}

function applyMarkersVisibility(map) {
  const visibility = markersVisible ? "visible" : "none";

  getAllLocationsLayerIds().forEach((layerId) => {
    if (map.getLayer(layerId)) {
      map.setLayoutProperty(layerId, "visibility", visibility);
    }
  });

  // Не прячем все диаграммы разом: в режиме GBIF остаются диаграммы слоя GBIF.
  updateClusterPieChartMarkers(map);
}

function pickSharePinCenterColor() {
  return SHARE_PIN_CENTER_COLORS[
    Math.floor(Math.random() * SHARE_PIN_CENTER_COLORS.length)
  ];
}

function loadMapPinSvgTemplate() {
  if (!mapPinSvgTemplatePromise) {
    mapPinSvgTemplatePromise = fetch(MAP_PIN_IMAGE).then((response) => {
      if (!response.ok) {
        throw new Error(`Failed to load map pin SVG: ${response.status}`);
      }

      return response.text();
    });
  }

  return mapPinSvgTemplatePromise;
}

function colorizeMapPinSvg(svgText, centerColor) {
  const escapedDefaultFill = MAP_PIN_CENTER_FILL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  return svgText.replace(new RegExp(`fill:${escapedDefaultFill}`, "i"), `fill:${centerColor}`);
}

function revokeSharedPointPinObjectUrl() {
  if (sharedPointPinObjectUrl) {
    URL.revokeObjectURL(sharedPointPinObjectUrl);
    sharedPointPinObjectUrl = null;
  }
}

function revokeSelectedPointPinObjectUrl() {
  if (selectedPointPinObjectUrl) {
    URL.revokeObjectURL(selectedPointPinObjectUrl);
    selectedPointPinObjectUrl = null;
  }
}

/** DOM-элемент булавки map_pin.svg — используется и для share-ссылки, и для выделенной точки. */
function createPinMarkerElement(imageUrl) {
  const element = document.createElement("img");
  element.src = imageUrl;
  element.width = MAP_PIN_SIZE_PX;
  element.height = MAP_PIN_SIZE_PX;
  element.alt = "";
  element.draggable = false;
  element.className = "map-pin-marker";
  element.style.pointerEvents = "none";
  return element;
}

function removeSharedPointPopup() {
  if (!sharedPointPopup) {
    return;
  }

  const popup = sharedPointPopup;
  sharedPointPopup = null;
  sharedPointPopupDetailsHandler = null;
  popup.remove();
}

function removeSharedPointPinMarker(map) {
  if (sharedPointPinMarker) {
    sharedPointPinMarker.remove();
    sharedPointPinMarker = null;
  }

  revokeSharedPointPinObjectUrl();
  sharedPointPinFeatureKey = null;

  if (map?.getStyle()) {
    applyUnclusteredLayerFilters(map);
  }
}

/** Компактное окно с основными данными рядом с маркером (share-ссылка). */
export function showSharedPointPopup(map, feature, { onOpenDetails } = {}) {
  const coordinates = feature?.geometry?.coordinates;

  if (!map || !coordinates) {
    return;
  }

  removeSharedPointPopup();

  const popup = new mapboxgl.Popup({
    closeButton: true,
    closeOnClick: false,
    className: "shared-point-popup",
    offset: [0, -(MAP_PIN_SIZE_PX + 10)],
    maxWidth: "280px"
  });

  popup.setLngLat(coordinates).setHTML(buildSharedPointPopupHtml(feature));

  popup.on("close", () => {
    if (sharedPointPopup !== popup) {
      return;
    }

    sharedPointPopup = null;
    sharedPointPopupDetailsHandler = null;
    removeSharedPointPinMarker(map);
  });

  sharedPointPopup = popup;
  popup.addTo(map);

  if (onOpenDetails) {
    const detailsButton = popup.getElement()?.querySelector("[data-shared-point-details]");

    if (detailsButton) {
      sharedPointPopupDetailsHandler = (event) => {
        event.preventDefault();
        onOpenDetails(feature);
      };
      detailsButton.addEventListener("click", sharedPointPopupDetailsHandler);
    }
  }
}

/** Временная булавка вместо стандартного маркера (открытие карты по shared-ссылке). */
export function showSharedPointPin(map, feature) {
  const coordinates = feature?.geometry?.coordinates;

  if (!map || !coordinates) {
    return;
  }

  clearSharedPointPin(map);

  const featureKey = getFeatureKey(feature);
  sharedPointPinFeatureKey = featureKey;
  const centerColor = pickSharePinCenterColor();

  applyUnclusteredLayerFilters(map);

  loadMapPinSvgTemplate()
    .then((svgText) => {
      if (sharedPointPinFeatureKey !== featureKey) {
        return;
      }

      revokeSharedPointPinObjectUrl();
      sharedPointPinObjectUrl = URL.createObjectURL(
        new Blob([colorizeMapPinSvg(svgText, centerColor)], { type: "image/svg+xml" })
      );

      sharedPointPinMarker = new mapboxgl.Marker({
        element: createPinMarkerElement(sharedPointPinObjectUrl),
        anchor: "bottom",
        offset: [0, MAP_PIN_ANCHOR_OFFSET_Y_PX]
      })
        .setLngLat(coordinates)
        .addTo(map);
    })
    .catch(() => {
      if (sharedPointPinFeatureKey !== featureKey) {
        return;
      }

      sharedPointPinMarker = new mapboxgl.Marker({
        element: createPinMarkerElement(MAP_PIN_IMAGE),
        anchor: "bottom",
        offset: [0, MAP_PIN_ANCHOR_OFFSET_Y_PX]
      })
        .setLngLat(coordinates)
        .addTo(map);
    });
}

export function clearSharedPointPin(map) {
  removeSharedPointPopup();
  removeSharedPointPinMarker(map);
}

function removeSelectedPointPinMarker(map) {
  if (selectedPointPinMarker) {
    selectedPointPinMarker.remove();
    selectedPointPinMarker = null;
  }

  revokeSelectedPointPinObjectUrl();
  selectedPointPinFeatureKey = null;

  if (map?.getStyle()) {
    applyUnclusteredLayerFilters(map);
  }
}

/**
 * Заменяет обычный маркер выбранной точки булавкой (map_pin.svg) вместо визуальных
 * эффектов поверх слоя точек — так наведение на другие точки не зависит от того,
 * какая точка выбрана (см. историю бага с миганием подсказки).
 */
export function updateSelectedPointHighlight(map, feature) {
  const coordinates = feature?.geometry?.coordinates;

  if (!map || !coordinates) {
    clearSelectedPointHighlight(map);
    return;
  }

  const featureKey = getFeatureKey(feature);

  if (featureKey === selectedPointPinFeatureKey) {
    // Тот же ключ — либо маркер уже создан (просто обновляем позицию), либо ещё
    // грузится SVG для него же (обработчик promise ниже сам создаст маркер);
    // в обоих случаях повторный запуск создания маркера привёл бы к утечке
    // (несколько наложенных друг на друга <img>, см. историю бага).
    selectedPointPinMarker?.setLngLat(coordinates);
    // Слои могли пересобраться — заново скрываем кружок под булавкой.
    applyUnclusteredLayerFilters(map);
    return;
  }

  removeSelectedPointPinMarker(map);
  selectedPointPinFeatureKey = featureKey;
  const centerColor =
    feature.properties?.temp_marker_color ||
    getPointColorForRegnum(feature.properties?.regnum);

  applyUnclusteredLayerFilters(map);

  loadMapPinSvgTemplate()
    .then((svgText) => {
      if (selectedPointPinFeatureKey !== featureKey) {
        return;
      }

      revokeSelectedPointPinObjectUrl();
      selectedPointPinObjectUrl = URL.createObjectURL(
        new Blob([colorizeMapPinSvg(svgText, centerColor)], { type: "image/svg+xml" })
      );

      selectedPointPinMarker = new mapboxgl.Marker({
        element: createPinMarkerElement(selectedPointPinObjectUrl),
        anchor: "bottom",
        offset: [0, MAP_PIN_ANCHOR_OFFSET_Y_PX]
      })
        .setLngLat(coordinates)
        .addTo(map);
    })
    .catch(() => {
      if (selectedPointPinFeatureKey !== featureKey) {
        return;
      }

      selectedPointPinMarker = new mapboxgl.Marker({
        element: createPinMarkerElement(MAP_PIN_IMAGE),
        anchor: "bottom",
        offset: [0, MAP_PIN_ANCHOR_OFFSET_Y_PX]
      })
        .setLngLat(coordinates)
        .addTo(map);
    });
}

/** Снимает булавку с выбранной точки — возвращает обычный маркер. */
export function clearSelectedPointHighlight(map) {
  removeSelectedPointPinMarker(map);
}

function getLocationSourceIds(map) {
  const sources = map.getStyle()?.sources;
  if (!sources) {
    return [];
  }

  return Object.keys(sources).filter(
    (sourceId) => sourceId === "locations" || sourceId.startsWith("locations-")
  );
}

function removeLocationsFromMap(map) {
  detachClusterPieChartMarkers(map);

  const style = map.getStyle();
  if (!style?.layers) {
    return;
  }

  removeDensePilesLayers(map, {
    sourceId: DENSE_PILES_SOURCE_ID,
    clusterLayerId: DENSE_PILES_CLUSTER_LAYER_ID,
    countLayerId: DENSE_PILES_COUNT_LAYER_ID
  });

  const locationSourceIds = getLocationSourceIds(map);
  const layerIdsToRemove = style.layers
    .filter((layer) => locationSourceIds.includes(layer.source))
    .map((layer) => layer.id)
    .reverse();

  layerIdsToRemove.forEach((layerId) => {
    if (map.getLayer(layerId)) {
      map.removeLayer(layerId);
    }
  });

  locationSourceIds.forEach((sourceId) => {
    if (map.getSource(sourceId)) {
      map.removeSource(sourceId);
    }
  });
}

/** Снимает обработчики кликов и hover перед пересборкой слоёв. */
function detachLocationsInteractions(map) {
  if (!interactionHandlers) {
    return;
  }

  interactionHandlers.clusterLayerIds.forEach((layerId) => {
    map.off("click", layerId, interactionHandlers.clusterClick);
    map.off("mouseenter", layerId, interactionHandlers.clusterEnter);
    map.off("mouseleave", layerId, interactionHandlers.clusterLeave);
  });

  interactionHandlers.clusterHoverLayerIds?.forEach((layerId) => {
    if (interactionHandlers.clusterLayerIds.includes(layerId)) {
      return;
    }

    map.off("mouseenter", layerId, interactionHandlers.clusterEnter);
    map.off("mouseleave", layerId, interactionHandlers.clusterLeave);
  });

  interactionHandlers.unclusteredLayerIds.forEach((layerId) => {
    map.off("click", layerId, interactionHandlers.pointClick);
    map.off("mouseenter", layerId, interactionHandlers.pointEnter);
    map.off("mouseleave", layerId, interactionHandlers.pointLeave);
  });

  if (interactionHandlers.mapClick) {
    map.off("click", interactionHandlers.mapClick);
  }

  removePointHoverPopup({ immediate: true });
  cancelClusterHoverRequest();
  interactionHandlers = null;
}

/** Навешивает обработчики на кластеры, отдельные точки и клик по фону карты. */
function attachLocationsInteractions(map) {
  detachLocationsInteractions(map);

  const clusterLayerIds = [
    ...getClusterLayerIds(),
    ...(map.getLayer(DENSE_PILES_CLUSTER_LAYER_ID) ? [DENSE_PILES_CLUSTER_LAYER_ID] : [])
  ];
  const clusterHoverLayerIds = getClusterHoverLayerIds().filter((layerId) =>
    map.getLayer(layerId)
  );
  const unclusteredLayerIds = getLocationPointClickLayerIds().filter((layerId) =>
    map.getLayer(layerId)
  );

  const expandDensePileCluster = (clusterFeature) => {
    const key = clusterFeature.properties?.dense_pile_key;
    if (!key) {
      return;
    }

    expandDensePileByKey(map, key, {
      coordinates: clusterFeature.geometry?.coordinates,
      pointCount: clusterFeature.properties?.point_count
    });
  };

  const clusterClick = (event) => {
    const features = safeQueryRenderedFeatures(map, event.point, {
      layers: clusterLayerIds
    });
    if (!features.length) {
      return;
    }

    const clusterFeature = features[0];

    if (clusterFeature.properties?.dense_pile) {
      expandDensePileCluster(clusterFeature);
      return;
    }

    const sourceId = clusterFeature.source;
    const clusterId = clusterFeature.properties.cluster_id;
    const source = map.getSource(sourceId);

    // Идентификатор запроса — если пользователь успеет кликнуть по другому кластеру
    // до завершения анимации, отменяем колбэк устаревшего клика (иначе areal
    // обновится по leaves не того кластера).
    clusterExpandRequestId += 1;
    const requestId = clusterExpandRequestId;

    // Сначала получаем точки кластера, затем зумим до уровня их «раскрытия».
    source.getClusterLeaves(clusterId, Infinity, 0, (leavesErr, leaves) => {
      if (leavesErr || requestId !== clusterExpandRequestId) {
        return;
      }

      const restoredLeaves = (leaves ?? []).map(restoreOriginalCoordinates);
      const coincidentKeys = getCoincidentCoordKeys(restoredLeaves);

      // Вне режима «Плотные группы»: совпадающие координаты разводим спиралью
      // (иначе Mapbox-кластер «залипает» после clusterMaxZoom).
      if (coincidentKeys.size > 0) {
        coincidentKeys.forEach((key) => expandedCoincidentKeys.add(key));
        updateLocationsSourceData(map, currentFilteredFeatures);
        fitMapToCoincidentSpread(map, restoredLeaves);

        map.once("moveend", () => {
          if (requestId !== clusterExpandRequestId) {
            return;
          }

          map.once("idle", () => {
            if (requestId !== clusterExpandRequestId) {
              return;
            }

            onClusterExpandedCallback?.(restoredLeaves);
          });
        });
        return;
      }

      source.getClusterExpansionZoom(clusterId, (err, zoom) => {
        if (err || requestId !== clusterExpandRequestId) {
          return;
        }

        map.easeTo({
          center: clusterFeature.geometry.coordinates,
          zoom
        });

        // Колбэк вызываем после завершения анимации и отрисовки новых точек.
        map.once("moveend", () => {
          if (requestId !== clusterExpandRequestId) {
            return;
          }

          map.once("idle", () => {
            if (requestId !== clusterExpandRequestId) {
              return;
            }

            onClusterExpandedCallback?.(restoredLeaves);
          });
        });
      });
    });
  };

  const clusterEnter = (event) => {
    if (!mapCursorOverride) {
      map.getCanvas().style.cursor = "pointer";
    }

    showClusterRegnumHover(map, event, {
      getDensePileLeaves: getDensePileMembers
    });
  };

  const clusterLeave = () => {
    applyMapCursor(map, "");
    cancelClusterHoverRequest();
    removePointHoverPopup();
  };

  const pointClick = (event) => {
    const feature = event.features?.[0];
    if (!feature) {
      return;
    }
    if (isCompactDensityFeature(feature)) {
      if (isRegionContourPickActive(map)) {
        return;
      }
      easeToCompactDensityCell(map, feature);
      return;
    }
    onPointClickCallback?.(feature);
  };

  const pointEnter = (event) => {
    if (!mapCursorOverride) {
      map.getCanvas().style.cursor = "pointer";
    }

    if (!isHoverTooltipsEnabled()) {
      return;
    }

    const feature = event.features?.[0];
    if (!feature?.geometry?.coordinates) {
      return;
    }
    if (isCompactDensityFeature(feature)) {
      return;
    }

    const { name_ru: nameRu, name_latin: nameLatin } = feature.properties ?? {};
    if (!nameRu && !nameLatin) {
      return;
    }

    showPointHoverPopup(
      map,
      feature.geometry.coordinates,
      buildPointTooltipHtml(nameRu, nameLatin, getSpeciesPointCountOnMap(nameRu, nameLatin))
    );
  };

  const pointLeave = () => {
    applyMapCursor(map, "");
    removePointHoverPopup();
  };

  clusterLayerIds.forEach((layerId) => {
    map.on("click", layerId, clusterClick);
    map.on("mouseenter", layerId, clusterEnter);
    map.on("mouseleave", layerId, clusterLeave);
  });

  clusterHoverLayerIds.forEach((layerId) => {
    if (clusterLayerIds.includes(layerId)) {
      return;
    }

    map.on("mouseenter", layerId, clusterEnter);
    map.on("mouseleave", layerId, clusterLeave);
  });

  unclusteredLayerIds.forEach((layerId) => {
    map.on("click", layerId, pointClick);
    map.on("mouseenter", layerId, pointEnter);
    map.on("mouseleave", layerId, pointLeave);
  });

  // Клик по карте вне маркеров — сброс выбранной точки.
  const mapClick = (event) => {
    // defaultPrevented: клик уже обработан слоем точки (в т.ч. GBIF).
    if (event.defaultPrevented) {
      return;
    }

    const locationLayerIds = [
      ...clusterLayerIds,
      ...unclusteredLayerIds,
      ...getDensePileLayerIds()
    ].filter((layerId) => map.getLayer(layerId));
    const gbifLayerIds = getGbifInteractiveLayerIds(map);
    const inatLayerIds = getInatInteractiveLayerIds(map);
    const mergedLayerIds = getMergedInteractiveLayerIds(map);
    const redBookLayerIds = getRedBookInteractiveLayerIds(map);
    const tempLayerIds = getTempLayersInteractiveLayerIds().filter((layerId) =>
      map.getLayer(layerId)
    );
    const hitLayerIds = [
      ...locationLayerIds,
      ...gbifLayerIds,
      ...inatLayerIds,
      ...mergedLayerIds,
      ...redBookLayerIds,
      ...tempLayerIds
    ];

    if (hitLayerIds.length > 0) {
      const features = safeQueryRenderedFeatures(map, event.point, {
        layers: hitLayerIds
      });

      const blockingHits = features.filter((feature) => !isCompactDensityFeature(feature));
      if (blockingHits.length > 0) {
        return;
      }
    }

    onMapBackgroundClickCallback?.(event);
  };

  map.on("click", mapClick);

  interactionHandlers = {
    clusterLayerIds,
    clusterHoverLayerIds,
    unclusteredLayerIds,
    clusterClick,
    clusterEnter,
    clusterLeave,
    pointClick,
    pointEnter,
    pointLeave,
    mapClick
  };
}

function addUnclusteredLayer(map, sourceId, regnum = null) {
  const layerIds = getLayerIds(regnum);

  const layer = {
    id: layerIds.unclustered,
    type: "circle",
    source: sourceId,
    filter: isMapboxClusteringActive()
      ? ["all", compactDensityFalseFilter(), ["!", ["has", "point_count"]]]
      : compactDensityFalseFilter(),
    paint: {
      "circle-color": regnum
        ? REGNUM_COLORS[regnum] ?? DEFAULT_POINT_COLOR
        : getPointColorExpression(),
      "circle-radius": compactCircleRadiusExpression(MARKER_RADIUS),
      "circle-stroke-width": 1,
      "circle-stroke-color": "#ffffff"
    }
  };

  map.addLayer(layer);
  addCompactGridLayers(map, sourceId);
}

function addClusterLayers(map, sourceId, regnum = null) {
  const layerIds = getLayerIds(regnum);
  const usePieCharts = clusterPieChartsEnabled && !regnum;

  map.addLayer({
    id: layerIds.clusters,
    type: "circle",
    source: sourceId,
    filter: ["has", "point_count"],
    paint: getLocationsClusterPaint(regnum)
  });

  if (!usePieCharts) {
    map.addLayer({
      id: layerIds.clusterCount,
      type: "symbol",
      source: sourceId,
      filter: ["has", "point_count"],
      layout: {
        "text-field": "{point_count_abbreviated}",
        "text-font": ["Open Sans Bold"],
        "text-size": 12
      },
      paint: {
        "text-color": "#ffffff"
      }
    });
  }

  addUnclusteredLayer(map, sourceId, regnum);
}

/**
 * Стабильный ключ точки для скрытия/выбора: feature.id, finding_id, gbif-*, inat-*.
 * @param {object|null|undefined} feature
 * @returns {string}
 */
export function getStablePointKey(feature) {
  if (feature?.id != null && feature.id !== "") {
    return String(feature.id);
  }

  const properties = feature?.properties ?? {};

  if (properties.finding_id != null && properties.finding_id !== "") {
    return String(properties.finding_id);
  }

  if (properties.gbif_key != null && properties.gbif_key !== "") {
    return `gbif-${properties.gbif_key}`;
  }

  if (properties.inat_id != null && properties.inat_id !== "") {
    return `inat-${properties.inat_id}`;
  }

  const coordinates = feature?.geometry?.coordinates;
  if (Array.isArray(coordinates) && coordinates.length >= 2) {
    return coordinates.join(",");
  }

  return JSON.stringify(properties);
}

/**
 * Синхронизирует набор скрытых точек (вызывается из App при изменении state).
 * @param {Iterable<string>|null|undefined} keys
 */
export function setHiddenPointKeysForFilter(keys) {
  hiddenPointKeysSet = new Set(
    keys == null ? [] : Array.from(keys, (key) => String(key))
  );
  setCompactHiddenPointKeys(hiddenPointKeysSet);
  invalidateVisibleGbifCache();
  invalidateVisibleInatCache();
}

function getFeatureKey(feature) {
  return getStablePointKey(feature);
}

function filterValueEqual(a, b) {
  if (a === b) {
    return true;
  }

  if (a?.type === "Feature" && b?.type === "Feature") {
    return a === b;
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((value, index) => value === b[index]);
  }

  if (a && b && typeof a === "object" && typeof b === "object") {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);

    if (keysA.length !== keysB.length) {
      return false;
    }

    return keysA.every((key) => filterValueEqual(a[key], b[key]));
  }

  return false;
}

function filtersEqual(a, b) {
  const keysA = Object.keys(a).sort();
  const keysB = Object.keys(b).sort();

  if (keysA.join("|") !== keysB.join("|")) {
    return false;
  }

  return keysA.every((key) => filterValueEqual(a[key], b[key]));
}

/** Изменился только found_year (диапазон / появление / снятие фильтра по году). */
function isFoundYearOnlyChange(prevFilters, nextFilters) {
  if (filtersEqual(prevFilters, nextFilters)) {
    return false;
  }

  const prevRest = { ...prevFilters };
  const nextRest = { ...nextFilters };
  delete prevRest.found_year;
  delete nextRest.found_year;

  return filtersEqual(prevRest, nextRest);
}

/** Изменился только верхний предел found_year (типичное движение слайдера таймлайна). */
function isTimelineYearMaxOnlyChange(prevFilters, nextFilters) {
  const prevYear = prevFilters.found_year;
  const nextYear = nextFilters.found_year;

  if (
    !prevYear ||
    !nextYear ||
    typeof prevYear !== "object" ||
    typeof nextYear !== "object" ||
    !("min" in prevYear) ||
    !("max" in prevYear) ||
    !("min" in nextYear) ||
    !("max" in nextYear) ||
    prevYear.min !== nextYear.min ||
    prevYear.max === nextYear.max
  ) {
    return false;
  }

  return isFoundYearOnlyChange(prevFilters, nextFilters);
}

function featureMatchesYearWindow(feature, yearMin, yearMax, keepMissing) {
  const year = parseFoundYear(feature.properties?.found_year);
  if (year == null) {
    return Boolean(keepMissing);
  }
  return year >= yearMin && year <= yearMax;
}

function locationsSourcesExist(map) {
  if (!isMapboxClusteringActive()) {
    return Boolean(map.getSource("locations"));
  }

  if (clusterByRegnum) {
    return getRegnumValues().some((regnum) => map.getSource(getSourceId(regnum)));
  }

  return Boolean(map.getSource("locations"));
}

/**
 * Готовит точки к отрисовке: в режиме сверхплотных — только кучи ≥порога (остальные скрыты);
 * при обычной кластеризации — spread только для раскрытых по клику совпадающих координат;
 * без кластеризации — полный spread совпадающих координат.
 */
function prepareMapFeatures(features) {
  if (!denseClustersHighlightEnabled) {
    locationsDensePileMembers = new Map();
    return {
      mapFeatures: isMapboxClusteringActive()
        ? spreadCoincidentFeatures(features, expandedCoincidentKeys)
        : spreadCoincidentFeatures(features),
      denseClusterFeatures: []
    };
  }

  const { expandedDenseFeatures, denseClusterFeatures, densePileMembersById } =
    partitionFeaturesByDensePiles(features, {
      expandedPileKeys: expandedDensePileKeys
    });

  locationsDensePileMembers = densePileMembersById;

  return {
    // Точки вне сверхплотных куч не показываем; раскрытые кучи — отдельными маркерами.
    mapFeatures: spreadCoincidentFeatures(expandedDenseFeatures),
    denseClusterFeatures
  };
}

function getLocationsClusterPaint(regnum = null) {
  const clusterColor = regnum
    ? REGNUM_COLORS[regnum] ?? DEFAULT_CLUSTER_COLOR
    : DEFAULT_CLUSTER_COLOR;
  const usePieCharts = clusterPieChartsEnabled && !regnum;

  if (usePieCharts) {
    return {
      "circle-color": "#000000",
      "circle-radius": ["step", ["get", "point_count"], 18, 10, 24, 30, 32],
      "circle-stroke-width": 0,
      "circle-opacity": 0,
      "circle-stroke-opacity": 0
    };
  }

  return {
    "circle-color": clusterColor,
    "circle-radius": ["step", ["get", "point_count"], 18, 10, 24, 30, 32],
    "circle-stroke-width": 2,
    "circle-stroke-color": "#ffffff",
    "circle-opacity": 1,
    "circle-stroke-opacity": 1
  };
}

function syncDensePilesLayers(map, denseClusterFeatures) {
  if (!denseClustersHighlightEnabled) {
    removeDensePilesLayers(map, {
      sourceId: DENSE_PILES_SOURCE_ID,
      clusterLayerId: DENSE_PILES_CLUSTER_LAYER_ID,
      countLayerId: DENSE_PILES_COUNT_LAYER_ID
    });
    return;
  }

  const visibility = markersVisible ? "visible" : "none";

  if (!map.getSource(DENSE_PILES_SOURCE_ID)) {
    ensureDensePilesLayers(map, {
      sourceId: DENSE_PILES_SOURCE_ID,
      clusterLayerId: DENSE_PILES_CLUSTER_LAYER_ID,
      countLayerId: DENSE_PILES_COUNT_LAYER_ID,
      features: denseClusterFeatures,
      visibility
    });
    return;
  }

  setDensePilesData(map, DENSE_PILES_SOURCE_ID, denseClusterFeatures);
  [DENSE_PILES_CLUSTER_LAYER_ID, DENSE_PILES_COUNT_LAYER_ID].forEach((layerId) => {
    if (map.getLayer(layerId)) {
      map.setLayoutProperty(layerId, "visibility", visibility);
    }
  });
}

function updateLocationsSourceData(map, filteredFeatures) {
  if (isCompactPointDisplayEnabled()) {
    ensureCompactViewportSync(map, "locations", () => {
      updateLocationsSourceData(map, currentFilteredFeatures);
    });
    const built = buildCompactViewportFromGeojson(map, filteredFeatures, "locations");
    map.getSource("locations")?.setData({
      type: "FeatureCollection",
      features: built.features
    });
    syncDensePilesLayers(map, []);
    return;
  }

  const { mapFeatures, denseClusterFeatures } = prepareMapFeatures(filteredFeatures);
  const slimFeatures = slimMapFeatures(mapFeatures);

  if (!isMapboxClusteringActive()) {
    map.getSource("locations")?.setData({
      type: "FeatureCollection",
      features: slimFeatures
    });
    syncDensePilesLayers(map, denseClusterFeatures);
    return;
  }

  if (clusterByRegnum) {
    getRegnumValues().forEach((regnum) => {
      const source = map.getSource(getSourceId(regnum));
      if (!source) {
        return;
      }

      const regnumKey = String(regnum).toLowerCase();
      source.setData({
        type: "FeatureCollection",
        features: slimFeatures.filter(
          (feature) =>
            String(feature.properties?.regnum || "").toLowerCase() === regnumKey
        )
      });
    });
    syncDensePilesLayers(map, denseClusterFeatures);
    return;
  }

  map.getSource("locations")?.setData({
    type: "FeatureCollection",
    features: slimFeatures
  });
  syncDensePilesLayers(map, denseClusterFeatures);
}

/** Временно подменяет локальные точки на карте (без смены currentFilters). */
export function setTemporaryLocationsFeatures(map, features = []) {
  if (!map || !locationsSourcesExist(map)) {
    return;
  }

  updateLocationsSourceData(map, Array.isArray(features) ? features : []);
}

/** Восстанавливает локальные точки по текущим фильтрам слоя. */
export function refreshLocationsFromCurrentFilters(map) {
  if (!map || !locationsSourcesExist(map)) {
    return;
  }

  updateLocationsSourceData(map, getFilteredFeatures(currentFilters));
}

/** Добавляет или убирает точки при изменении года таймлайна без пересборки слоёв. */
function applyTimelineYearChange(map, prevFilters, nextFilters) {
  const prevMax = prevFilters.found_year.max;
  const nextMax = nextFilters.found_year.max;

  const baseFilters = { ...nextFilters };
  delete baseFilters.found_year;

  let newFilteredFeatures;

  const yearMin = nextFilters.found_year.min;

  if (nextMax > prevMax) {
    const toAdd = filterFeatures(locationsData.features, {
      ...baseFilters,
      found_year: { min: Math.max(prevMax + 1, yearMin), max: nextMax }
    });
    const existingKeys = new Set(currentFilteredFeatures.map(getFeatureKey));
    newFilteredFeatures = currentFilteredFeatures.slice();
    for (let i = 0; i < toAdd.length; i += 1) {
      const feature = toAdd[i];
      if (!existingKeys.has(getFeatureKey(feature))) {
        newFilteredFeatures.push(feature);
      }
    }
  } else {
    newFilteredFeatures = currentFilteredFeatures.filter((feature) =>
      featureMatchesYearWindow(
        feature,
        yearMin,
        nextMax,
        !nextFilters[REQUIRE_FOUND_YEAR_FILTER_KEY]
      )
    );
  }

  setCurrentFilteredFeatures(newFilteredFeatures);
  currentFilters = nextFilters;
  updateLocationsSourceData(map, newFilteredFeatures);
}

/** Перефильтровывает точки при любом изменении found_year без пересборки слоёв. */
function applyFoundYearFilterChange(map, nextFilters) {
  if (!locationsData) {
    currentFilters = nextFilters;
    return;
  }

  const filteredFeatures = filterFeatures(
    enrichFeaturesWithAttribution(locationsData.features, getStablePointKey),
    nextFilters
  );
  setCurrentFilteredFeatures(filteredFeatures);
  currentFilters = nextFilters;
  updateLocationsSourceData(map, filteredFeatures);
}

/**
 * Полностью пересоздаёт источники и слои точек.
 * Вызывается при смене фильтров, режима кластеризации или группировки по regnum.
 */
function rebuildLocationsLayers(map, { reuseFiltered = false } = {}) {
  if (!locationsData || !map.getStyle()) {
    return;
  }

  detachLocationsInteractions(map);
  removeLocationsFromMap(map);

  const filteredFeatures = reuseFiltered
    ? currentFilteredFeatures
    : filterFeatures(
        enrichFeaturesWithAttribution(locationsData.features, getStablePointKey),
        currentFilters
      );
  if (!reuseFiltered) {
    setCurrentFilteredFeatures(filteredFeatures);
  }
  const compactBuilt = isCompactPointDisplayEnabled()
    ? buildCompactViewportFromGeojson(map, filteredFeatures, "locations")
    : null;
  const { mapFeatures, denseClusterFeatures } = compactBuilt
    ? { mapFeatures: compactBuilt.features, denseClusterFeatures: [] }
    : prepareMapFeatures(filteredFeatures);
  const slimFeatures = slimMapFeatures(mapFeatures);

  if (!isMapboxClusteringActive()) {
    map.addSource("locations", {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: slimFeatures
      }
    });

    addUnclusteredLayer(map, "locations");
  } else if (clusterByRegnum) {
    // Отдельный кластеризуемый источник на каждое царство — кластеры не смешивают regnum.
    getRegnumValues().forEach((regnum) => {
      const sourceId = getSourceId(regnum);
      const regnumKey = String(regnum).toLowerCase();
      const features = slimFeatures.filter(
        (feature) =>
          String(feature.properties?.regnum || "").toLowerCase() === regnumKey
      );

      map.addSource(sourceId, {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features
        },
        cluster: true,
        ...CLUSTER_OPTIONS
      });

      addClusterLayers(map, sourceId, regnum);
    });
  } else {
    map.addSource("locations", {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: slimFeatures
      },
      cluster: true,
      ...CLUSTER_OPTIONS,
      clusterProperties: {
        ...(clusterPieChartsEnabled ? CLUSTER_REGNUM_PROPERTIES : {})
      }
    });

    addClusterLayers(map, "locations");
  }

  syncDensePilesLayers(map, denseClusterFeatures);
  attachLocationsInteractions(map);
  applyMarkersVisibility(map);
  applyUnclusteredLayerFilters(map);
  attachClusterPieChartMarkers(map);
}

/** Фильтрует GeoJSON-объекты по properties; массив значений — логика «любой из». */
export function filterFeatures(features, filters = {}) {
  const {
    [WITHIN_FEATURE_FILTER_KEY]: withinFeature,
    [HIDDEN_FEATURE_KEYS_FILTER_KEY]: _hiddenFeatureKeys,
    [SPECIES_SEARCH_FILTER_KEY]: speciesSearch,
    [REGION_SPECIES_ALLOWLIST_KEY]: regionSpeciesAllowlist,
    [REQUIRE_FOUND_YEAR_FILTER_KEY]: requireFoundYear,
    ...propertyFilters
  } = filters;
  const filterEntries = Object.entries(propertyFilters);

  let result = features;

  if (hiddenPointKeysSet.size > 0) {
    result = result.filter(
      (feature) => !hiddenPointKeysSet.has(getStablePointKey(feature))
    );
  }

  if (requireFoundYear) {
    result = result.filter(
      (feature) => parseFoundYear(feature.properties?.found_year) != null
    );
  }

  if (speciesSearch) {
    result = result.filter((feature) =>
      featureMatchesSpeciesSearch(feature, speciesSearch)
    );
  }

  if (regionSpeciesAllowlist) {
    result = result.filter((feature) =>
      featureMatchesRegionSpeciesAllowlist(feature, regionSpeciesAllowlist)
    );
  }

  if (filterEntries.length > 0) {
    result = result.filter((feature) =>
      filterEntries.every(([key, value]) => {
        if (value && typeof value === "object" && !Array.isArray(value) && "min" in value && "max" in value) {
          const prop = feature.properties?.[key];
          if (key === "found_year") {
            const year = parseFoundYear(prop);
            if (year == null) {
              return true;
            }
            return year >= value.min && year <= value.max;
          }
          if (prop == null || prop === "") {
            return false;
          }

          const numeric = typeof prop === "number" ? prop : Number(prop);
          if (!Number.isFinite(numeric)) {
            return false;
          }

          return numeric >= value.min && numeric <= value.max;
        }

        if (Array.isArray(value)) {
          if (value.length === 0) {
            return true;
          }

          // У внешних источников нет статуса МСОП — фильтр статуса их не отсекает.
          if (
            key === "status" &&
            (feature.properties?.source === "gbif" ||
              feature.properties?.source === "inaturalist" ||
              feature.properties?.temp_layer_id)
          ) {
            return true;
          }

          if (key === "regnum") {
            const raw = feature.properties?.regnum;
            const normalized =
              raw == null || String(raw).trim() === ""
                ? ""
                : String(raw).toLowerCase();

            return value.some((entry) => {
              if (entry === "__none__") {
                return false;
              }

              const allowed =
                entry == null || entry === ""
                  ? ""
                  : String(entry).toLowerCase();
              return allowed === normalized;
            });
          }

          return value.includes(feature.properties[key]);
        }

        if (key === "regnum") {
          const raw = feature.properties?.regnum;
          const normalized =
            raw == null || String(raw).trim() === ""
              ? ""
              : String(raw).toLowerCase();
          const allowed =
            value == null || value === ""
              ? ""
              : String(value).toLowerCase();
          return allowed === normalized;
        }

        return feature.properties[key] === value;
      })
    );
  }

  if (withinFeature?.geometry) {
    result = result.filter((feature) => {
      const coordinates = feature.geometry?.coordinates;
      if (!coordinates) {
        return false;
      }

      return booleanPointInPolygon(point(coordinates), withinFeature);
    });
  }

  return result;
}

/** Координаты отфильтрованных точек набора данных. */
/** Координаты точек набора данных, прошедших фильтры. */
export function getFilteredFeatureCenters(filters = {}) {
  if (!locationsData) {
    return [];
  }

  return filterFeatures(locationsData.features, filters).map(
    (feature) => feature.geometry.coordinates
  );
}

/** Точки набора данных с учётом фильтров. */
/** Точки набора данных, прошедшие фильтры. */
export function getFilteredFeatures(filters = {}) {
  if (!locationsData) {
    return [];
  }

  return filterFeatures(
    enrichFeaturesWithAttribution(locationsData.features, getStablePointKey),
    filters
  );
}

/** Является ли feature точкой GBIF. */
export function isGbifFeature(feature) {
  return feature?.properties?.source === "gbif";
}

/** Является ли feature точкой iNaturalist. */
export function isInatFeature(feature) {
  return feature?.properties?.source === "inaturalist";
}

/** Является ли feature точкой слоя Красной книги. */
export function isRedBookFeature(feature) {
  return feature?.properties?.source === "redbook";
}

/** Является ли feature слитой точкой. */
export function isMergedFeature(feature) {
  return feature?.properties?.source === "merged";
}

/** Задаёт, какие источники участвуют в инструментах карты. */
export function setToolFeaturesContext({
  includeLocal,
  includeGbif,
  includeInat,
  includeMerged,
  includeRedBook
} = {}) {
  if (typeof includeLocal === "boolean") {
    toolIncludeLocal = includeLocal;
  }
  if (typeof includeGbif === "boolean") {
    toolIncludeGbif = includeGbif;
  }
  if (typeof includeInat === "boolean") {
    toolIncludeInat = includeInat;
  }
  if (typeof includeMerged === "boolean") {
    toolIncludeMerged = includeMerged;
  }
  if (typeof includeRedBook === "boolean") {
    toolIncludeRedBook = includeRedBook;
  }
}

export function getToolFeaturesContext() {
  return {
    includeLocal: toolIncludeLocal,
    includeGbif: toolIncludeGbif,
    includeInat: toolIncludeInat,
    includeMerged: toolIncludeMerged,
    includeRedBook: toolIncludeRedBook
  };
}

/**
 * Точки для инструментов: локальные + внешние источники с учётом контекста режима данных.
 * Не меняет отображение слоя locations — только выборку для анализа.
 * Для merged/redbook не завязываемся на map visibility (иначе гонка со слоем и пустые инструменты).
 */
export function getToolFeatures(filters = {}) {
  const features = [];

  // Нельзя features.push(...huge) — при сотнях тысяч точек падает call stack.
  const appendFeatures = (items) => {
    if (!Array.isArray(items) || items.length === 0) {
      return;
    }
    for (let index = 0; index < items.length; index += 1) {
      features.push(items[index]);
    }
  };

  if (toolIncludeLocal && locationsData?.features?.length) {
    appendFeatures(filterFeatures(locationsData.features, filters));
  }

  if (toolIncludeGbif && isGbifLayerVisible()) {
    appendFeatures(getVisibleGbifFeatures(filters));
  }

  if (toolIncludeInat && isInatLayerVisible()) {
    appendFeatures(getVisibleInatFeatures(filters));
  }

  if (toolIncludeMerged) {
    appendFeatures(
      enrichFeaturesWithAttribution(
        filterFeatures(getMergedFeatures(), filters),
        getStablePointKey
      )
    );
  }

  if (toolIncludeRedBook) {
    appendFeatures(filterFeatures(getRedBookFeatures(), filters));
  }

  if (isTempLayersVisible()) {
    appendFeatures(filterFeatures(getVisibleTempLayerFeatures(), filters));
  }

  return features;
}

/**
 * Точки текущего фильтра для снимка во временный слой.
 * Та же выборка, что у инструментов, плюс локальные точки, если они ещё в памяти.
 */
export function getMapFilterSnapshotFeatures(filters = {}) {
  const features = getToolFeatures(filters);
  if (features.length > 0 || !locationsData?.features?.length) {
    return features;
  }

  return filterFeatures(
    enrichFeaturesWithAttribution(locationsData.features, getStablePointKey),
    filters
  );
}

/** Видимые точки временных слоёв с теми же фильтрами, что у инструментов. */
export function getVisibleTempLayerToolFeatures(locationFilters = currentFilters) {
  if (!isTempLayersVisible()) {
    return [];
  }
  return filterFeatures(getVisibleTempLayerFeatures(), locationFilters);
}

/** Плотные группы по источникам отдельно, затем слияние по координатам (без фантомных куч). */
export function listToolDensePiles(filters = {}, { minSize = getDensePileMinSize() } = {}) {
  const options = { minSize };
  const lists = [];

  if (toolIncludeLocal && locationsData?.features?.length) {
    lists.push(listDensePiles(filterFeatures(locationsData.features, filters), options));
  }

  if (toolIncludeGbif && isGbifLayerVisible()) {
    lists.push(listDensePiles(getVisibleGbifFeatures(filters), options));
  }

  if (toolIncludeInat && isInatLayerVisible()) {
    lists.push(listDensePiles(getVisibleInatFeatures(filters), options));
  }

  if (toolIncludeMerged) {
    lists.push(
      listDensePiles(
        enrichFeaturesWithAttribution(filterFeatures(getMergedFeatures(), filters), getStablePointKey),
        options
      )
    );
  }

  if (toolIncludeRedBook) {
    lists.push(listDensePiles(filterFeatures(getRedBookFeatures(), filters), options));
  }

  if (isTempLayersVisible()) {
    const tempGroups = getTempLayerFeatureGroups();
    tempGroups.forEach((group) => {
      lists.push(listDensePiles(filterFeatures(group.features, filters), options));
    });
    if (tempGroups.length > 1) {
      lists.push(
        listDensePiles(filterFeatures(getVisibleTempLayerFeatures(), filters), options)
      );
    }
  }

  return mergeDensePileLists(lists);
}

/** Сводка по точкам внутри GeoJSON-объекта с учётом фильтров (без within-фильтра в base). */
export function getContainedPointsSummaryForWithinFeature(withinFeature, filters = {}) {
  const { [WITHIN_FEATURE_FILTER_KEY]: _ignored, ...baseFilters } = filters;
  const points = filterFeatures(getToolFeatures(baseFilters), {
    ...baseFilters,
    [WITHIN_FEATURE_FILTER_KEY]: withinFeature
  }).sort((a, b) => {
    const nameA = a.properties?.name_ru ?? "";
    const nameB = b.properties?.name_ru ?? "";
    return nameA.localeCompare(nameB, "ru");
  });

  return {
    count: points.length,
    points
  };
}

/** Убирает дубли координат (несколько объектов могут совпасть по lng/lat). */
function dedupeFeaturesByCoordinates(features) {
  const seen = new Set();

  return features.filter((feature) => {
    const coordinates = getFeatureCoordinates(feature);
    if (!coordinates) {
      return false;
    }

    const key = `${coordinates[0]},${coordinates[1]}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function queryUnclusteredSourceFeatures(map) {
  if (!clusteringEnabled) {
    const sourceId = "locations";
    if (!map.getSource(sourceId)) {
      return [];
    }

    return map.querySourceFeatures(sourceId);
  }

  const sourceIds = clusterByRegnum
    ? getRegnumValues().map((regnum) => getSourceId(regnum))
    : ["locations"];

  return sourceIds.flatMap((sourceId) => {
    if (!map.getSource(sourceId)) {
      return [];
    }

    return map.querySourceFeatures(sourceId, {
      filter: ["!", ["has", "point_count"]]
    });
  });
}

/**
 * Возвращает некластеризованные точки, видимые на карте.
 * candidateFeatures — точки из только что раскрытого кластера (для режима «все маркеры»).
 */
export function getUnclusteredFeatures(map, filters = {}, candidateFeatures = null) {
  const hasLocationsSource = clusteringEnabled
    ? clusterByRegnum
      ? getRegnumValues().some((regnum) => map.getSource(getSourceId(regnum)))
      : map.getSource("locations")
    : map.getSource("locations");

  let localVisible = [];

  if (toolIncludeLocal && hasLocationsSource) {
    const sourceFeatures = queryUnclusteredSourceFeatures(map);
    localVisible =
      sourceFeatures.length > 0
        ? sourceFeatures
        : safeQueryRenderedFeatures(map, { layers: getUnclusteredLayerIds() });
  }

  let gbifVisible = [];

  if (toolIncludeGbif && isGbifLayerVisible()) {
    const gbifSourceIds = getGbifSourceIds().filter((sourceId) => map?.getSource?.(sourceId));
    const rawGbif = gbifSourceIds.flatMap((sourceId) =>
      map.querySourceFeatures(sourceId, {
        filter: ["!", ["has", "point_count"]]
      })
    );

    gbifVisible = rawGbif.map(
      (feature) => findGbifFeatureByKey(feature.properties?.gbif_key) ??
        restoreOriginalCoordinates(feature)
    );
  }

  let inatVisible = [];

  if (toolIncludeInat && isInatLayerVisible()) {
    const inatSourceIds = getInatSourceIds().filter((sourceId) => map?.getSource?.(sourceId));
    const rawInat = inatSourceIds.flatMap((sourceId) =>
      map.querySourceFeatures(sourceId, {
        filter: ["!", ["has", "point_count"]]
      })
    );

    inatVisible = rawInat.map(
      (feature) => findInatFeatureById(feature.properties?.inat_id) ??
        restoreOriginalCoordinates(feature)
    );
  }

  // Слитые и Красная книга — без кластеризации: берём из store по флагу режима.
  const mergedVisible = toolIncludeMerged
    ? enrichFeaturesWithAttribution(getMergedFeatures(), getStablePointKey)
    : [];
  const redBookVisible = toolIncludeRedBook ? getRedBookFeatures() : [];

  if (candidateFeatures?.length) {
    const visibleKeys = new Set(
      [
        ...localVisible,
        ...gbifVisible,
        ...inatVisible,
        ...mergedVisible,
        ...redBookVisible
      ]
        .map((feature) => {
          const coordinates = getFeatureCoordinates(feature);
          return coordinates ? `${coordinates[0]},${coordinates[1]}` : "";
        })
        .filter(Boolean)
    );

    return dedupeFeaturesByCoordinates(
      filterFeatures(candidateFeatures, filters).filter((feature) => {
        const coordinates = getFeatureCoordinates(feature);
        if (!coordinates) {
          return false;
        }

        return visibleKeys.has(`${coordinates[0]},${coordinates[1]}`);
      })
    );
  }

  return dedupeFeaturesByCoordinates(
    filterFeatures(
      [
        ...localVisible,
        ...gbifVisible,
        ...inatVisible,
        ...mergedVisible,
        ...redBookVisible
      ].map(restoreOriginalCoordinates),
      filters
    )
  );
}

/** Возвращает координаты некластеризованных точек, видимых на карте. */
export function getUnclusteredCenters(map, filters = {}, candidateFeatures = null) {
  return getUnclusteredFeatures(map, filters, candidateFeatures).map(
    (feature) => getFeatureCoordinates(feature)
  ).filter(Boolean);
}

/** Проверяет, отображается ли точка как отдельный маркер, не внутри кластера. */
export function isFeatureUnclusteredOnMap(map, feature) {
  if (!feature?.geometry?.coordinates) {
    return false;
  }

  // GBIF / iNaturalist / merged / redbook: после клика точка уже выбрана;
  // у merged/redbook кластеризации нет.
  if (
    isGbifFeature(feature) ||
    isInatFeature(feature) ||
    isMergedFeature(feature) ||
    isRedBookFeature(feature)
  ) {
    return featureMatchesFilters(feature, currentFilters);
  }

  if (!clusteringEnabled) {
    return featureMatchesFilters(feature, currentFilters);
  }

  const targetKey = getFeatureKey(feature);
  const targetCoords = getFeatureCoordinates(feature);
  const targetCoordKey = targetCoords
    ? `${targetCoords[0]},${targetCoords[1]}`
    : null;

  return queryUnclusteredSourceFeatures(map).some((item) => {
    if (getFeatureKey(item) === targetKey) {
      return true;
    }

    const itemCoords = getFeatureCoordinates(item);
    return Boolean(
      targetCoordKey &&
        itemCoords &&
        `${itemCoords[0]},${itemCoords[1]}` === targetCoordKey
    );
  });
}

export function featureMatchesFilters(feature, filters = {}) {
  return filterFeatures([feature], filters).length > 0;
}

function invalidateVisibleGbifCache() {
  visibleGbifCache = {
    locationFilters: null,
    processingFilters: null,
    generation: -1,
    overlayVersion: -1,
    filtersHash: null,
    features: null
  };
  processedGbifCache = {
    generation: -1,
    overlayVersion: -1,
    processingFilters: null,
    features: null
  };
}

function getProcessedGbifFeatures() {
  const generation = getGbifStoreGeneration();
  const overlayVersion = getOverlayVersion();
  if (
    processedGbifCache.features &&
    processedGbifCache.generation === generation &&
    processedGbifCache.overlayVersion === overlayVersion &&
    processedGbifCache.processingFilters === gbifProcessingFilters
  ) {
    return processedGbifCache.features;
  }

  const table = getGbifColumnarTable();
  const indices = filterGbifTableIndices(table, gbifProcessingFilters);
  const features = enrichFeaturesWithAttribution(
    getGbifFeaturesByIndices(indices),
    getStablePointKey
  );
  processedGbifCache = {
    generation,
    overlayVersion,
    processingFilters: gbifProcessingFilters,
    features
  };
  return features;
}

/**
 * Видимые GBIF-точки: enrich (cached) → processing filters → locationFilters.
 * Кэш по hash фильтров + ссылкам на processing/enriched.
 */
export function getVisibleGbifFeatures(locationFilters = currentFilters) {
  const generation = getGbifStoreGeneration();
  const overlayVersion = getOverlayVersion();
  const filtersHash = hashLocationFilters(locationFilters);

  if (
    visibleGbifCache.features &&
    visibleGbifCache.filtersHash === filtersHash &&
    visibleGbifCache.processingFilters === gbifProcessingFilters &&
    visibleGbifCache.generation === generation &&
    visibleGbifCache.overlayVersion === overlayVersion
  ) {
    return visibleGbifCache.features;
  }

  const features = filterFeatures(getProcessedGbifFeatures(), locationFilters);

  visibleGbifCache = {
    locationFilters,
    processingFilters: gbifProcessingFilters,
    generation,
    overlayVersion,
    filtersHash,
    features
  };

  return features;
}

function applyGbifTimelineYearChange(map, prevFilters, nextFilters) {
  if (isCompactPointDisplayEnabled() || externalUnifiedClusteringEnabled) {
    applyGbifLocationsFilter(map, nextFilters);
    return;
  }

  const current = visibleGbifCache.features;
  if (!current) {
    applyGbifLocationsFilter(map, nextFilters);
    return;
  }

  const prevMax = prevFilters.found_year.max;
  const nextMax = nextFilters.found_year.max;
  const yearMin = nextFilters.found_year.min;
  const baseFilters = { ...nextFilters };
  delete baseFilters.found_year;

  let nextFeatures;
  if (nextMax > prevMax) {
    const toAdd = filterFeatures(getProcessedGbifFeatures(), {
      ...baseFilters,
      found_year: { min: Math.max(prevMax + 1, yearMin), max: nextMax }
    });
    const existingKeys = new Set(current.map(getFeatureKey));
    nextFeatures = current.slice();
    for (let i = 0; i < toAdd.length; i += 1) {
      const feature = toAdd[i];
      if (!existingKeys.has(getFeatureKey(feature))) {
        nextFeatures.push(feature);
      }
    }
  } else {
    nextFeatures = current.filter((feature) =>
      featureMatchesYearWindow(
        feature,
        yearMin,
        nextMax,
        !nextFilters[REQUIRE_FOUND_YEAR_FILTER_KEY]
      )
    );
  }

  visibleGbifCache = {
    locationFilters: nextFilters,
    processingFilters: gbifProcessingFilters,
    generation: getGbifStoreGeneration(),
    overlayVersion: getOverlayVersion(),
    filtersHash: hashLocationFilters(nextFilters),
    features: nextFeatures
  };

  setGbifData(map, {
    type: "FeatureCollection",
    features: nextFeatures
  });
}

/**
 * То же применение фильтров к слою GBIF: store остаётся полным,
 * на карту уходит отфильтрованная выборка (как у локальных точек).
 * Пока сводки регионов без маркеров — слой точек не заполняем.
 */
export function applyGbifLocationsFilter(map, filters = currentFilters) {
  if (!map) {
    return;
  }

  setCompactLocationFilters(filters);
  setCompactGbifProcessingFilters(gbifProcessingFilters);

  if (shouldSuppressLoadedPointLayers()) {
    setGbifData(map, { type: "FeatureCollection", features: [] });
    return;
  }

  if (isCompactPointDisplayEnabled()) {
    // Сетка перечитывает фильтры сама при пересборке — не гоним полную
    // пересборку сразу на каждое изменение (например, тик слайдера года),
    // а планируем её с тем же дебаунсом, что и пан/зум.
    requestCompactViewportSync(map, () =>
      setGbifData(map, { type: "FeatureCollection", features: [] })
    );
    return;
  }

  if (externalUnifiedClusteringEnabled) {
    refreshExternalUnifiedMapLayers(map, filters, externalLayerIncludeFlags);
    return;
  }

  setGbifData(map, {
    type: "FeatureCollection",
    features: getVisibleGbifFeatures(filters)
  });
}

/**
 * Включает режим, когда GBIF и iNat рисуются в одном clustered-источнике.
 * @param {boolean} enabled
 * @param {{ includeGbif?: boolean, includeInat?: boolean }} [includes]
 */
export function setExternalUnifiedClusteringEnabled(
  enabled,
  { includeGbif = true, includeInat = true } = {}
) {
  externalUnifiedClusteringEnabled = Boolean(enabled);
  externalLayerIncludeFlags = {
    includeGbif: includeGbif !== false,
    includeInat: includeInat !== false
  };
}

/**
 * Обновляет отображение внешних слоёв: при включённых GBIF и iNat
 * точки кладутся в один GeoJSON-источник (слой GBIF), чтобы кластеризовались вместе.
 */
export function refreshExternalUnifiedMapLayers(
  map,
  filters = currentFilters,
  { includeGbif = true, includeInat = true } = {}
) {
  if (!map) {
    return;
  }

  if (shouldSuppressLoadedPointLayers()) {
    setGbifData(map, { type: "FeatureCollection", features: [] });
    setInatData(map, { type: "FeatureCollection", features: [] });
    return;
  }

  const gbifFeatures = includeGbif ? getVisibleGbifFeatures(filters) : [];
  const inatFeatures = includeInat ? getVisibleInatFeatures(filters) : [];

  if (includeGbif && includeInat) {
    setGbifData(map, {
      type: "FeatureCollection",
      features: concatFeatures(gbifFeatures, inatFeatures)
    });
    setInatData(map, {
      type: "FeatureCollection",
      features: []
    });
    return;
  }

  setGbifData(map, {
    type: "FeatureCollection",
    features: gbifFeatures
  });
  setInatData(map, {
    type: "FeatureCollection",
    features: inatFeatures
  });
}

/** Задаёт клиентские фильтры обработки GBIF и обновляет слой на карте. */
export function setGbifProcessingFilters(map, nextFilters) {
  gbifProcessingFilters = {
    ...createDefaultGbifProcessingFilters(),
    ...(nextFilters ?? {})
  };
  invalidateVisibleGbifCache();

  if (map) {
    applyGbifLocationsFilter(map, currentFilters);
  }
}

export function getGbifProcessingFilters() {
  return gbifProcessingFilters;
}

function invalidateVisibleInatCache() {
  visibleInatCache = {
    locationFilters: null,
    processingFilters: null,
    generation: -1,
    overlayVersion: -1,
    filtersHash: null,
    features: null
  };
  processedInatCache = {
    generation: -1,
    overlayVersion: -1,
    processingFilters: null,
    features: null
  };
}

/** Сброс кэшей видимых точек после смены оверлея атрибуции. */
export function invalidateVisibleAttributionCaches() {
  invalidateVisibleGbifCache();
  invalidateVisibleInatCache();
}

function getProcessedInatFeatures() {
  const generation = getInatStoreGeneration();
  const overlayVersion = getOverlayVersion();
  if (
    processedInatCache.features &&
    processedInatCache.generation === generation &&
    processedInatCache.overlayVersion === overlayVersion &&
    processedInatCache.processingFilters === inatProcessingFilters
  ) {
    return processedInatCache.features;
  }

  const table = getInatColumnarTable();
  const indices = filterInatTableIndices(table, inatProcessingFilters);
  const features = enrichFeaturesWithAttribution(
    getInatFeaturesByIndices(indices),
    getStablePointKey
  );
  processedInatCache = {
    generation,
    overlayVersion,
    processingFilters: inatProcessingFilters,
    features
  };
  return features;
}

export function getVisibleInatFeatures(locationFilters = currentFilters) {
  const generation = getInatStoreGeneration();
  const overlayVersion = getOverlayVersion();
  const filtersHash = hashLocationFilters(locationFilters);

  if (
    visibleInatCache.features &&
    visibleInatCache.filtersHash === filtersHash &&
    visibleInatCache.processingFilters === inatProcessingFilters &&
    visibleInatCache.generation === generation &&
    visibleInatCache.overlayVersion === overlayVersion
  ) {
    return visibleInatCache.features;
  }

  const features = filterFeatures(getProcessedInatFeatures(), locationFilters);

  visibleInatCache = {
    locationFilters,
    processingFilters: inatProcessingFilters,
    generation,
    overlayVersion,
    filtersHash,
    features
  };

  return features;
}

function applyInatTimelineYearChange(map, prevFilters, nextFilters) {
  if (isCompactPointDisplayEnabled() || externalUnifiedClusteringEnabled) {
    applyInatLocationsFilter(map, nextFilters);
    return;
  }

  const current = visibleInatCache.features;
  if (!current) {
    applyInatLocationsFilter(map, nextFilters);
    return;
  }

  const prevMax = prevFilters.found_year.max;
  const nextMax = nextFilters.found_year.max;
  const yearMin = nextFilters.found_year.min;
  const baseFilters = { ...nextFilters };
  delete baseFilters.found_year;

  let nextFeatures;
  if (nextMax > prevMax) {
    const toAdd = filterFeatures(getProcessedInatFeatures(), {
      ...baseFilters,
      found_year: { min: Math.max(prevMax + 1, yearMin), max: nextMax }
    });
    const existingKeys = new Set(current.map(getFeatureKey));
    nextFeatures = current.slice();
    for (let i = 0; i < toAdd.length; i += 1) {
      const feature = toAdd[i];
      if (!existingKeys.has(getFeatureKey(feature))) {
        nextFeatures.push(feature);
      }
    }
  } else {
    nextFeatures = current.filter((feature) =>
      featureMatchesYearWindow(
        feature,
        yearMin,
        nextMax,
        !nextFilters[REQUIRE_FOUND_YEAR_FILTER_KEY]
      )
    );
  }

  visibleInatCache = {
    locationFilters: nextFilters,
    processingFilters: inatProcessingFilters,
    generation: getInatStoreGeneration(),
    overlayVersion: getOverlayVersion(),
    filtersHash: hashLocationFilters(nextFilters),
    features: nextFeatures
  };

  setInatData(map, {
    type: "FeatureCollection",
    features: nextFeatures
  });
}

export function applyInatLocationsFilter(map, filters = currentFilters) {
  if (!map) {
    return;
  }

  setCompactLocationFilters(filters);
  setCompactInatProcessingFilters(inatProcessingFilters);

  if (shouldSuppressLoadedPointLayers()) {
    setInatData(map, { type: "FeatureCollection", features: [] });
    return;
  }

  if (isCompactPointDisplayEnabled()) {
    // См. комментарий в applyGbifLocationsFilter — избегаем немедленной
    // полной пересборки сетки на каждый промежуточный тик фильтра.
    requestCompactViewportSync(map, () =>
      setInatData(map, { type: "FeatureCollection", features: [] })
    );
    return;
  }

  if (externalUnifiedClusteringEnabled) {
    refreshExternalUnifiedMapLayers(map, filters, externalLayerIncludeFlags);
    return;
  }

  setInatData(map, {
    type: "FeatureCollection",
    features: getVisibleInatFeatures(filters)
  });
}

export function setInatProcessingFilters(map, nextFilters) {
  inatProcessingFilters = {
    ...createDefaultInatProcessingFilters(),
    ...(nextFilters ?? {})
  };
  invalidateVisibleInatCache();

  if (map) {
    applyInatLocationsFilter(map, currentFilters);
  }
}

export function getInatProcessingFilters() {
  return inatProcessingFilters;
}

/** Применяет фильтры точек: пересобирает слои, кроме частного случая сдвига года. */
export function applyLocationsFilter(map, filters = {}) {
  setCompactLocationFilters(filters);
  setCompactGbifProcessingFilters(gbifProcessingFilters);
  setCompactInatProcessingFilters(inatProcessingFilters);
  if (
    map &&
    locationsSourcesExist(map) &&
    isTimelineYearMaxOnlyChange(currentFilters, filters)
  ) {
    const prevFilters = currentFilters;
    applyTimelineYearChange(map, prevFilters, filters);
    applyGbifTimelineYearChange(map, prevFilters, filters);
    applyInatTimelineYearChange(map, prevFilters, filters);
    applyRedBookLocationsFilter(map, filters);
    applyTempLayersLocationsFilter(map, filters);
    return;
  }

  if (map && locationsSourcesExist(map) && isFoundYearOnlyChange(currentFilters, filters)) {
    applyFoundYearFilterChange(map, filters);
    applyGbifLocationsFilter(map, filters);
    applyInatLocationsFilter(map, filters);
    applyRedBookLocationsFilter(map, filters);
    applyTempLayersLocationsFilter(map, filters);
    return;
  }

  if (filtersEqual(currentFilters, filters)) {
    // Локальные слои уже актуальны; внешние всё равно синхронизируем
    // (их могла пересобрать полная коллекция из store).
    if (map) {
      applyGbifLocationsFilter(map, filters);
      applyInatLocationsFilter(map, filters);
      applyRedBookLocationsFilter(map, filters);
      applyTempLayersLocationsFilter(map, filters);
    }
    return;
  }

  currentFilters = filters;
  invalidateVisibleGbifCache();
  invalidateVisibleInatCache();
  expandedDensePileKeys = new Set();
  expandedCoincidentKeys = new Set();

  if (map) {
    rebuildLocationsLayers(map);
    applyGbifLocationsFilter(map, filters);
    applyInatLocationsFilter(map, filters);
    applyRedBookLocationsFilter(map, filters);
    applyTempLayersLocationsFilter(map, filters);
  }
}

function applyTempLayersLocationsFilter(map, filters = currentFilters) {
  if (!map) {
    return;
  }

  setCompactLocationFilters(filters);
  setTempLayersLocationFeatureFilter((features) => filterFeatures(features, filters));

  if (isCompactPointDisplayEnabled()) {
    // См. комментарий в applyGbifLocationsFilter.
    requestCompactViewportSync(map, () => setTempLayersData(map));
    return;
  }

  setTempLayersData(map);
}

/** Число точек в сейчас отображаемых слоях данных (не только кадр карты). */
export function getDisplayedLayerPointCount() {
  if (shouldSuppressLoadedPointLayers()) {
    return 0;
  }
  let total = 0;
  if (toolIncludeLocal) {
    total += currentFilteredFeatures.length;
  }
  if (toolIncludeGbif) {
    total += getGbifFeatureCount();
  }
  if (toolIncludeInat) {
    total += getInatFeatureCount();
  }
  if (toolIncludeMerged) {
    total += getMergedFeatures()?.length ?? 0;
  }
  if (toolIncludeRedBook) {
    total += getRedBookFeatures()?.length ?? 0;
  }
  if (isTempLayersVisible()) {
    total += getVisibleTempLayerFeatures()?.length ?? 0;
  }
  return total;
}

/** Оценка числа точек, попадающих на карту (для порогов производительности). */
export function getVisibleMapPointCount() {
  return getDisplayedLayerPointCount();
}

/** Сбрасывает все фильтры точек. */
/** Сбрасывает все фильтры точек. */
export function clearLocationsFilter(map) {
  applyLocationsFilter(map, {});
}

/**
 * Применяет режимы «Группы точек» одним rebuild (без повторной фильтрации).
 * Отдельные сеттеры вызывают это, чтобы не гонять Supercluster несколько раз подряд.
 */
export function applyLocationsGroupingMode(
  map,
  {
    clusteringEnabled: nextClustering,
    clusterByRegnum: nextByRegnum,
    clusterPieCharts: nextPie,
    denseClustersHighlight: nextDense
  } = {}
) {
  let changed = false;

  if (nextClustering !== undefined && clusteringEnabled !== Boolean(nextClustering)) {
    clusteringEnabled = Boolean(nextClustering);
    if (!clusteringEnabled) {
      expandedCoincidentKeys = new Set();
    }
    changed = true;
  }

  if (nextByRegnum !== undefined && clusterByRegnum !== Boolean(nextByRegnum)) {
    clusterByRegnum = Boolean(nextByRegnum);
    changed = true;
  }

  if (nextPie !== undefined && clusterPieChartsEnabled !== Boolean(nextPie)) {
    if (!nextPie) {
      detachClusterPieChartMarkers(map);
    }
    clusterPieChartsEnabled = Boolean(nextPie);
    changed = true;
  }

  if (
    nextDense !== undefined &&
    denseClustersHighlightEnabled !== Boolean(nextDense)
  ) {
    denseClustersHighlightEnabled = Boolean(nextDense);
    expandedDensePileKeys = new Set();
    expandedCoincidentKeys = new Set();
    changed = true;
  }

  if (changed && map) {
    rebuildLocationsLayers(map, { reuseFiltered: true });
  }
}

/** Включает/выключает группировку кластеров по regnum и пересобирает слои. */
export function setClusterByRegnum(map, enabled) {
  applyLocationsGroupingMode(map, { clusterByRegnum: enabled });
}

/** Включает/выключает кластеризацию точек и пересобирает слои. */
export function setClusteringEnabled(map, enabled) {
  applyLocationsGroupingMode(map, { clusteringEnabled: enabled });
}

/** Показывает/скрывает маркеры точек и диаграммы кластеров. */
export function setMarkersVisible(map, visible) {
  markersVisible = visible;
  applyMarkersVisibility(map);
}

/** Включена ли группировка кластеров по regnum. */
export function isClusterByRegnumEnabled() {
  return clusterByRegnum;
}

/** Включена ли кластеризация точек. */
export function isClusteringEnabled() {
  return clusteringEnabled;
}

/** Видимы ли сейчас маркеры точек. */
export function isMarkersVisible() {
  return markersVisible;
}

/** Включает/выключает круговые диаграммы regnum в кластерах и пересобирает слои. */
export function setClusterPieChartsEnabled(map, enabled) {
  applyLocationsGroupingMode(map, { clusterPieCharts: enabled });
}

/** Включены ли круговые диаграммы regnum в кластерах. */
export function isClusterPieChartsEnabled() {
  return clusterPieChartsEnabled;
}

/** Сверхплотные кластеры: без обычной кластеризации, только кучи ≥порога с одинаковыми координатами. */
export function setDenseClustersHighlightEnabled(map, enabled) {
  applyLocationsGroupingMode(map, { denseClustersHighlight: enabled });
}

/** Пересчитывает сверхплотные кучи после смены порога (если режим уже включён). */
export function refreshLocationsDensePiles(map) {
  if (!map || !denseClustersHighlightEnabled) {
    return;
  }
  updateLocationsSourceData(map, currentFilteredFeatures);
}

export function isDenseClustersHighlightEnabled() {
  return denseClustersHighlightEnabled;
}

/** Сворачивает раскрытые плотные группы обратно в кластеры. */
export function collapseExpandedDensePiles(map) {
  expandedDensePileKeys = new Set();
  refreshLocationsDensePiles(map);
}

/**
 * Раскрывает плотную группу по ключу координат и зумирует так, чтобы были видны все точки.
 */
export function expandDensePileByKey(
  map,
  key,
  { coordinates = null, pointCount = null, animateCamera = true, notify = true } = {}
) {
  if (!map?.getStyle?.() || !key || !denseClustersHighlightEnabled) {
    return [];
  }

  expandedDensePileKeys.add(key);
  updateLocationsSourceData(map, currentFilteredFeatures);

  const leaves = locationsDensePileMembers.get(`dense-${key}`) ?? [];
  const center =
    (Array.isArray(coordinates) && coordinates.length >= 2
      ? coordinates
      : null) ??
    (leaves[0] ? getFeatureCoordinates(leaves[0]) : null);
  const count = Number(pointCount) || leaves.length || 1;

  if (animateCamera && center) {
    const bounds = getSpreadPileFitBounds(center, count);
    if (bounds && count > 1) {
      map.fitBounds(bounds, {
        padding: 56,
        maxZoom: 18,
        duration: 900
      });
    } else {
      map.easeTo({
        center,
        zoom: Math.max(map.getZoom(), 15)
      });
    }
  }

  onClusterExpandedCallback?.(leaves.map(restoreOriginalCoordinates));

  if (notify) {
    onDensePileExpandedCallback?.({
      key,
      coordinates: center,
      pointCount: count
    });
  }

  return leaves;
}

/** Регистрирует обработчик раскрытия плотной группы (для синхронизации со списком). */
export function setDensePileExpandedHandler(handler) {
  onDensePileExpandedCallback = handler ?? null;
}

/** Включает или отключает всплывающие подсказки при наведении на точки и кластеры. */
export function setHoverTooltipsEnabled(enabled) {
  setHoverTooltipsEnabledInternal(enabled);
}

export { isHoverTooltipsEnabled };

/** Точка входа: инициализация слоя маркеров и регистрация колбэков из App. */
export function addLocationsLayer(
  map,
  {
    onClusterExpanded,
    onPointClick,
    onMapBackgroundClick,
    clusterByRegnum: initialClusterByRegnum = true,
    clusteringEnabled: initialClusteringEnabled = true,
    clusterPieChartsEnabled: initialClusterPieChartsEnabled = false,
    markersVisible: initialMarkersVisible = true
  } = {}
) {
  locationsData = enrichWithImages(getFeatureCollection());
  clusterByRegnum = initialClusterByRegnum;
  clusteringEnabled = initialClusteringEnabled;
  clusterPieChartsEnabled = initialClusterPieChartsEnabled;
  markersVisible = initialMarkersVisible;
  onClusterExpandedCallback = onClusterExpanded;
  onPointClickCallback = onPointClick;
  onMapBackgroundClickCallback = onMapBackgroundClick;
  rebuildLocationsLayers(map);
}

/** Перечитывает активную коллекцию (с учётом фильтра источника) и перестраивает слой маркеров. */
export function reloadLocationsData(map) {
  locationsData = enrichWithImages(getFeatureCollection());
  rebuildLocationsLayers(map);
}
