import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatPointsCount } from "../locations/parseCoordinatesList";
import { formatFindingsCount } from "../locations/parseSubmissionLines";
import { saveUserFinding, saveUserFindings } from "../locations/saveUserFinding";
import {
  buildSubmissionSuggestionData,
  filterSpeciesByNameLatin,
  filterSpeciesByNameRu,
  filterTextSuggestions
} from "../locations/submissionSuggestions";
import CoordinatesListPopup from "./CoordinatesListPopup";
import MultiSpeciesEntryMenu from "./MultiSpeciesEntryMenu";
import MultiSpeciesPopup from "./MultiSpeciesPopup";
import { ModuleHelpButton, ModuleHelpPanel } from "./ModuleHelp";
import SubmissionAutocompleteField from "./SubmissionAutocompleteField";
import SubmissionFieldLabel from "./SubmissionFieldLabel";
import { STATUS_OPTIONS } from "./StatusFilterPanel";
import { MODULE_IDS } from "./ModuleMenu";
import "../styles/UserSubmissionPanel.css";

const REGNUM_OPTIONS = [
  { value: "plantae", label: "Растения" },
  { value: "animalia", label: "Животные" },
  { value: "fungi", label: "Грибы" }
];

const EMPTY_FORM = {
  name_ru: "",
  name_latin: "",
  regnum: "plantae",
  status: "LC",
  family: "",
  found_year: "",
  found_by: "",
  identified_by: ""
};

function formatCoordinates(coordinates) {
  if (!coordinates) {
    return null;
  }

  const [lng, lat] = coordinates;
  return `${lat.toFixed(3)}, ${lng.toFixed(3)}`;
}

function applySpeciesToForm(species) {
  return {
    name_ru: species.name_ru ?? "",
    name_latin: species.name_latin ?? "",
    regnum: species.regnum ?? "plantae",
    status: species.status ?? "LC",
    family: species.family ?? ""
  };
}

function isSubmissionFormComplete(form, coordinates, listCoordinates) {
  const hasLocation = Boolean(coordinates) || listCoordinates.length > 0;
  if (!hasLocation) {
    return false;
  }

  if (
    !form.family.trim() ||
    !form.name_ru.trim() ||
    !form.name_latin.trim() ||
    !form.found_by.trim()
  ) {
    return false;
  }

  const foundYear = Number(form.found_year);
  // Разумный диапазон года находки, чтобы отсечь опечатки.
  return Number.isInteger(foundYear) && foundYear >= 1500 && foundYear <= 2100;
}

function TrashIcon() {
  return (
    <svg
      className="user-submission-location-reset-icon"
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
      <line
        x1="10"
        y1="11"
        x2="10"
        y2="17"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <line
        x1="14"
        y1="11"
        x2="14"
        y2="17"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Панель формы добавления новой находки (модуль «Новая находка»): одиночный ввод и переход к вводу нескольких видов. */
export default function UserSubmissionPanel({
  coordinates,
  locationPickingActive = false,
  onLocationPickingChange,
  submissionMapPickHandlerRef,
  collapsed: collapsedProp,
  onCollapsedChange,
  onSaved,
  onReset,
  onCoordinatesReset
}) {
  const [collapsedInternal, setCollapsedInternal] = useState(false);
  const isControlled = collapsedProp !== undefined;
  const collapsed = isControlled ? collapsedProp : collapsedInternal;
  const setCollapsed = onCollapsedChange ?? setCollapsedInternal;
  const toggleLabel = collapsed ? "Развернуть" : "Свернуть";

  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null);
  const [helpOpen, setHelpOpen] = useState(false); // раздел ## submit в docs/moduleHelp.md
  const [listInputOpen, setListInputOpen] = useState(false);
  const [multiSpeciesOpen, setMultiSpeciesOpen] = useState(false);
  const [multiSpeciesMode, setMultiSpeciesMode] = useState("text");
  const [multiSpeciesMenuOpen, setMultiSpeciesMenuOpen] = useState(false);
  const [listCoordinates, setListCoordinates] = useState([]);
  const multiSpeciesMapPickCancelRef = useRef(null);

  // Точка на карте и список координат взаимоисключающие — выбор точки сбрасывает список.
  useEffect(() => {
    if (coordinates) {
      setListCoordinates([]);
    }
  }, [coordinates]);

  // Если выбор точки на карте прервали снаружи (например, сменили модуль) — отменяем ожидание клика для формы нескольких видов.
  useEffect(() => {
    if (locationPickingActive || !submissionMapPickHandlerRef?.current) {
      return;
    }

    multiSpeciesMapPickCancelRef.current?.();
    multiSpeciesMapPickCancelRef.current = null;
    submissionMapPickHandlerRef.current = null;
  }, [locationPickingActive, submissionMapPickHandlerRef]);

  // Карта — не React-компонент, поэтому обработчик клика по ней передаётся через ref.
  const handleMultiSpeciesMapPickStart = useCallback(
    (rowIndex, applyCoordinates, onCancel) => {
      if (!submissionMapPickHandlerRef) {
        return;
      }

      submissionMapPickHandlerRef.current = (pickedCoordinates) => {
        applyCoordinates(pickedCoordinates);
        submissionMapPickHandlerRef.current = null;
        multiSpeciesMapPickCancelRef.current = null;
      };
      multiSpeciesMapPickCancelRef.current = onCancel;
      onLocationPickingChange(true);
    },
    [onLocationPickingChange, submissionMapPickHandlerRef]
  );

  // Откатывает состояние выбора точки на карте, если пользователь отменил выбор.
  const handleMultiSpeciesMapPickAbort = useCallback(() => {
    multiSpeciesMapPickCancelRef.current = null;
    if (submissionMapPickHandlerRef) {
      submissionMapPickHandlerRef.current = null;
    }
    onLocationPickingChange(false);
  }, [onLocationPickingChange, submissionMapPickHandlerRef]);

  // Попап с несколькими видами закрыли, пока карта ждала клик, — отменяем выбор точки.
  useEffect(() => {
    if (multiSpeciesOpen || !submissionMapPickHandlerRef?.current) {
      return;
    }

    handleMultiSpeciesMapPickAbort();
  }, [handleMultiSpeciesMapPickAbort, multiSpeciesOpen, submissionMapPickHandlerRef]);

  const suggestionData = buildSubmissionSuggestionData();

  const familySuggestions = useMemo(
    () => filterTextSuggestions(suggestionData.families, form.family),
    [form.family, suggestionData.families]
  );

  const nameRuSuggestions = useMemo(
    () => filterSpeciesByNameRu(suggestionData.speciesList, form.name_ru),
    [form.name_ru, suggestionData.speciesList]
  );

  const nameLatinSuggestions = useMemo(
    () => filterSpeciesByNameLatin(suggestionData.speciesList, form.name_latin),
    [form.name_latin, suggestionData.speciesList]
  );

  const foundBySuggestions = useMemo(
    () => filterTextSuggestions(suggestionData.foundBy, form.found_by),
    [form.found_by, suggestionData.foundBy]
  );

  const identifiedBySuggestions = useMemo(
    () => filterTextSuggestions(suggestionData.identifiedBy, form.identified_by),
    [form.identified_by, suggestionData.identifiedBy]
  );

  const foundYearSuggestions = useMemo(
    () => filterTextSuggestions(suggestionData.foundYears, form.found_year),
    [form.found_year, suggestionData.foundYears]
  );

  const canSave = useMemo(
    () => isSubmissionFormComplete(form, coordinates, listCoordinates),
    [coordinates, form, listCoordinates]
  );

  const fieldCompletion = useMemo(() => {
    const foundYear = Number(form.found_year);
    const status = form.status || "LC";

    return {
      regnum: Boolean(form.regnum),
      family: Boolean(form.family.trim()),
      name_ru: Boolean(form.name_ru.trim()),
      name_latin: Boolean(form.name_latin.trim()),
      status: Boolean(status),
      coordinates: Boolean(coordinates) || listCoordinates.length > 0,
      found_year: Number.isInteger(foundYear) && foundYear >= 1500 && foundYear <= 2100,
      found_by: Boolean(form.found_by.trim())
    };
  }, [coordinates, form, listCoordinates]);

  const handleFieldChange = useCallback((field) => (value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setMessage(null);
  }, []);

  const handleSpeciesSuggestion = useCallback((species) => {
    setForm((prev) => ({
      ...prev,
      ...applySpeciesToForm(species)
    }));
    setMessage(null);
  }, []);

  const handleReset = useCallback(() => {
    setForm(EMPTY_FORM);
    setMessage(null);
    setListInputOpen(false);
    setListCoordinates([]);
    onReset?.();
  }, [onReset]);

  const handleLocationPickingToggle = useCallback(() => {
    onLocationPickingChange?.(!locationPickingActive);
  }, [locationPickingActive, onLocationPickingChange]);

  const handleCoordinatesReset = useCallback(() => {
    onLocationPickingChange?.(false);
    onCoordinatesReset?.();
  }, [onCoordinatesReset, onLocationPickingChange]);

  const canResetCoordinates = Boolean(coordinates || locationPickingActive);

  const handleListInputOpen = useCallback(() => {
    onLocationPickingChange?.(false);
    setListInputOpen(true);
    setMessage(null);
  }, [onLocationPickingChange]);

  const handleListInputConfirmed = useCallback(
    (coordinatesList) => {
      setListCoordinates(coordinatesList);
      onCoordinatesReset?.();
      setMessage({
        type: "success",
        text: `Запомнено ${formatPointsCount(coordinatesList.length)}.`
      });
    },
    [onCoordinatesReset]
  );

  const handleMultiSpeciesSaved = useCallback(
    (savedCount) => {
      onSaved?.();
      setMessage({
        type: "success",
        text:
          savedCount === 1
            ? "Находка записана в базу и добавлена на карту."
            : `Записано ${formatFindingsCount(savedCount)} в базу и добавлено на карту.`
      });
    },
    [onSaved]
  );

  const handleMultiSpeciesTextOpen = useCallback(() => {
    setMultiSpeciesMode("text");
    setMultiSpeciesOpen(true);
    setMultiSpeciesMenuOpen(false);
  }, []);

  const handleMultiSpeciesTableOpen = useCallback(() => {
    setMultiSpeciesMode("table");
    setMultiSpeciesOpen(true);
    setMultiSpeciesMenuOpen(false);
  }, []);

  const handleSubmit = useCallback(
    async (event) => {
      event.preventDefault();

      if (!coordinates && listCoordinates.length === 0) {
        setMessage({
          type: "error",
          text: "Укажите место на карте или введите координаты списком."
        });
        return;
      }

      const foundYear = Number(form.found_year);
      if (
        !form.name_ru.trim() ||
        !form.name_latin.trim() ||
        !form.family.trim() ||
        !form.found_by.trim()
      ) {
        setMessage({ type: "error", text: "Заполните обязательные поля." });
        return;
      }

      if (!Number.isInteger(foundYear) || foundYear < 1500 || foundYear > 2100) {
        setMessage({ type: "error", text: "Укажите корректный год находки." });
        return;
      }

      setSubmitting(true);
      setMessage(null);

      try {
        const payloadBase = {
          name_ru: form.name_ru.trim(),
          name_latin: form.name_latin.trim(),
          regnum: form.regnum,
          status: form.status || "LC",
          family: form.family.trim(),
          found_year: foundYear,
          found_by: form.found_by.trim(),
          identified_by: form.identified_by.trim()
        };

        // Если указан список координат — по находке на каждую точку, иначе одна находка по выбранной точке.
        if (listCoordinates.length > 0) {
          await saveUserFindings(
            listCoordinates.map((entryCoordinates) => ({
              ...payloadBase,
              coordinates: entryCoordinates
            }))
          );
        } else {
          await saveUserFinding({
            ...payloadBase,
            coordinates
          });
        }

        setForm(EMPTY_FORM);
        setListCoordinates([]);
        onReset?.();
        onSaved?.();
        setMessage({
          type: "success",
          text:
            listCoordinates.length > 1
              ? `Данные сохранены: ${formatPointsCount(listCoordinates.length)} добавлены на карту.`
              : "Данные сохранены в базе и добавлены на карту."
        });
      } catch (error) {
        setMessage({
          type: "error",
          text: error?.message || "Не удалось сохранить данные."
        });
      } finally {
        setSubmitting(false);
      }
    },
    [coordinates, form, listCoordinates, onReset, onSaved]
  );

  return (
    <>
      <aside
        className={`user-submission-panel${collapsed ? " user-submission-panel--collapsed" : ""}`}
        data-module-id={MODULE_IDS.SUBMIT}
      >
        <div className="user-submission-panel-header">
          <h3 className="user-submission-panel-title">Новая находка</h3>
          <div className="popup-panel-header-actions">
            <ModuleHelpButton open={helpOpen} onClick={() => setHelpOpen((value) => !value)} />
            <button
              type="button"
              className="user-submission-panel-toggle"
              onClick={() => setCollapsed(!collapsed)}
              aria-expanded={!collapsed}
              aria-label={toggleLabel}
              title={toggleLabel}
            >
              {collapsed ? "▾" : "▴"}
            </button>
          </div>
        </div>

        {!collapsed && (
          <div className="user-submission-panel-content">
            <form className="user-submission-form" onSubmit={handleSubmit}>
              <fieldset className="user-submission-fieldset">
                <legend className="user-submission-legend">Систематика</legend>

                <label className="user-submission-field">
                  <SubmissionFieldLabel required filled={fieldCompletion.regnum}>
                    Царство
                  </SubmissionFieldLabel>
                  <select value={form.regnum} onChange={(event) => handleFieldChange("regnum")(event.target.value)}>
                    {REGNUM_OPTIONS.map(({ value, label }) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>

                <SubmissionAutocompleteField
                  label="Семейство"
                  value={form.family}
                  onChange={handleFieldChange("family")}
                  suggestions={familySuggestions}
                  placeholder="Ericaceae"
                  required
                  filled={fieldCompletion.family}
                />

                <SubmissionAutocompleteField
                  label="Название (рус.)"
                  value={form.name_ru}
                  onChange={handleFieldChange("name_ru")}
                  onSuggestionSelect={handleSpeciesSuggestion}
                  suggestions={nameRuSuggestions}
                  getSuggestionLabel={(species) => species.name_ru}
                  getSuggestionKey={(species) => species.name_ru}
                  required
                  filled={fieldCompletion.name_ru}
                />

                <SubmissionAutocompleteField
                  label="Название (лат.)"
                  value={form.name_latin}
                  onChange={handleFieldChange("name_latin")}
                  onSuggestionSelect={handleSpeciesSuggestion}
                  suggestions={nameLatinSuggestions}
                  getSuggestionLabel={(species) => species.name_latin}
                  getSuggestionKey={(species) => species.name_latin}
                  required
                  filled={fieldCompletion.name_latin}
                />

                <div className="user-submission-field user-submission-status-field">
                  <SubmissionFieldLabel required filled={fieldCompletion.status} className="user-submission-status-label">
                    Статус МСОП
                  </SubmissionFieldLabel>
                  <div
                    className="user-submission-status-options"
                    role="radiogroup"
                    aria-label="Статус МСОП"
                  >
                    {STATUS_OPTIONS.map(({ code, label }) => (
                      <label
                        key={code}
                        className="user-submission-status-option"
                        title={label}
                      >
                        <input
                          type="radio"
                          name="status"
                          value={code}
                          checked={(form.status || "LC") === code}
                          onChange={(event) => handleFieldChange("status")(event.target.value)}
                        />
                        <span className="user-submission-status-code">{code}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </fieldset>

              <fieldset className="user-submission-fieldset">
                <legend className="user-submission-legend">Информация о находке</legend>

                <div className="user-submission-field user-submission-location-field">
                  <SubmissionFieldLabel required filled={fieldCompletion.coordinates}>
                    Место находки
                  </SubmissionFieldLabel>
                  <div className="user-submission-location-row">
                    <div className="user-submission-location-actions">
                      <div className="user-submission-location-pick-group">
                        <button
                          type="button"
                          className={`user-submission-location-btn user-submission-location-btn--pick${
                            locationPickingActive ? " user-submission-location-btn--active" : ""
                          }${coordinates && !locationPickingActive ? " user-submission-location-btn--filled" : ""}`}
                          onClick={handleLocationPickingToggle}
                          aria-pressed={locationPickingActive}
                        >
                          {locationPickingActive
                            ? "Отмена"
                            : coordinates
                              ? formatCoordinates(coordinates)
                              : "Указать место"}
                        </button>
                        <button
                          type="button"
                          className="user-submission-location-reset-btn"
                          onClick={handleCoordinatesReset}
                          disabled={!canResetCoordinates}
                          aria-label="Сбросить место находки"
                          title="Сбросить место"
                        >
                          <TrashIcon />
                        </button>
                      </div>
                      <button
                        type="button"
                        className={`user-submission-location-btn user-submission-location-btn--list${
                          listCoordinates.length > 0 ? " user-submission-location-btn--filled" : ""
                        }`}
                        onClick={handleListInputOpen}
                      >
                        {listCoordinates.length > 0
                          ? formatPointsCount(listCoordinates.length)
                          : "Ввод списком"}
                      </button>
                    </div>
                  </div>
                </div>

                <SubmissionAutocompleteField
                  label="Год находки"
                  value={form.found_year}
                  onChange={handleFieldChange("found_year")}
                  suggestions={foundYearSuggestions}
                  required
                  filled={fieldCompletion.found_year}
                />

                <SubmissionAutocompleteField
                  label="Кем найдено"
                  value={form.found_by}
                  onChange={handleFieldChange("found_by")}
                  suggestions={foundBySuggestions}
                  required
                  filled={fieldCompletion.found_by}
                />

                <SubmissionAutocompleteField
                  label="Кем определено"
                  value={form.identified_by}
                  onChange={handleFieldChange("identified_by")}
                  suggestions={identifiedBySuggestions}
                />
              </fieldset>

              {message && (
                <p
                  className={`user-submission-message user-submission-message--${message.type}`}
                  role="status"
                >
                  {message.text}
                </p>
              )}

              <div className="user-submission-actions">
                <div className="user-submission-actions-primary">
                  <span
                    className="user-submission-submit-wrap"
                    title={!submitting && !canSave ? "Заполните обязательные поля" : undefined}
                  >
                    <button
                      type="submit"
                      className="user-submission-submit"
                      disabled={submitting || !canSave}
                    >
                      {submitting ? "Сохранение…" : "Сохранить"}
                    </button>
                  </span>
                  <button
                    type="button"
                    className="user-submission-location-reset-btn user-submission-form-reset-btn"
                    onClick={handleReset}
                    disabled={submitting}
                    aria-label="Сброс"
                    title="Сброс"
                  >
                    <TrashIcon />
                  </button>
                </div>
                <MultiSpeciesEntryMenu
                  open={multiSpeciesMenuOpen}
                  disabled={submitting}
                  onToggle={setMultiSpeciesMenuOpen}
                  onSelectText={handleMultiSpeciesTextOpen}
                  onSelectTable={handleMultiSpeciesTableOpen}
                />
              </div>
            </form>
          </div>
        )}
        <ModuleHelpPanel sectionId={MODULE_IDS.SUBMIT} open={helpOpen} />
      </aside>

      <CoordinatesListPopup
        open={listInputOpen}
        onClose={() => setListInputOpen(false)}
        onConfirm={handleListInputConfirmed}
      />

      <MultiSpeciesPopup
        open={multiSpeciesOpen}
        mode={multiSpeciesMode}
        onClose={() => setMultiSpeciesOpen(false)}
        onSaved={handleMultiSpeciesSaved}
        onMapPickStart={handleMultiSpeciesMapPickStart}
        onMapPickAbort={handleMultiSpeciesMapPickAbort}
      />
    </>
  );
}
