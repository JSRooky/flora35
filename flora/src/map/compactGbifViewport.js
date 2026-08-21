import {
  gbifRowToSlimFeature,
  readGbifFoundYear,
  readGbifKey,
  readGbifNameLatin,
  readGbifRegnum
} from "../gbif/gbifColumnar";
import {
  filterGbifTableIndices,
  hasActiveGbifProcessingFilters
} from "../gbif/gbifProcessingFilters";
import { getGbifColumnarTable } from "../gbif/gbifStore";
import { getOverlayEntry } from "../names/nameRuCache";
import {
  compactPropertiesMatchFilters,
  getCompactGbifProcessingFilters,
  getCompactLocationFilters
} from "./compactFilterState";
import { buildCompactViewportFeatures } from "./compactPointDisplay";

export function buildCompactGbifViewportFeatures(map) {
  const table = getGbifColumnarTable();
  const processingFilters = getCompactGbifProcessingFilters();
  const locationFilters = getCompactLocationFilters();
  const indices = hasActiveGbifProcessingFilters(processingFilters)
    ? filterGbifTableIndices(table, processingFilters)
    : null;
  const rowCount = table?.rowCount ?? 0;

  return buildCompactViewportFeatures({
    map,
    source: "gbif",
    forEachPoint: (visit) => {
      const n = indices ? indices.length : rowCount;
      for (let i = 0; i < n; i += 1) {
        const rowIndex = indices ? indices[i] : i;
        const lng = table.lng[rowIndex];
        const lat = table.lat[rowIndex];
        const nameLatin = readGbifNameLatin(table, rowIndex);
        const overlayEntry = nameLatin ? getOverlayEntry(nameLatin) : undefined;
        const key = readGbifKey(table, rowIndex);
        const properties = {
          gbif_key: key,
          id: `gbif-${key}`,
          regnum: readGbifRegnum(table, rowIndex),
          found_year: readGbifFoundYear(table, rowIndex),
          name_latin: nameLatin,
          name_ru: overlayEntry?.nameRu ?? null
        };
        if (!compactPropertiesMatchFilters(properties, lng, lat, locationFilters)) {
          continue;
        }
        visit(lng, lat, rowIndex);
      }
    },
    toPointFeature: (rowIndex) => gbifRowToSlimFeature(table, rowIndex)
  });
}
