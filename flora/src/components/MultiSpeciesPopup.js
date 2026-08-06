import React, { useCallback, useMemo, useState } from "react";
import {
  formatFindingsCount,
  formatSubmissionCoordinates,
  parseSubmissionLines
} from "../locations/parseSubmissionLines";
import { saveUserFindings } from "../locations/saveUserFinding";
import "../styles/MultiSpeciesPopup.css";

const PLACEHOLDER =
  "По одной находке на строку. Поля через ; | : / # ~ или табуляцию:\n" +
  "русское название; латинское название; семейство; царство; статус; координаты; год; кем найдено; кем определено\n\n" +
  "Пример:\n" +
  "Медведка обыкновенная; Meles meles; Mustelidae; animalia; LC; 63.456, 32.789; 2021; Иванов; Петров\n" +
  "Клюква; Vaccinium vitis-idaea; Ericaceae; plantae; LC; 63.500 32.800; 2020; Сидоров;";

export default function MultiSpeciesPopup({ open, onClose, onSaved }) {
  const [text, setText] = useState("");
  const [step, setStep] = useState("input");
  const [pendingRows, setPendingRows] = useState([]);
  const [message, setMessage] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const parsed = useMemo(() => parseSubmissionLines(text), [text]);

  const resetState = useCallback(() => {
    setText("");
    setStep("input");
    setPendingRows([]);
    setMessage(null);
    setSubmitting(false);
  }, []);

  const handleClose = useCallback(() => {
    if (submitting) {
      return;
    }

    resetState();
    onClose?.();
  }, [onClose, resetState, submitting]);

  const handleReview = useCallback(() => {
    if (parsed.errors.length > 0) {
      const firstError = parsed.errors[0];
      setMessage({
        type: "error",
        text: `Строка ${firstError.line}: ${firstError.text}`
      });
      return;
    }

    if (parsed.rows.length === 0) {
      setMessage({ type: "error", text: "Введите хотя бы одну строку с данными находки." });
      return;
    }

    setPendingRows(parsed.rows);
    setStep("confirm");
    setMessage(null);
  }, [parsed]);

  const handleBack = useCallback(() => {
    setStep("input");
    setPendingRows([]);
    setMessage(null);
  }, []);

  const handleConfirm = useCallback(async () => {
    if (pendingRows.length === 0) {
      return;
    }

    setSubmitting(true);
    setMessage(null);

    try {
      await saveUserFindings(pendingRows.map(({ payload }) => payload));
      const savedCount = pendingRows.length;
      resetState();
      onSaved?.(savedCount);
      onClose?.();
    } catch (error) {
      setMessage({
        type: "error",
        text: error?.message || "Не удалось сохранить данные."
      });
      setSubmitting(false);
    }
  }, [onClose, onSaved, pendingRows, resetState]);

  if (!open) {
    return null;
  }

  const canReview = parsed.rows.length > 0 && parsed.errors.length === 0;

  return (
    <div className="multi-species-overlay" onClick={handleClose}>
      <div
        className={`multi-species-dialog${step === "confirm" ? " multi-species-dialog--confirm" : ""}`}
        role="dialog"
        aria-label={step === "confirm" ? "Подтверждение записи" : "Несколько видов"}
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="multi-species-close"
          onClick={handleClose}
          aria-label="Закрыть"
          disabled={submitting}
        >
          ×
        </button>

        {step === "input" ? (
          <>
            <h3 className="multi-species-title">Несколько видов</h3>
            <p className="multi-species-hint">
              Координаты — широта и долгота через запятую или пробел. Разделитель полей — любой
              символ, кроме пробела и запятой.
            </p>

            <label className="multi-species-field">
              <span>Данные находок</span>
              <textarea
                className="multi-species-textarea"
                value={text}
                onChange={(event) => {
                  setText(event.target.value);
                  setMessage(null);
                }}
                rows={12}
                spellCheck={false}
                placeholder={PLACEHOLDER}
              />
            </label>

            {parsed.rows.length > 0 && (
              <p className="multi-species-count">{formatFindingsCount(parsed.rows.length)}</p>
            )}

            {message && (
              <p
                className={`multi-species-message multi-species-message--${message.type}`}
                role="status"
              >
                {message.text}
              </p>
            )}

            <div className="multi-species-actions">
              <span
                className="multi-species-save-wrap"
                title={!canReview ? "Введите хотя бы одну корректную строку" : undefined}
              >
                <button
                  type="button"
                  className="multi-species-save"
                  onClick={handleReview}
                  disabled={!canReview}
                >
                  Записать
                </button>
              </span>
              <button type="button" className="multi-species-cancel" onClick={handleClose}>
                Отмена
              </button>
            </div>
          </>
        ) : (
          <>
            <h3 className="multi-species-title">Подтверждение записи</h3>
            <p className="multi-species-confirm-summary">
              Будет записано {formatFindingsCount(pendingRows.length)}. Проверьте данные перед
              сохранением в базу.
            </p>

            <div className="multi-species-table-wrap">
              <table className="multi-species-table">
                <thead>
                  <tr>
                    <th>№</th>
                    <th>Название</th>
                    <th>Лат.</th>
                    <th>Семейство</th>
                    <th>Год</th>
                    <th>Координаты</th>
                    <th>Найдено</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingRows.map(({ line, payload }, index) => (
                    <tr key={`${line}-${payload.name_latin}-${index}`}>
                      <td>{index + 1}</td>
                      <td>{payload.name_ru}</td>
                      <td className="multi-species-table-latin">{payload.name_latin}</td>
                      <td>{payload.family}</td>
                      <td>{payload.found_year}</td>
                      <td className="multi-species-table-coords">
                        {formatSubmissionCoordinates(payload.coordinates)}
                      </td>
                      <td>{payload.found_by}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {message && (
              <p
                className={`multi-species-message multi-species-message--${message.type}`}
                role="status"
              >
                {message.text}
              </p>
            )}

            <div className="multi-species-actions">
              <button
                type="button"
                className="multi-species-save"
                onClick={handleConfirm}
                disabled={submitting}
              >
                {submitting ? "Запись…" : "Подтвердить"}
              </button>
              <button
                type="button"
                className="multi-species-cancel"
                onClick={handleBack}
                disabled={submitting}
              >
                Назад
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
