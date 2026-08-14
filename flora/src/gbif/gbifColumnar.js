import {
  COLUMNAR_FORMAT,
  allRowIndices,
  codedBytes,
  codedHydrate,
  codedRead,
  codedResize,
  codedSlice,
  codedWrite,
  copyFloat64,
  copyInt16,
  copyInt8,
  createCodedColumn,
  decodeMonth,
  decodeNullableFloat64,
  decodeYear,
  encodeMonth,
  encodeNullableFloat64,
  encodeYear,
  isCodedUnused,
  nextCapacity,
  readNumericId,
  resizeFloat64,
  resizeInt16,
  resizeInt8,
  writeNumericId
} from "../externalSources/columnarSnapshot";

export const GBIF_COLUMNAR_VERSION = 3;

function getCoordinates(feature) {
  const coordinates = feature?.geometry?.coordinates;
  if (
    !Array.isArray(coordinates) ||
    coordinates.length < 2 ||
    !Number.isFinite(coordinates[0]) ||
    !Number.isFinite(coordinates[1])
  ) {
    return null;
  }
  return coordinates;
}

function createGbifTable(rowCapacity = 0) {
  return {
    format: COLUMNAR_FORMAT,
    rowCount: 0,
    lng: new Float64Array(rowCapacity),
    lat: new Float64Array(rowCapacity),
    gbif_key: new Float64Array(rowCapacity),
    gbif_key_alt: createCodedColumn(rowCapacity),
    species_key: new Float64Array(rowCapacity),
    found_year: new Int16Array(rowCapacity),
    found_month: new Int8Array(rowCapacity),
    name_latin: createCodedColumn(rowCapacity),
    family: createCodedColumn(rowCapacity),
    found_by: createCodedColumn(rowCapacity),
    identified_by: createCodedColumn(rowCapacity),
    datasetKey: createCodedColumn(rowCapacity),
    basisOfRecord: createCodedColumn(rowCapacity),
    regnum: createCodedColumn(rowCapacity),
    region_id: createCodedColumn(rowCapacity)
  };
}

function ensureGbifCapacity(table, needed) {
  const capacity = table.lng.length;
  if (needed <= capacity) {
    return table;
  }

  const next = nextCapacity(capacity, needed);
  table.lng = resizeFloat64(table.lng, next);
  table.lat = resizeFloat64(table.lat, next);
  table.gbif_key = resizeFloat64(table.gbif_key, next);
  codedResize(table.gbif_key_alt, next);
  table.species_key = resizeFloat64(table.species_key, next);
  table.found_year = resizeInt16(table.found_year, next);
  table.found_month = resizeInt8(table.found_month, next);
  codedResize(table.name_latin, next);
  codedResize(table.family, next);
  codedResize(table.found_by, next);
  codedResize(table.identified_by, next);
  codedResize(table.datasetKey, next);
  codedResize(table.basisOfRecord, next);
  codedResize(table.regnum, next);
  codedResize(table.region_id, next);
  return table;
}

export function writeGbifFeatureRow(table, rowIndex, feature) {
  const coordinates = getCoordinates(feature);
  if (!coordinates) {
    return false;
  }

  const props = feature.properties ?? {};
  table.lng[rowIndex] = coordinates[0];
  table.lat[rowIndex] = coordinates[1];
  writeNumericId(table.gbif_key, table.gbif_key_alt, rowIndex, props.gbif_key);
  table.species_key[rowIndex] = encodeNullableFloat64(props.species_key);
  table.found_year[rowIndex] = encodeYear(props.found_year);
  table.found_month[rowIndex] = encodeMonth(props.found_month);
  codedWrite(table.name_latin, rowIndex, props.name_latin);
  codedWrite(table.family, rowIndex, props.family);
  codedWrite(table.found_by, rowIndex, props.found_by);
  codedWrite(table.identified_by, rowIndex, props.identified_by);
  codedWrite(table.datasetKey, rowIndex, props.datasetKey);
  codedWrite(table.basisOfRecord, rowIndex, props.basisOfRecord);
  codedWrite(table.regnum, rowIndex, props.regnum);
  codedWrite(table.region_id, rowIndex, props.region_id);
  return true;
}

export function readGbifKey(table, rowIndex) {
  return readNumericId(table.gbif_key, table.gbif_key_alt, rowIndex);
}

export function readGbifNameLatin(table, rowIndex) {
  return codedRead(table.name_latin, rowIndex);
}

export function readGbifFamily(table, rowIndex) {
  return codedRead(table.family, rowIndex);
}

export function readGbifRegnum(table, rowIndex) {
  return codedRead(table.regnum, rowIndex);
}

export function readGbifRegionId(table, rowIndex) {
  return codedRead(table.region_id, rowIndex);
}

export function collectGbifRegionIds(table) {
  const ids = new Set();
  const rowCount = table?.rowCount ?? 0;
  for (let i = 0; i < rowCount; i += 1) {
    const regionId = readGbifRegionId(table, i);
    if (regionId) {
      ids.add(regionId);
    }
  }
  return ids;
}

/** Если ни у одной строки нет region_id, заполняет все fallback-регионом (старые снимки). */
export function fillUniformMissingGbifRegionId(table, regionId) {
  if (!table || !regionId) {
    return table;
  }

  const n = table.rowCount ?? 0;
  if (n === 0 || !table.region_id) {
    return table;
  }

  for (let i = 0; i < n; i += 1) {
    if (readGbifRegionId(table, i)) {
      return table;
    }
  }

  for (let i = 0; i < n; i += 1) {
    codedWrite(table.region_id, i, regionId);
  }
  return table;
}

export function readGbifFoundYear(table, rowIndex) {
  return decodeYear(table.found_year[rowIndex]);
}

export function readGbifFoundMonth(table, rowIndex) {
  return decodeMonth(table.found_month[rowIndex]);
}

export function gbifRowToFeature(table, rowIndex, { nameRu = null } = {}) {
  const key = readGbifKey(table, rowIndex);
  return {
    type: "Feature",
    id: `gbif-${key}`,
    geometry: {
      type: "Point",
      coordinates: [table.lng[rowIndex], table.lat[rowIndex]]
    },
    properties: {
      source: "gbif",
      gbif_key: key,
      name_latin: readGbifNameLatin(table, rowIndex),
      name_ru: nameRu,
      species_key: decodeNullableFloat64(table.species_key[rowIndex]),
      regnum: readGbifRegnum(table, rowIndex),
      family: readGbifFamily(table, rowIndex),
      found_year: readGbifFoundYear(table, rowIndex),
      found_month: readGbifFoundMonth(table, rowIndex),
      found_by: codedRead(table.found_by, rowIndex),
      identified_by: codedRead(table.identified_by, rowIndex),
      datasetKey: codedRead(table.datasetKey, rowIndex),
      basisOfRecord: codedRead(table.basisOfRecord, rowIndex),
      gbif_url: `https://www.gbif.org/occurrence/${key}`,
      region_id: readGbifRegionId(table, rowIndex)
    }
  };
}

/** Урезанный Feature для Mapbox setData. */
export function gbifRowToSlimFeature(table, rowIndex, { nameRu = null } = {}) {
  const key = readGbifKey(table, rowIndex);
  const properties = {
    source: "gbif",
    gbif_key: key
  };

  const regnum = readGbifRegnum(table, rowIndex);
  if (regnum) {
    properties.regnum = regnum;
  }

  const foundYear = readGbifFoundYear(table, rowIndex);
  if (foundYear != null) {
    properties.found_year = foundYear;
  }

  const nameLatin = readGbifNameLatin(table, rowIndex);
  if (nameLatin) {
    properties.name_latin = nameLatin;
  }

  if (nameRu) {
    properties.name_ru = nameRu;
  }

  return {
    type: "Feature",
    id: `gbif-${key}`,
    geometry: {
      type: "Point",
      coordinates: [table.lng[rowIndex], table.lat[rowIndex]]
    },
    properties
  };
}

export function decodeGbifFeatures(table, rowIndices = null) {
  const indices = rowIndices ?? allRowIndices(table?.rowCount ?? 0);
  const features = new Array(indices.length);
  for (let i = 0; i < indices.length; i += 1) {
    features[i] = gbifRowToFeature(table, indices[i]);
  }
  return features;
}

export function encodeGbifFeatures(features) {
  const list = Array.isArray(features) ? features : [];
  const table = createGbifTable(list.length);
  let rowCount = 0;

  for (let i = 0; i < list.length; i += 1) {
    const feature = list[i];
    const key = feature?.properties?.gbif_key;
    if (key == null || key === "") {
      continue;
    }
    if (writeGbifFeatureRow(table, rowCount, feature)) {
      rowCount += 1;
    }
  }

  table.rowCount = rowCount;
  return table;
}

export function buildGbifIdIndex(table) {
  const idToIndex = new Map();
  const rowCount = table?.rowCount ?? 0;
  for (let i = 0; i < rowCount; i += 1) {
    const key = readGbifKey(table, i);
    if (key != null && key !== "") {
      idToIndex.set(String(key), i);
    }
  }
  return idToIndex;
}

export function upsertGbifFeaturesIntoTable(table, idToIndex, features) {
  const nextTable = table ?? createGbifTable();
  const nextIndex = idToIndex ?? buildGbifIdIndex(nextTable);
  const list = Array.isArray(features) ? features : [];
  let added = 0;
  let updated = 0;
  const toAdd = [];

  for (let i = 0; i < list.length; i += 1) {
    const feature = list[i];
    const key = feature?.properties?.gbif_key;
    if (key == null || key === "") {
      continue;
    }
    if (!getCoordinates(feature)) {
      continue;
    }

    const existing = nextIndex.get(String(key));
    if (existing == null) {
      toAdd.push(feature);
      added += 1;
    } else {
      writeGbifFeatureRow(nextTable, existing, feature);
      updated += 1;
    }
  }

  if (toAdd.length > 0) {
    ensureGbifCapacity(nextTable, nextTable.rowCount + toAdd.length);
    let rowIndex = nextTable.rowCount;
    for (let i = 0; i < toAdd.length; i += 1) {
      const feature = toAdd[i];
      writeGbifFeatureRow(nextTable, rowIndex, feature);
      nextIndex.set(String(feature.properties.gbif_key), rowIndex);
      rowIndex += 1;
    }
    nextTable.rowCount = rowIndex;
  }

  return { table: nextTable, idToIndex: nextIndex, added, updated };
}

export function compactGbifTable(table) {
  const n = table?.rowCount ?? 0;
  const persistAlt = !isCodedUnused(table.gbif_key_alt, n);

  return {
    format: COLUMNAR_FORMAT,
    rowCount: n,
    lng: table.lng.slice(0, n),
    lat: table.lat.slice(0, n),
    gbif_key: table.gbif_key.slice(0, n),
    ...(persistAlt ? { gbif_key_alt: codedSlice(table.gbif_key_alt, n) } : {}),
    species_key: table.species_key.slice(0, n),
    found_year: table.found_year.slice(0, n),
    found_month: table.found_month.slice(0, n),
    name_latin: codedSlice(table.name_latin, n),
    family: codedSlice(table.family, n),
    found_by: codedSlice(table.found_by, n),
    identified_by: codedSlice(table.identified_by, n),
    datasetKey: codedSlice(table.datasetKey, n),
    basisOfRecord: codedSlice(table.basisOfRecord, n),
    regnum: codedSlice(table.regnum, n),
    region_id: codedSlice(table.region_id, n)
  };
}

export function hydrateGbifTable(persisted) {
  const n = persisted?.rowCount ?? persisted?.lng?.length ?? 0;
  return {
    format: COLUMNAR_FORMAT,
    rowCount: n,
    lng: copyFloat64(persisted?.lng, n),
    lat: copyFloat64(persisted?.lat, n),
    gbif_key: copyFloat64(persisted?.gbif_key, n),
    gbif_key_alt: codedHydrate(persisted?.gbif_key_alt, n),
    species_key: copyFloat64(persisted?.species_key, n),
    found_year: copyInt16(persisted?.found_year, n),
    found_month: copyInt8(persisted?.found_month, n),
    name_latin: codedHydrate(persisted?.name_latin, n),
    family: codedHydrate(persisted?.family, n),
    found_by: codedHydrate(persisted?.found_by, n),
    identified_by: codedHydrate(persisted?.identified_by, n),
    datasetKey: codedHydrate(persisted?.datasetKey, n),
    basisOfRecord: codedHydrate(persisted?.basisOfRecord, n),
    regnum: codedHydrate(persisted?.regnum, n),
    region_id: codedHydrate(persisted?.region_id, n)
  };
}

export function gbifTablePackedBytes(table) {
  const n = table?.rowCount ?? 0;
  if (n === 0) {
    return 0;
  }

  return (
    n * 8 * 4 +
    n * 2 +
    n +
    codedBytes(table.gbif_key_alt, n) +
    codedBytes(table.name_latin, n) +
    codedBytes(table.family, n) +
    codedBytes(table.found_by, n) +
    codedBytes(table.identified_by, n) +
    codedBytes(table.datasetKey, n) +
    codedBytes(table.basisOfRecord, n) +
    codedBytes(table.regnum, n) +
    codedBytes(table.region_id, n)
  );
}

export function foldGbifYearBounds(table, bounds) {
  let { min, max, any } = bounds;
  const rowCount = table?.rowCount ?? 0;

  for (let i = 0; i < rowCount; i += 1) {
    const year = readGbifFoundYear(table, i);
    if (year == null) {
      continue;
    }
    if (!any) {
      min = year;
      max = year;
      any = true;
      continue;
    }
    if (year < min) {
      min = year;
    }
    if (year > max) {
      max = year;
    }
  }

  return { min, max, any };
}

export function createEmptyGbifTable() {
  return createGbifTable(0);
}

export function isGbifColumnarTable(value) {
  return Boolean(
    value &&
      value.format === COLUMNAR_FORMAT &&
      typeof value.rowCount === "number" &&
      value.lng &&
      value.gbif_key
  );
}
