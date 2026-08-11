import mapboxgl from "mapbox-gl";
import { booleanPointInPolygon, point } from "@turf/turf";
import {
  formatPropertyValue,
  getPropertyLabel
} from "./featurePropertyLabels";
import { getFeatureCollection } from "../locations/loadPoints";
import { findGbifFeatureByKey, getGbifFeatureCollection } from "../gbif/gbifStore";
import {
  applyGbifProcessingFilters,
  createDefaultGbifProcessingFilters
} from "../gbif/gbifProcessingFilters";
import { findInatFeatureById, getInatFeatureCollection } from "../inaturalist/inatStore";
import {
  applyInatProcessingFilters,
  createDefaultInatProcessingFilters
} from "../inaturalist/inatProcessingFilters";
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
import {
  DEFAULT_CLUSTER_COLOR,
  DEFAULT_POINT_COLOR,
  REGNUM_COLORS,
  getPointColorExpression,
  getPointColorForRegnum
} from "./pointColors";
import { safeQueryRenderedFeatures } from "./safeQueryRenderedFeatures";
import {
  DENSE_PILES_CLUSTER_LAYER_ID,
  DENSE_PILES_COUNT_LAYER_ID,
  DENSE_PILES_SOURCE_ID,
  ensureDensePilesLayers,
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

const SHARE_PIN_CENTER_COLORS = [
  REGNUM_COLORS.plantae,
  REGNUM_COLORS.animalia,
  REGNUM_COLORS.fungi,
  MAP_PIN_CENTER_FILL,
  "#2563eb",
  "#ca8a04",
  "#9333ea",
  "#0891b2",
  "#db2777",
  "#059669"
];

const MARKER_RADIUS = 5;

const CLUSTER_REGNUM_KEYS = ["plantae", "animalia", "fungi"];

const CLUSTER_REGNUM_PROPERTIES = Object.fromEntries(
  CLUSTER_REGNUM_KEYS.map((regnum) => [
    regnum,
    ["+", ["case", ["==", ["get", "regnum"], regnum], 1, 0]]
  ])
);

// Модульное состояние слоя: карта одна, пересборка слоёв идёт через rebuildLocationsLayers.
let locationsData = null;
let clusterByRegnum = true;
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
/** Клиентские фильтры панели «Обработка внешних данных» (не влияют на локальный слой). */
let gbifProcessingFilters = createDefaultGbifProcessingFilters();
let inatProcessingFilters = createDefaultInatProcessingFilters();
/** Кэш видимых GBIF после processing + locationFilters. */
let visibleGbifCache = {
  locationFilters: null,
  processingFilters: null,
  enrichedRef: null,
  features: null
};
/** Кэш видимых iNaturalist после processing + locationFilters. */
let visibleInatCache = {
  locationFilters: null,
  processingFilters: null,
  enrichedRef: null,
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
let pointHoverPopup = null;
let pointHoverPopupHideTimer = null;
let clusterHoverRequestId = 0;
let clusterExpandRequestId = 0;
let hoverTooltipsEnabled = true;
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

const POINT_TOOLTIP_FADE_MS = 180;

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

function formatClusterSpeciesCount(count) {
  const mod10 = count % 10;
  const mod100 = count % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return `${count} вид`;
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${count} вида`;
  }

  return `${count} видов`;
}

const MAX_CLUSTER_TOOLTIP_SPECIES = 5;

/** Уникальные виды в кластере с количеством точек каждого вида. */
function getSpeciesSummaryFromLeaves(leaves) {
  const speciesMap = new Map();

  leaves.forEach((leaf) => {
    const { name_ru: nameRu = "", name_latin: nameLatin = "", regnum = "" } = leaf.properties ?? {};
    const key = nameLatin || nameRu || leaf.id || `${leaf.geometry?.coordinates?.join(",")}`;

    if (!speciesMap.has(key)) {
      speciesMap.set(key, {
        nameRu,
        nameLatin,
        regnum,
        count: 1
      });
      return;
    }

    speciesMap.get(key).count += 1;
  });

  return [...speciesMap.values()].sort((a, b) => {
    const nameA = a.nameRu || a.nameLatin || "";
    const nameB = b.nameRu || b.nameLatin || "";
    return nameA.localeCompare(nameB, "ru");
  });
}

function getSpeciesLabel(species, speciesList) {
  const label = species.nameRu || species.nameLatin || "Без названия";
  const hasDuplicateName = speciesList.filter((item) => item.nameRu === species.nameRu).length > 1;

  if (hasDuplicateName && species.nameLatin) {
    return `${species.nameRu || species.nameLatin} (${species.nameLatin})`;
  }

  return label;
}

/** HTML-подсказка со списком видов в кластере. */
function buildClusterTooltipHtml(leaves) {
  const speciesList = getSpeciesSummaryFromLeaves(leaves);

  if (speciesList.length === 0) {
    return `<div class="cluster-tooltip-title">${formatClusterPointsCount(leaves.length)}</div>`;
  }

  const visibleSpecies = speciesList.slice(0, MAX_CLUSTER_TOOLTIP_SPECIES);
  const hiddenSpecies = speciesList.slice(MAX_CLUSTER_TOOLTIP_SPECIES);

  const items = visibleSpecies
    .map((species) => {
      const label = escapeHtml(getSpeciesLabel(species, speciesList));
      const color = getPointColorForRegnum(species.regnum);
      const countSuffix = species.count > 1 ? ` <span class="cluster-tooltip-count">— ${species.count}</span>` : "";
      return `<li class="cluster-tooltip-item"><span class="cluster-tooltip-species" style="color: ${color}">${label}</span>${countSuffix}</li>`;
    })
    .join("");

  const moreItem =
    hiddenSpecies.length > 0
      ? `<li class="cluster-tooltip-item cluster-tooltip-more">и еще ${formatClusterSpeciesCount(hiddenSpecies.length)}</li>`
      : "";

  return `
    <div class="cluster-tooltip-title">${formatClusterSpeciesCount(speciesList.length)}</div>
    <div class="cluster-tooltip-subtitle">${formatClusterPointsCount(leaves.length)}</div>
    <ul class="cluster-tooltip-list">${items}${moreItem}</ul>
  `;
}

/** Mapbox Supercluster активен только если включена обычная кластеризация и не режим сверхплотных. */
function isMapboxClusteringActive() {
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
  return CLUSTER_REGNUM_KEYS.map((key) => Number(props[key]) || 0).join(":");
}

/** SVG-пончик: доли plantae / animalia / fungi и общее число точек в центре. */
function createClusterPieChartElement(props) {
  const counts = CLUSTER_REGNUM_KEYS.map((key) => Number(props[key]) || 0);
  const total = Number(props.point_count) || counts.reduce((sum, count) => sum + count, 0);

  if (total <= 0) {
    return null;
  }

  const { radius, fontSize } = getClusterPieChartDimensions(total);
  const innerRadius = Math.round(radius * 0.6);
  const size = radius * 2;
  const offsets = [];
  let runningTotal = 0;

  counts.forEach((count) => {
    offsets.push(runningTotal);
    runningTotal += count;
  });

  let segmentsHtml = "";

  counts.forEach((count, index) => {
    if (count <= 0) {
      return;
    }

    segmentsHtml += donutSegment(
      offsets[index] / total,
      (offsets[index] + count) / total,
      radius,
      innerRadius,
      REGNUM_COLORS[CLUSTER_REGNUM_KEYS[index]]
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

  return clustersById;
}

function updateClusterPieChartMarkers(map) {
  const showLocations = markersVisible;
  const showGbif = isGbifLayerVisible() && isGbifClusterPieChartsEnabled();
  const showInat = isInatLayerVisible() && isInatClusterPieChartsEnabled();

  if (
    !clusterPieChartsEnabled ||
    !isMapboxClusteringActive() ||
    clusterByRegnum ||
    (!showLocations && !showGbif && !showInat)
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

function cancelClusterHoverRequest() {
  clusterHoverRequestId += 1;
}

function clearPointHoverHideTimer() {
  if (pointHoverPopupHideTimer) {
    clearTimeout(pointHoverPopupHideTimer);
    pointHoverPopupHideTimer = null;
  }
}

function setPointHoverPopupVisible(visible, popup = pointHoverPopup) {
  const popupElement = popup?.getElement();
  if (!popupElement) {
    return;
  }

  popupElement.classList.toggle("point-hover-tooltip--visible", visible);
}

function showPointHoverPopup(map, coordinates, html) {
  if (!hoverTooltipsEnabled) {
    return;
  }

  clearPointHoverHideTimer();

  if (!pointHoverPopup) {
    pointHoverPopup = new mapboxgl.Popup({
      closeButton: false,
      closeOnClick: false,
      className: "point-hover-tooltip",
      offset: 10
    });
  }

  const isNewPopup = !pointHoverPopup.isOpen();

  pointHoverPopup.setLngLat(coordinates).setHTML(html).addTo(map);

  if (isNewPopup) {
    setPointHoverPopupVisible(false);
    requestAnimationFrame(() => {
      setPointHoverPopupVisible(true);
    });
    return;
  }

  setPointHoverPopupVisible(true);
}

function removePointHoverPopup({ immediate = false } = {}) {
  clearPointHoverHideTimer();

  if (!pointHoverPopup) {
    return;
  }

  const popup = pointHoverPopup;

  if (immediate) {
    pointHoverPopup = null;
    popup.remove();
    return;
  }

  setPointHoverPopupVisible(false, popup);
  pointHoverPopupHideTimer = setTimeout(() => {
    pointHoverPopupHideTimer = null;
    if (pointHoverPopup === popup) {
      pointHoverPopup = null;
    }
    popup.remove();
  }, POINT_TOOLTIP_FADE_MS);
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
  return [...new Set(features.map((feature) => feature.properties.regnum).filter(Boolean))];
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

function buildPinnedKeyExclusion(key) {
  return [
    "!",
    [
      "any",
      ["==", ["to-string", ["id"]], key],
      ["==", ["to-string", ["coalesce", ["get", "finding_id"], ""]], key],
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
  const parts = [];

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

  if (parts.length === 0) {
    return null;
  }

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

  // Тот же набор ключей — скрываем кружок на слоях GBIF и iNaturalist под булавкой.
  setGbifHiddenPointFeatureKeys(map, [
    sharedPointPinFeatureKey,
    selectedPointPinFeatureKey
  ]);
  setInatHiddenPointFeatureKeys(map, [
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
  const centerColor = getPointColorForRegnum(feature.properties?.regnum);

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
  const unclusteredLayerIds = getUnclusteredLayerIds();

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

    if (!hoverTooltipsEnabled) {
      return;
    }

    const clusterFeature = event.features?.[0];
    const coordinates = clusterFeature?.geometry?.coordinates;

    if (clusterFeature?.properties?.dense_pile) {
      const leaves = getDensePileMembers(clusterFeature);
      if (leaves.length && coordinates) {
        showPointHoverPopup(map, coordinates, buildClusterTooltipHtml(leaves));
      }
      return;
    }

    const clusterId = clusterFeature?.properties?.cluster_id;
    const sourceId = clusterFeature?.source;
    const source = sourceId ? map.getSource(sourceId) : null;

    if (!source || clusterId === undefined || !coordinates) {
      return;
    }

    const requestId = clusterHoverRequestId + 1;
    clusterHoverRequestId = requestId;

    source.getClusterLeaves(clusterId, Infinity, 0, (leavesErr, leaves) => {
      if (leavesErr || requestId !== clusterHoverRequestId || !leaves?.length) {
        return;
      }

      showPointHoverPopup(map, coordinates, buildClusterTooltipHtml(leaves));
    });
  };

  const clusterLeave = () => {
    applyMapCursor(map, "");
    cancelClusterHoverRequest();
    removePointHoverPopup();
  };

  const pointClick = (event) => {
    const feature = event.features?.[0];
    if (feature) {
      // Оставляем geometry на разведённых координатах (булавка на видимом маркере);
      // исходные координаты — в properties.coordinates_original.
      onPointClickCallback?.(feature);
    }
  };

  const pointEnter = (event) => {
    if (!mapCursorOverride) {
      map.getCanvas().style.cursor = "pointer";
    }

    if (!hoverTooltipsEnabled) {
      return;
    }

    const feature = event.features?.[0];
    if (!feature?.geometry?.coordinates) {
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
    const hitLayerIds = [...locationLayerIds, ...gbifLayerIds, ...inatLayerIds];

    if (hitLayerIds.length > 0) {
      const features = safeQueryRenderedFeatures(map, event.point, {
        layers: hitLayerIds
      });

      if (features.length > 0) {
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
    paint: {
      "circle-color": regnum
        ? REGNUM_COLORS[regnum] ?? DEFAULT_POINT_COLOR
        : getPointColorExpression(),
      "circle-radius": MARKER_RADIUS,
      "circle-stroke-width": 1,
      "circle-stroke-color": "#ffffff"
    }
  };

  if (isMapboxClusteringActive()) {
    // Исключаем агрегированные точки кластера — показываем только «листья».
    layer.filter = ["!", ["has", "point_count"]];
  }

  map.addLayer(layer);
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

function getFeatureKey(feature) {
  if (feature.id != null) {
    return String(feature.id);
  }

  const findingId = feature.properties?.finding_id;
  const coordinates = feature.geometry?.coordinates;

  if (findingId != null) {
    return String(findingId);
  }

  if (Array.isArray(coordinates)) {
    return coordinates.join(",");
  }

  return JSON.stringify(feature.properties ?? {});
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
 * Готовит точки к отрисовке: в режиме сверхплотных — только кучи ≥10 (остальные скрыты);
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
  const { mapFeatures, denseClusterFeatures } = prepareMapFeatures(filteredFeatures);
  const collection = {
    type: "FeatureCollection",
    features: mapFeatures
  };

  if (!isMapboxClusteringActive()) {
    map.getSource("locations")?.setData(collection);
    syncDensePilesLayers(map, denseClusterFeatures);
    return;
  }

  if (clusterByRegnum) {
    getRegnumValues().forEach((regnum) => {
      const source = map.getSource(getSourceId(regnum));
      if (!source) {
        return;
      }

      source.setData({
        type: "FeatureCollection",
        features: mapFeatures.filter((feature) => feature.properties.regnum === regnum)
      });
    });
    syncDensePilesLayers(map, denseClusterFeatures);
    return;
  }

  map.getSource("locations")?.setData(collection);
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

    newFilteredFeatures = [
      ...currentFilteredFeatures,
      ...toAdd.filter((feature) => !existingKeys.has(getFeatureKey(feature)))
    ];
  } else {
    newFilteredFeatures = currentFilteredFeatures.filter((feature) => {
      const year = feature.properties?.found_year;
      return typeof year === "number" && year >= yearMin && year <= nextMax;
    });
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

  const filteredFeatures = filterFeatures(locationsData.features, nextFilters);
  setCurrentFilteredFeatures(filteredFeatures);
  currentFilters = nextFilters;
  updateLocationsSourceData(map, filteredFeatures);
}

/**
 * Полностью пересоздаёт источники и слои точек.
 * Вызывается при смене фильтров, режима кластеризации или группировки по regnum.
 */
function rebuildLocationsLayers(map) {
  if (!locationsData || !map.getStyle()) {
    return;
  }

  detachLocationsInteractions(map);
  removeLocationsFromMap(map);

  const filteredFeatures = filterFeatures(locationsData.features, currentFilters);
  setCurrentFilteredFeatures(filteredFeatures);
  const { mapFeatures, denseClusterFeatures } = prepareMapFeatures(filteredFeatures);

  if (!isMapboxClusteringActive()) {
    map.addSource("locations", {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: mapFeatures
      }
    });

    addUnclusteredLayer(map, "locations");
  } else if (clusterByRegnum) {
    // Отдельный кластеризуемый источник на каждое царство — кластеры не смешивают regnum.
    getRegnumValues().forEach((regnum) => {
      const sourceId = getSourceId(regnum);
      const features = mapFeatures.filter(
        (feature) => feature.properties.regnum === regnum
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
        features: mapFeatures
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
  const { [WITHIN_FEATURE_FILTER_KEY]: withinFeature, ...propertyFilters } = filters;
  const filterEntries = Object.entries(propertyFilters);

  let result = features;

  if (filterEntries.length > 0) {
    result = result.filter((feature) =>
      filterEntries.every(([key, value]) => {
        if (value && typeof value === "object" && !Array.isArray(value) && "min" in value && "max" in value) {
          const prop = feature.properties[key];
          if (prop == null) {
            return false;
          }

          return prop >= value.min && prop <= value.max;
        }

        if (Array.isArray(value)) {
          if (value.length === 0) {
            return true;
          }

          // У внешних источников нет статуса МСОП — фильтр статуса их не отсекает.
          if (
            key === "status" &&
            (feature.properties?.source === "gbif" ||
              feature.properties?.source === "inaturalist")
          ) {
            return true;
          }

          return value.includes(feature.properties[key]);
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

  return filterFeatures(locationsData.features, filters);
}

/** Является ли feature точкой GBIF. */
export function isGbifFeature(feature) {
  return feature?.properties?.source === "gbif";
}

/** Является ли feature точкой iNaturalist. */
export function isInatFeature(feature) {
  return feature?.properties?.source === "inaturalist";
}

/** Задаёт, какие источники участвуют в инструментах карты. */
export function setToolFeaturesContext({ includeLocal, includeGbif, includeInat } = {}) {
  if (typeof includeLocal === "boolean") {
    toolIncludeLocal = includeLocal;
  }
  if (typeof includeGbif === "boolean") {
    toolIncludeGbif = includeGbif;
  }
  if (typeof includeInat === "boolean") {
    toolIncludeInat = includeInat;
  }
}

export function getToolFeaturesContext() {
  return {
    includeLocal: toolIncludeLocal,
    includeGbif: toolIncludeGbif,
    includeInat: toolIncludeInat
  };
}

/**
 * Точки для инструментов: локальные + внешние источники с учётом контекста видимости и фильтров.
 * Не меняет отображение слоя locations — только выборку для анализа.
 */
export function getToolFeatures(filters = {}) {
  const features = [];

  if (toolIncludeLocal && locationsData?.features?.length) {
    features.push(...filterFeatures(locationsData.features, filters));
  }

  if (toolIncludeGbif && isGbifLayerVisible()) {
    features.push(...getVisibleGbifFeatures(filters));
  }

  if (toolIncludeInat && isInatLayerVisible()) {
    features.push(...getVisibleInatFeatures(filters));
  }

  return features;
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

  if (candidateFeatures?.length) {
    const visibleKeys = new Set(
      [...localVisible, ...gbifVisible, ...inatVisible].map((feature) => {
        const coordinates = getFeatureCoordinates(feature);
        return coordinates ? `${coordinates[0]},${coordinates[1]}` : "";
      }).filter(Boolean)
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
      [...localVisible, ...gbifVisible, ...inatVisible].map(restoreOriginalCoordinates),
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

  // GBIF / iNaturalist: после клика точка уже выбрана; кластеры раскрываются отдельно.
  if (isGbifFeature(feature) || isInatFeature(feature)) {
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
    enrichedRef: null,
    features: null
  };
}

/**
 * Видимые GBIF-точки: enrich (cached) → processing filters → locationFilters.
 * Короткий кэш по ссылкам на фильтры и enriched collection.
 */
export function getVisibleGbifFeatures(locationFilters = currentFilters) {
  const enriched = getGbifFeatureCollection();
  const enrichedFeatures = enriched.features ?? [];

  if (
    visibleGbifCache.features &&
    visibleGbifCache.locationFilters === locationFilters &&
    visibleGbifCache.processingFilters === gbifProcessingFilters &&
    visibleGbifCache.enrichedRef === enriched
  ) {
    return visibleGbifCache.features;
  }

  const processed = applyGbifProcessingFilters(enrichedFeatures, gbifProcessingFilters);
  const features = filterFeatures(processed, locationFilters);

  visibleGbifCache = {
    locationFilters,
    processingFilters: gbifProcessingFilters,
    enrichedRef: enriched,
    features
  };

  return features;
}

/**
 * То же применение фильтров к слою GBIF: store остаётся полным,
 * на карту уходит отфильтрованная выборка (как у локальных точек).
 */
export function applyGbifLocationsFilter(map, filters = currentFilters) {
  if (!map) {
    return;
  }

  setGbifData(map, {
    type: "FeatureCollection",
    features: getVisibleGbifFeatures(filters)
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
    enrichedRef: null,
    features: null
  };
}

export function getVisibleInatFeatures(locationFilters = currentFilters) {
  const enriched = getInatFeatureCollection();
  const enrichedFeatures = enriched.features ?? [];

  if (
    visibleInatCache.features &&
    visibleInatCache.locationFilters === locationFilters &&
    visibleInatCache.processingFilters === inatProcessingFilters &&
    visibleInatCache.enrichedRef === enriched
  ) {
    return visibleInatCache.features;
  }

  const processed = applyInatProcessingFilters(enrichedFeatures, inatProcessingFilters);
  const features = filterFeatures(processed, locationFilters);

  visibleInatCache = {
    locationFilters,
    processingFilters: inatProcessingFilters,
    enrichedRef: enriched,
    features
  };

  return features;
}

export function applyInatLocationsFilter(map, filters = currentFilters) {
  if (!map) {
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
  if (
    map &&
    locationsSourcesExist(map) &&
    isTimelineYearMaxOnlyChange(currentFilters, filters)
  ) {
    applyTimelineYearChange(map, currentFilters, filters);
    applyGbifLocationsFilter(map, filters);
    applyInatLocationsFilter(map, filters);
    return;
  }

  if (map && locationsSourcesExist(map) && isFoundYearOnlyChange(currentFilters, filters)) {
    applyFoundYearFilterChange(map, filters);
    applyGbifLocationsFilter(map, filters);
    applyInatLocationsFilter(map, filters);
    return;
  }

  if (map && locationsSourcesExist(map) && filtersEqual(currentFilters, filters)) {
    return;
  }

  currentFilters = filters;
  expandedDensePileKeys = new Set();
  expandedCoincidentKeys = new Set();
  rebuildLocationsLayers(map);
  applyGbifLocationsFilter(map, filters);
  applyInatLocationsFilter(map, filters);
}

/** Сбрасывает все фильтры точек. */
/** Сбрасывает все фильтры точек. */
export function clearLocationsFilter(map) {
  applyLocationsFilter(map, {});
}

/** Включает/выключает группировку кластеров по regnum и пересобирает слои. */
/** Включает/выключает группировку кластеров по regnum и пересобирает слои. */
export function setClusterByRegnum(map, enabled) {
  clusterByRegnum = enabled;
  rebuildLocationsLayers(map);
}

/** Включает/выключает кластеризацию точек и пересобирает слои. */
export function setClusteringEnabled(map, enabled) {
  clusteringEnabled = enabled;
  if (!enabled) {
    expandedCoincidentKeys = new Set();
  }
  rebuildLocationsLayers(map);
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
  if (!enabled) {
    detachClusterPieChartMarkers(map);
  }

  clusterPieChartsEnabled = enabled;
  rebuildLocationsLayers(map);
}

/** Включены ли круговые диаграммы regnum в кластерах. */
export function isClusterPieChartsEnabled() {
  return clusterPieChartsEnabled;
}

/** Сверхплотные кластеры: без обычной кластеризации, только кучи ≥10 с одинаковыми координатами. */
export function setDenseClustersHighlightEnabled(map, enabled) {
  const next = Boolean(enabled);
  if (denseClustersHighlightEnabled === next) {
    return;
  }

  denseClustersHighlightEnabled = next;
  expandedDensePileKeys = new Set();
  expandedCoincidentKeys = new Set();
  if (map) {
    rebuildLocationsLayers(map);
  }
}

export function isDenseClustersHighlightEnabled() {
  return denseClustersHighlightEnabled;
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
  hoverTooltipsEnabled = enabled;

  if (!enabled) {
    cancelClusterHoverRequest();
    removePointHoverPopup({ immediate: true });
  }
}

export function isHoverTooltipsEnabled() {
  return hoverTooltipsEnabled;
}

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
