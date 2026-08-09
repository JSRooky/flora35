/**
 * Безопасный map.queryRenderedFeatures.
 * Mapbox может бросать «feature index out of bounds», пока тайлы
 * пересобираются после setData / setFilter.
 */

function normalizeQueryArgs(geometry, options) {
  let point = geometry;
  let opts = options;

  // Сигнатура queryRenderedFeatures(options) без geometry.
  if (
    options === undefined &&
    geometry &&
    typeof geometry === "object" &&
    !Array.isArray(geometry) &&
    (Object.prototype.hasOwnProperty.call(geometry, "layers") ||
      Object.prototype.hasOwnProperty.call(geometry, "filter"))
  ) {
    point = undefined;
    opts = geometry;
  }

  return { point, opts: { ...(opts || {}) } };
}

function filterExistingLayers(map, queryOptions) {
  if (!Array.isArray(queryOptions.layers)) {
    return queryOptions;
  }

  const layers = queryOptions.layers.filter((layerId) => Boolean(map.getLayer(layerId)));

  if (layers.length === 0) {
    return null;
  }

  return { ...queryOptions, layers };
}

function runQueryRenderedFeatures(original, map, geometry, options) {
  const { point, opts } = normalizeQueryArgs(geometry, options);
  const queryOptions = filterExistingLayers(map, opts);

  if (queryOptions === null) {
    return [];
  }

  try {
    if (point === undefined) {
      return original(queryOptions);
    }

    return original(point, queryOptions);
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("queryRenderedFeatures skipped during tile update", error);
    }

    return [];
  }
}

/**
 * Патчит map.queryRenderedFeatures на экземпляре карты, чтобы внутренние
 * обработчики Mapbox (mousemove / layer events) тоже не падали с OOB.
 */
export function installSafeQueryRenderedFeatures(map) {
  if (!map?.queryRenderedFeatures || map.__floraSafeQueryPatched) {
    return;
  }

  const original = map.queryRenderedFeatures.bind(map);

  map.queryRenderedFeatures = (geometry, options) =>
    runQueryRenderedFeatures(original, map, geometry, options);

  map.__floraSafeQueryPatched = true;
}

/** Явный безопасный вызов (после installSafeQueryRenderedFeatures достаточно map.*). */
export function safeQueryRenderedFeatures(map, geometry, options) {
  if (!map?.queryRenderedFeatures) {
    return [];
  }

  // Если патч уже стоит — map.queryRenderedFeatures сам безопасен.
  if (map.__floraSafeQueryPatched) {
    return map.queryRenderedFeatures(geometry, options);
  }

  const original = map.queryRenderedFeatures.bind(map);
  return runQueryRenderedFeatures(original, map, geometry, options);
}
