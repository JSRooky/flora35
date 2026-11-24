/** app/externalSourcesDomain.js — домен, вынесенный из App.js механически (без изменения поведения). */
import { useState, useEffect, useCallback } from "react";
import { isExternalSourcesLoadActive, subscribeExternalSourcesLoad } from "../externalSources/externalSourcesLoadManager";
import { PANEL_IDS } from "./panelConstants";
import { DATA_SOURCE_MODES } from "../locations/loadPoints";
import { matchMapRegionsToExternal } from "../externalSources/matchMapRegionToExternal";
import { applyBufferToExternalRegion } from "../externalSources/bufferedSpatialRegion";

/**
 * @param {object} deps — значения из App.js, захваченные замыканиями вынесенного кода.
 */
export function useExternalSourcesDomain({
  dataSourceMode,
  dataSourcesPanelOpen,
  handleDataSourceModeChange,
  isPanelMinimized,
  minimizePanel,
  overlayRegionBufferKm,
  overlayRegionEdit,
  pinPanelsToTaskbar,
  regionBufferKm,
  regionCatalog,
  restorePanel,
  selectedRegionIsos,
  setDataSourcesFocusRequest,
  setDataSourcesPanelOpen,
  setExternalProcessingActive,
  setPanelMinimized,
  unpinPanelsFromTaskbar,
}) {
  const [externalSourcesLoadActive, setExternalSourcesLoadActive] = useState(
    () => isExternalSourcesLoadActive()
  );

  useEffect(() => {
    return subscribeExternalSourcesLoad((snap) => {
      setExternalSourcesLoadActive(Boolean(snap.gbif.loading || snap.inat.loading));
    });
  }, []);

  useEffect(() => {
    if (!externalSourcesLoadActive) {
      return;
    }
    pinPanelsToTaskbar([PANEL_IDS.DATA_SOURCES]);
  }, [externalSourcesLoadActive, pinPanelsToTaskbar]);

  const handleOpenExternalLoadPanel = useCallback(() => {
    if (
      dataSourceMode !== DATA_SOURCE_MODES.EXTERNAL &&
      dataSourceMode !== DATA_SOURCE_MODES.TEMP
    ) {
      handleDataSourceModeChange(DATA_SOURCE_MODES.EXTERNAL);
    }
    restorePanel(PANEL_IDS.DATA_SOURCES);
  }, [dataSourceMode, handleDataSourceModeChange, restorePanel]);

  const handleRegionOpenDataLoad = useCallback(
    (kind, includeBuffer = false) => {
      const overlayActive = overlayRegionEdit.active;
      const entries = overlayActive
        ? overlayRegionEdit.isos.map((iso) => {
            const catalogEntry = regionCatalog.find((item) => item.iso === iso);
            const overlayFeature =
              overlayRegionEdit.features.find((feature) => feature.properties?.iso === iso) ||
              catalogEntry?.feature;
            return (
              catalogEntry || {
                iso,
                name: overlayFeature?.properties?.name || iso,
                nameEn: overlayFeature?.properties?.name_en || "",
                feature: overlayFeature
              }
            );
          })
        : selectedRegionIsos
            .map((iso) => regionCatalog.find((item) => item.iso === iso))
            .filter(Boolean);

      const { matched, unmatched } = matchMapRegionsToExternal(entries);
      const activeBufferKm = overlayActive ? overlayRegionBufferKm : regionBufferKm;
      const spatialByRegionId = {};
      if (includeBuffer && activeBufferKm > 0) {
        matched.forEach(({ region, feature }) => {
          const buffered = applyBufferToExternalRegion(region, feature, activeBufferKm);
          if (buffered) {
            spatialByRegionId[region.id] = buffered;
          }
        });
      }

      setDataSourcesFocusRequest({
        kind,
        // Пустой список совпадений означает "не удалось сопоставить регион",
        // а не "нужно показать пустую таблицу" — в этом случае показываем
        // полный список регионов, как без выделения.
        regions: matched.length > 0 ? matched.map((item) => item.region) : null,
        spatialByRegionId:
          Object.keys(spatialByRegionId).length > 0 ? spatialByRegionId : null,
        unmatchedLabels: unmatched
      });
      handleOpenExternalLoadPanel();
    },
    [
      handleOpenExternalLoadPanel,
      overlayRegionBufferKm,
      overlayRegionEdit,
      regionBufferKm,
      regionCatalog,
      selectedRegionIsos
    ]
  );

  const handleDataSourcesPanelToggle = useCallback(() => {
    if (dataSourcesPanelOpen) {
      if (isPanelMinimized(PANEL_IDS.DATA_SOURCES)) {
        restorePanel(PANEL_IDS.DATA_SOURCES);
        return;
      }
      if (isExternalSourcesLoadActive()) {
        minimizePanel(PANEL_IDS.DATA_SOURCES);
        return;
      }
      setDataSourcesPanelOpen(false);
      setDataSourcesFocusRequest(null);
      setExternalProcessingActive(false);
      setPanelMinimized((prev) => ({
        ...prev,
        [PANEL_IDS.DATA_SOURCES]: true,
        [PANEL_IDS.EXTERNAL_PROCESSING]: true
      }));
      unpinPanelsFromTaskbar([
        PANEL_IDS.DATA_SOURCES,
        PANEL_IDS.EXTERNAL_PROCESSING
      ]);
      return;
    }

    handleOpenExternalLoadPanel();
  }, [
    dataSourcesPanelOpen,
    handleOpenExternalLoadPanel,
    isPanelMinimized,
    minimizePanel,
    restorePanel,
    unpinPanelsFromTaskbar
  ]);

  return {
    externalSourcesLoadActive,
    handleDataSourcesPanelToggle,
    handleOpenExternalLoadPanel,
    handleRegionOpenDataLoad,
  };
}
