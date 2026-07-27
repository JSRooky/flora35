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

let drawingActive = false;
let drawingMap = null;
let drawingHandlers = null;

function distancePx(map, coordA, coordB) {
  const pointA = map.project(coordA);
  const pointB = map.project(coordB);
  return Math.hypot(pointA.x - pointB.x, pointA.y - pointB.y);
}

function setMapDrawingCursor(map, active) {
  map.getCanvas().style.cursor = active ? "crosshair" : "";
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

/**
 * Включает режим рисования области мышью на карте.
 * onComplete получает замкнутое кольцо координат; onPreview — текущий контур.
 */
export function startAreaDrawing(map, { onPreview, onComplete }) {
  stopAreaDrawing(map);

  drawingActive = true;
  drawingMap = map;

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

    const closedRing = [...coordinates, coordinates[0]];
    onComplete?.(closedRing);
    coordinates = [];
  };

  const handleMouseUp = () => {
    finishDrawing();
  };

  const handleMouseLeave = () => {
    finishDrawing();
  };

  map.on("mousedown", handleMouseDown);
  map.on("mousemove", handleMouseMove);
  map.on("mouseup", handleMouseUp);
  map.on("mouseleave", handleMouseLeave);

  drawingHandlers = {
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleMouseLeave
  };
}

/** Выключает режим рисования и снимает обработчики с карты. */
export function stopAreaDrawing(map) {
  if (map && drawingHandlers) {
    map.off("mousedown", drawingHandlers.handleMouseDown);
    map.off("mousemove", drawingHandlers.handleMouseMove);
    map.off("mouseup", drawingHandlers.handleMouseUp);
    map.off("mouseleave", drawingHandlers.handleMouseLeave);
    map.dragPan.enable();
    setMapDrawingCursor(map, false);
  }

  drawingActive = false;
  drawingMap = null;
  drawingHandlers = null;
}

/** Останавливает рисование на карте, на которой оно было начато. */
export function stopActiveAreaDrawing() {
  if (drawingMap) {
    stopAreaDrawing(drawingMap);
  }
}
