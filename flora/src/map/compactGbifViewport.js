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
  if (!hasActiveGbifProcessingFilters(filters)) {
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
  const indices = filterGbifTableIndices(table, filters);
  for (let i = 0; i < indices.length; i += 1) {
    mask[indices[i]] = 1;
  }
  cachedProcessingMask = { table, filtersKey, mask };
  return mask;
}

export function buildCompactGbifViewportFeatures(map) {
  const table = getGbifColumnarTable();
  const processingFilters = getCompactGbifProcessingFilters();
  const locationFilters = getCompactLocationFilters();
  const processingMask = getProcessingMask(table, processingFilters);
  const rowCount = table?.rowCount ?? 0;
  // В режиме плотностной сетки свойства точек (название, царство, год, ключ)
  // не попадают в итоговые фичи — считать их для каждой строки на сотнях
  // тысяч точек при каждом pan/zoom бессмысленно, если фильтры их не требуют.
  const needProperties =
    !shouldUseCompactDensityGrid() || locationFiltersNeedProperties(locationFilters);

  return buildCompactViewportFeatures({
    map,
    source: "gbif",
    forEachPoint: (visit) => {
      forEachCompactPointInBounds({
        map,
        source: "gbif",
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
            return;
          }
          visit(lng, lat, rowIndex);
        }
      });
    },
    toPointFeature: (rowIndex) => gbifRowToSlimFeature(table, rowIndex)
  });
}
