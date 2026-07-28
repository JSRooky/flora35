import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { initMap } from "./components/initMap";
import {
  addArealLayer,
  clearArealLayer,
  dismissArealPointHintOnPointClick,
  getArealContainedPointsSummary,
  getArealPointKey,
  hideArealPointHint,
  panToArealPoint,
  refreshArealDisplay
} from "./components/addArealLayer";
import {
  addLocationsLayer,
  applyLocationsFilter,
  featureMatchesFilters,
  isFeatureUnclusteredOnMap,
  setClusterByRegnum,
  setClusteringEnabled,
  setClusterPieChartsEnabled,
  setMarkersVisible,
  setHoverTooltipsEnabled
} from "./components/addLocationsLayer";
import {
  addHeatmapLayer,
  setHeatmapEnabled
} from "./components/addHeatmapLayer";
import {
  addOsmBasemapLayer,
  setOsmBasemapEnabled
} from "./components/addOsmBasemapLayer";
import {
  addSpeciesPolygonLayer,
  clearSpeciesPolygonLayer,
  getSpeciesPolygonContainedSummary,
  updateSpeciesPolygonLayer
} from "./components/addSpeciesPolygonLayer";
import {
  addBufferLayer,
  clearBufferLayer,
  updateBufferLayer,
  DEFAULT_BUFFER_DIAMETERS_KM
} from "./components/addBufferLayer";
import {
  addAreaSelectionLayer,
  clearAreaSelectionLayer,
  getAreaContainedPointsSummary,
  isAreaDrawingActive,
  startAreaDrawing,
  stopActiveAreaDrawing,
  updateAreaSelectionLayer,
  updateAreaSelectionPreview
} from "./components/addAreaSelectionLayer";
import FeaturePopup from "./components/FeaturePopup";
import ArealPopup from "./components/ArealPopup";
import SpeciesPolygonPopup from "./components/SpeciesPolygonPopup";
import BufferPopup from "./components/BufferPopup";
import AreaSelectionPopup from "./components/AreaSelectionPopup";
import StatusFilterPanel from "./components/StatusFilterPanel";
import MapDisplayPanel from "./components/MapDisplayPanel";
import YearFilterPanel from "./components/YearFilterPanel";
import AboutProject from "./components/AboutProject";
import ModuleMenu, { MODULE_IDS } from "./components/ModuleMenu";
import { getYearBounds } from "./components/yearBounds";
import "./MapView.css";

const PANEL_IDS = {
  FEATURE: "feature",
  AREAL: "areal",
  STATUS: "status",
  MAP: "map",
  YEAR: "year",
  POLYGON: "polygon",
  BUFFER: "buffer",
  AREA: "area"
};

const DEFAULT_CLUSTERING_ENABLED = true;
const DEFAULT_CLUSTER_BY_REGNUM = true;
const DEFAULT_CLUSTER_PIE_CHARTS = false;
const DEFAULT_MARKERS_VISIBLE = true;
const YEAR_BOUNDS = getYearBounds();

export default function MapView() {
  const ref = useRef(null);
  const map = useRef(null);

  const [popupData, setPopupData] = useState(null);
  const [propertyFilters, setPropertyFilters] = useState({});
  const [statusFilters, setStatusFilters] = useState([]);
  const [clusterByRegnum, setClusterByRegnumState] = useState(DEFAULT_CLUSTER_BY_REGNUM);
  const [clusteringEnabled, setClusteringEnabledState] = useState(DEFAULT_CLUSTERING_ENABLED);
  const [clusterPieCharts, setClusterPieChartsState] = useState(DEFAULT_CLUSTER_PIE_CHARTS);
  const [markersVisible, setMarkersVisibleState] = useState(DEFAULT_MARKERS_VISIBLE);
  const [mapReady, setMapReady] = useState(false);
  const [heatmapEnabled, setHeatmapEnabledState] = useState(false);
  const [activeModule, setActiveModule] = useState(null);
  // Ареал, открытый из панели «Сведения о точке» — показывается под ней, не закрывая её.
  const [arealDockedWithFeature, setArealDockedWithFeature] = useState(false);
  // Буфер, открытый из панели «Сведения о точке» — показывается под ней, не закрывая её.
  const [bufferDockedWithFeature, setBufferDockedWithFeature] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [arealEnabled, setArealEnabled] = useState(false);
  const [arealAllMarkers, setArealAllMarkers] = useState(false);
  const [arealRadius, setArealRadius] = useState(5);
  const [yearFilterEnabled, setYearFilterEnabled] = useState(false);
  const [yearRange, setYearRange] = useState(YEAR_BOUNDS);
  // Сводка о полигоне, уже отображённом на карте (не путать с выбранной точкой).
  const [speciesPolygonInfo, setSpeciesPolygonInfo] = useState(null);
  // Буфер: диаметры зон (красная/жёлтая/зелёная), км; bufferEnabled — включён ли переключатель.
  const [bufferDiameters, setBufferDiameters] = useState(DEFAULT_BUFFER_DIAMETERS_KM);
  const [bufferEnabled, setBufferEnabled] = useState(false);
  const [bufferSelectionMode, setBufferSelectionMode] = useState(false);
  const [bufferSelectedPoints, setBufferSelectedPoints] = useState([]);
  const [areaDrawingMode, setAreaDrawingMode] = useState(false);
  const [areaPolygon, setAreaPolygon] = useState(null);
  const [hoverTooltipsDisabled, setHoverTooltipsDisabled] = useState(false);
  const [osmBasemapEnabled, setOsmBasemapEnabledState] = useState(false);
  const [panelCollapsed, setPanelCollapsed] = useState({});
  const hadFoundYearPropertyFilterRef = useRef(false);

  const isPanelCollapsed = useCallback(
    (panelId) => panelCollapsed[panelId] ?? false,
    [panelCollapsed]
  );

  const handlePanelCollapsedChange = useCallback(
    (panelId) => (collapsed) => {
      setPanelCollapsed((prev) => ({ ...prev, [panelId]: collapsed }));
    },
    []
  );

  const handleModuleSelect = useCallback((moduleId) => {
    if (moduleId === MODULE_IDS.ABOUT) {
      setAboutOpen(true);
      return;
    }

    if (moduleId === MODULE_IDS.AREAL) {
      // Из меню «Ареал» открывается отдельно — панель точки не остаётся в стеке.
      setArealDockedWithFeature(false);
      setActiveModule((current) => (current === moduleId ? null : moduleId));
      return;
    }

    if (moduleId === MODULE_IDS.BUFFER) {
      // Из меню «Буфер» открывается отдельно — панель точки не остаётся в стеке.
      setBufferDockedWithFeature(false);
      setActiveModule((current) => (current === moduleId ? null : moduleId));
      return;
    }

    if (moduleId === MODULE_IDS.AREA) {
      // Из меню «Область» открывается отдельно — панель точки не остаётся в стеке.
      setArealDockedWithFeature(false);
      setBufferDockedWithFeature(false);
      setActiveModule((current) => (current === moduleId ? null : moduleId));
      return;
    }

    setArealDockedWithFeature(false);
    setBufferDockedWithFeature(false);
    setActiveModule((current) => (current === moduleId ? null : moduleId));
  }, []);

  const handleOpenArealFromFeature = useCallback(() => {
    setActiveModule(MODULE_IDS.FEATURE);
    setArealDockedWithFeature(true);
  }, []);

  const handleOpenBufferFromFeature = useCallback(() => {
    setActiveModule(MODULE_IDS.FEATURE);
    setBufferDockedWithFeature(true);
  }, []);

  const handleYearRangeChange = useCallback((nextRange) => {
    setYearRange((prev) =>
      prev.min === nextRange.min && prev.max === nextRange.max ? prev : nextRange
    );
  }, []);

  const hasFoundYearPropertyFilter = Object.prototype.hasOwnProperty.call(
    propertyFilters,
    "found_year"
  );

  useEffect(() => {
    if (hasFoundYearPropertyFilter) {
      hadFoundYearPropertyFilterRef.current = true;
      setYearFilterEnabled(false);
      return;
    }

    if (hadFoundYearPropertyFilterRef.current) {
      hadFoundYearPropertyFilterRef.current = false;
      setYearFilterEnabled(true);
    }
  }, [hasFoundYearPropertyFilter]);

  const arealStateRef = useRef({});
  arealStateRef.current = {
    popupData,
    arealEnabled,
    arealAllMarkers,
    arealRadius,
    propertyFilters,
    statusFilters,
    yearFilterEnabled,
    yearRange
  };

  const bufferStateRef = useRef({});
  bufferStateRef.current = {
    bufferSelectionMode,
    activeModule,
    bufferDockedWithFeature
  };

  const expandedLeavesRef = useRef(null);

  const refreshAreal = useCallback(() => {
    const mapInstance = map.current;
    const {
      popupData: feature,
      arealEnabled: enabled,
      arealAllMarkers: allMarkers,
      arealRadius: radiusKm,
      propertyFilters: filters,
      statusFilters: selectedStatuses,
      yearFilterEnabled: yearEnabled,
      yearRange: selectedYearRange
    } = arealStateRef.current;

    if (!mapInstance) {
      return;
    }

    const combinedFilters = { ...filters };
    if (selectedStatuses.length > 0) {
      combinedFilters.status = selectedStatuses;
    }
    if (yearEnabled && !Object.prototype.hasOwnProperty.call(filters, "found_year")) {
      combinedFilters.found_year = selectedYearRange;
    }

    refreshArealDisplay(mapInstance, {
      allMarkers,
      enabled,
      feature,
      radiusKm,
      filters: combinedFilters,
      expandedLeaves: expandedLeavesRef.current
    });

    expandedLeavesRef.current = null;
  }, []);

  const refreshArealRef = useRef(refreshAreal);
  refreshArealRef.current = refreshAreal;

  const arealRefreshScheduledRef = useRef(false);

  const scheduleArealRefresh = useCallback(() => {
    const mapInstance = map.current;
    // zoomend/moveend/sourcedata often fire together for a single gesture;
    // avoid stacking multiple "idle" listeners that would refresh twice.
    if (!mapInstance || arealRefreshScheduledRef.current) {
      return;
    }

    arealRefreshScheduledRef.current = true;
    mapInstance.once("idle", () => {
      arealRefreshScheduledRef.current = false;
      refreshArealRef.current();
    });
  }, []);

  const buildLocationFilters = useCallback(() => {
    const filters = { ...propertyFilters };

    if (statusFilters.length > 0) {
      filters.status = statusFilters;
    }

    if (yearFilterEnabled && !Object.prototype.hasOwnProperty.call(propertyFilters, "found_year")) {
      filters.found_year = yearRange;
    }

    return filters;
  }, [propertyFilters, statusFilters, yearFilterEnabled, yearRange]);

  const areaContainedPoints = useMemo(() => {
    if (!areaPolygon || !mapReady) {
      return null;
    }

    return getAreaContainedPointsSummary(areaPolygon, buildLocationFilters());
  }, [areaPolygon, buildLocationFilters, mapReady]);

  const speciesPolygonContainedSpecies = useMemo(() => {
    if (!speciesPolygonInfo?.built || !speciesPolygonInfo.polygon || !mapReady) {
      return null;
    }

    return getSpeciesPolygonContainedSummary(
      speciesPolygonInfo.polygon,
      speciesPolygonInfo.nameLatin,
      buildLocationFilters()
    );
  }, [speciesPolygonInfo, buildLocationFilters, mapReady]);

  useEffect(() => {
    if (activeModule !== MODULE_IDS.AREA) {
      setAreaDrawingMode(false);
    }
  }, [activeModule]);

  useEffect(() => {
    if (!map.current || !mapReady) {
      return;
    }

    if (areaPolygon) {
      updateAreaSelectionLayer(map.current, areaPolygon);
    } else {
      clearAreaSelectionLayer(map.current);
    }
  }, [areaPolygon, mapReady]);

  useEffect(() => {
    const mapInstance = map.current;
    if (!mapInstance || !mapReady || activeModule !== MODULE_IDS.AREA || !areaDrawingMode) {
      stopActiveAreaDrawing();
      return;
    }

    startAreaDrawing(mapInstance, {
      onPreview: (coordinates) => {
        updateAreaSelectionPreview(mapInstance, coordinates);
      },
      onComplete: (ringCoordinates) => {
        setAreaPolygon(ringCoordinates);
        setAreaDrawingMode(false);
      }
    });

    return () => {
      stopActiveAreaDrawing();
    };
  }, [areaDrawingMode, activeModule, mapReady]);

  const handleAreaDrawingModeChange = useCallback(() => {
    setAreaDrawingMode((prev) => !prev);
  }, []);

  const handleAreaReset = useCallback(() => {
    setAreaDrawingMode(false);
    setAreaPolygon(null);
    if (map.current) {
      clearAreaSelectionLayer(map.current);
    }
  }, []);

  const handleAreaPointSelect = useCallback((feature) => {
    const mapInstance = map.current;

    if (!mapInstance) {
      return;
    }

    panToArealPoint(mapInstance, feature);
  }, []);

  const arealContainedPoints = useMemo(() => {
    const mapInstance = map.current;

    if (!arealEnabled || arealAllMarkers || !popupData || !mapReady || !mapInstance) {
      return null;
    }

    const filters = buildLocationFilters();

    if (
      !featureMatchesFilters(popupData, filters) ||
      !isFeatureUnclusteredOnMap(mapInstance, popupData)
    ) {
      return null;
    }

    return getArealContainedPointsSummary(popupData, arealRadius, filters);
  }, [
    arealEnabled,
    arealAllMarkers,
    popupData,
    arealRadius,
    buildLocationFilters,
    mapReady
  ]);

  useEffect(() => {
    if (!arealEnabled && !arealAllMarkers) {
      hideArealPointHint();
    }
  }, [arealEnabled, arealAllMarkers]);

  useEffect(() => {
    if (!map.current) {
      return;
    }

    applyLocationsFilter(map.current, buildLocationFilters());
  }, [buildLocationFilters]);

  useEffect(() => {
    setHoverTooltipsEnabled(!hoverTooltipsDisabled);
  }, [hoverTooltipsDisabled]);

  useEffect(() => {
    if (!map.current || !mapReady) {
      return;
    }

    setOsmBasemapEnabled(map.current, osmBasemapEnabled);
  }, [osmBasemapEnabled, mapReady]);

  useEffect(() => {
    if (!map.current || !mapReady) {
      return;
    }

    setMarkersVisible(map.current, markersVisible);
  }, [markersVisible, mapReady]);

  useEffect(() => {
    if (!map.current || !mapReady) {
      return;
    }

    setClusteringEnabled(map.current, clusteringEnabled);
  }, [clusteringEnabled, mapReady]);

  useEffect(() => {
    if (!map.current || !mapReady || !clusteringEnabled) {
      return;
    }

    setClusterByRegnum(map.current, clusterByRegnum);
  }, [clusterByRegnum, clusteringEnabled, mapReady]);

  useEffect(() => {
    if (!map.current || !mapReady || !clusteringEnabled) {
      return;
    }

    setClusterPieChartsEnabled(map.current, clusterPieCharts);
  }, [clusterPieCharts, clusteringEnabled, mapReady]);

  useEffect(() => {
    if (!map.current) {
      return;
    }

    setHeatmapEnabled(map.current, heatmapEnabled, buildLocationFilters());
  }, [heatmapEnabled, buildLocationFilters]);

  useEffect(() => {
    refreshAreal();
  }, [popupData, arealEnabled, arealAllMarkers, arealRadius, propertyFilters, statusFilters, yearFilterEnabled, yearRange, refreshAreal]);

  useEffect(() => {
    const mapInstance = map.current;
    if (!mapInstance) {
      return;
    }

    // Ареал для одной точки требует выбранную точку; режим "ко всем маркерам"
    // работает и без неё.
    if (!arealAllMarkers && (!arealEnabled || !popupData)) {
      return;
    }

    const handleMapChange = () => scheduleArealRefresh();
    const handleSourceData = (event) => {
      if (
        event.isSourceLoaded &&
        typeof event.sourceId === "string" &&
        (event.sourceId === "locations" || event.sourceId.startsWith("locations-"))
      ) {
        scheduleArealRefresh();
      }
    };

    mapInstance.on("zoomend", handleMapChange);
    mapInstance.on("moveend", handleMapChange);
    mapInstance.on("sourcedata", handleSourceData);

    return () => {
      mapInstance.off("zoomend", handleMapChange);
      mapInstance.off("moveend", handleMapChange);
      mapInstance.off("sourcedata", handleSourceData);
    };
  }, [popupData, arealEnabled, arealAllMarkers, scheduleArealRefresh]);

  const handlePropertyFilterChange = (key, value, enabled) => {
    setPropertyFilters((prev) => {
      const next = { ...prev };
      if (enabled) {
        next[key] = value;
      } else {
        delete next[key];
      }
      return next;
    });
  };

  const handleStatusFilterChange = (status, enabled) => {
    setStatusFilters((prev) => {
      if (enabled) {
        return prev.includes(status) ? prev : [...prev, status];
      }

      return prev.filter((value) => value !== status);
    });
  };

  const handleClusteringEnabledChange = (enabled) => {
    if (!enabled) {
      setClusterPieChartsState(false);
    }

    setClusteringEnabledState(enabled);
  };

  const handleClusterByRegnumChange = (enabled) => {
    if (enabled) {
      setClusterPieChartsState(false);
    }

    setClusterByRegnumState(enabled);
  };

  const handleClusterPieChartsChange = (enabled) => {
    if (enabled) {
      setClusterByRegnumState(false);
    }

    setClusterPieChartsState(enabled);
  };

  const handleFeatureFiltersReset = useCallback(() => {
    setPropertyFilters({});

    const status = popupData?.properties?.status;
    if (status) {
      setStatusFilters((prev) => prev.filter((value) => value !== status));
    }
  }, [popupData]);

  const handleSpeciesPolygonReset = useCallback(() => {
    if (map.current) {
      clearSpeciesPolygonLayer(map.current);
    }

    setSpeciesPolygonInfo(null);
  }, []);

  /**
   * Строит полигон по виду текущей выбранной точки.
   * Смена точки сама по себе полигон не меняет — только явный вызов этой функции.
   */
  const handleSpeciesPolygonBuild = useCallback(() => {
    if (!map.current || !popupData) {
      return;
    }

    const info = updateSpeciesPolygonLayer(map.current, popupData);
    setSpeciesPolygonInfo(info);
  }, [popupData]);

  /**
   * Меняет диаметр одной зоны буфера, поддерживая порядок «каждая следующая зона не меньше
   * предыдущей» — иначе кольца буфера накладывались бы некорректно.
   */
  const handleBufferDiameterChange = useCallback((index, value) => {
    setBufferDiameters((prev) => {
      const next = [...prev];
      next[index] = value;

      for (let i = index + 1; i < next.length; i++) {
        if (next[i] < next[i - 1]) {
          next[i] = next[i - 1];
        }
      }

      for (let i = index - 1; i >= 0; i--) {
        if (next[i] > next[i + 1]) {
          next[i] = next[i + 1];
        }
      }

      return next;
    });
  }, []);

  const handleBufferReset = useCallback(() => {
    setBufferEnabled(false);
    setBufferDiameters(DEFAULT_BUFFER_DIAMETERS_KM);
    setBufferSelectedPoints([]);
    setBufferSelectionMode(false);
  }, []);

  const handleBufferEnabledChange = useCallback((enabled) => {
    setBufferEnabled(enabled);
  }, []);

  const handleBufferSelectionModeChange = useCallback(() => {
    setBufferSelectionMode((prev) => {
      const next = !prev;

      if (next) {
        setBufferSelectedPoints((points) => {
          if (!popupData) {
            return points;
          }

          const key = getArealPointKey(popupData);
          if (points.some((point) => getArealPointKey(point) === key)) {
            return points;
          }

          return [...points, popupData];
        });
      }

      return next;
    });
  }, [popupData]);

  const handleArealPointSelect = useCallback((feature) => {
    const mapInstance = map.current;

    if (!mapInstance) {
      return;
    }

    panToArealPoint(mapInstance, feature);
  }, []);

  const handleSpeciesPolygonSpeciesSelect = useCallback((feature) => {
    const mapInstance = map.current;

    if (!mapInstance) {
      return;
    }

    panToArealPoint(mapInstance, feature);
  }, []);

  const clearPointSelection = useCallback(() => {
    if (map.current) {
      hideArealPointHint();
      clearArealLayer(map.current);
      clearSpeciesPolygonLayer(map.current);
      clearBufferLayer(map.current);
    }

    setPopupData(null);
    setPropertyFilters({});
    setArealEnabled(false);
    setArealAllMarkers(false);
    setSpeciesPolygonInfo(null);
    setBufferDiameters(DEFAULT_BUFFER_DIAMETERS_KM);
    setBufferEnabled(false);
    setBufferSelectedPoints([]);
    setBufferSelectionMode(false);
    setActiveModule(null);
    setArealDockedWithFeature(false);
    setBufferDockedWithFeature(false);
  }, []);

  // Буфер строится только при включённом переключателе «Построить буфер».
  useEffect(() => {
    const mapInstance = map.current;
    if (!mapInstance || !mapReady) {
      return;
    }

    const bufferFeatures =
      bufferSelectedPoints.length > 0
        ? bufferSelectedPoints
        : popupData
          ? [popupData]
          : [];

    if (bufferEnabled && bufferFeatures.length > 0) {
      updateBufferLayer(mapInstance, bufferFeatures, bufferDiameters);
    } else {
      clearBufferLayer(mapInstance);
    }
  }, [bufferEnabled, popupData, bufferSelectedPoints, bufferDiameters, mapReady]);

  useEffect(() => {
    if (!map.current && ref.current) {
      map.current = initMap(ref.current);

      map.current.on("load", () => {
        addOsmBasemapLayer(map.current);
        addLocationsLayer(map.current, {
          onClusterExpanded: (leaves) => {
            const { arealEnabled: enabled, arealAllMarkers: allMarkers } =
              arealStateRef.current;
            if (!enabled && !allMarkers) {
              return;
            }
            expandedLeavesRef.current = leaves;
            refreshArealRef.current();
          },
          onPointClick: (feature) => {
            if (isAreaDrawingActive()) {
              return;
            }

            dismissArealPointHintOnPointClick(feature);
            setPopupData(feature);
            // Если какая-то панель уже открыта, оставляем её открытой — просто обновляем
            // данные точки. «Сведения о точке» открываются только если панелей ещё нет.
            setActiveModule((current) => current ?? MODULE_IDS.FEATURE);

            const {
              bufferSelectionMode: selectionMode,
              activeModule: currentModule,
              bufferDockedWithFeature: bufferDocked
            } = bufferStateRef.current;
            const bufferPanelOpen =
              currentModule === MODULE_IDS.BUFFER ||
              (currentModule === MODULE_IDS.FEATURE && bufferDocked);

            if (bufferPanelOpen) {
              if (selectionMode) {
                setBufferSelectedPoints((points) => {
                  const key = getArealPointKey(feature);
                  const existingIndex = points.findIndex(
                    (point) => getArealPointKey(point) === key
                  );

                  if (existingIndex >= 0) {
                    return points.filter((_, index) => index !== existingIndex);
                  }

                  return [...points, feature];
                });
              } else {
                setBufferSelectedPoints([]);
              }
            }
          },
          onMapBackgroundClick: () => {
            if (isAreaDrawingActive()) {
              return;
            }

            clearPointSelection();
          },
          clusteringEnabled: DEFAULT_CLUSTERING_ENABLED,
          clusterByRegnum: DEFAULT_CLUSTER_BY_REGNUM,
          clusterPieChartsEnabled: DEFAULT_CLUSTER_PIE_CHARTS,
          markersVisible: DEFAULT_MARKERS_VISIBLE
        });
        addArealLayer(map.current);
        addSpeciesPolygonLayer(map.current); // слой экспериментального модуля «Полигон»
        addBufferLayer(map.current);
        addAreaSelectionLayer(map.current);
        addHeatmapLayer(map.current);
        setMapReady(true);
      });
    }

    return () => {
      setMapReady(false);
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, [clearPointSelection]);

  return (
    <>
      <ModuleMenu
        activeModule={activeModule}
        onModuleSelect={handleModuleSelect}
        pointSelected={Boolean(popupData)}
        hoverTooltipsDisabled={hoverTooltipsDisabled}
        onHoverTooltipsDisabledChange={setHoverTooltipsDisabled}
        osmBasemapEnabled={osmBasemapEnabled}
        onOsmBasemapEnabledChange={setOsmBasemapEnabledState}
      />
      <div ref={ref} className="map-container" />
      {activeModule !== null && (
        <div className="module-panel-stack">
          {activeModule === MODULE_IDS.FEATURE && (
            <FeaturePopup
              feature={popupData}
              collapsed={isPanelCollapsed(PANEL_IDS.FEATURE)}
              onCollapsedChange={handlePanelCollapsedChange(PANEL_IDS.FEATURE)}
              activeFilters={propertyFilters}
              onFilterChange={handlePropertyFilterChange}
              activeStatusFilters={statusFilters}
              onStatusFilterChange={handleStatusFilterChange}
              onFiltersReset={handleFeatureFiltersReset}
              onOpenAreal={handleOpenArealFromFeature}
              arealDockedOpen={arealDockedWithFeature}
              onOpenBuffer={handleOpenBufferFromFeature}
              bufferDockedOpen={bufferDockedWithFeature}
            />
          )}
          {(activeModule === MODULE_IDS.AREAL ||
            (activeModule === MODULE_IDS.FEATURE && arealDockedWithFeature)) && (
            <ArealPopup
              enabled={arealEnabled}
              allMarkers={arealAllMarkers}
              radius={arealRadius}
              containedPoints={arealContainedPoints}
              onPointSelect={handleArealPointSelect}
              onEnabledChange={setArealEnabled}
              onAllMarkersChange={setArealAllMarkers}
              onRadiusChange={setArealRadius}
              collapsed={isPanelCollapsed(PANEL_IDS.AREAL)}
              onCollapsedChange={handlePanelCollapsedChange(PANEL_IDS.AREAL)}
            />
          )}
          {activeModule === MODULE_IDS.STATUS && (
            <StatusFilterPanel
              activeStatusFilters={statusFilters}
              onStatusFilterChange={handleStatusFilterChange}
              collapsed={isPanelCollapsed(PANEL_IDS.STATUS)}
              onCollapsedChange={handlePanelCollapsedChange(PANEL_IDS.STATUS)}
            />
          )}
          {activeModule === MODULE_IDS.MAP && (
            <MapDisplayPanel
              markersVisible={markersVisible}
              onMarkersVisibleChange={setMarkersVisibleState}
              heatmapEnabled={heatmapEnabled}
              onHeatmapEnabledChange={setHeatmapEnabledState}
              clusteringEnabled={clusteringEnabled}
              onClusteringEnabledChange={handleClusteringEnabledChange}
              clusterByRegnum={clusterByRegnum}
              onClusterByRegnumChange={handleClusterByRegnumChange}
              clusterPieCharts={clusterPieCharts}
              onClusterPieChartsChange={handleClusterPieChartsChange}
              collapsed={isPanelCollapsed(PANEL_IDS.MAP)}
              onCollapsedChange={handlePanelCollapsedChange(PANEL_IDS.MAP)}
            />
          )}
          {activeModule === MODULE_IDS.YEAR && (
            <YearFilterPanel
              enabled={yearFilterEnabled}
              onEnabledChange={setYearFilterEnabled}
              range={yearRange}
              onRangeChange={handleYearRangeChange}
              lockedByPropertyFilter={hasFoundYearPropertyFilter}
              collapsed={isPanelCollapsed(PANEL_IDS.YEAR)}
              onCollapsedChange={handlePanelCollapsedChange(PANEL_IDS.YEAR)}
            />
          )}
          {activeModule === MODULE_IDS.POLYGON && (
            <SpeciesPolygonPopup
              feature={popupData}
              polygonInfo={speciesPolygonInfo}
              containedSpecies={speciesPolygonContainedSpecies}
              onBuild={handleSpeciesPolygonBuild}
              onReset={handleSpeciesPolygonReset}
              onSpeciesSelect={handleSpeciesPolygonSpeciesSelect}
              collapsed={isPanelCollapsed(PANEL_IDS.POLYGON)}
              onCollapsedChange={handlePanelCollapsedChange(PANEL_IDS.POLYGON)}
            />
          )}
          {activeModule === MODULE_IDS.BUFFER ||
          (activeModule === MODULE_IDS.FEATURE && bufferDockedWithFeature) ? (
            <BufferPopup
              feature={popupData}
              enabled={bufferEnabled}
              diametersKm={bufferDiameters}
              selectionMode={bufferSelectionMode}
              selectedCount={bufferSelectedPoints.length}
              onEnabledChange={handleBufferEnabledChange}
              onSelectionModeChange={handleBufferSelectionModeChange}
              onDiameterChange={handleBufferDiameterChange}
              onReset={handleBufferReset}
              collapsed={isPanelCollapsed(PANEL_IDS.BUFFER)}
              onCollapsedChange={handlePanelCollapsedChange(PANEL_IDS.BUFFER)}
            />
          ) : null}
          {activeModule === MODULE_IDS.AREA && (
            <AreaSelectionPopup
              drawingMode={areaDrawingMode}
              hasArea={Boolean(areaPolygon)}
              containedPoints={areaContainedPoints}
              onDrawingModeChange={handleAreaDrawingModeChange}
              onPointSelect={handleAreaPointSelect}
              onReset={handleAreaReset}
              collapsed={isPanelCollapsed(PANEL_IDS.AREA)}
              onCollapsedChange={handlePanelCollapsedChange(PANEL_IDS.AREA)}
            />
          )}
        </div>
      )}
      <AboutProject open={aboutOpen} onOpenChange={setAboutOpen} />
    </>
  );
}
