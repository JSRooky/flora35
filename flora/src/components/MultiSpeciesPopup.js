import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  countFilledSubmissionRows,
  createEmptySubmissionRow,
  getFilledSubmissionRows,
  getPendingRowsFieldErrors,
  validatePendingRows
} from "../locations/multiSpeciesRows";
import {
  formatFindingsCount,
  parseSubmissionLines
} from "../locations/parseSubmissionLines";
import { saveUserFindings } from "../locations/saveUserFinding";
import { buildSubmissionSuggestionData } from "../locations/submissionSuggestions";
import MultiSpeciesConfirmTable from "./MultiSpeciesConfirmTable";
import "../styles/MultiSpeciesPopup.css";

const PLACEHOLDER =
  "По одной находке на строку. Поля через ; | : / # ~ или табуляцию:\n" +
  "русское название; латинское название; семейство; царство; статус; координаты; год; кем найдено; кем определено\n\n" +
  "Пример:\n" +
  "Медведка обыкновенная; Meles meles; Mustelidae; animalia; LC; 63.456, 32.789; 2021; Иванов; Петров\n" +
  "Клюква; Vaccinium vitis-idaea; Ericaceae; plantae; LC; 63.500 32.800; 2020; Сидоров;";

function TrashIcon() {
  return (
    <svg
      className="multi-species-discard-icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <polyline
        points="3 6 5 6 21 6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line x1="10" y1="11" x2="10" y2="17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="14" y1="11" x2="14" y2="17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** Диалог массового добавления находок: ввод текстом или таблицей, затем подтверждение перед сохранением. */
export default function MultiSpeciesPopup({
  open,
  mode = "text",
  onClose,
  onSaved,
  onMapPickStart,
  onMapPickAbort
}) {
  const [inputMode, setInputMode] = useState("text");
  const [text, setText] = useState("");
  const [step, setStep] = useState("input");
  const [pendingRows, setPendingRows] = useState([]);
  const [message, setMessage] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [mapPickHidden, setMapPickHidden] = useState(false);
  const [mapPickRowIndex, setMapPickRowIndex] = useState(null);
  const [invalidFieldsByRow, setInvalidFieldsByRow] = useState({});
  // Дублирует submitting: state обновляется асинхронно и не успевает защитить от повторного клика до перерендера.
  const submittingRef = useRef(false);

  const parsed = useMemo(() => parseSubmissionLines(text), [text]);
  const filledRowCount = useMemo(
    () => countFilledSubmissionRows(pendingRows),
    [pendingRows]
  );
  const suggestionData = useMemo(() => {
    if (!open) {
      return null;
    }

    return buildSubmissionSuggestionData();
  }, [open]);

  const resetState = useCallback(() => {
    setInputMode("text");
    setText("");
    setStep("input");
    setPendingRows([]);
    setMessage(null);
    setSubmitting(false);
    setMapPickHidden(false);
    setMapPickRowIndex(null);
    setInvalidFieldsByRow({});
    submittingRef.current = false;
  }, []);

  // При каждом открытии попапа готовим форму под выбранный режим: таблица сразу с одной пустой строкой.
  useEffect(() => {
    if (!open) {
      return;
    }

    setInputMode(mode);
    setText("");
    setStep("input");
    setMessage(null);
    setSubmitting(false);

    if (mode === "table") {
      setPendingRows([createEmptySubmissionRow(1)]);
    } else {
      setPendingRows([]);
    }
  }, [mode, open]);

  useEffect(() => {
    if (!open) {
      setMapPickHidden(false);
      setMapPickRowIndex(null);
    }
  }, [open]);

  const handleClose = useCallback(() => {
    if (submitting) {
      return;
    }

    if (mapPickHidden) {
      onMapPickAbort?.();
    }

    resetState();
    onClose?.();
  }, [mapPickHidden, onClose, onMapPickAbort, resetState, submitting]);

  const handleMapPickStart = useCallback(
    (rowIndex) => {
      if (submitting || !onMapPickStart) {
        return;
      }

      setMapPickRowIndex(rowIndex);
      setMapPickHidden(true);
      setMessage(null);

      onMapPickStart(
        rowIndex,
        (coords) => {
          const [lng, lat] = coords;

          // Округляем до тех же 3 знаков, что и при ручном вводе координат.
          setPendingRows((prev) =>
            prev.map((row, index) =>
              index === rowIndex
                ? {
                    ...row,
                    payload: {
                      ...row.payload,
                      coordinates: [
                        Number(Number(lng).toFixed(3)),
                        Number(Number(lat).toFixed(3))
                      ]
                    }
                  }
                : row
            )
          );
          setInvalidFieldsByRow((prev) => {
            const rowFields = prev[rowIndex];
            if (!rowFields?.some((field) => field === "lat" || field === "lng")) {
              return prev;
            }

            const nextFields = rowFields.filter((field) => field !== "lat" && field !== "lng");
            if (nextFields.length === 0) {
              const next = { ...prev };
              delete next[rowIndex];
              return next;
            }

            return {
              ...prev,
              [rowIndex]: nextFields
            };
          });
          setMapPickHidden(false);
          setMapPickRowIndex(null);
        },
        () => {
          setMapPickHidden(false);
          setMapPickRowIndex(null);
        }
      );
    },
    [onMapPickStart, submitting]
  );

  const handleReview = useCallback(() => {
    if (inputMode === "text") {
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
      return;
    }

    const filledRows = getFilledSubmissionRows(pendingRows);
    const fieldErrors = getPendingRowsFieldErrors(pendingRows);
    if (Object.keys(fieldErrors).length > 0) {
      setInvalidFieldsByRow(fieldErrors);
      setMessage({ type: "error", text: "Заполните обязательные поля." });
      return;
    }

    const validation = validatePendingRows(filledRows);
    if (validation.error) {
      setInvalidFieldsByRow(getPendingRowsFieldErrors(pendingRows));
      setMessage({ type: "error", text: validation.error.text });
      return;
    }

    setPendingRows(filledRows);
    setInvalidFieldsByRow({});
    setStep("confirm");
    setMessage(null);
  }, [inputMode, parsed, pendingRows]);

  const handleBack = useCallback(() => {
    setStep("input");
    setMessage(null);
    setInvalidFieldsByRow({});

    if (inputMode === "text") {
      setPendingRows([]);
    }
  }, [inputMode]);

  const clearInvalidField = useCallback((rowIndex, field) => {
    setInvalidFieldsByRow((prev) => {
      const rowFields = prev[rowIndex];
      if (!rowFields?.includes(field)) {
        return prev;
      }

      const nextFields = rowFields.filter((item) => item !== field);
      if (nextFields.length === 0) {
        const next = { ...prev };
        delete next[rowIndex];
        return next;
      }

      return {
        ...prev,
        [rowIndex]: nextFields
      };
    });
  }, []);

  const handlePendingRowChange = useCallback((rowIndex, field, value) => {
    clearInvalidField(rowIndex, field);
    setPendingRows((prev) =>
      prev.map((row, index) => {
        if (index !== rowIndex) {
          return row;
        }

        if (field === "lat" || field === "lng") {
          const [currentLng, currentLat] = row.payload.coordinates ?? [];
          // Допускаем запятую как десятичный разделитель наравне с точкой.
          const parsedValue = Number.parseFloat(String(value).replace(",", "."));

          return {
            ...row,
            payload: {
              ...row.payload,
              coordinates: [
                field === "lng" && Number.isFinite(parsedValue) ? parsedValue : currentLng,
                field === "lat" && Number.isFinite(parsedValue) ? parsedValue : currentLat
              ]
            }
          };
        }

        if (field === "found_year") {
          const nextYear = String(value).trim();
          // Пустое значение оставляем строкой (поле не заполнено), иначе приводим к числу.
          return {
            ...row,
            payload: {
              ...row.payload,
              found_year: nextYear === "" ? "" : Number(nextYear)
            }
          };
        }

        return {
          ...row,
          payload: {
            ...row.payload,
            [field]: value
          }
        };
      })
    );
    setMessage(null);
  }, [clearInvalidField]);

  const handleAddRow = useCallback(() => {
    setPendingRows((prev) => [...prev, createEmptySubmissionRow(prev.length + 1)]);
    setMessage(null);
  }, []);

  const handleRemoveRow = useCallback((rowIndex) => {
    setPendingRows((prev) => {
      if (prev.length <= 1) {
        return prev;
      }

      return prev.filter((_, index) => index !== rowIndex);
    });
    // После удаления строки сдвигаем индексы ошибок валидации на позициях после неё.
    setInvalidFieldsByRow((prev) => {
      const next = {};

      Object.entries(prev).forEach(([indexKey, fields]) => {
        const index = Number(indexKey);
        if (index === rowIndex) {
          return;
        }

        const nextIndex = index > rowIndex ? index - 1 : index;
        next[nextIndex] = fields;
      });

      return next;
    });
    setMessage(null);
  }, []);

  const handleRowSpeciesSelect = useCallback((rowIndex, species) => {
    // Выбор вида из подсказки закрывает ошибки валидации по связанным с видом полям.
    setInvalidFieldsByRow((prev) => {
      const rowFields = prev[rowIndex];
      if (!rowFields?.length) {
        return prev;
      }

      const fieldsToClear = new Set([
        "name_ru",
        "name_latin",
        "family",
        "regnum",
        "status"
      ]);
      const nextFields = rowFields.filter((field) => !fieldsToClear.has(field));
      if (nextFields.length === 0) {
        const next = { ...prev };
        delete next[rowIndex];
        return next;
      }

      return {
        ...prev,
        [rowIndex]: nextFields
      };
    });

    setPendingRows((prev) =>
      prev.map((row, index) => {
        if (index !== rowIndex) {
          return row;
        }

        return {
          ...row,
          payload: {
            ...row.payload,
            name_ru: species.name_ru ?? "",
            name_latin: species.name_latin ?? "",
            regnum: species.regnum ?? row.payload.regnum ?? "",
            status: species.status ?? row.payload.status ?? "LC",
            family: species.family ?? ""
          }
        };
      })
    );
    setMessage(null);
  }, []);

  const handleConfirm = useCallback(async () => {
    // Защита от повторной отправки при быстром двойном клике.
    if (submittingRef.current || submitting) {
      return;
    }

    const validation = validatePendingRows(pendingRows);
    if (validation.error) {
      setMessage({ type: "error", text: validation.error.text });
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    setMessage(null);

    try {
      await saveUserFindings(validation.payloads);
      const savedCount = validation.payloads.length;
      resetState();
      onSaved?.(savedCount);
      onClose?.();
    } catch (error) {
      submittingRef.current = false;
      setMessage({
        type: "error",
        text: error?.message || "Не удалось сохранить данные."
      });
      setSubmitting(false);
    }
  }, [onClose, onSaved, pendingRows, resetState, submitting]);

  // Прячем попап на время выбора точки на карте, чтобы он её не перекрывал.
  if (!open || mapPickHidden) {
    return null;
  }

  const canReviewText = parsed.rows.length > 0 && parsed.errors.length === 0;
  const canReview = inputMode === "text" ? canReviewText : filledRowCount > 0;

  const dialogClassName =
    step === "confirm"
      ? " multi-species-dialog--confirm"
      : inputMode === "table"
        ? " multi-species-dialog--table-entry"
        : "";

  const dialogLabel =
    step === "confirm"
      ? "Подтверждение записи"
      : inputMode === "table"
        ? "Несколько видов — таблица"
        : "Несколько видов — текст";

  return (
    <div className="multi-species-overlay" onClick={handleClose}>
      <div
        className={`multi-species-dialog${dialogClassName}`}
        role="dialog"
        aria-label={dialogLabel}
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

        {step === "input" && inputMode === "text" ? (
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
        ) : null}

        {step === "input" && inputMode === "table" ? (
          <>
            <h3 className="multi-species-title">Несколько видов</h3>
            <p className="multi-species-hint">Заполните ячейки таблицы для каждой находки.</p>

            <MultiSpeciesConfirmTable
              rows={pendingRows}
              onRowChange={handlePendingRowChange}
              onRowSpeciesSelect={handleRowSpeciesSelect}
              onMapPickStart={handleMapPickStart}
              mapPickRowIndex={mapPickRowIndex}
              suggestionData={suggestionData}
              onAddRow={handleAddRow}
              onRemoveRow={handleRemoveRow}
              invalidFieldsByRow={invalidFieldsByRow}
              disabled={submitting}
              variant="entry"
            />

            {message && (
              <p
                className={`multi-species-message multi-species-message--${message.type}`}
                role="status"
              >
                {message.text}
              </p>
            )}

            <div className="multi-species-actions multi-species-actions--entry">
              <p className="multi-species-entry-count">Записей: {filledRowCount}</p>
              <button
                type="button"
                className="multi-species-discard-btn"
                onClick={handleClose}
                disabled={submitting}
                aria-label="Отменить"
                title="Отменить"
              >
                <TrashIcon />
              </button>
              <button
                type="button"
                className="multi-species-save"
                onClick={handleReview}
                disabled={submitting || !canReview}
              >
                Записать
              </button>
            </div>
          </>
        ) : null}

        {step === "confirm" ? (
          <>
            <h3 className="multi-species-title">Подтверждение записи</h3>
            <p className="multi-species-confirm-summary">
              Будет записано {formatFindingsCount(pendingRows.length)}. Проверьте и при необходимости
              отредактируйте данные перед сохранением в базу.
            </p>

            <MultiSpeciesConfirmTable
              rows={pendingRows}
              onRowChange={handlePendingRowChange}
              onRowSpeciesSelect={handleRowSpeciesSelect}
              suggestionData={suggestionData}
              disabled={submitting}
            />

            {message && (
              <p
                className={`multi-species-message multi-species-message--${message.type}`}
                role="status"
              >
                {message.text}
              </p>
            )}

            <div className="multi-species-actions multi-species-actions--confirm">
              <button
                type="button"
                className="multi-species-cancel"
                onClick={handleBack}
                disabled={submitting}
              >
                Назад
              </button>
              <button
                type="button"
                className="multi-species-save"
                onClick={handleConfirm}
                disabled={submitting}
              >
                {submitting ? "Запись…" : "Подтвердить"}
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
