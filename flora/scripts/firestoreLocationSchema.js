import { DEFAULT_SPECIES_DESCRIPTION_MD } from "../src/locations/defaultSpeciesDescription.js";
import {
  FINDINGS_COLLECTION,
  SUBMISSIONS_COLLECTION
} from "../src/firebase/speciesCollectionFirestore.js";

/** Общие поля находки (вид + точка). */
export const SHARED_FINDING_FIELDS = {
  finding_id: { type: "string", required: true },
  species_id: { type: "string", required: true },
  regnum: { type: "string", required: true },
  status: { type: "string", required: true },
  family: { type: "string", required: true, default: "" },
  name_ru: { type: "string", required: true },
  name_latin: { type: "string", required: true },
  description_md: { type: "string", required: true, default: DEFAULT_SPECIES_DESCRIPTION_MD },
  coordinates: { type: "coordinates", required: true },
  found_by: { type: "string", required: true },
  identified_by: { type: "string", required: true },
  found_year: { type: "number|null", required: true }
};

export const COLLECTION_SCHEMAS = {
  [FINDINGS_COLLECTION]: {
    label: "Проверенные и импортированные находки",
    fields: {
      dataset: { type: "string", required: true },
      ...SHARED_FINDING_FIELDS
    }
  },
  [SUBMISSIONS_COLLECTION]: {
    label: "Пользовательские отправки",
    fields: {
      ...SHARED_FINDING_FIELDS,
      source: { type: "string", required: false },
      submittedAt: { type: "timestamp", required: false }
    }
  }
};

function fieldType(value) {
  if (value === null || value === undefined) {
    return "null";
  }

  if (Array.isArray(value)) {
    return "array";
  }

  if (value instanceof Date) {
    return "timestamp";
  }

  if (typeof value === "object" && typeof value.toDate === "function") {
    return "timestamp";
  }

  return typeof value;
}

function matchesExpectedType(actualType, expectedType) {
  if (expectedType === "number|null") {
    return actualType === "number" || actualType === "null";
  }

  if (expectedType === "coordinates") {
    return actualType === "array";
  }

  if (expectedType === "timestamp") {
    return actualType === "timestamp" || actualType === "object";
  }

  return actualType === expectedType;
}

function isValidCoordinates(value) {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number"
  );
}

function slugifyNameLatin(nameLatin) {
  return String(nameLatin ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function hasFieldValue(value) {
  return value !== undefined && value !== null;
}

/**
 * Проверяет документ Firestore на соответствие схеме коллекции.
 * @returns {{ issues: string[], patches: object }}
 */
export function inspectFirestoreDocument(collectionName, record, docId = "") {
  const schema = COLLECTION_SCHEMAS[collectionName];

  if (!schema) {
    return { issues: [`Unknown collection: ${collectionName}`], patches: {} };
  }

  const issues = [];
  const patches = {};

  Object.entries(schema.fields).forEach(([fieldName, rule]) => {
    const value = record[fieldName];
    const hasValue = hasFieldValue(value);

    if (!hasValue) {
      if (rule.required) {
        issues.push(`missing required field "${fieldName}"`);

        if (rule.default !== undefined) {
          patches[fieldName] = rule.default;
        }
      }

      return;
    }

    const actualType = fieldType(value);

    if (!matchesExpectedType(actualType, rule.type)) {
      issues.push(
        `field "${fieldName}" has type ${actualType}, expected ${rule.type}`
      );
      return;
    }

    if (rule.type === "coordinates" && !isValidCoordinates(value)) {
      issues.push(`field "coordinates" is not a valid [lon, lat] pair`);
    }
  });

  if (!hasFieldValue(record.species_id) && !patches.species_id && record.name_latin) {
    patches.species_id = slugifyNameLatin(record.name_latin);
  }

  if (!hasFieldValue(record.finding_id) && !patches.finding_id) {
    const separatorIndex = String(docId).indexOf("__");

    if (separatorIndex !== -1) {
      patches.finding_id = docId.slice(separatorIndex + 2);
    } else if (docId) {
      patches.finding_id = docId;
    }
  }

  const knownFields = new Set(Object.keys(schema.fields));
  Object.keys(record).forEach((fieldName) => {
    if (!knownFields.has(fieldName)) {
      issues.push(`unexpected field "${fieldName}"`);
    }
  });

  return { issues, patches };
}

/**
 * Добавляет description_md видам в SpeciesCollection, если поле отсутствует.
 * @returns {number} количество обновлённых видов
 */
export function ensureSpeciesCollectionDescription(collection) {
  let updated = 0;

  collection.species.forEach((species) => {
    if (!species.description_md) {
      species.description_md = DEFAULT_SPECIES_DESCRIPTION_MD;
      updated += 1;
    }
  });

  return updated;
}
