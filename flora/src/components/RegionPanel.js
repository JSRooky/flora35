import React, { useMemo, useState } from "react";
import { ModuleHelpButton, ModuleHelpPanel } from "./ModuleHelp";
import { MODULE_IDS } from "./ModuleMenu";
import PanelCloseButton from "./PanelCloseButton";
import PanelMinimizeButton from "./PanelMinimizeButton";
import RegionBoundsDisplaySettings from "./RegionBoundsSettingsPanel";
import {
  REGION_BUFFER_MAX_KM,
  REGION_BUFFER_MIN_KM,
  REGION_BUFFER_STEP_KM
} from "./addRegionBoundsLayer";
import { TrashIcon } from "../images/buttons";
import "../styles/HeatmapSettingsPanel.css";
import "../styles/RegionPanel.css";

function getCollapsedSummary({ layerEnabled, catalog, hiddenIsoSet, selectedCount, bufferKm }) {
  if (!layerEnabled) {
    return "Контуры скрыты";
  }

  const total = catalog.length;
  const hidden = hiddenIsoSet.size;
  const visible = Math.max(0, total - hidden);
  const parts = [];

  if (!total) {
    parts.push("Список загружается…");
  } else if (hidden > 0) {
    parts.push(`Показано: ${visible} из ${total}`);
  } else {
    parts.push(`Субъектов: ${total}`);
  }

  if (selectedCount) {
    parts.push(`выделено: ${selectedCount}`);
  }

  if (selectedCount && bufferKm > 0) {
    parts.push(`буфер ${bufferKm} км`);
  }

  return parts.join(", ");
}

function normalizeSearchQuery(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function matchesRegionSearch(entry, query) {
  if (!query) {
    return false;
  }
  const haystack = [entry.name, entry.nameEn, entry.iso, entry.fo]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

/** Панель контуров субъектов РФ: слой и стиль. */
export default function RegionPanel({
  layerEnabled = false,
  onLayerEnabledChange,
  settings,
  onSettingsChange,
  onRandomizeColors,
  onClearFeatureColors,
  catalog = [],
  hiddenIsoSet,
  selectedNames = [],
  selectedIsos = [],
  onSearchSelect,
  onSearchRemove,
  onSaveTempLayer,
  bufferKm = 0,
  onBufferKmChange,
  collapsed: collapsedProp,
  onCollapsedChange,
  onMinimize,
  onClose
}) {
  const [collapsedInternal, setCollapsedInternal] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [foundEntries, setFoundEntries] = useState([]);
  const isControlled = collapsedProp !== undefined;
  const collapsed = isControlled ? collapsedProp : collapsedInternal;
  const setCollapsed = onCollapsedChange ?? setCollapsedInternal;
  const toggleLabel = collapsed ? "Развернуть" : "Свернуть";
  const hidden = hiddenIsoSet instanceof Set ? hiddenIsoSet : new Set();
  const hasSelection = selectedIsos.length > 0;
  const selectedIsoSet = useMemo(() => new Set(selectedIsos), [selectedIsos]);
  const query = normalizeSearchQuery(searchQuery);
  const searchResults = useMemo(() => {
    if (!query) {
      return [];
    }
    const foundIsoSet = new Set(foundEntries.map((entry) => entry.iso));
    return catalog
      .filter((entry) => matchesRegionSearch(entry, query) && !foundIsoSet.has(entry.iso))
      .slice(0, 24);
  }, [catalog, foundEntries, query]);

  const handleSearchResultClick = (entry) => {
    setFoundEntries((current) =>
      current.some((item) => item.iso === entry.iso) ? current : [...current, entry]
    );
    onSearchSelect?.(entry);
    setSearchQuery("");
  };

  const handleFoundRemove = (entry, event) => {
    event.preventDefault();
    event.stopPropagation();
    setFoundEntries((current) => current.filter((item) => item.iso !== entry.iso));
    onSearchRemove?.(entry.iso);
  };

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
            selectedCount: selectedNames.length,
            bufferKm
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
            onRandomizeColors={onRandomizeColors}
            onClearFeatureColors={onClearFeatureColors}
            randomizeDisabled={!catalog.length}
          />

          <h4 className="region-panel-section-title">Буфер</h4>
          <div className={`region-panel-buffer${hasSelection ? "" : " region-panel-buffer--disabled"}`}>
            <span className="heatmap-settings-field-label">Оффсет контура</span>
            <span className="heatmap-settings-range region-panel-buffer-range">
              <span className="heatmap-settings-range-value">{`${bufferKm} км`}</span>
              <input
                type="range"
                className="heatmap-settings-slider"
                min={REGION_BUFFER_MIN_KM}
                max={REGION_BUFFER_MAX_KM}
                step={REGION_BUFFER_STEP_KM}
                value={bufferKm}
                disabled={!hasSelection}
                style={{
                  "--range-progress": `${(bufferKm / REGION_BUFFER_MAX_KM) * 100}%`
                }}
                onChange={(event) => onBufferKmChange?.(Number(event.target.value))}
                title={
                  hasSelection
                    ? "Ширина буфера вокруг выделенных регионов"
                    : "Сначала выделите регион на карте"
                }
              />
            </span>
          </div>

          <label className="region-panel-search">
            <span className="region-panel-search-label">Поиск</span>
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Название субъекта…"
              disabled={!catalog.length}
            />
          </label>

          {query && searchResults.length === 0 ? (
            <p className="region-panel-note">Ничего не найдено</p>
          ) : null}

          {searchResults.length > 0 ? (
            <ul className="region-panel-search-results" aria-label="Совпадения поиска">
              {searchResults.map((entry) => (
                <li key={entry.iso}>
                  <button
                    type="button"
                    className="region-panel-search-result"
                    onClick={() => handleSearchResultClick(entry)}
                  >
                    <span className="region-panel-search-result-name">{entry.name}</span>
                    {entry.fo ? (
                      <span className="region-panel-search-result-meta">{entry.fo}</span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {foundEntries.length > 0 ? (
            <ul className="region-panel-search-results" aria-label="Найденные регионы">
              {foundEntries.map((entry) => {
                const selected = selectedIsoSet.has(entry.iso);
                return (
                  <li key={entry.iso} className="region-panel-found-item">
                    <button
                      type="button"
                      className={`region-panel-search-result${
                        selected ? " region-panel-search-result--selected" : ""
                      }`}
                      onClick={() => onSearchSelect?.(entry)}
                    >
                      <span className="region-panel-search-result-name">{entry.name}</span>
                      {entry.fo ? (
                        <span className="region-panel-search-result-meta">{entry.fo}</span>
                      ) : null}
                    </button>
                    <button
                      type="button"
                      className="region-panel-found-remove"
                      title="Удалить"
                      aria-label={`Удалить ${entry.name}`}
                      onClick={(event) => handleFoundRemove(entry, event)}
                    >
                      <TrashIcon className="region-panel-found-remove-icon" aria-hidden="true" focusable="false" />
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}

          <button
            type="button"
            className="heatmap-settings-reset"
            disabled={!hasSelection || !onSaveTempLayer}
            onClick={() => onSaveTempLayer?.()}
            title={
              hasSelection
                ? "Сохранить выбранные субъекты во временный слой"
                : "Сначала выделите регион"
            }
          >
            Во временный слой
          </button>
        </div>
      )}

      <ModuleHelpPanel mapToolAccent sectionId={MODULE_IDS.REGIONS} open={helpOpen} />
    </aside>
  );
}
