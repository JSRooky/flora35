import React, { useState } from "react";
import { BOUNDS_LAYER_DEFINITIONS } from "../firebase/boundsCollectionFirestore";
import "../styles/BoundsTestPanel.css";

export function createInitialBoundsVisibility() {
  return Object.fromEntries(BOUNDS_LAYER_DEFINITIONS.map(({ id }) => [id, false]));
}

export default function BoundsTestPanel({
  visibility,
  onVisibilityChange,
  loadingById = {},
  errorsById = {},
  firebaseConfigured = false
}) {
  const [collapsed, setCollapsed] = useState(false);
  const enabledCount = BOUNDS_LAYER_DEFINITIONS.filter(({ id }) => visibility[id]).length;

  const handleToggle = (layerId, checked) => {
    onVisibilityChange?.({
      ...visibility,
      [layerId]: checked
    });
  };

  return (
    <aside
      className={`bounds-test-panel${collapsed ? " bounds-test-panel--collapsed" : ""}`}
      aria-label="Слои границ из Firestore"
    >
      <div className="bounds-test-panel-header">
        <h3 className="bounds-test-panel-title">Границы (Firestore)</h3>
        <button
          type="button"
          className="bounds-test-panel-toggle"
          onClick={() => setCollapsed((value) => !value)}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Развернуть" : "Свернуть"}
          title={collapsed ? "Развернуть" : "Свернуть"}
        >
          {collapsed ? "▾" : "▴"}
        </button>
      </div>

      {collapsed ? (
        <p className="bounds-test-panel-summary">
          {enabledCount ? `Включено: ${enabledCount}` : "Все слои выключены"}
        </p>
      ) : (
        <>
          {!firebaseConfigured && (
            <p className="bounds-test-panel-note bounds-test-panel-note--warning">
              Firebase не настроен. Добавьте переменные REACT_APP_FIREBASE_* в `.env.local`.
            </p>
          )}

          <ul className="bounds-test-panel-list">
            {BOUNDS_LAYER_DEFINITIONS.map(({ id, label }) => {
              const loading = Boolean(loadingById[id]);
              const error = errorsById[id];
              const disabled = !firebaseConfigured || loading;

              return (
                <li key={id}>
                  <label
                    className={`bounds-test-panel-switch${disabled ? " bounds-test-panel-switch--disabled" : ""}`}
                    title={label}
                  >
                    <input
                      type="checkbox"
                      checked={Boolean(visibility[id])}
                      disabled={disabled}
                      onChange={(event) => handleToggle(id, event.target.checked)}
                    />
                    <span className="bounds-test-panel-switch-slider" aria-hidden="true" />
                    <span className="bounds-test-panel-switch-label">
                      {label}
                      {loading ? " …" : ""}
                    </span>
                  </label>
                  {error ? <p className="bounds-test-panel-error">{error}</p> : null}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </aside>
  );
}
