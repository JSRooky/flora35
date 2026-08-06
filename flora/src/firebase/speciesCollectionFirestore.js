import { DEFAULT_SPECIES_DESCRIPTION_MD } from "../locations/defaultSpeciesDescription.js";

/** Коллекция Firestore для проверенных точек карты (из points.json). */
export const FINDINGS_COLLECTION = "findings";

/** Коллекция Firestore для пользовательских отправок (форма «Ввод данных»). */
export const SUBMISSIONS_COLLECTION = "user_submissions";

export const LOCATION_DATASETS = {
  POINTS: "points",
  USERPOINTS: "userpoints"
};

function slugifyNameLatin(nameLatin) {
  return String(nameLatin ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Единый формат ID документа Firestore: `{source}__{finding_id}`. */
export function buildFirestoreDocId(source, findingId) {
  return `${source}__${findingId}`;
}

/** Разбирает ID документа формата `{source}__{finding_id}`. */
export function parseFirestoreDocId(docId) {
  const separatorIndex = String(docId).indexOf("__");

  if (separatorIndex === -1) {
    return { source: null, findingId: String(docId) };
  }

  return {
    source: docId.slice(0, separatorIndex),
    findingId: docId.slice(separatorIndex + 2)
  };
}

/** Генерирует finding_id для новой пользовательской отправки. */
export function buildSubmissionFindingId(nameLatin) {
  const speciesId = slugifyNameLatin(nameLatin);

  if (!speciesId) {
    throw new Error("Cannot build finding id without name_latin");
  }

  // Добавляем случайный суффикс, чтобы две отправки одного вида в одну и ту же
  // миллисекунду (например, двойной клик) не получили одинаковый ID и не
  // перезаписали друг друга при setDoc.
  const randomSuffix = Math.random().toString(36).slice(2, 8);
  return `${speciesId}-${Date.now().toString(36)}-${randomSuffix}`;
}

/** Публичная обёртка над slugifyNameLatin для получения species_id. */
export function slugifySpeciesId(nameLatin) {
  return slugifyNameLatin(nameLatin);
}

/**
 * Разворачивает SpeciesCollection в документы Firestore.
 * @returns {Array<{ id: string, data: object }>}
 */
export function speciesCollectionToFindingDocs(collection, dataset) {
  if (collection?.type !== "SpeciesCollection" || !Array.isArray(collection.species)) {
    return [];
  }

  const docs = [];

  collection.species.forEach((species) => {
    (species.findings ?? []).forEach((finding, index) => {
      const findingId = finding.id ?? `${species.id}-${index + 1}`;

      docs.push({
        id: buildFirestoreDocId(dataset, findingId),
        data: {
          dataset,
          finding_id: findingId,
          species_id: species.id,
          regnum: species.regnum ?? "",
          status: species.status ?? "",
          family: species.family ?? "",
          name_ru: species.name_ru ?? "",
          name_latin: species.name_latin ?? "",
          description_md: species.description_md ?? DEFAULT_SPECIES_DESCRIPTION_MD,
          coordinates: finding.coordinates,
          found_by: finding.found_by ?? "",
          identified_by: finding.identified_by ?? "",
          found_year: finding.found_year ?? null
        }
      });
    });
  });

  return docs;
}

/**
 * Собирает SpeciesCollection из документов Firestore.
 */
export function findingDocsToSpeciesCollection(docs, dataset = null) {
  const speciesById = new Map();

  docs.forEach((doc) => {
    const record = doc.data?.() ?? doc.data ?? doc;

    if (!record || (dataset && record.dataset !== dataset)) {
      return;
    }

    if (!Array.isArray(record.coordinates) || record.coordinates.length < 2) {
      return;
    }

    const speciesId = record.species_id;
    if (!speciesId) {
      return;
    }

    if (!speciesById.has(speciesId)) {
      speciesById.set(speciesId, {
        id: speciesId,
        regnum: record.regnum,
        status: record.status,
        family: record.family,
        name_ru: record.name_ru,
        name_latin: record.name_latin,
        description_md: record.description_md ?? DEFAULT_SPECIES_DESCRIPTION_MD,
        findings: []
      });
    }

    const speciesEntry = speciesById.get(speciesId);
    const findingId = record.finding_id ?? parseFirestoreDocId(doc.id).findingId;
    // Защита от дублей, если один и тот же finding_id встретится в снапшоте дважды.
    const alreadyAdded = speciesEntry.findings.some((finding) => finding.id === findingId);

    if (!alreadyAdded) {
      speciesEntry.findings.push({
        id: findingId,
        coordinates: record.coordinates,
        found_by: record.found_by,
        identified_by: record.identified_by,
        found_year: record.found_year
      });
    }
  });

  return {
    type: "SpeciesCollection",
    species: [...speciesById.values()]
  };
}

/**
 * Собирает SpeciesCollection из документов коллекции user_submissions.
 */
export function submissionDocsToSpeciesCollection(docs) {
  const speciesById = new Map();

  docs.forEach((doc) => {
    const record = doc.data?.() ?? doc.data ?? doc;

    if (!record || !Array.isArray(record.coordinates) || record.coordinates.length < 2) {
      return;
    }

    const speciesId = record.species_id || slugifyNameLatin(record.name_latin);
    if (!speciesId) {
      return;
    }

    const findingId =
      record.finding_id ?? parseFirestoreDocId(doc.id).findingId;

    if (!speciesById.has(speciesId)) {
      speciesById.set(speciesId, {
        id: speciesId,
        regnum: record.regnum ?? "",
        status: record.status ?? "",
        family: record.family ?? "",
        name_ru: record.name_ru ?? "",
        name_latin: record.name_latin ?? "",
        description_md: record.description_md ?? DEFAULT_SPECIES_DESCRIPTION_MD,
        findings: []
      });
    }

    const speciesEntry = speciesById.get(speciesId);
    // Защита от дублей, если один и тот же finding_id встретится в снапшоте дважды.
    const alreadyAdded = speciesEntry.findings.some((finding) => finding.id === findingId);

    if (!alreadyAdded) {
      speciesEntry.findings.push({
        id: findingId,
        coordinates: record.coordinates,
        found_by: record.found_by ?? "",
        identified_by: record.identified_by ?? "",
        found_year: record.found_year ?? null
      });
    }
  });

  return {
    type: "SpeciesCollection",
    species: [...speciesById.values()]
  };
}

/** Разделяет документы findings на две коллекции по полю dataset. */
export function splitFindingDocsByDataset(docs) {
  const pointsDocs = [];
  const userpointsDocs = [];

  docs.forEach((doc) => {
    const record = doc.data?.() ?? doc.data ?? doc;
    if (record?.dataset === LOCATION_DATASETS.USERPOINTS) {
      userpointsDocs.push(doc);
      return;
    }

    if (record?.dataset === LOCATION_DATASETS.POINTS) {
      pointsDocs.push(doc);
    }
  });

  return {
    points: findingDocsToSpeciesCollection(pointsDocs, LOCATION_DATASETS.POINTS),
    userpoints: findingDocsToSpeciesCollection(userpointsDocs, LOCATION_DATASETS.USERPOINTS)
  };
}
