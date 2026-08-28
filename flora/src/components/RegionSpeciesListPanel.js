import React, { useMemo, useState } from "react";
import {
  buildSpeciesRegnumFamilyTree,
  formatSpeciesCount,
  getFamilyLabel,
  getRegnumLabel
} from "./featurePropertyLabels";
import PanelCloseButton from "./PanelCloseButton";
import PanelMinimizeButton from "./PanelMinimizeButton";
import { SPECIES_SEARCH_MIN_QUERY_LENGTH } from "../locations/speciesSearchFilter";
import { speciesDisplayKey } from "../locations/regionSpeciesAllowlist";
import "../styles/FeaturePopup.css";
import "../styles/BoundsSpeciesListPopup.css";
import "../styles/RegionSpeciesListPanel.css";

function speciesLabel(entry, list) {
  const nameRu = String(entry?.nameRu ?? "").trim();
  const nameLatin = String(entry?.nameLatin ?? "").trim();
  const hasRealRu = Boolean(nameRu && nameRu !== "Без названия");
  if (!hasRealRu) {
    return nameLatin;
  }
  const hasDuplicateName =
    list.filter((item) => {
      const otherRu = String(item?.nameRu ?? "").trim();
      return otherRu && otherRu !== "Без названия" && otherRu === nameRu;
    }).length > 1;
  if (hasDuplicateName && nameLatin) {
    return `${nameRu} (${nameLatin})`;
  }
  return nameRu;
}

export default function RegionSpeciesListPanel({
  open = false,
  title = "Список видов региона",
  species = [],
  displayedSpecies = [],
  enabledRegnums = null,
  onRegnumEnabledChange,
  onAddSpecies,
  onRemoveSpecies,
  collapsed = false,
  onCollapsedChange,
  onMinimize,
  onClose
}) {
  const [query, setQuery] = useState("");
  const [expandedFamilies, setExpandedFamilies] = useState(() => new Set());

  const inventory = useMemo(
    () =>
      (species ?? []).filter(
        (entry) => String(entry?.nameLatin || entry?.nameRu || "").trim()
      ),
    [species]
  );

  const tree = useMemo(() => buildSpeciesRegnumFamilyTree(inventory), [inventory]);
  const displayedKeys = useMemo(
    () => new Set((displayedSpecies ?? []).map((item) => speciesDisplayKey(item))),
    [displayedSpecies]
  );

  const isRegnumEnabled = (regnum) => {
    if (!enabledRegnums) {
      return true;
    }
    return enabledRegnums.includes(regnum);
  };

  const visibleTree = useMemo(
    () =>
      tree.filter(({ regnum }) => !enabledRegnums || enabledRegnums.includes(regnum)),
    [tree, enabledRegnums]
  );

  const trimmedQuery = String(query ?? "").trim();
  const queryReady = trimmedQuery.length >= SPECIES_SEARCH_MIN_QUERY_LENGTH;
  const needle = trimmedQuery.toLowerCase();
  const searchResults = useMemo(() => {
    if (!queryReady) {
      return [];
    }
    return inventory.filter((entry) => {
      if (enabledRegnums && !enabledRegnums.includes(entry.regnum)) {
        return false;
      }
      const latin = String(entry.nameLatin || "").toLowerCase();
      const ru = String(entry.nameRu || "").toLowerCase();
      return latin.includes(needle) || ru.includes(needle);
    });
  }, [enabledRegnums, inventory, needle, queryReady]);

  if (!open) {
    return null;
  }

  const toggleLabel = collapsed ? "Развернуть" : "Свернуть";

  return (
    <div className="bounds-species-list-popup-stack region-species-list-panel-stack">
      <aside
        className={`feature-popup bounds-species-list-popup region-species-list-panel${
          collapsed ? " feature-popup--collapsed bounds-species-list-popup--collapsed" : ""
        }`}
        aria-label={title}
        role="dialog"
      >
        <div className="feature-popup-header">
          <h3 className="feature-popup-title">{title}</h3>
          <div className="popup-panel-header-actions">
            {onMinimize ? <PanelMinimizeButton onClick={onMinimize} /> : null}
            <button
              type="button"
              className="popup-panel-toggle"
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
          <p className="popup-collapsed-summary">
            {formatSpeciesCount(inventory.length)}
            {displayedSpecies.length > 0
              ? `, на карте ${displayedSpecies.length}`
              : ""}
          </p>
        ) : (
          <div className="popup-content bounds-species-list-popup-content">
            <section className="region-species-section">
              <h4 className="region-species-section-title">Царства</h4>
              {tree.length === 0 ? (
                <p className="region-species-empty">Нет видов в загрузке региона.</p>
              ) : (
                <ul className="region-species-regnum-list">
                  {tree.map(({ regnum, label, speciesCount }) => {
                    const enabled = isRegnumEnabled(regnum);
                    return (
                      <li key={regnum || "__none__"}>
                        <label className="region-species-check">
                          <input
                            type="checkbox"
                            checked={enabled}
                            onChange={(event) =>
                              onRegnumEnabledChange?.(regnum, event.target.checked)
                            }
                          />
                          <span>{label || getRegnumLabel(regnum)}</span>
                          <span className="region-species-muted">
                            {formatSpeciesCount(speciesCount)}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section className="region-species-section">
              <h4 className="region-species-section-title">Семейства</h4>
              {visibleTree.length === 0 ? (
                <p className="region-species-empty">Включите хотя бы одно царство.</p>
              ) : (
                <ul className="region-species-family-groups">
                  {visibleTree.map(({ regnum, label, families }) => {
                    const familyKey = `families:${regnum || "__none__"}`;
                    const expanded = expandedFamilies.has(familyKey);
                    return (
                      <li key={familyKey} className="region-species-family-group">
                        <div className="region-species-family-head">
                          <span className="region-species-family-regnum">{label}</span>
                          <span className="region-species-muted">{families.length}</span>
                          <button
                            type="button"
                            className="region-species-list-btn"
                            aria-expanded={expanded}
                            onClick={() => {
                              setExpandedFamilies((current) => {
                                const next = new Set(current);
                                if (next.has(familyKey)) {
                                  next.delete(familyKey);
                                } else {
                                  next.add(familyKey);
                                }
                                return next;
                              });
                            }}
                          >
                            Список
                          </button>
                        </div>
                        {expanded ? (
                          <ul className="region-species-family-list">
                            {families.map((family) => (
                              <li key={`${regnum}:${family.family}`}>
                                <span>{family.label || getFamilyLabel(family.family)}</span>
                                <span className="region-species-muted">
                                  {family.species.length}
                                </span>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section className="region-species-section">
              <h4 className="region-species-section-title">Поиск вида</h4>
              <input
                className="region-species-search"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Латинское или русское название"
                aria-label="Поиск вида в регионе"
              />
              {!queryReady ? (
                <p className="region-species-hint">
                  Введите не меньше {SPECIES_SEARCH_MIN_QUERY_LENGTH} символов
                </p>
              ) : searchResults.length === 0 ? (
                <p className="region-species-empty">Ничего не найдено.</p>
              ) : (
                <ul className="region-species-search-list">
                  {searchResults.map((entry) => {
                    const key = speciesDisplayKey(entry);
                    const added = displayedKeys.has(key);
                    const label = speciesLabel(entry, searchResults);
                    return (
                      <li key={key}>
                        <span className="region-species-search-name">{label}</span>
                        <button
                          type="button"
                          className="region-species-add-btn"
                          disabled={added}
                          title={added ? "Уже на карте" : "Показать точки вида"}
                          aria-label={
                            added ? `${label} уже на карте` : `Добавить ${label} на карту`
                          }
                          onClick={() => onAddSpecies?.(entry)}
                        >
                          {added ? "✓" : "+"}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {displayedSpecies.length > 0 ? (
              <section className="region-species-section">
                <h4 className="region-species-section-title">
                  На карте · {displayedSpecies.length}
                </h4>
                <ul className="region-species-search-list">
                  {displayedSpecies.map((entry) => {
                    const key = speciesDisplayKey(entry);
                    const label = speciesLabel(entry, displayedSpecies);
                    return (
                      <li key={key}>
                        <span className="region-species-search-name">{label}</span>
                        <button
                          type="button"
                          className="region-species-add-btn region-species-add-btn--remove"
                          title="Убрать с карты"
                          aria-label={`Убрать ${label} с карты`}
                          onClick={() => onRemoveSpecies?.(entry)}
                        >
                          −
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null}
          </div>
        )}
      </aside>
    </div>
  );
}
