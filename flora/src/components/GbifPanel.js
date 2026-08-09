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
  previewOccurrenceCount,
  withUpdateSinceExtras
} from "../gbif/gbifClient";
import {
  appendGbifFeatures,
  getGbifFeatureCollection,
  getGbifFeatureCount,
  getGbifLoadedQuery,
  getGbifLoadedRegionId,
  getGbifSyncedAt,
  setGbifLoadedQuery,
  setGbifSyncedAt,
  upsertGbifFeatures
} from "../gbif/gbifStore";
import {
  clearGbifStoreAndPersistence,
  persistGbifSnapshot
} from "../gbif/gbifPersistence";
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

function buildQuerySnapshot({
  regionId,
  kingdomId,
  familyQuery,
  familySelected,
  taxonQuery,
  taxonSelected
}) {
  return {
    regionId,
    kingdomId,
    familyQuery,
    familySelected,
    taxonQuery,
    taxonSelected
  };
}

/** Грубая оценка размера снимка в IndexedDB (~400 байт на точку). */
function formatEstimatedSize(count) {
  if (count == null || !Number.isFinite(count) || count <= 0) {
    return null;
  }

  const bytes = count * 400;
  if (bytes < 1024 * 1024) {
    return `≈ ${Math.max(1, Math.round(bytes / 1024))} КБ`;
  }

  return `≈ ${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

function getInitialPanelState() {
  const savedQuery = getGbifLoadedQuery();
  return {
    regionId: getGbifLoadedRegionId() || savedQuery?.regionId || DEFAULT_GBIF_REGION_ID,
    kingdomId: savedQuery?.kingdomId || "plantae",
    familyQuery: savedQuery?.familyQuery || "",
    familySelected: savedQuery?.familySelected || null,
    taxonQuery: savedQuery?.taxonQuery || "",
    taxonSelected: savedQuery?.taxonSelected || null
  };
}

/** Панель загрузки находок GBIF на отдельный слой карты. */
export default function GbifPanel({
  map,
  collapsed = false,
  onCollapsedChange,
  onDataChange
}) {
  const initial = useMemo(() => getInitialPanelState(), []);
  const [helpOpen, setHelpOpen] = useState(false);
  const [regionId, setRegionId] = useState(initial.regionId);
  const [kingdomId, setKingdomId] = useState(initial.kingdomId);
  const [familyQuery, setFamilyQuery] = useState(initial.familyQuery);
  const [familySelected, setFamilySelected] = useState(initial.familySelected);
  const [familySuggestions, setFamilySuggestions] = useState([]);
  const [taxonQuery, setTaxonQuery] = useState(initial.taxonQuery);
  const [taxonSelected, setTaxonSelected] = useState(initial.taxonSelected);
  const [taxonSuggestions, setTaxonSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(getGbifFeatureCount());
  const [total, setTotal] = useState(null);
  const [previewCount, setPreviewCount] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [updateAdded, setUpdateAdded] = useState(0);
  const [updateFetched, setUpdateFetched] = useState(0);
  const [syncedAt, setSyncedAtState] = useState(() => getGbifSyncedAt());
  const [error, setError] = useState(null);
  const [layerVisible, setLayerVisibleState] = useState(true);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const abortRef = useRef(null);
  const previewAbortRef = useRef(null);
  const suggestAbortRef = useRef(null);

  const debouncedFamilyQuery = useDebouncedValue(familyQuery, 300);
  const debouncedTaxonQuery = useDebouncedValue(taxonQuery, 300);

  const region = getGbifRegionById(regionId);
  const kingdom = getGbifKingdomById(kingdomId);
  const hasDataset = loaded > 0;
  const filtersLocked = hasDataset;

  const extras = useMemo(
    () =>
      buildTaxonSearchExtras({
        kingdomId,
        family: familySelected,
        taxon: taxonSelected
      }),
    [kingdomId, familySelected, taxonSelected]
  );

  const requestExtras = useMemo(
    () => (hasDataset ? withUpdateSinceExtras(extras, syncedAt) : extras),
    [hasDataset, extras, syncedAt]
  );

  const canLoad = Boolean(map && region && kingdom && !loading);
  const estimatedSizeLabel = formatEstimatedSize(previewCount);

  const confirmDetails = useMemo(() => {
    const rows = [
      { label: "Регион", value: region?.label ?? regionId },
      { label: "Царство", value: kingdom?.label ?? kingdomId }
    ];

    if (familySelected?.family || familyQuery.trim()) {
      rows.push({
        label: "Семейство",
        value: familySelected?.family || familyQuery.trim()
      });
    }

    if (taxonSelected?.scientificName || taxonQuery.trim()) {
      rows.push({
        label: "Вид / род",
        value: taxonSelected?.scientificName
          ? taxonSelected.vernacularName
            ? `${taxonSelected.scientificName} (${taxonSelected.vernacularName})`
            : taxonSelected.scientificName
          : taxonQuery.trim()
      });
    }

    if (hasDataset) {
      rows.push({
        label: "Набор",
        value: `${formatCount(loaded)} находок на этом компьютере`
      });
      rows.push({
        label: "Обновления",
        value:
          previewCount != null
            ? `≈ ${formatCount(previewCount)} записей с ${
                syncedAt ? new Date(syncedAt).toLocaleDateString("ru-RU") : "последней синхронизации"
              }${estimatedSizeLabel ? ` (${estimatedSizeLabel})` : ""}`
            : "объём уточнится во время обновления"
      });
    } else {
      rows.push({
        label: "Объём",
        value:
          previewCount != null
            ? `≈ ${formatCount(previewCount)} находок (~${formatCount(
                Math.ceil(previewCount / GBIF_PAGE_SIZE)
              )} стр.)${estimatedSizeLabel ? `, ${estimatedSizeLabel}` : ""}`
            : "объём уточнится во время загрузки"
      });
    }

    return rows;
  }, [
    region,
    regionId,
    kingdom,
    kingdomId,
    familySelected,
    familyQuery,
    taxonSelected,
    taxonQuery,
    previewCount,
    estimatedSizeLabel,
    hasDataset,
    loaded,
    syncedAt
  ]);

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

  // Оценка числа точек до загрузки / числа обновлений для текущего набора
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
      previewOccurrenceCount(region, { signal: controller.signal, extras: requestExtras })
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
  }, [region, kingdom, requestExtras]);

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

  const notifyDataChange = () => {
    onDataChange?.();
  };

  const handleLoadClick = () => {
    if (!canLoad) {
      return;
    }

    // Для уже сохранённого набора подтверждение не нужно — сразу обновляем.
    if (hasDataset) {
      handleLoad();
      return;
    }

    setConfirmOpen(true);
  };

  const handleConfirmClose = () => {
    setConfirmOpen(false);
  };

  const handleLoad = async () => {
    if (!canLoad) {
      return;
    }

    const updating = hasDataset;
    setConfirmOpen(false);

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const querySnapshot = buildQuerySnapshot({
      regionId,
      kingdomId,
      familyQuery,
      familySelected,
      taxonQuery,
      taxonSelected
    });

    setError(null);
    setLoading(true);
    setTotal(previewCount);
    setUpdateAdded(0);
    setUpdateFetched(0);

    if (!updating) {
      setLoaded(0);
      await clearGbifStoreAndPersistence();
      clearGbifLayer(map);
      notifyDataChange();
    }

    let pagesSinceMapUpdate = 0;
    let addedTotal = 0;
    let fetchedTotal = 0;

    try {
      await loadOccurrencesForRegion(region, {
        signal: controller.signal,
        extras: requestExtras,
        onPage: (features, meta) => {
          fetchedTotal += features.length;
          setUpdateFetched(fetchedTotal);

          if (updating) {
            const { collection, added } = upsertGbifFeatures(features, region.id);
            addedTotal += added;
            setUpdateAdded(addedTotal);
            setLoaded(collection.features.length);
            pagesSinceMapUpdate += 1;

            if (meta.endOfRecords || pagesSinceMapUpdate >= GBIF_MAP_UPDATE_PAGES) {
              setGbifData(map, collection);
              pagesSinceMapUpdate = 0;
            }
            return;
          }

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

      setGbifData(map, getGbifFeatureCollection());
    } catch (err) {
      if (err?.name === "AbortError") {
        setGbifData(map, getGbifFeatureCollection());
        setError(null);
      } else {
        setError(
          err?.message ||
            (updating ? "Не удалось обновить данные GBIF" : "Не удалось загрузить данные GBIF")
        );
      }
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
      const nextSyncedAt = new Date().toISOString();
      setLoading(false);
      setLoaded(getGbifFeatureCount());
      setGbifLoadedQuery(querySnapshot);
      setGbifSyncedAt(nextSyncedAt);
      setSyncedAtState(nextSyncedAt);
      await persistGbifSnapshot();
      notifyDataChange();
    }
  };

  const handleCancel = () => {
    abortRef.current?.abort();
  };

  const handleClear = async () => {
    abortRef.current?.abort();
    await clearGbifStoreAndPersistence();
    clearGbifLayer(map);
    setLoaded(0);
    setTotal(null);
    setUpdateAdded(0);
    setUpdateFetched(0);
    setSyncedAtState(null);
    setError(null);
    setLoading(false);
    notifyDataChange();
  };

  const handleVisibilityChange = (checked) => {
    setLayerVisibleState(checked);
    setGbifVisibility(map, checked);
    notifyDataChange();
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
            ? hasDataset
              ? `Обновление… +${formatCount(updateAdded)} · ${formatCount(loaded)}`
              : `Загрузка… ${formatCount(loaded)}${total != null ? ` / ${formatCount(total)}` : ""}`
            : loaded > 0
              ? `Набор: ${formatCount(loaded)}`
              : "Слой пуст"}
        </p>
      ) : (
        <div className="gbif-panel-content">
          <p className="gbif-panel-hint">
            {hasDataset
              ? "Работаете с сохранённым набором GBIF. Фильтры зафиксированы — можно только подтянуть обновления или очистить набор и загрузить другой."
              : "Внешние находки с GBIF на отдельном слое. Сначала выберите царство — это сильно уменьшает объём загрузки. Семейство и вид необязательны."}
          </p>

          <label className="gbif-panel-field" htmlFor="gbif-region-select">
            <span className="gbif-panel-label">Регион</span>
            <select
              id="gbif-region-select"
              className="gbif-panel-select"
              value={regionId}
              disabled={loading || filtersLocked}
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
              disabled={loading || filtersLocked}
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
              disabled={loading || filtersLocked}
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
              disabled={loading || filtersLocked}
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

          <div
            className={`gbif-panel-status${loading ? " gbif-panel-status--loading" : ""}`}
            aria-live="polite"
          >
            <div className="gbif-panel-status-text">
              {loading ? (
                hasDataset ? (
                  <>
                    Обновление: получено <strong>{formatCount(updateFetched)}</strong>
                    {total != null ? (
                      <>
                        {" "}
                        из <strong>{formatCount(total)}</strong>
                      </>
                    ) : null}
                    {" · "}
                    новых <strong>{formatCount(updateAdded)}</strong>
                    {" · "}
                    на карте <strong>{formatCount(loaded)}</strong>
                  </>
                ) : (
                  <>
                    Загрузка: <strong>{formatCount(loaded)}</strong>
                    {total != null ? (
                      <>
                        {" "}
                        из <strong>{formatCount(total)}</strong>
                      </>
                    ) : null}
                  </>
                )
              ) : previewLoading ? (
                hasDataset ? "Оценка обновлений…" : "Оценка числа находок…"
              ) : hasDataset ? (
                <>
                  Набор: <strong>{formatCount(loaded)}</strong>
                  {syncedAt ? (
                    <>
                      {" · "}
                      синхр. {new Date(syncedAt).toLocaleString("ru-RU")}
                    </>
                  ) : null}
                  {previewCount != null ? (
                    <>
                      {" · "}
                      обновлений ≈ <strong>{formatCount(previewCount)}</strong>
                    </>
                  ) : null}
                </>
              ) : previewCount != null ? (
                <>
                  По фильтрам ≈ <strong>{formatCount(previewCount)}</strong>
                  {" "}
                  (~{formatCount(Math.ceil(previewCount / GBIF_PAGE_SIZE))} стр.)
                </>
              ) : (
                "Задайте фильтры, чтобы увидеть оценку"
              )}
            </div>
            <div
              className={`gbif-panel-status-track${
                loading && (total == null || total <= 0)
                  ? " gbif-panel-status-track--indeterminate"
                  : ""
              }`}
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={
                loading && total != null && total > 0
                  ? Math.min(100, Math.round((loaded / total) * 100))
                  : loading
                    ? undefined
                    : loaded > 0
                      ? 100
                      : 0
              }
              aria-label="Прогресс загрузки GBIF"
            >
              <div
                className="gbif-panel-status-bar"
                style={{
                  width:
                    loading && total != null && total > 0
                      ? `${Math.min(100, (loaded / total) * 100)}%`
                      : loading
                        ? "40%"
                        : loaded > 0
                          ? "100%"
                          : "0%"
                }}
              />
            </div>
          </div>

          <div className="gbif-panel-actions">
            <button
              type="button"
              className="gbif-panel-btn"
              disabled={!canLoad}
              onClick={handleLoadClick}
            >
              {hasDataset ? "Обновить" : "Загрузить"}
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

          {error && <p className="gbif-panel-error">{error}</p>}
        </div>
      )}

      <ModuleHelpPanel sectionId={MODULE_IDS.GBIF} open={helpOpen} />

      {confirmOpen && (
        <div className="gbif-confirm-overlay" onClick={handleConfirmClose}>
          <div
            className="gbif-confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="gbif-confirm-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h4 id="gbif-confirm-title" className="gbif-confirm-title">
              {hasDataset ? "Подтверждение обновления" : "Подтверждение загрузки"}
            </h4>
            <p className="gbif-confirm-text">
              {hasDataset
                ? "Подтянуть только обновления текущего набора GBIF на этот компьютер? Уже сохранённые точки останутся, новые и изменённые записи будут добавлены в локальное хранилище."
                : "Загрузить выбранные данные GBIF на этот компьютер? Они будут сохранены в локальном хранилище браузера. После загрузки набор зафиксируется — дальше можно будет только обновлять его."}
            </p>
            <dl className="gbif-confirm-details">
              {confirmDetails.map(({ label, value }) => (
                <div key={label} className="gbif-confirm-row">
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            <div className="gbif-confirm-actions">
              <button
                type="button"
                className="gbif-panel-btn gbif-panel-btn--secondary"
                onClick={handleConfirmClose}
              >
                Отмена
              </button>
              <button type="button" className="gbif-panel-btn" onClick={handleLoad}>
                {hasDataset ? "Обновить" : "Загрузить"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
