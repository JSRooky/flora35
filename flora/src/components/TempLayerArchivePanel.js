import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  getTempLayerArchiveIndex,
  listTempLayerOriginItems,
  resolveTempSourceMarkerColor,
  subscribeTempLayers,
  formatTempSourceLabel,
  TEMP_SOURCE_IDS
} from "../tempLayers/tempLayerStore";
import {
  CameraIcon,
  DownloadIcon,
  EditIcon,
  LayersIcon,
  TrashIcon
} from "../images/buttons";
import { ModuleHelpButton, ModuleHelpPanel } from "./ModuleHelp";
import { MODULE_IDS } from "./ModuleMenu";
import PanelCloseButton from "./PanelCloseButton";
import PanelHint from "./PanelHint";
import PanelMinimizeButton from "./PanelMinimizeButton";
import "../styles/TempLayerArchivePanel.css";

function InfoIcon({ className }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      <circle cx="12" cy="8.2" r="1.15" fill="currentColor" />
      <rect x="11.15" y="10.4" width="1.7" height="6.2" rx="0.7" fill="currentColor" />
    </svg>
  );
}

function archiveRowStyle(entry) {
  const gbifColor = resolveTempSourceMarkerColor(
    entry.markerColor,
    TEMP_SOURCE_IDS.GBIF
  );
  const inatColor = resolveTempSourceMarkerColor(
    entry.markerColor,
    TEMP_SOURCE_IDS.INAT
  );
  const style = {
    "--temp-layer-color-gbif": gbifColor,
    "--temp-layer-color-inat": inatColor
  };
  if (entry.markerColor) {
    style["--temp-layer-color"] = entry.markerColor;
  }
  return style;
}

function archiveRowClassName(entry) {
  const sources = new Set(entry.sources || []);
  const hasGbif = sources.has(TEMP_SOURCE_IDS.GBIF);
  const hasInat = sources.has(TEMP_SOURCE_IDS.INAT);
  const splitStripe = hasGbif && hasInat;
  return `temp-archive-row${
    splitStripe ? " temp-archive-row--split" : ""
  }${
    !splitStripe && hasGbif ? " temp-archive-row--gbif" : ""
  }${
    !splitStripe && hasInat ? " temp-archive-row--inat" : ""
  }`;
}

function formatMeta(entry) {
  const points = new Intl.NumberFormat("ru-RU").format(entry.pointCount || 0);
  const regions =
    entry.regionCount === 1
      ? "1 рег."
      : entry.regionCount > 1
        ? `${entry.regionCount} рег.`
        : null;
  const sources = [...new Set(entry.sources || [])]
    .map((source) => formatTempSourceLabel(source))
    .join(" + ");
  const date = entry.archivedAt
    ? new Date(entry.archivedAt).toLocaleDateString("ru-RU")
    : "";
  return [sources, regions, `${points} т.`, date].filter(Boolean).join(" · ");
}

function archiveOriginItems(entry) {
  return listTempLayerOriginItems({
    filterSnapshot: entry.filterSnapshot,
    overlays: (entry.overlayLabels || []).map((label) => ({ label }))
  });
}

export default function TempLayerArchivePanel({
  collapsed: collapsedProp,
  onCollapsedChange,
  onMinimize,
  onClose,
  onRestore,
  onExport,
  onDelete,
  onRename,
  statusMessage = ""
}) {
  const [collapsedInternal, setCollapsedInternal] = useState(false);
  const isControlled = collapsedProp !== undefined;
  const collapsed = isControlled ? collapsedProp : collapsedInternal;
  const setCollapsed = onCollapsedChange ?? setCollapsedInternal;
  const toggleLabel = collapsed ? "Развернуть" : "Свернуть";
  const [query, setQuery] = useState("");
  const [entries, setEntries] = useState(() => getTempLayerArchiveIndex());
  const [busyId, setBusyId] = useState("");
  const [helpOpen, setHelpOpen] = useState(false); // раздел ## temp-archive в docs/moduleHelp.md
  const [collapsedIds, setCollapsedIds] = useState(() => new Set());
  const [infoMenuArchiveId, setInfoMenuArchiveId] = useState(null);
  const [renamingId, setRenamingId] = useState(null);
  const [renameDraft, setRenameDraft] = useState("");
  const infoMenuRef = useRef(null);

  useEffect(() => {
    return subscribeTempLayers(() => {
      setEntries(getTempLayerArchiveIndex());
    });
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return entries;
    }
    return entries.filter((entry) =>
      String(entry.title || "").toLowerCase().includes(needle)
    );
  }, [entries, query]);

  const togglePlaqueCollapsed = (archiveId) => {
    setInfoMenuArchiveId((current) => (current === archiveId ? null : current));
    setCollapsedIds((current) => {
      const next = new Set(current);
      if (next.has(archiveId)) {
        next.delete(archiveId);
      } else {
        next.add(archiveId);
      }
      return next;
    });
  };

  useEffect(() => {
    if (collapsed) {
      setInfoMenuArchiveId(null);
    }
  }, [collapsed]);

  useEffect(() => {
    if (!infoMenuArchiveId) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        if (renamingId) {
          setRenamingId(null);
          setRenameDraft("");
          return;
        }
        setInfoMenuArchiveId(null);
      }
    };

    const handlePointerDown = (event) => {
      const root = infoMenuRef.current;
      if (root && event.target instanceof Node && root.contains(event.target)) {
        return;
      }
      setInfoMenuArchiveId(null);
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [infoMenuArchiveId, renamingId]);

  const run = async (archiveId, action) => {
    setBusyId(archiveId);
    try {
      await action(archiveId);
    } finally {
      setBusyId("");
    }
  };

  const startRename = (entry) => {
    setInfoMenuArchiveId(null);
    setRenamingId(entry.archiveId);
    setRenameDraft(entry.title || "");
  };

  const cancelRename = () => {
    setRenamingId(null);
    setRenameDraft("");
  };

  const commitRename = (entry) => {
    const next = renameDraft.trim();
    cancelRename();
    if (!next || next === entry.title) {
      return;
    }
    onRename?.(entry.archiveId, next);
  };

  return (
    <aside
      className={`temp-archive-panel${collapsed ? " temp-archive-panel--collapsed" : ""}${
        infoMenuArchiveId ? " temp-archive-panel--overlay-open" : ""
      }`}
      aria-label="Архив временных слоёв"
    >
      <div className="temp-archive-panel-header">
        <h3 className="temp-archive-panel-title">Архив слоёв</h3>
        <div className="popup-panel-header-actions">
          <ModuleHelpButton open={helpOpen} onClick={() => setHelpOpen((value) => !value)} />
          {onMinimize ? <PanelMinimizeButton onClick={onMinimize} /> : null}
          <button
            type="button"
            className="popup-panel-toggle"
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
        <p className="temp-archive-panel-summary">
          {entries.length
            ? `${entries.length} в архиве`
            : "архив пуст"}
        </p>
      ) : (
        <div className="temp-archive-panel-content">
          <PanelHint>
            Архив содержит слои, перенесенные из временных. Сохраняет все настройки, приданные временному слою. Может быть возвращен во временные слои в любое время. Хранится локально.
          </PanelHint>
          <input
            className="temp-archive-panel-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Поиск по названию"
            aria-label="Поиск по архиву слоёв"
          />
          {statusMessage ? (
            <p className="temp-archive-panel-status" role="status">
              {statusMessage}
            </p>
          ) : null}
          {filtered.length === 0 ? (
            <p className="temp-archive-panel-empty">
              {entries.length === 0
                ? "Пока нет архивных слоёв. Уберите плашку из временных кнопкой «В архив»."
                : "Ничего не найдено."}
            </p>
          ) : (
            <ul
              className={`temp-archive-list${
                infoMenuArchiveId ? " temp-archive-list--overlay-open" : ""
              }`}
            >
              {filtered.map((entry) => {
                const plaqueCollapsed = collapsedIds.has(entry.archiveId);
                const infoOpen = infoMenuArchiveId === entry.archiveId;
                const originItems = infoOpen ? archiveOriginItems(entry) : [];
                return (
                <li
                  key={entry.archiveId}
                  className={`${archiveRowClassName(entry)}${
                    plaqueCollapsed ? " temp-archive-row--compact" : ""
                  }${
                    infoOpen ? " temp-archive-row--info-open" : ""
                  }`}
                  style={archiveRowStyle(entry)}
                >
                  <div className="temp-archive-row-body">
                    <div className="temp-archive-row-title-row">
                    {renamingId === entry.archiveId ? (
                      <input
                        className="temp-archive-row-rename"
                        value={renameDraft}
                        maxLength={120}
                        aria-label="Название слоя"
                        autoFocus
                        disabled={Boolean(busyId)}
                        onChange={(event) => setRenameDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            commitRename(entry);
                          } else if (event.key === "Escape") {
                            event.preventDefault();
                            cancelRename();
                          }
                        }}
                        onBlur={() => commitRename(entry)}
                      />
                    ) : (
                      <div
                        className="temp-archive-row-title"
                        title="Двойной щелчок — переименовать"
                        onDoubleClick={() => startRename(entry)}
                      >
                        {entry.title}
                      </div>
                    )}
                    <button
                      type="button"
                      className={`temp-archive-row-button temp-archive-row-rename-btn${
                        renamingId === entry.archiveId ? " temp-archive-row-info--on" : ""
                      }`}
                      title="Переименовать"
                      aria-label={`Переименовать «${entry.title}»`}
                      disabled={Boolean(busyId)}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        if (renamingId === entry.archiveId) {
                          commitRename(entry);
                          return;
                        }
                        startRename(entry);
                      }}
                    >
                      <EditIcon className="temp-archive-row-icon" aria-hidden="true" focusable="false" />
                    </button>
                    </div>
                    {plaqueCollapsed ? null : (
                      <div className="temp-archive-row-meta">{formatMeta(entry)}</div>
                    )}
                  </div>
                  {plaqueCollapsed ? null : (
                  <div className="temp-archive-row-actions">
                    <div
                      className="temp-archive-row-info-wrap"
                      ref={infoOpen ? infoMenuRef : null}
                    >
                    <button
                      type="button"
                      className={`temp-archive-row-button temp-archive-row-info${
                        infoOpen ? " temp-archive-row-info--on" : ""
                      }`}
                      title="Информация о слое"
                      aria-expanded={infoOpen}
                      aria-label={`Информация о слое «${entry.title}»`}
                      disabled={Boolean(busyId)}
                      onClick={(event) => {
                        event.stopPropagation();
                        setInfoMenuArchiveId((current) =>
                          current === entry.archiveId ? null : entry.archiveId
                        );
                      }}
                    >
                      <InfoIcon className="temp-archive-row-icon" />
                    </button>
                    {infoOpen ? (
                      <div
                        className="temp-archive-row-info-popup"
                        role="dialog"
                        aria-label={`Фильтры слоя «${entry.title}»`}
                        onClick={(event) => event.stopPropagation()}
                      >
                        <p className="temp-archive-row-info-title">
                          {entry.filterSnapshot?.length || entry.overlayLabels?.length
                            ? "Применённые фильтры"
                            : "Условия выборки"}
                        </p>
                        {originItems.length > 0 ? (
                          <ul className="temp-archive-row-info-list">
                            {originItems.map((item, index) => (
                              <li key={`${entry.archiveId}-${item.label}-${index}`}>
                                {item.label}
                                {item.details?.length ? (
                                  <ul className="temp-archive-row-info-details">
                                    {item.details.map((detail, detailIndex) => (
                                      <li
                                        key={`${item.label}-${detail}-${detailIndex}`}
                                      >
                                        {detail}
                                      </li>
                                    ))}
                                  </ul>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="temp-archive-row-info-empty">
                            Нет сохранённых условий.
                          </p>
                        )}
                      </div>
                    ) : null}
                    </div>
                    <button
                      type="button"
                      className="temp-archive-row-button"
                      title="Во временные"
                      aria-label={`Вернуть «${entry.title}» во временные слои`}
                      disabled={Boolean(busyId)}
                      onClick={() => run(entry.archiveId, onRestore)}
                    >
                      <LayersIcon className="temp-archive-row-icon" />
                    </button>
                    <button
                      type="button"
                      className="temp-archive-row-button"
                      title="Экспорт GeoJSON"
                      aria-label={`Экспорт GeoJSON «${entry.title}»`}
                      disabled={Boolean(busyId)}
                      onClick={() => run(entry.archiveId, (id) => onExport?.(id, "geojson"))}
                    >
                      <DownloadIcon className="temp-archive-row-icon" />
                    </button>
                    <button
                      type="button"
                      className="temp-archive-row-button"
                      title="Экспорт снимка JSON"
                      aria-label={`Экспорт снимка «${entry.title}»`}
                      disabled={Boolean(busyId)}
                      onClick={() => run(entry.archiveId, (id) => onExport?.(id, "snapshot"))}
                    >
                      <CameraIcon className="temp-archive-row-icon" />
                    </button>
                    <button
                      type="button"
                      className="temp-archive-row-button temp-archive-row-button--danger"
                      title="Удалить навсегда"
                      aria-label={`Удалить архив «${entry.title}»`}
                      disabled={Boolean(busyId)}
                      onClick={() => {
                        if (
                          window.confirm(
                            `Удалить «${entry.title}» из архива без возможности восстановления?`
                          )
                        ) {
                          run(entry.archiveId, onDelete);
                        }
                      }}
                    >
                      <TrashIcon className="temp-archive-row-icon" />
                    </button>
                  </div>
                  )}
                  <button
                    type="button"
                    className="temp-archive-row-toggle"
                    onClick={() => togglePlaqueCollapsed(entry.archiveId)}
                    aria-expanded={!plaqueCollapsed}
                    aria-label={
                      plaqueCollapsed
                        ? `Развернуть «${entry.title}»`
                        : `Свернуть «${entry.title}»`
                    }
                    title={
                      plaqueCollapsed
                        ? "Развернуть до прежнего размера"
                        : "Свернуть в одну строку"
                    }
                  >
                    {plaqueCollapsed ? "▾" : "▴"}
                  </button>
                </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      <ModuleHelpPanel sectionId={MODULE_IDS.TEMP_ARCHIVE} open={helpOpen} />
    </aside>
  );
}
