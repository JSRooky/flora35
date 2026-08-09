import React, { useEffect, useState } from "react";
import { getRussianNameSourceLabel } from "../names/russianNameResolver";
import "../styles/RussianNamePickerPopup.css";

/** Модальное окно выбора русского названия из найденных вариантов. */
export default function RussianNamePickerPopup({
  nameLatin,
  candidates = [],
  onSelect,
  onClose
}) {
  const [selectedName, setSelectedName] = useState(candidates[0]?.nameRu ?? "");

  useEffect(() => {
    setSelectedName(candidates[0]?.nameRu ?? "");
  }, [candidates]);

  if (!candidates.length) {
    return null;
  }

  const handleConfirm = () => {
    const choice = candidates.find((item) => item.nameRu === selectedName);
    if (!choice) {
      return;
    }

    onSelect?.(choice);
  };

  return (
    <div className="russian-name-picker-overlay" onClick={onClose}>
      <div
        className="russian-name-picker-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="russian-name-picker-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="russian-name-picker-close"
          onClick={onClose}
          aria-label="Закрыть"
        >
          ×
        </button>

        <h3 id="russian-name-picker-title" className="russian-name-picker-title">
          Выберите русское название
        </h3>

        {nameLatin && (
          <p className="russian-name-picker-latin">{nameLatin}</p>
        )}

        <fieldset className="russian-name-picker-list">
          <legend className="russian-name-picker-legend">Найденные варианты</legend>
          {candidates.map((candidate) => {
            const inputId = `russian-name-option-${candidate.nameRu}`;
            const sourceLabel = getRussianNameSourceLabel(
              candidate.sources?.length ? candidate.sources : candidate.source
            );

            return (
              <label key={candidate.nameRu} className="russian-name-picker-option" htmlFor={inputId}>
                <input
                  id={inputId}
                  type="radio"
                  name="russian-name-choice"
                  value={candidate.nameRu}
                  checked={selectedName === candidate.nameRu}
                  onChange={() => setSelectedName(candidate.nameRu)}
                />
                <span className="russian-name-picker-option-body">
                  <span className="russian-name-picker-option-name">{candidate.nameRu}</span>
                  {sourceLabel ? (
                    <span className="russian-name-picker-option-source">{sourceLabel}</span>
                  ) : null}
                </span>
              </label>
            );
          })}
        </fieldset>

        <div className="russian-name-picker-actions">
          <button
            type="button"
            className="russian-name-picker-btn russian-name-picker-btn--secondary"
            onClick={onClose}
          >
            Отмена
          </button>
          <button
            type="button"
            className="russian-name-picker-btn russian-name-picker-btn--primary"
            onClick={handleConfirm}
            disabled={!selectedName}
          >
            Выбрать
          </button>
        </div>
      </div>
    </div>
  );
}
