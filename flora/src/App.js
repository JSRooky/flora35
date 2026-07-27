import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { initMap } from "./components/initMap";
import {
  addArealLayer,
  clearArealLayer,
  dismissArealPointHintOnPointClick,
  getArealContainedPointsSummary,
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
  setMarkersVisible
} from "./components/addLocationsLayer";
import {
  addHeatmapLayer,
  setHeatmapEnabled
} from "./components/addHeatmapLayer";
import {
  addSpeciesPolygonLayer,
  clearSpeciesPolygonLayer,
  updateSpeciesPolygonLayer
} from "./components/addSpeciesPolygonLayer";
import FeaturePopup from "./components/FeaturePopup";
import ArealPopup from "./components/ArealPopup";
import SpeciesPolygonPopup from "./components/SpeciesPolygonPopup";
import StatusFilterPanel from "./components/StatusFilterPanel";
import MapDisplayPanel from "./components/MapDisplayPanel";
import YearFilterPanel from "./components/YearFilterPanel";
import AboutProject from "./components/AboutProject";
import ModuleMenu, { MODULE_IDS } from "./components/ModuleMenu";
import { getYearBounds } from "./components/yearBounds";
import "./MapView.css";

const DEFAULT_CLUSTERING_ENABLED = true;
const DEFAULT_CLUSTER_BY_REGNUM = true;
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
  const [markersVisible, setMarkersVisibleState] = useState(DEFAULT_MARKERS_VISIBLE);
  const [mapReady, setMapReady] = useState(false);
  const [heatmapEnabled, setHeatmapEnabledState] = useState(false);
  const [activeModule, setActiveModule] = useState(null);
  // Ареал, открытый из панели «Сведения о точке» — показывается под ней, не закрывая её.
  const [arealDockedWithFeature, setArealDockedWithFeature] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [arealEnabled, setArealEnabled] = useState(false);
  const [arealAllMarkers, setArealAllMarkers] = useState(false);
  const [arealRadius, setArealRadius] = useState(5);
  const [yearFilterEnabled, setYearFilterEnabled] = useState(false);
  const [yearRange, setYearRange] = useState(YEAR_BOUNDS);
  // Сводка о полигоне, уже отображённом на карте (не путать с выбранной точкой).
  const [speciesPolygonInfo, setSpeciesPolygonInfo] = useState(null);
  const hadFoundYearPropertyFilterRef = useRef(false);

  const handlePanelClose = useCallback(() => {
    setActiveModule(null);
    setArealDockedWithFeature(false);
  }, []);

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

    setArealDockedWithFeature(false);
    setActiveModule((current) => (current === moduleId ? null : moduleId));
  }, []);

  const handleOpenArealFromFeature = useCallback(() => {
    setActiveModule(MODULE_IDS.FEATURE);
    setArealDockedWithFeature(true);
  }, []);

  const handleArealDockedClose = useCallback(() => {
    setArealDockedWithFeature(false);
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

  const handleArealPointSelect = useCallback((feature) => {
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
    }

    setPopupData(null);
    setPropertyFilters({});
    setArealEnabled(false);
    setArealAllMarkers(false);
    setSpeciesPolygonInfo(null);
    setActiveModule(null);
    setArealDockedWithFeature(false);
  }, []);

  useEffect(() => {
    if (!map.current && ref.current) {
      map.current = initMap(ref.current);

      map.current.on("load", () => {
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
            dismissArealPointHintOnPointClick(feature);
            setPopupData(feature);
            setArealDockedWithFeature(false);
            setActiveModule(MODULE_IDS.FEATURE);
          },
          onMapBackgroundClick: () => {
            clearPointSelection();
          },
          clusteringEnabled: DEFAULT_CLUSTERING_ENABLED,
          clusterByRegnum: DEFAULT_CLUSTER_BY_REGNUM,
          markersVisible: DEFAULT_MARKERS_VISIBLE
        });
        addArealLayer(map.current);
        addSpeciesPolygonLayer(map.current); // слой экспериментального модуля «Полигон»
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
      />
      <div ref={ref} className="map-container" />
      {activeModule !== null && (
        <div className="module-panel-stack">
          {activeModule === MODULE_IDS.FEATURE && (
            <FeaturePopup
              feature={popupData}
              collapsed={false}
              onCollapsedChange={(collapsed) => collapsed && handlePanelClose()}
              activeFilters={propertyFilters}
              onFilterChange={handlePropertyFilterChange}
              activeStatusFilters={statusFilters}
              onStatusFilterChange={handleStatusFilterChange}
              onFiltersReset={handleFeatureFiltersReset}
              onOpenAreal={handleOpenArealFromFeature}
              arealDockedOpen={arealDockedWithFeature}
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
              collapsed={false}
              onCollapsedChange={(collapsed) => {
                if (!collapsed) {
                  return;
                }

                if (arealDockedWithFeature) {
                  handleArealDockedClose();
                  return;
                }

                handlePanelClose();
              }}
            />
          )}
          {activeModule === MODULE_IDS.STATUS && (
            <StatusFilterPanel
              activeStatusFilters={statusFilters}
              onStatusFilterChange={handleStatusFilterChange}
              collapsed={false}
              onCollapsedChange={(collapsed) => collapsed && handlePanelClose()}
            />
          )}
          {activeModule === MODULE_IDS.MAP && (
            <MapDisplayPanel
              markersVisible={markersVisible}
              onMarkersVisibleChange={setMarkersVisibleState}
              heatmapEnabled={heatmapEnabled}
              onHeatmapEnabledChange={setHeatmapEnabledState}
              clusteringEnabled={clusteringEnabled}
              onClusteringEnabledChange={setClusteringEnabledState}
              clusterByRegnum={clusterByRegnum}
              onClusterByRegnumChange={setClusterByRegnumState}
              collapsed={false}
              onCollapsedChange={(collapsed) => collapsed && handlePanelClose()}
            />
          )}
          {activeModule === MODULE_IDS.YEAR && (
            <YearFilterPanel
              enabled={yearFilterEnabled}
              onEnabledChange={setYearFilterEnabled}
              range={yearRange}
              onRangeChange={handleYearRangeChange}
              lockedByPropertyFilter={hasFoundYearPropertyFilter}
              collapsed={false}
              onCollapsedChange={(collapsed) => collapsed && handlePanelClose()}
            />
          )}
          {activeModule === MODULE_IDS.POLYGON && (
            <SpeciesPolygonPopup
              feature={popupData}
              polygonInfo={speciesPolygonInfo}
              onBuild={handleSpeciesPolygonBuild}
              onReset={handleSpeciesPolygonReset}
              collapsed={false}
              onCollapsedChange={(collapsed) => collapsed && handlePanelClose()}
            />
          )}
        </div>
      )}
      <AboutProject open={aboutOpen} onOpenChange={setAboutOpen} />
    </>
  );
}
