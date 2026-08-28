import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PanelCloseButton from "./PanelCloseButton";
import PanelHint from "./PanelHint";
import PanelMinimizeButton from "./PanelMinimizeButton";
import { COMPARE_SET_MAX, COMPARE_SET_MIN } from "../dataWork/compare/countSpeciesByLayers";
import { COMPARE_STATS_TOOLS } from "../dataWork/compare/compareExtraStats";
import {
  isRegionTempLayer,
  listTempLayerOriginItems,
  listTempLayerPlaques,
  normalizeTempSource,
  resolveTempSourceMarkerColor,
  subscribeTempLayers,
  TEMP_SOURCE_IDS
} from "../tempLayers/tempLayerStore";
import "../styles/ExternalLayersPicker.css";
import "../styles/TempLayersPicker.css";
import "../styles/ComparePanel.css";

const DRAG_TYPE = "application/x-flora-compare-plaque";

function formatPlaqueMeta(plaque) {
  if (plaque.layers.some(isRegionTempLayer)) {
    const count =
      plaque.layers.reduce((sum, layer) => sum + (layer.regionIds?.length || 0), 0) ||
      plaque.layers.reduce(
        (sum, layer) =>
          sum + (layer.overlays?.find((item) => item.kind === "regions")?.features?.length || 0),
        0
      );
    const points = plaque.layers.reduce((sum, layer) => sum + (layer.features?.length ?? 0), 0);
    const mod10 = count % 10;
    const mod100 = count % 100;
    let regionsText = `${count} субъектов`;
    if (mod10 === 1 && mod100 !== 11) {
      regionsText = `${count} субъект`;
    } else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
      regionsText = `${count} субъекта`;
    }
    if (points > 0) {
      return `${regionsText} · ${new Intl.NumberFormat("ru-RU").format(points)} т.`;
    }
    return regionsText;
  }
  const regionIds = new Set();
  let points = 0;
  plaque.layers.forEach((layer) => {
    points += layer.features?.length ?? 0;
    (layer.regionIds || []).forEach((id) => regionIds.add(id));
  });
  const pointsText = new Intl.NumberFormat("ru-RU").format(points);
  const regionCount = regionIds.size;
  const regionPart =
    regionCount === 1 ? "1 рег." : regionCount > 1 ? `${regionCount} рег.` : null;
  return regionPart ? `${regionPart} · ${pointsText} т.` : `${pointsText} т.`;
}

function plaqueRowStyle(plaque) {
  const gbifColor = resolveTempSourceMarkerColor(plaque.markerColor, TEMP_SOURCE_IDS.GBIF);
  const inatColor = resolveTempSourceMarkerColor(plaque.markerColor, TEMP_SOURCE_IDS.INAT);
  const style = {
    "--temp-layer-color-gbif": gbifColor,
    "--temp-layer-color-inat": inatColor
  };
  if (plaque.markerColor) {
    style["--temp-layer-color"] = plaque.markerColor;
  }
  return style;
}

function plaqueTitle(plaque) {
  return plaque.taxonName || plaque.label || "Временный слой";
}

function sourceLayer(plaque, sourceId) {
  return plaque.layers.find((layer) => normalizeTempSource(layer.source) === sourceId);
}

function formatFilterLine(plaque) {
  const originItems = listTempLayerOriginItems(plaque);
  if (originItems.length === 0) {
    return formatPlaqueMeta(plaque);
  }
  return originItems
    .map((item) =>
      item.details?.length ? `${item.label}: ${item.details.join(", ")}` : item.label
    )
    .join(" · ");
}

function readDragPayload(event) {
  const raw = event.dataTransfer?.getData(DRAG_TYPE) || event.dataTransfer?.getData("text/plain");
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.key) {
      return parsed;
    }
  } catch {
    return { key: raw, from: "picker" };
  }
  return null;
}

function ComparePlaque({ plaque, onClick, actionLabel, dragFrom, dropBeforeKey, onDropOnPlaque }) {
  const gbif = sourceLayer(plaque, TEMP_SOURCE_IDS.GBIF);
  const inat = sourceLayer(plaque, TEMP_SOURCE_IDS.INAT);
  const splitStripe = Boolean(gbif && inat);
  const title = plaqueTitle(plaque);
  const filterLine = formatFilterLine(plaque);
  const draggedRef = useRef(false);

  return (
    <div
      role="button"
      tabIndex={0}
      draggable
      className={`temp-layers-picker-row compare-panel-plaque${
        splitStripe ? " temp-layers-picker-row--split" : ""
      }${!splitStripe && gbif ? " temp-layers-picker-row--gbif" : ""}${
        !splitStripe && inat ? " temp-layers-picker-row--inat" : ""
      }`}
      style={plaqueRowStyle(plaque)}
      title={actionLabel}
      aria-label={actionLabel}
      onClick={() => {
        if (draggedRef.current) {
          draggedRef.current = false;
          return;
        }
        onClick?.();
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick?.();
        }
      }}
      onDragStart={(event) => {
        draggedRef.current = true;
        event.dataTransfer.effectAllowed = dragFrom === "well" ? "move" : "copy";
        const payload = JSON.stringify({ key: plaque.key, from: dragFrom });
        event.dataTransfer.setData(DRAG_TYPE, payload);
        event.dataTransfer.setData("text/plain", payload);
      }}
      onDragOver={
        onDropOnPlaque
          ? (event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
            }
          : undefined
      }
      onDrop={
        onDropOnPlaque
          ? (event) => {
              event.preventDefault();
              event.stopPropagation();
              const payload = readDragPayload(event);
              if (payload?.key) {
                onDropOnPlaque(payload, dropBeforeKey);
              }
            }
          : undefined
      }
    >
      <span className="temp-layers-picker-main">
        <span className="external-layers-picker-option-label">{title}</span>
        <span className="compare-panel-plaque-filters">{filterLine}</span>
      </span>
    </div>
  );
}

function insertKey(list, key, beforeKey = null) {
  const without = list.filter((item) => item !== key);
  if (beforeKey == null || !without.includes(beforeKey)) {
    return [...without, key];
  }
  const index = without.indexOf(beforeKey);
  return [...without.slice(0, index), key, ...without.slice(index)];
}

/**
 * Панель сравнения: поле с компактными плашками и перетаскиванием.
 */
export default function ComparePanel({
  collapsed: collapsedProp,
  onCollapsedChange,
  onMinimize,
  onClose,
  onOpenDiversity,
  onOpenSimilarity,
  onOpenDistribution,
  onOpenStats,
  onCompareSetChange
}) {
  const [collapsedInternal, setCollapsedInternal] = useState(false);
  const isControlled = collapsedProp !== undefined;
  const collapsed = isControlled ? collapsedProp : collapsedInternal;
  const setCollapsed = onCollapsedChange ?? setCollapsedInternal;
  const toggleLabel = collapsed ? "Развернуть" : "Свернуть";

  const [plaques, setPlaques] = useState(() => listTempLayerPlaques());
  const [addedKeys, setAddedKeys] = useState([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [wellOver, setWellOver] = useState(false);

  useEffect(() => {
    return subscribeTempLayers(() => {
      const next = listTempLayerPlaques();
      const available = new Set(next.map((plaque) => plaque.key));
      setPlaques(next);
      setAddedKeys((current) => current.filter((key) => available.has(key)));
    });
  }, []);

  const plaqueByKey = useMemo(() => {
    const map = new Map();
    plaques.forEach((plaque) => map.set(plaque.key, plaque));
    return map;
  }, [plaques]);

  const addedPlaques = useMemo(() => {
    return addedKeys.map((key) => plaqueByKey.get(key)).filter(Boolean);
  }, [addedKeys, plaqueByKey]);

  useEffect(() => {
    onCompareSetChange?.(addedPlaques);
  }, [addedPlaques, onCompareSetChange]);

  const unusedPlaques = useMemo(() => {
    const taken = new Set(addedKeys);
    return plaques.filter((plaque) => !taken.has(plaque.key));
  }, [addedKeys, plaques]);

  const handleAdd = useCallback((plaqueKey, beforeKey = null) => {
    setAddedKeys((current) => {
      if (current.includes(plaqueKey)) {
        return insertKey(current, plaqueKey, beforeKey);
      }
      if (current.length >= COMPARE_SET_MAX) {
        return current;
      }
      return insertKey(current, plaqueKey, beforeKey);
    });
  }, []);

  const handleRemove = useCallback((plaqueKey) => {
    setAddedKeys((current) => current.filter((key) => key !== plaqueKey));
  }, []);

  const handleDropOnWell = useCallback(
    (event) => {
      event.preventDefault();
      setWellOver(false);
      const payload = readDragPayload(event);
      if (!payload?.key || !plaqueByKey.has(payload.key)) {
        return;
      }
      handleAdd(payload.key);
    },
    [handleAdd, plaqueByKey]
  );

  const handleDropOnPlaque = useCallback(
    (payload, beforeKey) => {
      if (!payload?.key || !plaqueByKey.has(payload.key)) {
        return;
      }
      if (payload.key === beforeKey) {
        return;
      }
      handleAdd(payload.key, beforeKey);
    },
    [handleAdd, plaqueByKey]
  );

  const handleDropOnPicker = useCallback(
    (event) => {
      event.preventDefault();
      const payload = readDragPayload(event);
      if (payload?.from === "well" && payload.key) {
        handleRemove(payload.key);
      }
    },
    [handleRemove]
  );

  const canOpenPicker = unusedPlaques.length > 0 && addedKeys.length < COMPARE_SET_MAX;

  return (
    <aside
      className={`compare-panel${collapsed ? " compare-panel--collapsed" : ""}`}
      aria-label="Сравнение"
    >
      <div className="compare-panel-header">
        <h3 className="compare-panel-title">Сравнение</h3>
        <div className="popup-panel-header-actions">
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
        <p className="compare-panel-summary">
          {addedPlaques.length > 0 ? `${addedPlaques.length} сл.` : "временные слои"}
        </p>
      ) : (
        <div className="compare-panel-content">
          <PanelHint>
            Перетащите плашку в поле или нажмите «Добавить». В поле — компактный вид: название и
            фильтры. Щелчок убирает слой.
          </PanelHint>

          <div
            className={`compare-panel-well${
              addedPlaques.length === 0 ? " compare-panel-well--empty" : ""
            }${wellOver ? " compare-panel-well--over" : ""}`}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = "copy";
              setWellOver(true);
            }}
            onDragLeave={() => setWellOver(false)}
            onDrop={handleDropOnWell}
          >
            {addedPlaques.length === 0 ? (
              <p className="compare-panel-well-placeholder">Перетащите слои сюда</p>
            ) : (
              addedPlaques.map((plaque) => (
                <ComparePlaque
                  key={plaque.key}
                  plaque={plaque}
                  dragFrom="well"
                  dropBeforeKey={plaque.key}
                  onDropOnPlaque={handleDropOnPlaque}
                  onClick={() => handleRemove(plaque.key)}
                  actionLabel={`Убрать «${plaqueTitle(plaque)}». Можно перетащить`}
                />
              ))
            )}
          </div>

          <div className="compare-panel-actions">
            <button
              type="button"
              className="compare-panel-add"
              onClick={() => setPickerOpen((open) => !open)}
              disabled={!canOpenPicker && !pickerOpen}
              aria-expanded={pickerOpen}
            >
              Добавить
            </button>
            <div className="compare-panel-tools">
              <button
                type="button"
                className="compare-panel-tool"
                disabled={addedPlaques.length < COMPARE_SET_MIN}
                title={
                  addedPlaques.length < COMPARE_SET_MIN
                    ? "Добавьте не меньше двух слоёв"
                    : "Сравнение биологического разнообразия"
                }
                onClick={() => onOpenDiversity?.(addedPlaques)}
              >
                Разнообразие
              </button>
              <button
                type="button"
                className="compare-panel-tool"
                disabled={addedPlaques.length < COMPARE_SET_MIN}
                title={
                  addedPlaques.length < COMPARE_SET_MIN
                    ? "Добавьте не меньше двух слоёв"
                    : "Корреляция слоёв по видам, родам и семействам"
                }
                onClick={() => onOpenSimilarity?.(addedPlaques)}
              >
                Сходство
              </button>
              <button
                type="button"
                className="compare-panel-tool"
                disabled={addedPlaques.length < COMPARE_SET_MIN}
                title={
                  addedPlaques.length < COMPARE_SET_MIN
                    ? "Добавьте не меньше двух слоёв"
                    : "Распределение точек по широте и долготе"
                }
                onClick={() => onOpenDistribution?.(addedPlaques)}
              >
                Распределение
              </button>
            </div>
            <div className="compare-panel-tools compare-panel-tools--extra">
              {COMPARE_STATS_TOOLS.map((tool) => (
                <button
                  key={tool.id}
                  type="button"
                  className="compare-panel-tool"
                  disabled={addedPlaques.length < COMPARE_SET_MIN}
                  title={
                    addedPlaques.length < COMPARE_SET_MIN
                      ? "Добавьте не меньше двух слоёв"
                      : tool.title
                  }
                  onClick={() => onOpenStats?.(tool.id, addedPlaques)}
                >
                  {tool.title}
                </button>
              ))}
            </div>
          </div>

          {pickerOpen ? (
            <div
              className="compare-panel-picker"
              role="listbox"
              aria-label="Временные слои"
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
              }}
              onDrop={handleDropOnPicker}
            >
              {unusedPlaques.length === 0 ? (
                <p className="compare-panel-empty">Нет доступных слоёв.</p>
              ) : (
                unusedPlaques.map((plaque) => (
                  <ComparePlaque
                    key={plaque.key}
                    plaque={plaque}
                    dragFrom="picker"
                    onClick={() => handleAdd(plaque.key)}
                    actionLabel={`Добавить «${plaqueTitle(plaque)}». Можно перетащить в поле`}
                  />
                ))
              )}
            </div>
          ) : null}
        </div>
      )}
    </aside>
  );
}
