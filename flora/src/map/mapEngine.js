import maplibregl from "maplibre-gl/dist/maplibre-gl-csp";
import "maplibre-gl/dist/maplibre-gl.css";

// CRA ломает worker-loader на ESM-обёртке MapLibre. CSP-сборка грузит воркер по URL из public/.
function getMapLibreWorkerUrl() {
  const publicUrl = (process.env.PUBLIC_URL || "").replace(/\/$/, "");
  const workerPath = `${publicUrl}/maplibre-gl-csp-worker.js`;
  if (typeof window === "undefined") {
    return workerPath;
  }
  return new URL(workerPath, window.location.origin).href;
}

const workerUrl = getMapLibreWorkerUrl();
if (maplibregl.config) {
  maplibregl.config.WORKER_URL = workerUrl;
}
if (typeof maplibregl.setWorkerUrl === "function") {
  maplibregl.setWorkerUrl(workerUrl);
}

export default maplibregl;
