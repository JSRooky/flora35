import { getStablePointKey } from "../components/addLocationsLayer";

function isValidCoordinates(coordinates) {
  return (
    Array.isArray(coordinates) &&
    coordinates.length >= 2 &&
    Number.isFinite(coordinates[0]) &&
    Number.isFinite(coordinates[1])
  );
}

function midpoint(leftCoordinates, rightCoordinates) {
  return [
    (leftCoordinates[0] + rightCoordinates[0]) / 2,
    (leftCoordinates[1] + rightCoordinates[1]) / 2
  ];
}

function pickFirstNonEmpty(...values) {
  for (const value of values) {
    if (value != null && value !== "") {
      return value;
    }
  }
  return null;
}

function toMergedFromEntry(matchPoint) {
  const feature = matchPoint?.feature;
  const properties = feature?.properties ?? {};
  const coordinates = isValidCoordinates(matchPoint?.coordinates)
    ? [matchPoint.coordinates[0], matchPoint.coordinates[1]]
    : null;
  const id = getStablePointKey(feature);
  const source = matchPoint?.source || properties.source || "";

  return {
    source,
    id,
    url: properties.gbif_url || properties.inat_url || null,
    name_latin: properties.name_latin || matchPoint?.nameLatin || null,
    coordinates
  };
}

/**
 * Собирает документ Firestore и GeoJSON Feature из пары «Близкие точки».
 * Координаты — середина между left и right.
 *
 * @param {{ left?: object, right?: object, nameLatin?: string, distanceMeters?: number }} match
 * @returns {{
 *   docId: string,
 *   record: object,
 *   feature: object,
 *   hiddenKeys: string[]
 * }}
 */
export function buildMergedPointFromMatch(match) {
  const left = match?.left;
  const right = match?.right;

  if (!left?.feature || !right?.feature) {
    throw new Error("Нельзя объединить: нет исходных точек.");
  }

  if (!isValidCoordinates(left.coordinates) || !isValidCoordinates(right.coordinates)) {
    throw new Error("Нельзя объединить: нет валидных координат.");
  }

  const leftProps = left.feature.properties ?? {};
  const rightProps = right.feature.properties ?? {};
  const leftKey = getStablePointKey(left.feature);
  const rightKey = getStablePointKey(right.feature);

  if (!leftKey || !rightKey) {
    throw new Error("Нельзя объединить: нет стабильных идентификаторов точек.");
  }

  const coordinates = midpoint(left.coordinates, right.coordinates);
  const nameLatin =
    pickFirstNonEmpty(match?.nameLatin, leftProps.name_latin, rightProps.name_latin) ||
    "";
  const mergedFrom = [toMergedFromEntry(left), toMergedFromEntry(right)];
  const mergedId = `merged__${leftKey}__${rightKey}`.replace(/[^\w.-]+/g, "-");

  const record = {
    merged_id: mergedId,
    source: "merged",
    name_latin: nameLatin,
    name_ru: pickFirstNonEmpty(leftProps.name_ru, rightProps.name_ru) || "",
    regnum: pickFirstNonEmpty(leftProps.regnum, rightProps.regnum) || "",
    family: pickFirstNonEmpty(leftProps.family, rightProps.family) || "",
    found_year: pickFirstNonEmpty(leftProps.found_year, rightProps.found_year),
    found_by: pickFirstNonEmpty(leftProps.found_by, rightProps.found_by) || "",
    identified_by:
      pickFirstNonEmpty(leftProps.identified_by, rightProps.identified_by) || "",
    status: pickFirstNonEmpty(leftProps.status, rightProps.status) || "LC",
    coordinates,
    distance_meters:
      Number.isFinite(match?.distanceMeters) ? match.distanceMeters : null,
    merged_from: mergedFrom
  };

  const gbifEntry = mergedFrom.find((entry) => entry.source === "gbif");
  const inatEntry = mergedFrom.find((entry) => entry.source === "inaturalist");

  const feature = {
    type: "Feature",
    id: mergedId,
    geometry: {
      type: "Point",
      coordinates: [...coordinates]
    },
    properties: {
      source: "merged",
      merged_id: mergedId,
      name_latin: record.name_latin,
      name_ru: record.name_ru || null,
      regnum: record.regnum || null,
      family: record.family || null,
      found_year: record.found_year,
      found_by: record.found_by || null,
      identified_by: record.identified_by || null,
      status: record.status,
      distance_meters: record.distance_meters,
      merged_from_json: JSON.stringify(mergedFrom),
      gbif_url: gbifEntry?.url || null,
      inat_url: inatEntry?.url || null,
      gbif_key: gbifEntry?.id?.startsWith("gbif-")
        ? gbifEntry.id.slice("gbif-".length)
        : null,
      inat_id: inatEntry?.id?.startsWith("inat-")
        ? inatEntry.id.slice("inat-".length)
        : null
    }
  };

  return {
    docId: mergedId,
    record,
    feature,
    hiddenKeys: [leftKey, rightKey]
  };
}

/**
 * Преобразует документ Firestore в GeoJSON Feature.
 * @param {object} record
 * @param {string} [docId]
 * @returns {object|null}
 */
export function mergedRecordToFeature(record, docId = "") {
  if (!record || !isValidCoordinates(record.coordinates)) {
    return null;
  }

  const mergedFrom = Array.isArray(record.merged_from) ? record.merged_from : [];
  const mergedId = record.merged_id || docId;
  const gbifEntry = mergedFrom.find((entry) => entry.source === "gbif");
  const inatEntry = mergedFrom.find((entry) => entry.source === "inaturalist");

  return {
    type: "Feature",
    id: mergedId,
    geometry: {
      type: "Point",
      coordinates: [record.coordinates[0], record.coordinates[1]]
    },
    properties: {
      source: "merged",
      merged_id: mergedId,
      name_latin: record.name_latin || null,
      name_ru: record.name_ru || null,
      regnum: record.regnum || null,
      family: record.family || null,
      found_year: record.found_year ?? null,
      found_by: record.found_by || null,
      identified_by: record.identified_by || null,
      status: record.status || "LC",
      distance_meters: record.distance_meters ?? null,
      merged_from_json: JSON.stringify(mergedFrom),
      gbif_url: gbifEntry?.url || null,
      inat_url: inatEntry?.url || null,
      gbif_key: gbifEntry?.id?.startsWith("gbif-")
        ? gbifEntry.id.slice("gbif-".length)
        : null,
      inat_id: inatEntry?.id?.startsWith("inat-")
        ? inatEntry.id.slice("inat-".length)
        : null
    }
  };
}

/**
 * Собирает ключи исходных точек для скрытия из списка merged features/records.
 * @param {Array<object>} recordsOrFeatures
 * @returns {string[]}
 */
export function collectHiddenKeysFromMerged(recordsOrFeatures) {
  const keys = new Set();

  (recordsOrFeatures || []).forEach((item) => {
    const mergedFrom =
      item?.merged_from ||
      (typeof item?.properties?.merged_from_json === "string"
        ? (() => {
            try {
              return JSON.parse(item.properties.merged_from_json);
            } catch {
              return [];
            }
          })()
        : []);

    if (!Array.isArray(mergedFrom)) {
      return;
    }

    mergedFrom.forEach((entry) => {
      if (entry?.id) {
        keys.add(String(entry.id));
      }
    });
  });

  return [...keys];
}
