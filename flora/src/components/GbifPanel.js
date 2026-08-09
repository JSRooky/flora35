import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  clearGbifLayer,
  setGbifData,
  setGbifVisibility
} from "./addGbifLayer";
import { ModuleHelpButton, ModuleHelpPanel } from "./ModuleHelp";
import { MODULE_IDS } from "./ModuleMenu";
import {
  GBIF_MAP_UPDATE_PAGES,
  GBIF_PAGE_SIZE,
  loadOccurrencesForRegion,
  previewOccurrenceCount
} from "../gbif/gbifClient";
import {
  appendGbifFeatures,
  clearGbifStore,
  getGbifFeatureCollection,
  getGbifFeatureCount
} from "../gbif/gbifStore";
import {
  DEFAULT_GBIF_REGION_ID,
  GBIF_REGIONS,
  getGbifRegionById
} from "../gbif/regions";
import { matchScientificName, suggestFamilies, suggestTaxa } from "../gbif/speciesLookup";
import {
  GBIF_KINGDOMS,
  buildTaxonSearchExtras,
  getGbifKingdomById
} from "../gbif/taxonFilters";
import "../styles/GbifPanel.css";

function formatCount(value) {
  if (value == null || Number.isNaN(value)) {
    return "—";
  }
  return new Intl.NumberFormat("ru-RU").format(value);
}

function useDebouncedValue(value, delayMs) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}

/** Панель загрузки находок GBIF на отдельный слой карты. */
export default function GbifPanel({
  map,
  collapsed = false,
  onCollapsedChange,
  gbifOnly = false,
  onGbifOnlyChange
}) {
  const [helpOpen, setHelpOpen] = useState(false);
  const [regionId, setRegionId] = useState(DEFAULT_GBIF_REGION_ID);
  const [kingdomId, setKingdomId] = useState("plantae");
  const [familyQuery, setFamilyQuery] = useState("");
  const [familySelected, setFamilySelected] = useState(null);
  const [familySuggestions, setFamilySuggestions] = useState([]);
  const [taxonQuery, setTaxonQuery] = useState("");
  const [taxonSelected, setTaxonSelected] = useState(null);
  const [taxonSuggestions, setTaxonSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(getGbifFeatureCount());
  const [total, setTotal] = useState(null);
  const [previewCount, setPreviewCount] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [error, setError] = useState(null);
  const [layerVisible, setLayerVisibleState] = useState(true);
  const abortRef = useRef(null);
  const previewAbortRef = useRef(null);
  const suggestAbortRef = useRef(null);

  const debouncedFamilyQuery = useDebouncedValue(familyQuery, 300);
  const debouncedTaxonQuery = useDebouncedValue(taxonQuery, 300);

  const region = getGbifRegionById(regionId);
  const kingdom = getGbifKingdomById(kingdomId);

  const extras = useMemo(
    () =>
      buildTaxonSearchExtras({
        kingdomId,
        family: familySelected,
        taxon: taxonSelected
      }),
    [kingdomId, familySelected, taxonSelected]
  );

  const canLoad = Boolean(map && region && kingdom && !loading);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      previewAbortRef.current?.abort();
      suggestAbortRef.current?.abort();
    };
  }, []);

  // Подсказки семейств
  useEffect(() => {
    if (familySelected && familySelected.family === debouncedFamilyQuery.trim()) {
      setFamilySuggestions([]);
      return undefined;
    }

    const q = debouncedFamilyQuery.trim();
    if (q.length < 2) {
      setFamilySuggestions([]);
      return undefined;
    }

    const controller = new AbortController();
    suggestFamilies(q, {
      kingdomKey: kingdom?.kingdomKey,
      signal: controller.signal
    })
      .then(setFamilySuggestions)
      .catch((err) => {
        if (err?.name !== "AbortError") {
          setFamilySuggestions([]);
        }
      });

    return () => controller.abort();
  }, [debouncedFamilyQuery, familySelected, kingdom?.kingdomKey]);

  // Подсказки таксонов (латынь / русский)
  useEffect(() => {
    if (
      taxonSelected &&
      (taxonSelected.scientificName === debouncedTaxonQuery.trim() ||
        taxonSelected.vernacularName === debouncedTaxonQuery.trim())
    ) {
      setTaxonSuggestions([]);
      return undefined;
    }

    const q = debouncedTaxonQuery.trim();
    if (q.length < 2) {
      setTaxonSuggestions([]);
      return undefined;
    }

    const controller = new AbortController();
    suggestAbortRef.current = controller;

    suggestTaxa(q, {
      kingdomKey: kingdom?.kingdomKey,
      kingdomId,
      signal: controller.signal
    })
      .then(setTaxonSuggestions)
      .catch((err) => {
        if (err?.name !== "AbortError") {
          setTaxonSuggestions([]);
        }
      });

    return () => controller.abort();
  }, [debouncedTaxonQuery, taxonSelected, kingdom?.kingdomKey, kingdomId]);

  // Оценка числа точек до загрузки
  useEffect(() => {
    if (!region || !kingdom) {
      setPreviewCount(null);
      return undefined;
    }

    previewAbortRef.current?.abort();
    const controller = new AbortController();
    previewAbortRef.current = controller;
    setPreviewLoading(true);

    const timer = window.setTimeout(() => {
      previewOccurrenceCount(region, { signal: controller.signal, extras })
        .then((count) => {
          if (!controller.signal.aborted) {
            setPreviewCount(count);
          }
        })
        .catch((err) => {
          if (err?.name !== "AbortError") {
            setPreviewCount(null);
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setPreviewLoading(false);
          }
        });
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [region, kingdom, extras]);

  const toggleLabel = collapsed ? "Развернуть" : "Свернуть";

  const applyTaxonSelection = async (item) => {
    setTaxonSuggestions([]);
    setTaxonQuery(item.scientificName);

    let resolved = item;

    if (item.needsMatch || String(item.taxonKey).startsWith("local:")) {
      try {
        const matched = await matchScientificName(item.scientificName, {
          kingdomKey: kingdom?.kingdomKey
        });
        if (matched) {
          resolved = {
            ...matched,
            vernacularName: item.vernacularName || matched.vernacularName
          };
        } else {
          setError(`Не удалось найти «${item.scientificName}» в GBIF`);
          setTaxonSelected(null);
          return;
        }
      } catch (err) {
        setError(err?.message || "Ошибка поиска таксона в GBIF");
        setTaxonSelected(null);
        return;
      }
    }

    setError(null);
    setTaxonSelected(resolved);

    if (resolved.family && resolved.familyKey) {
      setFamilySelected({
        familyKey: resolved.familyKey,
        family: resolved.family,
        scientificName: resolved.family,
        kingdom: resolved.kingdom,
        kingdomKey: resolved.kingdomKey
      });
      setFamilyQuery(resolved.family);
    }
  };

  const handleKingdomChange = (nextId) => {
    setKingdomId(nextId);
    setFamilySelected(null);
    setFamilyQuery("");
    setFamilySuggestions([]);
    setTaxonSelected(null);
    setTaxonQuery("");
    setTaxonSuggestions([]);
  };

  const handleFamilyInputChange = (value) => {
    setFamilyQuery(value);
    if (familySelected && familySelected.family !== value.trim()) {
      setFamilySelected(null);
    }
  };

  const handleTaxonInputChange = (value) => {
    setTaxonQuery(value);
    if (
      taxonSelected &&
      taxonSelected.scientificName !== value.trim() &&
      taxonSelected.vernacularName !== value.trim()
    ) {
      setTaxonSelected(null);
    }
  };

  const handleLoad = async () => {
    if (!canLoad) {
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setError(null);
    setLoading(true);
    setLoaded(0);
    setTotal(previewCount);
    clearGbifStore();
    clearGbifLayer(map);

    let pagesSinceMapUpdate = 0;

    try {
      await loadOccurrencesForRegion(region, {
        signal: controller.signal,
        extras,
        onPage: (features, meta) => {
          const collection = appendGbifFeatures(features, region.id);
          setLoaded(collection.features.length);
          pagesSinceMapUpdate += 1;

          if (meta.endOfRecords || pagesSinceMapUpdate >= GBIF_MAP_UPDATE_PAGES) {
            setGbifData(map, collection);
            pagesSinceMapUpdate = 0;
          }
        },
        onProgress: ({ total: nextTotal }) => {
          if (typeof nextTotal === "number") {
            setTotal(nextTotal);
          }
        }
      });

      // Финальный flush на случай остатка после пачечного обновления.
      setGbifData(map, getGbifFeatureCollection());
    } catch (err) {
      if (err?.name === "AbortError") {
        setGbifData(map, getGbifFeatureCollection());
        setError(null);
      } else {
        setError(err?.message || "Не удалось загрузить данные GBIF");
      }
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
      setLoading(false);
      setLoaded(getGbifFeatureCount());
    }
  };

  const handleCancel = () => {
    abortRef.current?.abort();
  };

  const handleClear = () => {
    abortRef.current?.abort();
    clearGbifStore();
    clearGbifLayer(map);
    setLoaded(0);
    setTotal(null);
    setError(null);
    setLoading(false);
  };

  const handleVisibilityChange = (checked) => {
    setLayerVisibleState(checked);
    setGbifVisibility(map, checked);
  };

  const handleGbifOnlyChange = (checked) => {
    if (checked) {
      // Режим «только GBIF» бесполезен со скрытым слоем.
      setLayerVisibleState(true);
      setGbifVisibility(map, true);
    }
    onGbifOnlyChange?.(checked);
  };

  return (
    <div className={`feature-popup gbif-panel ${collapsed ? "feature-popup--collapsed" : ""}`}>
      <div className="feature-popup-header">
        <h3 className="feature-popup-title">Данные GBIF</h3>
        <div className="popup-panel-header-actions">
          <ModuleHelpButton open={helpOpen} onClick={() => setHelpOpen((value) => !value)} />
          {onCollapsedChange && (
            <button
              type="button"
              className="popup-panel-toggle"
              onClick={() => onCollapsedChange(!collapsed)}
              aria-expanded={!collapsed}
              aria-label={toggleLabel}
              title={toggleLabel}
            >
              {collapsed ? "▾" : "▴"}
            </button>
          )}
        </div>
      </div>

      {collapsed ? (
        <p className="popup-collapsed-summary">
          {loading
            ? `Загрузка… ${formatCount(loaded)}${total != null ? ` / ${formatCount(total)}` : ""}`
            : loaded > 0
              ? `На карте: ${formatCount(loaded)}`
              : "Слой пуст"}
        </p>
      ) : (
        <div className="gbif-panel-content">
          <p className="gbif-panel-hint">
            Внешние находки с GBIF на отдельном слое. Сначала выберите царство — это сильно
            уменьшает объём загрузки. Семейство и вид необязательны.
          </p>

          <label className="gbif-panel-field" htmlFor="gbif-region-select">
            <span className="gbif-panel-label">Регион</span>
            <select
              id="gbif-region-select"
              className="gbif-panel-select"
              value={regionId}
              disabled={loading}
              onChange={(event) => setRegionId(event.target.value)}
            >
              {GBIF_REGIONS.map(({ id, label }) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <label className="gbif-panel-field" htmlFor="gbif-kingdom-select">
            <span className="gbif-panel-label">Царство</span>
            <select
              id="gbif-kingdom-select"
              className="gbif-panel-select"
              value={kingdomId}
              disabled={loading}
              onChange={(event) => handleKingdomChange(event.target.value)}
            >
              {GBIF_KINGDOMS.map(({ id, label }) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <div className="gbif-panel-field gbif-panel-autocomplete">
            <label className="gbif-panel-label" htmlFor="gbif-family-input">
              Семейство
            </label>
            <input
              id="gbif-family-input"
              className="gbif-panel-input"
              type="text"
              autoComplete="off"
              placeholder="Например, Betulaceae"
              value={familyQuery}
              disabled={loading}
              onChange={(event) => handleFamilyInputChange(event.target.value)}
            />
            {familySuggestions.length > 0 && (
              <ul className="gbif-suggest-list" role="listbox">
                {familySuggestions.map((item) => (
                  <li key={item.familyKey}>
                    <button
                      type="button"
                      className="gbif-suggest-item"
                      onClick={() => {
                        setFamilySelected(item);
                        setFamilyQuery(item.family);
                        setFamilySuggestions([]);
                      }}
                    >
                      <span className="gbif-suggest-primary">{item.family}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {familySelected && (
              <p className="gbif-panel-selected">Выбрано: {familySelected.family}</p>
            )}
          </div>

          <div className="gbif-panel-field gbif-panel-autocomplete">
            <label className="gbif-panel-label" htmlFor="gbif-taxon-input">
              Вид / род (латынь или русский)
            </label>
            <input
              id="gbif-taxon-input"
              className="gbif-panel-input"
              type="text"
              autoComplete="off"
              placeholder="Betula pendula или Берёза"
              value={taxonQuery}
              disabled={loading}
              onChange={(event) => handleTaxonInputChange(event.target.value)}
            />
            {taxonSuggestions.length > 0 && (
              <ul className="gbif-suggest-list" role="listbox">
                {taxonSuggestions.map((item) => (
                  <li key={item.taxonKey}>
                    <button
                      type="button"
                      className="gbif-suggest-item"
                      onClick={() => {
                        applyTaxonSelection(item);
                      }}
                    >
                      <span className="gbif-suggest-primary">{item.scientificName}</span>
                      <span className="gbif-suggest-meta">
                        {[item.vernacularName, item.rank, item.family]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {taxonSelected && (
              <p className="gbif-panel-selected">
                Выбрано: {taxonSelected.scientificName}
                {taxonSelected.vernacularName ? ` (${taxonSelected.vernacularName})` : ""}
              </p>
            )}
          </div>

          <p className="gbif-panel-progress" aria-live="polite">
            {previewLoading
              ? "Оценка числа находок…"
              : previewCount != null
                ? `По фильтрам ≈ ${formatCount(previewCount)} находок (~${formatCount(
                    Math.ceil(previewCount / GBIF_PAGE_SIZE)
                  )} стр.)`
                : "Задайте фильтры, чтобы увидеть оценку"}
          </p>

          <div className="gbif-panel-actions">
            <button
              type="button"
              className="gbif-panel-btn"
              disabled={!canLoad}
              onClick={handleLoad}
            >
              Загрузить
            </button>
            <button
              type="button"
              className="gbif-panel-btn gbif-panel-btn--secondary"
              disabled={!loading}
              onClick={handleCancel}
            >
              Отменить
            </button>
            <button
              type="button"
              className="gbif-panel-btn gbif-panel-btn--danger"
              disabled={loading || loaded === 0}
              onClick={handleClear}
            >
              Очистить
            </button>
          </div>

          <label className="gbif-panel-toggle">
            <input
              type="checkbox"
              checked={layerVisible}
              onChange={(event) => handleVisibilityChange(event.target.checked)}
            />
            Показывать слой GBIF
          </label>

          <label className="gbif-panel-toggle" title="Скрыть проверенные и пользовательские точки">
            <input
              type="checkbox"
              checked={gbifOnly}
              onChange={(event) => handleGbifOnlyChange(event.target.checked)}
            />
            Только GBIF
          </label>

          {(loading || loaded > 0 || total != null) && (
            <p className="gbif-panel-progress" aria-live="polite">
              {loading ? "Загрузка: " : "Загружено: "}
              {formatCount(loaded)}
              {total != null ? ` из ${formatCount(total)}` : ""}
              {loading ? "…" : ""}
            </p>
          )}

          {error && <p className="gbif-panel-error">{error}</p>}
        </div>
      )}

      <ModuleHelpPanel sectionId={MODULE_IDS.GBIF} open={helpOpen} />
    </div>
  );
}
