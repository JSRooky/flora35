import {
  getGbifColumnarTable
} from "../gbif/gbifStore";
import {
  readGbifFamily,
  readGbifNameLatin,
  readGbifRegionId,
  readGbifRegnum
} from "../gbif/gbifColumnar";
import { getInatColumnarTable } from "../inaturalist/inatStore";
import {
  readInatFamily,
  readInatNameLatin,
  readInatRegionId,
  readInatRegnum
} from "../inaturalist/inatColumnar";
import { getOverlayRussianName } from "../names/nameRuCache";
import { getTempLayers } from "../tempLayers/tempLayerStore";
import { speciesDisplayKey } from "../locations/regionSpeciesAllowlist";

function upsertSpecies(byKey, props) {
  const nameLatin = String(props?.name_latin ?? "").trim();
  const overlayRu = nameLatin ? getOverlayRussianName(nameLatin) : "";
  const nameRu = String(props?.name_ru || overlayRu || "").trim();
  const key = speciesDisplayKey({ nameLatin, nameRu });
  if (!key) {
    return;
  }
  const existing = byKey.get(key);
  if (existing) {
    existing.pointCount += 1;
    if (!existing.nameRu && nameRu) {
      existing.nameRu = nameRu;
    }
    return;
  }
  byKey.set(key, {
    key,
    nameLatin,
    nameRu,
    regnum: String(props?.regnum ?? "").trim(),
    family: String(props?.family ?? "").trim(),
    pointCount: 1
  });
}

function scanColumnarTable({ table, rowCount, readRegionId, readNameLatin, readRegnum, readFamily, regionId, byKey }) {
  if (!table || !rowCount) {
    return;
  }
  const wanted = String(regionId || "");
  for (let index = 0; index < rowCount; index += 1) {
    const rowRegion = readRegionId(table, index);
    if (wanted && rowRegion && String(rowRegion) !== wanted) {
      continue;
    }
    if (wanted && !rowRegion) {
      continue;
    }
    upsertSpecies(byKey, {
      name_latin: readNameLatin(table, index),
      regnum: readRegnum(table, index),
      family: readFamily(table, index)
    });
  }
}

function collectTempLayerSpecies(layerIds, regionId, byKey) {
  const wantedIds = new Set((layerIds || []).map(String).filter(Boolean));
  const wantedRegion = String(regionId || "");
  getTempLayers().forEach((layer) => {
    if (wantedIds.size > 0 && !wantedIds.has(String(layer.id))) {
      return;
    }
    const layerRegionIds = (layer.regionIds || []).map(String);
    const layerIsThisRegion =
      !wantedRegion ||
      layerRegionIds.length === 0 ||
      layerRegionIds.includes(wantedRegion);
    (layer.features || []).forEach((feature) => {
      const featureRegion = String(feature?.properties?.region_id || "");
      if (wantedRegion && featureRegion && featureRegion !== wantedRegion) {
        return;
      }
      if (wantedRegion && !featureRegion && !layerIsThisRegion) {
        return;
      }
      upsertSpecies(byKey, feature?.properties);
    });
  });
}

/**
 * Уникальные виды загруженного региона (без выкладки всех точек на карту).
 */
export function buildRegionSpeciesInventory({
  regionId,
  layerIds = [],
  mode = "external"
} = {}) {
  const byKey = new Map();
  if (mode === "temp") {
    collectTempLayerSpecies(layerIds, regionId, byKey);
  } else {
    const gbifTable = getGbifColumnarTable();
    scanColumnarTable({
      table: gbifTable,
      rowCount: gbifTable?.rowCount ?? 0,
      readRegionId: readGbifRegionId,
      readNameLatin: readGbifNameLatin,
      readRegnum: readGbifRegnum,
      readFamily: readGbifFamily,
      regionId,
      byKey
    });
    const inatTable = getInatColumnarTable();
    scanColumnarTable({
      table: inatTable,
      rowCount: inatTable?.rowCount ?? 0,
      readRegionId: readInatRegionId,
      readNameLatin: readInatNameLatin,
      readRegnum: readInatRegnum,
      readFamily: readInatFamily,
      regionId,
      byKey
    });
  }

  return [...byKey.values()].sort((left, right) => {
    const leftLabel = left.nameRu || left.nameLatin;
    const rightLabel = right.nameRu || right.nameLatin;
    return leftLabel.localeCompare(rightLabel, "ru");
  });
}
