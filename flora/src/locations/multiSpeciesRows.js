import { getSubmissionPayloadInvalidFields } from "./parseSubmissionLines";

/** Пустая строка находки для табличного ввода. */
export function createEmptySubmissionRow(lineNumber = 1) {
  return {
    line: lineNumber,
    payload: {
      name_ru: "",
      name_latin: "",
      family: "",
      regnum: "",
      status: "LC",
      coordinates: [],
      found_year: "",
      found_by: "",
      identified_by: ""
    }
  };
}

export function getSubmissionRowCoordinates(payload) {
  const [lng, lat] = payload?.coordinates ?? [];
  return {
    lng: Number.isFinite(lng) ? lng : null,
    lat: Number.isFinite(lat) ? lat : null
  };
}

function hasSubmissionText(value) {
  return String(value ?? "").trim() !== "";
}

/** Строка считается заполненной, если введено хотя бы одно значимое поле. */
export function isSubmissionRowFilled(row) {
  const payload = row?.payload ?? {};
  const { lng, lat } = getSubmissionRowCoordinates(payload);

  return (
    hasSubmissionText(payload.name_ru) ||
    hasSubmissionText(payload.name_latin) ||
    hasSubmissionText(payload.family) ||
    hasSubmissionText(payload.regnum) ||
    hasSubmissionText(payload.found_by) ||
    hasSubmissionText(payload.identified_by) ||
    hasSubmissionText(payload.found_year) ||
    lng !== null ||
    lat !== null
  );
}

export function countFilledSubmissionRows(rows) {
  return rows.filter(isSubmissionRowFilled).length;
}

/** Возвращает ошибки обязательных полей по индексам строк таблицы. */
export function getPendingRowsFieldErrors(rows) {
  const fieldErrors = {};

  rows.forEach((row, index) => {
    const invalidFields = getSubmissionPayloadInvalidFields(row.payload);
    if (invalidFields.length > 0) {
      fieldErrors[index] = invalidFields;
    }
  });

  return fieldErrors;
}
