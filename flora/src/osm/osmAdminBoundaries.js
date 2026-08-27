export const OSM_ADMIN_LOAD_MODES = {
  COUNTRY: "country",
  REGIONS: "regions",
  DISTRICTS: "districts"
};

export const OSM_ADMIN_LOAD_MODE_LABELS = {
  [OSM_ADMIN_LOAD_MODES.COUNTRY]: "Граница России",
  [OSM_ADMIN_LOAD_MODES.REGIONS]: "Границы регионов России",
  [OSM_ADMIN_LOAD_MODES.DISTRICTS]: "Адм. деление региона"
};

const DEFAULT_ADMIN_LEVELS = ["4", "6"];
const DISTRICTS_ADMIN_LEVELS = ["6", "5"];
export const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://lz4.overpass-api.de/api/interpreter"
];
const LOCAL_OVERPASS_PROXIES = ["/overpass-ru", "/overpass-de", "/overpass-lz4"];
const COORD_PRECISION = 7;
const RUSSIA_ISO3166_1 = "RU";
const RUSSIA_COUNTRY_OSM_ID = 60189;
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const NOMINATIM_SEARCH_URL = "https://nominatim.openstreetmap.org/search";
const NOMINATIM_DETAILS_URL = "https://nominatim.openstreetmap.org/details";
const NOMINATIM_LOOKUP_URL = "https://nominatim.openstreetmap.org/lookup";
const POLYGONS_FR_URL = "https://polygons.openstreetmap.fr/get_geojson.py";
const NOMINATIM_LOOKUP_CHUNK = 20;

/**
 * Собирает Overpass QL для административных границ (relation + geometry).
 * Режимы: граница РФ, субъекты РФ, районы выбранного региона.
 * Без mode остаётся запрос по bbox (west,south,east,north).
 */
export function buildOverpassQuery({
  mode = null,
  bbox,
  adminLevels,
  name = "",
  regionName = "",
  regionNames = [],
  iso3166 = "",
  timeoutSec,
  output = "geom",
  districtsStyle = "area"
} = {}) {
  const resolvedMode = mode || null;
  const timeout = timeoutSec ?? defaultTimeoutForMode(resolvedMode, output);
  const outClause = output === "ids" ? "out tags;" : "out geom;";

  if (resolvedMode === OSM_ADMIN_LOAD_MODES.COUNTRY) {
    return [
      `[out:json][timeout:${timeout}];`,
      `relation["boundary"="administrative"]["admin_level"="2"]["ISO3166-1"="${RUSSIA_ISO3166_1}"];`,
      outClause
    ].join("\n");
  }

  if (resolvedMode === OSM_ADMIN_LOAD_MODES.REGIONS) {
    return [
      `[out:json][timeout:${timeout}];`,
      `relation["boundary"="administrative"]["admin_level"="4"]["ISO3166-2"~"^${RUSSIA_ISO3166_1}-"];`,
      outClause
    ].join("\n");
  }

  if (resolvedMode === OSM_ADMIN_LOAD_MODES.DISTRICTS) {
    const levels = normalizeAdminLevels(adminLevels ?? DISTRICTS_ADMIN_LEVELS);
    const names = uniqueNames([regionName, name, ...(regionNames ?? [])]);
    const iso = toOsmIso3166_2(iso3166);
    if (!names.length && !iso && bbox == null) {
      throw new Error("Для адм. деления нужен выбранный регион");
    }

    if (iso || names.length) {
      return buildDistrictsOverpassQuery({
        names,
        iso,
        levels,
        timeout,
        outClause,
        style: districtsStyle
      });
    }
  }

  const levels = normalizeAdminLevels(adminLevels ?? DEFAULT_ADMIN_LEVELS);
  if (!levels.length) {
    throw new Error("adminLevels must contain at least one value");
  }

  const bboxClause = formatBboxClause(bbox);
  const nameFilter = name ? `["name"~"${escapeOverpassRegex(name)}",i]` : "";

  return [
    `[out:json][timeout:${timeout}];`,
    "(",
    `  relation["boundary"="administrative"]${adminLevelFilter(levels)}${nameFilter}${bboxClause};`,
    ");",
    outClause
  ].join("\n");
}

function buildDistrictsOverpassQuery({ names, iso, levels, timeout, outClause, style }) {
  const levelFilter = adminLevelFilter(levels);
  if (style === "mapToArea") {
    const parentRels = [];
    if (iso) {
      parentRels.push(
        `  rel["boundary"="administrative"]["admin_level"="4"]["ISO3166-2"="${escapeOverpassLiteral(iso)}"];`
      );
    }
    names.forEach((item) => {
      parentRels.push(
        `  rel["boundary"="administrative"]["admin_level"="4"]["name"="${escapeOverpassLiteral(item)}"];`
      );
    });
    return [
      `[out:json][timeout:${timeout}];`,
      "(",
      ...parentRels,
      ")->.parent;",
      ".parent; map_to_area -> .reg;",
      "(",
      `  rel(area.reg)${levelFilter}["boundary"="administrative"];`,
      "  - .parent;",
      ");",
      outClause
    ].join("\n");
  }

  const areaBlocks = [];
  const relBlocks = [];
  if (iso) {
    areaBlocks.push(
      `area["ISO3166-2"="${escapeOverpassLiteral(iso)}"]["admin_level"="4"]->.r0;`
    );
    relBlocks.push(`  rel(area.r0)${levelFilter}["boundary"="administrative"];`);
  }
  names.forEach((item, index) => {
    const alias = `n${index}`;
    areaBlocks.push(
      `area["name"="${escapeOverpassLiteral(item)}"]["admin_level"="4"]->.${alias};`
    );
    relBlocks.push(`  rel(area.${alias})${levelFilter}["boundary"="administrative"];`);
  });
  return [`[out:json][timeout:${timeout}];`, ...areaBlocks, "(", ...relBlocks, ");", outClause].join(
    "\n"
  );
}

export function buildOverpassGeomQuery(ids, timeoutSec = 55) {
  const list = uniquePositiveIds(ids);
  if (!list.length) {
    throw new Error("relation ids are required");
  }
  return [
    `[out:json][timeout:${timeoutSec}];`,
    `rel(id:${list.join(",")});`,
    "out geom;"
  ].join("\n");
}

export function toOsmIso3166_2(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }
  if (/^RU-[A-Z0-9]{2,3}$/i.test(raw)) {
    return raw.toUpperCase();
  }
  const dashed = raw.replace(/\./g, "-").toUpperCase();
  if (/^RU-[A-Z0-9]{3}$/.test(dashed)) {
    return dashed;
  }
  return "";
}

export function defaultTimeoutForMode(mode, output = "geom") {
  if (output === "ids") {
    return 45;
  }
  if (mode === OSM_ADMIN_LOAD_MODES.REGIONS) {
    return 55;
  }
  if (mode === OSM_ADMIN_LOAD_MODES.COUNTRY || mode === OSM_ADMIN_LOAD_MODES.DISTRICTS) {
    return 55;
  }
  return 45;
}

export function suggestedOsmAdminFilename(mode, regionName = "") {
  if (mode === OSM_ADMIN_LOAD_MODES.COUNTRY) {
    return "osm-russia-boundary.geojson";
  }
  if (mode === OSM_ADMIN_LOAD_MODES.REGIONS) {
    return "osm-russia-regions.geojson";
  }
  const slug = String(regionName || "region")
    .toLowerCase()
    .replace(/[^a-zа-яё0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return `osm-districts-${slug || "region"}.geojson`;
}

export function downloadGeoJson(collection, filename) {
  if (typeof document === "undefined") {
    return;
  }
  const blob = new Blob([`${JSON.stringify(collection)}\n`], {
    type: "application/geo+json;charset=utf-8"
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename || "osm-admin-boundaries.geojson";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function parseBbox(value) {
  if (Array.isArray(value) && value.length === 4) {
    return value.map(Number);
  }

  if (typeof value !== "string") {
    throw new Error("bbox must be west,south,east,north");
  }

  const parts = value.split(",").map((part) => Number(part.trim()));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
    throw new Error("bbox must be west,south,east,north");
  }

  const [west, south, east, north] = parts;
  if (west >= east || south >= north) {
    throw new Error("bbox must have west < east and south < north");
  }

  return [west, south, east, north];
}

export function normalizeAdminLevels(adminLevels) {
  const raw = Array.isArray(adminLevels)
    ? adminLevels
    : String(adminLevels ?? "")
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean);

  return [...new Set(raw.map((level) => String(level)))];
}

/**
 * Превращает ответ Overpass (out geom) в GeoJSON FeatureCollection.
 */
export function osmJsonToAdminFeatureCollection(osmJson, { includeIncomplete = false } = {}) {
  const elements = Array.isArray(osmJson?.elements) ? osmJson.elements : [];
  const features = [];

  elements.forEach((element) => {
    if (element?.type !== "relation") {
      return;
    }

    const geometry = relationToGeometry(element);
    if (!geometry) {
      if (includeIncomplete) {
        features.push({
          type: "Feature",
          properties: relationProperties(element, { incomplete: true }),
          geometry: null
        });
      }
      return;
    }

    features.push({
      type: "Feature",
      properties: relationProperties(element),
      geometry
    });
  });

  return {
    type: "FeatureCollection",
    name: "osm-admin-boundaries",
    features
  };
}

export async function fetchOsmAdminBoundaries({
  mode = null,
  bbox,
  adminLevels,
  name = "",
  regionName = "",
  regionNames = [],
  iso3166 = "",
  timeoutSec,
  output = "geom",
  districtsStyle = "area",
  overpassUrl,
  overpassUrls,
  retryDelayMs = 350,
  fetchImpl = fetch,
  query: queryOverride
} = {}) {
  const query =
    queryOverride ||
    buildOverpassQuery({
      mode,
      bbox,
      adminLevels,
      name,
      regionName,
      regionNames,
      iso3166,
      timeoutSec,
      output,
      districtsStyle
    });
  return requestOverpassJson(query, { overpassUrl, overpassUrls, fetchImpl, retryDelayMs });
}

export async function loadOsmAdminFeatureCollection(options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  try {
    const { byId, ids } = await loadDistrictOrGenericIds(options, fetchImpl);
    if (!ids.length) {
      throw new Error("Overpass не вернул идентификаторы границ");
    }
    let geomElements;
    try {
      geomElements = await loadRelationGeometries(ids, {
        ...options,
        fetchImpl,
        relationStubs: byId
      });
    } catch (error) {
      geomElements = await loadNominatimRelationElements(ids, {
        fetchImpl,
        relationStubs: byId,
        retryDelayMs: options.retryDelayMs
      });
      if (!geomElements.length) {
        throw error;
      }
    }
    const collection = nameAdminCollection(
      osmJsonToAdminFeatureCollection({ elements: geomElements }),
      options.mode
    );
    if (options.mode === OSM_ADMIN_LOAD_MODES.DISTRICTS) {
      const districts = dropParentAdminFeatures(collection, [
        options.regionName,
        options.name,
        ...(options.regionNames ?? [])
      ]);
      if (!districts.features.length) {
        throw new Error("Overpass вернул только границу региона, без районов");
      }
      return districts;
    }
    return collection;
  } catch (error) {
    const fallback = await loadFeatureCollectionViaNominatim({ ...options, fetchImpl }).catch(
      () => null
    );
    if (fallback?.features?.length) {
      return fallback;
    }
    throw wrapFinalOverpassError(error);
  }
}

async function loadDistrictOrGenericIds(options, fetchImpl) {
  if (options.mode !== OSM_ADMIN_LOAD_MODES.DISTRICTS) {
    const idsJson = await fetchOsmAdminBoundaries({
      ...options,
      fetchImpl,
      output: "ids"
    });
    return relationIdsFromOsmJson(idsJson, options);
  }

  const styles = ["area", "mapToArea"];
  const levelSets = [DISTRICTS_ADMIN_LEVELS, ["8"]];
  let lastError = null;
  for (const districtsStyle of styles) {
    for (const adminLevels of levelSets) {
      try {
        const idsJson = await fetchOsmAdminBoundaries({
          ...options,
          fetchImpl,
          output: "ids",
          districtsStyle,
          adminLevels
        });
        const parsed = relationIdsFromOsmJson(idsJson, options);
        if (parsed.ids.length) {
          return parsed;
        }
      } catch (error) {
        lastError = error;
      }
    }
  }
  if (lastError) {
    throw lastError;
  }
  return { byId: new Map(), ids: [] };
}

function relationIdsFromOsmJson(idsJson, options) {
  const stubs = (Array.isArray(idsJson?.elements) ? idsJson.elements : []).filter(
    (element) => element?.type === "relation" && element.id && isDistrictRelation(element, options)
  );
  const byId = new Map(stubs.map((element) => [Number(element.id), element]));
  return { byId, ids: [...byId.keys()] };
}

function isDistrictRelation(element, options) {
  if (options?.mode !== OSM_ADMIN_LOAD_MODES.DISTRICTS) {
    return true;
  }
  const level = String(element.tags?.admin_level || "");
  if (level === "2" || level === "4") {
    return false;
  }
  const parentNames = uniqueNames([
    options.regionName,
    options.name,
    ...(options.regionNames ?? [])
  ]);
  const name = element.tags?.name || "";
  return !parentNames.includes(name);
}

export function dropParentAdminFeatures(collection, parentNames = []) {
  const names = uniqueNames(parentNames);
  return {
    ...collection,
    features: (collection?.features ?? []).filter((feature) => {
      const level = String(feature.properties?.admin_level || "");
      const title = feature.properties?.title || feature.properties?.name || "";
      if (level === "2" || level === "4") {
        return false;
      }
      return !names.includes(title);
    })
  };
}

async function loadRelationGeometries(ids, options) {
  const batchSize = options.geomBatchSize ?? defaultGeomBatchSize(options.mode);
  const elements = [];
  const batches = chunk(ids, batchSize);
  for (const batch of batches) {
    const loaded = await loadGeomBatch(batch, options);
    elements.push(...loaded);
  }
  return elements;
}

async function loadGeomBatch(ids, options) {
  if (!ids.length) {
    return [];
  }
  try {
    const osmJson = await fetchOsmAdminBoundaries({
      ...options,
      query: buildOverpassGeomQuery(ids, 55)
    });
    return (Array.isArray(osmJson?.elements) ? osmJson.elements : []).filter(
      (element) => element?.type === "relation"
    );
  } catch (error) {
    if (ids.length > 1) {
      const mid = Math.ceil(ids.length / 2);
      const left = await loadGeomBatch(ids.slice(0, mid), options);
      const right = await loadGeomBatch(ids.slice(mid), options);
      return [...left, ...right];
    }
    const geometry = await fetchRelationGeometryFallback(ids[0], options.fetchImpl);
    if (!geometry) {
      throw error;
    }
    const stub = options.relationStubs?.get(Number(ids[0])) || { type: "relation", id: ids[0], tags: {}, members: [] };
    return [
      {
        ...stub,
        type: "relation",
        id: ids[0],
        members: geometryToSyntheticMembers(geometry)
      }
    ];
  }
}

async function fetchRelationGeometryFallback(osmId, fetchImpl) {
  const geometry =
    (await fetchNominatimRelationGeometry(osmId, fetchImpl).catch(() => null)) ||
    (await fetchPolygonsFrGeometry(osmId, fetchImpl).catch(() => null));
  return geometry;
}

async function fetchNominatimRelationGeometry(osmId, fetchImpl) {
  const url = `${NOMINATIM_LOOKUP_URL}?osm_ids=R${osmId}&format=geojson&polygon_geojson=1&polygon_threshold=0.0003`;
  const response = await fetchImpl(url, { method: "GET" });
  if (!response.ok) {
    throw new Error(`Nominatim ${response.status}`);
  }
  const json = await response.json();
  const feature = json?.features?.[0];
  return isPolygonGeometry(feature?.geometry) ? feature.geometry : null;
}

async function fetchPolygonsFrGeometry(osmId, fetchImpl) {
  const url = `${POLYGONS_FR_URL}?id=${osmId}&params=0`;
  const response = await fetchImpl(url, { method: "GET" });
  if (!response.ok) {
    throw new Error(`polygons.fr ${response.status}`);
  }
  const json = await response.json();
  if (isPolygonGeometry(json)) {
    return json;
  }
  if (json?.type === "Feature" && isPolygonGeometry(json.geometry)) {
    return json.geometry;
  }
  if (json?.type === "FeatureCollection" && isPolygonGeometry(json.features?.[0]?.geometry)) {
    return json.features[0].geometry;
  }
  return null;
}

function geometryToSyntheticMembers(geometry) {
  const polygons =
    geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates || [];
  const members = [];
  polygons.forEach((rings) => {
    (rings || []).forEach((ring, ringIndex) => {
      members.push({
        type: "way",
        role: ringIndex === 0 ? "outer" : "inner",
        geometry: (ring || []).map(([lon, lat]) => ({ lon, lat }))
      });
    });
  });
  return members;
}

function isPolygonGeometry(geometry) {
  return geometry?.type === "Polygon" || geometry?.type === "MultiPolygon";
}

async function requestOverpassJson(query, { overpassUrl, overpassUrls, fetchImpl, retryDelayMs = 350 }) {
  const urls = resolveOverpassUrls({ overpassUrl, overpassUrls });
  let lastError = null;
  for (let index = 0; index < urls.length; index += 1) {
    const url = urls[index];
    const attempts = [
      {
        method: "GET",
        init: { method: "GET", mode: "cors", credentials: "omit" },
        href: withOverpassQuery(url, query)
      },
      {
        method: "POST",
        init: {
          method: "POST",
          mode: "cors",
          credentials: "omit",
          headers: { "Content-Type": "text/plain" },
          body: query
        },
        href: url
      },
      {
        method: "POST",
        init: {
          method: "POST",
          mode: "cors",
          credentials: "omit",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: `data=${encodeURIComponent(query)}`
        },
        href: url
      }
    ];
    for (const attempt of attempts) {
      try {
        const response = await fetchImpl(attempt.href, attempt.init);
        if (!response.ok) {
          const body = await response.text().catch(() => "");
          const error = new Error(
            `Overpass request failed (${response.status}): ${body.slice(0, 300)}`
          );
          lastError = error;
          if (RETRYABLE_STATUS.has(response.status)) {
            break;
          }
          continue;
        }
        const json = await response.json();
        if (typeof json?.remark === "string" && /error|timeout/i.test(json.remark)) {
          throw new Error(`Overpass remark: ${json.remark}`);
        }
        return json;
      } catch (error) {
        lastError = error;
      }
    }
    if (index < urls.length - 1) {
      await sleep(retryDelayMs);
    }
  }
  throw lastError || new Error("Overpass request failed");
}

function withOverpassQuery(url, query) {
  const glue = String(url).includes("?") ? "&" : "?";
  return `${url}${glue}data=${encodeURIComponent(query)}`;
}

function nameAdminCollection(collection, mode) {
  if (mode === OSM_ADMIN_LOAD_MODES.COUNTRY) {
    collection.name = "osm-russia-boundary";
  } else if (mode === OSM_ADMIN_LOAD_MODES.REGIONS) {
    collection.name = "osm-russia-regions";
  } else if (mode === OSM_ADMIN_LOAD_MODES.DISTRICTS) {
    collection.name = "osm-region-districts";
  }
  return collection;
}

function wrapFinalOverpassError(error) {
  const message = error?.message || String(error);
  if (isLikelyNetworkFailure(error)) {
    return new Error(
      "Не удалось связаться с Overpass (браузер блокирует прямой запрос). Запасной источник Nominatim тоже не ответил."
    );
  }
  return error instanceof Error ? error : new Error(message);
}

function isLikelyNetworkFailure(error) {
  const message = error?.message || String(error);
  return /failed to fetch|networkerror|load failed|network request failed/i.test(message);
}

async function loadFeatureCollectionViaNominatim(options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const delayMs = options.retryDelayMs === 0 ? 0 : 1100;
  if (options.mode === OSM_ADMIN_LOAD_MODES.COUNTRY) {
    const elements = await loadNominatimRelationElements([RUSSIA_COUNTRY_OSM_ID], {
      fetchImpl,
      retryDelayMs: options.retryDelayMs
    });
    return nameAdminCollection(osmJsonToAdminFeatureCollection({ elements }), options.mode);
  }
  if (options.mode !== OSM_ADMIN_LOAD_MODES.DISTRICTS) {
    return { type: "FeatureCollection", features: [] };
  }
  const parent = await searchNominatimRegion(options, fetchImpl);
  if (!parent) {
    return { type: "FeatureCollection", features: [] };
  }
  if (delayMs) {
    await sleep(delayMs);
  }
  const childIds = await nominatimDistrictIds(parent, fetchImpl);
  if (!childIds.length) {
    return { type: "FeatureCollection", features: [] };
  }
  if (delayMs) {
    await sleep(delayMs);
  }
  const elements = await loadNominatimRelationElements(childIds, {
    fetchImpl,
    retryDelayMs: options.retryDelayMs
  });
  const collection = nameAdminCollection(
    dropParentAdminFeatures(osmJsonToAdminFeatureCollection({ elements }), [
      parent.name,
      options.regionName,
      options.name,
      ...(options.regionNames ?? [])
    ]),
    options.mode
  );
  return collection;
}

async function searchNominatimRegion(options, fetchImpl) {
  const names = uniqueNames([options.regionName, options.name, ...(options.regionNames ?? [])]);
  const iso = toOsmIso3166_2(options.iso3166);
  const query = names[0] || iso;
  if (!query) {
    return null;
  }
  const url = `${NOMINATIM_SEARCH_URL}?format=jsonv2&limit=8&countrycodes=ru&extratags=1&q=${encodeURIComponent(query)}`;
  const response = await fetchImpl(url, { method: "GET", mode: "cors", credentials: "omit" });
  if (!response.ok) {
    throw new Error(`Nominatim search ${response.status}`);
  }
  const rows = await response.json();
  const match = (Array.isArray(rows) ? rows : []).find((row) => {
    if (!nominatimIsRelation(row)) {
      return false;
    }
    const level = String(row.extratags?.admin_level || "");
    return level === "4" || row.category === "boundary" || row.class === "boundary";
  });
  if (!match) {
    return null;
  }
  return {
    osmId: Number(match.osm_id),
    boundingbox: Array.isArray(match.boundingbox) ? match.boundingbox : null,
    name: match.name || match.display_name || ""
  };
}

async function nominatimDistrictIds(parent, fetchImpl) {
  const ids = [];
  if (parent?.boundingbox) {
    const viewbox = nominatimViewbox(parent.boundingbox);
    for (const query of ["район", "округ"]) {
      const url = `${NOMINATIM_SEARCH_URL}?format=jsonv2&limit=80&countrycodes=ru&extratags=1&bounded=1&viewbox=${encodeURIComponent(
        viewbox
      )}&q=${encodeURIComponent(query)}`;
      const response = await fetchImpl(url, { method: "GET", mode: "cors", credentials: "omit" });
      if (!response.ok) {
        continue;
      }
      const rows = await response.json();
      (Array.isArray(rows) ? rows : []).forEach((row) => {
        if (!nominatimIsRelation(row) || Number(row.osm_id) === Number(parent.osmId)) {
          return;
        }
        const level = String(row.extratags?.admin_level || "");
        if (level === "6" || level === "5") {
          ids.push(row.osm_id);
        }
      });
    }
  }
  if (parent?.osmId && !ids.length) {
    const url = `${NOMINATIM_DETAILS_URL}?osmtype=R&osmid=${parent.osmId}&format=json&hierarchy=1&linkedplaces=1`;
    const response = await fetchImpl(url, { method: "GET", mode: "cors", credentials: "omit" });
    if (response.ok) {
      const details = await response.json();
      walkNominatimHierarchy(details.hierarchy || details.linked_places, ids);
    }
  }
  return uniquePositiveIds(ids.filter((id) => Number(id) !== Number(parent?.osmId)));
}

function nominatimViewbox(boundingbox) {
  const [south, north, west, east] = boundingbox.map(Number);
  return `${west},${north},${east},${south}`;
}

function walkNominatimHierarchy(nodes, ids) {
  (Array.isArray(nodes) ? nodes : []).forEach((node) => {
    const level = String(node.admin_level || node.extratags?.admin_level || "");
    if (nominatimIsRelation(node) && (level === "6" || level === "5")) {
      ids.push(node.osm_id ?? node.osmid);
    }
    walkNominatimHierarchy(node.subarea || node.hierarchy || node.children, ids);
  });
}

function nominatimIsRelation(item) {
  const type = String(item?.osm_type || item?.osmtype || "").toLowerCase();
  return type === "r" || type === "relation";
}

async function loadNominatimRelationElements(ids, { fetchImpl, relationStubs, retryDelayMs } = {}) {
  const list = uniquePositiveIds(ids);
  const elements = [];
  const wait = retryDelayMs === 0 ? 0 : 1100;
  const groups = chunk(list, NOMINATIM_LOOKUP_CHUNK);
  for (let index = 0; index < groups.length; index += 1) {
    if (index > 0 && wait) {
      await sleep(wait);
    }
    const url = `${NOMINATIM_LOOKUP_URL}?osm_ids=${groups[index]
      .map((id) => `R${id}`)
      .join(",")}&format=geojson&polygon_geojson=1&polygon_threshold=0.0003`;
    const response = await fetchImpl(url, { method: "GET", mode: "cors", credentials: "omit" });
    if (!response.ok) {
      continue;
    }
    const json = await response.json();
    (json.features || []).forEach((feature) => {
      const osmId = Number(feature.properties?.osm_id);
      const geometry = feature.geometry;
      if (!isPolygonGeometry(geometry) || !osmId) {
        return;
      }
      const stub = relationStubs?.get(osmId) || {
        type: "relation",
        id: osmId,
        tags: nominatimTagsFromFeature(feature)
      };
      elements.push({
        ...stub,
        type: "relation",
        id: osmId,
        tags: stub.tags || nominatimTagsFromFeature(feature),
        members: geometryToSyntheticMembers(geometry)
      });
    });
  }
  return elements;
}

function nominatimTagsFromFeature(feature) {
  const properties = feature?.properties ?? {};
  const extras = properties.extratags || {};
  return {
    name: properties.name || properties.display_name || "",
    admin_level: extras.admin_level || properties.admin_level || null,
    boundary: extras.boundary || "administrative",
    "ISO3166-2": extras["ISO3166-2"] || null
  };
}


function resolveOverpassUrls({ overpassUrl, overpassUrls }) {
  if (Array.isArray(overpassUrls) && overpassUrls.length) {
    return overpassUrls;
  }
  const defaults = defaultOverpassUrls();
  if (overpassUrl) {
    return [overpassUrl, ...defaults.filter((item) => item !== overpassUrl)];
  }
  return defaults;
}

export function defaultOverpassUrls() {
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (host === "localhost" || host === "127.0.0.1") {
      return [...LOCAL_OVERPASS_PROXIES, ...OVERPASS_ENDPOINTS];
    }
  }
  return [...OVERPASS_ENDPOINTS];
}

function defaultGeomBatchSize(mode) {
  if (mode === OSM_ADMIN_LOAD_MODES.COUNTRY) {
    return 1;
  }
  if (mode === OSM_ADMIN_LOAD_MODES.REGIONS) {
    return 2;
  }
  return 6;
}

function chunk(values, size) {
  const out = [];
  const step = Math.max(1, Number(size) || 1);
  for (let index = 0; index < values.length; index += step) {
    out.push(values.slice(index, index + step));
  }
  return out;
}

function uniquePositiveIds(ids) {
  return [
    ...new Set(
      (ids || [])
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id) && id > 0)
    )
  ];
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function adminLevelFilter(levels) {
  return `["admin_level"~"^(${levels.join("|")})$"]`;
}

function uniqueNames(values) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function escapeOverpassLiteral(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function formatBboxClause(bbox) {
  if (bbox == null) {
    throw new Error("bbox is required (west,south,east,north)");
  }

  const [west, south, east, north] = parseBbox(bbox);
  return `(${south},${west},${north},${east})`;
}

function escapeOverpassRegex(value) {
  return String(value).replace(/[\\^$.*+?()[\]{}|]/g, "\\$&").replace(/"/g, '\\"');
}

function relationProperties(element, extra = {}) {
  const tags = element.tags ?? {};
  const name = tags["name:ru"] || tags.name || tags["name:en"] || "";

  return {
    OSM_ID: element.id,
    title: name,
    name,
    name_en: tags["name:en"] ?? null,
    admin_level: tags.admin_level ?? null,
    boundary: tags.boundary ?? null,
    ISO3166_1: tags["ISO3166-1"] ?? null,
    ISO3166_2: tags["ISO3166-2"] ?? null,
    iso: tags["ISO3166-2"] ? String(tags["ISO3166-2"]).replace("-", ".") : `osm:${element.id}`,
    ref: tags.ref ?? null,
    official_name: tags.official_name ?? null,
    ...extra
  };
}

function relationToGeometry(element) {
  const members = Array.isArray(element.members) ? element.members : [];
  const outers = assembleRings(members.filter((member) => (member.role || "outer") !== "inner"));
  const inners = assembleRings(members.filter((member) => member.role === "inner"));

  if (!outers.length) {
    return null;
  }

  const polygons = outers.map((outer) => {
    const holes = inners.filter((inner) => ringInsideOuter(inner, outer));
    return [outer, ...holes];
  });

  if (polygons.length === 1) {
    return { type: "Polygon", coordinates: polygons[0] };
  }

  return { type: "MultiPolygon", coordinates: polygons };
}

function assembleRings(members) {
  const remaining = members
    .map(memberToCoords)
    .filter((coords) => Array.isArray(coords) && coords.length >= 2)
    .map((coords) => coords.slice());

  const rings = [];

  while (remaining.length) {
    let ring = remaining.pop();
    let progressed = true;

    while (progressed && !isClosed(ring)) {
      progressed = false;
      const start = coordKey(ring[0]);
      const end = coordKey(ring[ring.length - 1]);

      for (let index = 0; index < remaining.length; index += 1) {
        const way = remaining[index];
        const wayStart = coordKey(way[0]);
        const wayEnd = coordKey(way[way.length - 1]);

        if (wayStart === end) {
          ring = ring.concat(way.slice(1));
        } else if (wayEnd === end) {
          ring = ring.concat(way.slice(0, -1).reverse());
        } else if (wayEnd === start) {
          ring = way.slice(0, -1).concat(ring);
        } else if (wayStart === start) {
          ring = way.slice().reverse().slice(0, -1).concat(ring);
        } else {
          continue;
        }

        remaining.splice(index, 1);
        progressed = true;
        break;
      }
    }

    const closed = closeRing(ring);
    if (closed.length >= 4) {
      rings.push(closed);
    }
  }

  return rings;
}

function memberToCoords(member) {
  if (!Array.isArray(member?.geometry)) {
    return null;
  }

  const coords = member.geometry
    .map((node) => [Number(node.lon), Number(node.lat)])
    .filter(([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat));

  return coords.length >= 2 ? coords : null;
}

function isClosed(ring) {
  if (!ring || ring.length < 4) {
    return false;
  }

  return coordKey(ring[0]) === coordKey(ring[ring.length - 1]);
}

function closeRing(ring) {
  if (!ring?.length) {
    return [];
  }

  const closed = ring.slice();
  if (coordKey(closed[0]) !== coordKey(closed[closed.length - 1])) {
    closed.push(closed[0]);
  }

  return closed;
}

function coordKey(coord) {
  return `${coord[0].toFixed(COORD_PRECISION)},${coord[1].toFixed(COORD_PRECISION)}`;
}

function ringInsideOuter(inner, outer) {
  if (!inner?.length || !outer?.length) {
    return false;
  }

  return pointInRing(inner[0], outer);
}

function pointInRing(coord, ring) {
  const x = coord[0];
  const y = coord[1];
  let inside = false;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const crosses = (yi > y) !== (yj > y);
    const intersects = crosses && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}
