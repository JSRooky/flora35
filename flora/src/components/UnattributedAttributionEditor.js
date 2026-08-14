import React, { useEffect, useMemo, useState } from "react";
import {
  ATTRIBUTION_FIELDS,
  getAttributionFieldLabel,
  getMissingAttributionFields,
  getPointSourceLabel,
  isEmptyAttr
} from "../dataWork/findUnattributedPoints";
import { getRegnumLabel, REGNUM_ORDER } from "./featurePropertyLabels";
import { getStablePointKey } from "./addLocationsLayer";
import { submitPointAttribution } from "../firebase/submitPointAttribution";

function buildInitialForm(missingFields) {
  const form = {};
  missingFields.forEach((field) => {
    form[field] = "";
  });
  return form;
}

/**
 * Всплывающее окно поверх таблицы «Без атрибуции»:
 * заполнение пустых полей и сохранение в Firestore.
 */
export default function UnattributedAttributionEditor({
  row,
  onClose,
  onSaved
}) {
  const missingFields = useMemo(
    () => getMissingAttributionFields(row?.feature),
    [row]
  );
  const [form, setForm] = useState(() => buildInitialForm(missingFields));
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  useEffect(() => {
    setForm(buildInitialForm(missingFields));
    setErrorMessage(null);
    setSaving(false);
  }, [missingFields, row]);

  if (!row) {
    return null;
  }

  const pointKey = getStablePointKey(row.feature);
  const titleName = row.displayName || "Точка";

  const handleChange = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSave = async () => {
    if (saving) {
      return;
    }

    setSaving(true);
    setErrorMessage(null);

    try {
      const attributes = {};
      missingFields.forEach((field) => {
        const value = form[field];
        if (!isEmptyAttr(value)) {
          attributes[field] = value;
        }
      });

      const result = await submitPointAttribution({
        pointKey,
        source: row.source,
        coordinates: row.coordinates,
        attributes
      });

      onSaved?.({
        pointKey,
        attributes: result.attributes,
        row
      });
      onClose?.();
    } catch (error) {
      setErrorMessage(error?.message || "Не удалось сохранить.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="unattributed-edit-overlay"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="unattributed-edit-dialog"
        role="dialog"
        aria-label="Заполнить атрибуцию"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="unattributed-edit-close"
          onClick={onClose}
          aria-label="Закрыть"
        >
          ×
        </button>

        <h3 className="unattributed-edit-title">Заполнить атрибуцию</h3>
        <p className="unattributed-edit-meta">
          {getPointSourceLabel(row.source)} · {titleName}
        </p>

        {missingFields.length === 0 ? (
          <p className="unattributed-edit-status">Все поля уже заполнены.</p>
        ) : (
          <div className="unattributed-edit-form">
            {ATTRIBUTION_FIELDS.filter((field) => missingFields.includes(field)).map(
              (field) => (
                <label key={field} className="unattributed-edit-field">
                  <span className="unattributed-edit-label">
                    {getAttributionFieldLabel(field)}
                  </span>
                  {field === "regnum" ? (
                    <select
                      className="unattributed-edit-input"
                      value={form.regnum ?? ""}
                      onChange={(event) => handleChange("regnum", event.target.value)}
                      disabled={saving}
                    >
                      <option value="">—</option>
                      {REGNUM_ORDER.map((value) => (
                        <option key={value} value={value}>
                          {getRegnumLabel(value)}
                        </option>
                      ))}
                    </select>
                  ) : field === "found_year" ? (
                    <input
                      className="unattributed-edit-input"
                      type="number"
                      min={1500}
                      max={2100}
                      step={1}
                      value={form.found_year ?? ""}
                      onChange={(event) =>
                        handleChange("found_year", event.target.value)
                      }
                      disabled={saving}
                    />
                  ) : (
                    <input
                      className="unattributed-edit-input"
                      type="text"
                      value={form[field] ?? ""}
                      onChange={(event) => handleChange(field, event.target.value)}
                      disabled={saving}
                    />
                  )}
                </label>
              )
            )}
          </div>
        )}

        {errorMessage ? (
          <p className="unattributed-edit-error" role="alert">
            {errorMessage}
          </p>
        ) : null}

        <div className="unattributed-edit-actions">
          <button
            type="button"
            className="unattributed-edit-cancel"
            onClick={onClose}
            disabled={saving}
          >
            Закрыть
          </button>
          <button
            type="button"
            className="unattributed-edit-save"
            onClick={handleSave}
            disabled={saving || missingFields.length === 0}
          >
            {saving ? "Сохраняем…" : "Сохранить"}
          </button>
        </div>
      </div>
    </div>
  );
}
