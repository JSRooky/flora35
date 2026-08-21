import {
  inatRowToSlimFeature,
  readInatFoundYear,
  readInatId,
  readInatNameLatin,
  readInatRegnum
} from "../inaturalist/inatColumnar";
import {
  filterInatTableIndices,
  hasActiveInatProcessingFilters
} from "../inaturalist/inatProcessingFilters";
import { getInatColumnarTable } from "../inaturalist/inatStore";
import { getOverlayEntry } from "../names/nameRuCache";
import {
  compactPropertiesMatchFilters,
  getCompactInatProcessingFilters,
  getCompactLocationFilters
} from "./compactFilterState";
import { buildCompactViewportFeatures } from "./compactPointDisplay";

export function buildCompactInatViewportFeatures(map) {
  const table = getInatColumnarTable();
  const processingFilters = getCompactInatProcessingFilters();
  const locationFilters = getCompactLocationFilters();
  const indices = hasActiveInatProcessingFilters(processingFilters)
    ? filterInatTableIndices(table, processingFilters)
    : null;
  const rowCount = table?.rowCount ?? 0;

  return buildCompactViewportFeatures({
    map,
    source: "inaturalist",
    forEachPoint: (visit) => {
      const n = indices ? indices.length : rowCount;
      for (let i = 0; i < n; i += 1) {
        const rowIndex = indices ? indices[i] : i;
        const lng = table.lng[rowIndex];
        const lat = table.lat[rowIndex];
        const nameLatin = readInatNameLatin(table, rowIndex);
        const overlayEntry = nameLatin ? getOverlayEntry(nameLatin) : undefined;
        const id = readInatId(table, rowIndex);
        const properties = {
          inat_id: id,
          id: `inat-${id}`,
          regnum: readInatRegnum(table, rowIndex),
          found_year: readInatFoundYear(table, rowIndex),
          name_latin: nameLatin,
          name_ru: overlayEntry?.nameRu ?? null
        };
        if (!compactPropertiesMatchFilters(properties, lng, lat, locationFilters)) {
          continue;
        }
        visit(lng, lat, rowIndex);
      }
    },
    toPointFeature: (rowIndex) => inatRowToSlimFeature(table, rowIndex)
  });
}
