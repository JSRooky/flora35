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

export function suggestionKey(item) {
  return String(item?.taxonKey ?? item?.familyKey ?? item?.scientificName ?? item?.family ?? "");
}

export function suggestionLabel(item) {
  return String(item?.scientificName || item?.family || "").trim();
}

export function splitTaxonQueryNames(query) {
  return String(query ?? "")
    .split(/[,;\n]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function joinTaxonQueryNames(names) {
  return names
    .map((name) => String(name ?? "").trim())
    .filter(Boolean)
    .join(", ");
}

function lastSeparatorIndex(value) {
  const raw = String(value ?? "");
  return Math.max(raw.lastIndexOf(","), raw.lastIndexOf(";"), raw.lastIndexOf("\n"));
}

export function getTaxonQueryDraft(query) {
  const raw = String(query ?? "");
  const index = lastSeparatorIndex(raw);
  if (index < 0) {
    return { prefix: "", draft: raw.trim() };
  }
  return {
    prefix: raw.slice(0, index + 1),
    draft: raw.slice(index + 1).trim()
  };
}

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
  const [pendingChecked, setPendingChecked] = useState([]);
  const abortRef = useRef(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    const draft = getTaxonQueryDraft(query).draft;
    if (draft.length < 2) {
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
          items = await suggestFamilies(draft, { limit: 16, signal: controller.signal });
        } else if (mode === TAXON_LOAD_MODES.GENUS) {
          items = await suggestGenera(draft, { limit: 16, signal: controller.signal });
        } else {
          items = await suggestTaxa(draft, { limit: 16, signal: controller.signal });
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
      ? "Семейства через запятую"
      : mode === TAXON_LOAD_MODES.GENUS
        ? "Роды через запятую"
        : "Названия через запятую";

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
              setPendingChecked([]);
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
            const names = splitTaxonQueryNames(next).map((name) => name.toLowerCase());
            onSelectedSuggestionsChange?.(
              selectedSuggestions.filter((item) => names.includes(suggestionLabel(item).toLowerCase()))
            );
            onSuggestionChange?.(null);
          }}
          onSuggestionSelect={(item) => {
            const key = suggestionKey(item);
            setPendingChecked((current) => {
              const already = current.some((selected) => suggestionKey(selected) === key);
              return already
                ? current.filter((selected) => suggestionKey(selected) !== key)
                : [...current, item];
            });
          }}
          onCommitSelected={() => {
            if (pendingChecked.length === 0) {
              return;
            }
            const completeNames = splitTaxonQueryNames(getTaxonQueryDraft(query).prefix);
            const nextNames = [...completeNames];
            pendingChecked.forEach((item) => {
              const label = suggestionLabel(item);
              if (!label) {
                return;
              }
              if (!nextNames.some((name) => name.toLowerCase() === label.toLowerCase())) {
                nextNames.push(label);
              }
            });
            const nextSelected = [...selectedSuggestions];
            pendingChecked.forEach((item) => {
              const key = suggestionKey(item);
              if (!nextSelected.some((selected) => suggestionKey(selected) === key)) {
                nextSelected.push(item);
              }
            });
            onQueryChange?.(joinTaxonQueryNames(nextNames));
            onSelectedSuggestionsChange?.(nextSelected);
            onSuggestionChange?.(nextSelected.length === 1 ? nextSelected[0] : null);
            setPendingChecked([]);
          }}
          multiSelect
          selectedSuggestionKeys={pendingChecked.map((item) => suggestionKey(item))}
          suggestions={suggestions}
          getSuggestionLabel={(item) => item.scientificName || item.family || ""}
          renderSuggestion={(item) => <TaxonSuggestionContent item={item} />}
          getSuggestionKey={suggestionKey}
          wrapClassName="regions-load-taxon-autocomplete submission-autocomplete-wrap"
          className="gbif-panel-input"
          listClassName="submission-autocomplete-suggestions selective-load-suggestions"
          listClassNameActive="submission-autocomplete-suggestion--active selective-load-suggestion--active"
          dropdownClassName="selective-load-suggest-panel"
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
