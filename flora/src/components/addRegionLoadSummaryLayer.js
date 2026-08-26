import mapboxgl from "mapbox-gl";
import {
  getCachedRegionCatalog,
  loadRegionBoundsGeoJSON,
  emitRegionBoundsSelect
} from "./addRegionBoundsLayer";
import {
  buildExternalIdToCatalogEntry,
  buildRegionLoadSummaries,
  buildTempLayerRegionSummaries,
  formatCompactPointCount,
  isRegionLoadSummaryActive,
  isRegionPlaqueCompact,
  regionPlaqueColorVars,
  setRegionLoadSummaryMode
} from "../map/regionLoadSummary";
import "../styles/RegionLoadSummary.css";

let lastOptions = {
  mode: "external",
  includeGbif: true,
  includeInat: true,
  hiddenRegionIds: []
};
const EYE_ON_SVG = `<svg class="region-load-plaque-display-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" d="M1.76,12s3.72-7.45,10.24-7.45,10.24,7.45,10.24,7.45c0,0-3.72,7.45-10.24,7.45S1.76,12,1.76,12Z"/><circle fill="none" stroke="currentColor" stroke-width="2.2" cx="12" cy="12" r="2.79"/></svg>`;

const EYE_OFF_SVG = `<svg class="region-load-plaque-display-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" d="M17.49,17.49c-1.58,1.2-3.5,1.87-5.49,1.9-6.47,0-10.16-7.39-10.16-7.39,1.15-2.14,2.74-4.01,4.67-5.49"/><path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" d="M10.06,4.83c.64-.15,1.29-.22,1.94-.22,6.47,0,10.16,7.39,10.16,7.39-.56,1.05-1.23,2.04-2,2.95"/><line stroke="currentColor" stroke-width="2.2" stroke-linecap="round" x1="1.84" y1="1.84" x2="22.16" y2="22.16"/></svg>`;

const LIST_SVG = `<svg class="region-load-plaque-display-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" d="M8 6h13M8 12h13M8 18h13"/><circle fill="currentColor" cx="4" cy="6" r="1.4"/><circle fill="currentColor" cx="4" cy="12" r="1.4"/><circle fill="currentColor" cx="4" cy="18" r="1.4"/></svg>`;

/** @type {((summary: object, visible: boolean) => void) | null} */
let displayHandler = null;
/** @type {((summary: object) => void) | null} */
let listHandler = null;

export function setRegionLoadSummaryDisplayHandler(handler) {
  displayHandler = typeof handler === "function" ? handler : null;
}

export function setRegionLoadSummaryListHandler(handler) {
  listHandler = typeof handler === "function" ? handler : null;
}

/** @type {Map<string, import("mapbox-gl").Marker>} */
const markersByRegionId = new Map();
let catalogLoadPromise = null;
/** @type {import("mapbox-gl").Map | null} */
let plaqueMap = null;

function projectLngLat(lngLat) {
  return plaqueMap?.project(lngLat) ?? null;
}

function applyPlaqueScale(marker) {
  const root = marker?.getElement?.();
  const plaque = root?.querySelector?.(".region-load-plaque");
  if (!plaque || !plaqueMap) {
    return;
  }
  const compact = isRegionPlaqueCompact(marker.__regionBounds, projectLngLat);
  plaque.classList.toggle("region-load-plaque--compact", compact);
  const count = plaque.querySelector(".region-load-plaque-count");
  if (count?.dataset.fullLabel) {
    count.textContent = compact
      ? count.dataset.compactLabel || count.dataset.fullLabel
      : count.dataset.fullLabel;
  }
  const stackIndex = marker.__plaqueStackIndex || 0;
  plaque.style.setProperty(
    "--region-load-plaque-stack",
    compact ? "0px" : `${stackIndex * -34}px`
  );
}

function syncAllPlaqueScales() {
  markersByRegionId.forEach((marker) => applyPlaqueScale(marker));
}

function detachPlaqueMapEvents(map) {
  if (!map) {
    return;
  }
  map.off("zoom", syncAllPlaqueScales);
  map.off("move", syncAllPlaqueScales);
  map.off("resize", syncAllPlaqueScales);
}

function attachPlaqueMapEvents(map) {
  if (plaqueMap === map) {
    return;
  }
  detachPlaqueMapEvents(plaqueMap);
  plaqueMap = map;
  map.on("zoom", syncAllPlaqueScales);
  map.on("move", syncAllPlaqueScales);
  map.on("resize", syncAllPlaqueScales);
}

export {
  areLoadedPointMarkersRequested,
  isRegionLoadSummaryActive,
  setLoadedPointMarkersRequested,
  setRegionLoadSummaryActive
} from "../map/regionLoadSummary";

export function setRegionLoadSummaryOptions(options = {}) {
  lastOptions = {
    mode: options.mode === "temp" ? "temp" : "external",
    includeGbif: options.includeGbif !== false,
    includeInat: options.includeInat !== false,
    hiddenRegionIds: Array.isArray(options.hiddenRegionIds) ? options.hiddenRegionIds : []
  };
  setRegionLoadSummaryMode(lastOptions.mode);
}

function clearMarkers() {
  markersByRegionId.forEach((marker) => marker.remove());
  markersByRegionId.clear();
}

export function clearRegionLoadSummary() {
  clearMarkers();
}

function summarySignature(summary) {
  return [
    summary.id || summary.regionId,
    summary.displayOn ? "on" : "off",
    summary.pointCount,
    summary.sources.gbif ? "g" : "",
    summary.sources.inat ? "i" : "",
    summary.sources.map ? "m" : "",
    summary.markerColor || "",
    summary.coordinates[0],
    summary.coordinates[1]
  ].join("|");
}

function applyPlaqueColorVars(element, summary) {
  const vars = regionPlaqueColorVars(summary);
  Object.entries(vars).forEach(([name, value]) => {
    element.style.setProperty(name, value);
  });
}

function plaqueModifierClass(summary) {
  if (summary.sources.gbif && summary.sources.inat) {
    return " region-load-plaque--split";
  }
  if (summary.sources.gbif) {
    return " region-load-plaque--gbif";
  }
  if (summary.sources.inat) {
    return " region-load-plaque--inat";
  }
  return " region-load-plaque--custom";
}

function appendSourceChip(parent, sourceClass, label) {
  const chip = document.createElement("span");
  chip.className = `region-load-plaque-source ${sourceClass}`;
  chip.textContent = label;
  parent.appendChild(chip);
}

function createPlaqueElement(summary, map) {
  const element = document.createElement("div");
  element.className = `region-load-plaque${plaqueModifierClass(summary)}`;
  applyPlaqueColorVars(element, summary);
  element.title = summary.layerName
    ? `${summary.layerName} · ${summary.label}`
    : summary.label;

  const body = document.createElement("div");
  body.className = "region-load-plaque-body";

  const name = document.createElement("span");
  name.className = "region-load-plaque-name";
  name.textContent = summary.layerName || summary.label;
  body.appendChild(name);

  const meta = document.createElement("div");
  meta.className = "region-load-plaque-meta";

  const count = document.createElement("span");
  count.className = "region-load-plaque-count";
  count.dataset.fullLabel = summary.pointCountLabel;
  count.dataset.compactLabel = formatCompactPointCount(summary.pointCount);
  count.textContent = summary.pointCountLabel;
  meta.appendChild(count);

  const sources = document.createElement("span");
  sources.className = "region-load-plaque-sources";
  if (summary.sources.gbif) {
    appendSourceChip(sources, "region-load-plaque-source--gbif", "GBIF");
  }
  if (summary.sources.inat) {
    appendSourceChip(sources, "region-load-plaque-source--inat", "iNat");
  }
  if (summary.sources.map) {
    appendSourceChip(sources, "region-load-plaque-source--map", "Карта");
  }
  if (sources.childNodes.length > 0) {
    meta.appendChild(sources);
  }
  body.appendChild(meta);
  element.appendChild(body);

  const displayOn = Boolean(summary.displayOn);
  const displayBtn = document.createElement("button");
  displayBtn.type = "button";
  displayBtn.className = `region-load-plaque-display${
    displayOn ? "" : " region-load-plaque-display--off"
  }`;
  displayBtn.setAttribute("aria-pressed", displayOn ? "true" : "false");
  displayBtn.setAttribute(
    "aria-label",
    displayOn ? "Скрыть точки слоя" : "Показать точки слоя"
  );
  displayBtn.title = displayOn ? "Скрыть слой" : "Показать слой";
  displayBtn.innerHTML = displayOn ? EYE_ON_SVG : EYE_OFF_SVG;
  displayBtn.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    displayHandler?.(summary, !displayOn);
  });
  element.appendChild(displayBtn);

  const listBtn = document.createElement("button");
  listBtn.type = "button";
  listBtn.className = "region-load-plaque-list";
  listBtn.setAttribute("aria-label", "Список видов региона");
  listBtn.title = "Список";
  listBtn.innerHTML = `<span class="region-load-plaque-list-label">Список</span>${LIST_SVG}`;
  listBtn.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    listHandler?.(summary);
  });
  element.appendChild(listBtn);

  element.addEventListener("click", (event) => {
    if (
      event.target.closest(".region-load-plaque-display") ||
      event.target.closest(".region-load-plaque-list")
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const entry = buildExternalIdToCatalogEntry(getCachedRegionCatalog()).get(
      summary.regionId
    );
    if (!entry?.iso) {
      return;
    }
    emitRegionBoundsSelect(entry, {
      lng: summary.coordinates[0],
      lat: summary.coordinates[1]
    });
  });

  return element;
}

function createPlaqueAnchor(summary, map) {
  const anchor = document.createElement("div");
  anchor.className = "region-load-plaque-anchor";
  anchor.appendChild(createPlaqueElement(summary, map));
  return anchor;
}

function syncMarkers(map, summaries) {
  const nextIds = new Set(summaries.map((item) => item.id || item.regionId));
  const stackByRegion = new Map();

  [...markersByRegionId.keys()].forEach((markerId) => {
    if (!nextIds.has(markerId)) {
      markersByRegionId.get(markerId)?.remove();
      markersByRegionId.delete(markerId);
    }
  });

  summaries.forEach((summary) => {
    const markerId = summary.id || summary.regionId;
    const stackIndex = stackByRegion.get(summary.regionId) || 0;
    stackByRegion.set(summary.regionId, stackIndex + 1);
    const signature = `${summarySignature(summary)}|${stackIndex}`;
    const existing = markersByRegionId.get(markerId);
    if (existing?.__regionLoadSignature === signature) {
      existing.__regionBounds = summary.bounds;
      applyPlaqueScale(existing);
      return;
    }
    existing?.remove();

    const marker = new mapboxgl.Marker({
      element: createPlaqueAnchor(summary, map),
      anchor: "top-left",
      pitchAlignment: "viewport",
      rotationAlignment: "viewport"
    })
      .setLngLat(summary.coordinates)
      .addTo(map);
    marker.__regionLoadSignature = signature;
    marker.__regionBounds = summary.bounds;
    marker.__plaqueStackIndex = stackIndex;
    applyPlaqueScale(marker);
    markersByRegionId.set(markerId, marker);
  });
}

function applySummaries(map) {
  attachPlaqueMapEvents(map);
  if (!isRegionLoadSummaryActive()) {
    clearMarkers();
    return;
  }

  const catalog = getCachedRegionCatalog();
  const summaries =
    lastOptions.mode === "temp"
      ? buildTempLayerRegionSummaries({ catalog })
      : buildRegionLoadSummaries({
          catalog,
          ...lastOptions
        });
  syncMarkers(map, summaries);
  syncAllPlaqueScales();
}

export function refreshRegionLoadSummary(map) {
  if (!map) {
    return;
  }

  if (!isRegionLoadSummaryActive()) {
    clearMarkers();
    return;
  }

  if (getCachedRegionCatalog().length > 0) {
    applySummaries(map);
    return;
  }

  if (!catalogLoadPromise) {
    catalogLoadPromise = loadRegionBoundsGeoJSON().finally(() => {
      catalogLoadPromise = null;
    });
  }

  catalogLoadPromise
    .then(() => {
      applySummaries(map);
    })
    .catch((error) => {
      console.error("Не удалось разместить сводки регионов на карте", error);
    });
}
