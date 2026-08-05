import React, { useCallback, useMemo, useState } from "react";
import { formatPointsCount, parseCoordinatesList } from "../locations/parseCoordinatesList";
import { saveUserFinding, saveUserFindings } from "../locations/saveUserFinding";
import "../styles/CoordinatesListPopup.css";

function buildPayloadBase(form) {
  const foundYear = Number(form.found_year);

  return {
    name_ru: form.name_ru.trim(),
    name_latin: form.name_latin.trim(),
    regnum: form.regnum,
    status: form.status,
    family: form.family.trim(),
    found_year: foundYear,
    found_by: form.found_by.trim(),
    identified_by: form.identified_by.trim()
  };
}

function validateSubmissionForm(form) {
  const foundYear = Number(form.found_year);

  if (
    !form.name_ru.trim() ||
    !form.name_latin.trim() ||
    !form.family.trim() ||
    !form.found_by.trim()
  ) {
    return { ok: false, text: "Заполните обязательные поля формы находки." };
  }

  if (!Number.isInteger(foundYear) || foundYear < 1500 || foundYear > 2100) {
    return { ok: false, text: "Укажите корректный год находки в форме." };
  }

  return { ok: true, payloadBase: buildPayloadBase(form) };
}

export default function CoordinatesListPopup({ open, onClose, form, onSaved }) {
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null);

  const parsed = useMemo(() => parseCoordinatesList(text), [text]);

  const handleClose = useCallback(() => {
    if (submitting) {
      return;
    }

    setMessage(null);
    onClose?.();
  }, [submitting, onClose]);

  const handleSave = useCallback(async () => {
    const validation = validateSubmissionForm(form);
    if (!validation.ok) {
      setMessage({ type: "error", text: validation.text });
      return;
    }

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

    setSubmitting(true);
    setMessage(null);

    try {
      const { payloadBase } = validation;

      if (parsed.coordinates.length === 1) {
        await saveUserFinding({
          ...payloadBase,
          coordinates: parsed.coordinates[0]
        });
      } else {
        await saveUserFindings(
          parsed.coordinates.map((entryCoordinates) => ({
            ...payloadBase,
            coordinates: entryCoordinates
          }))
        );
      }

      const savedCount = parsed.coordinates.length;
      setText("");
      onSaved?.(savedCount);
      onClose?.();
    } catch (error) {
      setMessage({
        type: "error",
        text: error?.message || "Не удалось сохранить данные."
      });
    } finally {
      setSubmitting(false);
    }
  }, [form, onClose, onSaved, parsed]);

  if (!open) {
    return null;
  }

  const speciesLabel = form.name_ru.trim() || form.name_latin.trim();
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
          disabled={submitting}
        >
          ×
        </button>

        <h3 className="coordinates-list-title">Ввод списком</h3>

        {speciesLabel ? (
          <p className="coordinates-list-species">
            {form.name_ru.trim() ? (
              <>
                <span>{form.name_ru.trim()}</span>
                {form.name_latin.trim() ? (
                  <span className="coordinates-list-species-latin">{form.name_latin.trim()}</span>
                ) : null}
              </>
            ) : (
              <span className="coordinates-list-species-latin">{form.name_latin.trim()}</span>
            )}
          </p>
        ) : null}

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
            title={!submitting && !canSave ? "Введите хотя бы одну пару координат" : undefined}
          >
            <button
              type="button"
              className="coordinates-list-save"
              onClick={handleSave}
              disabled={submitting || !canSave}
            >
              {submitting ? "Запись…" : "Записать"}
            </button>
          </span>
          <button
            type="button"
            className="coordinates-list-cancel"
            onClick={handleClose}
            disabled={submitting}
          >
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}
