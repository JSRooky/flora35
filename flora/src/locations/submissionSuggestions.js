import { getAllSpeciesCollection } from "./loadPoints";

const MAX_SUGGESTIONS = 8;

// Сортирует так, чтобы совпадения по началу строки шли раньше, затем — по алфавиту (ru-локаль).
function sortByQueryMatch(items, query, getLabel) {
  const normalizedQuery = query.trim().toLowerCase();

  return [...items].sort((left, right) => {
    const leftLabel = getLabel(left).toLowerCase();
    const rightLabel = getLabel(right).toLowerCase();
    const leftStarts = leftLabel.startsWith(normalizedQuery);
    const rightStarts = rightLabel.startsWith(normalizedQuery);

    if (leftStarts !== rightStarts) {
      return leftStarts ? -1 : 1;
    }

    return leftLabel.localeCompare(rightLabel, "ru");
  });
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((left, right) =>
    left.localeCompare(right, "ru")
  );
}

/** Собирает варианты подсказок из данных Firestore, загруженных в память. */
export function buildSubmissionSuggestionData() {
  const collection = getAllSpeciesCollection();
  const speciesList = [];
  const families = [];
  const foundBy = [];
  const identifiedBy = [];
  const foundYears = [];

  collection.species.forEach((species) => {
    speciesList.push({
      name_ru: species.name_ru ?? "",
      name_latin: species.name_latin ?? "",
      regnum: species.regnum ?? "plantae",
      status: species.status ?? "LC",
      family: species.family ?? ""
    });

    if (species.family?.trim()) {
      families.push(species.family.trim());
    }

    (species.findings ?? []).forEach((finding) => {
      if (finding.found_by?.trim()) {
        foundBy.push(finding.found_by.trim());
      }

      if (finding.identified_by?.trim()) {
        identifiedBy.push(finding.identified_by.trim());
      }

      if (Number.isInteger(finding.found_year)) {
        foundYears.push(String(finding.found_year));
      }
    });
  });

  return {
    speciesList,
    families: uniqueSorted(families),
    foundBy: uniqueSorted(foundBy),
    identifiedBy: uniqueSorted(identifiedBy),
    foundYears: uniqueSorted(foundYears)
  };
}

/** Фильтрует и сортирует текстовые подсказки (family/found_by/identified_by/found_year) по запросу. */
export function filterTextSuggestions(items, query) {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return [];
  }

  const matches = items.filter((item) => item.toLowerCase().includes(normalizedQuery));

  return sortByQueryMatch(matches, query, (item) => item).slice(0, MAX_SUGGESTIONS);
}

/** Подсказки видов по русскому названию, отфильтрованные и отсортированные по запросу. */
export function filterSpeciesByNameRu(speciesList, query) {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return [];
  }

  const matches = speciesList.filter((species) =>
    species.name_ru.toLowerCase().includes(normalizedQuery)
  );

  return sortByQueryMatch(matches, query, (species) => species.name_ru).slice(0, MAX_SUGGESTIONS);
}

/** Подсказки видов по латинскому названию, отфильтрованные и отсортированные по запросу. */
export function filterSpeciesByNameLatin(speciesList, query) {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return [];
  }

  const matches = speciesList.filter((species) =>
    species.name_latin.toLowerCase().includes(normalizedQuery)
  );

  return sortByQueryMatch(matches, query, (species) => species.name_latin).slice(
    0,
    MAX_SUGGESTIONS
  );
}
