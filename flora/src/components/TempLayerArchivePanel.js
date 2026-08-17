import React, { useEffect, useMemo, useState } from "react";
import {
  getTempLayerArchiveIndex,
  resolveTempSourceMarkerColor,
  subscribeTempLayers,
  TEMP_SOURCE_IDS
} from "../tempLayers/tempLayerStore";
import {
  ClockIcon,
  DownloadIcon,
  LayersIcon,
  TrashIcon
} from "../images/buttons";
import { ModuleHelpButton, ModuleHelpPanel } from "./ModuleHelp";
import { MODULE_IDS } from "./ModuleMenu";
import PanelCloseButton from "./PanelCloseButton";
import PanelMinimizeButton from "./PanelMinimizeButton";
import "../styles/TempLayerArchivePanel.css";

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
    .map((source) => (source === "inat" ? "iNat" : "GBIF"))
    .join(" + ");
  const date = entry.archivedAt
    ? new Date(entry.archivedAt).toLocaleDateString("ru-RU")
    : "";
  return [sources, regions, `${points} т.`, date].filter(Boolean).join(" · ");
}

export default function TempLayerArchivePanel({
  collapsed: collapsedProp,
  onCollapsedChange,
  onMinimize,
  onClose,
  onRestore,
  onExport,
  onDelete,
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

  const run = async (archiveId, action) => {
    setBusyId(archiveId);
    try {
      await action(archiveId);
    } finally {
      setBusyId("");
    }
  };

  return (
    <aside
      className={`temp-archive-panel${collapsed ? " temp-archive-panel--collapsed" : ""}`}
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
          <p className="temp-archive-panel-note">
            Архив содержит слои, перенесенные из временных. Сохраняет все настройки, приданные временному слою. Может быть возвращен во временные слои в любое время. Хранится локально.
          </p>
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
            <ul className="temp-archive-list">
              {filtered.map((entry) => (
                <li
                  key={entry.archiveId}
                  className={archiveRowClassName(entry)}
                  style={archiveRowStyle(entry)}
                >
                  <div className="temp-archive-row-body">
                    <div className="temp-archive-row-title">{entry.title}</div>
                    <div className="temp-archive-row-meta">{formatMeta(entry)}</div>
                  </div>
                  <div className="temp-archive-row-actions">
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
                      <ClockIcon className="temp-archive-row-icon" />
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
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <ModuleHelpPanel sectionId={MODULE_IDS.TEMP_ARCHIVE} open={helpOpen} />
    </aside>
  );
}
