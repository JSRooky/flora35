import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  clearSelectedPointHighlight,
  clearSharedPointPin,
  featureMatchesFilters,
  isFeatureUnclusteredOnMap,
  reloadLocationsData,
  setClusterByRegnum,
  setClusteringEnabled,
  setClusterPieChartsEnabled,
  setMarkersVisible,
  setHoverTooltipsEnabled,
  setMapCursorOverride,
  showSharedPointPin,
  showSharedPointPopup,
  updateSelectedPointHighlight
} from "./components/addLocationsLayer";
import {
  addHeatmapLayer,
  setHeatmapEnabled,
  updateHeatmapData
} from "./components/addHeatmapLayer";
import {
  setDataSourceFilter,
  DATA_SOURCE_MODES,
  findFeatureByFindingId,
  isFindingInDataSource,
  initLocationsFromFirestore
} from "./locations/loadPoints";
import {
  addOsmBasemapLayer,
  setOsmBasemapEnabled
} from "./components/addOsmBasemapLayer";
import {
  addSpeciesPolygonLayer,
  clearSpeciesPolygonLayer,
  clearSpeciesPolygonIntersectionLayer,
  computeSpeciesPolygonIntersection,
  getPolygonIntersectionContainedSummary,
  getSpeciesPolygonContainedSummary,
  syncSpeciesPolygonLayer,
  toggleSpeciesPolygonBuildMode,
  updateSpeciesPolygonIntersectionLayer,
  upsertSpeciesPolygon,
  getPointsForSpecies,
  POLYGON_BUILD_MODES
} from "./components/addSpeciesPolygonLayer";
import {
  addArealDynamicsLayer,
  clearArealDynamicsLayer,
  syncArealDynamicsLayer
} from "./components/addArealDynamicsLayer";
import {
  buildArealDynamicsSlices,
  clearArealDynamicsSliceCache,
  filterSlicesUpToYear
} from "./components/buildArealDynamicsSlices";
import {
  addBufferLayer,
  clearBufferLayer,
  updateBufferLayer,
  DEFAULT_BUFFER_RADII_KM
} from "./components/addBufferLayer";
import {
  addAreaSelectionLayer,
  applyAreaGeometryOperation,
  AREA_DRAW_MODES,
  AREA_OPERATION_MODES,
  clearAreaSelectionLayer,
  getAreaContainedPointsSummary,
  isAreaDrawingActive,
  startAreaDrawing,
  stopActiveAreaDrawing,
  updateAreaSelectionLayer,
  updateAreaSelectionPreview
} from "./components/addAreaSelectionLayer";
import FeaturePopup from "./components/FeaturePopup";
import {
  focusMapOnSharedPoint,
  parseSharePointParams
} from "./components/sharePointLink";
import ArealPopup, { DEFAULT_AREAL_RADIUS_KM } from "./components/ArealPopup";
import SpeciesPolygonPopup from "./components/SpeciesPolygonPopup";
import BufferPopup from "./components/BufferPopup";
import AreaSelectionPopup from "./components/AreaSelectionPopup";
import StatusFilterPanel from "./components/StatusFilterPanel";
import MapDisplayPanel from "./components/MapDisplayPanel";
import YearFilterPanel from "./components/YearFilterPanel";
import TimelineSlider from "./components/TimelineSlider";
import ArealDynamicsPanel from "./components/ArealDynamicsPanel";
import AboutProject from "./components/AboutProject";
import FeedbackWidget from "./components/FeedbackWidget";
import ModuleMenu, { MODULE_IDS } from "./components/ModuleMenu";
import { getYearBounds } from "./components/yearBounds";
import { GET_LOCATION_CURSOR } from "./mapCursors";
import "./styles/mapToolsTheme.css";
import "./MapView.css";

const UserSubmissionPanel = lazy(() => import("./components/UserSubmissionPanel"));

const PANEL_IDS = {
  FEATURE: "feature",
  AREAL: "areal",
  STATUS: "status",
  MAP: "map",
  YEAR: "year",
  POLYGON: "polygon",
  BUFFER: "buffer",
  AREA: "area",
  SUBMIT: "submit"
};

const DEFAULT_CLUSTERING_ENABLED = true;
const DEFAULT_CLUSTER_BY_REGNUM = true;
const DEFAULT_CLUSTER_PIE_CHARTS = false;
const DEFAULT_MARKERS_VISIBLE = true;

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
  // Радиус, открытый из панели «Сведения о точке» — показывается под ней, не закрывая её.
  const [arealDockedWithFeature, setArealDockedWithFeature] = useState(false);
  // Буфер, открытый из панели «Сведения о точке» — показывается под ней, не закрывая её.
  const [bufferDockedWithFeature, setBufferDockedWithFeature] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [arealEnabled, setArealEnabled] = useState(false);
  const [arealAllMarkers, setArealAllMarkers] = useState(false);
  const [arealRadius, setArealRadius] = useState(DEFAULT_AREAL_RADIUS_KM);
  const [yearFilterEnabled, setYearFilterEnabled] = useState(false);
  const [yearBounds, setYearBounds] = useState(() => getYearBounds());
  const [yearRange, setYearRange] = useState(() => getYearBounds());
  const [timelineYear, setTimelineYear] = useState(() => getYearBounds().max);
  const [arealDynamicsEnabled, setArealDynamicsEnabled] = useState(false);
  const [arealDynamicsFeature, setArealDynamicsFeature] = useState(null);
  const [arealDynamicsSlices, setArealDynamicsSlices] = useState([]);
  const [arealDynamicsComputing, setArealDynamicsComputing] = useState(false);
  const [arealDynamicsHideOthers, setArealDynamicsHideOthers] = useState(false);
  const [arealDynamicsBuildMode, setArealDynamicsBuildMode] = useState(POLYGON_BUILD_MODES.CONVEX);
  // Построенные полигоны видов (один на name_latin); activePolygonId — выбранный в списке.
  const [speciesPolygons, setSpeciesPolygons] = useState([]);
  const [activePolygonId, setActivePolygonId] = useState(null);
  const [polygonAddMode, setPolygonAddMode] = useState(false);
  const [intersectionSpeciesA, setIntersectionSpeciesA] = useState(null);
  const [intersectionSpeciesB, setIntersectionSpeciesB] = useState(null);
  const [intersectionResult, setIntersectionResult] = useState(null);
  const [intersectionPinned, setIntersectionPinned] = useState(false);
  const [intersectionOnlyMode, setIntersectionOnlyMode] = useState(false);
  const [intersectionLockedPair, setIntersectionLockedPair] = useState(null);
  // Буфер: радиусы зон (зелёная / серо-голубая / серая), км; bufferEnabled — включён ли переключатель.
  const [bufferRadii, setBufferRadii] = useState(DEFAULT_BUFFER_RADII_KM);
  const [bufferEnabled, setBufferEnabled] = useState(false);
  const [bufferSelectionMode, setBufferSelectionMode] = useState(false);
  const [bufferSelectedPoints, setBufferSelectedPoints] = useState([]);

  const isArealApplied = arealEnabled || arealAllMarkers;
  const isBufferApplied = bufferEnabled;
  const AREAL_BLOCKED_BY_BUFFER_TITLE = 'Сначала сбросьте инструмент «Буфер»';
  const BUFFER_BLOCKED_BY_AREAL_TITLE = 'Сначала сбросьте инструмент «Радиус»';
  const [areaDrawTool, setAreaDrawTool] = useState(AREA_DRAW_MODES.FREEHAND);
  const [areaOperationMode, setAreaOperationMode] = useState(AREA_OPERATION_MODES.ADD);
  const [areaDrawingActive, setAreaDrawingActive] = useState(false);
  const [areaGeometry, setAreaGeometry] = useState(null);
  const [hoverTooltipsDisabled, setHoverTooltipsDisabled] = useState(false);
  const [osmBasemapEnabled, setOsmBasemapEnabledState] = useState(false);
  const [dataSourceMode, setDataSourceModeState] = useState(DATA_SOURCE_MODES.ALL);
  const [panelCollapsed, setPanelCollapsed] = useState({});
  const [submissionCoordinates, setSubmissionCoordinates] = useState(null);
  const [submissionLocationPicking, setSubmissionLocationPicking] = useState(false);
  const hadFoundYearPropertyFilterRef = useRef(false);
  const previousYearFilterEnabledRef = useRef(false);
  const pendingSharePointRef = useRef(parseSharePointParams(window.location.search));

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

  const expandPanel = useCallback((panelId) => {
    setPanelCollapsed((prev) => {
      if (!prev[panelId]) {
        return prev;
      }

      return { ...prev, [panelId]: false };
    });
  }, []);

  useEffect(() => {
    switch (activeModule) {
      case MODULE_IDS.FEATURE:
        expandPanel(PANEL_IDS.FEATURE);
        break;
      case MODULE_IDS.STATUS:
        expandPanel(PANEL_IDS.STATUS);
        break;
      case MODULE_IDS.MAP:
        expandPanel(PANEL_IDS.MAP);
        break;
      case MODULE_IDS.YEAR:
        expandPanel(PANEL_IDS.YEAR);
        break;
      case MODULE_IDS.POLYGON:
        expandPanel(PANEL_IDS.POLYGON);
        break;
      case MODULE_IDS.AREAL:
        expandPanel(PANEL_IDS.AREAL);
        break;
      case MODULE_IDS.BUFFER:
        expandPanel(PANEL_IDS.BUFFER);
        break;
      case MODULE_IDS.AREA:
        expandPanel(PANEL_IDS.AREA);
        break;
      case MODULE_IDS.SUBMIT:
        expandPanel(PANEL_IDS.SUBMIT);
        break;
      default:
        break;
    }

    if (
      activeModule === MODULE_IDS.AREAL ||
      (activeModule === MODULE_IDS.FEATURE && arealDockedWithFeature)
    ) {
      expandPanel(PANEL_IDS.AREAL);
    }

    if (
      activeModule === MODULE_IDS.BUFFER ||
      (activeModule === MODULE_IDS.FEATURE && bufferDockedWithFeature)
    ) {
      expandPanel(PANEL_IDS.BUFFER);
    }
  }, [activeModule, arealDockedWithFeature, bufferDockedWithFeature, expandPanel]);

  const handleModuleSelect = useCallback((moduleId) => {
    if (moduleId === MODULE_IDS.ABOUT) {
      setAboutOpen(true);
      return;
    }

    if (moduleId === MODULE_IDS.AREAL && isBufferApplied) {
      return;
    }

    if (moduleId === MODULE_IDS.BUFFER && isArealApplied) {
      return;
    }

    if (moduleId === MODULE_IDS.AREAL) {
      // Из меню «Радиус» открывается отдельно — панель точки не остаётся в стеке.
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
  }, [isArealApplied, isBufferApplied]);

  const handleOpenArealFromFeature = useCallback(() => {
    if (isBufferApplied) {
      return;
    }

    setActiveModule(MODULE_IDS.FEATURE);
    setBufferDockedWithFeature(false);
    setArealDockedWithFeature((open) => !open);
  }, [isBufferApplied]);

  const handleOpenBufferFromFeature = useCallback(() => {
    if (isArealApplied) {
      return;
    }

    setActiveModule(MODULE_IDS.FEATURE);
    setArealDockedWithFeature(false);
    setBufferDockedWithFeature((open) => !open);
  }, [isArealApplied]);

  const handleYearRangeChange = useCallback((nextRange) => {
    setYearRange((prev) =>
      prev.min === nextRange.min && prev.max === nextRange.max ? prev : nextRange
    );
  }, []);

  const syncYearBounds = useCallback(() => {
    const bounds = getYearBounds();
    setYearBounds(bounds);
    setYearRange(bounds);
    setTimelineYear(bounds.max);
  }, []);

  const hasFoundYearPropertyFilter = Object.prototype.hasOwnProperty.call(
    propertyFilters,
    "found_year"
  );

  useEffect(() => {
    if (activeModule !== MODULE_IDS.SUBMIT) {
      setSubmissionCoordinates(null);
      setSubmissionLocationPicking(false);
    }
  }, [activeModule]);

  useEffect(() => {
    const mapInstance = map.current;
    if (!mapInstance || !mapReady) {
      return;
    }

    setMapCursorOverride(
      mapInstance,
      submissionLocationPicking ? GET_LOCATION_CURSOR : null
    );

    return () => {
      setMapCursorOverride(mapInstance, null);
    };
  }, [submissionLocationPicking, mapReady]);

  useEffect(() => {
    if (hasFoundYearPropertyFilter) {
      if (!hadFoundYearPropertyFilterRef.current) {
        hadFoundYearPropertyFilterRef.current = true;
        // Запоминаем состояние переключателя «Год», каким оно было до того, как
        // фильтр по свойству found_year взял управление годом на себя.
        setYearFilterEnabled((current) => {
          previousYearFilterEnabledRef.current = current;
          return false;
        });
      }
      return;
    }

    if (hadFoundYearPropertyFilterRef.current) {
      hadFoundYearPropertyFilterRef.current = false;
      setYearFilterEnabled(previousYearFilterEnabledRef.current);
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
    yearRange,
    activeModule,
    timelineYear,
    yearBounds
  };

  const bufferStateRef = useRef({});
  bufferStateRef.current = {
    bufferSelectionMode,
    activeModule,
    bufferDockedWithFeature
  };

  const polygonStateRef = useRef({});
  polygonStateRef.current = {
    polygonAddMode,
    activeModule
  };

  const pointSelectionStateRef = useRef({});
  pointSelectionStateRef.current = {
    popupData,
    propertyFilters,
    arealEnabled,
    arealAllMarkers,
    speciesPolygons,
    activePolygonId,
    bufferEnabled,
    bufferSelectedPoints,
    bufferSelectionMode,
    polygonAddMode,
    arealDockedWithFeature,
    bufferDockedWithFeature,
    activeModule
  };

  const submissionStateRef = useRef({});
  submissionStateRef.current = {
    active: activeModule === MODULE_IDS.SUBMIT,
    pickingLocation: submissionLocationPicking,
    setCoordinates: (coords) => {
      setSubmissionCoordinates([
        Number(coords[0].toFixed(3)),
        Number(coords[1].toFixed(3))
      ]);
      setSubmissionLocationPicking(false);
    }
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
      yearRange: selectedYearRange,
      activeModule: currentModule,
      timelineYear: selectedTimelineYear,
      yearBounds: selectedYearBounds
    } = arealStateRef.current;

    if (!mapInstance) {
      return;
    }

    const combinedFilters = { ...filters };
    if (selectedStatuses.length > 0) {
      combinedFilters.status = selectedStatuses;
    }
    if (!Object.prototype.hasOwnProperty.call(filters, "found_year")) {
      if (currentModule === MODULE_IDS.TIMELINE) {
        combinedFilters.found_year = { min: selectedYearBounds.min, max: selectedTimelineYear };
      } else if (yearEnabled) {
        combinedFilters.found_year = selectedYearRange;
      }
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

    if (!Object.prototype.hasOwnProperty.call(propertyFilters, "found_year")) {
      if (activeModule === MODULE_IDS.TIMELINE) {
        filters.found_year = { min: yearBounds.min, max: timelineYear };
      } else if (yearFilterEnabled) {
        filters.found_year = yearRange;
      }
    }

    if (
      activeModule === MODULE_IDS.TIMELINE &&
      arealDynamicsEnabled &&
      arealDynamicsHideOthers &&
      arealDynamicsFeature?.properties?.name_latin
    ) {
      filters.name_latin = arealDynamicsFeature.properties.name_latin;
    }

    return filters;
  }, [
    propertyFilters,
    statusFilters,
    yearFilterEnabled,
    yearRange,
    activeModule,
    timelineYear,
    arealDynamicsEnabled,
    arealDynamicsHideOthers,
    arealDynamicsFeature,
    yearBounds
  ]);

  const handleUserFindingSaved = useCallback(() => {
    const mapInstance = map.current;
    if (!mapInstance || !mapReady) {
      return;
    }

    syncYearBounds();
    reloadLocationsData(mapInstance);
    updateHeatmapData(mapInstance, buildLocationFilters());
    clearArealDynamicsSliceCache();
  }, [buildLocationFilters, mapReady, syncYearBounds]);

  const areaContainedPoints = useMemo(() => {
    if (!areaGeometry || !mapReady) {
      return null;
    }

    return getAreaContainedPointsSummary(areaGeometry, buildLocationFilters());
  }, [areaGeometry, buildLocationFilters, mapReady]);

  const visibleBuiltPolygons = useMemo(
    () => speciesPolygons.filter((entry) => entry.built && !entry.hidden),
    [speciesPolygons]
  );

  const builtSpeciesPolygons = useMemo(
    () => speciesPolygons.filter((entry) => entry.built),
    [speciesPolygons]
  );

  const activePolygon = useMemo(() => {
    if (activePolygonId) {
      const selected = speciesPolygons.find((entry) => entry.id === activePolygonId);
      if (selected?.built) {
        return selected;
      }
    }

    return visibleBuiltPolygons[0] ?? null;
  }, [speciesPolygons, activePolygonId, visibleBuiltPolygons]);

  const speciesPolygonContainedSpecies = useMemo(() => {
    if (
      visibleBuiltPolygons.length !== 1 ||
      !activePolygon?.polygon ||
      !mapReady
    ) {
      return null;
    }

    return getSpeciesPolygonContainedSummary(
      activePolygon.polygon,
      activePolygon.nameLatin,
      buildLocationFilters()
    );
  }, [visibleBuiltPolygons, activePolygon, buildLocationFilters, mapReady]);

  const intersectionContainedPoints = useMemo(() => {
    if (!intersectionResult?.hasIntersection || !intersectionResult.feature || !mapReady) {
      return null;
    }

    return getPolygonIntersectionContainedSummary(
      intersectionResult.feature,
      buildLocationFilters(),
      [
        intersectionResult.speciesA?.nameLatin,
        intersectionResult.speciesB?.nameLatin
      ]
    );
  }, [intersectionResult, buildLocationFilters, mapReady]);

  const clearIntersectionDisplay = useCallback(() => {
    setIntersectionResult(null);
    setIntersectionPinned(false);
    setIntersectionOnlyMode(false);

    if (map.current) {
      clearSpeciesPolygonIntersectionLayer(map.current);
    }
  }, []);

  const clearIntersectionState = useCallback(() => {
    clearIntersectionDisplay();
    setIntersectionLockedPair(null);
  }, [clearIntersectionDisplay]);

  const intersectionActionsLocked = useMemo(() => {
    if (!intersectionLockedPair) {
      return false;
    }

    const hasA = builtSpeciesPolygons.some(
      (entry) => entry.nameLatin === intersectionLockedPair.latinA
    );
    const hasB = builtSpeciesPolygons.some(
      (entry) => entry.nameLatin === intersectionLockedPair.latinB
    );

    return hasA && hasB;
  }, [intersectionLockedPair, builtSpeciesPolygons]);

  const computeIntersectionFromSelection = useCallback(() => {
    if (!intersectionSpeciesA || !intersectionSpeciesB || intersectionSpeciesA === intersectionSpeciesB) {
      return null;
    }

    const entryA = builtSpeciesPolygons.find((entry) => entry.nameLatin === intersectionSpeciesA);
    const entryB = builtSpeciesPolygons.find((entry) => entry.nameLatin === intersectionSpeciesB);

    if (!entryA?.polygon || !entryB?.polygon) {
      return null;
    }

    return {
      ...computeSpeciesPolygonIntersection(entryA.polygon, entryB.polygon),
      speciesA: entryA,
      speciesB: entryB
    };
  }, [builtSpeciesPolygons, intersectionSpeciesA, intersectionSpeciesB]);

  useEffect(() => {
    if (activeModule !== MODULE_IDS.POLYGON) {
      setPolygonAddMode(false);
      clearIntersectionState();
    }
  }, [activeModule, clearIntersectionState]);

  useEffect(() => {
    if (activeModule !== MODULE_IDS.TIMELINE) {
      setArealDynamicsEnabled(false);
      setArealDynamicsFeature(null);
      setArealDynamicsSlices([]);
      setArealDynamicsComputing(false);
      setArealDynamicsHideOthers(false);
      setArealDynamicsBuildMode(POLYGON_BUILD_MODES.CONVEX);
    }
  }, [activeModule]);

  useEffect(() => {
    if (activeModule !== MODULE_IDS.TIMELINE || !arealDynamicsEnabled || !popupData) {
      return;
    }

    setArealDynamicsFeature(popupData);
  }, [activeModule, arealDynamicsEnabled, popupData]);

  useEffect(() => {
    if (!arealDynamicsEnabled || !arealDynamicsFeature) {
      setArealDynamicsSlices([]);
      setArealDynamicsComputing(false);
      return undefined;
    }

    setArealDynamicsComputing(true);
    const timer = window.setTimeout(() => {
      setArealDynamicsSlices(
        buildArealDynamicsSlices(arealDynamicsFeature, arealDynamicsBuildMode)
      );
      setArealDynamicsComputing(false);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [arealDynamicsEnabled, arealDynamicsFeature, arealDynamicsBuildMode]);

  useEffect(() => {
    if (!map.current || !mapReady) {
      return;
    }

    let polygonsToSync = speciesPolygons;

    if (
      activeModule === MODULE_IDS.TIMELINE &&
      arealDynamicsEnabled &&
      arealDynamicsFeature?.properties?.name_latin
    ) {
      const activeLatin = arealDynamicsFeature.properties.name_latin;
      polygonsToSync = speciesPolygons.map((entry) =>
        entry.nameLatin === activeLatin ? { ...entry, hidden: true } : entry
      );
    } else if (
      intersectionOnlyMode &&
      intersectionResult?.hasIntersection &&
      intersectionResult.speciesA &&
      intersectionResult.speciesB
    ) {
      const hiddenLatins = new Set([
        intersectionResult.speciesA.nameLatin,
        intersectionResult.speciesB.nameLatin
      ]);

      polygonsToSync = speciesPolygons.map((entry) =>
        hiddenLatins.has(entry.nameLatin) ? { ...entry, hidden: true } : entry
      );
    }

    syncSpeciesPolygonLayer(map.current, polygonsToSync);
  }, [
    speciesPolygons,
    mapReady,
    activeModule,
    arealDynamicsEnabled,
    arealDynamicsFeature,
    intersectionOnlyMode,
    intersectionResult
  ]);

  useEffect(() => {
    if (!map.current || !mapReady) {
      return;
    }

    if (
      activeModule === MODULE_IDS.TIMELINE &&
      arealDynamicsEnabled &&
      arealDynamicsSlices.length > 0
    ) {
      syncArealDynamicsLayer(
        map.current,
        filterSlicesUpToYear(arealDynamicsSlices, timelineYear)
      );
      return;
    }

    clearArealDynamicsLayer(map.current);
  }, [
    activeModule,
    arealDynamicsEnabled,
    arealDynamicsSlices,
    timelineYear,
    mapReady
  ]);

  useEffect(() => {
    if (!intersectionLockedPair) {
      return;
    }

    const hasA = builtSpeciesPolygons.some(
      (entry) => entry.nameLatin === intersectionLockedPair.latinA
    );
    const hasB = builtSpeciesPolygons.some(
      (entry) => entry.nameLatin === intersectionLockedPair.latinB
    );

    if (!hasA || !hasB) {
      setIntersectionLockedPair(null);
    }
  }, [intersectionLockedPair, builtSpeciesPolygons]);

  useEffect(() => {
    if (intersectionResult) {
      setPolygonAddMode(false);
    }
  }, [intersectionResult]);

  useEffect(() => {
    if (!intersectionResult?.hasIntersection) {
      setIntersectionOnlyMode(false);
    }
  }, [intersectionResult]);

  useEffect(() => {
    if (!map.current || !mapReady) {
      return;
    }

    if (intersectionResult?.hasIntersection && intersectionResult.feature) {
      updateSpeciesPolygonIntersectionLayer(map.current, intersectionResult.feature);
      return;
    }

    clearSpeciesPolygonIntersectionLayer(map.current);
  }, [intersectionResult, mapReady]);

  useEffect(() => {
    if (builtSpeciesPolygons.length < 2) {
      setIntersectionSpeciesA(null);
      setIntersectionSpeciesB(null);
      clearIntersectionState();
      return;
    }

    setIntersectionSpeciesA((current) => {
      if (current && builtSpeciesPolygons.some((entry) => entry.nameLatin === current)) {
        return current;
      }

      return builtSpeciesPolygons[0]?.nameLatin ?? null;
    });

    setIntersectionSpeciesB((current) => {
      if (current && builtSpeciesPolygons.some((entry) => entry.nameLatin === current)) {
        return current;
      }

      return builtSpeciesPolygons[1]?.nameLatin ?? null;
    });
  }, [builtSpeciesPolygons, clearIntersectionState]);

  useEffect(() => {
    if (!intersectionPinned) {
      return;
    }

    const nextResult = computeIntersectionFromSelection();

    if (!nextResult) {
      clearIntersectionState();
      return;
    }

    setIntersectionResult(nextResult);
  }, [speciesPolygons, intersectionPinned, computeIntersectionFromSelection, clearIntersectionState]);

  useEffect(() => {
    if (activeModule !== MODULE_IDS.AREA) {
      setAreaDrawingActive(false);
    }
  }, [activeModule]);

  useEffect(() => {
    if (!map.current || !mapReady) {
      return;
    }

    if (areaGeometry) {
      updateAreaSelectionLayer(map.current, areaGeometry);
    } else {
      clearAreaSelectionLayer(map.current);
    }
  }, [areaGeometry, mapReady]);

  useEffect(() => {
    const mapInstance = map.current;
    if (!mapInstance || !mapReady || activeModule !== MODULE_IDS.AREA || !areaDrawingActive) {
      stopActiveAreaDrawing();
      return;
    }

    startAreaDrawing(mapInstance, areaDrawTool, {
      onPreview: (coordinates) => {
        updateAreaSelectionPreview(mapInstance, coordinates);
      },
      onComplete: (ringCoordinates) => {
        setAreaGeometry((current) =>
          applyAreaGeometryOperation(current, ringCoordinates, areaOperationMode)
        );
        setAreaDrawingActive(false);
      },
      onCancel: () => {
        setAreaDrawingActive(false);
        updateAreaSelectionPreview(mapInstance, []);
      }
    });

    return () => {
      stopActiveAreaDrawing();
    };
  }, [areaDrawingActive, areaDrawTool, areaOperationMode, activeModule, mapReady]);

  useEffect(() => {
    if (!areaGeometry && areaOperationMode === AREA_OPERATION_MODES.SUBTRACT) {
      setAreaOperationMode(AREA_OPERATION_MODES.ADD);
    }
  }, [areaGeometry, areaOperationMode]);

  const handleAreaDrawToolChange = useCallback((nextTool) => {
    if (areaDrawTool === nextTool && areaDrawingActive) {
      setAreaDrawingActive(false);
      return;
    }

    setAreaDrawTool(nextTool);
    setAreaDrawingActive(true);
  }, [areaDrawTool, areaDrawingActive]);

  const handleAreaOperationModeChange = useCallback((nextMode) => {
    setAreaOperationMode(nextMode);
  }, []);

  const handleAreaReset = useCallback(() => {
    setAreaDrawingActive(false);
    setAreaGeometry(null);
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

  const handleSpeciesPolygonResetAll = useCallback(() => {
    setSpeciesPolygons([]);
    setActivePolygonId(null);
    setPolygonAddMode(false);
    setIntersectionSpeciesA(null);
    setIntersectionSpeciesB(null);
    setIntersectionResult(null);
    setIntersectionOnlyMode(false);
    setIntersectionLockedPair(null);

    if (map.current) {
      clearSpeciesPolygonLayer(map.current);
    }
  }, []);

  const handleArealReset = useCallback(() => {
    setArealEnabled(false);
    setArealAllMarkers(false);
    setArealRadius(DEFAULT_AREAL_RADIUS_KM);
  }, []);

  const handleBufferReset = useCallback(() => {
    setBufferEnabled(false);
    setBufferRadii(DEFAULT_BUFFER_RADII_KM);
    setBufferSelectedPoints([]);
    setBufferSelectionMode(false);
  }, []);

  useEffect(() => {
    if (!map.current || !mapReady) {
      return;
    }

    setDataSourceFilter(dataSourceMode);
    reloadLocationsData(map.current);
    updateHeatmapData(map.current, buildLocationFilters());
    refreshAreal();
    clearSharedPointPin(map.current);
    clearArealDynamicsSliceCache();
    setPopupData(null);
    // Точки прежнего источника данных могли пропасть из нового — сбрасываем
    // инструменты, построенные по ним, иначе радиус/буфер/полигоны будут
    // ссылаться на точки, которых уже нет в текущей выборке.
    setArealDockedWithFeature(false);
    setBufferDockedWithFeature(false);
    handleArealReset();
    handleBufferReset();
    handleSpeciesPolygonResetAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- перестраиваем слои только при смене источника данных
  }, [
    dataSourceMode,
    mapReady,
    refreshAreal,
    handleArealReset,
    handleBufferReset,
    handleSpeciesPolygonResetAll
  ]);

  useEffect(() => {
    if (!map.current || !mapReady) {
      return;
    }

    if (popupData) {
      updateSelectedPointHighlight(map.current, popupData);
    } else {
      clearSelectedPointHighlight(map.current);
    }
  }, [popupData, mapReady]);

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
  }, [popupData, arealEnabled, arealAllMarkers, arealRadius, propertyFilters, statusFilters, yearFilterEnabled, yearRange, activeModule, timelineYear, refreshAreal]);

  useEffect(() => {
    const mapInstance = map.current;
    if (!mapInstance) {
      return;
    }

    // Радиус для одной точки требует выбранную точку; режим "ко всем маркерам"
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

  const handleSpeciesPolygonResetOne = useCallback((polygonId) => {
    setSpeciesPolygons((prev) => prev.filter((entry) => entry.id !== polygonId));
    setActivePolygonId((prev) => (prev === polygonId ? null : prev));

    if (
      intersectionSpeciesA === polygonId ||
      intersectionSpeciesB === polygonId ||
      intersectionResult?.speciesA?.nameLatin === polygonId ||
      intersectionResult?.speciesB?.nameLatin === polygonId
    ) {
      clearIntersectionState();
    }
  }, [
    clearIntersectionState,
    intersectionResult,
    intersectionSpeciesA,
    intersectionSpeciesB
  ]);

  const handleSpeciesPolygonToggleHidden = useCallback((polygonId) => {
    setSpeciesPolygons((prev) =>
      prev.map((entry) =>
        entry.id === polygonId ? { ...entry, hidden: !entry.hidden } : entry
      )
    );
  }, []);

  const handleSpeciesPolygonSelect = useCallback((polygonId) => {
    setActivePolygonId(polygonId);
  }, []);

  const handleSpeciesPolygonToggleBuildMode = useCallback((polygonId) => {
    setSpeciesPolygons((prev) => toggleSpeciesPolygonBuildMode(prev, polygonId));
    setActivePolygonId(polygonId);
  }, []);

  const handleSpeciesPolygonAddModeChange = useCallback((enabled) => {
    setPolygonAddMode(enabled);
  }, []);

  const handleArealDynamicsEnabledChange = useCallback((enabled) => {
    setArealDynamicsEnabled(enabled);

    if (enabled && popupData) {
      setArealDynamicsFeature(popupData);
    }

    if (!enabled) {
      setArealDynamicsFeature(null);
      setArealDynamicsSlices([]);
      setArealDynamicsHideOthers(false);
      setArealDynamicsBuildMode(POLYGON_BUILD_MODES.CONVEX);
    }
  }, [popupData]);

  const handleArealDynamicsHideOthersChange = useCallback((hideOthers) => {
    setArealDynamicsHideOthers(hideOthers);
  }, []);

  const handleArealDynamicsReset = useCallback(() => {
    setArealDynamicsEnabled(false);
    setArealDynamicsFeature(null);
    setArealDynamicsSlices([]);
    setArealDynamicsHideOthers(false);
    setArealDynamicsBuildMode(POLYGON_BUILD_MODES.CONVEX);

    if (map.current) {
      clearArealDynamicsLayer(map.current);
    }
  }, []);

  const handleArealDynamicsBuildModeToggle = useCallback(() => {
    setArealDynamicsBuildMode((mode) =>
      mode === POLYGON_BUILD_MODES.ALL_POINTS
        ? POLYGON_BUILD_MODES.CONVEX
        : POLYGON_BUILD_MODES.ALL_POINTS
    );
  }, []);

  const arealDynamicsPointCount = useMemo(() => {
    if (!arealDynamicsFeature) {
      return 0;
    }

    return getPointsForSpecies(arealDynamicsFeature).length;
  }, [arealDynamicsFeature]);

  const handleArealDynamicsYearSelect = useCallback((year) => {
    setTimelineYear(year);
  }, []);

  const arealDynamicsSpeciesLabel = useMemo(() => {
    if (!arealDynamicsFeature) {
      return "";
    }

    const nameRu = arealDynamicsFeature.properties?.name_ru || "Без названия";
    const nameLatin = arealDynamicsFeature.properties?.name_latin;

    return nameLatin ? `${nameRu} (${nameLatin})` : nameRu;
  }, [arealDynamicsFeature]);

  const applySpeciesPolygonBuild = useCallback((feature, mode) => {
    if (!feature) {
      return;
    }

    const nameLatin = feature.properties?.name_latin;

    setSpeciesPolygons((prev) => upsertSpeciesPolygon(prev, feature, mode));

    if (nameLatin) {
      setActivePolygonId(nameLatin);
    }

    setPolygonAddMode(false);
  }, []);

  /**
   * Строит полигон по виду текущей выбранной точки.
   * Смена точки сама по себе полигон не меняет — только явный вызов этой функции.
   */
  const handleSpeciesPolygonBuild = useCallback(() => {
    if (!popupData) {
      return;
    }

    applySpeciesPolygonBuild(popupData, POLYGON_BUILD_MODES.CONVEX);
  }, [popupData, applySpeciesPolygonBuild]);

  const handleSpeciesPolygonBuildAllPoints = useCallback(() => {
    if (!popupData) {
      return;
    }

    const selectedSpecies = popupData.properties?.name_latin;
    const existing = speciesPolygons.find((entry) => entry.nameLatin === selectedSpecies);
    const isAllPointsActive =
      existing?.built && existing.mode === POLYGON_BUILD_MODES.ALL_POINTS;

    applySpeciesPolygonBuild(
      popupData,
      isAllPointsActive ? POLYGON_BUILD_MODES.CONVEX : POLYGON_BUILD_MODES.ALL_POINTS
    );
  }, [popupData, speciesPolygons, applySpeciesPolygonBuild]);

  const handleIntersectionSpeciesAChange = useCallback((nameLatin) => {
    setIntersectionSpeciesA(nameLatin);
    clearIntersectionDisplay();
  }, [clearIntersectionDisplay]);

  const handleIntersectionSpeciesBChange = useCallback((nameLatin) => {
    setIntersectionSpeciesB(nameLatin);
    clearIntersectionDisplay();
  }, [clearIntersectionDisplay]);

  const handleIntersectionCompute = useCallback(() => {
    const nextResult = computeIntersectionFromSelection();

    if (!nextResult) {
      return;
    }

    setIntersectionResult(nextResult);
    setIntersectionPinned(true);
    setIntersectionLockedPair({
      latinA: intersectionSpeciesA,
      latinB: intersectionSpeciesB
    });
    setPolygonAddMode(false);
  }, [computeIntersectionFromSelection, intersectionSpeciesA, intersectionSpeciesB]);

  const handleIntersectionReset = useCallback(() => {
    clearIntersectionState();
  }, [clearIntersectionState]);

  const handleIntersectionOnlyToggle = useCallback(() => {
    setIntersectionOnlyMode((enabled) => !enabled);
  }, []);

  /**
   * Меняет радиус одной зоны буфера, поддерживая порядок «каждая следующая зона не меньше
   * предыдущей» — иначе кольца буфера накладывались бы некорректно.
   */
  const handleBufferRadiusChange = useCallback((index, value) => {
    setBufferRadii((prev) => {
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

  const handleBufferEnabledChange = useCallback((enabled) => {
    if (enabled && isArealApplied) {
      return;
    }

    if (enabled) {
      setArealDockedWithFeature(false);
    }

    setBufferEnabled(enabled);
  }, [isArealApplied]);

  const handleArealEnabledChange = useCallback((enabled) => {
    if (enabled && isBufferApplied) {
      return;
    }

    if (enabled) {
      setBufferDockedWithFeature(false);
    }

    setArealEnabled(enabled);
  }, [isBufferApplied]);

  const handleArealAllMarkersChange = useCallback((enabled) => {
    if (enabled && isBufferApplied) {
      return;
    }

    if (enabled) {
      setBufferDockedWithFeature(false);
    }

    setArealAllMarkers(enabled);
  }, [isBufferApplied]);

  const handleBufferSelectionModeChange = useCallback(() => {
    if (isArealApplied) {
      return;
    }

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
  }, [popupData, isArealApplied]);

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
    const state = pointSelectionStateRef.current;

    if (
      !state.popupData &&
      Object.keys(state.propertyFilters).length === 0 &&
      !state.arealEnabled &&
      !state.arealAllMarkers &&
      state.speciesPolygons.length === 0 &&
      !state.activePolygonId &&
      !state.bufferEnabled &&
      state.bufferSelectedPoints.length === 0 &&
      !state.bufferSelectionMode &&
      !state.polygonAddMode &&
      !state.arealDockedWithFeature &&
      !state.bufferDockedWithFeature &&
      state.activeModule !== MODULE_IDS.FEATURE &&
      (!state.activeModule || state.activeModule === MODULE_IDS.POLYGON)
    ) {
      return;
    }

    if (map.current) {
      clearSharedPointPin(map.current);
      hideArealPointHint();
      clearArealLayer(map.current);
      clearBufferLayer(map.current);
      clearSpeciesPolygonLayer(map.current);
    }

    setPopupData(null);
    setPropertyFilters((prev) => (Object.keys(prev).length === 0 ? prev : {}));
    setArealEnabled(false);
    setArealAllMarkers(false);
    setSpeciesPolygons((prev) => (prev.length === 0 ? prev : []));
    setActivePolygonId(null);
    setBufferRadii(DEFAULT_BUFFER_RADII_KM);
    setBufferEnabled(false);
    setBufferSelectedPoints((prev) => (prev.length === 0 ? prev : []));
    setBufferSelectionMode(false);
    setPolygonAddMode(false);
    setActiveModule((current) => (current === MODULE_IDS.POLYGON ? current : null));
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
      updateBufferLayer(mapInstance, bufferFeatures, bufferRadii);
    } else {
      clearBufferLayer(mapInstance);
    }
  }, [bufferEnabled, popupData, bufferSelectedPoints, bufferRadii, mapReady]);

  useEffect(() => {
    const pendingShare = pendingSharePointRef.current;

    if (!mapReady || !map.current || !pendingShare?.findingId) {
      return;
    }

    const { findingId, zoom } = pendingShare;

    if (!isFindingInDataSource(findingId, dataSourceMode)) {
      if (dataSourceMode !== DATA_SOURCE_MODES.ALL) {
        setDataSourceModeState(DATA_SOURCE_MODES.ALL);
      } else {
        pendingSharePointRef.current = null;
      }
      return;
    }

    const feature = findFeatureByFindingId(findingId);

    if (!feature) {
      pendingSharePointRef.current = null;
      return;
    }

    pendingSharePointRef.current = null;
    focusMapOnSharedPoint(map.current, feature, { zoom });
    showSharedPointPin(map.current, feature);
    showSharedPointPopup(map.current, feature, {
      onOpenDetails: (sharedFeature) => {
        clearSharedPointPin(map.current);
        setPopupData(sharedFeature);
        setActiveModule(MODULE_IDS.FEATURE);
        updateSelectedPointHighlight(map.current, sharedFeature);
      }
    });
  }, [mapReady, dataSourceMode]);

  useEffect(() => {
    if (!map.current && ref.current) {
      map.current = initMap(ref.current);

      map.current.on("load", async () => {
        await initLocationsFromFirestore();
        syncYearBounds();

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

            if (
              submissionStateRef.current.active &&
              submissionStateRef.current.pickingLocation
            ) {
              const coords = feature?.geometry?.coordinates;
              if (coords) {
                submissionStateRef.current.setCoordinates(coords);
              }
              return;
            }

            dismissArealPointHintOnPointClick(feature);
            clearSharedPointPin(map.current);
            setPopupData(feature);
            updateSelectedPointHighlight(map.current, feature);
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

            const { polygonAddMode: addMode, activeModule: currentPolygonModule } =
              polygonStateRef.current;

            if (currentPolygonModule === MODULE_IDS.POLYGON && addMode) {
              const nameLatin = feature.properties?.name_latin;

              setSpeciesPolygons((prev) =>
                upsertSpeciesPolygon(prev, feature, POLYGON_BUILD_MODES.CONVEX)
              );

              if (nameLatin) {
                setActivePolygonId(nameLatin);
              }

              setPolygonAddMode(false);
            }
          },
          onMapBackgroundClick: (event) => {
            if (isAreaDrawingActive()) {
              return;
            }

            if (
              submissionStateRef.current.active &&
              submissionStateRef.current.pickingLocation &&
              event?.lngLat
            ) {
              submissionStateRef.current.setCoordinates([
                event.lngLat.lng,
                event.lngLat.lat
              ]);
              return;
            }

            clearSharedPointPin(map.current);
            clearPointSelection();
          },
          clusteringEnabled: DEFAULT_CLUSTERING_ENABLED,
          clusterByRegnum: DEFAULT_CLUSTER_BY_REGNUM,
          clusterPieChartsEnabled: DEFAULT_CLUSTER_PIE_CHARTS,
          markersVisible: DEFAULT_MARKERS_VISIBLE
        });
        addArealLayer(map.current);
        addSpeciesPolygonLayer(map.current); // слой экспериментального модуля «Полигон»
        addArealDynamicsLayer(map.current);
        addBufferLayer(map.current);
        addAreaSelectionLayer(map.current);
        addHeatmapLayer(map.current);
        setMapReady(true);
      });
    }

    return () => {
      setMapReady(false);
      arealRefreshScheduledRef.current = false;
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, [clearPointSelection, syncYearBounds]);

  return (
    <>
      <ModuleMenu
        activeModule={activeModule}
        onModuleSelect={handleModuleSelect}
        pointSelected={Boolean(popupData)}
        arealBlocked={isBufferApplied}
        bufferBlocked={isArealApplied}
        hoverTooltipsDisabled={hoverTooltipsDisabled}
        onHoverTooltipsDisabledChange={setHoverTooltipsDisabled}
        osmBasemapEnabled={osmBasemapEnabled}
        onOsmBasemapEnabledChange={setOsmBasemapEnabledState}
        dataSourceMode={dataSourceMode}
        onDataSourceModeChange={setDataSourceModeState}
      />
      <div ref={ref} className="map-container" />
      {activeModule !== null && activeModule !== MODULE_IDS.TIMELINE && (
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
              arealDisabled={isBufferApplied}
              arealDisabledTitle={AREAL_BLOCKED_BY_BUFFER_TITLE}
              onOpenBuffer={handleOpenBufferFromFeature}
              bufferDockedOpen={bufferDockedWithFeature}
              bufferDisabled={isArealApplied}
              bufferDisabledTitle={BUFFER_BLOCKED_BY_AREAL_TITLE}
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
              onEnabledChange={handleArealEnabledChange}
              onAllMarkersChange={handleArealAllMarkersChange}
              toolBlocked={isBufferApplied}
              toolBlockedTitle={AREAL_BLOCKED_BY_BUFFER_TITLE}
              onRadiusChange={setArealRadius}
              onReset={handleArealReset}
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
              yearBounds={yearBounds}
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
              polygons={speciesPolygons}
              activePolygonId={activePolygon?.id ?? null}
              addMode={polygonAddMode}
              containedSpecies={speciesPolygonContainedSpecies}
              onBuild={handleSpeciesPolygonBuild}
              onBuildAllPoints={handleSpeciesPolygonBuildAllPoints}
              onResetAll={handleSpeciesPolygonResetAll}
              onResetOne={handleSpeciesPolygonResetOne}
              onToggleHidden={handleSpeciesPolygonToggleHidden}
              onToggleBuildMode={handleSpeciesPolygonToggleBuildMode}
              onSelectPolygon={handleSpeciesPolygonSelect}
              onAddModeChange={handleSpeciesPolygonAddModeChange}
              onSpeciesSelect={handleSpeciesPolygonSpeciesSelect}
              intersectionSpeciesA={intersectionSpeciesA}
              intersectionSpeciesB={intersectionSpeciesB}
              intersectionResult={intersectionResult}
              intersectionContainedPoints={intersectionContainedPoints}
              intersectionOnlyMode={intersectionOnlyMode}
              intersectionActionsLocked={intersectionActionsLocked}
              onIntersectionSpeciesAChange={handleIntersectionSpeciesAChange}
              onIntersectionSpeciesBChange={handleIntersectionSpeciesBChange}
              onIntersectionCompute={handleIntersectionCompute}
              onIntersectionReset={handleIntersectionReset}
              onIntersectionOnlyToggle={handleIntersectionOnlyToggle}
              onIntersectionPointSelect={handleAreaPointSelect}
              collapsed={isPanelCollapsed(PANEL_IDS.POLYGON)}
              onCollapsedChange={handlePanelCollapsedChange(PANEL_IDS.POLYGON)}
            />
          )}
          {activeModule === MODULE_IDS.BUFFER ||
          (activeModule === MODULE_IDS.FEATURE && bufferDockedWithFeature) ? (
            <BufferPopup
              feature={popupData}
              enabled={bufferEnabled}
              radiiKm={bufferRadii}
              selectionMode={bufferSelectionMode}
              selectedCount={bufferSelectedPoints.length}
              onEnabledChange={handleBufferEnabledChange}
              onSelectionModeChange={handleBufferSelectionModeChange}
              onRadiusChange={handleBufferRadiusChange}
              onReset={handleBufferReset}
              toolBlocked={isArealApplied}
              toolBlockedTitle={BUFFER_BLOCKED_BY_AREAL_TITLE}
              collapsed={isPanelCollapsed(PANEL_IDS.BUFFER)}
              onCollapsedChange={handlePanelCollapsedChange(PANEL_IDS.BUFFER)}
            />
          ) : null}
          {activeModule === MODULE_IDS.AREA && (
            <AreaSelectionPopup
              drawTool={areaDrawTool}
              operationMode={areaOperationMode}
              onDrawToolChange={handleAreaDrawToolChange}
              onOperationModeChange={handleAreaOperationModeChange}
              drawingActive={areaDrawingActive}
              hasArea={Boolean(areaGeometry)}
              containedPoints={areaContainedPoints}
              onPointSelect={handleAreaPointSelect}
              onReset={handleAreaReset}
              collapsed={isPanelCollapsed(PANEL_IDS.AREA)}
              onCollapsedChange={handlePanelCollapsedChange(PANEL_IDS.AREA)}
            />
          )}
          {activeModule === MODULE_IDS.SUBMIT && (
            <Suspense fallback={null}>
              <UserSubmissionPanel
                coordinates={submissionCoordinates}
                locationPickingActive={submissionLocationPicking}
                onLocationPickingChange={setSubmissionLocationPicking}
                collapsed={isPanelCollapsed(PANEL_IDS.SUBMIT)}
                onCollapsedChange={handlePanelCollapsedChange(PANEL_IDS.SUBMIT)}
                onSaved={handleUserFindingSaved}
                onReset={() => {
                  setSubmissionCoordinates(null);
                  setSubmissionLocationPicking(false);
                }}
              />
            </Suspense>
          )}
        </div>
      )}
      <TimelineSlider
        visible={activeModule === MODULE_IDS.TIMELINE}
        year={timelineYear}
        onYearChange={setTimelineYear}
        yearBounds={yearBounds}
      >
        <ArealDynamicsPanel
          enabled={arealDynamicsEnabled}
          onEnabledChange={handleArealDynamicsEnabledChange}
          speciesLabel={arealDynamicsSpeciesLabel}
          speciesLatin={arealDynamicsFeature?.properties?.name_latin ?? ""}
          slices={arealDynamicsSlices}
          timelineYear={timelineYear}
          onYearSelect={handleArealDynamicsYearSelect}
          onReset={handleArealDynamicsReset}
          hideOthers={arealDynamicsHideOthers}
          onHideOthersChange={handleArealDynamicsHideOthersChange}
          computing={arealDynamicsComputing}
          buildMode={arealDynamicsBuildMode}
          onBuildModeToggle={handleArealDynamicsBuildModeToggle}
          canToggleAllPoints={arealDynamicsPointCount >= 3}
        />
      </TimelineSlider>
      <AboutProject open={aboutOpen} onOpenChange={setAboutOpen} />
      <FeedbackWidget />
    </>
  );
}
