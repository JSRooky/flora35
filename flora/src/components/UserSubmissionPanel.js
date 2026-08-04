import React, { useCallback, useMemo, useState } from "react";
import { saveUserFinding } from "../locations/saveUserFinding";
import {
  buildSubmissionSuggestionData,
  filterSpeciesByNameLatin,
  filterSpeciesByNameRu,
  filterTextSuggestions
} from "../locations/submissionSuggestions";
import { ModuleHelpButton, ModuleHelpPanel } from "./ModuleHelp";
import SubmissionAutocompleteField from "./SubmissionAutocompleteField";
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

export default function UserSubmissionPanel({
  coordinates,
  locationPickingActive = false,
  onLocationPickingChange,
  collapsed: collapsedProp,
  onCollapsedChange,
  onSaved,
  onReset
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
    onReset?.();
  }, [onReset]);

  const handleSubmit = useCallback(
    async (event) => {
      event.preventDefault();

      if (!coordinates) {
        setMessage({
          type: "error",
          text: "Нажмите «Указать место» и кликните по карте."
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
        await saveUserFinding({
          name_ru: form.name_ru.trim(),
          name_latin: form.name_latin.trim(),
          regnum: form.regnum,
          status: form.status,
          family: form.family.trim(),
          found_year: foundYear,
          found_by: form.found_by.trim(),
          identified_by: form.identified_by.trim(),
          coordinates
        });

        setForm(EMPTY_FORM);
        onSaved?.();
        setMessage({
          type: "success",
          text: "Данные сохранены в базе и добавлены на карту."
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
    [coordinates, form, onSaved]
  );

  return (
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
              <label className="user-submission-field">
                <span>Царство *</span>
                <select value={form.regnum} onChange={(event) => handleFieldChange("regnum")(event.target.value)}>
                  {REGNUM_OPTIONS.map(({ value, label }) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>

              <SubmissionAutocompleteField
                label="Семейство *"
                value={form.family}
                onChange={handleFieldChange("family")}
                suggestions={familySuggestions}
                placeholder="Ericaceae"
                required
              />

              <SubmissionAutocompleteField
                label="Название (рус.) *"
                value={form.name_ru}
                onChange={handleFieldChange("name_ru")}
                onSuggestionSelect={handleSpeciesSuggestion}
                suggestions={nameRuSuggestions}
                getSuggestionLabel={(species) => species.name_ru}
                getSuggestionKey={(species) => species.name_ru}
                required
              />

              <SubmissionAutocompleteField
                label="Название (лат.) *"
                value={form.name_latin}
                onChange={handleFieldChange("name_latin")}
                onSuggestionSelect={handleSpeciesSuggestion}
                suggestions={nameLatinSuggestions}
                getSuggestionLabel={(species) => species.name_latin}
                getSuggestionKey={(species) => species.name_latin}
                required
              />

              <div className="user-submission-field user-submission-status-field">
                <span className="user-submission-status-label">Статус МСОП *</span>
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
                        checked={form.status === code}
                        onChange={(event) => handleFieldChange("status")(event.target.value)}
                      />
                      <span className="user-submission-status-code">{code}</span>
                    </label>
                  ))}
                </div>
              </div>
            </fieldset>

            <fieldset className="user-submission-fieldset">
              <legend className="user-submission-legend">Находка</legend>

              <div className="user-submission-field user-submission-location-field">
                <span>Место находки *</span>
                <div className="user-submission-location-row">
                  <output className="user-submission-coordinates">
                    {coordinates
                      ? formatCoordinates(coordinates)
                      : locationPickingActive
                        ? "Кликните по карте"
                        : "Не указано"}
                  </output>
                  <button
                    type="button"
                    className={`user-submission-location-btn${
                      locationPickingActive ? " user-submission-location-btn--active" : ""
                    }`}
                    onClick={() => onLocationPickingChange?.(!locationPickingActive)}
                    aria-pressed={locationPickingActive}
                  >
                    {locationPickingActive ? "Отмена" : "Указать место"}
                  </button>
                </div>
              </div>

              <SubmissionAutocompleteField
                label="Год находки *"
                value={form.found_year}
                onChange={handleFieldChange("found_year")}
                suggestions={foundYearSuggestions}
                type="number"
                min="1500"
                max="2100"
                step="1"
                required
              />

              <SubmissionAutocompleteField
                label="Кем найдено *"
                value={form.found_by}
                onChange={handleFieldChange("found_by")}
                suggestions={foundBySuggestions}
                required
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
              <button
                type="submit"
                className="user-submission-submit"
                disabled={submitting}
              >
                {submitting ? "Сохранение…" : "Сохранить"}
              </button>
              <button
                type="button"
                className="user-submission-reset"
                onClick={handleReset}
                disabled={submitting}
              >
                Сброс
              </button>
            </div>
          </form>
        </div>
      )}
      <ModuleHelpPanel sectionId={MODULE_IDS.SUBMIT} open={helpOpen} />
    </aside>
  );
}
