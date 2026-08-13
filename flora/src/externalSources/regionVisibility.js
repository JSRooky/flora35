/** Проставляет region_id на features при загрузке региона. */
export function stampFeatureRegionIds(features, regionId) {
  if (!regionId || !Array.isArray(features)) {
    return features;
  }

  for (let i = 0; i < features.length; i += 1) {
    const feature = features[i];
    if (!feature) {
      continue;
    }
    if (!feature.properties) {
      feature.properties = { region_id: regionId };
    } else {
      feature.properties.region_id = regionId;
    }
  }

  return features;
}

export function normalizeHiddenRegionIds(value) {
  if (!Array.isArray(value) || value.length === 0) {
    return [];
  }

  const ids = [];
  const seen = new Set();
  for (let i = 0; i < value.length; i += 1) {
    const id = value[i];
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

export function hasHiddenRegionFilter(filters) {
  return normalizeHiddenRegionIds(filters?.hiddenRegionIds).length > 0;
}

export function createHiddenRegionSet(filters) {
  const ids = normalizeHiddenRegionIds(filters?.hiddenRegionIds);
  return ids.length > 0 ? new Set(ids) : null;
}

export function isRegionIdHidden(regionId, hiddenSet) {
  if (!hiddenSet || hiddenSet.size === 0 || !regionId) {
    return false;
  }
  return hiddenSet.has(regionId);
}
