import React, { useMemo, useState } from "react";
import {
  BOUNDS_LAYER_DEFINITIONS,
  countVisibleBoundsFeatures
} from "../firebase/boundsCollectionFirestore";
import { ModuleHelpButton, ModuleHelpPanel } from "./ModuleHelp";
import { MODULE_IDS } from "./ModuleMenu";
import "../styles/OoptPanel.css";

function getAllCatalogEntries(catalogByLayerId) {
  return BOUNDS_LAYER_DEFINITIONS.flatMap(({ id }) => catalogByLayerId[id] ?? []);
}

function normalizeSearchQuery(value) {
  return value.trim().toLocaleLowerCase("ru");
}

function matchesSearch(entry, query) {
  if (!query) {
    return true;
  }

  const haystack = [entry.title, entry.subtitle]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("ru");

  return haystack.includes(query);
}

function getCollapsedSummary(catalogByLayerId, featureVisibility, markersVisible) {
  const totalCount = BOUNDS_LAYER_DEFINITIONS.reduce(
    (sum, { id }) => sum + (catalogByLayerId[id]?.length ?? 0),
    0
  );
  const visibleCount = countVisibleBoundsFeatures(featureVisibility);
  const parts = [];

  if (!totalCount) {
    parts.push("Список загружается…");
  } else if (!visibleCount) {
    parts.push(`Объектов: ${totalCount}, все скрыты`);
  } else {
    parts.push(`Показано: ${visibleCount} из ${totalCount}`);
  }

  if (!markersVisible) {
    parts.push("маркеры скрыты");
  }

  return parts.join(", ");
}

function BoundsGroupSection({
  definition,
  catalog = [],
  featureVisibility,
  loading,
  error,
  searchQuery,
  collapsed,
  onCollapsedChange,
  onFeatureVisibilityChange,
  onGroupVisibilityChange,
  onFeatureSelect
}) {
  const filteredEntries = useMemo(
    () => catalog.filter((entry) => matchesSearch(entry, searchQuery)),
    [catalog, searchQuery]
  );
  const visibleInGroup = filteredEntries.filter((entry) => featureVisibility[entry.key]).length;
  const allVisible = filteredEntries.length > 0 && visibleInGroup === filteredEntries.length;
  const someVisible = visibleInGroup > 0 && !allVisible;

  const handleGroupToggle = (event) => {
    onGroupVisibilityChange?.(
      definition.id,
      filteredEntries.map((entry) => entry.key),
      event.target.checked
    );
  };

  return (
    <section className="oopt-panel-group">
      <div className="oopt-panel-group-header">
        <button
          type="button"
          className="oopt-panel-group-toggle"
          onClick={() => onCollapsedChange?.(!collapsed)}
          aria-expanded={!collapsed}
        >
          <span className="oopt-panel-group-chevron" aria-hidden="true">
            {collapsed ? "▸" : "▾"}
          </span>
          <span className="oopt-panel-group-title">
            {definition.label}
            <span className="oopt-panel-group-count"> ({catalog.length})</span>
          </span>
        </button>

        {filteredEntries.length > 0 ? (
          <label
            className="oopt-panel-switch oopt-panel-group-switch"
            title={allVisible ? "Скрыть все в группе" : "Показать все в группе"}
          >
            <input
              type="checkbox"
              checked={allVisible}
              ref={(element) => {
                if (element) {
                  element.indeterminate = someVisible;
                }
              }}
              onChange={handleGroupToggle}
              aria-label={
                allVisible ? "Скрыть все в группе" : "Показать все в группе"
              }
            />
            <span className="oopt-panel-switch-slider" aria-hidden="true" />
          </label>
        ) : null}
      </div>

      {!collapsed ? (
        <div className="oopt-panel-group-body">
          {loading ? <p className="oopt-panel-note">Загрузка…</p> : null}
          {error ? <p className="oopt-panel-error">{error}</p> : null}

          {!loading && !error && filteredEntries.length === 0 ? (
            <p className="oopt-panel-note">
              {searchQuery ? "Ничего не найдено" : "Нет объектов"}
            </p>
          ) : null}

          {!loading && filteredEntries.length > 0 ? (
            <ul className="oopt-panel-object-list">
              {filteredEntries.map((entry) => {
                const checked = Boolean(featureVisibility[entry.key]);

                return (
                  <li key={entry.key} className="oopt-panel-object-item">
                    <label className="oopt-panel-checkbox" title={entry.title}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) =>
                          onFeatureVisibilityChange?.(entry.key, event.target.checked)
                        }
                      />
                    </label>

                    <button
                      type="button"
                      className={`oopt-panel-object-btn${checked ? " oopt-panel-object-btn--active" : ""}`}
                      onClick={() => onFeatureSelect?.(entry)}
                      title="Показать сведения и перейти к объекту"
                    >
                      <span className="oopt-panel-object-title">{entry.title}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export default function OoptPanel({
  catalogByLayerId = {},
  featureVisibility = {},
  onFeatureVisibilityChange,
  onGroupVisibilityChange,
  onFeatureSelect,
  loadingById = {},
  errorsById = {},
  firebaseConfigured = false,
  markersVisible = true,
  onMarkersVisibleChange,
  collapsed: collapsedProp,
  onCollapsedChange
}) {
  const [collapsedInternal, setCollapsedInternal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [collapsedGroups, setCollapsedGroups] = useState(() =>
    Object.fromEntries(BOUNDS_LAYER_DEFINITIONS.map(({ id }) => [id, true]))
  );
  const [helpOpen, setHelpOpen] = useState(false);
  const isControlled = collapsedProp !== undefined;
  const collapsed = isControlled ? collapsedProp : collapsedInternal;
  const setCollapsed = onCollapsedChange ?? setCollapsedInternal;
  const toggleLabel = collapsed ? "Развернуть" : "Свернуть";
  const normalizedSearchQuery = normalizeSearchQuery(searchQuery);
  const allCatalogEntries = getAllCatalogEntries(catalogByLayerId);
  const allPolygonsVisible =
    allCatalogEntries.length > 0 &&
    allCatalogEntries.every((entry) => featureVisibility[entry.key]);

  return (
    <aside className={`oopt-panel ${collapsed ? "oopt-panel--collapsed" : ""}`} aria-label="ООПТ">
      <div className="oopt-panel-header">
        <h3 className="oopt-panel-title">ООПТ</h3>
        <div className="popup-panel-header-actions">
          <ModuleHelpButton
            mapToolAccent
            open={helpOpen}
            onClick={() => setHelpOpen((value) => !value)}
          />
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
      </div>

      {collapsed ? (
        <p className="oopt-panel-summary">
          {getCollapsedSummary(catalogByLayerId, featureVisibility, markersVisible)}
        </p>
      ) : (
        <div className="oopt-panel-content">
          {!firebaseConfigured && (
            <p className="oopt-panel-note oopt-panel-note--warning">
              Firebase не настроен. Добавьте переменные REACT_APP_FIREBASE_* в `.env.local`.
            </p>
          )}

          <label className="oopt-panel-switch" title="Скрыть все маркеры точек на карте">
            <input
              type="checkbox"
              checked={!markersVisible}
              onChange={(event) => onMarkersVisibleChange?.(!event.target.checked)}
            />
            <span className="oopt-panel-switch-slider" aria-hidden="true" />
            <span className="oopt-panel-switch-label">Скрыть точки</span>
          </label>

          <label
            className={`oopt-panel-switch${!firebaseConfigured || !allCatalogEntries.length ? " oopt-panel-switch--disabled" : ""}`}
            title="Показать или скрыть все полигоны ООПТ и заповедников на карте"
          >
            <input
              type="checkbox"
              checked={allPolygonsVisible}
              disabled={!firebaseConfigured || !allCatalogEntries.length}
              onChange={(event) =>
                onGroupVisibilityChange?.(
                  null,
                  allCatalogEntries.map((entry) => entry.key),
                  event.target.checked
                )
              }
            />
            <span className="oopt-panel-switch-slider" aria-hidden="true" />
            <span className="oopt-panel-switch-label">Показать все ООПТ</span>
          </label>

          <label className="oopt-panel-search">
            <span className="oopt-panel-search-label">Поиск</span>
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Название или категория…"
              disabled={!firebaseConfigured}
            />
          </label>

          {BOUNDS_LAYER_DEFINITIONS.map((definition) => (
            <BoundsGroupSection
              key={definition.id}
              definition={definition}
              catalog={catalogByLayerId[definition.id] ?? []}
              featureVisibility={featureVisibility}
              loading={Boolean(loadingById[definition.id])}
              error={errorsById[definition.id]}
              searchQuery={normalizedSearchQuery}
              collapsed={Boolean(collapsedGroups[definition.id])}
              onCollapsedChange={(nextCollapsed) =>
                setCollapsedGroups((prev) => ({ ...prev, [definition.id]: nextCollapsed }))
              }
              onFeatureVisibilityChange={onFeatureVisibilityChange}
              onGroupVisibilityChange={onGroupVisibilityChange}
              onFeatureSelect={onFeatureSelect}
            />
          ))}
        </div>
      )}

      <ModuleHelpPanel mapToolAccent sectionId={MODULE_IDS.OOPT} open={helpOpen} />
    </aside>
  );
}
