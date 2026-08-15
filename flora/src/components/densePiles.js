import { getFeatureCoordinates } from "./spreadCoincidentPoints";
import { DEFAULT_POINT_COLOR, getPointColorForRegnum } from "./pointColors";

/** Минимум точек с полностью одинаковыми координатами для сверхплотного кластера (по умолчанию). */
export const MIN_DENSE_PILE_SIZE = 10;
export const DENSE_PILE_MIN_SIZE_MIN = 2;
export const DENSE_PILE_MIN_SIZE_MAX = 50;

let densePileMinSize = MIN_DENSE_PILE_SIZE;

/** Текущий порог «плотной группы». */
export function getDensePileMinSize() {
  return densePileMinSize;
}

/** Задаёт порог «плотной группы» (кламп в [min, max]). */
export function setDensePileMinSize(value) {
  const numeric = Math.round(Number(value));
  if (!Number.isFinite(numeric)) {
    return densePileMinSize;
  }

  densePileMinSize = Math.min(
    DENSE_PILE_MIN_SIZE_MAX,
    Math.max(DENSE_PILE_MIN_SIZE_MIN, numeric)
  );
  return densePileMinSize;
}

let hiddenDensePileKeys = new Set();

/** Ключи плотных групп, скрытых с карты из списка обработки. */
export function setHiddenDensePileKeys(keys) {
  hiddenDensePileKeys = new Set((keys ?? []).map(String).filter(Boolean));
}

export function isDensePileHidden(key) {
  return Boolean(key) && hiddenDensePileKeys.has(String(key));
}

export const DENSE_HIGHLIGHT_COLOR = "#ea580c";
export const DENSE_HIGHLIGHT_STROKE_COLOR = "#9a3412";

export const DENSE_PILES_SOURCE_ID = "dense-piles";
export const DENSE_PILES_CLUSTER_LAYER_ID = "dense-piles-clusters";
export const DENSE_PILES_COUNT_LAYER_ID = "dense-piles-count";

export const GBIF_DENSE_PILES_SOURCE_ID = "gbif-dense-piles";
export const GBIF_DENSE_PILES_CLUSTER_LAYER_ID = "gbif-dense-piles-clusters";
export const GBIF_DENSE_PILES_COUNT_LAYER_ID = "gbif-dense-piles-count";

export const INAT_DENSE_PILES_SOURCE_ID = "inat-dense-piles";
export const INAT_DENSE_PILES_CLUSTER_LAYER_ID = "inat-dense-piles-clusters";
export const INAT_DENSE_PILES_COUNT_LAYER_ID = "inat-dense-piles-count";

export const TEMP_DENSE_PILES_SOURCE_ID = "temp-dense-piles";
export const TEMP_DENSE_PILES_CLUSTER_LAYER_ID = "temp-dense-piles-clusters";
export const TEMP_DENSE_PILES_COUNT_LAYER_ID = "temp-dense-piles-count";

/** Ключ по точным координатам точки. */
export function exactCoordKey(lng, lat) {
  return `${lng},${lat}`;
}

function abbreviatePointCount(count) {
  if (count >= 10000) {
    return `${Math.round(count / 1000)}k`;
  }
  if (count >= 1000) {
    return `${Math.round(count / 100) / 10}k`;
  }
  return String(count);
}

/**
 * Делит точки на сверхплотные кластеры и остальные.
 * Сверхплотный кластер — ≥ minSize точек с полностью одинаковыми координатами.
 * Раскрытые кучи возвращаются отдельно (expandedDenseFeatures).
 */
export function partitionFeaturesByDensePiles(
  features,
  { minSize = getDensePileMinSize(), expandedPileKeys = null } = {}
) {
  const groups = new Map();

  (features ?? []).forEach((feature) => {
    const coordinates = getFeatureCoordinates(feature);
    if (!coordinates) {
      return;
    }

    const key = exactCoordKey(coordinates[0], coordinates[1]);
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        coordinates,
        members: []
      });
    }
    groups.get(key).members.push(feature);
  });

  const otherFeatures = [];
  const expandedDenseFeatures = [];
  const denseClusterFeatures = [];
  const densePileMembersById = new Map();

  groups.forEach((group) => {
    const isDense = group.members.length >= minSize;
    const isExpanded = expandedPileKeys?.has(group.key);
    const isHidden = hiddenDensePileKeys.has(group.key);

    if (isHidden) {
      return;
    }

    if (!isDense) {
      // Ключ мог быть раскрыт на другом источнике (локальные/GBIF) —
      // тогда показываем и эти точки, даже если их < minSize.
      if (isExpanded) {
        for (let i = 0; i < group.members.length; i += 1) {
          expandedDenseFeatures.push(group.members[i]);
        }
      } else {
        for (let i = 0; i < group.members.length; i += 1) {
          otherFeatures.push(group.members[i]);
        }
      }
      return;
    }

    const clusterId = `dense-${group.key}`;
    densePileMembersById.set(clusterId, group.members);

    if (isExpanded) {
      for (let i = 0; i < group.members.length; i += 1) {
        expandedDenseFeatures.push(group.members[i]);
      }
      return;
    }

    denseClusterFeatures.push({
      type: "Feature",
      id: clusterId,
      geometry: {
        type: "Point",
        coordinates: group.coordinates
      },
      properties: {
        cluster: true,
        dense_pile: true,
        dense_pile_key: group.key,
        point_count: group.members.length,
        point_count_abbreviated: abbreviatePointCount(group.members.length)
      }
    });
  });

  return {
    otherFeatures,
    expandedDenseFeatures,
    denseClusterFeatures,
    densePileMembersById
  };
}

/**
 * Список всех плотных групп (≥ minSize точек с одинаковыми координатами),
 * по убыванию числа точек. color — цвет точек группы на карте (по regnum).
 */
function densePileItemColor(properties) {
  const markerColor = properties?.temp_marker_color;
  if (typeof markerColor === "string" && markerColor) {
    return markerColor;
  }
  return getPointColorForRegnum(properties?.regnum);
}

function densePileFeatureStableKey(feature, fallback) {
  const properties = feature?.properties ?? {};
  if (properties.gbif_key != null && properties.gbif_key !== "") {
    return `gbif:${properties.gbif_key}`;
  }
  if (properties.inat_id != null && properties.inat_id !== "") {
    return `inat:${properties.inat_id}`;
  }
  if (properties.finding_id != null && properties.finding_id !== "") {
    return `finding:${properties.finding_id}`;
  }
  return fallback;
}

function densePileItemId(properties, key, index) {
  if (properties?.finding_id != null) {
    return `finding-${properties.finding_id}`;
  }
  if (properties?.gbif_key != null) {
    return `gbif-${properties.gbif_key}`;
  }
  if (properties?.inat_id != null) {
    return `inat-${properties.inat_id}`;
  }
  if (properties?.temp_layer_id) {
    return `temp-${properties.temp_layer_id}-${index}`;
  }
  return `member-${key}-${index}`;
}

export function listDensePiles(features, { minSize = getDensePileMinSize() } = {}) {
  const groups = new Map();

  (features ?? []).forEach((feature) => {
    const coordinates = getFeatureCoordinates(feature);
    if (!coordinates) {
      return;
    }

    const key = exactCoordKey(coordinates[0], coordinates[1]);
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        coordinates: [coordinates[0], coordinates[1]],
        members: []
      });
    }

    groups.get(key).members.push(feature);
  });

  return [...groups.values()]
    .filter((group) => group.members.length >= minSize)
    .map(({ key, coordinates, members }) => {
      const colorCounts = new Map();
      const items = members.map((feature, index) => {
        const props = feature.properties ?? {};
        const color = densePileItemColor(props);
        colorCounts.set(color, (colorCounts.get(color) ?? 0) + 1);

        return {
          id: densePileItemId(props, key, index),
          label: props.name_ru || props.name_latin || "Без названия",
          color,
          feature
        };
      });

      let dominantColor = DEFAULT_POINT_COLOR;
      let dominantCount = -1;
      colorCounts.forEach((count, color) => {
        if (count > dominantCount) {
          dominantCount = count;
          dominantColor = color;
        }
      });

      return {
        key,
        coordinates,
        pointCount: members.length,
        color: dominantColor,
        items
      };
    })
    .sort((a, b) => b.pointCount - a.pointCount || a.key.localeCompare(b.key));
}

/**
 * Объединяет списки плотных групп с разных источников (локальные / GBIF) по ключу координат.
 * Важно: каждый входной список уже отфильтрован по minSize внутри своего источника —
 * так в списке не появляются «фантомные» кучи из 5+5 точек, которых нет на карте.
 */
export function mergeDensePileLists(pileLists) {
  const byKey = new Map();

  (pileLists ?? []).forEach((piles) => {
    (piles ?? []).forEach((pile) => {
      if (!pile?.key) {
        return;
      }

      const existing = byKey.get(pile.key);
      if (!existing) {
        byKey.set(pile.key, {
          key: pile.key,
          coordinates: pile.coordinates,
          items: [...(pile.items ?? [])]
        });
        return;
      }

      const extraItems = pile.items ?? [];
      for (let i = 0; i < extraItems.length; i += 1) {
        existing.items.push(extraItems[i]);
      }
    });
  });

  return [...byKey.values()]
    .map(({ key, coordinates, items }) => {
      const seen = new Set();
      const uniqueItems = [];
      items.forEach((item, index) => {
        const stable = densePileFeatureStableKey(
          item?.feature,
          `fallback-${key}-${index}`
        );
        if (seen.has(stable)) {
          return;
        }
        seen.add(stable);
        uniqueItems.push(item);
      });

      const colorCounts = new Map();
      uniqueItems.forEach((item) => {
        const color = item?.color || densePileItemColor(item?.feature?.properties);
        colorCounts.set(color, (colorCounts.get(color) ?? 0) + 1);
      });

      let dominantColor = DEFAULT_POINT_COLOR;
      let dominantCount = -1;
      colorCounts.forEach((count, color) => {
        if (count > dominantCount) {
          dominantCount = count;
          dominantColor = color;
        }
      });

      return {
        key,
        coordinates,
        pointCount: uniqueItems.length,
        color: dominantColor,
        items: uniqueItems
      };
    })
    .sort((a, b) => b.pointCount - a.pointCount || a.key.localeCompare(b.key));
}

/**
 * Сводка уникальных видов по точкам плотной группы (формат как у ООПТ).
 */
export function buildSpeciesSummaryFromDensePile(pile) {
  const speciesByKey = new Map();

  (pile?.items ?? []).forEach((item) => {
    const feature = item?.feature;
    const props = feature?.properties ?? {};
    const nameLatin = props.name_latin;
    const speciesKey = nameLatin || props.name_ru;
    if (!speciesKey || speciesByKey.has(speciesKey)) {
      return;
    }

    speciesByKey.set(speciesKey, {
      nameRu: props.name_ru || "",
      nameLatin: nameLatin || "",
      regnum: props.regnum || "",
      family: props.family || "",
      point: feature
    });
  });

  const species = [...speciesByKey.values()].sort((left, right) => {
    const leftLabel = left.nameRu || left.nameLatin;
    const rightLabel = right.nameRu || right.nameLatin;
    return leftLabel.localeCompare(rightLabel, "ru");
  });

  return {
    count: species.length,
    species
  };
}

export function getDenseClusterCirclePaint() {
  return {
    "circle-color": DENSE_HIGHLIGHT_COLOR,
    "circle-radius": ["step", ["get", "point_count"], 18, 20, 24, 50, 28, 100, 34],
    "circle-stroke-width": 2,
    "circle-stroke-color": DENSE_HIGHLIGHT_STROKE_COLOR
  };
}

/** Удаляет источник и слои сверхплотных кластеров. */
export function removeDensePilesLayers(
  map,
  {
    sourceId,
    clusterLayerId,
    countLayerId
  } = {}
) {
  if (!map?.getStyle?.() || !sourceId || !clusterLayerId || !countLayerId) {
    return;
  }

  [countLayerId, clusterLayerId].forEach((layerId) => {
    if (map.getLayer(layerId)) {
      map.removeLayer(layerId);
    }
  });

  if (map.getSource(sourceId)) {
    map.removeSource(sourceId);
  }
}

/**
 * Создаёт (или пересоздаёт) источник и слои сверхплотных кластеров.
 * Пустой набор features допустим — чтобы потом обновлять через setData.
 */
export function ensureDensePilesLayers(
  map,
  {
    sourceId,
    clusterLayerId,
    countLayerId,
    features = [],
    visibility = "visible"
  } = {}
) {
  if (!map?.getStyle?.() || !sourceId || !clusterLayerId || !countLayerId) {
    return;
  }

  removeDensePilesLayers(map, { sourceId, clusterLayerId, countLayerId });

  map.addSource(sourceId, {
    type: "geojson",
    data: {
      type: "FeatureCollection",
      features
    }
  });

  map.addLayer({
    id: clusterLayerId,
    type: "circle",
    source: sourceId,
    layout: {
      visibility
    },
    paint: getDenseClusterCirclePaint()
  });

  map.addLayer({
    id: countLayerId,
    type: "symbol",
    source: sourceId,
    layout: {
      visibility,
      "text-field": ["get", "point_count_abbreviated"],
      "text-font": ["Open Sans Bold"],
      "text-size": 12
    },
    paint: {
      "text-color": "#ffffff"
    }
  });
}

export function setDensePilesData(map, sourceId, features = []) {
  map?.getSource(sourceId)?.setData({
    type: "FeatureCollection",
    features
  });
}
