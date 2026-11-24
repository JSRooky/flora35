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
  expandPanel,
  isPanelOpen,
  minimizePanel,
  ooptPointsFilterActive,
  panelCollapsed,
  panelMinimized,
  panelTaskbarOrder,
  pinPanelsToTaskbar,
  polygonDockedWithFeature,
  regionSpeciesPanelOpen,
  reportPanelOpen,
  restorePanel,
  selectedBoundsFeature,
  settingsPanelOpen,
  tempArchivePanelOpen,
}) {
  /**
   * Все открытые панели (развёрнутые, свёрнутые и убранные в док).
   * Док показывает их все — см. комментарий в handleTaskbarPanelClick.
   */
  const collectOpenPanelIds = useCallback(() => {
    const ids = [];

    if (denseProcessingActive) {
      ids.push(PANEL_IDS.DENSE);

      if ((activeModule === MODULE_IDS.FEATURE || isPanelOpen(PANEL_IDS.FEATURE))) {
        ids.push(PANEL_IDS.FEATURE);
      }

      if (densePileSpeciesListOpen) {
        ids.push(TASKBAR_PANEL_IDS.DENSE_SPECIES);
      }

      return ids;
    }

    if ((activeModule === MODULE_IDS.FEATURE || isPanelOpen(PANEL_IDS.FEATURE))) {
      ids.push(PANEL_IDS.FEATURE);
    }

    if (
      ((activeModule === MODULE_IDS.AREAL || isPanelOpen(PANEL_IDS.AREAL)) ||
        ((activeModule === MODULE_IDS.FEATURE || isPanelOpen(PANEL_IDS.FEATURE)) && arealDockedWithFeature))
    ) {
      ids.push(PANEL_IDS.AREAL);
    }

    if ((activeModule === MODULE_IDS.STATUS || isPanelOpen(PANEL_IDS.STATUS))) {
      ids.push(PANEL_IDS.STATUS);
    }

    if ((activeModule === MODULE_IDS.MAP || isPanelOpen(PANEL_IDS.MAP))) {
      ids.push(PANEL_IDS.MAP);
    }

    if ((activeModule === MODULE_IDS.YEAR || isPanelOpen(PANEL_IDS.YEAR))) {
      ids.push(PANEL_IDS.YEAR);
    }

    if ((activeModule === MODULE_IDS.SEASONALITY || isPanelOpen(PANEL_IDS.SEASONALITY))) {
      ids.push(PANEL_IDS.SEASONALITY);
    }

    if (
      ((activeModule === MODULE_IDS.POLYGON || isPanelOpen(PANEL_IDS.POLYGON)) ||
        ((activeModule === MODULE_IDS.FEATURE || isPanelOpen(PANEL_IDS.FEATURE)) && polygonDockedWithFeature))
    ) {
      ids.push(PANEL_IDS.POLYGON);
    }

    if (
      ((activeModule === MODULE_IDS.BUFFER || isPanelOpen(PANEL_IDS.BUFFER)) ||
        ((activeModule === MODULE_IDS.FEATURE || isPanelOpen(PANEL_IDS.FEATURE)) && bufferDockedWithFeature))
    ) {
      ids.push(PANEL_IDS.BUFFER);
    }

    if ((activeModule === MODULE_IDS.AREA || isPanelOpen(PANEL_IDS.AREA))) {
      ids.push(PANEL_IDS.AREA);
    }

    if ((activeModule === MODULE_IDS.SEARCH || isPanelOpen(PANEL_IDS.SEARCH))) {
      ids.push(PANEL_IDS.SEARCH);
    }

    if ((activeModule === MODULE_IDS.OOPT || isPanelOpen(PANEL_IDS.OOPT))) {
      ids.push(PANEL_IDS.OOPT);
    }

    if ((activeModule === MODULE_IDS.REGIONS || isPanelOpen(PANEL_IDS.REGIONS))) {
      ids.push(PANEL_IDS.REGIONS);
    }

    if ((activeModule === MODULE_IDS.SUBMIT || isPanelOpen(PANEL_IDS.SUBMIT))) {
      ids.push(PANEL_IDS.SUBMIT);
    }

    if ((activeModule === MODULE_IDS.DATA_WORK || isPanelOpen(PANEL_IDS.DATA_WORK))) {
      ids.push(PANEL_IDS.DATA_WORK);
    }

    if ((activeModule === MODULE_IDS.REDBOOK || isPanelOpen(PANEL_IDS.REDBOOK))) {
      ids.push(PANEL_IDS.REDBOOK);
    }

    if (
      selectedBoundsFeature &&
      ((activeModule === MODULE_IDS.OOPT || isPanelOpen(PANEL_IDS.OOPT)) || ooptPointsFilterActive)
    ) {
      ids.push(PANEL_IDS.OOPT_FEATURE);
    }

    if (
      boundsSpeciesListOpen &&
      selectedBoundsFeature &&
      ((activeModule === MODULE_IDS.OOPT || isPanelOpen(PANEL_IDS.OOPT)) || ooptPointsFilterActive)
    ) {
      ids.push(TASKBAR_PANEL_IDS.OOPT_SPECIES);
    }

    if (regionSpeciesPanelOpen) {
      ids.push(PANEL_IDS.REGION_SPECIES);
    }

    if (dataSourcesPanelOpen) {
      ids.push(PANEL_IDS.DATA_SOURCES);
    }

    if (tempArchivePanelOpen) {
      ids.push(PANEL_IDS.TEMP_ARCHIVE);
    }

    if (settingsPanelOpen) {
      ids.push(PANEL_IDS.SETTINGS);
    }

    if (comparePanelOpen) {
      ids.push(PANEL_IDS.COMPARE);
    }

    if (
      reportPanelOpen &&
      !FEATURE_FLAGS.reportModuleDisabled
    ) {
      ids.push(PANEL_IDS.REPORT);
    }

    if (analysisPanelOpen) {
      ids.push(PANEL_IDS.ANALYSIS);
    }

    if (compareDiversityOpen) {
      ids.push(PANEL_IDS.COMPARE_DIVERSITY);
    }

    if (compareSimilarityOpen) {
      ids.push(PANEL_IDS.COMPARE_SIMILARITY);
    }

    if (compareDistributionOpen) {
      ids.push(PANEL_IDS.COMPARE_DISTRIBUTION);
    }

    if (compareStatsKind) {
      ids.push(PANEL_IDS.COMPARE_STATS);
    }

    if (
      dataSourceMode === DATA_SOURCE_MODES.EXTERNAL &&
      externalProcessingActive
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
    settingsPanelOpen,
    analysisPanelOpen,
    compareDiversityOpen,
    compareSimilarityOpen,
    compareDistributionOpen,
    compareStatsKind,
    densePileSpeciesListOpen,
    denseProcessingActive,
    externalProcessingActive,
    isPanelOpen,
    ooptPointsFilterActive,
    regionSpeciesPanelOpen,
    selectedBoundsFeature
  ]);

  /**
   * Док показывает ВСЕ открытые панели, а не только убранные в него.
   * Порядок берём из panelTaskbarOrder, новые панели дописываем в конец.
   */
  const activeTaskbarPanelIds = useMemo(() => {
    const openIds = collectOpenPanelIds();
    const openSet = new Set(openIds);
    const ordered = panelTaskbarOrder.filter((panelId) => openSet.has(panelId));
    const knownSet = new Set(ordered);
    return [...ordered, ...openIds.filter((panelId) => !knownSet.has(panelId))];
  }, [collectOpenPanelIds, panelTaskbarOrder]);

  /** Развёрнутая панель (по правилу «одна раскрытая» — не больше одной). */
  const expandedTaskbarPanelIds = useMemo(
    () =>
      activeTaskbarPanelIds.filter(
        (panelId) => !panelMinimized[panelId] && panelCollapsed?.[panelId] !== true
      ),
    [activeTaskbarPanelIds, panelMinimized, panelCollapsed]
  );

  /**
   * Клик по иконке в доке:
   * — панель не открыта → открыть (док — реестр всех открытых панелей);
   * — открыта, но убрана в док → вернуть в стек и развернуть;
   * — в стеке, но свёрнута → развернуть (остальные свернутся);
   * — развёрнута → убрать в док.
   */
  const handleTaskbarPanelClick = useCallback(
    (panelId) => {
      if (!collectOpenPanelIds().includes(panelId)) {
        restorePanel(panelId);
        return;
      }

      if (panelMinimized[panelId]) {
        restorePanel(panelId);
        return;
      }

      if (panelCollapsed?.[panelId] === true) {
        expandPanel(panelId);
        return;
      }

      minimizePanel(panelId);
    },
    [
      collectOpenPanelIds,
      panelCollapsed,
      panelMinimized,
      expandPanel,
      minimizePanel,
      restorePanel
    ]
  );

  return { activeTaskbarPanelIds, expandedTaskbarPanelIds, handleTaskbarPanelClick };
}
