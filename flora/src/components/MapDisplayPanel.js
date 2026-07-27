import React, { useState } from "react";
import { ModuleHelpButton, ModuleHelpPanel } from "./ModuleHelp";
import { MODULE_IDS } from "./ModuleMenu";
import "../styles/MapDisplayPanel.css";

/** Краткое описание текущих настроек карты для свёрнутой панели. */
function getCollapsedSummary(
  markersVisible,
  heatmapEnabled,
  clusteringEnabled,
  clusterByRegnum
) {
  const parts = [];

  if (!markersVisible) {
    parts.push("маркеры скрыты");
  }

  if (clusteringEnabled && markersVisible) {
    parts.push(clusterByRegnum ? "кластеризация по царству" : "кластеризация");
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
  collapsed: collapsedProp,
  onCollapsedChange
}) {
  const [collapsedInternal, setCollapsedInternal] = useState(true);
  const isControlled = collapsedProp !== undefined;
  const collapsed = isControlled ? collapsedProp : collapsedInternal;
  const setCollapsed = onCollapsedChange ?? setCollapsedInternal;
  const toggleLabel = collapsed ? "Развернуть" : "Свернуть";
  const [helpOpen, setHelpOpen] = useState(false);
  // Кластеризация имеет смысл только когда маркеры видны.
  const clusteringDisabled = !markersVisible;

  return (
    <aside className={`map-display-panel ${collapsed ? "map-display-panel--collapsed" : ""}`}>
      <div className="map-display-panel-header">
        <h3 className="map-display-panel-title">Операции с картой</h3>
        <div className="popup-panel-header-actions">
          <ModuleHelpButton open={helpOpen} onClick={() => setHelpOpen((value) => !value)} />
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
            clusterByRegnum
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
              clusteringDisabled || !clusteringEnabled ? " map-display-switch--disabled" : ""
            }`}
            title={
              clusteringDisabled
                ? "Доступно только при включённых маркерах"
                : clusteringEnabled
                  ? "Группировать в кластеры только точки с одинаковым regnum"
                  : "Доступно только при включённой кластеризации"
            }
          >
            <input
              type="checkbox"
              checked={clusterByRegnum}
              disabled={clusteringDisabled || !clusteringEnabled}
              onChange={(e) => onClusterByRegnumChange?.(e.target.checked)}
            />
            <span className="map-display-switch-slider" />
            <span className="map-display-switch-label">Группировать по царству</span>
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
        </div>
      )}
      <ModuleHelpPanel sectionId={MODULE_IDS.MAP} open={helpOpen} />
    </aside>
  );
}
