const FIELD_COUNT_MIN = 8;
const FIELD_COUNT_MAX = 9;

const DELIMITER_CANDIDATES = [";", "|", "\t", ":", "/", "#", "~"];

const REGNUM_ALIASES = {
  plantae: ["plantae", "растения"],
  animalia: ["animalia", "животные"],
  fungi: ["fungi", "грибы"],
  protozoa: ["protozoa", "простейшие"]
};

const STATUS_CODES = new Set(["EX", "EW", "CR", "EN", "VU", "NT", "LC"]);

function normalizeToken(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

/** Формирует строку «N находка/находки/находок» с учётом склонения числительного. */
export function formatFindingsCount(count) {
  const mod10 = count % 10;
  const mod100 = count % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return `${count} находка`;
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) {
    return `${count} находки`;
  }

  return `${count} находок`;
}

// Подбирает разделитель полей: берёт кандидата с наибольшим числом вхождений,
// но только если вхождений достаточно для минимального набора полей.
function detectDelimiter(line) {
  let bestDelimiter = null;
  let bestCount = 0;

  DELIMITER_CANDIDATES.forEach((delimiter) => {
    const count = line.split(delimiter).length - 1;
    if (count >= FIELD_COUNT_MIN - 1 && count > bestCount) {
      bestDelimiter = delimiter;
      bestCount = count;
    }
  });

  return bestDelimiter;
}

// Ищет царство по русскому или латинскому алиасу (REGNUM_ALIASES).
function parseRegnum(value) {
  const token = normalizeToken(value);
  if (!token) {
    return { error: "Укажите царство." };
  }

  const match = Object.entries(REGNUM_ALIASES).find(([, aliases]) =>
    aliases.includes(token)
  );

  if (!match) {
    return { error: "Некорректное царство (plantae, animalia, fungi, protozoa)." };
  }

  return { regnum: match[0] };
}

// Пустой статус трактуется как LC (наименьшая обеспокоенность), иначе — код МСОП из STATUS_CODES.
function parseStatus(value) {
  const code = String(value ?? "")
    .trim()
    .toUpperCase();

  if (!code) {
    return { status: "LC" };
  }

  if (!STATUS_CODES.has(code)) {
    return { error: "Некорректный статус МСОП." };
  }

  return { status: code };
}

// Разбирает одно поле координат вида "широта, долгота" (запятая — тоже десятичный разделитель).
function parseCoordinateField(value) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) {
    return { error: "Укажите координаты." };
  }

  const parts = trimmed.split(/[\s,]+/).filter(Boolean);
  if (parts.length < 2) {
    return { error: "Укажите широту и долготу." };
  }

  const lat = Number.parseFloat(parts[0].replace(",", "."));
  const lng = Number.parseFloat(parts[1].replace(",", "."));

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { error: "Некорректные координаты." };
  }

  if (lat < -90 || lat > 90) {
    return { error: "Широта должна быть от −90 до 90." };
  }

  if (lng < -180 || lng > 180) {
    return { error: "Долгота должна быть от −180 до 180." };
  }

  return {
    coordinates: [Number(lng.toFixed(3)), Number(lat.toFixed(3))]
  };
}

// Год находки ограничен разумным диапазоном 1500–2100.
function parseFoundYear(value) {
  const foundYear = Number(String(value ?? "").trim());
  if (!Number.isInteger(foundYear) || foundYear < 1500 || foundYear > 2100) {
    return { error: "Укажите корректный год находки." };
  }

  return { found_year: foundYear };
}

// Валидирует и собирает payload находки из массива полей одной строки текста.
function parseSubmissionParts(parts, lineNumber) {
  if (parts.length < FIELD_COUNT_MIN) {
    return {
      error: {
        line: lineNumber,
        text: "Недостаточно полей. Ожидается 8–9 значений, разделённых одним символом (; | : и т.д.)."
      }
    };
  }

  if (parts.length > FIELD_COUNT_MAX) {
    return {
      error: {
        line: lineNumber,
        text: "Слишком много полей в строке."
      }
    };
  }

  const [
    name_ru,
    name_latin,
    family,
    regnumRaw,
    statusRaw,
    coordinatesRaw,
    foundYearRaw,
    found_by,
    identified_by = ""
  ] = parts;

  if (!name_ru?.trim()) {
    return { error: { line: lineNumber, text: "Укажите русское название." } };
  }

  if (!name_latin?.trim()) {
    return { error: { line: lineNumber, text: "Укажите латинское название." } };
  }

  if (!family?.trim()) {
    return { error: { line: lineNumber, text: "Укажите семейство." } };
  }

  const regnumResult = parseRegnum(regnumRaw);
  if (regnumResult.error) {
    return { error: { line: lineNumber, text: regnumResult.error } };
  }

  const statusResult = parseStatus(statusRaw);
  if (statusResult.error) {
    return { error: { line: lineNumber, text: statusResult.error } };
  }

  const coordinatesResult = parseCoordinateField(coordinatesRaw);
  if (coordinatesResult.error) {
    return { error: { line: lineNumber, text: coordinatesResult.error } };
  }

  const foundYearResult = parseFoundYear(foundYearRaw);
  if (foundYearResult.error) {
    return { error: { line: lineNumber, text: foundYearResult.error } };
  }

  if (!found_by?.trim()) {
    return { error: { line: lineNumber, text: "Укажите, кем найдено." } };
  }

  return {
    row: {
      line: lineNumber,
      payload: {
        name_ru: name_ru.trim(),
        name_latin: name_latin.trim(),
        family: family.trim(),
        regnum: regnumResult.regnum,
        status: statusResult.status,
        coordinates: coordinatesResult.coordinates,
        found_year: foundYearResult.found_year,
        found_by: found_by.trim(),
        identified_by: identified_by.trim()
      }
    }
  };
}

/** Возвращает список имён некорректных/незаполненных полей payload (для подсветки в таблице). */
export function getSubmissionPayloadInvalidFields(payload) {
  const invalidFields = [];

  if (!String(payload?.name_ru ?? "").trim()) {
    invalidFields.push("name_ru");
  }

  if (!String(payload?.name_latin ?? "").trim()) {
    invalidFields.push("name_latin");
  }

  if (!String(payload?.family ?? "").trim()) {
    invalidFields.push("family");
  }

  const regnumResult = parseRegnum(payload?.regnum);
  if (regnumResult.error) {
    invalidFields.push("regnum");
  }

  const statusResult = parseStatus(payload?.status);
  if (statusResult.error) {
    invalidFields.push("status");
  }

  const [lng, lat] = payload?.coordinates ?? [];
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    invalidFields.push("lat");
  }

  if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
    invalidFields.push("lng");
  }

  const foundYearResult = parseFoundYear(payload?.found_year);
  if (foundYearResult.error) {
    invalidFields.push("found_year");
  }

  if (!String(payload?.found_by ?? "").trim()) {
    invalidFields.push("found_by");
  }

  return invalidFields;
}

/** Проверяет и нормализует payload находки перед сохранением, возвращает ошибку либо готовый payload. */
export function validateSubmissionPayload(payload) {
  const name_ru = String(payload?.name_ru ?? "").trim();
  const name_latin = String(payload?.name_latin ?? "").trim();
  const family = String(payload?.family ?? "").trim();
  const found_by = String(payload?.found_by ?? "").trim();
  const identified_by = String(payload?.identified_by ?? "").trim();

  if (!name_ru) {
    return { error: "Укажите русское название." };
  }

  if (!name_latin) {
    return { error: "Укажите латинское название." };
  }

  if (!family) {
    return { error: "Укажите семейство." };
  }

  const regnumResult = parseRegnum(payload?.regnum);
  if (regnumResult.error) {
    return { error: regnumResult.error };
  }

  const statusResult = parseStatus(payload?.status);
  if (statusResult.error) {
    return { error: statusResult.error };
  }

  const [lng, lat] = payload?.coordinates ?? [];
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { error: "Укажите корректные координаты." };
  }

  if (lat < -90 || lat > 90) {
    return { error: "Широта должна быть от −90 до 90." };
  }

  if (lng < -180 || lng > 180) {
    return { error: "Долгота должна быть от −180 до 180." };
  }

  const foundYearResult = parseFoundYear(payload?.found_year);
  if (foundYearResult.error) {
    return { error: foundYearResult.error };
  }

  if (!found_by) {
    return { error: "Укажите, кем найдено." };
  }

  return {
    payload: {
      name_ru,
      name_latin,
      family,
      regnum: regnumResult.regnum,
      status: statusResult.status,
      coordinates: [Number(lng.toFixed(3)), Number(lat.toFixed(3))],
      found_year: foundYearResult.found_year,
      found_by,
      identified_by
    }
  };
}

/**
 * Разбирает текст со списком находок (по одной записи на строку).
 * Разделитель полей — любой из набора (; | tab : / # ~), кроме пробела и запятой.
 *
 * @returns {{ rows: Array<{ line: number, payload: object }>, errors: Array<{ line: number, text: string }>, delimiter: string|null }}
 */
export function parseSubmissionLines(text) {
  const lines = text.split(/\r?\n/);
  const errors = [];
  const rows = [];
  const nonEmptyEntries = [];

  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (line) {
      nonEmptyEntries.push({ line, lineNumber: index + 1 });
    }
  });

  if (nonEmptyEntries.length === 0) {
    return { rows, errors, delimiter: null };
  }

  const delimiter = detectDelimiter(nonEmptyEntries[0].line);
  if (!delimiter) {
    return {
      rows,
      errors: [
        {
          line: nonEmptyEntries[0].lineNumber,
          text: "Не удалось определить разделитель полей. Используйте ; | : / # ~ или табуляцию."
        }
      ],
      delimiter: null
    };
  }

  nonEmptyEntries.forEach(({ line, lineNumber }) => {
    const parts = line.split(delimiter).map((part) => part.trim());
    const result = parseSubmissionParts(parts, lineNumber);

    if (result.error) {
      errors.push(result.error);
      return;
    }

    rows.push(result.row);
  });

  return { rows, errors, delimiter };
}

/** Форматирует координаты для отображения в интерфейсе как "широта, долгота". */
export function formatSubmissionCoordinates(coordinates) {
  const [lng, lat] = coordinates;
  return `${lat.toFixed(3)}, ${lng.toFixed(3)}`;
}
