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
  getContainedPointsSummaryForWithinFeature,
  applyGbifLocationsFilter,
  reloadLocationsData,
  setClusterByRegnum,
  setClusteringEnabled,
  setClusterPieChartsEnabled,
  setDenseClustersHighlightEnabled,
  expandDensePileByKey,
  setDensePileExpandedHandler,
  setMarkersVisible,
  setHoverTooltipsEnabled,
  setMapCursorOverride,
  setToolFeaturesContext,
  showSharedPointPin,
  showSharedPointPopup,
  updateSelectedPointHighlight,
  getFilteredFeatures,
  getVisibleGbifFeatures,
  setGbifProcessingFilters,
  WITHIN_FEATURE_FILTER_KEY
} from "./components/addLocationsLayer";
import {
  buildSpeciesSummaryFromDensePile,
  listDensePiles,
  mergeDensePileLists
} from "./components/densePiles";
import DenseClustersPanel from "./components/DenseClustersPanel";
import {
  addHeatmapLayer,
  setHeatmapEnabled,
  updateHeatmapData
} from "./components/addHeatmapLayer";
import {
  addBoundsLayers,
  clearBoundsLayerCache,
  ensureBoundsLayerGeoJSON,
  flyToBoundsFeature,
  getBoundsContainedPointsSummary,
  getBoundsContainedSpeciesSummary,
  getBoundsFeatureAtClick,
  getBoundsFeatureVisibilityKey,
  getCachedBoundsLayerGeoJSON,
  hideBoundsFeaturePopup,
  showBoundsFeaturePopup,
  syncBoundsFeaturesVisibility
} from "./components/addBoundsLayers";
import OoptPanel from "./components/OoptPanel";
import OoptFeaturePanel from "./components/OoptFeaturePanel";
import BoundsSpeciesListPopup from "./components/BoundsSpeciesListPopup";
import { getBoundsFeatureHeadingParts } from "./components/boundsPropertyLabels";
import { isFirebaseConfigured } from "./firebase/config";
import {
  BOUNDS_LAYER_DEFINITIONS,
  buildBoundsCatalogFromGeoJSON,
  getBoundsFeatureKey,
  getBoundsLayerDefinition
} from "./firebase/boundsCollectionFirestore";
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
  addYandexBasemapLayer,
  setYandexBasemapEnabled
} from "./components/addYandexBasemapLayer";
import { BASEMAP_MODES } from "./config/basemapOptions";
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
  getToolWithinFeature,
  getOoptWithinFeature,
  isOoptPointsFilterActive,
  resolveToolPointsFilterModule
} from "./components/getToolWithinFeature";
import {
  createDefaultToolPointsFilterState,
  loadToolPointsFilterState,
  saveToolPointsFilterState
} from "./toolPointsFilterStorage";
import { collectActiveMapFilters, MAP_FILTER_IDS } from "./mapActiveFilters";
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
import BasemapPicker from "./components/BasemapPicker";
import YearFilterPanel from "./components/YearFilterPanel";
import TimelineSlider from "./components/TimelineSlider";
import ArealDynamicsPanel from "./components/ArealDynamicsPanel";
import AboutProject from "./components/AboutProject";
import MapCornerControls from "./components/MapCornerControls";
import PanelTaskbar from "./components/PanelTaskbar";
import { PANEL_TASKBAR_MODULE_ID, TASKBAR_PANEL_IDS } from "./panelTaskbarRegistry";
import { addGbifLayer, setGbifVisibility, setGbifClusteringEnabled, setGbifClusterByRegnum, setGbifClusterPieChartsEnabled, setGbifDenseClustersHighlightEnabled, expandGbifDensePileByKey, setGbifDensePileExpandedHandler } from "./components/addGbifLayer";
import { hydrateGbifStoreFromPersistence } from "./gbif/gbifPersistence";
import { findGbifFeatureByKey } from "./gbif/gbifStore";
import {
  createDefaultGbifProcessingFilters
} from "./gbif/gbifProcessingFilters";
import {
  clearRussianNameChoice,
  lookupRussianNameCandidates,
  saveRussianNameChoice
} from "./names/russianNameResolver";
import GbifPanel from "./components/GbifPanel";
import GbifProcessingPanel from "./components/GbifProcessingPanel";
import ModuleMenu, { MODULE_IDS } from "./components/ModuleMenu";
import { getYearBounds } from "./components/yearBounds";
import { GET_LOCATION_CURSOR } from "./mapCursors";
import { ReactComponent as YandexLogo } from "./images/yndex_logo_ru.svg";
import "./styles/mapToolsTheme.css";
import "./MapView.css";

const UserSubmissionPanel = lazy(() => import("./components/UserSubmissionPanel"));

const PANEL_IDS = {
  FEATURE: "feature",
  AREAL: "areal",
  STATUS: "status",
  MAP: "map",
  DENSE: "dense",
  YEAR: "year",
  POLYGON: "polygon",
  BUFFER: "buffer",
  AREA: "area",
  OOPT: "oopt",
  OOPT_FEATURE: "oopt-feature",
  SUBMIT: "submit",
  GBIF: "gbif",
  GBIF_PROCESSING: "gbif-processing"
};

const DEFAULT_CLUSTERING_ENABLED = true;
const DEFAULT_CLUSTER_BY_REGNUM = true;
const DEFAULT_CLUSTER_PIE_CHARTS = false;
const DEFAULT_DENSE_CLUSTERS_HIGHLIGHT = false;
const DEFAULT_MARKERS_VISIBLE = true;

/** Панели, которые сворачиваем при развороте «Сведений о точке». */
const FEATURE_PEER_PANEL_IDS = [
  PANEL_IDS.AREAL,
  PANEL_IDS.STATUS,
  PANEL_IDS.MAP,
  PANEL_IDS.DENSE,
  PANEL_IDS.YEAR,
  PANEL_IDS.POLYGON,
  PANEL_IDS.BUFFER,
  PANEL_IDS.AREA,
  PANEL_IDS.OOPT,
  PANEL_IDS.OOPT_FEATURE,
  PANEL_IDS.SUBMIT,
  PANEL_IDS.GBIF,
  PANEL_IDS.GBIF_PROCESSING
];

function isPanelExpandedInState(collapsedState, panelId) {
  return collapsedState[panelId] !== true;
}

/** Корневой компонент карты: состояние всех инструментов/фильтров/слоёв и инициализация Mapbox. */
export default function MapView() {
  const ref = useRef(null);
  const map = useRef(null);

  const [popupData, setPopupData] = useState(null);
  const [propertyFilters, setPropertyFilters] = useState({});
  const [statusFilters, setStatusFilters] = useState([]);
  const [clusterByRegnum, setClusterByRegnumState] = useState(DEFAULT_CLUSTER_BY_REGNUM);
  const [clusteringEnabled, setClusteringEnabledState] = useState(DEFAULT_CLUSTERING_ENABLED);
  const [clusterPieCharts, setClusterPieChartsState] = useState(DEFAULT_CLUSTER_PIE_CHARTS);
  const [denseClustersHighlight, setDenseClustersHighlightState] = useState(
    DEFAULT_DENSE_CLUSTERS_HIGHLIGHT
  );
  const [denseProcessingActive, setDenseProcessingActive] = useState(false);
  const [selectedDensePileKey, setSelectedDensePileKey] = useState(null);
  const [densePileSpeciesListOpen, setDensePileSpeciesListOpen] = useState(false);
  // Инвалидация списка плотных групп при смене данных в module-store (локальные/GBIF).
  const [pointsDataRevision, setPointsDataRevision] = useState(0);
  const densePileCameraBeforeRef = useRef(null);
  const selectedDensePileKeyRef = useRef(null);
  selectedDensePileKeyRef.current = selectedDensePileKey;

  const bumpPointsDataRevision = useCallback(() => {
    setPointsDataRevision((value) => value + 1);
  }, []);
  const [markersVisible, setMarkersVisibleState] = useState(DEFAULT_MARKERS_VISIBLE);
  const [mapReady, setMapReady] = useState(false);
  const [heatmapEnabled, setHeatmapEnabledState] = useState(false);
  const [boundsFeatureVisibility, setBoundsFeatureVisibility] = useState({});
  const [boundsCatalogByLayerId, setBoundsCatalogByLayerId] = useState({});
  const [boundsLayerLoading, setBoundsLayerLoading] = useState({});
  const [boundsLayerErrors, setBoundsLayerErrors] = useState({});
  const [selectedBoundsFeature, setSelectedBoundsFeature] = useState(null);
  const [ooptFilterBoundsFeature, setOoptFilterBoundsFeature] = useState(null);
  const [toolPointsFilterEnabled, setToolPointsFilterEnabled] = useState(loadToolPointsFilterState);
  const [boundsSpeciesListOpen, setBoundsSpeciesListOpen] = useState(false);
  const [boundsSpeciesRegnumFilter, setBoundsSpeciesRegnumFilter] = useState(null);
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
  /** Высота зоны таймлайна снизу — taskbar поднимается над ним. */
  const [timelineBottomOccupyPx, setTimelineBottomOccupyPx] = useState(0);
  const yearBoundsRef = useRef(yearBounds);
  yearBoundsRef.current = yearBounds;
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
  const [basemapMode, setBasemapMode] = useState(BASEMAP_MODES.MAPBOX);
  const [dataSourceMode, setDataSourceModeState] = useState(DATA_SOURCE_MODES.ALL);
  const gbifOnly = dataSourceMode === DATA_SOURCE_MODES.GBIF;
  const prevGbifOnlyRef = useRef(gbifOnly);
  const [gbifProcessingActive, setGbifProcessingActive] = useState(false);
  const [gbifProcessingFilters, setGbifProcessingFiltersState] = useState(
    createDefaultGbifProcessingFilters
  );
  const [panelCollapsed, setPanelCollapsed] = useState({});
  /** Панели, убранные в нижнюю «панель задач» (модуль при этом остаётся активным). */
  const [panelMinimized, setPanelMinimized] = useState({});
  /** Порядок иконок в taskbar (открытая панель остаётся в ряду и подсвечивается). */
  const [panelTaskbarOrder, setPanelTaskbarOrder] = useState([]);
  /** Актуальный stashVisiblePanelsToTaskbar — вызывается из ранних колбэков. */
  const stashVisiblePanelsToTaskbarRef = useRef(() => {});
  /** Какие peer-панели свернули из‑за разворота «Сведений о точке» (для восстановления). */
  const panelsCollapsedByFeatureRef = useRef(null);
  /** Ключ выбранной ООПТ — чтобы не откатывать minimize при каждом рендере. */
  const prevSelectedBoundsFeatureKeyRef = useRef(null);
  const [submissionCoordinates, setSubmissionCoordinates] = useState(null);
  const [submissionLocationPicking, setSubmissionLocationPicking] = useState(false);
  const submissionMapPickHandlerRef = useRef(null);
  const hadFoundYearPropertyFilterRef = useRef(false);
  const previousYearFilterEnabledRef = useRef(false);
  // Параметры share-ссылки на конкретную точку разбираем один раз при монтировании.
  const pendingSharePointRef = useRef(parseSharePointParams(window.location.search));

  const isPanelCollapsed = useCallback(
    (panelId) => panelCollapsed[panelId] ?? false,
    [panelCollapsed]
  );

  const isPanelMinimized = useCallback(
    (panelId) => Boolean(panelMinimized[panelId]),
    [panelMinimized]
  );

  const handlePanelCollapsedChange = useCallback(
    (panelId) => (collapsed) => {
      setPanelCollapsed((prev) => ({ ...prev, [panelId]: collapsed }));
    },
    []
  );

  const pinPanelsToTaskbar = useCallback((panelIds) => {
    if (!panelIds?.length) {
      return;
    }

    setPanelTaskbarOrder((prev) => {
      const next = [...prev];
      let changed = false;

      panelIds.forEach((panelId) => {
        if (!next.includes(panelId)) {
          next.push(panelId);
          changed = true;
        }
      });

      return changed ? next : prev;
    });
  }, []);

  const unpinPanelsFromTaskbar = useCallback((panelIds) => {
    if (!panelIds?.length) {
      return;
    }

    const idSet = new Set(panelIds);

    setPanelTaskbarOrder((prev) => {
      const next = prev.filter((panelId) => !idSet.has(panelId));
      return next.length === prev.length ? prev : next;
    });
    setPanelMinimized((prev) => {
      const next = { ...prev };
      let changed = false;

      panelIds.forEach((panelId) => {
        if (next[panelId]) {
          next[panelId] = false;
          changed = true;
        }
      });

      return changed ? next : prev;
    });
  }, []);

  const minimizePanel = useCallback(
    (panelId) => {
      setPanelMinimized((prev) => ({ ...prev, [panelId]: true }));
      pinPanelsToTaskbar([panelId]);
    },
    [pinPanelsToTaskbar]
  );

  const restorePanel = useCallback((panelId) => {
    // Текущие видимые панели уводим в taskbar, затем поднимаем выбранную.
    stashVisiblePanelsToTaskbarRef.current(panelId);

    setPanelMinimized((prev) => ({ ...prev, [panelId]: false }));
    pinPanelsToTaskbar([panelId]);
    setPanelCollapsed((prev) => {
      if (!prev[panelId]) {
        return prev;
      }

      return { ...prev, [panelId]: false };
    });

    // Вернуть контекст модуля/режима, иначе панель останется размонтированной
    // (типичный случай: в taskbar несколько иконок от разных модулей).
    switch (panelId) {
      case TASKBAR_PANEL_IDS.DENSE:
        setDenseProcessingActive(true);
        setActiveModule(MODULE_IDS.MAP);
        break;
      case TASKBAR_PANEL_IDS.GBIF:
        setDataSourceModeState(DATA_SOURCE_MODES.GBIF);
        setActiveModule(null);
        setPanelCollapsed((prev) => ({
          ...prev,
          [PANEL_IDS.GBIF]: false,
          [PANEL_IDS.GBIF_PROCESSING]: true
        }));
        break;
      case TASKBAR_PANEL_IDS.GBIF_PROCESSING:
        setDataSourceModeState(DATA_SOURCE_MODES.GBIF);
        setGbifProcessingActive(true);
        setActiveModule(null);
        setPanelCollapsed((prev) => ({
          ...prev,
          [PANEL_IDS.GBIF]: true,
          [PANEL_IDS.GBIF_PROCESSING]: false
        }));
        break;
      case TASKBAR_PANEL_IDS.OOPT_SPECIES:
        setBoundsSpeciesListOpen(true);
        setActiveModule(MODULE_IDS.OOPT);
        break;
      case TASKBAR_PANEL_IDS.DENSE_SPECIES:
        setDenseProcessingActive(true);
        setDensePileSpeciesListOpen(true);
        setActiveModule(MODULE_IDS.MAP);
        break;
      case TASKBAR_PANEL_IDS.FEATURE:
        setActiveModule(MODULE_IDS.FEATURE);
        break;
      case TASKBAR_PANEL_IDS.MAP:
        setDenseProcessingActive(false);
        setActiveModule(MODULE_IDS.MAP);
        break;
      default: {
        const moduleId = PANEL_TASKBAR_MODULE_ID[panelId];
        if (moduleId) {
          setActiveModule(moduleId);
        }
        break;
      }
    }
  }, [pinPanelsToTaskbar]);

  const handleMinimizePanel = useCallback(
    (panelId) => () => minimizePanel(panelId),
    [minimizePanel]
  );

  const expandPanel = useCallback((panelId) => {
    setPanelCollapsed((prev) => {
      if (!prev[panelId]) {
        return prev;
      }

      return { ...prev, [panelId]: false };
    });
    setPanelMinimized((prev) => {
      if (!prev[panelId]) {
        return prev;
      }

      return { ...prev, [panelId]: false };
    });
  }, []);

  const restorePanelsCollapsedByFeature = useCallback(() => {
    const peerIds = panelsCollapsedByFeatureRef.current;
    panelsCollapsedByFeatureRef.current = null;

    if (!peerIds?.length) {
      return;
    }

    setPanelCollapsed((prev) => {
      const next = { ...prev };
      peerIds.forEach((panelId) => {
        next[panelId] = false;
      });
      return next;
    });
  }, []);

  /** Разворачивает «Сведения о точке» и сворачивает остальные открытые панели. */
  const expandFeaturePanel = useCallback(() => {
    setPanelMinimized((prev) => {
      if (!prev[PANEL_IDS.FEATURE]) {
        return prev;
      }

      return { ...prev, [PANEL_IDS.FEATURE]: false };
    });
    setPanelCollapsed((prev) => {
      const next = { ...prev, [PANEL_IDS.FEATURE]: false };

      if (!panelsCollapsedByFeatureRef.current) {
        panelsCollapsedByFeatureRef.current = FEATURE_PEER_PANEL_IDS.filter((panelId) =>
          isPanelExpandedInState(prev, panelId)
        );
      }

      FEATURE_PEER_PANEL_IDS.forEach((panelId) => {
        next[panelId] = true;
      });

      return next;
    });
  }, []);

  const handleFeaturePanelCollapsedChange = useCallback(
    (collapsed) => {
      if (collapsed) {
        setPanelCollapsed((prev) => ({ ...prev, [PANEL_IDS.FEATURE]: true }));
        restorePanelsCollapsedByFeature();
        return;
      }

      expandFeaturePanel();
    },
    [expandFeaturePanel, restorePanelsCollapsedByFeature]
  );

  // Разворачиваем обработку; если на экране «Сведения о точке» — сворачиваем её.
  const expandDenseProcessingPanel = useCallback(() => {
    const peerIds = panelsCollapsedByFeatureRef.current;
    panelsCollapsedByFeatureRef.current = null;

    setPanelMinimized((prev) => {
      if (!prev[PANEL_IDS.DENSE]) {
        return prev;
      }

      return { ...prev, [PANEL_IDS.DENSE]: false };
    });

    setPanelCollapsed((prev) => {
      const next = { ...prev, [PANEL_IDS.DENSE]: false };

      // Вернём панели, свёрнутые ради Feature (в exclusive-режиме их всё равно не видно).
      if (peerIds?.length) {
        peerIds.forEach((panelId) => {
          next[panelId] = false;
        });
      }

      if (activeModule === MODULE_IDS.FEATURE) {
        next[PANEL_IDS.FEATURE] = true;
      }

      return next;
    });
  }, [activeModule]);

  const handleDensePanelCollapsedChange = useCallback(
    (collapsed) => {
      if (collapsed) {
        setPanelCollapsed((prev) => ({ ...prev, [PANEL_IDS.DENSE]: true }));
        return;
      }

      expandDenseProcessingPanel();
    },
    [expandDenseProcessingPanel]
  );

  // Данные GBIF развёрнуты — обработку сворачиваем (не закрываем).
  const expandGbifDataPanel = useCallback(() => {
    setPanelMinimized((prev) => ({
      ...prev,
      [PANEL_IDS.GBIF]: false
    }));
    setPanelCollapsed((prev) => ({
      ...prev,
      [PANEL_IDS.GBIF]: false,
      [PANEL_IDS.GBIF_PROCESSING]: true
    }));
  }, []);

  // Обработка GBIF развёрнута — панель загрузки сворачиваем.
  const expandGbifProcessingPanel = useCallback(() => {
    setGbifProcessingActive(true);
    setPanelMinimized((prev) => ({
      ...prev,
      [PANEL_IDS.GBIF_PROCESSING]: false
    }));
    setPanelCollapsed((prev) => ({
      ...prev,
      [PANEL_IDS.GBIF]: true,
      [PANEL_IDS.GBIF_PROCESSING]: false
    }));
  }, []);

  const handleGbifPanelCollapsedChange = useCallback(
    (collapsed) => {
      if (collapsed) {
        setPanelCollapsed((prev) => ({ ...prev, [PANEL_IDS.GBIF]: true }));
        return;
      }

      expandGbifDataPanel();
    },
    [expandGbifDataPanel]
  );

  const handleGbifProcessingPanelCollapsedChange = useCallback(
    (collapsed) => {
      if (collapsed) {
        setPanelCollapsed((prev) => ({
          ...prev,
          [PANEL_IDS.GBIF_PROCESSING]: true
        }));
        return;
      }

      expandGbifProcessingPanel();
    },
    [expandGbifProcessingPanel]
  );

  useEffect(() => {
    switch (activeModule) {
      case MODULE_IDS.FEATURE:
        expandFeaturePanel();
        break;
      case MODULE_IDS.STATUS:
        expandPanel(PANEL_IDS.STATUS);
        break;
      case MODULE_IDS.MAP:
        // Dense exclusive: не вызываем expandPanel(MAP), иначе minimize сбрасывается.
        if (!denseProcessingActive) {
          expandPanel(PANEL_IDS.MAP);
        }
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
      case MODULE_IDS.OOPT:
        expandPanel(PANEL_IDS.OOPT);
        break;
      case MODULE_IDS.SUBMIT:
        expandPanel(PANEL_IDS.SUBMIT);
        break;
      case MODULE_IDS.GBIF:
        expandGbifDataPanel();
        break;
      default:
        break;
    }
  }, [
    activeModule,
    denseProcessingActive,
    expandPanel,
    expandGbifDataPanel,
    expandFeaturePanel
  ]);

  // Docked радиус/буфер — только когда «Сведения» свёрнуты.
  useEffect(() => {
    if (activeModule !== MODULE_IDS.FEATURE) {
      return;
    }

    if (!isPanelCollapsed(PANEL_IDS.FEATURE)) {
      return;
    }

    if (arealDockedWithFeature) {
      expandPanel(PANEL_IDS.AREAL);
    }

    if (bufferDockedWithFeature) {
      expandPanel(PANEL_IDS.BUFFER);
    }
  }, [
    activeModule,
    arealDockedWithFeature,
    bufferDockedWithFeature,
    expandPanel,
    isPanelCollapsed,
    panelCollapsed
  ]);

  // Ушли со «Сведений о точке» — вернуть панели, свёрнутые ради неё.
  useEffect(() => {
    if (activeModule === MODULE_IDS.FEATURE) {
      return;
    }

    restorePanelsCollapsedByFeature();
  }, [activeModule, restorePanelsCollapsedByFeature]);

  const handleOpenBoundsFeatureDetails = useCallback(() => {
    expandPanel(PANEL_IDS.OOPT_FEATURE);
  }, [expandPanel]);
  // Ref-копия колбэка: обработчики карты (созданные один раз) должны видеть
  // его актуальную версию, не пересоздавая при этом подписки на карте.
  const openBoundsFeatureDetailsRef = useRef(handleOpenBoundsFeatureDetails);
  openBoundsFeatureDetailsRef.current = handleOpenBoundsFeatureDetails;

  // Состояние «изоляции» одного объекта ООПТ (скрыть остальные), чтобы можно
  // было вернуть прежнюю видимость слоёв при повторном клике.
  const boundsIsolationRef = useRef({
    active: false,
    featureKey: null,
    previousVisibility: {}
  });

  const clearBoundsIsolation = useCallback(() => {
    boundsIsolationRef.current = {
      active: false,
      featureKey: null,
      previousVisibility: {}
    };
  }, []);

  const isBoundsFeatureIsolated = useCallback((featureKey) => {
    const isolation = boundsIsolationRef.current;
    return isolation.active && isolation.featureKey === featureKey;
  }, []);
  const isBoundsFeatureIsolatedRef = useRef(isBoundsFeatureIsolated);
  isBoundsFeatureIsolatedRef.current = isBoundsFeatureIsolated;

  const handleBoundsFeatureVisibilityChange = useCallback((featureKey, visible) => {
    clearBoundsIsolation();
    setBoundsFeatureVisibility((prev) => {
      const next = { ...prev };

      if (visible) {
        next[featureKey] = true;
      } else {
        delete next[featureKey];
      }

      return next;
    });
  }, [clearBoundsIsolation]);

  const handleBoundsGroupVisibilityChange = useCallback((_layerId, featureKeys, visible) => {
    clearBoundsIsolation();
    setBoundsFeatureVisibility((prev) => {
      const next = { ...prev };

      featureKeys.forEach((featureKey) => {
        if (visible) {
          next[featureKey] = true;
        } else {
          delete next[featureKey];
        }
      });

      return next;
    });
  }, [clearBoundsIsolation]);

  // Переключает изоляцию объекта ООПТ: первый клик прячет остальные объекты,
  // повторный клик по тому же объекту или изоляция другого — возвращает исходную видимость.
  const handleIsolateBoundsFeature = useCallback((hit) => {
    const featureKey = getBoundsFeatureVisibilityKey(hit);

    if (!featureKey) {
      return false;
    }

    const isolation = boundsIsolationRef.current;

    if (isolation.active && isolation.featureKey === featureKey) {
      setBoundsFeatureVisibility(isolation.previousVisibility);
      clearBoundsIsolation();
      return false;
    }

    if (isolation.active) {
      setBoundsFeatureVisibility({ [featureKey]: true });
      boundsIsolationRef.current = {
        ...isolation,
        featureKey
      };
      return true;
    }

    setBoundsFeatureVisibility((prev) => {
      boundsIsolationRef.current = {
        active: true,
        featureKey,
        previousVisibility: prev
      };

      // Ключи, отсутствующие в объекте, уже считаются невидимыми (см. getVisibleDocIdsForLayer),
      // поэтому достаточно оставить в состоянии только выбранный объект.
      return { [featureKey]: true };
    });
    return true;
  }, [clearBoundsIsolation]);
  const isolateBoundsFeatureRef = useRef(handleIsolateBoundsFeature);
  isolateBoundsFeatureRef.current = handleIsolateBoundsFeature;

  const handleBoundsFeatureSelect = useCallback((entry, { ensureVisible = true, flyTo = true } = {}) => {
    const geojson = getCachedBoundsLayerGeoJSON(entry.layerId);
    const definition = getBoundsLayerDefinition(entry.layerId);

    if (!geojson || !definition) {
      return;
    }

    const feature = geojson.features[entry.featureIndex];

    if (!feature) {
      return;
    }

    if (ensureVisible) {
      setBoundsFeatureVisibility((prev) =>
        prev[entry.key] ? prev : { ...prev, [entry.key]: true }
      );
    }

    setPopupData(null);
    updateSelectedPointHighlight(map.current, null);
    setSelectedBoundsFeature({ definition, feature });
    setActiveModule(MODULE_IDS.OOPT);

    if (flyTo && map.current) {
      flyToBoundsFeature(map.current, feature, { definition, feature }, {
        onOpenDetails: handleOpenBoundsFeatureDetails,
        onIsolate: handleIsolateBoundsFeature,
        isIsolated: isBoundsFeatureIsolated(entry.key),
        filters: boundsFilterBaseRef.current()
      });
    }
  }, [handleOpenBoundsFeatureDetails, handleIsolateBoundsFeature, isBoundsFeatureIsolated]);

  const handleBoundsFeatureSpeciesListOpen = useCallback(
    (entry) => {
      const selectedKey = selectedBoundsFeature
        ? getBoundsFeatureKey(
            selectedBoundsFeature.definition?.id,
            selectedBoundsFeature.feature?.properties ?? {}
          )
        : null;

      if (boundsSpeciesListOpen && selectedKey === entry.key) {
        setBoundsSpeciesListOpen(false);
        setBoundsSpeciesRegnumFilter(null);
        return;
      }

      setBoundsSpeciesRegnumFilter(null);
      // Без flyTo: иначе fitBounds + setFilter одновременно валят queryRenderedFeatures.
      handleBoundsFeatureSelect(entry, { ensureVisible: false, flyTo: false });

      // Сразу ограничиваем точки полигоном («Только эти»), чтобы список и карта
      // показывали только виды/находки внутри выбранной ООПТ.
      setToolPointsFilterEnabled((current) => ({
        ...current,
        [MODULE_IDS.OOPT]: true
      }));
      setPanelMinimized((prev) => ({
        ...prev,
        [TASKBAR_PANEL_IDS.OOPT_SPECIES]: false
      }));
      setBoundsSpeciesListOpen(true);
    },
    [boundsSpeciesListOpen, handleBoundsFeatureSelect, selectedBoundsFeature]
  );

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

    const selectModule = (nextModuleId) => {
      setActiveModule((current) => {
        if (current !== nextModuleId) {
          stashVisiblePanelsToTaskbarRef.current(nextModuleId);
          return nextModuleId;
        }

        // Пока включён фильтр точек по ООПТ, панель ООПТ не закрываем —
        // только при выборе другого инструмента.
        if (
          nextModuleId === MODULE_IDS.OOPT &&
          toolPointsFilterEnabled[MODULE_IDS.OOPT]
        ) {
          return current;
        }

        return null;
      });
    };

    if (moduleId === MODULE_IDS.AREAL) {
      // Из меню «Радиус» открывается отдельно — панель точки не остаётся в стеке.
      setArealDockedWithFeature(false);
      selectModule(moduleId);
      return;
    }

    if (moduleId === MODULE_IDS.BUFFER) {
      // Из меню «Буфер» открывается отдельно — панель точки не остаётся в стеке.
      setBufferDockedWithFeature(false);
      selectModule(moduleId);
      return;
    }

    if (moduleId === MODULE_IDS.AREA) {
      // Из меню «Область» открывается отдельно — панель точки не остаётся в стеке.
      setArealDockedWithFeature(false);
      setBufferDockedWithFeature(false);
      selectModule(moduleId);
      return;
    }

    setArealDockedWithFeature(false);
    setBufferDockedWithFeature(false);
    selectModule(moduleId);
  }, [isArealApplied, isBufferApplied, toolPointsFilterEnabled]);

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

  const handleDataSourceModeChange = useCallback(
    (mode) => {
      setDataSourceModeState(mode);

      if (mode === DATA_SOURCE_MODES.GBIF) {
        stashVisiblePanelsToTaskbarRef.current(PANEL_IDS.GBIF);
        setArealDockedWithFeature(false);
        setBufferDockedWithFeature(false);
        setActiveModule(null);
        expandGbifDataPanel();
      } else {
        setGbifProcessingActive(false);
      }
    },
    [expandGbifDataPanel]
  );

  const syncYearBounds = useCallback(() => {
    const bounds = getYearBounds();
    const prevBounds = yearBoundsRef.current;

    setYearBounds(bounds);
    setYearRange((prevRange) => {
      const wasFull =
        prevRange.min === prevBounds.min && prevRange.max === prevBounds.max;
      const wasDegenerate = prevRange.min >= prevRange.max;
      if (wasFull || wasDegenerate) {
        return bounds;
      }

      const min = Math.min(Math.max(prevRange.min, bounds.min), bounds.max);
      const max = Math.max(Math.min(prevRange.max, bounds.max), bounds.min);
      return min <= max ? { min, max } : bounds;
    });
    setTimelineYear((prev) => Math.min(bounds.max, Math.max(bounds.min, prev)));
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

    // Пока пользователь выбирает точку на карте для новой находки, курсор меняется на специальный.
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

  // Снимок актуального состояния в ref: колбэки ниже создаются с пустыми
  // зависимостями (стабильная ссылка для подписок на карту), но должны читать
  // свежие значения state на момент вызова, а не значения из замыкания.
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
    activeModule,
    ooptPointsFilterEnabled: Boolean(toolPointsFilterEnabled[MODULE_IDS.OOPT])
  };

  const submissionStateRef = useRef({});
  submissionStateRef.current = {
    active: activeModule === MODULE_IDS.SUBMIT,
    pickingLocation: submissionLocationPicking,
    setCoordinates: (coords) => {
      if (submissionMapPickHandlerRef.current) {
        const handler = submissionMapPickHandlerRef.current;
        submissionMapPickHandlerRef.current = null;
        handler([
          Number(coords[0].toFixed(3)),
          Number(coords[1].toFixed(3))
        ]);
        setSubmissionLocationPicking(false);
        return;
      }

      setSubmissionCoordinates([
        Number(coords[0].toFixed(3)),
        Number(coords[1].toFixed(3))
      ]);
      setSubmissionLocationPicking(false);
    }
  };

  const expandedLeavesRef = useRef(null);
  const activeModuleRef = useRef(activeModule);
  activeModuleRef.current = activeModule;
  const boundsFilterBaseRef = useRef(() => ({}));

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

  const baseLocationFilters = useMemo(() => {
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

  boundsFilterBaseRef.current = () => baseLocationFilters;

  const activeToolFilterModule = useMemo(
    () =>
      resolveToolPointsFilterModule(activeModule, {
        arealDockedWithFeature,
        bufferDockedWithFeature
      }),
    [activeModule, arealDockedWithFeature, bufferDockedWithFeature]
  );

  const bufferFilterFeatures = useMemo(() => {
    if (bufferSelectedPoints.length > 0) {
      return bufferSelectedPoints;
    }

    return popupData ? [popupData] : [];
  }, [bufferSelectedPoints, popupData]);

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

  const activeToolWithinFeature = useMemo(() => {
    const mapInstance = mapReady ? map.current : null;

    return getToolWithinFeature({
      moduleId: activeToolFilterModule,
      map: mapInstance,
      baseFilters: baseLocationFilters,
      arealEnabled,
      arealAllMarkers,
      arealRadius,
      arealCenterFeature: popupData,
      bufferEnabled,
      bufferFeatures: bufferFilterFeatures,
      bufferRadiiKm: bufferRadii,
      visibleBuiltPolygons,
      activePolygon,
      intersectionResult,
      areaGeometry,
      selectedBoundsFeature
    });
  }, [
    activeToolFilterModule,
    baseLocationFilters,
    arealEnabled,
    arealAllMarkers,
    arealRadius,
    popupData,
    bufferEnabled,
    bufferFilterFeatures,
    bufferRadii,
    visibleBuiltPolygons,
    activePolygon,
    intersectionResult,
    areaGeometry,
    selectedBoundsFeature,
    mapReady
  ]);

  const ooptFilterTarget = useMemo(() => {
    if (!toolPointsFilterEnabled[MODULE_IDS.OOPT]) {
      return selectedBoundsFeature;
    }

    return ooptFilterBoundsFeature ?? selectedBoundsFeature;
  }, [toolPointsFilterEnabled, ooptFilterBoundsFeature, selectedBoundsFeature]);

  const ooptWithinFeature = useMemo(
    () => getOoptWithinFeature(ooptFilterTarget),
    [ooptFilterTarget]
  );

  const ooptPointsFilterActive = useMemo(
    () => isOoptPointsFilterActive(toolPointsFilterEnabled, ooptFilterTarget),
    [toolPointsFilterEnabled, ooptFilterTarget]
  );

  /** Какие панели сейчас реально на экране (не в taskbar). */
  const collectVisiblePanelIds = useCallback(() => {
    const ids = [];
    const isMin = (panelId) => Boolean(panelMinimized[panelId]);

    if (denseProcessingActive) {
      if (!isMin(PANEL_IDS.DENSE)) {
        ids.push(PANEL_IDS.DENSE);
      }

      if (activeModule === MODULE_IDS.FEATURE && !isMin(PANEL_IDS.FEATURE)) {
        ids.push(PANEL_IDS.FEATURE);
      }

      if (
        densePileSpeciesListOpen &&
        !isMin(TASKBAR_PANEL_IDS.DENSE_SPECIES)
      ) {
        ids.push(TASKBAR_PANEL_IDS.DENSE_SPECIES);
      }

      return ids;
    }

    if (activeModule === MODULE_IDS.FEATURE && !isMin(PANEL_IDS.FEATURE)) {
      ids.push(PANEL_IDS.FEATURE);
    }

    if (
      (activeModule === MODULE_IDS.AREAL ||
        (activeModule === MODULE_IDS.FEATURE && arealDockedWithFeature)) &&
      !isMin(PANEL_IDS.AREAL)
    ) {
      ids.push(PANEL_IDS.AREAL);
    }

    if (activeModule === MODULE_IDS.STATUS && !isMin(PANEL_IDS.STATUS)) {
      ids.push(PANEL_IDS.STATUS);
    }

    if (activeModule === MODULE_IDS.MAP && !isMin(PANEL_IDS.MAP)) {
      ids.push(PANEL_IDS.MAP);
    }

    if (activeModule === MODULE_IDS.YEAR && !isMin(PANEL_IDS.YEAR)) {
      ids.push(PANEL_IDS.YEAR);
    }

    if (activeModule === MODULE_IDS.POLYGON && !isMin(PANEL_IDS.POLYGON)) {
      ids.push(PANEL_IDS.POLYGON);
    }

    if (
      (activeModule === MODULE_IDS.BUFFER ||
        (activeModule === MODULE_IDS.FEATURE && bufferDockedWithFeature)) &&
      !isMin(PANEL_IDS.BUFFER)
    ) {
      ids.push(PANEL_IDS.BUFFER);
    }

    if (activeModule === MODULE_IDS.AREA && !isMin(PANEL_IDS.AREA)) {
      ids.push(PANEL_IDS.AREA);
    }

    if (activeModule === MODULE_IDS.OOPT && !isMin(PANEL_IDS.OOPT)) {
      ids.push(PANEL_IDS.OOPT);
    }

    if (activeModule === MODULE_IDS.SUBMIT && !isMin(PANEL_IDS.SUBMIT)) {
      ids.push(PANEL_IDS.SUBMIT);
    }

    if (
      selectedBoundsFeature &&
      (activeModule === MODULE_IDS.OOPT || ooptPointsFilterActive) &&
      !isMin(PANEL_IDS.OOPT_FEATURE)
    ) {
      ids.push(PANEL_IDS.OOPT_FEATURE);
    }

    if (
      boundsSpeciesListOpen &&
      selectedBoundsFeature &&
      (activeModule === MODULE_IDS.OOPT || ooptPointsFilterActive) &&
      !isMin(TASKBAR_PANEL_IDS.OOPT_SPECIES)
    ) {
      ids.push(TASKBAR_PANEL_IDS.OOPT_SPECIES);
    }

    if (dataSourceMode === DATA_SOURCE_MODES.GBIF) {
      if (!isMin(PANEL_IDS.GBIF)) {
        ids.push(PANEL_IDS.GBIF);
      }

      if (gbifProcessingActive && !isMin(PANEL_IDS.GBIF_PROCESSING)) {
        ids.push(PANEL_IDS.GBIF_PROCESSING);
      }
    }

    return ids;
  }, [
    activeModule,
    arealDockedWithFeature,
    boundsSpeciesListOpen,
    bufferDockedWithFeature,
    dataSourceMode,
    densePileSpeciesListOpen,
    denseProcessingActive,
    gbifProcessingActive,
    ooptPointsFilterActive,
    panelMinimized,
    selectedBoundsFeature
  ]);

  /** Уводим все видимые панели в taskbar, кроме exceptPanelId. */
  const stashVisiblePanelsToTaskbar = useCallback(
    (exceptPanelId = null) => {
      const visibleIds = collectVisiblePanelIds().filter(
        (panelId) => panelId !== exceptPanelId
      );

      if (visibleIds.length === 0) {
        return;
      }

      setPanelMinimized((prev) => {
        const next = { ...prev };
        let changed = false;

        visibleIds.forEach((panelId) => {
          if (!next[panelId]) {
            next[panelId] = true;
            changed = true;
          }
        });

        return changed ? next : prev;
      });
      pinPanelsToTaskbar(visibleIds);
    },
    [collectVisiblePanelIds, pinPanelsToTaskbar]
  );

  stashVisiblePanelsToTaskbarRef.current = stashVisiblePanelsToTaskbar;

  const activeTaskbarPanelIds = useMemo(() => {
    const visibleIds = new Set(collectVisiblePanelIds());
    return panelTaskbarOrder.filter((panelId) => visibleIds.has(panelId));
  }, [collectVisiblePanelIds, panelTaskbarOrder]);

  const handleTaskbarPanelClick = useCallback(
    (panelId) => {
      if (collectVisiblePanelIds().includes(panelId)) {
        minimizePanel(panelId);
        return;
      }

      restorePanel(panelId);
    },
    [collectVisiblePanelIds, minimizePanel, restorePanel]
  );

  const effectiveWithinFeature = useMemo(() => {
    if (ooptPointsFilterActive && ooptWithinFeature) {
      return ooptWithinFeature;
    }

    return null;
  }, [ooptPointsFilterActive, ooptWithinFeature]);

  const locationFilters = useMemo(() => {
    const filters = { ...baseLocationFilters };

    if (effectiveWithinFeature) {
      filters[WITHIN_FEATURE_FILTER_KEY] = effectiveWithinFeature;
    }

    if (boundsSpeciesRegnumFilter !== null) {
      const enabledRegnums = boundsSpeciesRegnumFilter;

      if (enabledRegnums.length === 0) {
        filters.regnum = ["__none__"];
      } else if (filters.regnum != null) {
        const existing = Array.isArray(filters.regnum) ? filters.regnum : [filters.regnum];
        const intersected = enabledRegnums.filter((regnum) => existing.includes(regnum));
        filters.regnum = intersected.length > 0 ? intersected : ["__none__"];
      } else {
        filters.regnum = enabledRegnums;
      }
    }

    return filters;
  }, [baseLocationFilters, boundsSpeciesRegnumFilter, effectiveWithinFeature]);

  const densePilesStats = useMemo(() => {
    if (!mapReady) {
      return { piles: [], pileCount: 0, pointCount: 0 };
    }

    // Читаем revision и processing-фильтры: getVisibleGbifFeatures берёт их из module-store.
    void pointsDataRevision;
    void gbifProcessingFilters;

    const localFeatures = getFilteredFeatures(locationFilters);
    const gbifFeatures = getVisibleGbifFeatures(locationFilters);
    // Считаем кучи отдельно по источникам, затем сливаем по координатам —
    // иначе 5 локальных + 5 GBIF дадут «группу из 10», которой нет на карте.
    const piles = mergeDensePileLists([
      listDensePiles(localFeatures),
      listDensePiles(gbifFeatures)
    ]);
    const pileCount = piles.length;
    const pointCount = piles.reduce((sum, pile) => sum + pile.pointCount, 0);

    return { piles, pileCount, pointCount };
  }, [locationFilters, pointsDataRevision, mapReady, gbifProcessingFilters]);

  const selectedDensePile = useMemo(
    () => densePilesStats.piles.find((pile) => pile.key === selectedDensePileKey) ?? null,
    [densePilesStats.piles, selectedDensePileKey]
  );

  useEffect(() => {
    // Фильтры/данные изменились — выделенная группа исчезла из списка.
    if (selectedDensePileKey && !selectedDensePile) {
      setSelectedDensePileKey(null);
      setDensePileSpeciesListOpen(false);
    }
  }, [selectedDensePileKey, selectedDensePile]);

  const densePileSpeciesSummary = useMemo(
    () => buildSpeciesSummaryFromDensePile(selectedDensePile),
    [selectedDensePile]
  );

  const densePileSpeciesTerritoryHeading = useMemo(() => {
    const coordinates = selectedDensePile?.coordinates;
    if (!Array.isArray(coordinates) || coordinates.length < 2) {
      return null;
    }

    const [lng, lat] = coordinates;
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
      return null;
    }

    return {
      category: "Координаты",
      title: `${lat.toFixed(3)}, ${lng.toFixed(3)}`
    };
  }, [selectedDensePile]);

  const handleDensePileExpanded = useCallback(({ key, coordinates = null, pointCount = null }) => {
    if (!key || !map.current) {
      return;
    }

    // Сохраняем камеру до первого зума к группе — кнопка лупы вернёт к ней.
    if (!selectedDensePileKeyRef.current && !densePileCameraBeforeRef.current) {
      const center = map.current.getCenter();
      densePileCameraBeforeRef.current = {
        center: [center.lng, center.lat],
        zoom: map.current.getZoom(),
        bearing: map.current.getBearing(),
        pitch: map.current.getPitch()
      };
    }

    // Клик по куче на одном слое должен раскрыть ту же координату и на другом.
    expandDensePileByKey(map.current, key, {
      coordinates,
      pointCount,
      animateCamera: false,
      notify: false
    });
    expandGbifDensePileByKey(map.current, key, {
      coordinates,
      pointCount,
      animateCamera: false,
      notify: false
    });

    setSelectedDensePileKey(key);

    // Клик по плотной группе на карте открывает панель обработки, если она скрыта.
    setMarkersVisibleState(true);
    setDenseClustersHighlightState(true);
    setDenseProcessingActive(true);
    setActiveModule(MODULE_IDS.MAP);
    expandDenseProcessingPanel();
  }, [expandDenseProcessingPanel]);

  useEffect(() => {
    setDensePileExpandedHandler(handleDensePileExpanded);
    setGbifDensePileExpandedHandler(handleDensePileExpanded);

    return () => {
      setDensePileExpandedHandler(null);
      setGbifDensePileExpandedHandler(null);
    };
  }, [handleDensePileExpanded]);

  const handleDensePileSelect = useCallback((pile) => {
    if (!map.current || !pile?.key) {
      return;
    }

    expandDensePileByKey(map.current, pile.key, {
      coordinates: pile.coordinates,
      pointCount: pile.pointCount,
      animateCamera: true,
      notify: true
    });
    expandGbifDensePileByKey(map.current, pile.key, {
      coordinates: pile.coordinates,
      pointCount: pile.pointCount,
      animateCamera: false,
      notify: false
    });
  }, []);

  const handleDensePileZoomBack = useCallback(() => {
    const previous = densePileCameraBeforeRef.current;
    if (map.current && previous) {
      map.current.easeTo({
        ...previous,
        duration: 900
      });
    }

    densePileCameraBeforeRef.current = null;
    setSelectedDensePileKey(null);
    setDensePileSpeciesListOpen(false);
  }, []);

  const handleDensePileSpeciesListToggle = useCallback((pile) => {
    if (!pile?.key) {
      return;
    }

    if (selectedDensePileKeyRef.current !== pile.key) {
      handleDensePileSelect(pile);
      setPanelMinimized((prev) => ({
        ...prev,
        [TASKBAR_PANEL_IDS.DENSE_SPECIES]: false
      }));
      setDensePileSpeciesListOpen(true);
      return;
    }

    setDensePileSpeciesListOpen((open) => {
      if (!open) {
        setPanelMinimized((prev) => ({
          ...prev,
          [TASKBAR_PANEL_IDS.DENSE_SPECIES]: false
        }));
      }

      return !open;
    });
  }, [handleDensePileSelect]);

  const handleDensePileSpeciesListClose = useCallback(() => {
    setDensePileSpeciesListOpen(false);
    unpinPanelsFromTaskbar([TASKBAR_PANEL_IDS.DENSE_SPECIES]);
  }, [unpinPanelsFromTaskbar]);

  const handleDensePileSpeciesSelect = useCallback((feature) => {
    const mapInstance = map.current;

    if (!mapInstance || !feature) {
      return;
    }

    panToArealPoint(mapInstance, feature);
    setPopupData(feature);
    setActiveModule(MODULE_IDS.FEATURE);
    expandFeaturePanel();
  }, [expandFeaturePanel]);

  useEffect(() => {
    if (!selectedDensePileKey) {
      setDensePileSpeciesListOpen(false);
    }
  }, [selectedDensePileKey]);

  useEffect(() => {
    // MAP — обычный режим обработки; FEATURE — просмотр точки из списка видов.
    // null (клик по карте) не закрывает обработку.
    if (
      denseProcessingActive &&
      activeModule != null &&
      activeModule !== MODULE_IDS.MAP &&
      activeModule !== MODULE_IDS.FEATURE
    ) {
      // Перед выключением exclusive-режима уводим панели в taskbar —
      // иначе cleanup/размонтирование просто уничтожит их без иконки.
      const denseTaskbarIds = [PANEL_IDS.DENSE];
      if (densePileSpeciesListOpen) {
        denseTaskbarIds.push(TASKBAR_PANEL_IDS.DENSE_SPECIES);
      }
      setPanelMinimized((prev) => ({
        ...prev,
        [PANEL_IDS.DENSE]: true,
        ...(densePileSpeciesListOpen
          ? { [TASKBAR_PANEL_IDS.DENSE_SPECIES]: true }
          : {})
      }));
      pinPanelsToTaskbar(denseTaskbarIds);
      setDenseProcessingActive(false);
      setSelectedDensePileKey(null);
      setDensePileSpeciesListOpen(false);
      densePileCameraBeforeRef.current = null;
    }
  }, [activeModule, denseProcessingActive, densePileSpeciesListOpen, pinPanelsToTaskbar]);

  const handleLookupRussianName = useCallback(async (feature, { force = false } = {}) => {
    const nameLatin = feature?.properties?.name_latin;
    if (!nameLatin) {
      return { candidates: [], cached: false };
    }

    return lookupRussianNameCandidates({
      nameLatin,
      speciesKey: feature?.properties?.species_key ?? null,
      force
    });
  }, []);

  const handleApplyRussianName = useCallback(async (feature, choice) => {
    const nameLatin = feature?.properties?.name_latin;
    const gbifKey = feature?.properties?.gbif_key;
    if (!nameLatin || !choice?.nameRu) {
      return;
    }

    await saveRussianNameChoice(nameLatin, {
      nameRu: choice.nameRu,
      source: choice.source
    });

    if (map.current) {
      applyGbifLocationsFilter(map.current, locationFilters);
    }

    bumpPointsDataRevision();

    const fromStore =
      gbifKey != null ? findGbifFeatureByKey(gbifKey) : null;
    const baseFeature = fromStore ?? feature;

    // Всегда новый объект с выбранным name_ru — иначе React может не перерисовать
    // панель, если enrich вернул ту же ссылку без изменений.
    setPopupData({
      ...baseFeature,
      properties: {
        ...baseFeature.properties,
        name_ru: choice.nameRu
      }
    });
  }, [locationFilters, bumpPointsDataRevision]);

  const handleClearRussianName = useCallback(async (feature) => {
    const nameLatin = feature?.properties?.name_latin;
    const gbifKey = feature?.properties?.gbif_key;
    if (!nameLatin) {
      return;
    }

    await clearRussianNameChoice(nameLatin);

    if (map.current) {
      applyGbifLocationsFilter(map.current, locationFilters);
    }

    bumpPointsDataRevision();

    const fromStore =
      gbifKey != null ? findGbifFeatureByKey(gbifKey) : null;
    const baseFeature = fromStore ?? feature;

    setPopupData({
      ...baseFeature,
      properties: {
        ...baseFeature.properties,
        name_ru: null
      }
    });
  }, [locationFilters, bumpPointsDataRevision]);

  const handleUserFindingSaved = useCallback(() => {
    const mapInstance = map.current;
    if (!mapInstance || !mapReady) {
      return;
    }

    syncYearBounds();
    reloadLocationsData(mapInstance);
    updateHeatmapData(mapInstance, locationFilters);
    clearArealDynamicsSliceCache();
    bumpPointsDataRevision();
  }, [locationFilters, mapReady, syncYearBounds, bumpPointsDataRevision]);

  const handleSubmissionCoordinatesReset = useCallback(() => {
    setSubmissionCoordinates(null);
    setSubmissionLocationPicking(false);
  }, []);

  const areaContainedPoints = useMemo(() => {
    if (!areaGeometry || !mapReady) {
      return null;
    }

    return getAreaContainedPointsSummary(areaGeometry, locationFilters);
  }, [areaGeometry, locationFilters, mapReady]);

  const boundsContainedSpecies = useMemo(() => {
    if (!selectedBoundsFeature?.feature || !mapReady) {
      return null;
    }

    return getBoundsContainedSpeciesSummary(
      selectedBoundsFeature.feature,
      baseLocationFilters
    );
  }, [selectedBoundsFeature, baseLocationFilters, mapReady]);

  const boundsContainedPoints = useMemo(() => {
    if (!selectedBoundsFeature?.feature || !mapReady) {
      return null;
    }

    return getBoundsContainedPointsSummary(
      selectedBoundsFeature.feature,
      baseLocationFilters
    );
  }, [selectedBoundsFeature, baseLocationFilters, mapReady]);

  const toolPointsFilterActive = Boolean(effectiveWithinFeature);

  const mapMarkersVisible = markersVisible || toolPointsFilterActive;

  const activeToolFilterPointsSummary = useMemo(() => {
    if (!activeToolWithinFeature || !mapReady) {
      return null;
    }

    return getContainedPointsSummaryForWithinFeature(
      activeToolWithinFeature,
      baseLocationFilters
    );
  }, [activeToolWithinFeature, baseLocationFilters, mapReady]);

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
      locationFilters
    );
  }, [visibleBuiltPolygons, activePolygon, locationFilters, mapReady]);

  const intersectionContainedPoints = useMemo(() => {
    if (!intersectionResult?.hasIntersection || !intersectionResult.feature || !mapReady) {
      return null;
    }

    return getPolygonIntersectionContainedSummary(
      intersectionResult.feature,
      locationFilters,
      [
        intersectionResult.speciesA?.nameLatin,
        intersectionResult.speciesB?.nameLatin
      ]
    );
  }, [intersectionResult, locationFilters, mapReady]);

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

    const filters = locationFilters;

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
    locationFilters,
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

    applyLocationsFilter(map.current, locationFilters);
  }, [locationFilters]);

  useEffect(() => {
    if (!map.current || !mapReady) {
      return;
    }

    // Только смена processing-фильтров. locationFilters уже обновляет GBIF
    // через applyLocationsFilter — без второго applyGbifLocationsFilter.
    setGbifProcessingFilters(map.current, gbifProcessingFilters);
    updateHeatmapData(map.current, locationFilters);
    refreshAreal();
    // locationFilters читаем для heatmap/areal; не ставим в deps — иначе двойной apply GBIF.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- см. комментарий выше
  }, [gbifProcessingFilters, mapReady, refreshAreal]);

  const handleGbifProcessingFiltersChange = useCallback((nextFilters) => {
    setGbifProcessingFiltersState({
      ...createDefaultGbifProcessingFilters(),
      ...nextFilters
    });
  }, []);

  const handleGbifProcessingFiltersReset = useCallback(() => {
    setGbifProcessingFiltersState(createDefaultGbifProcessingFilters());
  }, []);

  const handleOpenGbifProcessing = useCallback(() => {
    // Обработка открывается поверх панели загрузки — её уводим в taskbar.
    stashVisiblePanelsToTaskbarRef.current(PANEL_IDS.GBIF_PROCESSING);
    expandGbifProcessingPanel();
  }, [expandGbifProcessingPanel]);

  useEffect(() => {
    setHoverTooltipsEnabled(!hoverTooltipsDisabled);
  }, [hoverTooltipsDisabled]);

  useEffect(() => {
    if (!map.current || !mapReady) {
      return;
    }

    if (basemapMode === BASEMAP_MODES.YANDEX) {
      setOsmBasemapEnabled(map.current, false);
      setYandexBasemapEnabled(map.current, true);
      return;
    }

    setYandexBasemapEnabled(map.current, false);

    if (basemapMode === BASEMAP_MODES.OSM) {
      setOsmBasemapEnabled(map.current, true);
      return;
    }

    setOsmBasemapEnabled(map.current, false);
  }, [basemapMode, mapReady]);

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
    updateHeatmapData(map.current, locationFilters);
    refreshAreal();
    clearSharedPointPin(map.current);
    clearArealDynamicsSliceCache();
    bumpPointsDataRevision();
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

  const handleGbifDataChange = useCallback(() => {
    clearArealDynamicsSliceCache();
    syncYearBounds();
    bumpPointsDataRevision();

    if (!map.current || !mapReady) {
      return;
    }

    applyGbifLocationsFilter(map.current, locationFilters);
    updateHeatmapData(map.current, locationFilters);
    refreshAreal();
  }, [mapReady, locationFilters, refreshAreal, syncYearBounds, bumpPointsDataRevision]);

  useEffect(() => {
    if (gbifOnly === prevGbifOnlyRef.current) {
      return;
    }

    if (gbifOnly && map.current) {
      // Локальные маркеры скрываем на карте, но markersVisible в UI не трогаем —
      // иначе «Группы точек» блокирует кластеризацию.
      setGbifVisibility(map.current, true);
    }

    prevGbifOnlyRef.current = gbifOnly;
  }, [gbifOnly]);

  useEffect(() => {
    setToolFeaturesContext({
      includeLocal: !gbifOnly,
      includeGbif: true
    });

    if (!map.current || !mapReady) {
      return;
    }

    updateHeatmapData(map.current, locationFilters);
    refreshAreal();
  }, [gbifOnly, mapReady, locationFilters, refreshAreal]);

  useEffect(() => {
    if (!map.current || !mapReady) {
      return;
    }

    // В режиме GBIF локальные маркеры скрыты; «Скрыть точки» управляет слоем GBIF.
    setMarkersVisible(map.current, gbifOnly ? false : mapMarkersVisible);
    if (gbifOnly) {
      setGbifVisibility(map.current, mapMarkersVisible);
    }
  }, [mapMarkersVisible, gbifOnly, mapReady]);

  useEffect(() => {
    if (!map.current || !mapReady) {
      return;
    }

    setClusteringEnabled(map.current, clusteringEnabled);
    setGbifClusteringEnabled(map.current, clusteringEnabled);
    applyGbifLocationsFilter(map.current, locationFilters);
  }, [clusteringEnabled, mapReady, locationFilters]);

  useEffect(() => {
    if (!map.current || !mapReady || !clusteringEnabled) {
      return;
    }

    setClusterByRegnum(map.current, clusterByRegnum);
    setGbifClusterByRegnum(map.current, clusterByRegnum);
    applyGbifLocationsFilter(map.current, locationFilters);
  }, [clusterByRegnum, clusteringEnabled, mapReady, locationFilters]);

  useEffect(() => {
    if (!map.current || !mapReady || !clusteringEnabled) {
      return;
    }

    // Один переключатель «Кластеры-диаграммы» — и для локальных точек, и для GBIF.
    setGbifClusterPieChartsEnabled(map.current, clusterPieCharts);
    setClusterPieChartsEnabled(map.current, clusterPieCharts);
  }, [clusterPieCharts, clusteringEnabled, mapReady]);

  useEffect(() => {
    if (!map.current || !mapReady) {
      return;
    }

    setDenseClustersHighlightEnabled(map.current, denseClustersHighlight);
    setGbifDenseClustersHighlightEnabled(map.current, denseClustersHighlight);
    applyGbifLocationsFilter(map.current, locationFilters);
  }, [denseClustersHighlight, mapReady, locationFilters]);

  useEffect(() => {
    if (!map.current) {
      return;
    }

    // Heatmap строится по getToolFeatures (локальные + GBIF).
    setHeatmapEnabled(map.current, heatmapEnabled, locationFilters);
  }, [heatmapEnabled, locationFilters]);

  useEffect(() => {
    if (!mapReady || !map.current || !isFirebaseConfigured()) {
      return;
    }

    let cancelled = false;
    const layerIdsWithVisibleFeatures = Object.entries(boundsFeatureVisibility)
      .filter(([, visible]) => visible)
      .map(([featureKey]) => featureKey.split(":")[0])
      .filter((layerId, index, layerIds) => layerIds.indexOf(layerId) === index);

    if (layerIdsWithVisibleFeatures.length) {
      setBoundsLayerLoading(
        Object.fromEntries(layerIdsWithVisibleFeatures.map((layerId) => [layerId, true]))
      );
    }

    syncBoundsFeaturesVisibility(map.current, boundsFeatureVisibility)
      .then((errors) => {
        if (!cancelled) {
          setBoundsLayerErrors(errors);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setBoundsLayerErrors({ _global: error?.message || String(error) });
        }
      })
      .finally(() => {
        if (!cancelled) {
          setBoundsLayerLoading({});
        }
      });

    return () => {
      cancelled = true;
    };
  }, [boundsFeatureVisibility, mapReady]);

  useEffect(() => {
    if (activeModule !== MODULE_IDS.OOPT || !mapReady || !isFirebaseConfigured()) {
      return;
    }

    let cancelled = false;
    setBoundsLayerLoading((prev) => ({
      ...prev,
      ...Object.fromEntries(BOUNDS_LAYER_DEFINITIONS.map(({ id }) => [id, true]))
    }));

    Promise.all(
      BOUNDS_LAYER_DEFINITIONS.map(async ({ id: layerId }) => {
        try {
          const geojson = await ensureBoundsLayerGeoJSON(layerId);
          return {
            layerId,
            catalog: buildBoundsCatalogFromGeoJSON(layerId, geojson),
            error: null
          };
        } catch (error) {
          return {
            layerId,
            catalog: [],
            error: error?.message || String(error)
          };
        }
      })
    )
      .then((results) => {
        if (cancelled) {
          return;
        }

        setBoundsCatalogByLayerId(
          Object.fromEntries(results.map(({ layerId, catalog }) => [layerId, catalog]))
        );
        setBoundsLayerErrors((prev) => {
          const next = { ...prev };

          results.forEach(({ layerId, error }) => {
            if (error) {
              next[layerId] = error;
            } else {
              delete next[layerId];
            }
          });

          return next;
        });
      })
      .finally(() => {
        if (!cancelled) {
          setBoundsLayerLoading((prev) => ({
            ...prev,
            ...Object.fromEntries(BOUNDS_LAYER_DEFINITIONS.map(({ id }) => [id, false]))
          }));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeModule, mapReady]);

  useEffect(() => {
    if (toolPointsFilterEnabled[MODULE_IDS.OOPT] && selectedBoundsFeature) {
      setOoptFilterBoundsFeature(selectedBoundsFeature);
    }
  }, [selectedBoundsFeature, toolPointsFilterEnabled]);

  useEffect(() => {
    if (activeModule !== MODULE_IDS.OOPT) {
      if (!toolPointsFilterEnabled[MODULE_IDS.OOPT]) {
        setBoundsSpeciesListOpen(false);
        setBoundsSpeciesRegnumFilter(null);
        setSelectedBoundsFeature(null);
      }
    }
  }, [activeModule, toolPointsFilterEnabled]);

  useEffect(() => {
    saveToolPointsFilterState(toolPointsFilterEnabled);
  }, [toolPointsFilterEnabled]);

  useEffect(() => {
    // Если пользователь скрыл объект, к которому относится открытая панель
    // «Сведения об ООПТ», сам объект на карте уже пропал — закрываем и панель.
    if (!selectedBoundsFeature || toolPointsFilterEnabled[MODULE_IDS.OOPT]) {
      return;
    }

    const layerId = selectedBoundsFeature.definition?.id;
    if (!layerId) {
      return;
    }

    const featureKey = getBoundsFeatureKey(
      layerId,
      selectedBoundsFeature.feature?.properties ?? {}
    );

    if (!boundsFeatureVisibility[featureKey]) {
      setSelectedBoundsFeature(null);
    }
  }, [boundsFeatureVisibility, selectedBoundsFeature, toolPointsFilterEnabled]);

  useEffect(() => {
    if (!selectedBoundsFeature) {
      hideBoundsFeaturePopup();
    }
  }, [selectedBoundsFeature]);

  useEffect(() => {
    if (!selectedBoundsFeature) {
      prevSelectedBoundsFeatureKeyRef.current = null;
      return;
    }

    const layerId = selectedBoundsFeature.definition?.id;
    if (!layerId) {
      return;
    }

    const featureKey = getBoundsFeatureKey(
      layerId,
      selectedBoundsFeature.feature?.properties ?? {}
    );

    // Только при смене объекта ООПТ — иначе minimize в taskbar сразу откатывался.
    if (featureKey === prevSelectedBoundsFeatureKeyRef.current) {
      return;
    }

    prevSelectedBoundsFeatureKeyRef.current = featureKey;
    expandPanel(PANEL_IDS.OOPT_FEATURE);
  }, [selectedBoundsFeature, expandPanel]);

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

  const handleDenseClustersHighlightChange = (enabled) => {
    if (enabled) {
      setMarkersVisibleState(true);
    } else {
      setDenseProcessingActive(false);
      setSelectedDensePileKey(null);
      setDensePileSpeciesListOpen(false);
      densePileCameraBeforeRef.current = null;
    }

    setDenseClustersHighlightState(enabled);
  };

  const handleDenseProcessingOpen = useCallback(() => {
    stashVisiblePanelsToTaskbarRef.current(PANEL_IDS.DENSE);
    setMarkersVisibleState(true);
    setDenseClustersHighlightState(true);
    setDenseProcessingActive(true);
    setActiveModule(MODULE_IDS.MAP);
    expandDenseProcessingPanel();
  }, [expandDenseProcessingPanel]);

  const handleDenseProcessingClose = useCallback(() => {
    setDenseProcessingActive(false);
    setSelectedDensePileKey(null);
    setDensePileSpeciesListOpen(false);
    densePileCameraBeforeRef.current = null;
    unpinPanelsFromTaskbar([PANEL_IDS.DENSE, TASKBAR_PANEL_IDS.DENSE_SPECIES]);
    expandPanel(PANEL_IDS.MAP);
  }, [expandPanel, unpinPanelsFromTaskbar]);

  const activeMapFilters = useMemo(
    () =>
      collectActiveMapFilters({
        propertyFilters,
        statusFilters,
        yearFilterEnabled,
        toolPointsFilterEnabled,
        boundsSpeciesRegnumFilter,
        denseClustersHighlight,
        denseProcessingActive,
        gbifProcessingFilters
      }),
    [
      propertyFilters,
      statusFilters,
      yearFilterEnabled,
      toolPointsFilterEnabled,
      boundsSpeciesRegnumFilter,
      denseClustersHighlight,
      denseProcessingActive,
      gbifProcessingFilters
    ]
  );

  const handleMapFiltersReset = useCallback(() => {
    setPropertyFilters({});
    setStatusFilters([]);
    setYearFilterEnabled(false);
    setToolPointsFilterEnabled(createDefaultToolPointsFilterState());
    setOoptFilterBoundsFeature(null);
    setBoundsSpeciesRegnumFilter(null);
    setDenseClustersHighlightState(false);
    setDenseProcessingActive(false);
    setSelectedDensePileKey(null);
    setDensePileSpeciesListOpen(false);
    densePileCameraBeforeRef.current = null;
    setGbifProcessingFiltersState(createDefaultGbifProcessingFilters());
    expandPanel(PANEL_IDS.MAP);
  }, [expandPanel]);

  const handleMapFilterClear = useCallback(
    (filterId) => {
      if (filterId === MAP_FILTER_IDS.FEATURE) {
        setPropertyFilters({});
        return;
      }

      if (filterId === MAP_FILTER_IDS.STATUS) {
        setStatusFilters([]);
        return;
      }

      if (filterId === MAP_FILTER_IDS.YEAR) {
        setYearFilterEnabled(false);
        return;
      }

      if (filterId === MAP_FILTER_IDS.OOPT_FEATURE) {
        setToolPointsFilterEnabled((current) => ({
          ...current,
          [MODULE_IDS.OOPT]: false
        }));
        setOoptFilterBoundsFeature(null);
        return;
      }

      if (filterId === MAP_FILTER_IDS.OOPT_SPECIES) {
        setBoundsSpeciesRegnumFilter(null);
        return;
      }

      if (filterId === MAP_FILTER_IDS.MAP_GROUPS) {
        setDenseClustersHighlightState(false);
        setToolPointsFilterEnabled((current) => ({
          ...current,
          [MODULE_IDS.MAP]: false
        }));
        return;
      }

      if (filterId === MAP_FILTER_IDS.DENSE) {
        setDenseProcessingActive(false);
        setSelectedDensePileKey(null);
        setDensePileSpeciesListOpen(false);
        densePileCameraBeforeRef.current = null;
        expandPanel(PANEL_IDS.MAP);
        return;
      }

      if (filterId === MAP_FILTER_IDS.GBIF_PROCESSING) {
        setGbifProcessingFiltersState(createDefaultGbifProcessingFilters());
        return;
      }

      if (typeof filterId === "string" && filterId.startsWith("tool:")) {
        const moduleId = filterId.slice("tool:".length);
        setToolPointsFilterEnabled((current) => ({
          ...current,
          [moduleId]: false
        }));
      }
    },
    [expandPanel]
  );

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

  const handleToolPointsFilterToggle = useCallback(() => {
    setToolPointsFilterEnabled((current) => {
      const nextEnabled = !current[MODULE_IDS.OOPT];

      if (nextEnabled && selectedBoundsFeature) {
        setOoptFilterBoundsFeature(selectedBoundsFeature);
      } else if (!nextEnabled) {
        setOoptFilterBoundsFeature(null);
      }

      return {
        ...current,
        [MODULE_IDS.OOPT]: nextEnabled
      };
    });
  }, [selectedBoundsFeature]);

  const handleBoundsSpeciesListToggle = useCallback(() => {
    setBoundsSpeciesListOpen((open) => {
      if (open) {
        setBoundsSpeciesRegnumFilter(null);
      } else {
        setPanelMinimized((prev) => ({
          ...prev,
          [TASKBAR_PANEL_IDS.OOPT_SPECIES]: false
        }));
      }

      return !open;
    });
  }, []);

  const handleBoundsSpeciesListClose = useCallback(() => {
    setBoundsSpeciesListOpen(false);
    setBoundsSpeciesRegnumFilter(null);
    unpinPanelsFromTaskbar([TASKBAR_PANEL_IDS.OOPT_SPECIES]);
  }, [unpinPanelsFromTaskbar]);

  const handleBoundsSpeciesRegnumVisibilityChange = useCallback((enabledRegnums) => {
    setBoundsSpeciesRegnumFilter(enabledRegnums);
  }, []);

  const handleBoundsSpeciesSelect = useCallback((feature) => {
    const mapInstance = map.current;

    if (!mapInstance || !feature?.geometry?.coordinates) {
      return;
    }

    hideBoundsFeaturePopup();
    setPopupData(feature);
    updateSelectedPointHighlight(mapInstance, feature);
    panToArealPoint(mapInstance, feature);
  }, []);

  const clearPointSelection = useCallback(() => {
    // Панель GBIF привязана к источнику «Точки», а не к модулю — сворачиваем
    // даже если выбора точки нет (иначе клик мимо её не закрывал).
    setPanelCollapsed((prev) =>
      prev[PANEL_IDS.GBIF] ? prev : { ...prev, [PANEL_IDS.GBIF]: true }
    );

    const state = pointSelectionStateRef.current;

    // Ранний выход, если ничего из связанного с выбором точки не активно —
    // избегаем лишних сбросов состояния и перерисовки слоёв карты.
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
      clearSelectedPointHighlight(map.current);
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
    setActiveModule((current) => {
      if (current === MODULE_IDS.POLYGON) {
        return current;
      }

      // Пока включён фильтр точек по ООПТ, не закрываем панель ООПТ кликом по карте.
      if (
        current === MODULE_IDS.OOPT &&
        pointSelectionStateRef.current.ooptPointsFilterEnabled
      ) {
        return current;
      }

      return null;
    });
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
        handleDataSourceModeChange(DATA_SOURCE_MODES.ALL);
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
  }, [mapReady, dataSourceMode, handleDataSourceModeChange]);

  // Инициализация карты Mapbox и всех слоёв/обработчиков — выполняется один раз при монтировании.
  useEffect(() => {
    if (!map.current && ref.current) {
      map.current = initMap(ref.current);

      map.current.on("load", async () => {
        await initLocationsFromFirestore();
        await hydrateGbifStoreFromPersistence();
        syncYearBounds();

        addOsmBasemapLayer(map.current);
        addYandexBasemapLayer(map.current);
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
            if (!pointSelectionStateRef.current.ooptPointsFilterEnabled) {
              setSelectedBoundsFeature(null);
            }
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

            const boundsHit = getBoundsFeatureAtClick(map.current, event);
            if (boundsHit) {
              setPopupData(null);
              updateSelectedPointHighlight(map.current, null);
              setSelectedBoundsFeature(boundsHit);
              setActiveModule(MODULE_IDS.OOPT);
              showBoundsFeaturePopup(map.current, boundsHit, event.lngLat, {
                onOpenDetails: () => openBoundsFeatureDetailsRef.current?.(),
                onIsolate: (hit) => isolateBoundsFeatureRef.current?.(hit),
                isIsolated: isBoundsFeatureIsolatedRef.current?.(
                  getBoundsFeatureVisibilityKey(boundsHit)
                ),
                filters: boundsFilterBaseRef.current()
              });
              return;
            }

            if (!pointSelectionStateRef.current.ooptPointsFilterEnabled) {
              setSelectedBoundsFeature(null);
            }
            clearPointSelection();
          },
          clusteringEnabled: DEFAULT_CLUSTERING_ENABLED,
          clusterByRegnum: DEFAULT_CLUSTER_BY_REGNUM,
          clusterPieChartsEnabled: DEFAULT_CLUSTER_PIE_CHARTS,
          markersVisible: DEFAULT_MARKERS_VISIBLE
        });
        addBoundsLayers(map.current);
        addArealLayer(map.current);
        addSpeciesPolygonLayer(map.current); // слой экспериментального модуля «Полигон»
        addArealDynamicsLayer(map.current);
        addBufferLayer(map.current);
        addAreaSelectionLayer(map.current);
        addHeatmapLayer(map.current);
        addGbifLayer(map.current, {
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
            if (!pointSelectionStateRef.current.ooptPointsFilterEnabled) {
              setSelectedBoundsFeature(null);
            }
            clearSelectedPointHighlight(map.current);
            setPopupData(feature);

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

            setActiveModule((current) => {
              if (current === MODULE_IDS.BUFFER || current === MODULE_IDS.POLYGON) {
                return current;
              }
              return MODULE_IDS.FEATURE;
            });
          }
        });
        setMapReady(true);
      });
    }

    return () => {
      setMapReady(false);
      arealRefreshScheduledRef.current = false;
      clearBoundsLayerCache();
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, [clearPointSelection, syncYearBounds]);

  useEffect(() => {
    if (selectedBoundsFeature) {
      return;
    }

    unpinPanelsFromTaskbar([
      PANEL_IDS.OOPT_FEATURE,
      TASKBAR_PANEL_IDS.OOPT_SPECIES
    ]);
  }, [selectedBoundsFeature, unpinPanelsFromTaskbar]);

  useEffect(() => {
    if (dataSourceMode === DATA_SOURCE_MODES.GBIF) {
      return;
    }

    unpinPanelsFromTaskbar([PANEL_IDS.GBIF, PANEL_IDS.GBIF_PROCESSING]);
  }, [dataSourceMode, unpinPanelsFromTaskbar]);

  useEffect(() => {
    if (gbifProcessingActive) {
      return;
    }

    unpinPanelsFromTaskbar([PANEL_IDS.GBIF_PROCESSING]);
  }, [gbifProcessingActive, unpinPanelsFromTaskbar]);

  const arealDisplayedContainedPoints = arealContainedPoints ?? activeToolFilterPointsSummary;

  const showOoptFeaturePanel =
    Boolean(selectedBoundsFeature) &&
    (activeModule === MODULE_IDS.OOPT || ooptPointsFilterActive);

  // Ключ выбранной ООПТ — для подсветки кнопки списка видов в каталоге.
  const selectedBoundsFeatureKey = useMemo(() => {
    if (!selectedBoundsFeature?.definition?.id) {
      return null;
    }

    return getBoundsFeatureKey(
      selectedBoundsFeature.definition.id,
      selectedBoundsFeature.feature?.properties ?? {}
    );
  }, [selectedBoundsFeature]);

  const denseProcessingExclusive = denseProcessingActive;

  const showModulePanelStack =
    (activeModule !== null && activeModule !== MODULE_IDS.TIMELINE) ||
    (showOoptFeaturePanel && activeModule !== MODULE_IDS.TIMELINE) ||
    dataSourceMode === DATA_SOURCE_MODES.GBIF ||
    denseProcessingActive;

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
        dataSourceMode={dataSourceMode}
        onDataSourceModeChange={handleDataSourceModeChange}
      />
      <div
        ref={ref}
        className={`map-container${
          basemapMode !== BASEMAP_MODES.MAPBOX ? " map-container--alt-basemap" : ""
        }`}
      />
      {basemapMode === BASEMAP_MODES.YANDEX && (
        <a
          href="https://yandex.ru/maps"
          className="yandex-basemap-logo"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Яндекс Карты"
          title="Яндекс Карты"
        >
          <YandexLogo className="yandex-basemap-logo-image" aria-hidden="true" focusable="false" />
        </a>
      )}
      <BasemapPicker basemapMode={basemapMode} onBasemapModeChange={setBasemapMode} />
      {showModulePanelStack && (
        <div className="module-panel-stack">
          {denseProcessingExclusive ? (
            <>
              {activeModule === MODULE_IDS.FEATURE &&
                !isPanelMinimized(PANEL_IDS.FEATURE) && (
                <FeaturePopup
                  feature={popupData}
                  collapsed={isPanelCollapsed(PANEL_IDS.FEATURE)}
                  onCollapsedChange={handleFeaturePanelCollapsedChange}
                  onMinimize={handleMinimizePanel(PANEL_IDS.FEATURE)}
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
                  onLookupRussianName={handleLookupRussianName}
                  onApplyRussianName={handleApplyRussianName}
                  onClearRussianName={handleClearRussianName}
                />
              )}
              {!isPanelMinimized(PANEL_IDS.DENSE) && (
              <DenseClustersPanel
                pileCount={densePilesStats.pileCount}
                pointCount={densePilesStats.pointCount}
                piles={densePilesStats.piles}
                selectedPileKey={selectedDensePileKey}
                canZoomBack={Boolean(selectedDensePileKey)}
                speciesListOpen={densePileSpeciesListOpen}
                onSelectPile={handleDensePileSelect}
                onZoomBack={handleDensePileZoomBack}
                onToggleSpeciesList={handleDensePileSpeciesListToggle}
                onClose={handleDenseProcessingClose}
                collapsed={isPanelCollapsed(PANEL_IDS.DENSE)}
                onCollapsedChange={handleDensePanelCollapsedChange}
                onMinimize={handleMinimizePanel(PANEL_IDS.DENSE)}
              />
              )}
            </>
          ) : (
            <>
          {activeModule === MODULE_IDS.FEATURE &&
            !isPanelMinimized(PANEL_IDS.FEATURE) && (
            <FeaturePopup
              feature={popupData}
              collapsed={isPanelCollapsed(PANEL_IDS.FEATURE)}
              onCollapsedChange={handleFeaturePanelCollapsedChange}
              onMinimize={handleMinimizePanel(PANEL_IDS.FEATURE)}
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
              onLookupRussianName={handleLookupRussianName}
              onApplyRussianName={handleApplyRussianName}
              onClearRussianName={handleClearRussianName}
            />
          )}
          {(activeModule === MODULE_IDS.AREAL ||
            (activeModule === MODULE_IDS.FEATURE && arealDockedWithFeature)) &&
            !isPanelMinimized(PANEL_IDS.AREAL) && (
            <ArealPopup
              enabled={arealEnabled}
              allMarkers={arealAllMarkers}
              radius={arealRadius}
              containedPoints={arealDisplayedContainedPoints}
              onPointSelect={handleArealPointSelect}
              onEnabledChange={handleArealEnabledChange}
              onAllMarkersChange={handleArealAllMarkersChange}
              toolBlocked={isBufferApplied}
              toolBlockedTitle={AREAL_BLOCKED_BY_BUFFER_TITLE}
              onRadiusChange={setArealRadius}
              onReset={handleArealReset}
              collapsed={isPanelCollapsed(PANEL_IDS.AREAL)}
              onCollapsedChange={handlePanelCollapsedChange(PANEL_IDS.AREAL)}
              onMinimize={handleMinimizePanel(PANEL_IDS.AREAL)}
            />
          )}
          {activeModule === MODULE_IDS.STATUS &&
            !isPanelMinimized(PANEL_IDS.STATUS) && (
            <StatusFilterPanel
              activeStatusFilters={statusFilters}
              onStatusFilterChange={handleStatusFilterChange}
              collapsed={isPanelCollapsed(PANEL_IDS.STATUS)}
              onCollapsedChange={handlePanelCollapsedChange(PANEL_IDS.STATUS)}
              onMinimize={handleMinimizePanel(PANEL_IDS.STATUS)}
            />
          )}
          {activeModule === MODULE_IDS.MAP && !isPanelMinimized(PANEL_IDS.MAP) && (
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
              denseClustersHighlight={denseClustersHighlight}
              onDenseClustersHighlightChange={handleDenseClustersHighlightChange}
              onDenseProcessingOpen={handleDenseProcessingOpen}
              collapsed={isPanelCollapsed(PANEL_IDS.MAP)}
              onCollapsedChange={handlePanelCollapsedChange(PANEL_IDS.MAP)}
              onMinimize={handleMinimizePanel(PANEL_IDS.MAP)}
            />
          )}
          {activeModule === MODULE_IDS.YEAR &&
            !isPanelMinimized(PANEL_IDS.YEAR) && (
            <YearFilterPanel
              enabled={yearFilterEnabled}
              onEnabledChange={setYearFilterEnabled}
              yearBounds={yearBounds}
              range={yearRange}
              onRangeChange={handleYearRangeChange}
              lockedByPropertyFilter={hasFoundYearPropertyFilter}
              collapsed={isPanelCollapsed(PANEL_IDS.YEAR)}
              onCollapsedChange={handlePanelCollapsedChange(PANEL_IDS.YEAR)}
              onMinimize={handleMinimizePanel(PANEL_IDS.YEAR)}
            />
          )}
          {activeModule === MODULE_IDS.POLYGON &&
            !isPanelMinimized(PANEL_IDS.POLYGON) && (
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
              onMinimize={handleMinimizePanel(PANEL_IDS.POLYGON)}
            />
          )}
          {(activeModule === MODULE_IDS.BUFFER ||
            (activeModule === MODULE_IDS.FEATURE && bufferDockedWithFeature)) &&
          !isPanelMinimized(PANEL_IDS.BUFFER) ? (
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
              onMinimize={handleMinimizePanel(PANEL_IDS.BUFFER)}
            />
          ) : null}
          {activeModule === MODULE_IDS.AREA &&
            !isPanelMinimized(PANEL_IDS.AREA) && (
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
              onMinimize={handleMinimizePanel(PANEL_IDS.AREA)}
            />
          )}
          {activeModule === MODULE_IDS.OOPT &&
            !isPanelMinimized(PANEL_IDS.OOPT) && (
            <OoptPanel
              catalogByLayerId={boundsCatalogByLayerId}
              featureVisibility={boundsFeatureVisibility}
              onFeatureVisibilityChange={handleBoundsFeatureVisibilityChange}
              onGroupVisibilityChange={handleBoundsGroupVisibilityChange}
              onFeatureSelect={handleBoundsFeatureSelect}
              onFeatureSpeciesListOpen={handleBoundsFeatureSpeciesListOpen}
              speciesListFeatureKey={
                boundsSpeciesListOpen ? selectedBoundsFeatureKey : null
              }
              loadingById={boundsLayerLoading}
              errorsById={boundsLayerErrors}
              firebaseConfigured={isFirebaseConfigured()}
              markersVisible={markersVisible}
              onMarkersVisibleChange={setMarkersVisibleState}
              collapsed={isPanelCollapsed(PANEL_IDS.OOPT)}
              onCollapsedChange={handlePanelCollapsedChange(PANEL_IDS.OOPT)}
              onMinimize={handleMinimizePanel(PANEL_IDS.OOPT)}
            />
          )}
          {showOoptFeaturePanel && !isPanelMinimized(PANEL_IDS.OOPT_FEATURE) ? (
            <OoptFeaturePanel
              layerDefinition={selectedBoundsFeature.definition}
              feature={selectedBoundsFeature.feature}
              containedSpeciesCount={boundsContainedSpecies?.count ?? null}
              containedPointsCount={boundsContainedPoints?.count ?? null}
              pointsFilterEnabled={ooptPointsFilterActive}
              onPointsFilterToggle={handleToolPointsFilterToggle}
              pointsFilterAvailable={Boolean(ooptWithinFeature)}
              onShowSpeciesList={handleBoundsSpeciesListToggle}
              speciesListOpen={boundsSpeciesListOpen}
              collapsed={isPanelCollapsed(PANEL_IDS.OOPT_FEATURE)}
              onCollapsedChange={handlePanelCollapsedChange(PANEL_IDS.OOPT_FEATURE)}
              onMinimize={handleMinimizePanel(PANEL_IDS.OOPT_FEATURE)}
            />
          ) : null}
          {activeModule === MODULE_IDS.SUBMIT &&
            !isPanelMinimized(PANEL_IDS.SUBMIT) && (
            <Suspense fallback={null}>
              <UserSubmissionPanel
                coordinates={submissionCoordinates}
                locationPickingActive={submissionLocationPicking}
                onLocationPickingChange={setSubmissionLocationPicking}
                submissionMapPickHandlerRef={submissionMapPickHandlerRef}
                collapsed={isPanelCollapsed(PANEL_IDS.SUBMIT)}
                onCollapsedChange={handlePanelCollapsedChange(PANEL_IDS.SUBMIT)}
                onMinimize={handleMinimizePanel(PANEL_IDS.SUBMIT)}
                onSaved={handleUserFindingSaved}
                onReset={handleSubmissionCoordinatesReset}
                onCoordinatesReset={handleSubmissionCoordinatesReset}
              />
            </Suspense>
          )}
          {dataSourceMode === DATA_SOURCE_MODES.GBIF && (
            <>
              {!isPanelMinimized(PANEL_IDS.GBIF) && (
              <GbifPanel
                map={map.current}
                collapsed={isPanelCollapsed(PANEL_IDS.GBIF)}
                onCollapsedChange={handleGbifPanelCollapsedChange}
                onMinimize={handleMinimizePanel(PANEL_IDS.GBIF)}
                onDataChange={handleGbifDataChange}
                onOpenProcessing={handleOpenGbifProcessing}
              />
              )}
              {gbifProcessingActive &&
                !isPanelMinimized(PANEL_IDS.GBIF_PROCESSING) && (
                <GbifProcessingPanel
                  filters={gbifProcessingFilters}
                  onFiltersChange={handleGbifProcessingFiltersChange}
                  onFiltersReset={handleGbifProcessingFiltersReset}
                  collapsed={isPanelCollapsed(PANEL_IDS.GBIF_PROCESSING)}
                  onCollapsedChange={handleGbifProcessingPanelCollapsedChange}
                  onMinimize={handleMinimizePanel(PANEL_IDS.GBIF_PROCESSING)}
                />
              )}
            </>
          )}
            </>
          )}
        </div>
      )}
      <TimelineSlider
        visible={activeModule === MODULE_IDS.TIMELINE}
        year={timelineYear}
        onYearChange={setTimelineYear}
        yearBounds={yearBounds}
        onBottomOccupyChange={setTimelineBottomOccupyPx}
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
      <BoundsSpeciesListPopup
        open={
          boundsSpeciesListOpen &&
          showOoptFeaturePanel &&
          !isPanelMinimized(TASKBAR_PANEL_IDS.OOPT_SPECIES)
        }
        onClose={handleBoundsSpeciesListClose}
        onMinimize={handleMinimizePanel(TASKBAR_PANEL_IDS.OOPT_SPECIES)}
        territoryHeading={
          selectedBoundsFeature
            ? getBoundsFeatureHeadingParts(
                selectedBoundsFeature.definition?.id,
                selectedBoundsFeature.feature?.properties ?? {}
              )
            : null
        }
        speciesSummary={boundsContainedSpecies}
        onSpeciesSelect={handleBoundsSpeciesSelect}
        onRegnumVisibilityChange={handleBoundsSpeciesRegnumVisibilityChange}
      />
      <BoundsSpeciesListPopup
        open={
          densePileSpeciesListOpen &&
          denseProcessingActive &&
          Boolean(selectedDensePile) &&
          !isPanelMinimized(TASKBAR_PANEL_IDS.DENSE_SPECIES)
        }
        onClose={handleDensePileSpeciesListClose}
        onMinimize={handleMinimizePanel(TASKBAR_PANEL_IDS.DENSE_SPECIES)}
        title="Виды в плотной группе"
        ariaLabel="Список видов плотной группы"
        territoryHeading={densePileSpeciesTerritoryHeading}
        speciesSummary={densePileSpeciesSummary}
        onSpeciesSelect={handleDensePileSpeciesSelect}
      />
      <PanelTaskbar
        items={panelTaskbarOrder}
        activeIds={activeTaskbarPanelIds}
        onActivate={handleTaskbarPanelClick}
        bottomOccupyPx={timelineBottomOccupyPx}
      />
      <MapCornerControls
        activeFilters={activeMapFilters}
        onFiltersReset={handleMapFiltersReset}
        onFilterClear={handleMapFilterClear}
      />
    </>
  );
}
