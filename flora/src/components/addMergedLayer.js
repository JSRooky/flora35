import {
  DEFAULT_POINT_COLOR,
  REGNUM_COLORS
} from "./pointColors";
import { safeQueryRenderedFeatures } from "./safeQueryRenderedFeatures";
import pairedPinUrl from "../images/paired_pin.svg";

export const MERGED_SOURCE_ID = "merged-locations";
export const MERGED_UNCLUSTERED_LAYER_ID = "merged-unclustered";

const EMPTY_FEATURE_COLLECTION = {
  type: "FeatureCollection",
  features: []
};

const PAIRED_PIN_DEFAULT_FILL = "#e51e1e";
const PAIRED_PIN_IMAGE_SIZE_PX = 64;
const PAIRED_PIN_PIXEL_RATIO = 2;

const MERGED_PIN_IMAGE_IDS = {
  plantae: "merged-paired-pin-plantae",
  animalia: "merged-paired-pin-animalia",
  fungi: "merged-paired-pin-fungi",
  protozoa: "merged-paired-pin-protozoa",
  default: "merged-paired-pin-default"
};

/** @type {GeoJSON.FeatureCollection} */
let mergedCollection = EMPTY_FEATURE_COLLECTION;
let layerVisible = true;
let onPointClickCallback = null;
let interactionHandlers = null;
/** @type {Promise<string>|null} */
let pairedPinSvgTemplatePromise = null;
/** @type {WeakMap<object, boolean>} */
const styleImageMissingAttached = new WeakMap();

function applyVisibility(map) {
  if (!map?.getLayer?.(MERGED_UNCLUSTERED_LAYER_ID)) {
    return;
  }

  map.setLayoutProperty(
    MERGED_UNCLUSTERED_LAYER_ID,
    "visibility",
    layerVisible ? "visible" : "none"
  );
}

function attachInteractions(map) {
  if (!map || interactionHandlers) {
    return;
  }

  const handleClick = (event) => {
    const features = safeQueryRenderedFeatures(map, event.point, {
      layers: [MERGED_UNCLUSTERED_LAYER_ID]
    });
    const feature = features?.[0];
    if (!feature) {
      return;
    }

    // Не даём клику «провалиться» в map-background clear (локальный mapClick).
    event.preventDefault?.();
    event.originalEvent?.stopPropagation?.();

    onPointClickCallback?.(feature);
  };

  const handleEnter = () => {
    map.getCanvas().style.cursor = "pointer";
  };

  const handleLeave = () => {
    map.getCanvas().style.cursor = "";
  };

  map.on("click", MERGED_UNCLUSTERED_LAYER_ID, handleClick);
  map.on("mouseenter", MERGED_UNCLUSTERED_LAYER_ID, handleEnter);
  map.on("mouseleave", MERGED_UNCLUSTERED_LAYER_ID, handleLeave);

  interactionHandlers = {
    click: handleClick,
    enter: handleEnter,
    leave: handleLeave
  };
}

function loadPairedPinSvgTemplate() {
  if (!pairedPinSvgTemplatePromise) {
    pairedPinSvgTemplatePromise = fetch(pairedPinUrl).then((response) => {
      if (!response.ok) {
        throw new Error(`Failed to load paired pin SVG: ${response.status}`);
      }
      return response.text();
    });
  }

  return pairedPinSvgTemplatePromise;
}

function colorizePairedPinSvg(svgText, centerColor) {
  const escapedDefaultFill = PAIRED_PIN_DEFAULT_FILL.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
  return svgText.replace(
    new RegExp(`fill:\\s*${escapedDefaultFill}`, "i"),
    `fill:${centerColor}`
  );
}

function svgTextToImage(svgText) {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svgText], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const image = new Image(PAIRED_PIN_IMAGE_SIZE_PX, PAIRED_PIN_IMAGE_SIZE_PX);

    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = (error) => {
      URL.revokeObjectURL(url);
      reject(error);
    };
    image.src = url;
  });
}

function getMergedPinImageEntries() {
  return [
    ...Object.entries(REGNUM_COLORS).map(([regnum, color]) => ({
      id: MERGED_PIN_IMAGE_IDS[regnum] ?? `${MERGED_PIN_IMAGE_IDS.default}-${regnum}`,
      color
    })),
    {
      id: MERGED_PIN_IMAGE_IDS.default,
      color: DEFAULT_POINT_COLOR
    }
  ];
}

async function addMergedPinImage(map, imageId, color) {
  if (!map || map.hasImage(imageId)) {
    return;
  }

  const template = await loadPairedPinSvgTemplate();
  const image = await svgTextToImage(colorizePairedPinSvg(template, color));

  if (!map.hasImage(imageId)) {
    map.addImage(imageId, image, { pixelRatio: PAIRED_PIN_PIXEL_RATIO });
  }
}

async function ensureMergedPinImages(map) {
  if (!map?.getStyle?.()) {
    return;
  }

  await Promise.all(
    getMergedPinImageEntries().map(({ id, color }) => addMergedPinImage(map, id, color))
  );
}

function attachMergedPinImageMissingHandler(map) {
  if (!map || styleImageMissingAttached.get(map)) {
    return;
  }

  const colorByImageId = new Map(
    getMergedPinImageEntries().map(({ id, color }) => [id, color])
  );

  const handleMissing = (event) => {
    const color = colorByImageId.get(event?.id);
    if (!color) {
      return;
    }

    addMergedPinImage(map, event.id, color).catch(() => {
      // Иконка подтянется при следующем styleimagemissing / ensure.
    });
  };

  map.on("styleimagemissing", handleMissing);
  styleImageMissingAttached.set(map, true);
}

function getMergedPinIconImageExpression() {
  return [
    "match",
    ["downcase", ["coalesce", ["get", "regnum"], ""]],
    "plantae",
    MERGED_PIN_IMAGE_IDS.plantae,
    "animalia",
    MERGED_PIN_IMAGE_IDS.animalia,
    "fungi",
    MERGED_PIN_IMAGE_IDS.fungi,
    "protozoa",
    MERGED_PIN_IMAGE_IDS.protozoa,
    MERGED_PIN_IMAGE_IDS.default
  ];
}

function addMergedSymbolLayer(map) {
  if (!map || map.getLayer(MERGED_UNCLUSTERED_LAYER_ID)) {
    return;
  }

  map.addLayer({
    id: MERGED_UNCLUSTERED_LAYER_ID,
    type: "symbol",
    source: MERGED_SOURCE_ID,
    layout: {
      "icon-image": getMergedPinIconImageExpression(),
      "icon-size": 1,
      "icon-anchor": "bottom",
      "icon-allow-overlap": true,
      "icon-ignore-placement": true
    }
  });
}

/**
 * Создаёт слой слитых точек (без кластеризации).
 * @param {import("mapbox-gl").Map} map
 * @param {{ onPointClick?: Function }} [options]
 */
export function addMergedLayer(map, { onPointClick } = {}) {
  if (!map) {
    return;
  }

  if (onPointClick) {
    onPointClickCallback = onPointClick;
  }

  attachMergedPinImageMissingHandler(map);

  if (map.getSource(MERGED_SOURCE_ID)) {
    setMergedData(map, mergedCollection);
    ensureMergedPinImages(map).then(() => {
      if (!map.getLayer(MERGED_UNCLUSTERED_LAYER_ID)) {
        addMergedSymbolLayer(map);
      }
      if (!interactionHandlers) {
        attachInteractions(map);
      }
      applyVisibility(map);
    });
    return;
  }

  map.addSource(MERGED_SOURCE_ID, {
    type: "geojson",
    data: mergedCollection
  });

  ensureMergedPinImages(map)
    .then(() => {
      addMergedSymbolLayer(map);
      attachInteractions(map);
      applyVisibility(map);
    })
    .catch(() => {
      // Без иконок слой появится через styleimagemissing, когда шаблон загрузится.
      addMergedSymbolLayer(map);
      attachInteractions(map);
      applyVisibility(map);
    });
}

/**
 * @param {import("mapbox-gl").Map|null|undefined} map
 * @param {GeoJSON.FeatureCollection|object[]|null|undefined} collectionOrFeatures
 * @param {{ preview?: boolean }} [options]
 */
export function setMergedData(map, collectionOrFeatures, options = {}) {
  const collection = Array.isArray(collectionOrFeatures)
    ? { type: "FeatureCollection", features: collectionOrFeatures }
    : collectionOrFeatures?.type === "FeatureCollection"
      ? collectionOrFeatures
      : EMPTY_FEATURE_COLLECTION;

  const nextCollection = {
    type: "FeatureCollection",
    features: collection.features ?? []
  };

  if (!options.preview) {
    mergedCollection = nextCollection;
  }

  if (!map) {
    return;
  }

  if (!map.getSource(MERGED_SOURCE_ID)) {
    addMergedLayer(map);
  }

  map.getSource(MERGED_SOURCE_ID)?.setData(nextCollection);
  applyVisibility(map);
}

/** Добавляет одну feature на слой (если ещё нет с тем же id). */
export function upsertMergedFeature(map, feature) {
  if (!feature) {
    return;
  }

  const featureId = feature.id ?? feature.properties?.merged_id;
  const features = [...(mergedCollection.features ?? [])];
  const index = features.findIndex(
    (item) => (item.id ?? item.properties?.merged_id) === featureId
  );

  if (index >= 0) {
    features[index] = feature;
  } else {
    features.push(feature);
  }

  setMergedData(map, {
    type: "FeatureCollection",
    features
  });
}

/**
 * Удаляет feature со слоя по merged_id / id.
 * @param {import("mapbox-gl").Map|null|undefined} map
 * @param {string} featureId
 * @returns {object[]} оставшиеся features
 */
export function removeMergedFeature(map, featureId) {
  const id = String(featureId ?? "").trim();
  if (!id) {
    return mergedCollection.features ?? [];
  }

  const features = (mergedCollection.features ?? []).filter(
    (item) => String(item.id ?? item.properties?.merged_id ?? "") !== id
  );

  setMergedData(map, {
    type: "FeatureCollection",
    features
  });

  return features;
}

export function setMergedVisibility(map, visible) {
  layerVisible = Boolean(visible);
  if (map) {
    applyVisibility(map);
  }
}

export function isMergedLayerVisible() {
  return layerVisible;
}

/** Id интерактивных слоёв слитых точек (для проверки hit при клике по карте). */
export function getMergedInteractiveLayerIds(map) {
  if (!map?.getLayer?.(MERGED_UNCLUSTERED_LAYER_ID)) {
    return [];
  }
  return [MERGED_UNCLUSTERED_LAYER_ID];
}

export function getMergedFeatures() {
  return mergedCollection.features ?? [];
}

export function getMergedFeatureCollection() {
  return mergedCollection;
}
