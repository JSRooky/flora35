import { getReportSourceLabel } from "./reportSources";

const REPORT_FIELDS = [
  "finding_id",
  "species_id",
  "name_ru",
  "name_latin",
  "regnum",
  "family",
  "status",
  "found_year",
  "found_by",
  "identified_by"
];

function normalizeFinding(feature) {
  const properties = feature.properties ?? {};
  const coordinates = feature.geometry?.coordinates ?? null;

  return {
    finding_id: properties.finding_id ?? feature.id ?? null,
    species_id: properties.species_id ?? null,
    name_ru: properties.name_ru ?? null,
    name_latin: properties.name_latin ?? null,
    regnum: properties.regnum ?? null,
    family: properties.family ?? null,
    status: properties.status ?? null,
    found_year: properties.found_year ?? null,
    found_by: properties.found_by ?? null,
    identified_by: properties.identified_by ?? null,
    coordinates
  };
}

function buildSpeciesCount(findings) {
  const speciesKeys = new Set();

  findings.forEach((finding) => {
    const key = finding.species_id || finding.name_latin;

    if (key) {
      speciesKeys.add(key);
    }
  });

  return speciesKeys.size;
}

function buildRegnumCounts(findings) {
  const counts = {};

  findings.forEach((finding) => {
    const regnum = finding.regnum || "unknown";
    counts[regnum] = (counts[regnum] ?? 0) + 1;
  });

  return counts;
}

function buildFiltersSnapshot(context) {
  const filters = context.locationFilters ?? {};
  const snapshot = {};

  if (filters.status) {
    snapshot.status = filters.status;
  }

  if (filters.found_year) {
    snapshot.found_year = filters.found_year;
  }

  if (filters.regnum) {
    snapshot.regnum = filters.regnum;
  }

  if (filters.name_latin) {
    snapshot.name_latin = filters.name_latin;
  }

  Object.entries(filters).forEach(([key, value]) => {
    if (key.startsWith("__")) {
      return;
    }

    if (snapshot[key] == null && value != null) {
      snapshot[key] = value;
    }
  });

  return snapshot;
}

/** Строит канонический payload отчёта из GeoJSON Feature[] и контекста. */
export function buildReportPayload(sourceId, points, context = {}) {
  const findings = points.map(normalizeFinding);

  return {
    meta: {
      generatedAt: new Date().toISOString(),
      app: "flora35",
      source: sourceId,
      sourceLabel: getReportSourceLabel(sourceId),
      spatialToolLabel: context.spatialToolLabel ?? null,
      dataSourceMode: context.dataSourceMode ?? null,
      filters: buildFiltersSnapshot(context)
    },
    summary: {
      pointCount: findings.length,
      speciesCount: buildSpeciesCount(findings),
      regnumCounts: buildRegnumCounts(findings)
    },
    findings
  };
}

export { REPORT_FIELDS };
