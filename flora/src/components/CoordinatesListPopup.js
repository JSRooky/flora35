import React, { useCallback, useMemo, useState } from "react";
import { formatPointsCount, parseCoordinatesList } from "../locations/parseCoordinatesList";
import "../styles/CoordinatesListPopup.css";

export default function CoordinatesListPopup({ open, onClose, onConfirm }) {
  const [text, setText] = useState("");
  const [message, setMessage] = useState(null);

  const parsed = useMemo(() => parseCoordinatesList(text), [text]);

  const handleClose = useCallback(() => {
    setMessage(null);
    onClose?.();
  }, [onClose]);

  const handleSave = useCallback(() => {
    if (parsed.errors.length > 0) {
      const firstError = parsed.errors[0];
      setMessage({
        type: "error",
        text: `Строка ${firstError.line}: ${firstError.text}`
      });
      return;
    }

    if (parsed.coordinates.length === 0) {
      setMessage({ type: "error", text: "Введите хотя бы одну пару координат." });
      return;
    }

    onConfirm?.(parsed.coordinates);
    setText("");
    setMessage(null);
    onClose?.();
  }, [onClose, onConfirm, parsed]);

  if (!open) {
    return null;
  }

  const canSave = parsed.coordinates.length > 0;

  return (
    <div className="coordinates-list-overlay" onClick={handleClose}>
      <div
        className="coordinates-list-dialog"
        role="dialog"
        aria-label="Ввод списком"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="coordinates-list-close"
          onClick={handleClose}
          aria-label="Закрыть"
        >
          ×
        </button>

        <h3 className="coordinates-list-title">Ввод списком</h3>

        <label className="coordinates-list-field">
          <span>Координаты</span>
          <textarea
            className="coordinates-list-textarea"
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setMessage(null);
            }}
            rows={10}
            spellCheck={false}
            placeholder={
              "По одной паре координат на строку: широта, долгота\n" +
              "Например:\n" +
              "63.456, 32.789\n" +
              "63.500 32.800"
            }
          />
        </label>

        {parsed.coordinates.length > 0 && (
          <p className="coordinates-list-count">{formatPointsCount(parsed.coordinates.length)}</p>
        )}

        {message && (
          <p
            className={`coordinates-list-message coordinates-list-message--${message.type}`}
            role="status"
          >
            {message.text}
          </p>
        )}

        <div className="coordinates-list-actions">
          <span
            className="coordinates-list-save-wrap"
            title={!canSave ? "Введите хотя бы одну пару координат" : undefined}
          >
            <button
              type="button"
              className="coordinates-list-save"
              onClick={handleSave}
              disabled={!canSave}
            >
              Записать
            </button>
          </span>
          <button type="button" className="coordinates-list-cancel" onClick={handleClose}>
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}
