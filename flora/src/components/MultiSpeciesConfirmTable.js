import React, { useCallback, useEffect, useState } from "react";
import { getSubmissionRowCoordinates } from "../locations/multiSpeciesRows";
import {
  filterSpeciesByNameLatin,
  filterSpeciesByNameRu,
  filterTextSuggestions
} from "../locations/submissionSuggestions";
import { STATUS_OPTIONS } from "./StatusFilterPanel";
import { getRegnumLabel, REGNUM_ORDER } from "./featurePropertyLabels";
import SubmissionAutocompleteInput from "./SubmissionAutocompleteInput";
import "../styles/SubmissionAutocomplete.css";

function TableHeaderLabel({ children, required = false }) {
  return (
    <>
      {children}
      {required ? (
        <span className="multi-species-table-required" aria-hidden="true">
          *
        </span>
      ) : null}
    </>
  );
}

function appendInvalidClass(className, invalid, kind = "input") {
  if (!invalid) {
    return className;
  }

  const invalidClass =
    kind === "select" ? "multi-species-table-select--invalid" : "multi-species-table-input--invalid";

  return `${className}${className ? " " : ""}${invalidClass}`.trim();
}

function TableInput({ className = "", invalid = false, ...props }) {
  return (
    <input
      className={appendInvalidClass(`multi-species-table-input${className ? ` ${className}` : ""}`, invalid)}
      {...props}
    />
  );
}

function TableCell({
  editing,
  displayValue,
  className = "",
  invalid = false,
  inputProps,
  enableAutocomplete = false,
  suggestions = [],
  onSuggestionSelect = null,
  getSuggestionLabel = null,
  getSuggestionKey = null,
  suggestionPlacement = "drop-down"
}) {
  if (editing && enableAutocomplete) {
    return (
      <SubmissionAutocompleteInput
        className={appendInvalidClass(
          `multi-species-table-input${className ? ` ${className}` : ""}`,
          invalid
        )}
        wrapClassName="multi-species-table-autocomplete-wrap submission-autocomplete-wrap"
        listClassName="submission-autocomplete-suggestions multi-species-table-suggestions"
        value={inputProps.value ?? ""}
        onChange={(nextValue) => {
          inputProps.onChange?.({ target: { value: nextValue } });
        }}
        onSuggestionSelect={onSuggestionSelect}
        suggestions={suggestions}
        getSuggestionLabel={getSuggestionLabel}
        getSuggestionKey={getSuggestionKey}
        disabled={inputProps.disabled}
        type={inputProps.type ?? "text"}
        placement={suggestionPlacement}
        usePortal
        aria-label={inputProps["aria-label"]}
      />
    );
  }

  if (editing) {
    return <TableInput className={className} invalid={invalid} {...inputProps} />;
  }

  return (
    <span className={`multi-species-table-value${className ? ` ${className}` : ""}`}>
      {displayValue || "—"}
    </span>
  );
}

function PlusIcon() {
  return (
    <svg
      className="multi-species-row-action-icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M12 5v14M5 12h14"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      className="multi-species-row-action-icon"
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

function EditIcon() {
  return (
    <svg
      className="multi-species-row-edit-icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M12 20h9"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TableRegnumCell({ editing, regnum, index, disabled, invalid = false, onRowChange }) {
  if (editing) {
    return (
      <select
        className={appendInvalidClass("multi-species-table-select", invalid, "select")}
        value={regnum ?? ""}
        onChange={(event) => onRowChange(index, "regnum", event.target.value)}
        disabled={disabled}
        aria-label={`Царство, строка ${index + 1}`}
      >
        <option value="">—</option>
        {REGNUM_ORDER.map((value) => (
          <option key={value} value={value}>
            {getRegnumLabel(value)}
          </option>
        ))}
      </select>
    );
  }

  return (
    <span className="multi-species-table-value multi-species-table-regnum">
      {regnum ? getRegnumLabel(regnum) : "—"}
    </span>
  );
}

function TableStatusCell({ editing, status, index, disabled, invalid = false, onRowChange }) {
  if (editing) {
    return (
      <select
        className={appendInvalidClass("multi-species-table-select", invalid, "select")}
        value={status || "LC"}
        onChange={(event) => onRowChange(index, "status", event.target.value)}
        disabled={disabled}
        aria-label={`Статус МСОП, строка ${index + 1}`}
      >
        {STATUS_OPTIONS.map(({ code, label }) => (
          <option key={code} value={code} title={label}>
            {code}
          </option>
        ))}
      </select>
    );
  }

  return (
    <span className="multi-species-table-value multi-species-table-status" title={
      STATUS_OPTIONS.find((option) => option.code === status)?.label
    }>
      {status || "—"}
    </span>
  );
}

function RegnumMarker({ regnum }) {
  const markerClass =
    regnum === "plantae" || regnum === "animalia" || regnum === "fungi"
      ? `multi-species-regnum-marker--${regnum}`
      : "multi-species-regnum-marker--empty";

  return (
    <span
      className={`multi-species-regnum-marker ${markerClass}`}
      title={regnum ? getRegnumLabel(regnum) : "Царство не выбрано"}
      aria-hidden="true"
    />
  );
}

function MapPickIcon() {
  return (
    <svg
      className="multi-species-coords-pick-icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M12 21s6-5.2 6-10a6 6 0 1 0-12 0c0 4.8 6 10 6 10z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="11" r="2.5" fill="currentColor" />
    </svg>
  );
}

function TableCoordsCells({
  index,
  lat,
  lng,
  isEditing,
  isEntry,
  disabled,
  invalidFields = [],
  onRowChange,
  onMapPickStart,
  mapPickRowIndex
}) {
  const latInvalid = invalidFields.includes("lat");
  const lngInvalid = invalidFields.includes("lng");

  if (isEntry) {
    return (
      <>
        <td className="multi-species-coords-cell">
          <TableInput
            className="multi-species-table-coords multi-species-table-coords--tone"
            invalid={latInvalid}
            type="text"
            value={Number.isFinite(lat) ? String(lat) : ""}
            onChange={(event) => onRowChange(index, "lat", event.target.value)}
            disabled={disabled}
            aria-label={`Широта, строка ${index + 1}`}
          />
        </td>
        <td className="multi-species-coords-cell multi-species-coords-lng-cell">
          <div className="multi-species-coords-lng-group">
            <TableInput
              className="multi-species-table-coords multi-species-table-coords--tone"
              invalid={lngInvalid}
              type="text"
              value={Number.isFinite(lng) ? String(lng) : ""}
              onChange={(event) => onRowChange(index, "lng", event.target.value)}
              disabled={disabled}
              aria-label={`Долгота, строка ${index + 1}`}
            />
            <button
              type="button"
              className={`multi-species-coords-pick-btn${
                mapPickRowIndex === index ? " multi-species-coords-pick-btn--active" : ""
              }`}
              onClick={() => onMapPickStart?.(index)}
              disabled={disabled || !onMapPickStart}
              title="Указать на карте"
              aria-label={`Указать координаты на карте, строка ${index + 1}`}
            >
              <MapPickIcon />
            </button>
          </div>
        </td>
      </>
    );
  }

  return (
    <>
      <td>
        <TableCell
          editing={isEditing}
          displayValue={Number.isFinite(lat) ? lat.toFixed(3) : ""}
          className="multi-species-table-coords"
          invalid={latInvalid}
          inputProps={{
            type: "text",
            value: Number.isFinite(lat) ? String(lat) : "",
            onChange: (event) => onRowChange(index, "lat", event.target.value),
            disabled,
            "aria-label": `Широта, строка ${index + 1}`
          }}
        />
      </td>
      <td>
        <TableCell
          editing={isEditing}
          displayValue={Number.isFinite(lng) ? lng.toFixed(3) : ""}
          className="multi-species-table-coords"
          invalid={lngInvalid}
          inputProps={{
            type: "text",
            value: Number.isFinite(lng) ? String(lng) : "",
            onChange: (event) => onRowChange(index, "lng", event.target.value),
            disabled,
            "aria-label": `Долгота, строка ${index + 1}`
          }}
        />
      </td>
    </>
  );
}

function renderDataCells({
  payload,
  index,
  isEditing,
  isEntry,
  onRowChange,
  onRowSpeciesSelect,
  onMapPickStart,
  mapPickRowIndex,
  suggestionSource,
  withSuggestions,
  disabled,
  lat,
  lng,
  suggestionPlacement,
  invalidFields = []
}) {
  const isInvalid = (field) => invalidFields.includes(field);
  const familySuggestions = withSuggestions
    ? filterTextSuggestions(suggestionSource.families, payload.family)
    : [];
  const nameRuSuggestions = withSuggestions
    ? filterSpeciesByNameRu(suggestionSource.speciesList, payload.name_ru)
    : [];
  const nameLatinSuggestions = withSuggestions
    ? filterSpeciesByNameLatin(suggestionSource.speciesList, payload.name_latin)
    : [];
  const foundBySuggestions = withSuggestions
    ? filterTextSuggestions(suggestionSource.foundBy, payload.found_by)
    : [];
  const identifiedBySuggestions = withSuggestions
    ? filterTextSuggestions(suggestionSource.identifiedBy, payload.identified_by)
    : [];

  return (
    <>
      <td>
        <TableCell
          editing={isEditing}
          displayValue={payload.name_ru}
          className="multi-species-table-name"
          invalid={isInvalid("name_ru")}
          enableAutocomplete={withSuggestions}
          suggestions={nameRuSuggestions}
          onSuggestionSelect={(species) => onRowSpeciesSelect?.(index, species)}
          getSuggestionLabel={(species) => species.name_ru}
          getSuggestionKey={(species) => species.name_ru}
          suggestionPlacement={suggestionPlacement}
          inputProps={{
            value: payload.name_ru,
            onChange: (event) => onRowChange(index, "name_ru", event.target.value),
            disabled,
            "aria-label": `Русское название, строка ${index + 1}`
          }}
        />
      </td>
      <td>
        <TableCell
          editing={isEditing}
          displayValue={payload.name_latin}
          className="multi-species-table-latin"
          invalid={isInvalid("name_latin")}
          enableAutocomplete={withSuggestions}
          suggestions={nameLatinSuggestions}
          onSuggestionSelect={(species) => onRowSpeciesSelect?.(index, species)}
          getSuggestionLabel={(species) => species.name_latin}
          getSuggestionKey={(species) => species.name_latin}
          suggestionPlacement={suggestionPlacement}
          inputProps={{
            value: payload.name_latin,
            onChange: (event) => onRowChange(index, "name_latin", event.target.value),
            disabled,
            "aria-label": `Латинское название, строка ${index + 1}`
          }}
        />
      </td>
      <td className="multi-species-table-family-col">
        <TableCell
          editing={isEditing}
          displayValue={payload.family}
          invalid={isInvalid("family")}
          enableAutocomplete={withSuggestions}
          suggestions={familySuggestions}
          suggestionPlacement={suggestionPlacement}
          inputProps={{
            value: payload.family,
            onChange: (event) => onRowChange(index, "family", event.target.value),
            disabled,
            "aria-label": `Семейство, строка ${index + 1}`
          }}
        />
      </td>
      <td className="multi-species-table-regnum-col">
        <TableRegnumCell
          editing={isEditing}
          regnum={payload.regnum}
          index={index}
          disabled={disabled}
          invalid={isInvalid("regnum")}
          onRowChange={onRowChange}
        />
      </td>
      <td>
        <TableStatusCell
          editing={isEditing}
          status={payload.status}
          index={index}
          disabled={disabled}
          invalid={isInvalid("status")}
          onRowChange={onRowChange}
        />
      </td>
      <td className="multi-species-table-year-col">
        <TableCell
          editing={isEditing}
          displayValue={payload.found_year}
          className="multi-species-table-coords"
          invalid={isInvalid("found_year")}
          inputProps={{
            type: "text",
            value: payload.found_year ?? "",
            onChange: (event) => onRowChange(index, "found_year", event.target.value),
            disabled,
            "aria-label": `Год находки, строка ${index + 1}`
          }}
        />
      </td>
      <TableCoordsCells
        index={index}
        lat={lat}
        lng={lng}
        isEditing={isEditing}
        isEntry={isEntry}
        disabled={disabled}
        invalidFields={invalidFields}
        onRowChange={onRowChange}
        onMapPickStart={onMapPickStart}
        mapPickRowIndex={mapPickRowIndex}
      />
      <td className="multi-species-table-found-col">
        <TableCell
          editing={isEditing}
          displayValue={payload.found_by}
          invalid={isInvalid("found_by")}
          enableAutocomplete={withSuggestions}
          suggestions={foundBySuggestions}
          suggestionPlacement={suggestionPlacement}
          inputProps={{
            value: payload.found_by,
            onChange: (event) => onRowChange(index, "found_by", event.target.value),
            disabled,
            "aria-label": `Нашел, строка ${index + 1}`
          }}
        />
      </td>
      <td className="multi-species-table-identified-col">
        <TableCell
          editing={isEditing}
          displayValue={payload.identified_by}
          enableAutocomplete={withSuggestions}
          suggestions={identifiedBySuggestions}
          suggestionPlacement={suggestionPlacement}
          inputProps={{
            value: payload.identified_by,
            onChange: (event) => onRowChange(index, "identified_by", event.target.value),
            disabled,
            "aria-label": `Определил, строка ${index + 1}`
          }}
        />
      </td>
    </>
  );
}

export default function MultiSpeciesConfirmTable({
  rows,
  onRowChange,
  onRowSpeciesSelect = null,
  onMapPickStart = null,
  mapPickRowIndex = null,
  suggestionData = null,
  onAddRow = null,
  onRemoveRow = null,
  invalidFieldsByRow = null,
  disabled = false,
  autoEditRowIndex = null,
  variant = "review"
}) {
  const isEntry = variant === "entry";
  const withSuggestions = Boolean(suggestionData);
  const suggestionSource = suggestionData ?? {
    speciesList: [],
    families: [],
    foundBy: [],
    identifiedBy: [],
    foundYears: []
  };
  const suggestionPlacement = isEntry ? "drop-down" : "drop-up";
  const [editingRows, setEditingRows] = useState(() => new Set());

  useEffect(() => {
    if (isEntry || autoEditRowIndex == null || autoEditRowIndex < 0) {
      return;
    }

    setEditingRows((prev) => {
      const next = new Set(prev);
      next.add(autoEditRowIndex);
      return next;
    });
  }, [autoEditRowIndex, isEntry]);

  const toggleRowEditing = useCallback(
    (rowIndex) => {
      if (disabled || isEntry) {
        return;
      }

      setEditingRows((prev) => {
        const next = new Set(prev);
        if (next.has(rowIndex)) {
          next.delete(rowIndex);
        } else {
          next.add(rowIndex);
        }
        return next;
      });
    },
    [disabled, isEntry]
  );

  return (
    <div className={`multi-species-table-wrap${isEntry ? " multi-species-table-wrap--entry" : ""}`}>
      <table className={`multi-species-table${isEntry ? " multi-species-table--entry" : ""}`}>
        <thead>
          <tr>
            {!isEntry ? <th className="multi-species-table-edit-col" aria-label="Редактирование" /> : null}
            <th className="multi-species-table-marker-col" aria-hidden="true" />
            <th className="multi-species-table-num-col">№</th>
            <th className="multi-species-table-name-col">
              <TableHeaderLabel required>Название</TableHeaderLabel>
            </th>
            <th className="multi-species-table-latin-col">
              <TableHeaderLabel required>Лат.</TableHeaderLabel>
            </th>
            <th className="multi-species-table-family-col">
              <TableHeaderLabel required>Семейство</TableHeaderLabel>
            </th>
            <th className="multi-species-table-regnum-col">
              <TableHeaderLabel required>Царство</TableHeaderLabel>
            </th>
            <th className="multi-species-table-status-col" title="Статус МСОП">
              <TableHeaderLabel required>МСОП</TableHeaderLabel>
            </th>
            <th className="multi-species-table-year-col">
              <TableHeaderLabel required>Год</TableHeaderLabel>
            </th>
            <th className="multi-species-coords-col">
              <TableHeaderLabel required>Широта</TableHeaderLabel>
            </th>
            <th className={`multi-species-coords-col${isEntry ? " multi-species-coords-lng-col" : ""}`}>
              <TableHeaderLabel required>Долгота</TableHeaderLabel>
            </th>
            <th className="multi-species-table-found-col">
              <TableHeaderLabel required>Нашел</TableHeaderLabel>
            </th>
            <th className="multi-species-table-identified-col">Определил</th>
            {isEntry ? <th className="multi-species-table-action-col" aria-label="Действия" /> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ payload }, index) => {
            const { lng, lat } = getSubmissionRowCoordinates(payload);
            const isEditing = isEntry || editingRows.has(index);
            const isLastRow = index === rows.length - 1;

            return (
              <tr
                key={`confirm-row-${index}`}
                className={isEditing && !isEntry ? "multi-species-table-row--editing" : ""}
                data-regnum={isEntry ? payload.regnum || "" : undefined}
              >
                {!isEntry ? (
                  <td className="multi-species-table-edit-col">
                    <button
                      type="button"
                      className={`multi-species-row-edit-btn${
                        isEditing ? " multi-species-row-edit-btn--active" : ""
                      }`}
                      onClick={() => toggleRowEditing(index)}
                      disabled={disabled}
                      aria-label={
                        isEditing
                          ? `Завершить редактирование строки ${index + 1}`
                          : `Редактировать строку ${index + 1}`
                      }
                      title={isEditing ? "Готово" : "Редактировать"}
                    >
                      <EditIcon />
                    </button>
                  </td>
                ) : null}
                <td className="multi-species-table-marker-col">
                  <RegnumMarker regnum={payload.regnum} />
                </td>
                <td className="multi-species-table-num-col">{index + 1}</td>
                {renderDataCells({
                  payload,
                  index,
                  isEditing,
                  isEntry,
                  onRowChange,
                  onRowSpeciesSelect,
                  onMapPickStart,
                  mapPickRowIndex,
                  suggestionSource,
                  withSuggestions,
                  disabled,
                  lat,
                  lng,
                  suggestionPlacement,
                  invalidFields: invalidFieldsByRow?.[index] ?? []
                })}
                {isEntry ? (
                  <td className="multi-species-table-action-col">
                    {isLastRow ? (
                      <button
                        type="button"
                        className="multi-species-row-action-btn multi-species-row-action-btn--add"
                        onClick={onAddRow}
                        disabled={disabled || !onAddRow}
                        aria-label={`Добавить строку после ${index + 1}`}
                        title="Добавить строку"
                      >
                        <PlusIcon />
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="multi-species-row-action-btn multi-species-row-action-btn--remove"
                        onClick={() => onRemoveRow?.(index)}
                        disabled={disabled || !onRemoveRow}
                        aria-label={`Удалить строку ${index + 1}`}
                        title="Удалить строку"
                      >
                        <TrashIcon />
                      </button>
                    )}
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
