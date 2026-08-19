import React, { useMemo, useState } from "react";
import { ModuleHelpButton, ModuleHelpPanel } from "./ModuleHelp";
import { MODULE_IDS } from "./ModuleMenu";
import PanelCloseButton from "./PanelCloseButton";
import PanelMinimizeButton from "./PanelMinimizeButton";
import RegionBoundsDisplaySettings from "./RegionBoundsSettingsPanel";
import { FilterIcon } from "../images/buttons";
import "../styles/RegionPanel.css";

const FEDERAL_DISTRICT_ORDER = ["ЦФО", "СЗФО", "ЮФО", "СКФО", "ПФО", "УФО", "СФО", "ДФО"];

function normalizeSearchQuery(value) {
  return value.trim().toLocaleLowerCase("ru");
}

function matchesSearch(entry, query) {
  if (!query) {
    return true;
  }

  const haystack = [entry.name, entry.nameEn, entry.iso, entry.fo]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("ru");

  return haystack.includes(query);
}

function groupCatalog(catalog) {
  const groups = new Map();

  catalog.forEach((entry) => {
    const key = entry.fo || "Прочие";
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(entry);
  });

  const orderedKeys = [
    ...FEDERAL_DISTRICT_ORDER.filter((key) => groups.has(key)),
    ...[...groups.keys()].filter((key) => !FEDERAL_DISTRICT_ORDER.includes(key)).sort((a, b) =>
      a.localeCompare(b, "ru")
    )
  ];

  return orderedKeys.map((fo) => ({
    fo,
    entries: groups.get(fo).slice().sort((a, b) => a.name.localeCompare(b.name, "ru"))
  }));
}

function getCollapsedSummary({
  layerEnabled,
  catalog,
  hiddenIsoSet,
  selectedName,
  pointsFilterEnabled
}) {
  if (!layerEnabled) {
    return "Контуры скрыты";
  }

  const total = catalog.length;
  const hidden = hiddenIsoSet.size;
  const visible = Math.max(0, total - hidden);
  const parts = [];

  if (!total) {
    parts.push("Список загружается…");
  } else if (!visible) {
    parts.push(`Субъектов: ${total}, все скрыты`);
  } else {
    parts.push(`Показано: ${visible} из ${total}`);
  }

  if (selectedName) {
    parts.push(selectedName);
  }

  if (pointsFilterEnabled) {
    parts.push("фильтр точек");
  }

  return parts.join(", ");
}

function DistrictGroup({
  fo,
  entries,
  hiddenIsoSet,
  selectedIso,
  layerEnabled,
  collapsed,
  onCollapsedChange,
  onVisibilityChange,
  onGroupVisibilityChange,
  onSelect
}) {
  const visibleCount = entries.filter((entry) => !hiddenIsoSet.has(entry.iso)).length;
  const allVisible = entries.length > 0 && visibleCount === entries.length;
  const someVisible = visibleCount > 0 && !allVisible;

  return (
    <section className="region-panel-group">
      <div className="region-panel-group-header">
        <button
          type="button"
          className="region-panel-group-toggle"
          onClick={() => onCollapsedChange?.(!collapsed)}
          aria-expanded={!collapsed}
          disabled={!layerEnabled}
        >
          <span aria-hidden="true">{collapsed ? "▸" : "▾"}</span>
          <span>
            {fo}
            <span className="region-panel-group-count"> ({entries.length})</span>
          </span>
        </button>
        {entries.length > 0 ? (
          <label
            className={`region-panel-switch${!layerEnabled ? " region-panel-switch--disabled" : ""}`}
            title={allVisible ? "Скрыть все в округе" : "Показать все в округе"}
          >
            <input
              type="checkbox"
              checked={allVisible}
              disabled={!layerEnabled}
              ref={(element) => {
                if (element) {
                  element.indeterminate = someVisible;
                }
              }}
              onChange={(event) =>
                onGroupVisibilityChange?.(
                  entries.map((entry) => entry.iso),
                  event.target.checked
                )
              }
            />
            <span className="region-panel-switch-slider" aria-hidden="true" />
          </label>
        ) : null}
      </div>
      {!collapsed ? (
        <div className="region-panel-group-body">
          <ul className="region-panel-object-list">
            {entries.map((entry) => {
              const visible = !hiddenIsoSet.has(entry.iso);
              const selected = selectedIso === entry.iso;
              return (
                <li key={entry.iso} className="region-panel-object-item">
                  <label className="region-panel-checkbox" title={entry.name}>
                    <input
                      type="checkbox"
                      checked={visible}
                      disabled={!layerEnabled}
                      onChange={(event) =>
                        onVisibilityChange?.(entry.iso, event.target.checked)
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className={`region-panel-object-btn${
                      selected ? " region-panel-object-btn--selected" : ""
                    }`}
                    disabled={!layerEnabled}
                    onClick={() => onSelect?.(entry)}
                    title="Выбрать субъект и показать на карте"
                  >
                    <span className="region-panel-object-title">{entry.name}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

/** Панель контуров субъектов РФ: слой, стиль, каталог и фильтр точек. */
export default function RegionPanel({
  layerEnabled = false,
  onLayerEnabledChange,
  settings,
  onSettingsChange,
  catalog = [],
  hiddenIsoSet,
  selectedIso = null,
  selectedName = null,
  pointsFilterEnabled = false,
  pointsFilterAvailable = false,
  onVisibilityChange,
  onGroupVisibilityChange,
  onSelect,
  onPointsFilterToggle,
  collapsed: collapsedProp,
  onCollapsedChange,
  onMinimize,
  onClose
}) {
  const [collapsedInternal, setCollapsedInternal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [collapsedGroups, setCollapsedGroups] = useState({});
  const [helpOpen, setHelpOpen] = useState(false);
  const isControlled = collapsedProp !== undefined;
  const collapsed = isControlled ? collapsedProp : collapsedInternal;
  const setCollapsed = onCollapsedChange ?? setCollapsedInternal;
  const toggleLabel = collapsed ? "Развернуть" : "Свернуть";
  const query = normalizeSearchQuery(searchQuery);
  const hidden = hiddenIsoSet instanceof Set ? hiddenIsoSet : new Set();

  const filteredCatalog = useMemo(
    () => catalog.filter((entry) => matchesSearch(entry, query)),
    [catalog, query]
  );
  const groups = useMemo(() => groupCatalog(filteredCatalog), [filteredCatalog]);
  const allVisible =
    catalog.length > 0 && catalog.every((entry) => !hidden.has(entry.iso));

  return (
    <aside
      className={`region-panel ${collapsed ? "region-panel--collapsed" : ""}`}
      aria-label="Регионы"
    >
      <div className="region-panel-header">
        <h3 className="region-panel-title">Регионы</h3>
        <div className="popup-panel-header-actions">
          <ModuleHelpButton
            mapToolAccent
            open={helpOpen}
            onClick={() => setHelpOpen((value) => !value)}
          />
          {onMinimize ? <PanelMinimizeButton onClick={onMinimize} /> : null}
          <button
            type="button"
            className="popup-panel-toggle"
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
        <p className="region-panel-summary">
          {getCollapsedSummary({
            layerEnabled,
            catalog,
            hiddenIsoSet: hidden,
            selectedName,
            pointsFilterEnabled
          })}
        </p>
      ) : (
        <div className="region-panel-content">
          <label className="region-panel-switch" title="Показать границы субъектов Российской Федерации">
            <input
              type="checkbox"
              checked={layerEnabled}
              onChange={(event) => onLayerEnabledChange?.(event.target.checked)}
            />
            <span className="region-panel-switch-slider" aria-hidden="true" />
            <span>Контуры на карте</span>
          </label>

          <h4 className="region-panel-section-title">Отображение</h4>
          <RegionBoundsDisplaySettings
            settings={settings}
            onSettingsChange={onSettingsChange}
          />

          {selectedName ? (
            <div className="region-panel-selected">
              <span className="region-panel-selected-name">{selectedName}</span>
              <button
                type="button"
                className={`region-panel-filter-btn${
                  pointsFilterEnabled ? " region-panel-filter-btn--active" : ""
                }`}
                onClick={onPointsFilterToggle}
                disabled={!pointsFilterAvailable}
                aria-pressed={pointsFilterEnabled}
                aria-label="Только эти"
                title="Только эти"
              >
                <FilterIcon className="region-panel-filter-btn-icon" />
              </button>
            </div>
          ) : (
            <p className="region-panel-note">
              Выберите субъект в списке или кликните по контуру на карте.
            </p>
          )}

          <label
            className={`region-panel-switch${!layerEnabled || !catalog.length ? " region-panel-switch--disabled" : ""}`}
            title="Показать или скрыть контуры всех субъектов"
          >
            <input
              type="checkbox"
              checked={allVisible}
              disabled={!layerEnabled || !catalog.length}
              onChange={(event) =>
                onGroupVisibilityChange?.(
                  catalog.map((entry) => entry.iso),
                  event.target.checked
                )
              }
            />
            <span className="region-panel-switch-slider" aria-hidden="true" />
            <span>Показать все субъекты</span>
          </label>

          <label className="region-panel-search">
            <span className="region-panel-search-label">Поиск</span>
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Название, округ или ISO…"
              disabled={!layerEnabled}
            />
          </label>

          {!layerEnabled ? (
            <p className="region-panel-note">Включите контуры, чтобы работать со списком.</p>
          ) : null}

          {layerEnabled && !catalog.length ? (
            <p className="region-panel-note">Список загружается…</p>
          ) : null}

          {layerEnabled && catalog.length && groups.length === 0 ? (
            <p className="region-panel-note">Ничего не найдено</p>
          ) : null}

          {layerEnabled
            ? groups.map(({ fo, entries }) => (
                <DistrictGroup
                  key={fo}
                  fo={fo}
                  entries={entries}
                  hiddenIsoSet={hidden}
                  selectedIso={selectedIso}
                  layerEnabled={layerEnabled}
                  collapsed={collapsedGroups[fo] ?? true}
                  onCollapsedChange={(nextCollapsed) =>
                    setCollapsedGroups((prev) => ({ ...prev, [fo]: nextCollapsed }))
                  }
                  onVisibilityChange={onVisibilityChange}
                  onGroupVisibilityChange={onGroupVisibilityChange}
                  onSelect={onSelect}
                />
              ))
            : null}
        </div>
      )}

      <ModuleHelpPanel mapToolAccent sectionId={MODULE_IDS.REGIONS} open={helpOpen} />
    </aside>
  );
}
