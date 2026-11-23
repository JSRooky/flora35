/** app/panelDomain.js — домен, вынесенный из App.js механически (без изменения поведения). */
import { useState, useRef, useCallback } from "react";
import { parseSharePointParams } from "../components/sharePointLink";
import { PANEL_IDS, FEATURE_PEER_PANEL_IDS, isPanelExpandedInState } from "./panelConstants";
import { FEATURE_FLAGS } from "../config/featureFlags";
import { TASKBAR_PANEL_IDS, PANEL_TASKBAR_MODULE_ID } from "../panelTaskbarRegistry";
import { MODULE_IDS } from "../components/ModuleMenu";
import { DATA_SOURCE_MODES } from "../locations/loadPoints";
import { syncDataWorkingSet } from "../map/dataWorkingSet";
import { collapseOtherPanels } from "./panelLayout";

/**
 * @param {object} deps — значения из App.js, захваченные замыканиями вынесенного кода.
 */
export function usePanelDomain({
  activeModule,
  dataSourceModeRef,
  map,
  setActiveModule,
  setBoundsSpeciesListOpen,
  setDataSourceModeState,
  setDensePileSpeciesListOpen,
  setDenseProcessingActive,
  setExternalProcessingActive,
  setRegionSpeciesPanelOpen,
}) {
  const [panelCollapsed, setPanelCollapsed] = useState({});
  /** Панели, убранные в нижнюю «панель задач» (модуль при этом остаётся активным). */
  const [panelMinimized, setPanelMinimized] = useState({});
  /** Отдельный флаг: panelMinimized для этой панели сбрасывают другие обработчики. */
  const [dataSourcesPanelOpen, setDataSourcesPanelOpen] = useState(false);
  const [dataSourcesFocusRequest, setDataSourcesFocusRequest] = useState(null);
  const [tempArchivePanelOpen, setTempArchivePanelOpen] = useState(false);
  const [tempArchiveStatus, setTempArchiveStatus] = useState("");
  const [comparePanelOpen, setComparePanelOpen] = useState(false);
  const [reportPanelOpen, setReportPanelOpen] = useState(false);
  const [analysisPanelOpen, setAnalysisPanelOpen] = useState(false);
  const [experimentalPrompt, setExperimentalPrompt] = useState(null);
  const [kdeOverlay, setKdeOverlay] = useState(null);
  const [compareDiversityOpen, setCompareDiversityOpen] = useState(false);
  const [compareDiversityKeys, setCompareDiversityKeys] = useState([]);
  const [compareSimilarityOpen, setCompareSimilarityOpen] = useState(false);
  const [compareDistributionOpen, setCompareDistributionOpen] = useState(false);
  const [compareStatsKind, setCompareStatsKind] = useState(null);
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
      setPanelCollapsed((prev) =>
        collapsed
          ? { ...prev, [panelId]: true }
          : collapseOtherPanels(prev, panelId)
      );
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
    // Не сбрасываем panelMinimized: для «Источники данных» видимость —
    // EXTERNAL && !minimized. Сброс флага сразу после закрытия снова
    // монтирует панель.
  }, []);

  const minimizePanel = useCallback(
    (panelId) => {
      if (
        panelId === PANEL_IDS.DATA_SOURCES ||
        panelId === PANEL_IDS.GBIF
      ) {
        setDataSourcesPanelOpen(false);
      }
      setPanelMinimized((prev) => ({ ...prev, [panelId]: true }));
      pinPanelsToTaskbar([panelId]);
    },
    [pinPanelsToTaskbar]
  );

  const restorePanel = useCallback((panelId) => {
    if (FEATURE_FLAGS.reportModuleDisabled && panelId === TASKBAR_PANEL_IDS.REPORT) {
      return;
    }

    // Текущие видимые панели уводим в taskbar, затем поднимаем выбранную.
    stashVisiblePanelsToTaskbarRef.current(panelId);

    setPanelMinimized((prev) => ({ ...prev, [panelId]: false }));
    pinPanelsToTaskbar([panelId]);
    setPanelCollapsed((prev) => collapseOtherPanels(prev, panelId));

    // Вернуть контекст модуля/режима, иначе панель останется размонтированной
    // (типичный случай: в taskbar несколько иконок от разных модулей).
    switch (panelId) {
      case TASKBAR_PANEL_IDS.DENSE:
        setDenseProcessingActive(true);
        setActiveModule(MODULE_IDS.MAP);
        break;
      case TASKBAR_PANEL_IDS.DATA_SOURCES:
      case TASKBAR_PANEL_IDS.GBIF:
        setDataSourcesPanelOpen(true);
        setDataSourceModeState(DATA_SOURCE_MODES.EXTERNAL);
        dataSourceModeRef.current = DATA_SOURCE_MODES.EXTERNAL;
        void syncDataWorkingSet({ mode: DATA_SOURCE_MODES.EXTERNAL, map: map.current });
        setActiveModule(null);
        setPanelCollapsed((prev) => ({
          ...prev,
          [PANEL_IDS.DATA_SOURCES]: false,
          [PANEL_IDS.EXTERNAL_PROCESSING]: true
        }));
        break;
      case TASKBAR_PANEL_IDS.EXTERNAL_PROCESSING:
      case TASKBAR_PANEL_IDS.GBIF_PROCESSING:
        setDataSourceModeState(DATA_SOURCE_MODES.EXTERNAL);
        dataSourceModeRef.current = DATA_SOURCE_MODES.EXTERNAL;
        void syncDataWorkingSet({ mode: DATA_SOURCE_MODES.EXTERNAL, map: map.current });
        setExternalProcessingActive(true);
        setActiveModule(null);
        setPanelCollapsed((prev) => ({
          ...prev,
          [PANEL_IDS.DATA_SOURCES]: true,
          [PANEL_IDS.EXTERNAL_PROCESSING]: false
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
      case TASKBAR_PANEL_IDS.REGION_SPECIES:
        setRegionSpeciesPanelOpen(true);
        break;
      case TASKBAR_PANEL_IDS.FEATURE:
        setActiveModule(MODULE_IDS.FEATURE);
        break;
      case TASKBAR_PANEL_IDS.MAP:
        setDenseProcessingActive(false);
        setActiveModule(MODULE_IDS.MAP);
        break;
      case TASKBAR_PANEL_IDS.TEMP_ARCHIVE:
        setTempArchivePanelOpen(true);
        break;
      case TASKBAR_PANEL_IDS.COMPARE:
        setComparePanelOpen(true);
        break;
      case TASKBAR_PANEL_IDS.REPORT:
        setReportPanelOpen(true);
        break;
      case TASKBAR_PANEL_IDS.ANALYSIS:
        setAnalysisPanelOpen(true);
        break;
      case TASKBAR_PANEL_IDS.COMPARE_DIVERSITY:
        setCompareDiversityOpen(true);
        break;
      case TASKBAR_PANEL_IDS.COMPARE_SIMILARITY:
        setCompareSimilarityOpen(true);
        break;
      case TASKBAR_PANEL_IDS.COMPARE_DISTRIBUTION:
        setCompareDistributionOpen(true);
        break;
      case TASKBAR_PANEL_IDS.COMPARE_STATS:
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
    setPanelCollapsed((prev) => collapseOtherPanels(prev, panelId));
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
      // Правило «одна раскрытая»: возвращаем только первую из ранее развёрнутых панелей.
      peerIds.forEach((panelId, index) => {
        next[panelId] = index !== 0;
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
      if (!panelsCollapsedByFeatureRef.current) {
        panelsCollapsedByFeatureRef.current = FEATURE_PEER_PANEL_IDS.filter((panelId) =>
          isPanelExpandedInState(prev, panelId)
        );
      }

      return collapseOtherPanels(prev, PANEL_IDS.FEATURE);
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

      return collapseOtherPanels(next, PANEL_IDS.DENSE);
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
    setDataSourcesPanelOpen(true);
    setPanelMinimized((prev) => ({
      ...prev,
      [PANEL_IDS.GBIF]: false
    }));
    setPanelCollapsed((prev) => collapseOtherPanels(prev, PANEL_IDS.GBIF));
  }, []);

  // Обработка GBIF развёрнута — панель загрузки сворачиваем.
  const expandGbifProcessingPanel = useCallback(() => {
    setExternalProcessingActive(true);
    setPanelMinimized((prev) => ({
      ...prev,
      [PANEL_IDS.GBIF_PROCESSING]: false
    }));
    setPanelCollapsed((prev) => collapseOtherPanels(prev, PANEL_IDS.GBIF_PROCESSING));
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

  return {
    analysisPanelOpen,
    compareDistributionOpen,
    compareDiversityKeys,
    compareDiversityOpen,
    comparePanelOpen,
    compareSimilarityOpen,
    compareStatsKind,
    dataSourcesFocusRequest,
    dataSourcesPanelOpen,
    expandDenseProcessingPanel,
    expandFeaturePanel,
    expandGbifDataPanel,
    expandPanel,
    experimentalPrompt,
    hadFoundYearPropertyFilterRef,
    handleDensePanelCollapsedChange,
    handleFeaturePanelCollapsedChange,
    handleGbifPanelCollapsedChange,
    handleGbifProcessingPanelCollapsedChange,
    handleMinimizePanel,
    handlePanelCollapsedChange,
    isPanelCollapsed,
    isPanelMinimized,
    kdeOverlay,
    minimizePanel,
    panelCollapsed,
    panelMinimized,
    panelTaskbarOrder,
    pendingSharePointRef,
    pinPanelsToTaskbar,
    prevSelectedBoundsFeatureKeyRef,
    previousYearFilterEnabledRef,
    reportPanelOpen,
    restorePanel,
    restorePanelsCollapsedByFeature,
    setAnalysisPanelOpen,
    setCompareDistributionOpen,
    setCompareDiversityKeys,
    setCompareDiversityOpen,
    setComparePanelOpen,
    setCompareSimilarityOpen,
    setCompareStatsKind,
    setDataSourcesFocusRequest,
    setDataSourcesPanelOpen,
    setExperimentalPrompt,
    setKdeOverlay,
    setPanelCollapsed,
    setPanelMinimized,
    setReportPanelOpen,
    setSubmissionCoordinates,
    setSubmissionLocationPicking,
    setTempArchivePanelOpen,
    setTempArchiveStatus,
    stashVisiblePanelsToTaskbarRef,
    submissionCoordinates,
    submissionLocationPicking,
    submissionMapPickHandlerRef,
    tempArchivePanelOpen,
    tempArchiveStatus,
    unpinPanelsFromTaskbar,
  };
}
