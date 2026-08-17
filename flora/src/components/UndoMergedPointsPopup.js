import React, { useCallback, useEffect, useMemo, useState } from "react";
import { getMergedFeatures } from "./addMergedLayer";
import { listUndoMergedRows } from "../dataWork/listUndoMergedRows";
import PanelHint from "./PanelHint";
import "../styles/UndoMergedPointsPopup.css";

/**
 * Диалог «Отменить слияние»: список слитых точек и отмена объединения.
 */
export default function UndoMergedPointsPopup({
  open,
  onClose,
  onShowPoint,
  onUndoMerge
}) {
  const [rows, setRows] = useState([]);
  const [statusMessage, setStatusMessage] = useState(null);
  const [undoingId, setUndoingId] = useState(null);

  const refreshRows = useCallback(() => {
    setRows(listUndoMergedRows(getMergedFeatures()));
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    refreshRows();
    setStatusMessage(null);
    setUndoingId(null);
  }, [open, refreshRows]);

  const handleClose = useCallback(() => {
    onClose?.();
  }, [onClose]);

  const handleShow = useCallback(
    (row) => {
      onShowPoint?.(row);
    },
    [onShowPoint]
  );

  const handleUndo = useCallback(
    async (row) => {
      if (!onUndoMerge || !row?.id || undoingId) {
        return;
      }

      setUndoingId(row.id);
      setStatusMessage(null);

      try {
        await onUndoMerge(row);
        setRows((current) => current.filter((item) => item.id !== row.id));
        setStatusMessage("Слияние отменено. Исходные точки снова на карте.");
      } catch (error) {
        setStatusMessage(error?.message || "Не удалось отменить слияние.");
      } finally {
        setUndoingId(null);
      }
    },
    [onUndoMerge, undoingId]
  );

  const rowCount = rows.length;

  const emptyHint = useMemo(() => {
    if (rowCount > 0) {
      return null;
    }
    return "Слитых точек пока нет.";
  }, [rowCount]);

  if (!open) {
    return null;
  }

  return (
    <div className="undo-merged-points-overlay" onClick={handleClose}>
      <div
        className="undo-merged-points-dialog"
        role="dialog"
        aria-label="Отменить слияние"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="undo-merged-points-close"
          onClick={handleClose}
          aria-label="Закрыть"
        >
          ×
        </button>

        <h3 className="undo-merged-points-title">Отменить слияние</h3>
        <PanelHint>
          Выберите слитую точку, чтобы удалить объединение и вернуть исходные
          точки GBIF и iNaturalist на карту.
        </PanelHint>

        <div className="undo-merged-points-toolbar">
          <span className="undo-merged-points-count" aria-live="polite">
            Всего: {rowCount}
          </span>
          <button
            type="button"
            className="undo-merged-points-refresh"
            onClick={refreshRows}
            disabled={Boolean(undoingId)}
          >
            Обновить
          </button>
        </div>

        {statusMessage ? (
          <p className="undo-merged-points-status" role="status">
            {statusMessage}
          </p>
        ) : null}

        <div className="undo-merged-points-table-wrap">
          <table className="undo-merged-points-table">
            <thead>
              <tr>
                <th scope="col">№</th>
                <th scope="col">Название</th>
                <th scope="col">Год</th>
                <th scope="col">Координаты</th>
                <th scope="col">Источники</th>
                <th scope="col" className="undo-merged-points-actions-col">
                  Действие
                </th>
              </tr>
            </thead>
            <tbody>
              {rowCount === 0 ? (
                <tr>
                  <td colSpan={6} className="undo-merged-points-table-empty">
                    {emptyHint}
                  </td>
                </tr>
              ) : (
                rows.map((row, index) => {
                  const isUndoing = undoingId === row.id;
                  return (
                    <tr key={row.id}>
                      <td>{index + 1}</td>
                      <td className="undo-merged-points-table-name">
                        {row.nameLatin}
                      </td>
                      <td>{row.foundYear}</td>
                      <td className="undo-merged-points-table-coords">
                        {row.coordinatesLabel}
                      </td>
                      <td>{row.sourcesLabel}</td>
                      <td className="undo-merged-points-row-action">
                        <button
                          type="button"
                          className="undo-merged-points-show-button"
                          onClick={() => handleShow(row)}
                          title="Показать на карте"
                          aria-label="Показать на карте"
                          disabled={Boolean(undoingId)}
                        >
                          Показать
                        </button>
                        <button
                          type="button"
                          className="undo-merged-points-undo-button"
                          onClick={() => handleUndo(row)}
                          title="Отменить слияние"
                          aria-label="Отменить слияние"
                          disabled={Boolean(undoingId)}
                        >
                          {isUndoing ? "…" : "Отменить"}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
