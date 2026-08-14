import React, { useState } from "react";
import { ModuleHelpButton, ModuleHelpPanel } from "./ModuleHelp";
import { MODULE_IDS } from "./ModuleMenu";
import PanelCloseButton from "./PanelCloseButton";
import PanelMinimizeButton from "./PanelMinimizeButton";
import "../styles/MapDisplayPanel.css";

/** Краткое описание текущих настроек карты для свёрнутой панели. */
function getCollapsedSummary(
  markersVisible,
  heatmapEnabled,
  clusteringEnabled,
  clusterByRegnum,
  clusterByTempLayers,
  hasTempLayers,
  clusterPieCharts,
  denseClustersHighlight
) {
  const parts = [];

  if (!markersVisible) {
    parts.push("маркеры скрыты");
  }

  if (markersVisible && denseClustersHighlight) {
    parts.push("плотные группы");
  } else if (clusteringEnabled && markersVisible) {
    if (clusterPieCharts) {
      parts.push("диаграммы");
    } else if (clusterByRegnum && hasTempLayers && clusterByTempLayers) {
      parts.push("по царству, по слоям");
    } else if (clusterByRegnum) {
      parts.push("по царству");
    } else if (hasTempLayers && clusterByTempLayers) {
      parts.push("по слоям");
    } else {
      parts.push("кластеризация");
    }
  } else if (markersVisible) {
    parts.push("без кластеризации");
  }

  if (heatmapEnabled) {
    parts.push("тепловая карта");
  }

  return parts.join(", ");
}

/** Панель настроек отображения точек на карте: кластеризация, тепловая карта, видимость маркеров. */
export default function MapDisplayPanel({
  markersVisible = true,
  onMarkersVisibleChange,
  heatmapEnabled = false,
  onHeatmapEnabledChange,
  clusteringEnabled = true,
  onClusteringEnabledChange,
  clusterByRegnum = true,
  onClusterByRegnumChange,
  clusterByTempLayers = true,
  onClusterByTempLayersChange,
  hasTempLayers = false,
  clusterPieCharts = false,
  onClusterPieChartsChange,
  denseClustersHighlight = false,
  onDenseClustersHighlightChange,
  onDenseProcessingOpen,
  mergedPointsVisible = true,
  onMergedPointsVisibleChange,
  collapsed: collapsedProp,
  onCollapsedChange,
  onMinimize,
  onClose
}) {
  const [collapsedInternal, setCollapsedInternal] = useState(true);
  const isControlled = collapsedProp !== undefined;
  const collapsed = isControlled ? collapsedProp : collapsedInternal;
  const setCollapsed = onCollapsedChange ?? setCollapsedInternal;
  const toggleLabel = collapsed ? "Развернуть" : "Свернуть";
  const [helpOpen, setHelpOpen] = useState(false); // раздел ## map в docs/moduleHelp.md
  // Кластеризация имеет смысл только когда маркеры видны.
  const clusteringDisabled = !markersVisible || denseClustersHighlight;
  const clusterPieChartsDisabled = clusteringDisabled || !clusteringEnabled;
  const clusterByRegnumDisabled =
    clusteringDisabled || !clusteringEnabled || clusterPieCharts;
  const clusterByTempLayersDisabled =
    clusteringDisabled || !clusteringEnabled || clusterPieCharts;
  const denseClustersHighlightDisabled = !markersVisible;

  return (
    <aside className={`map-display-panel ${collapsed ? "map-display-panel--collapsed" : ""}`}>
      <div className="map-display-panel-header">
        <h3 className="map-display-panel-title">Группы точек</h3>
        <div className="popup-panel-header-actions">
          <ModuleHelpButton mapToolAccent open={helpOpen} onClick={() => setHelpOpen((value) => !value)} />
          {onMinimize ? <PanelMinimizeButton onClick={onMinimize} /> : null}
          <button
            type="button"
            className="map-display-panel-toggle"
            onClick={() => setCollapsed(!collapsed)}
            aria-expanded={!collapsed}
            aria-label={toggleLabel}
            title={toggleLabel}
          >
            {collapsed ? "▾" : "▴"}
          </button>
          {onClose ? <PanelCloseButton onClick={onClose} /> : null}
        </div>
      </div>

      {collapsed ? (
        <p className="map-display-panel-summary">
          {getCollapsedSummary(
            markersVisible,
            heatmapEnabled,
            clusteringEnabled,
            clusterByRegnum,
            clusterByTempLayers,
            hasTempLayers,
            clusterPieCharts,
            denseClustersHighlight
          )}
        </p>
      ) : (
        <div className="map-display-panel-content">
          <h4 className="map-display-section-title">Кластеризация</h4>

          <label
            className={`map-display-switch${clusteringDisabled ? " map-display-switch--disabled" : ""}`}
            title={
              !markersVisible
                ? "Доступно только при включённых маркерах"
                : denseClustersHighlight
                  ? "Недоступно в режиме плотных групп"
                  : "Кластеризовать близкие точки"
            }
          >
            <input
              type="checkbox"
              checked={clusteringEnabled && !denseClustersHighlight}
              disabled={clusteringDisabled}
              onChange={(e) => onClusteringEnabledChange?.(e.target.checked)}
            />
            <span className="map-display-switch-slider" />
            <span className="map-display-switch-label">Кластеризовать</span>
          </label>

          <label
            className={`map-display-switch${
              clusterByRegnumDisabled ? " map-display-switch--disabled" : ""
            }`}
            title={
              !markersVisible
                ? "Доступно только при включённых маркерах"
                : denseClustersHighlight
                  ? "Недоступно в режиме плотных групп"
                  : !clusteringEnabled
                    ? "Доступно только при включённой кластеризации"
                    : clusterPieCharts
                      ? "Недоступно при включённых диаграммах"
                      : "Кластеризовать только точки с одинаковым царством"
            }
          >
            <input
              type="checkbox"
              checked={clusterByRegnum}
              disabled={clusterByRegnumDisabled}
              onChange={(e) => onClusterByRegnumChange?.(e.target.checked)}
            />
            <span className="map-display-switch-slider" />
            <span className="map-display-switch-label">По царству</span>
          </label>

          {hasTempLayers ? (
            <label
              className={`map-display-switch${
                clusterByTempLayersDisabled ? " map-display-switch--disabled" : ""
              }`}
              title={
                !markersVisible
                  ? "Доступно только при включённых маркерах"
                  : denseClustersHighlight
                    ? "Недоступно в режиме плотных групп"
                    : !clusteringEnabled
                      ? "Доступно только при включённой кластеризации"
                      : clusterPieCharts
                        ? "Недоступно при включённых диаграммах"
                        : "Кластеризовать каждый временный слой отдельно"
              }
            >
              <input
                type="checkbox"
                checked={clusterByTempLayers}
                disabled={clusterByTempLayersDisabled}
                onChange={(e) => onClusterByTempLayersChange?.(e.target.checked)}
              />
              <span className="map-display-switch-slider" />
              <span className="map-display-switch-label">По слоям</span>
            </label>
          ) : null}

          <label
            className={`map-display-switch${
              clusterPieChartsDisabled ? " map-display-switch--disabled" : ""
            }`}
            title={
              !markersVisible
                ? "Доступно только при включённых маркерах"
                : denseClustersHighlight
                  ? "Недоступно в режиме плотных групп"
                  : !clusteringEnabled
                    ? "Доступно только при включённой кластеризации"
                    : "Показывать состав кластера секторной диаграммой; отключает группировку по царству и по слоям"
            }
          >
            <input
              type="checkbox"
              checked={clusterPieCharts}
              disabled={clusterPieChartsDisabled}
              onChange={(e) => onClusterPieChartsChange?.(e.target.checked)}
            />
            <span className="map-display-switch-slider" />
            <span className="map-display-switch-label">Диаграммы</span>
          </label>

          <div
            className={`map-display-dense-row${
              denseClustersHighlightDisabled ? " map-display-dense-row--disabled" : ""
            }`}
          >
            <label
              className={`map-display-switch${
                denseClustersHighlightDisabled ? " map-display-switch--disabled" : ""
              }`}
              title={
                denseClustersHighlightDisabled
                  ? "Доступно только при включённых маркерах"
                  : "Отключить обычную кластеризацию и показать только группы ≥10 точек с полностью одинаковыми координатами; остальные точки скрыть"
              }
            >
              <input
                type="checkbox"
                checked={denseClustersHighlight}
                disabled={denseClustersHighlightDisabled}
                onChange={(e) => onDenseClustersHighlightChange?.(e.target.checked)}
              />
              <span className="map-display-switch-slider" />
              <span className="map-display-switch-label">Плотные группы</span>
            </label>
            <button
              type="button"
              className="map-display-dense-process-btn"
              disabled={denseClustersHighlightDisabled}
              onClick={() => onDenseProcessingOpen?.()}
              title="Открыть панель обработки плотных групп"
            >
              Обработка
            </button>
          </div>

          <hr />

          <label className="map-display-switch" title="Скрыть все маркеры точек на карте">
            <input
              type="checkbox"
              checked={!markersVisible}
              onChange={(e) => onMarkersVisibleChange?.(!e.target.checked)}
            />
            <span className="map-display-switch-slider" />
            <span className="map-display-switch-label">Скрыть точки</span>
          </label>

          <label
            className="map-display-switch"
            title="Показать или скрыть слой точек, полученных слиянием дубликатов"
          >
            <input
              type="checkbox"
              checked={mergedPointsVisible}
              onChange={(e) => onMergedPointsVisibleChange?.(e.target.checked)}
            />
            <span className="map-display-switch-slider" />
            <span className="map-display-switch-label">Слитые точки</span>
          </label>

          <label className="map-display-switch" title="Показать тепловую карту по всем точкам">
            <input
              type="checkbox"
              checked={heatmapEnabled}
              onChange={(e) => onHeatmapEnabledChange?.(e.target.checked)}
            />
            <span className="map-display-switch-slider" />
            <span className="map-display-switch-label">Тепловая карта</span>
          </label>
        </div>
      )}

      <ModuleHelpPanel mapToolAccent sectionId={MODULE_IDS.MAP} open={helpOpen} />
    </aside>
  );
}
