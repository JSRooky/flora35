/** Формат колоночного снимка IndexedDB / in-memory store. */
export const COLUMNAR_FORMAT = "columnar-v1";

/** Индекс 0 в словаре строк всегда означает null. */
export const STRING_NULL_INDEX = 0;

/** Sentinel: год не задан. */
export const YEAR_NULL = 0;

/** Sentinel: месяц не задан (валидные значения 1–12). */
export const MONTH_NULL = 0;

function codedCtorForDictSize(dictLength) {
  if (dictLength <= 256) {
    return Uint8Array;
  }
  if (dictLength <= 65536) {
    return Uint16Array;
  }
  return Uint32Array;
}

function upgradeCodes(codes, Ctor) {
  if (codes instanceof Ctor) {
    return codes;
  }
  return Ctor.from(codes);
}

/**
 * Колонка строк: словарь + индексы. dict[0] = null.
 * `lookup` только в памяти, в IndexedDB не пишем.
 */
export function createCodedColumn(rowCapacity = 0) {
  return {
    dict: [null],
    codes: new Uint8Array(rowCapacity),
    lookup: new Map()
  };
}

function ensureCodeWidth(column, dictIndex) {
  const Ctor = codedCtorForDictSize(dictIndex + 1);
  column.codes = upgradeCodes(column.codes, Ctor);
}

export function codedRead(column, rowIndex) {
  if (!column?.codes || rowIndex < 0 || rowIndex >= column.codes.length) {
    return null;
  }

  const dictIndex = column.codes[rowIndex];
  if (!dictIndex) {
    return null;
  }

  return column.dict[dictIndex] ?? null;
}

export function codedWrite(column, rowIndex, value) {
  if (value == null || value === "") {
    column.codes[rowIndex] = STRING_NULL_INDEX;
    return;
  }

  const text = String(value);
  let dictIndex = column.lookup.get(text);
  if (dictIndex == null) {
    dictIndex = column.dict.length;
    column.dict.push(text);
    column.lookup.set(text, dictIndex);
    ensureCodeWidth(column, dictIndex);
  }

  column.codes[rowIndex] = dictIndex;
}

export function codedResize(column, newCapacity) {
  const Ctor = column.codes.constructor;
  const next = new Ctor(newCapacity);
  const copyLength = Math.min(column.codes.length, newCapacity);
  if (copyLength > 0) {
    next.set(column.codes.subarray(0, copyLength));
  }
  column.codes = next;
  return column;
}

/** Форма для IndexedDB: без lookup, коды обрезаны по rowCount. */
export function codedSlice(column, rowCount) {
  if (!column) {
    return null;
  }

  return {
    dict: column.dict,
    codes: column.codes.slice(0, rowCount)
  };
}

export function isCodedUnused(column, rowCount) {
  if (!column?.codes) {
    return true;
  }

  const limit = Math.min(rowCount, column.codes.length);
  for (let i = 0; i < limit; i += 1) {
    if (column.codes[i]) {
      return false;
    }
  }

  return true;
}

export function codedHydrate(persisted, rowCapacity = 0) {
  const dict = Array.isArray(persisted?.dict) ? persisted.dict.slice() : [null];
  if (dict.length === 0 || dict[0] != null) {
    dict.unshift(null);
  }

  const src = persisted?.codes;
  const capacity = Math.max(rowCapacity, src?.length ?? 0);
  let codes;
  if (
    src instanceof Uint8Array ||
    src instanceof Uint16Array ||
    src instanceof Uint32Array
  ) {
    const Ctor = src.constructor;
    codes = capacity === src.length ? src : new Ctor(capacity);
    if (codes !== src) {
      codes.set(src);
    }
  } else if (Array.isArray(src) && src.length > 0) {
    const Ctor = codedCtorForDictSize(dict.length);
    codes = Ctor.from(src);
    if (codes.length < capacity) {
      const grown = new Ctor(capacity);
      grown.set(codes);
      codes = grown;
    }
  } else {
    codes = new Uint8Array(capacity);
  }

  const lookup = new Map();
  for (let i = 1; i < dict.length; i += 1) {
    if (dict[i] != null && dict[i] !== "") {
      lookup.set(String(dict[i]), i);
    }
  }

  return { dict, codes, lookup };
}

export function encodeCodedColumn(values) {
  const column = createCodedColumn(values.length);
  for (let i = 0; i < values.length; i += 1) {
    codedWrite(column, i, values[i]);
  }
  return column;
}

export function codedBytes(column, rowCount) {
  if (!column?.codes) {
    return 0;
  }

  let bytes = column.codes.BYTES_PER_ELEMENT * rowCount;
  for (let i = 1; i < column.dict.length; i += 1) {
    const value = column.dict[i];
    if (typeof value === "string") {
      bytes += value.length * 2;
    }
  }
  return bytes;
}

export function resizeFloat64(source, newCapacity) {
  const next = new Float64Array(newCapacity);
  const copyLength = Math.min(source.length, newCapacity);
  if (copyLength > 0) {
    next.set(source.subarray(0, copyLength));
  }
  return next;
}

export function resizeInt16(source, newCapacity) {
  const next = new Int16Array(newCapacity);
  const copyLength = Math.min(source.length, newCapacity);
  if (copyLength > 0) {
    next.set(source.subarray(0, copyLength));
  }
  return next;
}

export function resizeInt8(source, newCapacity) {
  const next = new Int8Array(newCapacity);
  const copyLength = Math.min(source.length, newCapacity);
  if (copyLength > 0) {
    next.set(source.subarray(0, copyLength));
  }
  return next;
}

export function resizeUint8(source, newCapacity) {
  const next = new Uint8Array(newCapacity);
  const copyLength = Math.min(source.length, newCapacity);
  if (copyLength > 0) {
    next.set(source.subarray(0, copyLength));
  }
  return next;
}

export function copyFloat64(source, rowCount) {
  if (source instanceof Float64Array && source.length === rowCount) {
    return source;
  }
  const next = new Float64Array(rowCount);
  if (source && source.length) {
    next.set(
      source.subarray
        ? source.subarray(0, Math.min(source.length, rowCount))
        : Float64Array.from(source).subarray(0, Math.min(source.length, rowCount))
    );
  }
  return next;
}

export function copyInt16(source, rowCount) {
  if (source instanceof Int16Array && source.length === rowCount) {
    return source;
  }
  const next = new Int16Array(rowCount);
  if (source && source.length) {
    const length = Math.min(source.length, rowCount);
    for (let i = 0; i < length; i += 1) {
      next[i] = source[i];
    }
  }
  return next;
}

export function copyInt8(source, rowCount) {
  if (source instanceof Int8Array && source.length === rowCount) {
    return source;
  }
  const next = new Int8Array(rowCount);
  if (source && source.length) {
    const length = Math.min(source.length, rowCount);
    for (let i = 0; i < length; i += 1) {
      next[i] = source[i];
    }
  }
  return next;
}

export function copyUint8(source, rowCount) {
  if (source instanceof Uint8Array && source.length === rowCount) {
    return source;
  }
  const next = new Uint8Array(rowCount);
  if (source && source.length) {
    const length = Math.min(source.length, rowCount);
    for (let i = 0; i < length; i += 1) {
      next[i] = source[i];
    }
  }
  return next;
}

export function encodeYear(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value === 0) {
    return YEAR_NULL;
  }
  return Math.trunc(value);
}

export function decodeYear(value) {
  return value === YEAR_NULL ? null : value;
}

export function encodeMonth(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return MONTH_NULL;
  }
  const month = Math.trunc(value);
  if (month < 1 || month > 12) {
    return MONTH_NULL;
  }
  return month;
}

export function decodeMonth(value) {
  return value === MONTH_NULL ? null : value;
}

export function encodeNullableFloat64(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : Number.NaN;
}

export function decodeNullableFloat64(value) {
  return Number.isFinite(value) ? value : null;
}

export function writeNumericId(nums, altColumn, rowIndex, value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    nums[rowIndex] = value;
    if (altColumn) {
      codedWrite(altColumn, rowIndex, null);
    }
    return;
  }

  if (value == null || value === "") {
    nums[rowIndex] = Number.NaN;
    if (altColumn) {
      codedWrite(altColumn, rowIndex, null);
    }
    return;
  }

  const numeric = Number(value);
  if (typeof value === "string" && Number.isFinite(numeric) && String(numeric) === value) {
    nums[rowIndex] = numeric;
    if (altColumn) {
      codedWrite(altColumn, rowIndex, null);
    }
    return;
  }

  nums[rowIndex] = Number.NaN;
  if (altColumn) {
    codedWrite(altColumn, rowIndex, String(value));
  }
}

export function readNumericId(nums, altColumn, rowIndex) {
  const alt = altColumn ? codedRead(altColumn, rowIndex) : null;
  if (alt != null) {
    return alt;
  }

  const numeric = nums[rowIndex];
  return Number.isFinite(numeric) ? numeric : null;
}

export function nextCapacity(currentLength, needed) {
  if (needed <= currentLength) {
    return currentLength;
  }
  const grown = Math.max(needed, Math.ceil((currentLength || 0) * 1.5));
  return grown;
}

export function allRowIndices(rowCount) {
  const indices = new Array(rowCount);
  for (let i = 0; i < rowCount; i += 1) {
    indices[i] = i;
  }
  return indices;
}
