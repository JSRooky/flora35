/** app/taskbarDomain.js — домен, вынесенный из App.js механически (без изменения поведения). */
import { useCallback, useMemo } from "react";
import { PANEL_IDS } from "./panelConstants";
import { MODULE_IDS } from "../components/ModuleMenu";
import { TASKBAR_PANEL_IDS } from "../panelTaskbarRegistry";
import { FEATURE_FLAGS } from "../config/featureFlags";
import { DATA_SOURCE_MODES } from "../locations/loadPoints";

/**
 * @param {object} deps — значения из App.js, захваченные замыканиями вынесенного кода.
 */
export function useTaskbarDomain({
  activeModule,
  analysisPanelOpen,
  arealDockedWithFeature,
  boundsSpeciesListOpen,
  bufferDockedWithFeature,
  compareDistributionOpen,
  compareDiversityOpen,
  comparePanelOpen,
  compareSimilarityOpen,
  compareStatsKind,
  dataSourceMode,
  dataSourcesPanelOpen,
  densePileSpeciesListOpen,
  denseProcessingActive,
  externalProcessingActive,
  minimizePanel,
  ooptPointsFilterActive,
  panelMinimized,
  panelTaskbarOrder,
  pinPanelsToTaskbar,
  polygonDockedWithFeature,
  regionSpeciesPanelOpen,
  reportPanelOpen,
  restorePanel,
  selectedBoundsFeature,
  setPanelMinimized,
  stashVisiblePanelsToTaskbarRef,
  tempArchivePanelOpen,
}) {
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

    if (activeModule === MODULE_IDS.SEASONALITY && !isMin(PANEL_IDS.SEASONALITY)) {
      ids.push(PANEL_IDS.SEASONALITY);
    }

    if (
      (activeModule === MODULE_IDS.POLYGON ||
        (activeModule === MODULE_IDS.FEATURE && polygonDockedWithFeature)) &&
      !isMin(PANEL_IDS.POLYGON)
    ) {
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

    if (activeModule === MODULE_IDS.SEARCH && !isMin(PANEL_IDS.SEARCH)) {
      ids.push(PANEL_IDS.SEARCH);
    }

    if (activeModule === MODULE_IDS.OOPT && !isMin(PANEL_IDS.OOPT)) {
      ids.push(PANEL_IDS.OOPT);
    }

    if (activeModule === MODULE_IDS.REGIONS && !isMin(PANEL_IDS.REGIONS)) {
      ids.push(PANEL_IDS.REGIONS);
    }

    if (activeModule === MODULE_IDS.SUBMIT && !isMin(PANEL_IDS.SUBMIT)) {
      ids.push(PANEL_IDS.SUBMIT);
    }

    if (activeModule === MODULE_IDS.DATA_WORK && !isMin(PANEL_IDS.DATA_WORK)) {
      ids.push(PANEL_IDS.DATA_WORK);
    }

    if (activeModule === MODULE_IDS.REDBOOK && !isMin(PANEL_IDS.REDBOOK)) {
      ids.push(PANEL_IDS.REDBOOK);
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

    if (regionSpeciesPanelOpen && !isMin(PANEL_IDS.REGION_SPECIES)) {
      ids.push(PANEL_IDS.REGION_SPECIES);
    }

    if (dataSourcesPanelOpen) {
      ids.push(PANEL_IDS.DATA_SOURCES);
    }

    if (tempArchivePanelOpen && !isMin(PANEL_IDS.TEMP_ARCHIVE)) {
      ids.push(PANEL_IDS.TEMP_ARCHIVE);
    }

    if (comparePanelOpen && !isMin(PANEL_IDS.COMPARE)) {
      ids.push(PANEL_IDS.COMPARE);
    }

    if (
      reportPanelOpen &&
      !FEATURE_FLAGS.reportModuleDisabled &&
      !isMin(PANEL_IDS.REPORT)
    ) {
      ids.push(PANEL_IDS.REPORT);
    }

    if (analysisPanelOpen && !isMin(PANEL_IDS.ANALYSIS)) {
      ids.push(PANEL_IDS.ANALYSIS);
    }

    if (compareDiversityOpen && !isMin(PANEL_IDS.COMPARE_DIVERSITY)) {
      ids.push(PANEL_IDS.COMPARE_DIVERSITY);
    }

    if (compareSimilarityOpen && !isMin(PANEL_IDS.COMPARE_SIMILARITY)) {
      ids.push(PANEL_IDS.COMPARE_SIMILARITY);
    }

    if (compareDistributionOpen && !isMin(PANEL_IDS.COMPARE_DISTRIBUTION)) {
      ids.push(PANEL_IDS.COMPARE_DISTRIBUTION);
    }

    if (compareStatsKind && !isMin(PANEL_IDS.COMPARE_STATS)) {
      ids.push(PANEL_IDS.COMPARE_STATS);
    }

    if (
      dataSourceMode === DATA_SOURCE_MODES.EXTERNAL &&
      externalProcessingActive &&
      !isMin(PANEL_IDS.EXTERNAL_PROCESSING)
    ) {
      ids.push(PANEL_IDS.EXTERNAL_PROCESSING);
    }

    return ids;
  }, [
    activeModule,
    arealDockedWithFeature,
    boundsSpeciesListOpen,
    bufferDockedWithFeature,
    polygonDockedWithFeature,
    dataSourceMode,
    dataSourcesPanelOpen,
    tempArchivePanelOpen,
    comparePanelOpen,
    reportPanelOpen,
    analysisPanelOpen,
    compareDiversityOpen,
    compareSimilarityOpen,
    compareDistributionOpen,
    compareStatsKind,
    densePileSpeciesListOpen,
    denseProcessingActive,
    externalProcessingActive,
    ooptPointsFilterActive,
    panelMinimized,
    regionSpeciesPanelOpen,
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

  return { activeTaskbarPanelIds, handleTaskbarPanelClick };
}
