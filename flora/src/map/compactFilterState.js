import { parseFoundYear } from "../components/yearBounds";
import {
  featureMatchesSpeciesSearch,
  SPECIES_SEARCH_FILTER_KEY
} from "../locations/speciesSearchFilter";
import {
  REGION_SPECIES_ALLOWLIST_KEY,
  featureMatchesRegionSpeciesAllowlist
} from "../locations/regionSpeciesAllowlist";
import { booleanPointInPolygon, point } from "@turf/turf";

const WITHIN_KEY = "__withinFeature";
const REQUIRE_YEAR_KEY = "__requireFoundYear";

let locationFilters = {};
let gbifProcessingFilters = null;
let inatProcessingFilters = null;
let hiddenPointKeys = new Set();

export function setCompactLocationFilters(filters) {
  locationFilters = filters && typeof filters === "object" ? filters : {};
}

export function getCompactLocationFilters() {
  return locationFilters;
}

export function setCompactGbifProcessingFilters(filters) {
  gbifProcessingFilters = filters ?? null;
}

export function getCompactGbifProcessingFilters() {
  return gbifProcessingFilters;
}

export function setCompactInatProcessingFilters(filters) {
  inatProcessingFilters = filters ?? null;
}

export function getCompactInatProcessingFilters() {
  return inatProcessingFilters;
}

export function setCompactHiddenPointKeys(keys) {
  hiddenPointKeys = new Set(keys == null ? [] : Array.from(keys, (key) => String(key)));
}

export function hasCompactHiddenPointKeys() {
  return hiddenPointKeys.size > 0;
}

/** Есть ли активные фильтры, для проверки которых нужны свойства точки (не только координаты). */
export function locationFiltersNeedProperties(filters = locationFilters) {
  const f = filters || {};
  return Boolean(
    f[REQUIRE_YEAR_KEY] ||
      f[SPECIES_SEARCH_FILTER_KEY] ||
      f[REGION_SPECIES_ALLOWLIST_KEY] ||
      f.found_year ||
      Object.prototype.hasOwnProperty.call(f, "regnum") ||
      f[WITHIN_KEY] ||
      hasCompactHiddenPointKeys()
  );
}

function matchesRegnum(regnum, value) {
  const normalized =
    regnum == null || String(regnum).trim() === ""
      ? ""
      : String(regnum).toLowerCase();
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return true;
    }
    return value.some((entry) => {
      if (entry === "__none__") {
        return false;
      }
      const allowed = entry == null || entry === "" ? "" : String(entry).toLowerCase();
      return allowed === normalized;
    });
  }
  const allowed = value == null || value === "" ? "" : String(value).toLowerCase();
  return allowed === normalized;
}

export function compactPropertiesMatchFilters(properties, lng, lat, filters = locationFilters) {
  const props = properties ?? {};
  if (props.gbif_key != null && hiddenPointKeys.has(`gbif-${props.gbif_key}`)) {
    return false;
  }
  if (props.inat_id != null && hiddenPointKeys.has(`inat-${props.inat_id}`)) {
    return false;
  }
  if (props.id != null && hiddenPointKeys.has(String(props.id))) {
    return false;
  }

  const requireYear = Boolean(filters[REQUIRE_YEAR_KEY]);
  if (requireYear && parseFoundYear(props.found_year) == null) {
    return false;
  }

  const speciesSearch = filters[SPECIES_SEARCH_FILTER_KEY];
  if (speciesSearch && !featureMatchesSpeciesSearch({ properties: props }, speciesSearch)) {
    return false;
  }

  const regionSpeciesAllowlist = filters[REGION_SPECIES_ALLOWLIST_KEY];
  if (
    regionSpeciesAllowlist &&
    !featureMatchesRegionSpeciesAllowlist({ properties: props }, regionSpeciesAllowlist)
  ) {
    return false;
  }

  const yearRange = filters.found_year;
  if (yearRange && typeof yearRange === "object") {
    const year = parseFoundYear(props.found_year);
    if (year == null) {
      if (requireYear) {
        return false;
      }
    } else {
      if (Number.isFinite(yearRange.min) && year < yearRange.min) {
        return false;
      }
      if (Number.isFinite(yearRange.max) && year > yearRange.max) {
        return false;
      }
    }
  }

  if (Object.prototype.hasOwnProperty.call(filters, "regnum")) {
    if (!matchesRegnum(props.regnum, filters.regnum)) {
      return false;
    }
  }

  const withinFeature = filters[WITHIN_KEY];
  if (withinFeature?.geometry) {
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
      return false;
    }
    if (!booleanPointInPolygon(point([lng, lat]), withinFeature)) {
      return false;
    }
  }

  return true;
}
