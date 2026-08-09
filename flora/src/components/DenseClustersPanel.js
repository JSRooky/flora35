import React, { useEffect, useRef, useState } from "react";
import { ModuleHelpButton, ModuleHelpPanel } from "./ModuleHelp";
import { MODULE_IDS } from "./ModuleMenu";
import PanelMinimizeButton from "./PanelMinimizeButton";
import { DEFAULT_POINT_COLOR } from "./pointColors";
import "../styles/DenseClustersPanel.css";

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

function ListIcon({ className = "" }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <line
        x1="8"
        y1="6"
        x2="21"
        y2="6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <line
        x1="8"
        y1="12"
        x2="21"
        y2="12"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <line
        x1="8"
        y1="18"
        x2="21"
        y2="18"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="4" cy="6" r="1" fill="currentColor" />
      <circle cx="4" cy="12" r="1" fill="currentColor" />
      <circle cx="4" cy="18" r="1" fill="currentColor" />
    </svg>
  );
}

function ZoomOutIcon({ className = "" }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill="none"
    >
      <circle cx="10.5" cy="10.5" r="6" stroke="currentColor" strokeWidth="2" />
      <line
        x1="8"
        y1="10.5"
        x2="13"
        y2="10.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <line
        x1="15.5"
        y1="15.5"
        x2="20"
        y2="20"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
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
  onSelectPile,
  onZoomBack,
  onToggleSpeciesList,
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
        </div>
      </div>

      {collapsed ? (
        <p className="dense-clusters-panel-summary">
          {typeof pileCount === "number" ? `групп: ${pileCount}` : "плотные группы"}
        </p>
      ) : (
        <div className="dense-clusters-panel-content">
          <p className="dense-clusters-panel-note">
            На карте только группы из ≥10 точек с полностью одинаковыми координатами.
            Остальные панели скрыты на время обработки.
          </p>

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

                    return (
                      <li
                        key={pile.key}
                        ref={selected ? selectedPileRowRef : null}
                        className={`dense-clusters-panel-list-row${
                          selected ? " dense-clusters-panel-list-row--selected" : ""
                        }`}
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
