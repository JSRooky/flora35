import {
  formatPropertyValue,
  getPropertyLabel,
  PROPERTY_DISPLAY_ORDER
} from "../featurePropertyLabels";
import { REPORT_FORMATS } from "./reportSources";

const CSV_COLUMNS = [
  { key: "finding_id", label: "ID находки" },
  { key: "species_id", label: "ID вида" },
  ...PROPERTY_DISPLAY_ORDER.map((key) => ({
    key,
    label: getPropertyLabel(key)
  })),
  { key: "lon", label: "Долгота" },
  { key: "lat", label: "Широта" }
];

function escapeCsvValue(value) {
  const stringValue = value == null ? "" : String(value);

  if (/[",\n\r]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  return stringValue;
}

function findingToCsvRow(finding) {
  const [lon, lat] = finding.coordinates ?? [null, null];

  return CSV_COLUMNS.map(({ key }) => {
    if (key === "lon") {
      return lon ?? "";
    }

    if (key === "lat") {
      return lat ?? "";
    }

    const value = finding[key];

    if (["regnum", "status"].includes(key)) {
      return formatPropertyValue(key, value);
    }

    return value ?? "";
  });
}

function findingToGeoJsonFeature(finding) {
  const properties = {
    finding_id: finding.finding_id,
    species_id: finding.species_id,
    name_ru: finding.name_ru,
    name_latin: finding.name_latin,
    regnum: finding.regnum,
    family: finding.family,
    status: finding.status,
    found_year: finding.found_year,
    found_by: finding.found_by,
    identified_by: finding.identified_by
  };

  return {
    type: "Feature",
    id: finding.finding_id ?? undefined,
    geometry: finding.coordinates
      ? {
          type: "Point",
          coordinates: finding.coordinates
        }
      : null,
    properties
  };
}

/** Сериализует payload отчёта в строку выбранного формата. */
export function serializeReport(payload, format) {
  switch (format) {
    case REPORT_FORMATS.CSV: {
      const header = CSV_COLUMNS.map(({ label }) => escapeCsvValue(label)).join(";");
      const rows = payload.findings.map((finding) =>
        findingToCsvRow(finding).map(escapeCsvValue).join(";")
      );

      return `\uFEFF${[header, ...rows].join("\r\n")}`;
    }

    case REPORT_FORMATS.GEOJSON:
      return JSON.stringify(
        {
          type: "FeatureCollection",
          features: payload.findings
            .filter((finding) => finding.coordinates)
            .map(findingToGeoJsonFeature)
        },
        null,
        2
      );

    case REPORT_FORMATS.JSON:
    default:
      return JSON.stringify(payload, null, 2);
  }
}

/** MIME-тип для выбранного формата. */
export function getReportMimeType(format) {
  switch (format) {
    case REPORT_FORMATS.CSV:
      return "text/csv;charset=utf-8";
    case REPORT_FORMATS.GEOJSON:
      return "application/geo+json;charset=utf-8";
    case REPORT_FORMATS.JSON:
    default:
      return "application/json;charset=utf-8";
  }
}

/** Расширение файла для выбранного формата. */
export function getReportFileExtension(format) {
  switch (format) {
    case REPORT_FORMATS.CSV:
      return "csv";
    case REPORT_FORMATS.GEOJSON:
      return "geojson";
    case REPORT_FORMATS.JSON:
    default:
      return "json";
  }
}
