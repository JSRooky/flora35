import React, { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_MAP_ZOOM } from "./initMap";
import "../styles/MapZoomControl.css";

function readZoomState(map) {
  if (!map?.getZoom) {
    return { zoom: 0, minZoom: 0, maxZoom: 22 };
  }
  const zoom = map.getZoom();
  return {
    zoom,
    minZoom: map.getMinZoom?.() ?? 0,
    maxZoom: map.getMaxZoom?.() ?? 22
  };
}

function clampZoom(value, minZoom, maxZoom) {
  return Math.min(maxZoom, Math.max(minZoom, value));
}

function zoomFromPointer(event, track, minZoom, maxZoom) {
  const rect = track.getBoundingClientRect();
  if (rect.width <= 0) {
    return minZoom;
  }
  const ratio = (event.clientX - rect.left) / rect.width;
  return clampZoom(minZoom + ratio * (maxZoom - minZoom), minZoom, maxZoom);
}

/** Горизонтальный слайдер масштаба в стиле KDE Breeze. */
export default function MapZoomControl({ map = null }) {
  const trackRef = useRef(null);
  const draggingRef = useRef(false);
  const [{ zoom, minZoom, maxZoom }, setZoomState] = useState(() =>
    readZoomState(map)
  );

  useEffect(() => {
    if (!map) {
      setZoomState(readZoomState(null));
      return undefined;
    }

    const sync = () => {
      if (draggingRef.current) {
        return;
      }
      setZoomState(readZoomState(map));
    };
    sync();
    map.on("zoom", sync);
    map.on("zoomend", sync);
    return () => {
      map.off("zoom", sync);
      map.off("zoomend", sync);
    };
  }, [map]);

  const applyZoom = useCallback(
    (nextZoom, animate) => {
      if (!map) {
        return;
      }
      const clamped = clampZoom(nextZoom, minZoom, maxZoom);
      setZoomState((prev) => ({ ...prev, zoom: clamped }));
      if (animate) {
        map.easeTo({ zoom: clamped, duration: 160 });
        return;
      }
      map.jumpTo({ zoom: clamped });
    },
    [map, maxZoom, minZoom]
  );

  useEffect(() => {
    const onMove = (event) => {
      if (!draggingRef.current || !trackRef.current) {
        return;
      }
      applyZoom(zoomFromPointer(event, trackRef.current, minZoom, maxZoom), false);
    };
    const onUp = () => {
      if (!draggingRef.current) {
        return;
      }
      draggingRef.current = false;
      document.body.style.removeProperty("user-select");
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [applyZoom, maxZoom, minZoom]);

  if (!map) {
    return null;
  }

  const canZoomIn = zoom < maxZoom - 0.01;
  const canZoomOut = zoom > minZoom + 0.01;
  const span = Math.max(0.001, maxZoom - minZoom);
  const percent = ((zoom - minZoom) / span) * 100;

  return (
    <div className="map-zoom-control" aria-label="Масштаб карты">
      <button
        type="button"
        className="map-zoom-control-btn"
        onClick={() => applyZoom(zoom - 1, true)}
        disabled={!canZoomOut}
        aria-label="Отдалить"
        title="Отдалить"
      >
        <span className="map-zoom-control-minus" aria-hidden="true" />
      </button>
      <div
        className="map-zoom-control-slider"
        role="slider"
        tabIndex={0}
        aria-label="Масштаб"
        aria-orientation="horizontal"
        aria-valuemin={minZoom}
        aria-valuemax={maxZoom}
        aria-valuenow={Number(zoom.toFixed(1))}
        title={`Масштаб ${zoom.toFixed(1)}`}
        onKeyDown={(event) => {
          if (event.key === "ArrowRight" || event.key === "ArrowUp") {
            event.preventDefault();
            applyZoom(zoom + 0.5, true);
          }
          if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
            event.preventDefault();
            applyZoom(zoom - 0.5, true);
          }
          if (event.key === "Home") {
            event.preventDefault();
            applyZoom(minZoom, true);
          }
          if (event.key === "End") {
            event.preventDefault();
            applyZoom(maxZoom, true);
          }
        }}
      >
        <div
          ref={trackRef}
          className="map-zoom-control-track"
          onPointerDown={(event) => {
            event.preventDefault();
            draggingRef.current = true;
            document.body.style.userSelect = "none";
            trackRef.current?.setPointerCapture?.(event.pointerId);
            applyZoom(zoomFromPointer(event, trackRef.current, minZoom, maxZoom), false);
          }}
        >
          <div className="map-zoom-control-fill" style={{ width: `${percent}%` }} />
          <div className="map-zoom-control-thumb" style={{ left: `${percent}%` }} />
        </div>
      </div>
      <button
        type="button"
        className="map-zoom-control-btn"
        onClick={() => applyZoom(zoom + 1, true)}
        disabled={!canZoomIn}
        aria-label="Приблизить"
        title="Приблизить"
      >
        <span className="map-zoom-control-plus" aria-hidden="true" />
      </button>
      <button
        type="button"
        className="map-zoom-control-btn"
        onClick={() => applyZoom(DEFAULT_MAP_ZOOM, true)}
        disabled={Math.abs(zoom - DEFAULT_MAP_ZOOM) < 0.05}
        aria-label="Масштаб по умолчанию"
        title="Масштаб по умолчанию"
      >
        <span className="map-zoom-control-home" aria-hidden="true" />
      </button>
    </div>
  );
}
