import React, { useCallback, useEffect, useMemo, useState } from "react";
import PanelCloseButton from "./PanelCloseButton";
import PanelHint from "./PanelHint";
import {
  COMPARE_SET_MAX,
  COMPARE_SET_MIN,
  COMPARE_SPECIES_FIELD,
  countSpeciesByLayers,
  createDefaultFieldChecks,
  getCompareFieldLabel,
  listCompareTempLayerOptions,
  listPresentCompareFields
} from "../dataWork/compare/countSpeciesByLayers";
import { subscribeTempLayers } from "../tempLayers/tempLayerStore";
import "../styles/CompareLayersPopup.css";

export default function CompareLayersPopup({ open, onClose }) {
  const [options, setOptions] = useState(() => listCompareTempLayerOptions());
  const [pendingId, setPendingId] = useState("");
  const [addedIds, setAddedIds] = useState([]);
  const [fieldChecks, setFieldChecks] = useState({});
  const [sortKey, setSortKey] = useState("total");
  const [sortDirection, setSortDirection] = useState("desc");

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const refresh = () => {
      const nextOptions = listCompareTempLayerOptions();
      const available = new Set(nextOptions.map((option) => option.id));
      setOptions(nextOptions);
      setAddedIds((current) => current.filter((id) => available.has(id)));
      setFieldChecks((current) => {
        const next = {};
        Object.keys(current).forEach((id) => {
          if (available.has(id)) {
            next[id] = current[id];
          }
        });
        return next;
      });
      setPendingId((current) => (available.has(current) ? current : ""));
    };
    const unsubscribe = subscribeTempLayers(refresh);

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose?.();
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      unsubscribe();
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  const optionById = useMemo(() => {
    const map = new Map();
    options.forEach((option) => map.set(option.id, option));
    return map;
  }, [options]);

  const addedLayers = useMemo(() => {
    return addedIds.map((id) => optionById.get(id)).filter(Boolean);
  }, [addedIds, optionById]);

  const unusedOptions = useMemo(() => {
    const taken = new Set(addedIds);
    return options.filter((option) => !taken.has(option.id));
  }, [addedIds, options]);

  const fieldColumns = useMemo(() => {
    const union = new Set();
    addedLayers.forEach((layer) => {
      listPresentCompareFields(layer.features).forEach((fieldId) => union.add(fieldId));
    });
    return listPresentCompareFields(
      addedLayers.flatMap((layer) => layer.features)
    ).filter((fieldId) => union.has(fieldId));
  }, [addedLayers]);

  const speciesLayers = useMemo(() => {
    return addedLayers.filter((layer) => fieldChecks[layer.id]?.[COMPARE_SPECIES_FIELD]);
  }, [addedLayers, fieldChecks]);

  const comparison = useMemo(() => {
    if (speciesLayers.length < COMPARE_SET_MIN) {
      return { layers: [], rows: [] };
    }
    return countSpeciesByLayers(speciesLayers);
  }, [speciesLayers]);

  const sortedRows = useMemo(() => {
    const rows = [...comparison.rows];
    const direction = sortDirection === "asc" ? 1 : -1;
    rows.sort((left, right) => {
      if (sortKey === "nameLatin") {
        return direction * left.nameLatin.localeCompare(right.nameLatin, "ru", { sensitivity: "base" });
      }
      if (sortKey === "nameRu") {
        return direction * left.nameRu.localeCompare(right.nameRu, "ru", { sensitivity: "base" });
      }
      if (sortKey.startsWith("count:")) {
        const layerId = sortKey.slice("count:".length);
        return direction * ((left.counts[layerId] || 0) - (right.counts[layerId] || 0));
      }
      return direction * (left.total - right.total);
    });
    return rows;
  }, [comparison.rows, sortDirection, sortKey]);

  const handleSort = useCallback((key) => {
    setSortKey((current) => {
      if (current === key) {
        setSortDirection((value) => (value === "asc" ? "desc" : "asc"));
        return current;
      }
      setSortDirection(key === "nameLatin" || key === "nameRu" ? "asc" : "desc");
      return key;
    });
  }, []);

  const handleAdd = useCallback(() => {
    if (!pendingId || addedIds.includes(pendingId) || addedIds.length >= COMPARE_SET_MAX) {
      return;
    }
    const option = optionById.get(pendingId);
    if (!option) {
      return;
    }
    const present = listPresentCompareFields(option.features);
    setAddedIds((current) => [...current, pendingId]);
    setFieldChecks((current) => ({
      ...current,
      [pendingId]: createDefaultFieldChecks(present)
    }));
    setPendingId("");
  }, [addedIds, optionById, pendingId]);

  const handleRemove = useCallback((layerId) => {
    setAddedIds((current) => current.filter((id) => id !== layerId));
    setFieldChecks((current) => {
      const next = { ...current };
      delete next[layerId];
      return next;
    });
  }, []);

  const handleToggleField = useCallback((layerId, fieldId) => {
    setFieldChecks((current) => ({
      ...current,
      [layerId]: {
        ...(current[layerId] ?? {}),
        [fieldId]: !current[layerId]?.[fieldId]
      }
    }));
  }, []);

  if (!open) {
    return null;
  }

  const canAdd =
    Boolean(pendingId) && unusedOptions.some((option) => option.id === pendingId);

  return (
    <div
      className="compare-layers-overlay"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose?.();
        }
      }}
    >
      <div
        className="compare-layers-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Сравнение слоёв"
      >
        <div className="compare-layers-header">
          <h3 className="compare-layers-title">Сравнение слоёв</h3>
          {onClose ? <PanelCloseButton onClick={onClose} /> : null}
        </div>

        <PanelHint>
          Добавьте временные слои в таблицу. Галочками отметьте поля, которые участвуют в
          сравнении. Число точек по видам считается по включённой «Латыни».
        </PanelHint>

        <div className="compare-layers-picker">
          <select
            className="compare-layers-select"
            value={pendingId}
            onChange={(event) => setPendingId(event.target.value)}
            disabled={unusedOptions.length === 0 || addedIds.length >= COMPARE_SET_MAX}
            aria-label="Временный слой"
          >
            <option value="">Временный слой…</option>
            {unusedOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label} ({option.pointCount})
              </option>
            ))}
          </select>
          <button
            type="button"
            className="compare-layers-add"
            onClick={handleAdd}
            disabled={!canAdd}
          >
            Добавить
          </button>
        </div>

        {options.length === 0 ? (
          <p className="compare-layers-empty">
            Нет временных слоёв с точками. Сохраните выборки на карте, затем вернитесь сюда.
          </p>
        ) : addedLayers.length === 0 ? (
          <p className="compare-layers-empty">Выберите слой в списке и нажмите «Добавить».</p>
        ) : (
          <div className="compare-layers-table-wrap compare-layers-table-wrap--sets">
            <table className="compare-layers-table compare-layers-sets-table">
              <thead>
                <tr>
                  <th>Слой</th>
                  <th>Точек</th>
                  {fieldColumns.map((fieldId) => (
                    <th key={fieldId}>{getCompareFieldLabel(fieldId)}</th>
                  ))}
                  <th aria-label="Убрать" />
                </tr>
              </thead>
              <tbody>
                {addedLayers.map((layer) => {
                  const present = new Set(listPresentCompareFields(layer.features));
                  return (
                    <tr key={layer.id}>
                      <td>{layer.label}</td>
                      <td className="compare-layers-count">{layer.pointCount.toLocaleString("ru-RU")}</td>
                      {fieldColumns.map((fieldId) => (
                        <td key={fieldId} className="compare-layers-check">
                          {present.has(fieldId) ? (
                            <input
                              type="checkbox"
                              checked={Boolean(fieldChecks[layer.id]?.[fieldId])}
                              onChange={() => handleToggleField(layer.id, fieldId)}
                              aria-label={`${layer.label}: ${getCompareFieldLabel(fieldId)}`}
                            />
                          ) : (
                            <span className="compare-layers-check-missing">—</span>
                          )}
                        </td>
                      ))}
                      <td>
                        <button
                          type="button"
                          className="compare-layers-slot-remove"
                          onClick={() => handleRemove(layer.id)}
                          aria-label={`Убрать ${layer.label}`}
                          title="Убрать слой"
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {speciesLayers.length >= COMPARE_SET_MIN ? (
          <div className="compare-layers-table-wrap">
            <table className="compare-layers-table">
              <thead>
                <tr>
                  <th>
                    <button type="button" onClick={() => handleSort("nameLatin")}>
                      Вид (лат.)
                    </button>
                  </th>
                  <th>
                    <button type="button" onClick={() => handleSort("nameRu")}>
                      По-русски
                    </button>
                  </th>
                  {comparison.layers.map((layer) => (
                    <th key={layer.id}>
                      <button type="button" onClick={() => handleSort(`count:${layer.id}`)}>
                        {layer.label}
                      </button>
                    </th>
                  ))}
                  <th>
                    <button type="button" onClick={() => handleSort("total")}>
                      Всего
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedRows.length === 0 ? (
                  <tr>
                    <td
                      className="compare-layers-table-empty"
                      colSpan={3 + comparison.layers.length}
                    >
                      В выбранных слоях нет точек.
                    </td>
                  </tr>
                ) : (
                  sortedRows.map((row) => {
                    const counts = comparison.layers.map((layer) => row.counts[layer.id] || 0);
                    const maxCount = Math.max(...counts);
                    const minCount = Math.min(...counts);
                    const highlightMax = maxCount > minCount;
                    return (
                      <tr key={row.key}>
                        <td>
                          <em>{row.nameLatin}</em>
                        </td>
                        <td>{row.nameRu || "—"}</td>
                        {comparison.layers.map((layer) => {
                          const count = row.counts[layer.id] || 0;
                          const isLead = highlightMax && count === maxCount;
                          return (
                            <td
                              key={layer.id}
                              className={`compare-layers-count${isLead ? " compare-layers-count--lead" : ""}`}
                            >
                              {count.toLocaleString("ru-RU")}
                            </td>
                          );
                        })}
                        <td className="compare-layers-count">
                          {row.total.toLocaleString("ru-RU")}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        ) : addedLayers.length > 0 ? (
          <p className="compare-layers-empty compare-layers-empty--hint">
            Чтобы сравнить число точек по видам, добавьте ещё слой и оставьте галочку «Латынь».
          </p>
        ) : null}
      </div>
    </div>
  );
}
