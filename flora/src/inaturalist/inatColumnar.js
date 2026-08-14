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
  copyUint8,
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
  resizeUint8,
  writeNumericId
} from "../externalSources/columnarSnapshot";

export const INAT_COLUMNAR_VERSION = 2;

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

function createInatTable(rowCapacity = 0) {
  return {
    format: COLUMNAR_FORMAT,
    rowCount: 0,
    lng: new Float64Array(rowCapacity),
    lat: new Float64Array(rowCapacity),
    inat_id: new Float64Array(rowCapacity),
    inat_id_alt: createCodedColumn(rowCapacity),
    taxon_id: new Float64Array(rowCapacity),
    found_year: new Int16Array(rowCapacity),
    found_month: new Int8Array(rowCapacity),
    obscured: new Uint8Array(rowCapacity),
    name_latin: createCodedColumn(rowCapacity),
    family: createCodedColumn(rowCapacity),
    found_by: createCodedColumn(rowCapacity),
    quality_grade: createCodedColumn(rowCapacity),
    place_guess: createCodedColumn(rowCapacity),
    license_code: createCodedColumn(rowCapacity),
    uri: createCodedColumn(rowCapacity),
    regnum: createCodedColumn(rowCapacity),
    region_id: createCodedColumn(rowCapacity)
  };
}

function ensureInatCapacity(table, needed) {
  const capacity = table.lng.length;
  if (needed <= capacity) {
    return table;
  }

  const next = nextCapacity(capacity, needed);
  table.lng = resizeFloat64(table.lng, next);
  table.lat = resizeFloat64(table.lat, next);
  table.inat_id = resizeFloat64(table.inat_id, next);
  codedResize(table.inat_id_alt, next);
  table.taxon_id = resizeFloat64(table.taxon_id, next);
  table.found_year = resizeInt16(table.found_year, next);
  table.found_month = resizeInt8(table.found_month, next);
  table.obscured = resizeUint8(table.obscured, next);
  codedResize(table.name_latin, next);
  codedResize(table.family, next);
  codedResize(table.found_by, next);
  codedResize(table.quality_grade, next);
  codedResize(table.place_guess, next);
  codedResize(table.license_code, next);
  codedResize(table.uri, next);
  codedResize(table.regnum, next);
  codedResize(table.region_id, next);
  return table;
}

export function writeInatFeatureRow(table, rowIndex, feature) {
  const coordinates = getCoordinates(feature);
  if (!coordinates) {
    return false;
  }

  const props = feature.properties ?? {};
  table.lng[rowIndex] = coordinates[0];
  table.lat[rowIndex] = coordinates[1];
  writeNumericId(table.inat_id, table.inat_id_alt, rowIndex, props.inat_id);
  table.taxon_id[rowIndex] = encodeNullableFloat64(props.taxon_id);
  table.found_year[rowIndex] = encodeYear(props.found_year);
  table.found_month[rowIndex] = encodeMonth(props.found_month);
  table.obscured[rowIndex] = props.obscured ? 1 : 0;
  codedWrite(table.name_latin, rowIndex, props.name_latin);
  codedWrite(table.family, rowIndex, props.family);
  codedWrite(table.found_by, rowIndex, props.found_by);
  codedWrite(table.quality_grade, rowIndex, props.quality_grade);
  codedWrite(table.place_guess, rowIndex, props.place_guess);
  codedWrite(table.license_code, rowIndex, props.license_code);
  const defaultUrl = `https://www.inaturalist.org/observations/${props.inat_id}`;
  const customUrl =
    props.inat_url && props.inat_url !== defaultUrl ? props.inat_url : null;
  codedWrite(table.uri, rowIndex, customUrl);
  codedWrite(table.regnum, rowIndex, props.regnum);
  codedWrite(table.region_id, rowIndex, props.region_id);
  return true;
}

export function readInatId(table, rowIndex) {
  return readNumericId(table.inat_id, table.inat_id_alt, rowIndex);
}

export function readInatNameLatin(table, rowIndex) {
  return codedRead(table.name_latin, rowIndex);
}

export function readInatFamily(table, rowIndex) {
  return codedRead(table.family, rowIndex);
}

export function readInatRegnum(table, rowIndex) {
  return codedRead(table.regnum, rowIndex);
}

export function readInatRegionId(table, rowIndex) {
  return codedRead(table.region_id, rowIndex);
}

export function collectInatRegionIds(table) {
  const ids = new Set();
  const rowCount = table?.rowCount ?? 0;
  for (let i = 0; i < rowCount; i += 1) {
    const regionId = readInatRegionId(table, i);
    if (regionId) {
      ids.add(regionId);
    }
  }
  return ids;
}

export function fillUniformMissingInatRegionId(table, regionId) {
  if (!table || !regionId) {
    return table;
  }

  const n = table.rowCount ?? 0;
  if (n === 0 || !table.region_id) {
    return table;
  }

  for (let i = 0; i < n; i += 1) {
    if (readInatRegionId(table, i)) {
      return table;
    }
  }

  for (let i = 0; i < n; i += 1) {
    codedWrite(table.region_id, i, regionId);
  }
  return table;
}

export function readInatFoundYear(table, rowIndex) {
  return decodeYear(table.found_year[rowIndex]);
}

export function readInatFoundMonth(table, rowIndex) {
  return decodeMonth(table.found_month[rowIndex]);
}

function resolveInatUrl(table, rowIndex, id) {
  return (
    codedRead(table.uri, rowIndex) ??
    `https://www.inaturalist.org/observations/${id}`
  );
}

export function inatRowToFeature(table, rowIndex, { nameRu = null } = {}) {
  const id = readInatId(table, rowIndex);
  return {
    type: "Feature",
    id: `inat-${id}`,
    geometry: {
      type: "Point",
      coordinates: [table.lng[rowIndex], table.lat[rowIndex]]
    },
    properties: {
      source: "inaturalist",
      inat_id: id,
      name_latin: readInatNameLatin(table, rowIndex),
      name_ru: nameRu,
      taxon_id: decodeNullableFloat64(table.taxon_id[rowIndex]),
      regnum: readInatRegnum(table, rowIndex),
      family: readInatFamily(table, rowIndex),
      found_year: readInatFoundYear(table, rowIndex),
      found_month: readInatFoundMonth(table, rowIndex),
      found_by: codedRead(table.found_by, rowIndex),
      quality_grade: codedRead(table.quality_grade, rowIndex),
      place_guess: codedRead(table.place_guess, rowIndex),
      license_code: codedRead(table.license_code, rowIndex),
      obscured: Boolean(table.obscured[rowIndex]),
      inat_url: resolveInatUrl(table, rowIndex, id),
      region_id: readInatRegionId(table, rowIndex)
    }
  };
}

export function inatRowToSlimFeature(table, rowIndex, { nameRu = null } = {}) {
  const id = readInatId(table, rowIndex);
  const properties = {
    source: "inaturalist",
    inat_id: id
  };

  const regnum = readInatRegnum(table, rowIndex);
  if (regnum) {
    properties.regnum = regnum;
  }

  const foundYear = readInatFoundYear(table, rowIndex);
  if (foundYear != null) {
    properties.found_year = foundYear;
  }

  const nameLatin = readInatNameLatin(table, rowIndex);
  if (nameLatin) {
    properties.name_latin = nameLatin;
  }

  if (nameRu) {
    properties.name_ru = nameRu;
  }

  return {
    type: "Feature",
    id: `inat-${id}`,
    geometry: {
      type: "Point",
      coordinates: [table.lng[rowIndex], table.lat[rowIndex]]
    },
    properties
  };
}

export function decodeInatFeatures(table, rowIndices = null) {
  const indices = rowIndices ?? allRowIndices(table?.rowCount ?? 0);
  const features = new Array(indices.length);
  for (let i = 0; i < indices.length; i += 1) {
    features[i] = inatRowToFeature(table, indices[i]);
  }
  return features;
}

export function encodeInatFeatures(features) {
  const list = Array.isArray(features) ? features : [];
  const table = createInatTable(list.length);
  let rowCount = 0;

  for (let i = 0; i < list.length; i += 1) {
    const feature = list[i];
    const id = feature?.properties?.inat_id;
    if (id == null || id === "") {
      continue;
    }
    if (writeInatFeatureRow(table, rowCount, feature)) {
      rowCount += 1;
    }
  }

  table.rowCount = rowCount;
  return table;
}

export function buildInatIdIndex(table) {
  const idToIndex = new Map();
  const rowCount = table?.rowCount ?? 0;
  for (let i = 0; i < rowCount; i += 1) {
    const id = readInatId(table, i);
    if (id != null && id !== "") {
      idToIndex.set(String(id), i);
    }
  }
  return idToIndex;
}

export function upsertInatFeaturesIntoTable(table, idToIndex, features) {
  const nextTable = table ?? createInatTable();
  const nextIndex = idToIndex ?? buildInatIdIndex(nextTable);
  const list = Array.isArray(features) ? features : [];
  let added = 0;
  let updated = 0;
  const toAdd = [];

  for (let i = 0; i < list.length; i += 1) {
    const feature = list[i];
    const id = feature?.properties?.inat_id;
    if (id == null || id === "") {
      continue;
    }
    if (!getCoordinates(feature)) {
      continue;
    }

    const existing = nextIndex.get(String(id));
    if (existing == null) {
      toAdd.push(feature);
      added += 1;
    } else {
      writeInatFeatureRow(nextTable, existing, feature);
      updated += 1;
    }
  }

  if (toAdd.length > 0) {
    ensureInatCapacity(nextTable, nextTable.rowCount + toAdd.length);
    let rowIndex = nextTable.rowCount;
    for (let i = 0; i < toAdd.length; i += 1) {
      const feature = toAdd[i];
      writeInatFeatureRow(nextTable, rowIndex, feature);
      nextIndex.set(String(feature.properties.inat_id), rowIndex);
      rowIndex += 1;
    }
    nextTable.rowCount = rowIndex;
  }

  return { table: nextTable, idToIndex: nextIndex, added, updated };
}

export function compactInatTable(table) {
  const n = table?.rowCount ?? 0;
  const persistAlt = !isCodedUnused(table.inat_id_alt, n);
  const persistUri = !isCodedUnused(table.uri, n);

  return {
    format: COLUMNAR_FORMAT,
    rowCount: n,
    lng: table.lng.slice(0, n),
    lat: table.lat.slice(0, n),
    inat_id: table.inat_id.slice(0, n),
    ...(persistAlt ? { inat_id_alt: codedSlice(table.inat_id_alt, n) } : {}),
    taxon_id: table.taxon_id.slice(0, n),
    found_year: table.found_year.slice(0, n),
    found_month: table.found_month.slice(0, n),
    obscured: table.obscured.slice(0, n),
    name_latin: codedSlice(table.name_latin, n),
    family: codedSlice(table.family, n),
    found_by: codedSlice(table.found_by, n),
    quality_grade: codedSlice(table.quality_grade, n),
    place_guess: codedSlice(table.place_guess, n),
    license_code: codedSlice(table.license_code, n),
    ...(persistUri ? { uri: codedSlice(table.uri, n) } : {}),
    regnum: codedSlice(table.regnum, n),
    region_id: codedSlice(table.region_id, n)
  };
}

export function hydrateInatTable(persisted) {
  const n = persisted?.rowCount ?? persisted?.lng?.length ?? 0;
  return {
    format: COLUMNAR_FORMAT,
    rowCount: n,
    lng: copyFloat64(persisted?.lng, n),
    lat: copyFloat64(persisted?.lat, n),
    inat_id: copyFloat64(persisted?.inat_id, n),
    inat_id_alt: codedHydrate(persisted?.inat_id_alt, n),
    taxon_id: copyFloat64(persisted?.taxon_id, n),
    found_year: copyInt16(persisted?.found_year, n),
    found_month: copyInt8(persisted?.found_month, n),
    obscured: copyUint8(persisted?.obscured, n),
    name_latin: codedHydrate(persisted?.name_latin, n),
    family: codedHydrate(persisted?.family, n),
    found_by: codedHydrate(persisted?.found_by, n),
    quality_grade: codedHydrate(persisted?.quality_grade, n),
    place_guess: codedHydrate(persisted?.place_guess, n),
    license_code: codedHydrate(persisted?.license_code, n),
    uri: codedHydrate(persisted?.uri, n),
    regnum: codedHydrate(persisted?.regnum, n),
    region_id: codedHydrate(persisted?.region_id, n)
  };
}

export function inatTablePackedBytes(table) {
  const n = table?.rowCount ?? 0;
  if (n === 0) {
    return 0;
  }

  return (
    n * 8 * 3 +
    n * 2 +
    n * 2 +
    codedBytes(table.inat_id_alt, n) +
    codedBytes(table.name_latin, n) +
    codedBytes(table.family, n) +
    codedBytes(table.found_by, n) +
    codedBytes(table.quality_grade, n) +
    codedBytes(table.place_guess, n) +
    codedBytes(table.license_code, n) +
    codedBytes(table.uri, n) +
    codedBytes(table.regnum, n) +
    codedBytes(table.region_id, n)
  );
}

export function foldInatYearBounds(table, bounds) {
  let { min, max, any } = bounds;
  const rowCount = table?.rowCount ?? 0;

  for (let i = 0; i < rowCount; i += 1) {
    const year = readInatFoundYear(table, i);
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

export function createEmptyInatTable() {
  return createInatTable(0);
}

export function isInatColumnarTable(value) {
  return Boolean(
    value &&
      value.format === COLUMNAR_FORMAT &&
      typeof value.rowCount === "number" &&
      value.lng &&
      value.inat_id
  );
}
