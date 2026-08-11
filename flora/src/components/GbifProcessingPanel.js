import React, { useEffect, useState } from "react";
import { ModuleHelpButton, ModuleHelpPanel } from "./ModuleHelp";
import { MODULE_IDS } from "./ModuleMenu";
import PanelCloseButton from "./PanelCloseButton";
import PanelMinimizeButton from "./PanelMinimizeButton";
import { GBIF_KINGDOMS } from "../gbif/taxonFilters";
import { hasActiveGbifProcessingFilters } from "../gbif/gbifProcessingFilters";
import "../styles/GbifProcessingPanel.css";

const TEXT_FILTER_DEBOUNCE_MS = 250;

/**
 * Панель клиентских фильтров загруженного слоя GBIF.
 * Царство применяется сразу; семейство и латынь — с debounce 250ms.
 */
export default function GbifProcessingPanel({
  filters,
  onFiltersChange,
  onFiltersReset,
  collapsed: collapsedProp,
  onCollapsedChange,
  onMinimize,
  onClose
}) {
  const [collapsedInternal, setCollapsedInternal] = useState(false);
  const isControlled = collapsedProp !== undefined;
  const collapsed = isControlled ? collapsedProp : collapsedInternal;
  const setCollapsed = onCollapsedChange ?? setCollapsedInternal;
  const toggleLabel = collapsed ? "Развернуть" : "Свернуть";
  const [helpOpen, setHelpOpen] = useState(false);

  const kingdomId = filters?.kingdomId ?? "";
  const committedFamily = filters?.familyQuery ?? "";
  const committedLatin = filters?.nameLatinQuery ?? "";

  const [familyDraft, setFamilyDraft] = useState(committedFamily);
  const [latinDraft, setLatinDraft] = useState(committedLatin);

  useEffect(() => {
    setFamilyDraft(committedFamily);
  }, [committedFamily]);

  useEffect(() => {
    setLatinDraft(committedLatin);
  }, [committedLatin]);

  // Откладываем применение текстовых фильтров, чтобы не гонять карту на каждый символ.
  useEffect(() => {
    if (familyDraft === committedFamily && latinDraft === committedLatin) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      onFiltersChange?.({
        ...filters,
        kingdomId: filters?.kingdomId ?? null,
        familyQuery: familyDraft,
        nameLatinQuery: latinDraft
      });
    }, TEXT_FILTER_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [familyDraft, latinDraft, committedFamily, committedLatin, filters, onFiltersChange]);

  const filtersActive = hasActiveGbifProcessingFilters({
    kingdomId: filters?.kingdomId ?? null,
    familyQuery: familyDraft,
    nameLatinQuery: latinDraft
  });

  const collapsedSummary = filtersActive
    ? [
        kingdomId
          ? GBIF_KINGDOMS.find((item) => item.id === kingdomId)?.label ?? kingdomId
          : null,
        familyDraft.trim() || null,
        latinDraft.trim() ? `«${latinDraft.trim()}»` : null
      ]
        .filter(Boolean)
        .join(" · ")
    : "без фильтров";

  const handleKingdomChange = (nextKingdomId) => {
    onFiltersChange?.({
      ...filters,
      kingdomId: nextKingdomId || null,
      familyQuery: familyDraft,
      nameLatinQuery: latinDraft
    });
  };

  const handleReset = () => {
    setFamilyDraft("");
    setLatinDraft("");
    onFiltersReset?.();
  };

  return (
    <aside
      className={`gbif-processing-panel${
        collapsed ? " gbif-processing-panel--collapsed" : ""
      }`}
      aria-label="Обработка данных GBIF"
    >
      <div className="gbif-processing-panel-header">
        <h3 className="gbif-processing-panel-title">Обработка данных GBIF</h3>
        <div className="popup-panel-header-actions">
          <ModuleHelpButton
            open={helpOpen}
            onClick={() => setHelpOpen((value) => !value)}
          />
          {onMinimize ? <PanelMinimizeButton onClick={onMinimize} /> : null}
          <button
            type="button"
            className="gbif-processing-panel-toggle"
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
        <p className="gbif-processing-panel-summary">{collapsedSummary}</p>
      ) : (
        <div className="gbif-processing-panel-content">
          <p className="gbif-processing-panel-hint">
            Фильтры применяются к уже загруженному слою GBIF на карте и в инструментах.
            Сами данные в локальном хранилище не меняются.
          </p>

          <label className="gbif-processing-panel-field" htmlFor="gbif-proc-kingdom">
            <span className="gbif-processing-panel-label">Царство</span>
            <select
              id="gbif-proc-kingdom"
              className="gbif-processing-panel-select"
              value={kingdomId}
              onChange={(event) => handleKingdomChange(event.target.value)}
            >
              <option value="">Все</option>
              {GBIF_KINGDOMS.map(({ id, label }) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <label className="gbif-processing-panel-field" htmlFor="gbif-proc-family">
            <span className="gbif-processing-panel-label">Семейство</span>
            <input
              id="gbif-proc-family"
              className="gbif-processing-panel-input"
              type="text"
              autoComplete="off"
              placeholder="Например, Betulaceae"
              value={familyDraft}
              onChange={(event) => setFamilyDraft(event.target.value)}
            />
          </label>

          <label className="gbif-processing-panel-field" htmlFor="gbif-proc-latin">
            <span className="gbif-processing-panel-label">Поиск по латыни</span>
            <input
              id="gbif-proc-latin"
              className="gbif-processing-panel-input"
              type="text"
              autoComplete="off"
              placeholder="Betula"
              value={latinDraft}
              onChange={(event) => setLatinDraft(event.target.value)}
            />
          </label>

          <div className="gbif-processing-panel-actions">
            <button
              type="button"
              className="gbif-processing-panel-btn"
              disabled={!filtersActive}
              onClick={handleReset}
            >
              Сбросить фильтры
            </button>
          </div>
        </div>
      )}

      <ModuleHelpPanel sectionId={MODULE_IDS.GBIF_PROCESSING} open={helpOpen} />
    </aside>
  );
}
