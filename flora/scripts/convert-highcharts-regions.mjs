import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { simplify } from "@turf/turf";

const __dirname = dirname(fileURLToPath(import.meta.url));
const floraRoot = join(__dirname, "..");
const highchartsPath = join(floraRoot, "src/bounds/rus_simple_highcharts.json");
const gadmPath = join(floraRoot, "scripts/gadm/gadm41_RUS_1.json");
const extraPath = process.argv[2];
const outPath = join(floraRoot, "src/geo/russiaRegions.json");

const WEB_MERCATOR_MAX = 20037508.342789244;

function roundCoord(value) {
  return Math.round(value * 1e4) / 1e4;
}

function looksLikeLonLat(x, y) {
  return Number.isFinite(x) && Number.isFinite(y) && Math.abs(x) <= 180 && Math.abs(y) <= 90;
}

function firstCoordinate(feature) {
  const geometry = feature?.geometry;
  if (geometry?.type === "Polygon") {
    return geometry.coordinates?.[0]?.[0];
  }
  if (geometry?.type === "MultiPolygon") {
    return geometry.coordinates?.[0]?.[0]?.[0];
  }
  return null;
}

function mercatorToLonLat(x, y) {
  const lon = (x / WEB_MERCATOR_MAX) * 180;
  const lat =
    (180 / Math.PI) *
    (2 * Math.atan(Math.exp((y / WEB_MERCATOR_MAX) * Math.PI)) - Math.PI / 2);
  return [roundCoord(lon), roundCoord(lat)];
}

function transformRing(ring, mode) {
  return ring.map(([x, y]) => {
    if (mode === "lonlat") {
      return [roundCoord(x), roundCoord(y)];
    }
    return mercatorToLonLat(x, y);
  });
}

function transformGeometry(geometry, mode) {
  if (!geometry) {
    return null;
  }
  if (geometry.type === "Polygon") {
    return { type: "Polygon", coordinates: geometry.coordinates.map((ring) => transformRing(ring, mode)) };
  }
  if (geometry.type === "MultiPolygon") {
    return {
      type: "MultiPolygon",
      coordinates: geometry.coordinates.map((polygon) => polygon.map((ring) => transformRing(ring, mode)))
    };
  }
  return null;
}

function fixNlName(value) {
  if (!value || typeof value !== "string") {
    return value;
  }
  let text = value.replace(/([а-яёa-z])([А-ЯЁA-Z])/g, "$1 $2");
  text = text.replace(/([а-яё])(область|край|округ|автономн)/gi, "$1 $2");
  ["Республика", "край", "область", "округ", "автономная", "автономный"].forEach((prefix) => {
    text = text.replace(new RegExp(`(${prefix})(?=[А-ЯЁA-Zа-яёa-z])`, "g"), "$1 ");
  });
  return text.replace(/\s+/g, " ").trim();
}

function pickTitle(properties = {}) {
  return (
    properties.name ||
    properties.NAME_RU ||
    properties.NL_NAME_1 ||
    properties.NAME_1 ||
    properties.NAME ||
    properties.title ||
    ""
  );
}

function detectMode(features) {
  const pair = firstCoordinate(features[0]);
  if (!Array.isArray(pair) || pair.length < 2) {
    throw new Error("No coordinates found");
  }
  const [x, y] = pair;
  if (looksLikeLonLat(x, y)) {
    return "lonlat";
  }
  if (Math.abs(x) > 180 && y > 0 && Math.abs(x) <= WEB_MERCATOR_MAX * 1.05) {
    return "mercator";
  }
  return "unknown-projected";
}

function featuresFromCollection(collection, mode) {
  return (collection.features ?? [])
    .map((feature) => {
      const geometry = transformGeometry(feature.geometry, mode);
      if (!geometry) {
        return null;
      }
      const properties = feature.properties ?? {};
      return {
        type: "Feature",
        properties: {
          name: String(fixNlName(pickTitle(properties)) || ""),
          "hc-key": properties["hc-key"] ?? null,
          "postal-code": properties["postal-code"] ?? properties.HASC_1 ?? null
        },
        geometry
      };
    })
    .filter(Boolean);
}

function featuresFromGadm() {
  const collection = JSON.parse(readFileSync(gadmPath, "utf8"));
  return collection.features.map((feature) => {
    const simplified = simplify(feature, { tolerance: 0.08, highQuality: false, mutate: false });
    const properties = feature.properties ?? {};
    return {
      type: "Feature",
      properties: {
        name: String(fixNlName(properties.NL_NAME_1) || properties.NAME_1 || ""),
        "hc-key": null,
        "postal-code": properties.HASC_1 ?? null
      },
      geometry: simplified.geometry
    };
  });
}

function loadPreferredSource() {
  const candidates = [highchartsPath, extraPath].filter((path) => path && existsSync(path));
  for (const path of candidates) {
    const collection = JSON.parse(readFileSync(path, "utf8"));
    if (collection.type !== "FeatureCollection") {
      continue;
    }
    const mode = detectMode(collection.features);
    if (mode === "unknown-projected") {
      console.warn(`Skipping ${path}: coordinates are projected but not WGS84/Web Mercator`);
      continue;
    }
    return { path, mode, features: featuresFromCollection(collection, mode) };
  }
  return { path: gadmPath, mode: "gadm-simplify", features: featuresFromGadm() };
}

const result = loadPreferredSource();
mkdirSync(dirname(outPath), { recursive: true });
const output = {
  type: "FeatureCollection",
  name: "russia-regions",
  features: result.features
};
writeFileSync(outPath, `${JSON.stringify(output)}\n`, "utf8");
console.log(
  JSON.stringify(
    {
      source: result.path,
      mode: result.mode,
      features: result.features.length,
      bytes: Buffer.byteLength(JSON.stringify(output), "utf8"),
      sample: result.features.find((item) => /Вологод/.test(item.properties.name))?.properties
    },
    null,
    2
  )
);
