import { booleanPointInPolygon, point, polygon } from "@turf/turf";
import { getFilteredFeatures } from "./addLocationsLayer";

const SOURCE_ID = "area-selection";
const PREVIEW_SOURCE_ID = "area-selection-preview";

const EMPTY_COLLECTION = {
  type: "FeatureCollection",
  features: []
};

const FILL_COLOR = "#3498db";
const OUTLINE_COLOR = "#2980b9";

const MIN_VERTEX_COUNT = 3;
const MIN_DISTANCE_PX = 4;
const MIN_RECTANGLE_PX = 6;

export const AREA_DRAW_MODES = {
  FREEHAND: "freehand",
  RECTANGLE: "rectangle",
  POLYGON: "polygon"
};

let drawingActive = false;
let drawingMap = null;
let drawingHandlers = null;
let drawingKeyHandler = null;
let drawingInteractionState = null;

function distancePx(map, coordA, coordB) {
  const pointA = map.project(coordA);
  const pointB = map.project(coordB);
  return Math.hypot(pointA.x - pointB.x, pointA.y - pointB.y);
}

function setMapDrawingCursor(map, active) {
  map.getCanvas().style.cursor = active ? "crosshair" : "";
}

function rectangleRingFromCorners(cornerA, cornerB) {
  const minLng = Math.min(cornerA[0], cornerB[0]);
  const maxLng = Math.max(cornerA[0], cornerB[0]);
  const minLat = Math.min(cornerA[1], cornerB[1]);
  const maxLat = Math.max(cornerA[1], cornerB[1]);

  return [
    [minLng, minLat],
    [maxLng, minLat],
    [maxLng, maxLat],
    [minLng, maxLat],
    [minLng, minLat]
  ];
}

function attachDrawingHandlers(map, handlers, interactionState = {}) {
  drawingHandlers = handlers;
  drawingInteractionState = interactionState;

  Object.entries(handlers).forEach(([eventName, handler]) => {
    if (handler) {
      map.on(eventName, handler);
    }
  });
}

function detachDrawingHandlers(map) {
  if (!map || !drawingHandlers) {
    return;
  }

  Object.entries(drawingHandlers).forEach(([eventName, handler]) => {
    if (handler) {
      map.off(eventName, handler);
    }
  });

  if (drawingKeyHandler) {
    window.removeEventListener("keydown", drawingKeyHandler);
    drawingKeyHandler = null;
  }

  if (drawingInteractionState?.dragPanDisabled) {
    map.dragPan.enable();
  }

  if (drawingInteractionState?.doubleClickZoomDisabled) {
    map.doubleClickZoom.enable();
  }

  setMapDrawingCursor(map, false);
}

/** Идёт ли сейчас рисование области на карте. */
export function isAreaDrawingActive() {
  return drawingActive;
}

/** Добавляет на карту слои выделенной области и предпросмотра контура. */
export function addAreaSelectionLayer(map) {
  if (map.getSource(SOURCE_ID)) {
    return;
  }

  map.addSource(SOURCE_ID, {
    type: "geojson",
    data: EMPTY_COLLECTION
  });

  map.addSource(PREVIEW_SOURCE_ID, {
    type: "geojson",
    data: EMPTY_COLLECTION
  });

  map.addLayer({
    id: "area-selection-fill",
    type: "fill",
    source: SOURCE_ID,
    paint: {
      "fill-color": FILL_COLOR,
      "fill-opacity": 0.25
    }
  });

  map.addLayer({
    id: "area-selection-outline",
    type: "line",
    source: SOURCE_ID,
    paint: {
      "line-color": OUTLINE_COLOR,
      "line-width": 2
    }
  });

  map.addLayer({
    id: "area-selection-preview",
    type: "line",
    source: PREVIEW_SOURCE_ID,
    paint: {
      "line-color": OUTLINE_COLOR,
      "line-width": 2,
      "line-dasharray": [2, 1]
    }
  });
}

/** Обновляет контур области во время рисования. */
export function updateAreaSelectionPreview(map, coordinates) {
  const source = map.getSource(PREVIEW_SOURCE_ID);
  if (!source || coordinates.length < 2) {
    return;
  }

  source.setData({
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates
        }
      }
    ]
  });
}

/** Рисует завершённую область на карте. ringCoordinates — замкнутое кольцо [lng, lat]. */
export function updateAreaSelectionLayer(map, ringCoordinates) {
  const source = map.getSource(SOURCE_ID);
  const previewSource = map.getSource(PREVIEW_SOURCE_ID);

  if (!source) {
    return;
  }

  previewSource?.setData(EMPTY_COLLECTION);

  if (!ringCoordinates || ringCoordinates.length < 4) {
    source.setData(EMPTY_COLLECTION);
    return;
  }

  source.setData({
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: {
          type: "Polygon",
          coordinates: [ringCoordinates]
        }
      }
    ]
  });
}

/** Убирает область и предпросмотр с карты. */
export function clearAreaSelectionLayer(map) {
  const source = map.getSource(SOURCE_ID);
  const previewSource = map.getSource(PREVIEW_SOURCE_ID);

  source?.setData(EMPTY_COLLECTION);
  previewSource?.setData(EMPTY_COLLECTION);
}

/** Возвращает точки из отфильтрованного набора, попавшие внутрь полигона. */
export function getPointsWithinArea(ringCoordinates, filters = {}) {
  if (!ringCoordinates || ringCoordinates.length < 4) {
    return [];
  }

  const areaPolygon = polygon([ringCoordinates]);

  return getFilteredFeatures(filters).filter((feature) => {
    const coordinates = feature.geometry?.coordinates;
    if (!coordinates) {
      return false;
    }

    return booleanPointInPolygon(point(coordinates), areaPolygon);
  });
}

/** Сводка по точкам внутри области: количество и отсортированный список. */
export function getAreaContainedPointsSummary(ringCoordinates, filters = {}) {
  const points = getPointsWithinArea(ringCoordinates, filters).sort((a, b) => {
    const nameA = a.properties?.name_ru ?? "";
    const nameB = b.properties?.name_ru ?? "";
    return nameA.localeCompare(nameB, "ru");
  });

  return {
    count: points.length,
    points
  };
}

function startFreehandDrawing(map, { onPreview, onComplete }) {
  let coordinates = [];
  let isDrawing = false;

  const handleMouseDown = (event) => {
    if (event.originalEvent.button !== 0) {
      return;
    }

    isDrawing = true;
    coordinates = [event.lngLat.toArray()];
    map.dragPan.disable();
    setMapDrawingCursor(map, true);
    onPreview?.(coordinates);
    event.preventDefault();
  };

  const handleMouseMove = (event) => {
    if (!isDrawing) {
      return;
    }

    const nextCoordinate = event.lngLat.toArray();
    const lastCoordinate = coordinates[coordinates.length - 1];

    if (distancePx(map, lastCoordinate, nextCoordinate) >= MIN_DISTANCE_PX) {
      coordinates = [...coordinates, nextCoordinate];
      onPreview?.(coordinates);
    }
  };

  const finishDrawing = () => {
    if (!isDrawing) {
      return;
    }

    isDrawing = false;
    map.dragPan.enable();
    setMapDrawingCursor(map, false);

    if (coordinates.length < MIN_VERTEX_COUNT) {
      coordinates = [];
      onPreview?.([]);
      return;
    }

    onComplete?.([...coordinates, coordinates[0]]);
    coordinates = [];
  };

  attachDrawingHandlers(
    map,
    {
      mousedown: handleMouseDown,
      mousemove: handleMouseMove,
      mouseup: finishDrawing,
      mouseleave: finishDrawing
    },
    { dragPanDisabled: true }
  );
}

function startRectangleDrawing(map, { onPreview, onComplete }) {
  let anchor = null;
  let current = null;
  let isDrawing = false;

  const handleMouseDown = (event) => {
    if (event.originalEvent.button !== 0) {
      return;
    }

    anchor = event.lngLat.toArray();
    current = anchor;
    isDrawing = true;
    map.dragPan.disable();
    setMapDrawingCursor(map, true);
    onPreview?.(rectangleRingFromCorners(anchor, current));
    event.preventDefault();
  };

  const handleMouseMove = (event) => {
    if (!isDrawing || !anchor) {
      return;
    }

    current = event.lngLat.toArray();
    onPreview?.(rectangleRingFromCorners(anchor, current));
  };

  const finishDrawing = () => {
    if (!isDrawing || !anchor || !current) {
      return;
    }

    isDrawing = false;
    map.dragPan.enable();
    setMapDrawingCursor(map, false);

    if (distancePx(map, anchor, current) < MIN_RECTANGLE_PX) {
      anchor = null;
      current = null;
      onPreview?.([]);
      return;
    }

    onComplete?.(rectangleRingFromCorners(anchor, current));
    anchor = null;
    current = null;
  };

  const cancelDrawing = () => {
    if (!isDrawing) {
      return;
    }

    isDrawing = false;
    anchor = null;
    current = null;
    map.dragPan.enable();
    setMapDrawingCursor(map, false);
    onPreview?.([]);
  };

  attachDrawingHandlers(
    map,
    {
      mousedown: handleMouseDown,
      mousemove: handleMouseMove,
      mouseup: finishDrawing,
      mouseleave: cancelDrawing
    },
    { dragPanDisabled: true }
  );
}

function startPolygonDrawing(map, { onPreview, onComplete, onCancel }) {
  let coordinates = [];

  const finishPolygon = () => {
    if (coordinates.length < MIN_VERTEX_COUNT) {
      return;
    }

    onComplete?.([...coordinates, coordinates[0]]);
    coordinates = [];
  };

  const handleClick = (event) => {
    if (event.originalEvent.detail > 1) {
      return;
    }

    coordinates = [...coordinates, event.lngLat.toArray()];
    onPreview?.(coordinates);
  };

  const handleDblClick = (event) => {
    event.preventDefault();
    finishPolygon();
  };

  const handleContextMenu = (event) => {
    event.preventDefault();
    finishPolygon();
  };

  const handleMouseMove = (event) => {
    if (coordinates.length === 0) {
      return;
    }

    onPreview?.([...coordinates, event.lngLat.toArray()]);
  };

  drawingKeyHandler = (event) => {
    if (event.key === "Escape") {
      coordinates = [];
      onPreview?.([]);
      onCancel?.();
    }
  };

  window.addEventListener("keydown", drawingKeyHandler);
  map.doubleClickZoom.disable();
  setMapDrawingCursor(map, true);

  attachDrawingHandlers(
    map,
    {
      click: handleClick,
      dblclick: handleDblClick,
      contextmenu: handleContextMenu,
      mousemove: handleMouseMove
    },
    { doubleClickZoomDisabled: true }
  );
}

/**
 * Включает режим рисования области на карте.
 * mode — AREA_DRAW_MODES.FREEHAND | RECTANGLE | POLYGON.
 * onComplete получает замкнутое кольцо координат; onPreview — текущий контур.
 */
export function startAreaDrawing(map, mode, { onPreview, onComplete, onCancel }) {
  stopAreaDrawing(map);

  drawingActive = true;
  drawingMap = map;

  if (mode === AREA_DRAW_MODES.RECTANGLE) {
    startRectangleDrawing(map, { onPreview, onComplete });
    return;
  }

  if (mode === AREA_DRAW_MODES.POLYGON) {
    startPolygonDrawing(map, { onPreview, onComplete, onCancel });
    return;
  }

  startFreehandDrawing(map, { onPreview, onComplete });
}

/** Выключает режим рисования и снимает обработчики с карты. */
export function stopAreaDrawing(map) {
  if (map) {
    detachDrawingHandlers(map);
  }

  drawingActive = false;
  drawingMap = null;
  drawingHandlers = null;
  drawingInteractionState = null;
}

/** Останавливает рисование на карте, на которой оно было начато. */
export function stopActiveAreaDrawing() {
  if (drawingMap) {
    stopAreaDrawing(drawingMap);
  }
}
