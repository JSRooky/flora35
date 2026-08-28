import { applyMapCursor } from "./addLocationsLayer";
import { applyRegionStylePaint, emitRegionBoundsSelect, getRegionEntryByIso, hideRegionHoverPopup, isRegionActionPopupOpen, REGION_BOUNDS_FILL_LAYER_ID, showRegionHoverPopup } from "./addRegionBoundsLayer";
import {
  getArchivedRegionOverlayFeatures,
  getVisibleRegionOverlayEditState,
  getVisibleTempLayerOverlays,
  isRegionOverlayBufferFeature,
  osmOverlayEntryFromFeature,
  overlayFeatureIso
} from "../tempLayers/tempLayerStore";

export const TEMP_OVERLAY_SOURCE_ID = "temp-layer-overlays";
export const TEMP_OVERLAY_FILL_LAYER_ID = "temp-layer-overlays-fill";
export const TEMP_OVERLAY_HATCH_LAYER_ID = "temp-layer-overlays-archive-hatch";
export const TEMP_OVERLAY_LINE_LAYER_ID = "temp-layer-overlays-line";
export const TEMP_OVERLAY_ARCHIVED_LINE_LAYER_ID = "temp-layer-overlays-archive-line";

const EMPTY_COLLECTION = {
  type: "FeatureCollection",
  features: []
};

const DEFAULT_HATCH_IMAGE_ID = "temp-archive-hatch-v3-default";
const DEFAULT_HATCH_COLOR = "#6b7280";
const ARCHIVED_OVERLAY_ROLE = "archived-region";

const FILL_COLOR = [
  "coalesce",
  ["get", "color"],
  ["get", "outlineColor"],
  "#3498db"
];

const LIVE_OVERLAY_FILTER = ["!=", ["get", "overlayRole"], ARCHIVED_OVERLAY_ROLE];
const ARCHIVED_OVERLAY_FILTER = ["==", ["get", "overlayRole"], ARCHIVED_OVERLAY_ROLE];

function hatchImageId(color) {
  const hex = String(color || DEFAULT_HATCH_COLOR).replace("#", "").replace(/[^a-zA-Z0-9]/g, "");
  return hex ? `temp-archive-hatch-v3-${hex}` : DEFAULT_HATCH_IMAGE_ID;
}

function parseHexColor(color) {
  const raw = String(color || DEFAULT_HATCH_COLOR).trim();
  const hex = raw.startsWith("#") ? raw.slice(1) : raw;
  if (hex.length === 3) {
    const [r, g, b] = hex.split("");
    return [parseInt(r + r, 16), parseInt(g + g, 16), parseInt(b + b, 16)];
  }
  if (hex.length >= 6) {
    return [
      parseInt(hex.slice(0, 2), 16),
      parseInt(hex.slice(2, 4), 16),
      parseInt(hex.slice(4, 6), 16)
    ];
  }
  return [107, 114, 128];
}

function buildHatchImageData(color) {
  const size = 48;
  const period = 12;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, size, size);
  const [r, g, b] = parseHexColor(color);
  ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.08)`;
  ctx.lineWidth = 1.25;
  ctx.lineCap = "butt";
  // Сдвиги на размер тайла, чтобы диагональ смыкалась на стыках.
  const shifts = [0, -size, size];
  for (const ox of shifts) {
    for (const oy of shifts) {
      for (let i = -size * 2; i <= size * 2; i += period) {
        ctx.beginPath();
        ctx.moveTo(ox + i, oy);
        ctx.lineTo(ox + i + size, oy + size);
        ctx.stroke();
      }
    }
  }
  return ctx.getImageData(0, 0, size, size);
}

function ensureHatchImage(map, color) {
  if (!map?.addImage) {
    return DEFAULT_HATCH_IMAGE_ID;
  }
  const id = hatchImageId(color);
  const image = buildHatchImageData(color);
  const options = { pixelRatio: 2 };
  if (map.hasImage?.(id)) {
    map.updateImage(id, image);
  } else {
    map.addImage(id, image, options);
  }
  return id;
}

function applyPropertyBasedOverlayPaint(map) {
  if (map.getLayer(TEMP_OVERLAY_FILL_LAYER_ID)) {
    map.setPaintProperty(TEMP_OVERLAY_FILL_LAYER_ID, "fill-color", FILL_COLOR);
    map.setPaintProperty(TEMP_OVERLAY_FILL_LAYER_ID, "fill-opacity", [
      "case",
      ["boolean", ["feature-state", "selected"], false],
      0.45,
      ["boolean", ["feature-state", "hover"], false],
      0.34,
      ["coalesce", ["get", "fillOpacity"], 0.2]
    ]);
  }
  if (map.getLayer(TEMP_OVERLAY_LINE_LAYER_ID)) {
    map.setPaintProperty(TEMP_OVERLAY_LINE_LAYER_ID, "line-color", FILL_COLOR);
    map.setPaintProperty(TEMP_OVERLAY_LINE_LAYER_ID, "line-width", [
      "case",
      ["boolean", ["feature-state", "selected"], false],
      2.8,
      ["boolean", ["feature-state", "hover"], false],
      2.2,
      1.4
    ]);
    map.setPaintProperty(TEMP_OVERLAY_LINE_LAYER_ID, "line-opacity", 0.9);
  }
}

export function applyTempRegionOverlayPaint(map, { settings, featureColors } = {}) {
  if (!map?.getLayer) {
    return;
  }
  if (!settings) {
    applyPropertyBasedOverlayPaint(map);
    return;
  }
  applyRegionStylePaint(map, {
    fillLayerId: TEMP_OVERLAY_FILL_LAYER_ID,
    lineLayerId: TEMP_OVERLAY_LINE_LAYER_ID,
    settings,
    colorsByIso: featureColors
  });
}

let overlaySelectAttached = false;
let overlayHatchSelectAttached = false;
let overlayHoverAttached = false;
const overlayStateByMap = new WeakMap();
const mapsWithPromotedOverlaySource = new WeakSet();
let lastOverlayHiddenIsos = [];

function overlayBeforeId(map) {
  return map.getLayer(REGION_BOUNDS_FILL_LAYER_ID) ? REGION_BOUNDS_FILL_LAYER_ID : undefined;
}

function overlayFeatureId(feature) {
  const iso = feature?.properties?.iso || feature?.properties?.ISO_1 || feature?.id;
  return iso == null || iso === "" ? null : String(iso);
}

function overlayEntryFromHit(feature) {
  const iso = overlayFeatureId(feature);
  if (!iso) {
    return null;
  }
  return (
    getRegionEntryByIso(iso) ??
    osmOverlayEntryFromFeature(feature) ?? {
      iso,
      name: feature.properties?.title || feature.properties?.name || feature.properties?.name_en || iso,
      nameEn: feature.properties?.name_en || "",
      fo: feature.properties?.fo || "OSM",
      feature
    }
  );
}

function pickOverlayFeature(event) {
  const map = event?.target;
  if (!map?.queryRenderedFeatures || !event?.point) {
    return event?.features?.[0] ?? null;
  }
  const layerIds = [TEMP_OVERLAY_FILL_LAYER_ID, TEMP_OVERLAY_HATCH_LAYER_ID].filter((id) =>
    map.getLayer(id)
  );
  const hits = layerIds.length ? map.queryRenderedFeatures(event.point, { layers: layerIds }) : event.features ?? [];
  const live = hits.filter((hit) => hit.properties?.overlayRole !== ARCHIVED_OVERLAY_ROLE);
  return live.find((hit) => hit.properties?.overlayRole === "districts") || live[0] || hits[0] || null;
}

function overlayMapState(map) {
  const current = overlayStateByMap.get(map) ?? { hoveredId: null, selectedIds: [] };
  overlayStateByMap.set(map, current);
  return current;
}

function setOverlayHover(map, id) {
  if (!map?.setFeatureState) {
    return;
  }
  const state = overlayMapState(map);
  if (state.hoveredId === id) {
    return;
  }
  if (state.hoveredId != null) {
    map.setFeatureState({ source: TEMP_OVERLAY_SOURCE_ID, id: state.hoveredId }, { hover: false });
  }
  if (id != null) {
    map.setFeatureState({ source: TEMP_OVERLAY_SOURCE_ID, id }, { hover: true });
  }
  state.hoveredId = id;
}

export function setTempOverlaySelectedIsos(map, isos = []) {
  if (!map?.setFeatureState || !map.getSource?.(TEMP_OVERLAY_SOURCE_ID)) {
    return;
  }
  const nextIds = [...new Set((isos ?? []).filter(Boolean).map(String))];
  const state = overlayMapState(map);
  (state.selectedIds || []).forEach((id) => {
    if (!nextIds.includes(id)) {
      map.setFeatureState({ source: TEMP_OVERLAY_SOURCE_ID, id }, { selected: false });
    }
  });
  nextIds.forEach((id) => {
    map.setFeatureState({ source: TEMP_OVERLAY_SOURCE_ID, id }, { selected: true });
  });
  state.selectedIds = nextIds;
}

function handleOverlayClick(event) {
  const feature = pickOverlayFeature(event);
  const entry = overlayEntryFromHit(feature);
  if (!entry) {
    return;
  }
  event.preventDefault?.();
  hideRegionHoverPopup();
  emitRegionBoundsSelect(entry, event.lngLat);
}

function overlayFeatureTitle(feature) {
  const properties = feature?.properties ?? {};
  return (
    properties.title ||
    properties.name ||
    properties.official_name ||
    properties.name_en ||
    properties.iso ||
    ""
  );
}

function handleOverlayMove(event) {
  const map = event.target;
  const feature = pickOverlayFeature(event);
  const id = overlayFeatureId(feature);
  setOverlayHover(map, id);
  applyMapCursor(map, id ? "pointer" : "");
  if (!id || isRegionActionPopupOpen()) {
    hideRegionHoverPopup();
    return;
  }
  const title = overlayFeatureTitle(feature);
  if (title && event.lngLat) {
    showRegionHoverPopup(map, event.lngLat, title);
  } else {
    hideRegionHoverPopup();
  }
}

function handleOverlayLeave(event) {
  const map = event.target;
  setOverlayHover(map, null);
  applyMapCursor(map, "");
  hideRegionHoverPopup();
}

function attachOverlaySelectHandlers(map) {
  if (!overlaySelectAttached && map?.getLayer?.(TEMP_OVERLAY_FILL_LAYER_ID)) {
    map.on("click", TEMP_OVERLAY_FILL_LAYER_ID, handleOverlayClick);
    overlaySelectAttached = true;
  }
  if (!overlayHatchSelectAttached && map?.getLayer?.(TEMP_OVERLAY_HATCH_LAYER_ID)) {
    map.on("click", TEMP_OVERLAY_HATCH_LAYER_ID, handleOverlayClick);
    overlayHatchSelectAttached = true;
  }
  if (!overlayHoverAttached && map?.getLayer?.(TEMP_OVERLAY_FILL_LAYER_ID)) {
    map.on("mousemove", TEMP_OVERLAY_FILL_LAYER_ID, handleOverlayMove);
    map.on("mouseleave", TEMP_OVERLAY_FILL_LAYER_ID, handleOverlayLeave);
    if (map.getLayer(TEMP_OVERLAY_LINE_LAYER_ID)) {
      map.on("mousemove", TEMP_OVERLAY_LINE_LAYER_ID, handleOverlayMove);
      map.on("mouseleave", TEMP_OVERLAY_LINE_LAYER_ID, handleOverlayLeave);
    }
    overlayHoverAttached = true;
  }
}

function removeOverlayMapLayers(map) {
  [
    TEMP_OVERLAY_FILL_LAYER_ID,
    TEMP_OVERLAY_HATCH_LAYER_ID,
    TEMP_OVERLAY_LINE_LAYER_ID,
    TEMP_OVERLAY_ARCHIVED_LINE_LAYER_ID
  ].forEach((layerId) => {
    if (map.getLayer(layerId)) {
      map.removeLayer(layerId);
    }
  });
}

function ensurePromotedOverlaySource(map) {
  if (mapsWithPromotedOverlaySource.has(map) && map.getSource(TEMP_OVERLAY_SOURCE_ID)) {
    return;
  }
  overlaySelectAttached = false;
  overlayHatchSelectAttached = false;
  overlayHoverAttached = false;
  removeOverlayMapLayers(map);
  if (map.getSource(TEMP_OVERLAY_SOURCE_ID)) {
    map.removeSource(TEMP_OVERLAY_SOURCE_ID);
  }
  map.addSource(TEMP_OVERLAY_SOURCE_ID, {
    type: "geojson",
    data: EMPTY_COLLECTION,
    promoteId: "iso"
  });
  mapsWithPromotedOverlaySource.add(map);
}

function placeOverlayBelowRegionBounds(map) {
  const beforeId = overlayBeforeId(map);
  if (!beforeId) {
    return;
  }
  [
    TEMP_OVERLAY_FILL_LAYER_ID,
    TEMP_OVERLAY_HATCH_LAYER_ID,
    TEMP_OVERLAY_LINE_LAYER_ID,
    TEMP_OVERLAY_ARCHIVED_LINE_LAYER_ID
  ].forEach((layerId) => {
    if (map.getLayer(layerId)) {
      map.moveLayer(layerId, beforeId);
    }
  });
}

export function addTempLayerOverlaysLayer(map) {
  if (!map?.getSource) {
    return;
  }

  const beforeId = overlayBeforeId(map);
  ensurePromotedOverlaySource(map);

  if (!map.getLayer(TEMP_OVERLAY_FILL_LAYER_ID)) {
    map.addLayer(
      {
        id: TEMP_OVERLAY_FILL_LAYER_ID,
        type: "fill",
        source: TEMP_OVERLAY_SOURCE_ID,
        filter: LIVE_OVERLAY_FILTER,
        paint: {
          "fill-color": FILL_COLOR,
          "fill-opacity": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            0.45,
            ["boolean", ["feature-state", "hover"], false],
            0.34,
            ["coalesce", ["get", "fillOpacity"], 0.2]
          ]
        }
      },
      beforeId
    );
  }

  ensureHatchImage(map, DEFAULT_HATCH_COLOR);
  if (!map.getLayer(TEMP_OVERLAY_HATCH_LAYER_ID)) {
    map.addLayer(
      {
        id: TEMP_OVERLAY_HATCH_LAYER_ID,
        type: "fill",
        source: TEMP_OVERLAY_SOURCE_ID,
        filter: ARCHIVED_OVERLAY_FILTER,
        paint: {
          "fill-pattern": ["coalesce", ["get", "archiveHatchId"], DEFAULT_HATCH_IMAGE_ID],
          "fill-opacity": 0.7
        }
      },
      beforeId
    );
  }

  if (!map.getLayer(TEMP_OVERLAY_LINE_LAYER_ID)) {
    map.addLayer(
      {
        id: TEMP_OVERLAY_LINE_LAYER_ID,
        type: "line",
        source: TEMP_OVERLAY_SOURCE_ID,
        filter: LIVE_OVERLAY_FILTER,
        paint: {
          "line-color": FILL_COLOR,
          "line-width": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            2.8,
            ["boolean", ["feature-state", "hover"], false],
            2.2,
            1.4
          ],
          "line-opacity": 0.9
        }
      },
      beforeId
    );
  }

  if (!map.getLayer(TEMP_OVERLAY_ARCHIVED_LINE_LAYER_ID)) {
    map.addLayer(
      {
        id: TEMP_OVERLAY_ARCHIVED_LINE_LAYER_ID,
        type: "line",
        source: TEMP_OVERLAY_SOURCE_ID,
        filter: ARCHIVED_OVERLAY_FILTER,
        paint: {
          "line-color": FILL_COLOR,
          "line-width": 1.1,
          "line-opacity": 0.22
        }
      },
      beforeId
    );
  }

  if (map.getLayer(TEMP_OVERLAY_FILL_LAYER_ID)) {
    map.setFilter(TEMP_OVERLAY_FILL_LAYER_ID, LIVE_OVERLAY_FILTER);
  }
  if (map.getLayer(TEMP_OVERLAY_LINE_LAYER_ID)) {
    map.setFilter(TEMP_OVERLAY_LINE_LAYER_ID, LIVE_OVERLAY_FILTER);
  }
  if (map.getLayer(TEMP_OVERLAY_HATCH_LAYER_ID)) {
    map.setPaintProperty(TEMP_OVERLAY_HATCH_LAYER_ID, "fill-opacity", 0.7);
  }
  if (map.getLayer(TEMP_OVERLAY_ARCHIVED_LINE_LAYER_ID)) {
    map.setPaintProperty(TEMP_OVERLAY_ARCHIVED_LINE_LAYER_ID, "line-opacity", 0.22);
  }

  placeOverlayBelowRegionBounds(map);
  attachOverlaySelectHandlers(map);
}

function stampOverlayIso(feature) {
  const iso = overlayFeatureIso(feature);
  if (!iso) {
    return feature;
  }
  return {
    ...feature,
    id: iso,
    properties: {
      ...(feature.properties ?? {}),
      iso
    }
  };
}

function overlayDrawOrder(role) {
  if (role === "districts") {
    return 2;
  }
  if (role === "region") {
    return 1;
  }
  return 0;
}

export function setTempLayerOverlaysData(map, { regionSettings = null, visible, hiddenIsos } = {}) {
  if (!map?.getSource) {
    return;
  }

  if (hiddenIsos !== undefined) {
    lastOverlayHiddenIsos = hiddenIsos;
  }

  addTempLayerOverlaysLayer(map);
  const source = map.getSource(TEMP_OVERLAY_SOURCE_ID);
  if (!source) {
    return;
  }

  const hiddenSet = new Set((lastOverlayHiddenIsos ?? []).map(String));
  const edit = getVisibleRegionOverlayEditState();
  const features = [
    ...getArchivedRegionOverlayFeatures().map((feature) => {
      const color = feature?.properties?.color || DEFAULT_HATCH_COLOR;
      return {
        ...feature,
        properties: {
          ...(feature.properties ?? {}),
          overlayRole: ARCHIVED_OVERLAY_ROLE,
          archiveHatchId: ensureHatchImage(map, color)
        }
      };
    }),
    ...getVisibleTempLayerOverlays().flatMap((overlay) => {
      const list = overlay.features ?? [];
      if (overlay.kind !== "regions") {
        return list;
      }
      return list.filter((feature) => !isRegionOverlayBufferFeature(feature));
    })
  ]
    .map(stampOverlayIso)
    .filter((feature) => {
      const iso = feature?.properties?.iso;
      if (!iso || hiddenSet.size === 0) {
        return true;
      }
      return !hiddenSet.has(String(iso));
    })
    .sort(
      (left, right) =>
        overlayDrawOrder(left?.properties?.overlayRole) - overlayDrawOrder(right?.properties?.overlayRole)
    );

  source.setData({
    type: "FeatureCollection",
    features
  });

  const overlayOn = visible !== false && features.length > 0;
  const overlayVisibility = overlayOn ? "visible" : "none";
  [TEMP_OVERLAY_FILL_LAYER_ID, TEMP_OVERLAY_HATCH_LAYER_ID, TEMP_OVERLAY_LINE_LAYER_ID, TEMP_OVERLAY_ARCHIVED_LINE_LAYER_ID].forEach((layerId) => {
    if (map.getLayer(layerId)) {
      map.setLayoutProperty(layerId, "visibility", overlayVisibility);
    }
  });

  const settings = regionSettings || edit.style;
  if (edit.active && settings) {
    applyTempRegionOverlayPaint(map, {
      settings,
      featureColors: edit.featureColors
    });
  } else {
    applyPropertyBasedOverlayPaint(map);
  }

  const selectedIds = overlayMapState(map).selectedIds;
  if (Array.isArray(selectedIds) && selectedIds.length > 0) {
    selectedIds.forEach((id) => {
      map.setFeatureState({ source: TEMP_OVERLAY_SOURCE_ID, id }, { selected: true });
    });
  }
}
