import React, { useEffect, useState } from "react";
import { ModuleHelpButton, ModuleHelpPanel } from "./ModuleHelp";
import { MODULE_IDS } from "./ModuleMenu";
import PanelCloseButton from "./PanelCloseButton";
import PanelHint from "./PanelHint";
import PanelMinimizeButton from "./PanelMinimizeButton";
import { GBIF_KINGDOMS } from "../gbif/taxonFilters";
import {
  EXTERNAL_SOURCE_FILTER_MODES,
  hasActiveExternalProcessingFilters
} from "../externalSources/externalProcessingFilters";
import "../styles/GbifProcessingPanel.css";

const TEXT_FILTER_DEBOUNCE_MS = 250;

const SOURCE_MODE_OPTIONS = [
  { value: EXTERNAL_SOURCE_FILTER_MODES.ALL, label: "GBIF и iNaturalist" },
  { value: EXTERNAL_SOURCE_FILTER_MODES.GBIF, label: "Только GBIF" },
  { value: EXTERNAL_SOURCE_FILTER_MODES.INATURALIST, label: "Только iNaturalist" }
];

/** Панель клиентских фильтров загруженных внешних слоёв. */
export default function ExternalProcessingPanel({
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

  const sourceMode = filters?.sourceMode ?? EXTERNAL_SOURCE_FILTER_MODES.ALL;
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

  useEffect(() => {
    if (familyDraft === committedFamily && latinDraft === committedLatin) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      onFiltersChange?.({
        ...filters,
        sourceMode,
        kingdomId: filters?.kingdomId ?? null,
        familyQuery: familyDraft,
        nameLatinQuery: latinDraft
      });
    }, TEXT_FILTER_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [
    familyDraft,
    latinDraft,
    committedFamily,
    committedLatin,
    filters,
    onFiltersChange,
    sourceMode
  ]);

  const filtersActive = hasActiveExternalProcessingFilters({
    sourceMode,
    kingdomId: filters?.kingdomId ?? null,
    familyQuery: familyDraft,
    nameLatinQuery: latinDraft
  });

  const sourceLabel =
    SOURCE_MODE_OPTIONS.find((item) => item.value === sourceMode)?.label ?? sourceMode;

  const collapsedSummary = filtersActive
    ? [
        sourceMode !== EXTERNAL_SOURCE_FILTER_MODES.ALL ? sourceLabel : null,
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
      sourceMode,
      kingdomId: nextKingdomId || null,
      familyQuery: familyDraft,
      nameLatinQuery: latinDraft
    });
  };

  const handleSourceModeChange = (nextSourceMode) => {
    onFiltersChange?.({
      ...filters,
      sourceMode: nextSourceMode,
      kingdomId: filters?.kingdomId ?? null,
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
      aria-label="Обработка внешних данных"
    >
      <div className="gbif-processing-panel-header">
        <h3 className="gbif-processing-panel-title">Обработка внешних данных</h3>
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
          <PanelHint>
            Фильтры применяются к загруженным слоям GBIF и iNaturalist на карте и в
            инструментах. Сами данные в локальном хранилище не меняются.
          </PanelHint>

          <label className="gbif-processing-panel-field" htmlFor="external-proc-source">
            <span className="gbif-processing-panel-label">Источник</span>
            <select
              id="external-proc-source"
              className="gbif-processing-panel-select"
              value={sourceMode}
              onChange={(event) => handleSourceModeChange(event.target.value)}
            >
              {SOURCE_MODE_OPTIONS.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <label className="gbif-processing-panel-field" htmlFor="external-proc-kingdom">
            <span className="gbif-processing-panel-label">Царство</span>
            <select
              id="external-proc-kingdom"
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

          <label className="gbif-processing-panel-field" htmlFor="external-proc-family">
            <span className="gbif-processing-panel-label">Семейство</span>
            <input
              id="external-proc-family"
              className="gbif-processing-panel-input"
              type="text"
              autoComplete="off"
              placeholder="Например, Betulaceae"
              value={familyDraft}
              onChange={(event) => setFamilyDraft(event.target.value)}
            />
          </label>

          <label className="gbif-processing-panel-field" htmlFor="external-proc-latin">
            <span className="gbif-processing-panel-label">Поиск по латыни</span>
            <input
              id="external-proc-latin"
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

      <ModuleHelpPanel sectionId={MODULE_IDS.EXTERNAL_PROCESSING} open={helpOpen} />
    </aside>
  );
}
