import React, { useState } from "react";
import { ModuleHelpButton, ModuleHelpPanel } from "./ModuleHelp";
import { MODULE_IDS } from "./ModuleMenu";
import ContainedPointsFilterRow from "./ContainedPointsFilterRow";
import "../styles/MapDisplayPanel.css";

function formatContainedPointsCount(count) {
  const mod10 = count % 10;
  const mod100 = count % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return `${count} точка`;
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${count} точки`;
  }

  return `${count} точек`;
}

/** Краткое описание текущих настроек карты для свёрнутой панели. */
function getCollapsedSummary(
  markersVisible,
  heatmapEnabled,
  clusteringEnabled,
  clusterByRegnum,
  clusterPieCharts,
  pointsFilterEnabled
) {
  const parts = [];

  if (!markersVisible && !pointsFilterEnabled) {
    parts.push("маркеры скрыты");
  }

  if (pointsFilterEnabled) {
    parts.push("фильтр ООПТ");
  }

  if (clusteringEnabled && markersVisible) {
    if (clusterPieCharts) {
      parts.push("кластеры-диаграммы");
    } else {
      parts.push(clusterByRegnum ? "кластеризация по царству" : "кластеризация");
    }
  } else if (markersVisible) {
    parts.push("без кластеризации");
  }

  if (heatmapEnabled) {
    parts.push("тепловая карта");
  }

  return parts.join(", ");
}

export default function MapDisplayPanel({
  markersVisible = true,
  onMarkersVisibleChange,
  heatmapEnabled = false,
  onHeatmapEnabledChange,
  clusteringEnabled = true,
  onClusteringEnabledChange,
  clusterByRegnum = true,
  onClusterByRegnumChange,
  clusterPieCharts = false,
  onClusterPieChartsChange,
  containedPoints = null,
  pointsFilterEnabled = false,
  onPointsFilterToggle,
  pointsFilterAvailable = false,
  collapsed: collapsedProp,
  onCollapsedChange
}) {
  const [collapsedInternal, setCollapsedInternal] = useState(true);
  const isControlled = collapsedProp !== undefined;
  const collapsed = isControlled ? collapsedProp : collapsedInternal;
  const setCollapsed = onCollapsedChange ?? setCollapsedInternal;
  const toggleLabel = collapsed ? "Развернуть" : "Свернуть";
  const [helpOpen, setHelpOpen] = useState(false); // раздел ## map в docs/moduleHelp.md
  // Кластеризация имеет смысл только когда маркеры видны.
  const clusteringDisabled = !markersVisible;
  const clusterPieChartsDisabled = clusteringDisabled || !clusteringEnabled;
  const clusterByRegnumDisabled =
    clusteringDisabled || !clusteringEnabled || clusterPieCharts;

  return (
    <aside className={`map-display-panel ${collapsed ? "map-display-panel--collapsed" : ""}`}>
      <div className="map-display-panel-header">
        <h3 className="map-display-panel-title">Группы точек</h3>
        <div className="popup-panel-header-actions">
          <ModuleHelpButton mapToolAccent open={helpOpen} onClick={() => setHelpOpen((value) => !value)} />
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
        </div>
      </div>

      {collapsed ? (
        <p className="map-display-panel-summary">
          {getCollapsedSummary(
            markersVisible,
            heatmapEnabled,
            clusteringEnabled,
            clusterByRegnum,
            clusterPieCharts,
            pointsFilterEnabled
          )}
        </p>
      ) : (
        <div className="map-display-panel-content">
          <h4 className="map-display-section-title">Кластеризация</h4>

          <label
            className={`map-display-switch${clusteringDisabled ? " map-display-switch--disabled" : ""}`}
            title={
              clusteringDisabled
                ? "Доступно только при включённых маркерах"
                : "Группировать близкие точки в кластеры"
            }
          >
            <input
              type="checkbox"
              checked={clusteringEnabled}
              disabled={clusteringDisabled}
              onChange={(e) => onClusteringEnabledChange?.(e.target.checked)}
            />
            <span className="map-display-switch-slider" />
            <span className="map-display-switch-label">Группировать точки</span>
          </label>

          <label
            className={`map-display-switch${
              clusterByRegnumDisabled ? " map-display-switch--disabled" : ""
            }`}
            title={
              clusteringDisabled
                ? "Доступно только при включённых маркерах"
                : !clusteringEnabled
                  ? "Доступно только при включённой кластеризации"
                  : clusterPieCharts
                    ? "Недоступно при включённых кластерах-диаграммах"
                    : "Группировать в кластеры только точки с одинаковым regnum"
            }
          >
            <input
              type="checkbox"
              checked={clusterByRegnum}
              disabled={clusterByRegnumDisabled}
              onChange={(e) => onClusterByRegnumChange?.(e.target.checked)}
            />
            <span className="map-display-switch-slider" />
            <span className="map-display-switch-label">Группировать по царству</span>
          </label>

          <label
            className={`map-display-switch${
              clusterPieChartsDisabled ? " map-display-switch--disabled" : ""
            }`}
            title={
              clusteringDisabled
                ? "Доступно только при включённых маркерах"
                : !clusteringEnabled
                  ? "Доступно только при включённой кластеризации"
                  : "Показывать состав кластера секторной диаграммой; отключает группировку по царству"
            }
          >
            <input
              type="checkbox"
              checked={clusterPieCharts}
              disabled={clusterPieChartsDisabled}
              onChange={(e) => onClusterPieChartsChange?.(e.target.checked)}
            />
            <span className="map-display-switch-slider" />
            <span className="map-display-switch-label">Кластеры-диаграммы</span>
          </label>

          <hr />

          <label className="map-display-switch" title="Показывать точки на карте">
            <input
              type="checkbox"
              checked={markersVisible}
              onChange={(e) => onMarkersVisibleChange?.(e.target.checked)}
            />
            <span className="map-display-switch-slider" />
            <span className="map-display-switch-label">Маркеры</span>
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

          <hr />

          <ContainedPointsFilterRow
            summary={
              <>
                {pointsFilterEnabled ? "В выбранной ООПТ" : "Точек в ООПТ"}:{" "}
                <strong>{formatContainedPointsCount(containedPoints?.count ?? 0)}</strong>
              </>
            }
            pointsFilterEnabled={pointsFilterEnabled}
            onPointsFilterToggle={onPointsFilterToggle}
            pointsFilterAvailable={pointsFilterAvailable}
          />
        </div>
      )}
      <ModuleHelpPanel mapToolAccent sectionId={MODULE_IDS.MAP} open={helpOpen} />
    </aside>
  );
}
