import React, { useMemo } from "react";
import { EXTERNAL_REGIONS, getExternalRegionById } from "../externalSources/regions";
import { normalizeHiddenRegionIds } from "../externalSources/regionVisibility";
import PanelHint from "./PanelHint";
import "../styles/RegionsLoadPopup.css";
import "../styles/GbifPanel.css";

/**
 * Плавающее окно: включить / выключить отображение точек загруженных регионов.
 */
export default function RegionsFilterPopup({
  open = false,
  loadedRegionIds,
  hiddenRegionIds,
  onHiddenRegionIdsChange,
  onClose
}) {
  const loadedIds = useMemo(() => {
    if (loadedRegionIds instanceof Set) {
      return loadedRegionIds;
    }
    return new Set(Array.isArray(loadedRegionIds) ? loadedRegionIds : []);
  }, [loadedRegionIds]);

  const hidden = useMemo(
    () => new Set(normalizeHiddenRegionIds(hiddenRegionIds)),
    [hiddenRegionIds]
  );

  const rows = useMemo(() => {
    const known = EXTERNAL_REGIONS.filter((region) => loadedIds.has(region.id));
    const knownIds = new Set(known.map((region) => region.id));
    const extra = [...loadedIds]
      .filter((id) => !knownIds.has(id))
      .map((id) => {
        const region = getExternalRegionById(id);
        return region || { id, label: id };
      });
    return [...known, ...extra];
  }, [loadedIds]);

  if (!open) {
    return null;
  }

  const setHidden = (nextHidden) => {
    onHiddenRegionIdsChange?.(normalizeHiddenRegionIds([...nextHidden]));
  };

  const handleToggle = (regionId, visible) => {
    const next = new Set(hidden);
    if (visible) {
      next.delete(regionId);
    } else {
      next.add(regionId);
    }
    setHidden(next);
  };

  const handleShowAll = () => {
    setHidden(new Set());
  };

  const handleHideAll = () => {
    setHidden(new Set(rows.map((region) => region.id)));
  };

  return (
    <div className="regions-load-overlay" onClick={() => onClose?.()}>
      <div
        className="regions-load-dialog regions-filter-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Фильтр регионов"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="regions-load-close"
          onClick={() => onClose?.()}
          aria-label="Закрыть"
          title="Закрыть"
        >
          ×
        </button>
        <h3 className="regions-load-title">Фильтр регионов</h3>
        <PanelHint>
          Снимите галочку, чтобы скрыть точки региона на карте. Данные в локальной
          копии не удаляются.
        </PanelHint>

        {rows.length === 0 ? (
          <p className="regions-load-hint">Нет загруженных регионов.</p>
        ) : (
          <>
            <div className="gbif-panel-actions">
              <button
                type="button"
                className="gbif-panel-btn gbif-panel-btn--secondary"
                onClick={handleShowAll}
              >
                Показать все
              </button>
              <button
                type="button"
                className="gbif-panel-btn gbif-panel-btn--secondary"
                onClick={handleHideAll}
              >
                Скрыть все
              </button>
            </div>
            <ul className="regions-filter-list">
              {rows.map((region) => {
                const visible = !hidden.has(region.id);
                return (
                  <li key={region.id} className="regions-filter-item">
                    <label className="regions-filter-label">
                      <input
                        type="checkbox"
                        checked={visible}
                        onChange={(event) =>
                          handleToggle(region.id, event.target.checked)
                        }
                      />
                      <span>{region.label}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
