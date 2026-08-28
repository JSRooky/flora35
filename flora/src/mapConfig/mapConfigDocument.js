import { downloadJsonFile } from "../redbook/redBookStore";
import { normalizeHeatmapSettings } from "../components/heatmapSettings";
import { sanitizeCompactGridSettings } from "../map/compactGridSettings";
import { normalizeRegionBoundsSettings } from "../components/regionBoundsSettings";
import { DATA_SOURCE_MODES } from "../locations/loadPoints";
import { createDefaultExternalProcessingFilters } from "../externalSources/externalProcessingFilters";
import { createDefaultToolPointsFilterState } from "../toolPointsFilterStorage";

export const MAP_CONFIG_KIND = "flora35-map-config";
export const MAP_CONFIG_VERSION = 2;
export const MAP_CONFIG_FILENAME = "flora35-user-settings.json";

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function readMapView(map) {
  if (!map?.getCenter || !map.getZoom) {
    return null;
  }
  const center = map.getCenter();
  return {
    lng: center.lng,
    lat: center.lat,
    zoom: map.getZoom(),
    bearing: typeof map.getBearing === "function" ? map.getBearing() : 0,
    pitch: typeof map.getPitch === "function" ? map.getPitch() : 0
  };
}

export function applyMapView(map, view) {
  if (!map?.jumpTo || !view || !Number.isFinite(Number(view.lng)) || !Number.isFinite(Number(view.lat))) {
    return;
  }
  map.jumpTo({
    center: [Number(view.lng), Number(view.lat)],
    zoom: Number.isFinite(Number(view.zoom)) ? Number(view.zoom) : map.getZoom?.() ?? 5,
    bearing: Number.isFinite(Number(view.bearing)) ? Number(view.bearing) : 0,
    pitch: Number.isFinite(Number(view.pitch)) ? Number(view.pitch) : 0
  });
}

export function buildMapConfigDocument(snapshot = {}) {
  return {
    kind: MAP_CONFIG_KIND,
    version: MAP_CONFIG_VERSION,
    savedAt: new Date().toISOString(),
    mapView: snapshot.mapView ?? null,
    layers: cloneJson(snapshot.layers ?? {}),
    filters: cloneJson(snapshot.filters ?? {}),
    colors: cloneJson(snapshot.colors ?? {}),
    tempLayers: (Array.isArray(snapshot.tempLayers) ? snapshot.tempLayers : [])
      .map(summarizeConfigLayer)
      .filter(Boolean),
    tempArchive: (Array.isArray(snapshot.tempArchive) ? snapshot.tempArchive : [])
      .map(summarizeConfigArchive)
      .filter(Boolean)
  };
}

function summarizeConfigLayer(raw) {
  if (!isPlainObject(raw)) {
    return null;
  }
  return {
    id: raw.id ?? null,
    kind: raw.kind ?? "points",
    label: raw.label ?? "",
    source: raw.source ?? null,
    groupKey: raw.groupKey ?? null,
    taxonName: raw.taxonName ?? null,
    visible: Boolean(raw.visible),
    heatmapEnabled: Boolean(raw.heatmapEnabled),
    markerColor: raw.markerColor ?? null,
    regionStyle: isPlainObject(raw.regionStyle) ? raw.regionStyle : null,
    regionFeatureColors: isPlainObject(raw.regionFeatureColors) ? raw.regionFeatureColors : null,
    createdAt: raw.createdAt ?? null,
    updatedAt: raw.updatedAt ?? raw.createdAt ?? null,
    archiveId: raw.archiveId ?? null,
    pointCount: Array.isArray(raw.features) ? raw.features.length : Number(raw.pointCount) || 0,
    filterSnapshot: Array.isArray(raw.filterSnapshot) ? raw.filterSnapshot : []
  };
}

function summarizeConfigArchive(raw) {
  if (!isPlainObject(raw) || !raw.archiveId) {
    return null;
  }
  return {
    archiveId: raw.archiveId,
    groupKey: raw.groupKey ?? null,
    title: raw.title || "Временный слой",
    markerColor: raw.markerColor ?? null,
    createdAt: raw.createdAt ?? null,
    archivedAt: raw.archivedAt ?? null,
    updatedAt: raw.updatedAt ?? raw.archivedAt ?? null,
    pointCount: Number(raw.pointCount) || 0,
    layers: (Array.isArray(raw.layers) ? raw.layers : []).map(summarizeConfigLayer).filter(Boolean)
  };
}

function normalizeDataSourceMode(value) {
  const modes = Object.values(DATA_SOURCE_MODES);
  return modes.includes(value) ? value : DATA_SOURCE_MODES.NONE;
}

export function parseMapConfigDocument(data) {
  const parsed = typeof data === "string" ? JSON.parse(data) : data;
  if (!isPlainObject(parsed)) {
    throw new Error("Некорректный файл конфигурации");
  }
  if (parsed.kind && parsed.kind !== MAP_CONFIG_KIND) {
    throw new Error("Это не файл конфигурации карты Flora35");
  }

  const layers = isPlainObject(parsed.layers) ? parsed.layers : {};
  const filters = isPlainObject(parsed.filters) ? parsed.filters : {};
  const colors = isPlainObject(parsed.colors) ? parsed.colors : {};
  const heatmap = colors.heatmap
    ? normalizeHeatmapSettings(colors.heatmap, { fromFile: true })
    : null;
  const compactGrid = colors.compactGrid
    ? sanitizeCompactGridSettings(colors.compactGrid)
    : null;
  const regionBounds = colors.regionBounds
    ? normalizeRegionBoundsSettings(colors.regionBounds)
    : null;

  return {
    kind: MAP_CONFIG_KIND,
    version: Number(parsed.version) || MAP_CONFIG_VERSION,
    savedAt: parsed.savedAt || null,
    mapView: isPlainObject(parsed.mapView) ? parsed.mapView : null,
    layers: {
      dataSourceMode: normalizeDataSourceMode(layers.dataSourceMode),
      markersVisible: layers.markersVisible !== false,
      heatmapEnabled: Boolean(layers.heatmapEnabled),
      clusteringEnabled: layers.clusteringEnabled !== false,
      clusterByRegnum: layers.clusterByRegnum !== false,
      clusterByTempLayers: layers.clusterByTempLayers !== false,
      clusterByTempSublayers: layers.clusterByTempSublayers !== false,
      clusterPieCharts: Boolean(layers.clusterPieCharts),
      denseClustersHighlight: Boolean(layers.denseClustersHighlight),
      densePileMinSize: Number(layers.densePileMinSize) || undefined,
      compactPointDisplay: Boolean(layers.compactPointDisplay),
      mergedPointsVisible: Boolean(layers.mergedPointsVisible),
      redBookPointsVisible: Boolean(layers.redBookPointsVisible),
      regionBoundsEnabled: Boolean(layers.regionBoundsEnabled),
      externalLayersEnabled: {
        gbif: layers.externalLayersEnabled?.gbif !== false,
        inaturalist: layers.externalLayersEnabled?.inaturalist !== false
      },
      boundsFeatureVisibility: isPlainObject(layers.boundsFeatureVisibility)
        ? layers.boundsFeatureVisibility
        : {},
      basemapMode: layers.basemapMode ?? null
    },
    filters: {
      propertyFilters: isPlainObject(filters.propertyFilters) ? filters.propertyFilters : {},
      statusFilters: Array.isArray(filters.statusFilters) ? filters.statusFilters : [],
      regnumFilters: Array.isArray(filters.regnumFilters) ? filters.regnumFilters : [],
      yearFilterEnabled: Boolean(filters.yearFilterEnabled),
      hideMissingFoundYear: Boolean(filters.hideMissingFoundYear),
      yearRange: isPlainObject(filters.yearRange) ? filters.yearRange : null,
      speciesSearchQuery: String(filters.speciesSearchQuery ?? ""),
      speciesSearchSelectedLatin: filters.speciesSearchSelectedLatin ?? null,
      externalProcessing: {
        ...createDefaultExternalProcessingFilters(),
        ...(isPlainObject(filters.externalProcessing) ? filters.externalProcessing : {})
      },
      regionSpeciesAllowlist: Array.isArray(filters.regionSpeciesAllowlist)
        ? filters.regionSpeciesAllowlist
        : null,
      regionSpeciesRegnumFilter: Array.isArray(filters.regionSpeciesRegnumFilter)
        ? filters.regionSpeciesRegnumFilter
        : null,
      selectedRegionIsos: Array.isArray(filters.selectedRegionIsos)
        ? filters.selectedRegionIsos
        : [],
      hiddenRegionIsos: Array.isArray(filters.hiddenRegionIsos) ? filters.hiddenRegionIsos : [],
      regionBufferKm: Number(filters.regionBufferKm) || 0,
      toolPointsFilter: {
        ...createDefaultToolPointsFilterState(),
        ...(isPlainObject(filters.toolPointsFilter) ? filters.toolPointsFilter : {})
      }
    },
    colors: {
      heatmap,
      compactGrid,
      regionBounds,
      regionFeatureColors: isPlainObject(colors.regionFeatureColors)
        ? colors.regionFeatureColors
        : null
    },
    tempLayers: (Array.isArray(parsed.tempLayers) ? parsed.tempLayers : [])
      .map(summarizeConfigLayer)
      .filter(Boolean),
    tempArchive: (Array.isArray(parsed.tempArchive) ? parsed.tempArchive : [])
      .map(summarizeConfigArchive)
      .filter(Boolean)
  };
}

export function downloadMapConfigFile(document) {
  downloadJsonFile(MAP_CONFIG_FILENAME, document);
}

export async function readMapConfigFile(file) {
  const text = await file.text();
  return parseMapConfigDocument(text);
}
