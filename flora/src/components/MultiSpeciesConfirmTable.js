import React, { useCallback, useState } from "react";

function TableInput({ className = "", ...props }) {
  return (
    <input className={`multi-species-table-input${className ? ` ${className}` : ""}`} {...props} />
  );
}

function TableCell({ editing, displayValue, className = "", inputProps }) {
  if (editing) {
    return <TableInput className={className} {...inputProps} />;
  }

  return (
    <span className={`multi-species-table-value${className ? ` ${className}` : ""}`}>
      {displayValue || "—"}
    </span>
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

export default function MultiSpeciesConfirmTable({ rows, onRowChange, disabled = false }) {
  const [editingRows, setEditingRows] = useState(() => new Set());

  const toggleRowEditing = useCallback(
    (rowIndex) => {
      if (disabled) {
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
    [disabled]
  );

  return (
    <div className="multi-species-table-wrap">
      <table className="multi-species-table">
        <thead>
          <tr>
            <th className="multi-species-table-edit-col" aria-label="Редактирование" />
            <th>№</th>
            <th>Название</th>
            <th>Лат.</th>
            <th>Семейство</th>
            <th>Год</th>
            <th>Широта</th>
            <th>Долгота</th>
            <th>Найдено</th>
            <th>Определено</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ payload }, index) => {
            const [lng, lat] = payload.coordinates;
            const isEditing = editingRows.has(index);

            return (
              <tr key={`confirm-row-${index}`} className={isEditing ? "multi-species-table-row--editing" : ""}>
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
                <td>{index + 1}</td>
                <td>
                  <TableCell
                    editing={isEditing}
                    displayValue={payload.name_ru}
                    className="multi-species-table-name"
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
                    inputProps={{
                      value: payload.name_latin,
                      onChange: (event) => onRowChange(index, "name_latin", event.target.value),
                      disabled,
                      "aria-label": `Латинское название, строка ${index + 1}`
                    }}
                  />
                </td>
                <td>
                  <TableCell
                    editing={isEditing}
                    displayValue={payload.family}
                    inputProps={{
                      value: payload.family,
                      onChange: (event) => onRowChange(index, "family", event.target.value),
                      disabled,
                      "aria-label": `Семейство, строка ${index + 1}`
                    }}
                  />
                </td>
                <td>
                  <TableCell
                    editing={isEditing}
                    displayValue={payload.found_year}
                    className="multi-species-table-coords"
                    inputProps={{
                      type: "number",
                      min: "1500",
                      max: "2100",
                      step: "1",
                      value: payload.found_year,
                      onChange: (event) => onRowChange(index, "found_year", event.target.value),
                      disabled,
                      "aria-label": `Год находки, строка ${index + 1}`
                    }}
                  />
                </td>
                <td>
                  <TableCell
                    editing={isEditing}
                    displayValue={lat.toFixed(3)}
                    className="multi-species-table-coords"
                    inputProps={{
                      type: "number",
                      min: "-90",
                      max: "90",
                      step: "0.001",
                      value: lat,
                      onChange: (event) => onRowChange(index, "lat", event.target.value),
                      disabled,
                      "aria-label": `Широта, строка ${index + 1}`
                    }}
                  />
                </td>
                <td>
                  <TableCell
                    editing={isEditing}
                    displayValue={lng.toFixed(3)}
                    className="multi-species-table-coords"
                    inputProps={{
                      type: "number",
                      min: "-180",
                      max: "180",
                      step: "0.001",
                      value: lng,
                      onChange: (event) => onRowChange(index, "lng", event.target.value),
                      disabled,
                      "aria-label": `Долгота, строка ${index + 1}`
                    }}
                  />
                </td>
                <td>
                  <TableCell
                    editing={isEditing}
                    displayValue={payload.found_by}
                    inputProps={{
                      value: payload.found_by,
                      onChange: (event) => onRowChange(index, "found_by", event.target.value),
                      disabled,
                      "aria-label": `Кем найдено, строка ${index + 1}`
                    }}
                  />
                </td>
                <td>
                  <TableCell
                    editing={isEditing}
                    displayValue={payload.identified_by}
                    inputProps={{
                      value: payload.identified_by,
                      onChange: (event) => onRowChange(index, "identified_by", event.target.value),
                      disabled,
                      "aria-label": `Кем определено, строка ${index + 1}`
                    }}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
