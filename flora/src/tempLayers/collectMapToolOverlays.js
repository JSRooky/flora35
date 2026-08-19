import { circle } from "@turf/turf";
import { buildBufferRings } from "../components/addBufferLayer";
import { geometryToFeature } from "../components/addAreaSelectionLayer";
import {
  collectRegionSelectionOverlayFeatures
} from "../components/addRegionBoundsLayer";
import {
  getPointColorForRegnum,
  getUnclusteredFeatures
} from "../components/addLocationsLayer";

export const TEMP_OVERLAY_KINDS = {
  POLYGON: "polygon",
  BUFFER: "buffer",
  AREAL: "areal",
  AREA: "area",
  REGIONS: "regions"
};

export const TEMP_OVERLAY_LABELS = {
  [TEMP_OVERLAY_KINDS.POLYGON]: "Полигон",
  [TEMP_OVERLAY_KINDS.BUFFER]: "Буфер",
  [TEMP_OVERLAY_KINDS.AREAL]: "Радиус",
  [TEMP_OVERLAY_KINDS.AREA]: "Область",
  [TEMP_OVERLAY_KINDS.REGIONS]: "Регионы"
};

function cloneOverlayFeature(feature, extraProperties = {}) {
  if (!feature?.geometry) {
    return null;
  }

  try {
    return JSON.parse(
      JSON.stringify({
        type: "Feature",
        geometry: feature.geometry,
        properties: {
          ...(feature.properties ?? {}),
          ...extraProperties
        }
      })
    );
  } catch {
    return {
      type: "Feature",
      geometry: feature.geometry,
      properties: {
        ...(feature.properties ?? {}),
        ...extraProperties
      }
    };
  }
}

function overlayEntry(kind, features) {
  const list = (features ?? []).map((feature) => cloneOverlayFeature(feature)).filter(Boolean);
  if (!list.length) {
    return null;
  }

  return {
    kind,
    label: TEMP_OVERLAY_LABELS[kind] || kind,
    features: list
  };
}

function arealCircleFeature(center, radiusKm, color) {
  if (!Array.isArray(center) || center.length < 2 || !(radiusKm > 0)) {
    return null;
  }

  const circleFeature = circle(center, radiusKm, { units: "kilometers", steps: 64 });
  return cloneOverlayFeature(circleFeature, {
    color: color || getPointColorForRegnum(),
    fillOpacity: 0.2
  });
}

/**
 * Снимок построенных инструментов карты: полигоны, буфер, радиус, область.
 * @param {object} input
 * @param {string[] | null} [input.kinds]
 */
export function collectMapToolOverlays({
  kinds = null,
  map = null,
  baseFilters = {},
  visibleBuiltPolygons = [],
  intersectionResult = null,
  bufferEnabled = false,
  bufferFeatures = [],
  bufferRadiiKm = [],
  arealEnabled = false,
  arealAllMarkers = false,
  arealRadius = 0,
  arealCenterFeature = null,
  areaGeometry = null,
  selectedRegionFeatures = [],
  regionBufferKm = 0
} = {}) {
  const allowed = Array.isArray(kinds) && kinds.length > 0 ? new Set(kinds) : null;
  const include = (kind) => !allowed || allowed.has(kind);
  const overlays = [];

  if (include(TEMP_OVERLAY_KINDS.POLYGON)) {
    const features = [];
    visibleBuiltPolygons.forEach((entry) => {
      const cloned = cloneOverlayFeature(entry?.polygon, {
        color: entry?.outlineColor || entry?.polygon?.properties?.outlineColor,
        fillOpacity: 0.14
      });
      if (cloned) {
        features.push(cloned);
      }
    });
    if (intersectionResult?.hasIntersection && intersectionResult.feature?.geometry) {
      const cloned = cloneOverlayFeature(intersectionResult.feature, {
        color: "#8b5cf6",
        fillOpacity: 0.22
      });
      if (cloned) {
        features.push(cloned);
      }
    }
    const polygonOverlay = overlayEntry(TEMP_OVERLAY_KINDS.POLYGON, features);
    if (polygonOverlay) {
      overlays.push(polygonOverlay);
    }
  }

  if (include(TEMP_OVERLAY_KINDS.BUFFER) && bufferEnabled) {
    const rings = buildBufferRings(bufferFeatures, bufferRadiiKm).map((ring) =>
      cloneOverlayFeature(ring, { fillOpacity: 0.35 })
    );
    const bufferOverlay = overlayEntry(TEMP_OVERLAY_KINDS.BUFFER, rings);
    if (bufferOverlay) {
      overlays.push(bufferOverlay);
    }
  }

  if (include(TEMP_OVERLAY_KINDS.AREAL) && (arealEnabled || arealAllMarkers) && arealRadius > 0) {
    const circles = [];
    if (arealAllMarkers && map) {
      getUnclusteredFeatures(map, baseFilters).forEach((feature) => {
        const circleFeature = arealCircleFeature(
          feature?.geometry?.coordinates,
          arealRadius,
          getPointColorForRegnum(feature?.properties?.regnum)
        );
        if (circleFeature) {
          circles.push(circleFeature);
        }
      });
    } else if (arealEnabled && arealCenterFeature?.geometry?.coordinates) {
      const circleFeature = arealCircleFeature(
        arealCenterFeature.geometry.coordinates,
        arealRadius,
        getPointColorForRegnum(arealCenterFeature.properties?.regnum)
      );
      if (circleFeature) {
        circles.push(circleFeature);
      }
    }
    const arealOverlay = overlayEntry(TEMP_OVERLAY_KINDS.AREAL, circles);
    if (arealOverlay) {
      overlays.push(arealOverlay);
    }
  }

  if (include(TEMP_OVERLAY_KINDS.AREA) && areaGeometry) {
    const areaOverlay = overlayEntry(TEMP_OVERLAY_KINDS.AREA, [
      cloneOverlayFeature(geometryToFeature(areaGeometry), {
        color: "#3498db",
        fillOpacity: 0.22
      })
    ]);
    if (areaOverlay) {
      overlays.push(areaOverlay);
    }
  }

  if (include(TEMP_OVERLAY_KINDS.REGIONS)) {
    const regionOverlay = overlayEntry(
      TEMP_OVERLAY_KINDS.REGIONS,
      collectRegionSelectionOverlayFeatures(selectedRegionFeatures, regionBufferKm)
    );
    if (regionOverlay) {
      overlays.push(regionOverlay);
    }
  }

  return overlays;
}
