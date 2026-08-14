import React, { useState } from "react";
import { formatSpeciesCount } from "./featurePropertyLabels";
import { ModuleHelpButton, ModuleHelpPanel } from "./ModuleHelp";
import { MODULE_IDS } from "./ModuleMenu";
import { SPECIES_SEARCH_MIN_QUERY_LENGTH } from "../locations/speciesSearchFilter";
import PanelCloseButton from "./PanelCloseButton";
import PanelMinimizeButton from "./PanelMinimizeButton";
import "../styles/SpeciesSearchPanel.css";

function getSpeciesLabel(species, speciesList) {
  const nameRu = String(species?.nameRu ?? "").trim();
  const nameLatin = String(species?.nameLatin ?? "").trim();
  const hasRealRu = Boolean(nameRu && nameRu !== "Без названия");

  if (!hasRealRu) {
    return nameLatin || "Без названия";
  }

  const hasDuplicateName =
    speciesList.filter((item) => {
      const otherRu = String(item?.nameRu ?? "").trim();
      return otherRu && otherRu !== "Без названия" && otherRu === nameRu;
    }).length > 1;

  if (hasDuplicateName && nameLatin) {
    return `${nameRu} (${nameLatin})`;
  }

  return nameRu;
}

function getCollapsedSummary(query, speciesCount, selectedLatin) {
  const trimmed = String(query ?? "").trim();
  if (!trimmed) {
    return "Введите название вида";
  }

  if (trimmed.length < SPECIES_SEARCH_MIN_QUERY_LENGTH) {
    return `Ещё ${SPECIES_SEARCH_MIN_QUERY_LENGTH - trimmed.length} симв.`;
  }

  if (selectedLatin) {
    return selectedLatin;
  }

  if (speciesCount > 0) {
    return `${trimmed}: ${formatSpeciesCount(speciesCount)}`;
  }

  return `${trimmed}: ничего не найдено`;
}

/** Панель поиска видов среди точек, уже лежащих на карте. */
export default function SpeciesSearchPanel({
  query = "",
  onQueryChange,
  species = [],
  selectedNameLatin = null,
  onSpeciesSelect,
  searching = false,
  collapsed = false,
  onCollapsedChange,
  onMinimize,
  onClose
}) {
  const [helpOpen, setHelpOpen] = useState(false);
  const trimmedQuery = String(query ?? "").trim();
  const queryReady = trimmedQuery.length >= SPECIES_SEARCH_MIN_QUERY_LENGTH;
  const toggleLabel = collapsed ? "Развернуть" : "Свернуть";

  return (
    <aside
      className={`species-search-panel${collapsed ? " species-search-panel--collapsed" : ""}`}
    >
      <div className="species-search-panel-header">
        <h3 className="species-search-panel-title">Поиск</h3>
        <div className="popup-panel-header-actions">
          <ModuleHelpButton
            mapToolAccent
            open={helpOpen}
            onClick={() => setHelpOpen((value) => !value)}
          />
          {onMinimize ? <PanelMinimizeButton onClick={onMinimize} /> : null}
          <button
            type="button"
            className="species-search-panel-toggle"
            onClick={() => onCollapsedChange?.(!collapsed)}
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
        <p className="species-search-panel-summary">
          {getCollapsedSummary(query, species.length, selectedNameLatin)}
        </p>
      ) : (
        <div className="species-search-panel-content">
          <label className="species-search-field-label" htmlFor="species-search-input">
            Название вида
          </label>
          <input
            id="species-search-input"
            type="search"
            className="species-search-input"
            value={query}
            onChange={(event) => onQueryChange?.(event.target.value)}
            placeholder="Латынь или русское имя"
            autoComplete="off"
            spellCheck={false}
          />

          {!queryReady ? (
            <p className="species-search-hint">
              Введите не меньше {SPECIES_SEARCH_MIN_QUERY_LENGTH} символов — на карте
              останутся все совпавшие виды.
            </p>
          ) : searching ? (
            <p className="species-search-hint">Ищем…</p>
          ) : species.length === 0 ? (
            <p className="species-search-empty">Ничего не найдено</p>
          ) : (
            <div className="species-search-results">
              <p className="species-search-results-title">
                {formatSpeciesCount(species.length)}
              </p>
              <ul className="species-search-results-list">
                {species.map((entry) => {
                  const selected =
                    selectedNameLatin &&
                    String(entry.nameLatin).toLowerCase() ===
                      String(selectedNameLatin).toLowerCase();
                  const latin = String(entry.nameLatin ?? "").trim();

                  return (
                    <li key={entry.key}>
                      <button
                        type="button"
                        className={`species-search-results-item${
                          selected ? " species-search-results-item--selected" : ""
                        }`}
                        onClick={() => onSpeciesSelect?.(entry)}
                        disabled={!latin}
                        title={latin || "Нет латинского названия"}
                      >
                        <span className="species-search-results-names">
                          <span className="species-search-results-primary">
                            {getSpeciesLabel(entry, species)}
                          </span>
                          {latin && getSpeciesLabel(entry, species) !== latin ? (
                            <span className="species-search-results-latin">{latin}</span>
                          ) : null}
                        </span>
                        <span className="species-search-results-count">{entry.pointCount}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      )}

      <ModuleHelpPanel mapToolAccent sectionId={MODULE_IDS.SEARCH} open={helpOpen} />
    </aside>
  );
}
