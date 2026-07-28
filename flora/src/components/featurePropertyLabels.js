/** Человекочитаемые подписи свойств точки данных. */
export const PROPERTY_LABELS = {
  name_ru: "Название",
  name_latin: "Лatinь",
  regnum: "Царство",
  family: "Семейство",
  found_by: "Обнаружил",
  identified_by: "Определил",
  found_year: "Год находки",
  status: "Статус"
};

/** Предпочтительный порядок полей в панели «Сведения о точке». */
export const PROPERTY_DISPLAY_ORDER = [
  "name_ru",
  "name_latin",
  "regnum",
  "family",
  "found_year",
  "found_by",
  "identified_by"
];

const REGNUM_LABELS = {
  plantae: "Растения",
  animalia: "Животные",
  fungi: "Грибы"
};

export function getPropertyLabel(key) {
  return PROPERTY_LABELS[key] ?? key;
}

export function formatPropertyValue(key, value) {
  if (key === "regnum") {
    return REGNUM_LABELS[value] ?? String(value);
  }

  return String(value);
}

export function sortPropertyEntries(entries) {
  const order = new Map(PROPERTY_DISPLAY_ORDER.map((key, index) => [key, index]));

  return [...entries].sort(([keyA], [keyB]) => {
    const orderA = order.has(keyA) ? order.get(keyA) : Number.MAX_SAFE_INTEGER;
    const orderB = order.has(keyB) ? order.get(keyB) : Number.MAX_SAFE_INTEGER;

    if (orderA !== orderB) {
      return orderA - orderB;
    }

    return keyA.localeCompare(keyB);
  });
}
