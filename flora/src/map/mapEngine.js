import maplibregl from "maplibre-gl/dist/maplibre-gl-csp";
import "maplibre-gl/dist/maplibre-gl.css";

// CRA ломает worker-loader на ESM-обёртке. MapLibre CSP ждёт абсолютный URL воркера.
function getMapLibreWorkerUrl() {
  const publicUrl = process.env.PUBLIC_URL || "";
  const workerPath = `${publicUrl}/maplibre-gl-csp-worker.js`.replace(/([^:]\/)\/+/g, "$1");
  if (typeof window === "undefined") {
    return workerPath;
  }
  return new URL(workerPath, window.location.origin).href;
}

const workerUrl = getMapLibreWorkerUrl();
if (typeof maplibregl.setWorkerUrl === "function") {
  maplibregl.setWorkerUrl(workerUrl);
} else if (maplibregl.config) {
  maplibregl.config.WORKER_URL = workerUrl;
}

export default maplibregl;
