import React, { useState } from "react";
import MapDisplayPanel from "./MapDisplayPanel";
import PanelCloseButton from "./PanelCloseButton";
import PanelMinimizeButton from "./PanelMinimizeButton";
import { REGNUM_ORDER, getRegnumLabel } from "./featurePropertyLabels";
import { DEFAULT_CLUSTER_REGNUM_COLORS } from "./pointColors";
import "../styles/SettingsPanel.css";

export default function SettingsPanel({
  mapDisplayProps,
  clusterRegnumColors = DEFAULT_CLUSTER_REGNUM_COLORS,
  onClusterRegnumColorChange,
  onResetClusterRegnumColors,
  hoverTooltipsDisabled = false,
  onHoverTooltipsDisabledChange,
  collapsed: collapsedProp,
  onCollapsedChange,
  onMinimize,
  onClose
}) {
  const [collapsedInternal, setCollapsedInternal] = useState(false);
  const collapsed = collapsedProp ?? collapsedInternal;
  const setCollapsed = onCollapsedChange ?? setCollapsedInternal;
  const toggleLabel = collapsed ? "Развернуть" : "Свернуть";
  const lowPerformanceMode = Boolean(mapDisplayProps?.lowPerformanceMode);

  return (
    <aside className={`settings-panel${collapsed ? " settings-panel--collapsed" : ""}`}>
      <div className="settings-panel-header">
        <h3 className="settings-panel-title">Настройки</h3>
        <div className="popup-panel-header-actions">
          {onMinimize ? <PanelMinimizeButton onClick={onMinimize} /> : null}
          <button
            type="button"
            className="settings-panel-toggle"
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
        <p className="settings-panel-summary">Отображение карты, цвета и подсказки</p>
      ) : (
        <div className="settings-panel-content">
          <h4 className="map-display-section-title">Отображение карты</h4>
          <MapDisplayPanel
            {...mapDisplayProps}
            collapsed={false}
            embedded
            showClusteringOptions={false}
          />
          <hr />
          <h4 className="map-display-section-title">Цвета царств в кластерах</h4>
          <div className="settings-panel-regnum-colors">
            {REGNUM_ORDER.map((regnum) => {
              const label = getRegnumLabel(regnum);
              return (
                <label key={regnum} className="settings-panel-regnum-color">
                  <span>{label}</span>
                  <input
                    type="color"
                    value={clusterRegnumColors[regnum] ?? DEFAULT_CLUSTER_REGNUM_COLORS[regnum]}
                    onChange={(event) =>
                      onClusterRegnumColorChange?.(regnum, event.target.value)
                    }
                    aria-label={`Цвет царства: ${label}`}
                  />
                </label>
              );
            })}
          </div>
          <button
            type="button"
            className="settings-panel-reset-colors"
            onClick={() => onResetClusterRegnumColors?.()}
          >
            Сбросить цвета
          </button>
          <hr />
          <h4 className="map-display-section-title">Подсказки</h4>
          <label
            className="map-display-switch"
            title="Настройка сохраняется отдельно. Режим слабых ПК временно отключает подсказки независимо от этого переключателя."
          >
            <input
              type="checkbox"
              checked={!hoverTooltipsDisabled}
              onChange={(event) =>
                onHoverTooltipsDisabledChange?.(!event.target.checked)
              }
            />
            <span className="map-display-switch-slider" />
            <span className="map-display-switch-label">Подсказки при наведении</span>
          </label>
          {lowPerformanceMode ? (
            <p className="settings-panel-hint">
              Подсказки временно отключены режимом слабых ПК. Выбранная настройка
              применится после его выключения.
            </p>
          ) : null}
        </div>
      )}
    </aside>
  );
}
