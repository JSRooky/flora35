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
  getCompactLocationFilters,
  locationFiltersNeedProperties
} from "./compactFilterState";
import {
  buildCompactViewportFeatures,
  forEachCompactPointInBounds
} from "./compactPointDisplay";
import { shouldUseCompactDensityGrid } from "./compactGridSettings";

let cachedProcessingMask = null;

function getProcessingMask(table, filters) {
  if (!hasActiveInatProcessingFilters(filters)) {
    return null;
  }

  const filtersKey = JSON.stringify(filters);
  if (
    cachedProcessingMask?.table === table &&
    cachedProcessingMask.filtersKey === filtersKey
  ) {
    return cachedProcessingMask.mask;
  }

  const mask = new Uint8Array(table?.rowCount ?? 0);
  const indices = filterInatTableIndices(table, filters);
  for (let i = 0; i < indices.length; i += 1) {
    mask[indices[i]] = 1;
  }
  cachedProcessingMask = { table, filtersKey, mask };
  return mask;
}

export function buildCompactInatViewportFeatures(map) {
  const table = getInatColumnarTable();
  const processingFilters = getCompactInatProcessingFilters();
  const locationFilters = getCompactLocationFilters();
  const processingMask = getProcessingMask(table, processingFilters);
  const rowCount = table?.rowCount ?? 0;
  const needProperties =
    !shouldUseCompactDensityGrid() || locationFiltersNeedProperties(locationFilters);

  return buildCompactViewportFeatures({
    map,
    source: "inaturalist",
    forEachPoint: (visit) => {
      forEachCompactPointInBounds({
        map,
        source: "inaturalist",
        token: table,
        count: rowCount,
        getLng: (rowIndex) => table.lng[rowIndex],
        getLat: (rowIndex) => table.lat[rowIndex],
        visit: (lng, lat, rowIndex) => {
          if (processingMask && !processingMask[rowIndex]) {
            return;
          }

          if (!needProperties) {
            // Ни один активный фильтр не требует свойств точки — можно
            // отдать координаты в сетку плотности без чтения строк из таблицы.
            visit(lng, lat, rowIndex);
            return;
          }

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
            return;
          }
          visit(lng, lat, rowIndex);
        }
      });
    },
    toPointFeature: (rowIndex) => inatRowToSlimFeature(table, rowIndex)
  });
}
