import mapboxgl from "mapbox-gl";
import points from "../locations/points.json";

const PUBLIC_URL = process.env.PUBLIC_URL || "";
const PLANT_IMAGE = `${PUBLIC_URL}/images/plant.svg`;
const ANIMAL_IMAGE = `${PUBLIC_URL}/images/animal.svg`;

const CLUSTER_OPTIONS = {
  clusterMaxZoom: 14,
  clusterRadius: 50
};

const REGNUM_COLORS = {
  plantae: "#27ae60",
  animalia: "#ff6600",
  fungi: "#9b59b6"
};

const DEFAULT_CLUSTER_COLOR = "#4a90e2";
const DEFAULT_POINT_COLOR = "#4a90e2";

// Модульное состояние слоя: карта одна, пересборка слоёв идёт через rebuildLocationsLayers.
let locationsData = null;
let clusterByRegnum = true;
let clusteringEnabled = true;
let markersVisible = true;
let currentFilters = {};
let interactionHandlers = null;
let onClusterExpandedCallback = null;
let onPointClickCallback = null;
let onMapBackgroundClickCallback = null;
let pointHoverPopup = null;
let pointHoverPopupHideTimer = null;
let clusterHoverRequestId = 0;
let hoverTooltipsEnabled = true;

const POINT_TOOLTIP_FADE_MS = 180;

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** HTML-подсказка с русским и латинским названием вида. */
function buildPointTooltipHtml(nameRu, nameLatin) {
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

  return lines.join("");
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

/** Уникальные виды в кластере с количеством точек каждого вида. */
function getSpeciesSummaryFromLeaves(leaves) {
  const speciesMap = new Map();

  leaves.forEach((leaf) => {
    const { name_ru: nameRu = "", name_latin: nameLatin = "" } = leaf.properties ?? {};
    const key = nameLatin || nameRu || leaf.id || `${leaf.geometry?.coordinates?.join(",")}`;

    if (!speciesMap.has(key)) {
      speciesMap.set(key, {
        nameRu,
        nameLatin,
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

  const items = speciesList
    .map((species) => {
      const label = escapeHtml(getSpeciesLabel(species, speciesList));
      const countSuffix = species.count > 1 ? ` <span class="cluster-tooltip-count">— ${species.count}</span>` : "";
      return `<li class="cluster-tooltip-item">${label}${countSuffix}</li>`;
    })
    .join("");

  return `
    <div class="cluster-tooltip-title">${formatClusterSpeciesCount(speciesList.length)}</div>
    <div class="cluster-tooltip-subtitle">${formatClusterPointsCount(leaves.length)}</div>
    <ul class="cluster-tooltip-list">${items}</ul>
  `;
}

function getClusterHoverLayerIds() {
  return [...getClusterLayerIds(), ...getClusterCountLayerIds()];
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

export function getUnclusteredLayerIds() {
  if (!clusteringEnabled) {
    return [getLayerIds().unclustered];
  }

  if (clusterByRegnum) {
    return getRegnumValues().map((regnum) => getLayerIds(regnum).unclustered);
  }

  return [getLayerIds().unclustered];
}

export function getFirstLocationsLayerId(map) {
  const layerIds = [...getClusterLayerIds(), ...getUnclusteredLayerIds()];
  return layerIds.find((layerId) => map.getLayer(layerId));
}

function getClusterLayerIds() {
  if (!clusteringEnabled) {
    return [];
  }

  if (clusterByRegnum) {
    return getRegnumValues().map((regnum) => getLayerIds(regnum).clusters);
  }

  return [getLayerIds().clusters];
}

function getClusterCountLayerIds() {
  if (!clusteringEnabled) {
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
    ...getUnclusteredLayerIds()
  ];
}

function applyMarkersVisibility(map) {
  const visibility = markersVisible ? "visible" : "none";

  getAllLocationsLayerIds().forEach((layerId) => {
    if (map.getLayer(layerId)) {
      map.setLayoutProperty(layerId, "visibility", visibility);
    }
  });
}

function getPointColorExpression() {
  return [
    "match",
    ["get", "regnum"],
    "plantae", REGNUM_COLORS.plantae,
    "animalia", REGNUM_COLORS.animalia,
    "fungi", REGNUM_COLORS.fungi,
    DEFAULT_POINT_COLOR
  ];
}

export function getPointColorForRegnum(regnum) {
  return REGNUM_COLORS[regnum] ?? DEFAULT_POINT_COLOR;
}

function removeLocationsFromMap(map) {
  [getLayerIds().clusters, getLayerIds().clusterCount, getLayerIds().unclustered].forEach(
    (layerId) => {
      if (map.getLayer(layerId)) {
        map.removeLayer(layerId);
      }
    }
  );

  if (map.getSource("locations")) {
    map.removeSource("locations");
  }

  getRegnumValues().forEach((regnum) => {
    const layerIds = getLayerIds(regnum);
    [layerIds.clusters, layerIds.clusterCount, layerIds.unclustered].forEach((layerId) => {
      if (map.getLayer(layerId)) {
        map.removeLayer(layerId);
      }
    });

    const sourceId = getSourceId(regnum);
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

  const clusterLayerIds = getClusterLayerIds();
  const clusterHoverLayerIds = getClusterHoverLayerIds();
  const unclusteredLayerIds = getUnclusteredLayerIds();

  const clusterClick = (event) => {
    const features = map.queryRenderedFeatures(event.point, {
      layers: clusterLayerIds
    });
    if (!features.length) {
      return;
    }

    const clusterFeature = features[0];
    const sourceId = clusterFeature.source;
    const clusterId = clusterFeature.properties.cluster_id;
    const source = map.getSource(sourceId);

    // Сначала получаем точки кластера, затем зумим до уровня их «раскрытия».
    source.getClusterLeaves(clusterId, Infinity, 0, (leavesErr, leaves) => {
      if (leavesErr) {
        return;
      }

      source.getClusterExpansionZoom(clusterId, (err, zoom) => {
        if (err) {
          return;
        }

        map.easeTo({
          center: clusterFeature.geometry.coordinates,
          zoom
        });

        // Колбэк вызываем после завершения анимации и отрисовки новых точек.
        map.once("moveend", () => {
          map.once("idle", () => {
            onClusterExpandedCallback?.(leaves);
          });
        });
      });
    });
  };

  const clusterEnter = (event) => {
    map.getCanvas().style.cursor = "pointer";

    if (!hoverTooltipsEnabled) {
      return;
    }

    const clusterFeature = event.features?.[0];
    const clusterId = clusterFeature?.properties?.cluster_id;
    const sourceId = clusterFeature?.source;
    const coordinates = clusterFeature?.geometry?.coordinates;
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
    map.getCanvas().style.cursor = "";
    cancelClusterHoverRequest();
    removePointHoverPopup();
  };

  const pointClick = (event) => {
    const feature = event.features?.[0];
    if (feature) {
      onPointClickCallback?.(feature);
    }
  };

  const pointEnter = (event) => {
    map.getCanvas().style.cursor = "pointer";

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
      buildPointTooltipHtml(nameRu, nameLatin)
    );
  };

  const pointLeave = () => {
    map.getCanvas().style.cursor = "";
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
    const locationLayerIds = [...clusterLayerIds, ...unclusteredLayerIds].filter((layerId) =>
      map.getLayer(layerId)
    );

    if (locationLayerIds.length === 0) {
      return;
    }

    const features = map.queryRenderedFeatures(event.point, {
      layers: locationLayerIds
    });

    if (!features.length) {
      onMapBackgroundClickCallback?.();
    }
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
      "circle-radius": 5,
      "circle-stroke-width": 1,
      "circle-stroke-color": "#ffffff"
    }
  };

  if (clusteringEnabled) {
    // Исключаем агрегированные точки кластера — показываем только «листья».
    layer.filter = ["!", ["has", "point_count"]];
  }

  map.addLayer(layer);
}

function addClusterLayers(map, sourceId, regnum = null) {
  const layerIds = getLayerIds(regnum);
  const clusterColor = regnum ? REGNUM_COLORS[regnum] ?? DEFAULT_CLUSTER_COLOR : DEFAULT_CLUSTER_COLOR;

  map.addLayer({
    id: layerIds.clusters,
    type: "circle",
    source: sourceId,
    filter: ["has", "point_count"],
    paint: {
      "circle-color": clusterColor,
      "circle-radius": [
        "step",
        ["get", "point_count"],
        18, 10,
        24, 30,
        32
      ],
      "circle-stroke-width": 2,
      "circle-stroke-color": "#ffffff"
    }
  });

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

  addUnclusteredLayer(map, sourceId, regnum);
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

  if (!clusteringEnabled) {
    map.addSource("locations", {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: filteredFeatures
      }
    });

    addUnclusteredLayer(map, "locations");
  } else if (clusterByRegnum) {
    // Отдельный кластеризуемый источник на каждое царство — кластеры не смешивают regnum.
    getRegnumValues().forEach((regnum) => {
      const sourceId = getSourceId(regnum);
      const features = filteredFeatures.filter(
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
        features: filteredFeatures
      },
      cluster: true,
      ...CLUSTER_OPTIONS
    });

    addClusterLayers(map, "locations");
  }

  attachLocationsInteractions(map);
  applyMarkersVisibility(map);
}

/** Фильтрует GeoJSON-объекты по properties; массив значений — логика «любой из». */
export function filterFeatures(features, filters = {}) {
  const filterEntries = Object.entries(filters);
  if (filterEntries.length === 0) {
    return features;
  }

  return features.filter((feature) =>
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

        return value.includes(feature.properties[key]);
      }

      return feature.properties[key] === value;
    })
  );
}

export function getFilteredFeatureCenters(filters = {}) {
  if (!locationsData) {
    return [];
  }

  return filterFeatures(locationsData.features, filters).map(
    (feature) => feature.geometry.coordinates
  );
}

export function getFilteredFeatures(filters = {}) {
  if (!locationsData) {
    return [];
  }

  return filterFeatures(locationsData.features, filters);
}

/** Убирает дубли координат (несколько объектов могут совпасть по lng/lat). */
function dedupeFeaturesByCoordinates(features) {
  const seen = new Set();

  return features.filter((feature) => {
    const [lng, lat] = feature.geometry.coordinates;
    const key = `${lng},${lat}`;
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

  if (!hasLocationsSource) {
    return [];
  }

  const sourceFeatures = queryUnclusteredSourceFeatures(map);
  const visibleFeatures =
    sourceFeatures.length > 0
      ? sourceFeatures
      // Запасной путь: если querySourceFeatures ещё пуст, берём отрисованные слои.
      : map.queryRenderedFeatures({ layers: getUnclusteredLayerIds() });

  if (candidateFeatures?.length) {
    const visibleKeys = new Set(
      visibleFeatures.map(
        (feature) => `${feature.geometry.coordinates[0]},${feature.geometry.coordinates[1]}`
      )
    );

    return dedupeFeaturesByCoordinates(
      filterFeatures(candidateFeatures, filters).filter((feature) => {
        const [lng, lat] = feature.geometry.coordinates;
        return visibleKeys.has(`${lng},${lat}`);
      })
    );
  }

  return dedupeFeaturesByCoordinates(filterFeatures(visibleFeatures, filters));
}

/** Возвращает координаты некластеризованных точек, видимых на карте. */
export function getUnclusteredCenters(map, filters = {}, candidateFeatures = null) {
  return getUnclusteredFeatures(map, filters, candidateFeatures).map(
    (feature) => feature.geometry.coordinates
  );
}

/** Проверяет, отображается ли точка как отдельный маркер, а не внутри кластера. */
export function isFeatureUnclusteredOnMap(map, feature) {
  if (!feature?.geometry?.coordinates) {
    return false;
  }

  if (!clusteringEnabled) {
    return featureMatchesFilters(feature, currentFilters);
  }

  const [lng, lat] = feature.geometry.coordinates;

  return getUnclusteredCenters(map).some(
    ([clusterLng, clusterLat]) => clusterLng === lng && clusterLat === lat
  );
}

export function featureMatchesFilters(feature, filters = {}) {
  return filterFeatures([feature], filters).length > 0;
}

export function applyLocationsFilter(map, filters = {}) {
  currentFilters = filters;
  rebuildLocationsLayers(map);
}

export function clearLocationsFilter(map) {
  applyLocationsFilter(map, {});
}

export function setClusterByRegnum(map, enabled) {
  clusterByRegnum = enabled;
  rebuildLocationsLayers(map);
}

export function setClusteringEnabled(map, enabled) {
  clusteringEnabled = enabled;
  rebuildLocationsLayers(map);
}

export function setMarkersVisible(map, visible) {
  markersVisible = visible;
  applyMarkersVisibility(map);
}

export function isClusterByRegnumEnabled() {
  return clusterByRegnum;
}

export function isClusteringEnabled() {
  return clusteringEnabled;
}

export function isMarkersVisible() {
  return markersVisible;
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
    markersVisible: initialMarkersVisible = true
  } = {}
) {
  locationsData = enrichWithImages(points);
  clusterByRegnum = initialClusterByRegnum;
  clusteringEnabled = initialClusteringEnabled;
  markersVisible = initialMarkersVisible;
  onClusterExpandedCallback = onClusterExpanded;
  onPointClickCallback = onPointClick;
  onMapBackgroundClickCallback = onMapBackgroundClick;
  rebuildLocationsLayers(map);
}
