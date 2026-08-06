/**
 * Разбирает текст со списком координат (по одной паре на строку).
 * Формат: широта, долгота — через запятую, точку с запятой или пробел.
 *
 * @returns {{ coordinates: Array<[number, number]>, errors: Array<{ line: number, text: string }> }}
 */
export function parseCoordinatesList(text) {
  const lines = text.split(/\r?\n/);
  const coordinates = [];
  const errors = [];

  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line) {
      return;
    }

    const parts = line.split(/[,;\s]+/).filter(Boolean);
    if (parts.length < 2) {
      errors.push({ line: index + 1, text: "Укажите широту и долготу." });
      return;
    }

    const lat = Number.parseFloat(parts[0].replace(",", "."));
    const lng = Number.parseFloat(parts[1].replace(",", "."));

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      errors.push({ line: index + 1, text: "Некорректные числа." });
      return;
    }

    if (lat < -90 || lat > 90) {
      errors.push({ line: index + 1, text: "Широта должна быть от −90 до 90." });
      return;
    }

    if (lng < -180 || lng > 180) {
      errors.push({ line: index + 1, text: "Долгота должна быть от −180 до 180." });
      return;
    }

    coordinates.push([
      Number(lng.toFixed(3)),
      Number(lat.toFixed(3))
    ]);
  });

  return { coordinates, errors };
}

/** Формирует строку «N точка/точки/точек» с учётом склонения числительного. */
export function formatPointsCount(count) {
  const mod10 = count % 10;
  const mod100 = count % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return `${count} точка`;
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) {
    return `${count} точки`;
  }

  return `${count} точек`;
}
