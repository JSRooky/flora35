import { bboxPolygon, circle, featureCollection, union } from "@turf/turf";
import { getUnclusteredFeatures } from "./addLocationsLayer";
import { geometryToFeature } from "./addAreaSelectionLayer";
import { getBufferOuterFeature } from "./addBufferLayer";
import { MODULE_IDS } from "./ModuleMenu";

function unionCircleFeatures(circleFeatures) {
  if (!circleFeatures.length) {
    return null;
  }

  if (circleFeatures.length === 1) {
    return circleFeatures[0];
  }

  let result = circleFeatures[0];

  for (let index = 1; index < circleFeatures.length; index += 1) {
    result = union(featureCollection([result, circleFeatures[index]]));
  }

  return result;
}

function getArealUnionFeature(centers, radiusKm) {
  const circleFeatures = centers.map((center) =>
    circle(center, radiusKm, { units: "kilometers", steps: 64 })
  );

  return unionCircleFeatures(circleFeatures);
}

function getMapViewportWithinFeature(map) {
  const bounds = map.getBounds();
  const west = bounds.getWest();
  const south = bounds.getSouth();
  const east = bounds.getEast();
  const north = bounds.getNorth();

  return bboxPolygon([west, south, east, north]);
}

function unionPolygonFeatures(features) {
  const validFeatures = features.filter((feature) => feature?.geometry);

  if (!validFeatures.length) {
    return null;
  }

  if (validFeatures.length === 1) {
    return validFeatures[0];
  }

  let result = validFeatures[0];

  for (let index = 1; index < validFeatures.length; index += 1) {
    result = union(featureCollection([result, validFeatures[index]]));
  }

  return result;
}

// Приоритет: область пересечения двух полигонов, иначе активный полигон,
// иначе объединение всех видимых построенных полигонов.
function getPolygonWithinFeature({
  visibleBuiltPolygons,
  activePolygon,
  intersectionResult
}) {
  if (intersectionResult?.hasIntersection && intersectionResult.feature?.geometry) {
    return intersectionResult.feature;
  }

  if (activePolygon?.polygon?.geometry) {
    return activePolygon.polygon;
  }

  const builtPolygons = visibleBuiltPolygons
    .map((entry) => entry.polygon)
    .filter((polygon) => polygon?.geometry);

  return unionPolygonFeatures(builtPolygons);
}

/** GeoJSON-объект выбранной ООПТ для фильтра точек. */
export function getOoptWithinFeature(selectedBoundsFeature) {
  return selectedBoundsFeature?.feature?.geometry ? selectedBoundsFeature.feature : null;
}

/** Активен ли глобальный фильтр по выбранной ООПТ. */
export function isOoptPointsFilterActive(toolPointsFilterEnabled, selectedBoundsFeature) {
  return Boolean(toolPointsFilterEnabled?.[MODULE_IDS.OOPT] && getOoptWithinFeature(selectedBoundsFeature));
}

/** GeoJSON выбранного субъекта РФ для фильтра точек. */
export function getRegionWithinFeature(selectedRegionFeature) {
  return selectedRegionFeature?.geometry ? selectedRegionFeature : null;
}

/** Активен ли глобальный фильтр по выбранному субъекту. */
export function isRegionPointsFilterActive(toolPointsFilterEnabled, selectedRegionFeature) {
  return Boolean(
    toolPointsFilterEnabled?.[MODULE_IDS.REGIONS] && getRegionWithinFeature(selectedRegionFeature)
  );
}

/**
 * Возвращает GeoJSON Feature для фильтра «Только эти» активного инструмента карты.
 */
export function getToolWithinFeature({
  moduleId,
  map = null,
  baseFilters = {},
  arealEnabled = false,
  arealAllMarkers = false,
  arealRadius = 0,
  arealCenterFeature = null,
  bufferEnabled = false,
  bufferFeatures = [],
  bufferRadiiKm = [],
  visibleBuiltPolygons = [],
  activePolygon = null,
  intersectionResult = null,
  areaGeometry = null,
  selectedBoundsFeature = null,
  selectedRegionFeature = null
}) {
  switch (moduleId) {
    case MODULE_IDS.MAP:
      return map ? getMapViewportWithinFeature(map) : null;

    case MODULE_IDS.AREAL:
      if (arealAllMarkers) {
        if (!map) {
          return null;
        }

        const centers = getUnclusteredFeatures(map, baseFilters)
          .map((feature) => feature.geometry?.coordinates)
          .filter(Boolean);

        return centers.length ? getArealUnionFeature(centers, arealRadius) : null;
      }

      if (arealEnabled && arealCenterFeature?.geometry?.coordinates) {
        return circle(arealCenterFeature.geometry.coordinates, arealRadius, {
          units: "kilometers",
          steps: 64
        });
      }

      return null;

    case MODULE_IDS.BUFFER:
      if (!bufferEnabled || bufferFeatures.length === 0) {
        return null;
      }

      return getBufferOuterFeature(bufferFeatures, bufferRadiiKm);

    case MODULE_IDS.POLYGON:
      return getPolygonWithinFeature({
        visibleBuiltPolygons,
        activePolygon,
        intersectionResult
      });

    case MODULE_IDS.AREA:
      return areaGeometry ? geometryToFeature(areaGeometry) : null;

    case MODULE_IDS.OOPT:
      return selectedBoundsFeature?.feature?.geometry ? selectedBoundsFeature.feature : null;

    case MODULE_IDS.REGIONS:
      return selectedRegionFeature?.geometry ? selectedRegionFeature : null;

    default:
      return null;
  }
}

/** Панель полигона открыта как модуль или пристыкована к «О точке». */
export function isPolygonToolActive(activeModule, polygonDockedWithFeature = false) {
  return (
    activeModule === MODULE_IDS.POLYGON ||
    (activeModule === MODULE_IDS.FEATURE && polygonDockedWithFeature)
  );
}

/** Определяет, какой инструмент сейчас управляет фильтром точек (учитывает док-панели). */
export function resolveToolPointsFilterModule(
  activeModule,
  {
    arealDockedWithFeature = false,
    bufferDockedWithFeature = false,
    polygonDockedWithFeature = false
  } = {}
) {
  if (activeModule === MODULE_IDS.FEATURE && arealDockedWithFeature) {
    return MODULE_IDS.AREAL;
  }

  if (activeModule === MODULE_IDS.FEATURE && bufferDockedWithFeature) {
    return MODULE_IDS.BUFFER;
  }

  if (activeModule === MODULE_IDS.FEATURE && polygonDockedWithFeature) {
    return MODULE_IDS.POLYGON;
  }

  return activeModule;
}
