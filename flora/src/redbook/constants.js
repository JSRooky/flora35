/** Статус по умолчанию, если в списке не указан. */
export const RED_BOOK_STATUS_NONE = "None";

export const RED_BOOK_LIST_TYPE = "RedBookSpeciesList";

export const RED_BOOK_STORAGE_KEYS = {
  LIST: "flora35-redbook-list",
  MATCHES: "flora35-redbook-matches"
};

/** Известные коды МСОП + None (без регистра). */
export const RED_BOOK_STATUS_CODES = new Set([
  "EX",
  "EW",
  "CR",
  "EN",
  "VU",
  "NT",
  "LC",
  "NONE"
]);
