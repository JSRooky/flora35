import React, { useState } from "react";
import { BOUNDS_LAYER_DEFINITIONS } from "../firebase/boundsCollectionFirestore";
import "../styles/OoptPanel.css";

export function createInitialBoundsVisibility() {
  return Object.fromEntries(BOUNDS_LAYER_DEFINITIONS.map(({ id }) => [id, false]));
}

function getCollapsedSummary(visibility, markersVisible) {
  const parts = [];
  const enabledCount = BOUNDS_LAYER_DEFINITIONS.filter(({ id }) => visibility[id]).length;

  if (!enabledCount) {
    parts.push("все слои выключены");
  } else {
    parts.push(`слои: ${enabledCount}`);
  }

  if (!markersVisible) {
    parts.push("маркеры скрыты");
  }

  return parts.join(", ");
}

export default function OoptPanel({
  visibility,
  onVisibilityChange,
  loadingById = {},
  errorsById = {},
  firebaseConfigured = false,
  markersVisible = true,
  onMarkersVisibleChange,
  collapsed: collapsedProp,
  onCollapsedChange
}) {
  const [collapsedInternal, setCollapsedInternal] = useState(false);
  const isControlled = collapsedProp !== undefined;
  const collapsed = isControlled ? collapsedProp : collapsedInternal;
  const setCollapsed = onCollapsedChange ?? setCollapsedInternal;
  const toggleLabel = collapsed ? "Развернуть" : "Свернуть";

  const handleToggle = (layerId, checked) => {
    onVisibilityChange?.({
      ...visibility,
      [layerId]: checked
    });
  };

  return (
    <aside className={`oopt-panel ${collapsed ? "oopt-panel--collapsed" : ""}`} aria-label="ООПТ">
      <div className="oopt-panel-header">
        <h3 className="oopt-panel-title">ООПТ</h3>
        <button
          type="button"
          className="oopt-panel-toggle"
          onClick={() => setCollapsed(!collapsed)}
          aria-expanded={!collapsed}
          aria-label={toggleLabel}
          title={toggleLabel}
        >
          {collapsed ? "▾" : "▴"}
        </button>
      </div>

      {collapsed ? (
        <p className="oopt-panel-summary">{getCollapsedSummary(visibility, markersVisible)}</p>
      ) : (
        <div className="oopt-panel-content">
          {!firebaseConfigured && (
            <p className="oopt-panel-note oopt-panel-note--warning">
              Firebase не настроен. Добавьте переменные REACT_APP_FIREBASE_* в `.env.local`.
            </p>
          )}

          <ul className="oopt-panel-list">
            {BOUNDS_LAYER_DEFINITIONS.map(({ id, label }) => {
              const loading = Boolean(loadingById[id]);
              const error = errorsById[id];
              const disabled = !firebaseConfigured || loading;

              return (
                <li key={id}>
                  <label
                    className={`oopt-panel-switch${disabled ? " oopt-panel-switch--disabled" : ""}`}
                    title={label}
                  >
                    <input
                      type="checkbox"
                      checked={Boolean(visibility[id])}
                      disabled={disabled}
                      onChange={(event) => handleToggle(id, event.target.checked)}
                    />
                    <span className="oopt-panel-switch-slider" aria-hidden="true" />
                    <span className="oopt-panel-switch-label">
                      {label}
                      {loading ? " …" : ""}
                    </span>
                  </label>
                  {error ? <p className="oopt-panel-error">{error}</p> : null}
                </li>
              );
            })}
          </ul>

          <hr className="oopt-panel-divider" />

          <label className="oopt-panel-switch" title="Показывать точки находок на карте">
            <input
              type="checkbox"
              checked={markersVisible}
              onChange={(event) => onMarkersVisibleChange?.(event.target.checked)}
            />
            <span className="oopt-panel-switch-slider" aria-hidden="true" />
            <span className="oopt-panel-switch-label">Маркеры</span>
          </label>
        </div>
      )}
    </aside>
  );
}
