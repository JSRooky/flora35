import React, { useMemo, useState } from "react";
import PanelHint from "./PanelHint";
import {
  OSM_ADMIN_LOAD_MODES,
  OSM_ADMIN_LOAD_MODE_LABELS
} from "../osm/osmAdminBoundaries";
import "../styles/RegionsLoadPopup.css";
import "../styles/OsmAdminLoadPopup.css";
import "../styles/GbifPanel.css";

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

/** Окно загрузки административных границ из OSM. */
export default function OsmAdminLoadPopup({
  open = false,
  loading = false,
  status = "",
  error = "",
  catalog = [],
  hasDistrictTarget = false,
  osmLayerTargetLabel = "",
  onLoad,
  onClose
}) {
  const [mode, setMode] = useState(OSM_ADMIN_LOAD_MODES.COUNTRY);
  const [downloadJson, setDownloadJson] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [pickedRegion, setPickedRegion] = useState(null);

  const query = normalizeSearchQuery(searchQuery);
  const searchResults = useMemo(() => {
    if (!query || !Array.isArray(catalog)) {
      return [];
    }
    return catalog
      .filter(
        (entry) =>
          matchesRegionSearch(entry, query) && entry.iso !== pickedRegion?.iso
      )
      .slice(0, 12);
  }, [catalog, pickedRegion, query]);

  if (!open) {
    return null;
  }

  const hasTarget = hasDistrictTarget || Boolean(pickedRegion);
  const canLoad =
    !loading && (mode !== OSM_ADMIN_LOAD_MODES.DISTRICTS || hasTarget);

  const handlePick = (entry) => {
    setPickedRegion(entry);
    setSearchQuery("");
  };

  const handleLoad = () => {
    onLoad?.({
      mode,
      downloadJson,
      regionIso: pickedRegion?.iso || null
    });
  };

  return (
    <div className="regions-load-overlay" onClick={() => !loading && onClose?.()}>
      <div
        className="regions-load-dialog osm-admin-load-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Загрузка границ OSM"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="regions-load-close"
          onClick={onClose}
          aria-label="Закрыть"
          title="Закрыть"
          disabled={loading}
        >
          ×
        </button>
        <h3 className="regions-load-title">Границы OpenStreetMap</h3>
        <PanelHint>
          Сначала запрашиваются только идентификаторы границ, геометрия подгружается небольшими
          пакетами и с запасных зеркал Overpass. Если сервер всё равно не отвечает — контур
          берётся из Nominatim.
        </PanelHint>

        <fieldset className="osm-admin-load-modes" disabled={loading}>
          <legend className="osm-admin-load-legend">Что загрузить</legend>
          {Object.values(OSM_ADMIN_LOAD_MODES).map((item) => (
            <label key={item} className="osm-admin-load-option">
              <input
                type="radio"
                name="osm-admin-load-mode"
                value={item}
                checked={mode === item}
                onChange={() => setMode(item)}
              />
              <span>{OSM_ADMIN_LOAD_MODE_LABELS[item]}</span>
            </label>
          ))}
        </fieldset>

        {mode === OSM_ADMIN_LOAD_MODES.DISTRICTS ? (
          <div className="osm-admin-load-search">
            <label className="osm-admin-load-search-label">
              <span>Регион</span>
              <input
                type="search"
                value={searchQuery}
                disabled={loading}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Название субъекта…"
                autoComplete="off"
              />
            </label>
            {pickedRegion ? (
              <div className="osm-admin-load-picked">
                <span>{pickedRegion.name}</span>
                <button
                  type="button"
                  className="osm-admin-load-picked-clear"
                  disabled={loading}
                  onClick={() => setPickedRegion(null)}
                  aria-label="Сбросить выбранный регион"
                >
                  ×
                </button>
              </div>
            ) : null}
            {query && searchResults.length === 0 ? (
              <p className="regions-load-hint">Ничего не найдено</p>
            ) : null}
            {searchResults.length > 0 ? (
              <ul className="osm-admin-load-results" aria-label="Совпадения поиска">
                {searchResults.map((entry) => (
                  <li key={entry.iso}>
                    <button
                      type="button"
                      className="osm-admin-load-result"
                      onClick={() => handlePick(entry)}
                    >
                      <span className="osm-admin-load-result-name">{entry.name}</span>
                      {entry.fo ? (
                        <span className="osm-admin-load-result-meta">{entry.fo}</span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {!pickedRegion && !hasDistrictTarget ? (
              <p className="regions-load-hint">
                Найдите субъект в строке выше — выбирать его на карте не обязательно.
              </p>
            ) : null}
            {!pickedRegion && osmLayerTargetLabel ? (
              <p className="regions-load-hint">Слой: {osmLayerTargetLabel}</p>
            ) : null}
          </div>
        ) : null}

        {mode === OSM_ADMIN_LOAD_MODES.REGIONS ? (
          <p className="regions-load-hint">
            Все субъекты РФ — много контуров; загрузка идёт пакетами и может занять минуту.
          </p>
        ) : null}

        <label className="osm-admin-load-download">
          <input
            type="checkbox"
            checked={downloadJson}
            onChange={(event) => setDownloadJson(event.target.checked)}
          />
          <span>Сохранить JSON на диск</span>
        </label>

        {loading ? <p className="regions-load-progress-text">{status || "Запрос к OSM…"}</p> : null}
        {status && !loading ? <p className="regions-load-hint">{status}</p> : null}
        {error ? <p className="regions-load-error">{error}</p> : null}

        <div className="osm-admin-load-actions">
          <button
            type="button"
            className="gbif-panel-btn gbif-panel-btn--secondary"
            onClick={onClose}
            disabled={loading}
          >
            Закрыть
          </button>
          <button
            type="button"
            className="gbif-panel-btn"
            disabled={!canLoad}
            onClick={handleLoad}
          >
            {loading ? "Загрузка…" : "Загрузить"}
          </button>
        </div>
      </div>
    </div>
  );
}
