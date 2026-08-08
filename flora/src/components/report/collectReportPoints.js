import { booleanPointInPolygon, circle, point, union, featureCollection } from "@turf/turf";
import { getAreaContainedPointsSummary } from "../addAreaSelectionLayer";
import { getFilteredFeatures } from "../addLocationsLayer";
import { getPointsWithinPolygonFeature } from "../addSpeciesPolygonLayer";
import { REPORT_SOURCES } from "./reportSources";

function unionCircles(centers, radiusKm) {
  if (!centers.length) {
    return null;
  }

  let result = circle(centers[0], radiusKm, { units: "kilometers", steps: 64 });

  for (let index = 1; index < centers.length; index += 1) {
    result = union(
      featureCollection([
        result,
        circle(centers[index], radiusKm, { units: "kilometers", steps: 64 })
      ])
    );
  }

  return result;
}

function getBufferOuterFeature(bufferFeatures, bufferRadiiKm = []) {
  const centers = bufferFeatures
    .map((feature) => feature?.geometry?.coordinates)
    .filter(Boolean);

  if (!centers.length) {
    return null;
  }

  const maxRadiusKm = bufferRadiiKm.reduce(
    (maxValue, radiusKm) =>
      typeof radiusKm === "number" && !Number.isNaN(radiusKm)
        ? Math.max(maxValue, radiusKm)
        : maxValue,
    0
  );

  if (maxRadiusKm <= 0) {
    return null;
  }

  return unionCircles(centers, maxRadiusKm);
}

function sortPointsByNameRu(points) {
  return [...points].sort((left, right) => {
    const nameA = left.properties?.name_ru ?? "";
    const nameB = right.properties?.name_ru ?? "";
    return nameA.localeCompare(nameB, "ru");
  });
}

function dedupePointsByFindingId(points) {
  const seen = new Set();

  return points.filter((feature) => {
    const findingId =
      feature.properties?.finding_id ?? feature.id ?? feature.properties?.species_id;

    if (!findingId) {
      return true;
    }

    if (seen.has(findingId)) {
      return false;
    }

    seen.add(findingId);
    return true;
  });
}

function getBufferContainedPointsSummary({
  bufferEnabled,
  bufferFeatures,
  bufferRadiiKm,
  filters
}) {
  if (!bufferEnabled || bufferFeatures.length === 0) {
    return null;
  }

  const bufferFeature = getBufferOuterFeature(bufferFeatures, bufferRadiiKm);

  if (!bufferFeature?.geometry) {
    return null;
  }

  const points = sortPointsByNameRu(
    getFilteredFeatures(filters).filter((feature) => {
      const coordinates = feature.geometry?.coordinates;

      if (!coordinates) {
        return false;
      }

      return booleanPointInPolygon(point(coordinates), bufferFeature);
    })
  );

  return {
    count: points.length,
    points
  };
}

function getPolygonContainedPointsSummary({ activePolygon, filters }) {
  if (!activePolygon?.polygon?.geometry) {
    return null;
  }

  const points = sortPointsByNameRu(
    getPointsWithinPolygonFeature(activePolygon.polygon, filters)
  );

  return {
    count: points.length,
    points
  };
}

/** Определяет активный пространственный инструмент и возвращает сводку точек. */
export function resolveSpatialToolSummary(context) {
  const filters = context.locationFilters ?? {};

  if (context.areaGeometry) {
    return {
      sourceLabel: "Область",
      ...getAreaContainedPointsSummary(context.areaGeometry, filters)
    };
  }

  if (context.intersectionContainedPoints?.points?.length) {
    return {
      sourceLabel: "Пересечение ареалов",
      ...context.intersectionContainedPoints
    };
  }

  const polygonSummary = getPolygonContainedPointsSummary({
    activePolygon: context.activePolygon,
    filters
  });

  if (polygonSummary?.count > 0) {
    return {
      sourceLabel: "Полигон",
      ...polygonSummary
    };
  }

  if (context.arealContainedPoints?.points?.length) {
    return {
      sourceLabel: "Радиус",
      ...context.arealContainedPoints
    };
  }

  const bufferSummary = getBufferContainedPointsSummary({
    bufferEnabled: context.bufferEnabled,
    bufferFeatures: context.bufferFeatures ?? [],
    bufferRadiiKm: context.bufferRadiiKm ?? [],
    filters
  });

  if (bufferSummary?.count > 0) {
    return {
      sourceLabel: "Буфер",
      ...bufferSummary
    };
  }

  return null;
}

/** Проверяет, доступен ли источник отчёта в текущем состоянии приложения. */
export function isReportSourceAvailable(sourceId, context) {
  switch (sourceId) {
    case REPORT_SOURCES.VISIBLE_FILTERED:
      return true;

    case REPORT_SOURCES.SPATIAL_TOOL:
      return Boolean(resolveSpatialToolSummary(context));

    case REPORT_SOURCES.TOOL_FILTER_ONLY:
      return Boolean(context.toolFilterPointsSummary?.points?.length);

    case REPORT_SOURCES.SELECTED_POINT:
      return Boolean(context.selectedPoint);

    case REPORT_SOURCES.BUFFER_MULTI_SELECT:
      return (context.bufferSelectedPoints?.length ?? 0) > 0;

    default:
      return false;
  }
}

/** Собирает GeoJSON Feature[] для выбранного источника отчёта. */
export function collectReportPoints(sourceId, context) {
  const filters = context.locationFilters ?? {};

  switch (sourceId) {
    case REPORT_SOURCES.VISIBLE_FILTERED:
      return sortPointsByNameRu(getFilteredFeatures(filters));

    case REPORT_SOURCES.SPATIAL_TOOL: {
      const summary = resolveSpatialToolSummary(context);
      return summary?.points ?? [];
    }

    case REPORT_SOURCES.TOOL_FILTER_ONLY:
      return sortPointsByNameRu(context.toolFilterPointsSummary?.points ?? []);

    case REPORT_SOURCES.SELECTED_POINT:
      return context.selectedPoint ? [context.selectedPoint] : [];

    case REPORT_SOURCES.BUFFER_MULTI_SELECT:
      return sortPointsByNameRu(dedupePointsByFindingId(context.bufferSelectedPoints ?? []));

    default:
      return [];
  }
}
