import React, { useEffect, useRef, useState } from "react";
import {
  suggestFamilies,
  suggestGenera,
  suggestTaxa
} from "../gbif/speciesLookup";
import { TAXON_LOAD_MODES } from "../gbif/taxonLoadSelection";
import SubmissionAutocompleteInput from "./SubmissionAutocompleteInput";

export const TAXON_MODE_OPTIONS = [
  { id: TAXON_LOAD_MODES.SPECIES, label: "Вид" },
  { id: TAXON_LOAD_MODES.GENUS, label: "Род" },
  { id: TAXON_LOAD_MODES.FAMILY, label: "Семейство" }
];

function TaxonSuggestionContent({ item }) {
  const latin = item?.scientificName || item?.family || "";
  const ru = item?.vernacularName || "";
  const rank = item?.rank || "";

  return (
    <span className="selective-load-suggestion-body">
      <span className="selective-load-suggestion-latin">{latin}</span>
      {ru || rank ? (
        <span className="selective-load-suggestion-meta">
          {ru}
          {ru && rank ? " · " : ""}
          {rank}
        </span>
      ) : null}
    </span>
  );
}

function suggestionKey(item) {
  return String(item.taxonKey ?? item.familyKey ?? item.scientificName);
}

/**
 * Строка поиска таксона: селекторы ранга и поле с подсказками.
 * Сопоставление GBIF/iNat выполняется по кнопке «Поиск» снаружи.
 */
export default function TaxonLoadPicker({
  mode,
  query,
  onModeChange,
  onQueryChange,
  onSuggestionChange,
  selectedSuggestions = [],
  onSelectedSuggestionsChange,
  searchPrefix = null,
  searchAction = null
}) {
  const [suggestions, setSuggestions] = useState([]);
  const abortRef = useRef(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    const q = String(query ?? "").trim();
    if (q.length < 2) {
      setSuggestions([]);
      return undefined;
    }

    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;
    const timer = setTimeout(async () => {
      try {
        let items = [];
        if (mode === TAXON_LOAD_MODES.FAMILY) {
          items = await suggestFamilies(q, { limit: 16, signal: controller.signal });
        } else if (mode === TAXON_LOAD_MODES.GENUS) {
          items = await suggestGenera(q, { limit: 16, signal: controller.signal });
        } else {
          items = await suggestTaxa(q, { limit: 16, signal: controller.signal });
        }
        if (!controller.signal.aborted) {
          setSuggestions(items);
        }
      } catch {
        if (!controller.signal.aborted) {
          setSuggestions([]);
        }
      }
    }, 280);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, mode]);

  const placeholder =
    mode === TAXON_LOAD_MODES.FAMILY
      ? "Семейство"
      : mode === TAXON_LOAD_MODES.GENUS
        ? "Род или биномен"
        : "Латинское или русское название";

  return (
    <div className="selective-load-picker">
      <div
        className="regions-load-source-tabs selective-load-rank-tabs"
        role="tablist"
        aria-label="Ранг таксона"
      >
        {TAXON_MODE_OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={mode === option.id}
            className={
              mode === option.id
                ? "regions-load-source-tab regions-load-source-tab--active"
                : "regions-load-source-tab"
            }
            onClick={() => {
              if (mode === option.id) {
                return;
              }
              onModeChange?.(option.id);
              onSuggestionChange?.(null);
              onSelectedSuggestionsChange?.([]);
            }}
          >
            {option.label}
          </button>
        ))}
      </div>

      {searchPrefix ? (
        <div className="selective-load-search-prefix">{searchPrefix}</div>
      ) : null}

      <div className="selective-load-query">
        <SubmissionAutocompleteInput
          value={query}
          onChange={(next) => {
            onQueryChange?.(next);
            onSuggestionChange?.(null);
          }}
          onSuggestionSelect={(item) => {
            const key = suggestionKey(item);
            const already = selectedSuggestions.some((selected) => suggestionKey(selected) === key);
            const nextSelected = already
              ? selectedSuggestions.filter((selected) => suggestionKey(selected) !== key)
              : [...selectedSuggestions, item];
            onSelectedSuggestionsChange?.(nextSelected);
            onSuggestionChange?.(nextSelected.length === 1 ? nextSelected[0] : null);
          }}
          multiSelect
          selectedSuggestionKeys={selectedSuggestions.map((item) => suggestionKey(item))}
          suggestions={suggestions}
          getSuggestionLabel={(item) => item.scientificName || item.family || ""}
          renderSuggestion={(item) => <TaxonSuggestionContent item={item} />}
          getSuggestionKey={suggestionKey}
          wrapClassName="regions-load-taxon-autocomplete submission-autocomplete-wrap"
          className="gbif-panel-input"
          listClassName="submission-autocomplete-suggestions selective-load-suggestions"
          listClassNameActive="submission-autocomplete-suggestion--active selective-load-suggestion--active"
          usePortal
          placeholder={placeholder}
          aria-label="Поиск таксона"
        />
      </div>

      {searchAction ? (
        <div className="selective-load-search-action">{searchAction}</div>
      ) : null}
    </div>
  );
}
