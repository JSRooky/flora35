import React, { useEffect, useMemo, useRef, useState } from "react";
import { ModuleHelpButton, ModuleHelpPanel } from "./ModuleHelp";
import { MODULE_IDS } from "./ModuleMenu";
import PanelCloseButton from "./PanelCloseButton";
import PanelHint from "./PanelHint";
import PanelMinimizeButton from "./PanelMinimizeButton";
import {
  DENSE_PILE_MIN_SIZE_MAX,
  DENSE_PILE_MIN_SIZE_MIN,
  MIN_DENSE_PILE_SIZE
} from "./densePiles";
import { DEFAULT_POINT_COLOR } from "./pointColors";
import "../styles/DenseClustersPanel.css";
import { ListIcon, EyeIcon, EyeOffIcon, ZoomOutIcon } from "../images/buttons";

function formatCoordinates(coordinates) {
  if (!Array.isArray(coordinates) || coordinates.length < 2) {
    return "—";
  }

  const [lng, lat] = coordinates;
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    return "—";
  }

  return `${lat.toFixed(3)}, ${lng.toFixed(3)}`;
}

/**
 * Панель «Обработка плотных групп».
 * Открывается кнопкой «Обработка» в «Группы точек» и скрывает остальные панели.
 */
export default function DenseClustersPanel({
  pileCount = null,
  pointCount = null,
  piles = [],
  selectedPileKey = null,
  canZoomBack = false,
  speciesListOpen = false,
  groupsHidden = false,
  hiddenPileKeys = [],
  minPileSize = MIN_DENSE_PILE_SIZE,
  onMinPileSizeChange,
  onSelectPile,
  onZoomBack,
  onToggleSpeciesList,
  onTogglePileHidden,
  onToggleGroupsHidden,
  onClose,
  collapsed: collapsedProp,
  onCollapsedChange,
  onMinimize
}) {
  const [collapsedInternal, setCollapsedInternal] = useState(false);
  const isControlled = collapsedProp !== undefined;
  const collapsed = isControlled ? collapsedProp : collapsedInternal;
  const setCollapsed = onCollapsedChange ?? setCollapsedInternal;
  const toggleLabel = collapsed ? "Развернуть" : "Свернуть";
  const [helpOpen, setHelpOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const selectedPileRowRef = useRef(null);

  const rangeProgress = useMemo(() => {
    const span = DENSE_PILE_MIN_SIZE_MAX - DENSE_PILE_MIN_SIZE_MIN;
    if (span <= 0) {
      return 0;
    }
    return ((minPileSize - DENSE_PILE_MIN_SIZE_MIN) / span) * 100;
  }, [minPileSize]);

  const hiddenPileKeySet = useMemo(
    () => new Set((hiddenPileKeys ?? []).map(String)),
    [hiddenPileKeys]
  );

  useEffect(() => {
    if (selectedPileKey) {
      setListOpen(true);
    }
  }, [selectedPileKey]);

  useEffect(() => {
    if (!selectedPileKey || !listOpen || collapsed) {
      return;
    }

    // После открытия списка / смены выделения — прокрутить строку в центр окошка списка.
    const frameId = window.requestAnimationFrame(() => {
      const row = selectedPileRowRef.current;
      const list = row?.closest(".dense-clusters-panel-list");
      if (!row || !list) {
        return;
      }

      const rowRect = row.getBoundingClientRect();
      const listRect = list.getBoundingClientRect();
      const delta =
        rowRect.top -
        listRect.top -
        (list.clientHeight / 2 - rowRect.height / 2);

      list.scrollTo({
        top: Math.max(0, list.scrollTop + delta),
        behavior: "smooth"
      });
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [selectedPileKey, listOpen, collapsed]);

  return (
    <aside
      className={`dense-clusters-panel dense-clusters-panel--processing${
        collapsed ? " dense-clusters-panel--collapsed" : ""
      }`}
      aria-label="Обработка плотных групп"
    >
      <div className="dense-clusters-panel-header">
        <h3 className="dense-clusters-panel-title">Обработка плотных групп</h3>
        <div className="popup-panel-header-actions">
          <ModuleHelpButton
            mapToolAccent
            open={helpOpen}
            onClick={() => setHelpOpen((value) => !value)}
          />
          {onMinimize ? <PanelMinimizeButton onClick={onMinimize} /> : null}
          <button
            type="button"
            className="dense-clusters-panel-toggle"
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
        <p className="dense-clusters-panel-summary">
          {typeof pileCount === "number"
            ? `групп: ${pileCount} · порог ≥${minPileSize}${
                groupsHidden ? " · скрыты" : ""
              }`
            : `порог ≥${minPileSize}${groupsHidden ? " · скрыты" : ""}`}
        </p>
      ) : (
        <div className="dense-clusters-panel-content">
          <PanelHint>
            {groupsHidden
              ? "Плотные группы скрыты на карте. Список и порог остаются доступны; остальные панели скрыты на время обработки."
              : `На карте только группы из ≥${minPileSize} точек с полностью одинаковыми координатами. Остальные панели скрыты на время обработки.`}
          </PanelHint>

          <div className="dense-clusters-panel-threshold">
            <label
              className="dense-clusters-panel-threshold-label"
              htmlFor="dense-pile-min-size"
            >
              Минимум точек в группе: <strong>{minPileSize}</strong>
            </label>
            <input
              id="dense-pile-min-size"
              type="range"
              className="dense-clusters-panel-threshold-range"
              min={DENSE_PILE_MIN_SIZE_MIN}
              max={DENSE_PILE_MIN_SIZE_MAX}
              step={1}
              value={minPileSize}
              onChange={(event) =>
                onMinPileSizeChange?.(Number(event.target.value))
              }
              style={{ "--range-progress": `${rangeProgress}%` }}
              aria-valuemin={DENSE_PILE_MIN_SIZE_MIN}
              aria-valuemax={DENSE_PILE_MIN_SIZE_MAX}
              aria-valuenow={minPileSize}
              aria-label="Минимальное число точек в плотной группе"
            />
            <div className="dense-clusters-panel-threshold-scale" aria-hidden="true">
              <span>{DENSE_PILE_MIN_SIZE_MIN}</span>
              <span>{DENSE_PILE_MIN_SIZE_MAX}</span>
            </div>
          </div>

          <div className="dense-clusters-panel-stats">
            <div className="dense-clusters-panel-stat">
              <span className="dense-clusters-panel-stat-value">
                {pileCount ?? "—"}
              </span>
              <span className="dense-clusters-panel-stat-label">групп</span>
            </div>
            <div className="dense-clusters-panel-stat">
              <span className="dense-clusters-panel-stat-value">
                {pointCount ?? "—"}
              </span>
              <span className="dense-clusters-panel-stat-label">точек в группах</span>
            </div>
          </div>

          <div className="dense-clusters-panel-actions">
            <button
              type="button"
              className={`dense-clusters-panel-btn${
                groupsHidden ? " dense-clusters-panel-btn--active" : ""
              }`}
              onClick={() => onToggleGroupsHidden?.()}
              aria-pressed={groupsHidden}
              title={
                groupsHidden
                  ? "Снова показать плотные группы на карте"
                  : "Скрыть плотные группы на карте, не закрывая панель"
              }
            >
              {groupsHidden ? "Показать группы" : "Скрыть группы"}
            </button>
            <button
              type="button"
              className={`dense-clusters-panel-btn${
                listOpen ? " dense-clusters-panel-btn--active" : ""
              }`}
              onClick={() => setListOpen((value) => !value)}
              aria-expanded={listOpen}
            >
              {listOpen ? "Скрыть список" : "Список"}
            </button>
            <button
              type="button"
              className="dense-clusters-panel-btn dense-clusters-panel-btn--secondary"
              onClick={() => onClose?.()}
            >
              Закрыть
            </button>
          </div>

          {listOpen && (
            <div className="dense-clusters-panel-list-wrap">
              <p className="dense-clusters-panel-list-title">
                Плотные группы
                {typeof pileCount === "number" ? ` (${pileCount})` : ""}
              </p>
              {piles.length === 0 ? (
                <p className="dense-clusters-panel-list-empty">Плотных групп не найдено.</p>
              ) : (
                <ul className="dense-clusters-panel-list">
                  {piles.map((pile, index) => {
                    const selected = pile.key === selectedPileKey;
                    const pileHidden = hiddenPileKeySet.has(String(pile.key));

                    return (
                      <li
                        key={pile.key}
                        ref={selected ? selectedPileRowRef : null}
                        className={`dense-clusters-panel-list-row${
                          selected ? " dense-clusters-panel-list-row--selected" : ""
                        }${pileHidden ? " dense-clusters-panel-list-row--hidden" : ""}`}
                      >
                        <div className="dense-clusters-panel-list-main">
                          <button
                            type="button"
                            className="dense-clusters-panel-list-item"
                            onClick={() => onSelectPile?.(pile)}
                            title="Показать группу на карте"
                            aria-current={selected ? "true" : undefined}
                          >
                            <span className="dense-clusters-panel-list-index">
                              {index + 1}.
                            </span>
                            <span className="dense-clusters-panel-list-coords">
                              {formatCoordinates(pile.coordinates)}
                            </span>
                          </button>

                          {selected && (
                            <div className="dense-clusters-panel-list-inline-actions">
                              <button
                                type="button"
                                className="dense-clusters-panel-icon-btn"
                                onClick={() => onZoomBack?.()}
                                disabled={!canZoomBack}
                                title="Вернуть прежний масштаб"
                                aria-label="Вернуть прежний масштаб"
                              >
                                <ZoomOutIcon className="dense-clusters-panel-icon-btn-svg dense-clusters-panel-icon-btn-svg--zoom" />
                              </button>
                              <button
                                type="button"
                                className={`dense-clusters-panel-icon-btn${
                                  speciesListOpen ? " dense-clusters-panel-icon-btn--active" : ""
                                }`}
                                onClick={() => onToggleSpeciesList?.(pile)}
                                aria-pressed={speciesListOpen}
                                title={
                                  speciesListOpen
                                    ? "Скрыть список видов"
                                    : "Список видов группы"
                                }
                                aria-label={
                                  speciesListOpen
                                    ? "Скрыть список видов"
                                    : "Список видов группы"
                                }
                              >
                                <ListIcon className="dense-clusters-panel-icon-btn-svg" />
                              </button>
                            </div>
                          )}

                          <button
                            type="button"
                            className="dense-clusters-panel-list-meta"
                            onClick={() => onSelectPile?.(pile)}
                            title="Показать группу на карте"
                            tabIndex={-1}
                          >
                            <span className="dense-clusters-panel-list-count">
                              {pile.pointCount}
                            </span>
                            <span
                              className="dense-clusters-panel-list-dot"
                              style={{
                                backgroundColor: pile.color ?? DEFAULT_POINT_COLOR
                              }}
                              aria-hidden="true"
                            />
                          </button>

                          <button
                            type="button"
                            className={`dense-clusters-panel-icon-btn dense-clusters-panel-list-hide-btn${
                              pileHidden ? " dense-clusters-panel-icon-btn--hidden" : ""
                            }`}
                            onClick={() => onTogglePileHidden?.(pile)}
                            aria-pressed={pileHidden}
                            title={pileHidden ? "Показать группу на карте" : "Скрыть группу на карте"}
                            aria-label={pileHidden ? "Показать группу на карте" : "Скрыть группу на карте"}
                          >
                            {pileHidden ? (
                              <EyeOffIcon className="dense-clusters-panel-icon-btn-svg" aria-hidden="true" focusable="false" />
                            ) : (
                              <EyeIcon className="dense-clusters-panel-icon-btn-svg" aria-hidden="true" focusable="false" />
                            )}
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      <ModuleHelpPanel mapToolAccent sectionId={MODULE_IDS.DENSE} open={helpOpen} />
    </aside>
  );
}
