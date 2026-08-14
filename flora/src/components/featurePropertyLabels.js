/** Человекочитаемые подписи свойств точки данных. */
export const PROPERTY_LABELS = {
  name_ru: "Название",
  name_latin: "Латынь",
  regnum: "Царство",
  family: "Семейство",
  found_by: "Обнаружил",
  identified_by: "Определил",
  found_year: "Год находки",
  found_month: "Месяц",
  status: "Статус",
  distance_meters: "Расстояние исходников, м",
  basisOfRecord: "Тип записи",
  datasetKey: "Набор данных",
  gbif_key: "GBIF ID",
  gbif_url: "Ссылка GBIF",
  inat_id: "iNaturalist ID",
  inat_url: "Ссылка iNaturalist",
  quality_grade: "Качество наблюдения",
  place_guess: "Место (текст)",
  license_code: "Лицензия",
  obscured: "Координаты скрыты",
  taxon_id: "Taxon ID",
  source: "Источник",
  region_id: "Регион"
};

/** Предпочтительный порядок полей в панели «Сведения о точке». */
export const PROPERTY_DISPLAY_ORDER = [
  "name_ru",
  "name_latin",
  "regnum",
  "family",
  "found_year",
  "found_month",
  "found_by",
  "identified_by",
  "basisOfRecord",
  "gbif_key",
  "datasetKey"
];

const REGNUM_LABELS = {
  plantae: "Растения",
  animalia: "Животные",
  fungi: "Грибы",
  protozoa: "Простейшие"
};

/** Порядок отображения царств в списках и деревьях видов. */
export const REGNUM_ORDER = ["plantae", "animalia", "fungi", "protozoa"];

/** Подпись царства для UI; для неизвестных значений возвращает исходное значение. */
export function getRegnumLabel(value) {
  if (!value) {
    return "Без царства";
  }

  const key = String(value).toLowerCase();
  return REGNUM_LABELS[key] ?? String(value);
}

/** Подпись семейства для UI (используется как есть, без словаря). */
export function getFamilyLabel(value) {
  if (!value) {
    return "Без семейства";
  }

  return String(value);
}

/** Группирует элементы по полю regnum в порядке REGNUM_ORDER. */
export function groupByRegnum(items, getRegnum = (item) => item.regnum) {
  const groups = new Map();

  items.forEach((item) => {
    const raw = getRegnum(item) || "";
    const normalized = String(raw).toLowerCase();
    const key = REGNUM_LABELS[normalized] ? normalized : raw;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(item);
  });

  const ordered = [];

  REGNUM_ORDER.forEach((regnum) => {
    if (groups.has(regnum)) {
      ordered.push({ regnum, items: groups.get(regnum) });
      groups.delete(regnum);
    }
  });

  [...groups.entries()]
    .sort(([left], [right]) => getRegnumLabel(left).localeCompare(getRegnumLabel(right), "ru"))
    .forEach(([regnum, groupItems]) => {
      ordered.push({ regnum, items: groupItems });
    });

  return ordered;
}

/** Строит дерево «царство → семейство → виды» для списка уникальных видов. */
export function buildSpeciesRegnumFamilyTree(species) {
  return groupByRegnum(species).map(({ regnum, items }) => {
    const familiesByKey = new Map();

    items.forEach((item) => {
      const familyKey = item.family || "";
      if (!familiesByKey.has(familyKey)) {
        familiesByKey.set(familyKey, []);
      }
      familiesByKey.get(familyKey).push(item);
    });

    const families = [...familiesByKey.entries()]
      .sort(([left], [right]) => getFamilyLabel(left).localeCompare(getFamilyLabel(right), "ru"))
      .map(([family, familyItems]) => ({
        family,
        label: getFamilyLabel(family),
        species: [...familyItems].sort((left, right) => {
          const leftRu = String(left.nameRu || "").trim();
          const rightRu = String(right.nameRu || "").trim();
          const leftLabel =
            leftRu && leftRu !== "Без названия"
              ? leftRu
              : String(left.nameLatin || "").trim();
          const rightLabel =
            rightRu && rightRu !== "Без названия"
              ? rightRu
              : String(right.nameLatin || "").trim();
          return leftLabel.localeCompare(rightLabel, "ru");
        })
      }));

    return {
      regnum,
      label: getRegnumLabel(regnum),
      families,
      speciesCount: items.length
    };
  });
}

/** Человекочитаемая подпись поля свойства точки. */
export function getPropertyLabel(key) {
  return PROPERTY_LABELS[key] ?? key;
}

const MONTH_LABELS = [
  "январь",
  "февраль",
  "март",
  "апрель",
  "май",
  "июнь",
  "июль",
  "август",
  "сентябрь",
  "октябрь",
  "ноябрь",
  "декабрь"
];

function getMonthLabel(value) {
  const month = Number(value);
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return String(value);
  }

  return MONTH_LABELS[month - 1];
}

/** Человекочитаемое значение поля свойства точки. */
export function formatPropertyValue(key, value) {
  if (key === "regnum") {
    return getRegnumLabel(value);
  }

  if (key === "found_month") {
    return getMonthLabel(value);
  }

  return String(value);
}

/** Сортирует пары [key, value] по PROPERTY_DISPLAY_ORDER, остальные — в конец по алфавиту. */
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

/** Склонение «N точка/точки/точек» для русского интерфейса. */
export function formatPointCount(count) {
  const mod10 = count % 10;
  const mod100 = count % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return `${count} точка`;
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${count} точки`;
  }

  return `${count} точек`;
}

/** Склонение «N вид/вида/видов» для русского интерфейса. */
export function formatSpeciesCount(count) {
  const mod10 = count % 10;
  const mod100 = count % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return `${count} вид`;
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${count} вида`;
  }

  return `${count} видов`;
}
