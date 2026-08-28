import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  OSM_ADMIN_LOAD_MODES,
  loadOsmAdminFeatureCollection,
  osmJsonToAdminFeatureCollection,
  parseBbox,
  normalizeAdminLevels,
  suggestedOsmAdminFilename
} from "../src/osm/osmAdminBoundaries.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const floraRoot = join(__dirname, "..");
const DEFAULT_OUT_DIR = join(floraRoot, "scripts/osm");

function parseArgs(argv) {
  const options = {
    mode: OSM_ADMIN_LOAD_MODES.COUNTRY,
    bbox: null,
    adminLevels: null,
    name: "",
    regionName: "",
    out: "",
    fromFile: "",
    pretty: argv.includes("--pretty")
  };

  argv.forEach((arg, index) => {
    const next = argv[index + 1];
    if (arg === "--mode" && next) {
      options.mode = next;
    }
    if (arg === "--bbox" && next) {
      options.bbox = parseBbox(next);
    }
    if (arg === "--admin-level" && next) {
      options.adminLevels = normalizeAdminLevels(next);
    }
    if (arg === "--name" && next) {
      options.name = next;
    }
    if (arg === "--region" && next) {
      options.regionName = next;
    }
    if (arg === "--out" && next) {
      options.out = resolve(floraRoot, next);
    }
    if (arg === "--from-file" && next) {
      options.fromFile = resolve(floraRoot, next);
    }
  });

  if (!Object.values(OSM_ADMIN_LOAD_MODES).includes(options.mode) && options.mode !== "bbox") {
    throw new Error("--mode must be country, regions, districts, or bbox");
  }

  if (!options.out) {
    options.out = join(
      DEFAULT_OUT_DIR,
      suggestedOsmAdminFilename(
        options.mode === "bbox" ? OSM_ADMIN_LOAD_MODES.DISTRICTS : options.mode,
        options.regionName || options.name
      )
    );
  }

  return options;
}

async function loadCollection(options) {
  if (options.fromFile) {
    return osmJsonToAdminFeatureCollection(JSON.parse(readFileSync(options.fromFile, "utf8")));
  }

  const mode = options.mode === "bbox" ? null : options.mode;
  return loadOsmAdminFeatureCollection({
    mode,
    bbox: options.bbox,
    adminLevels: options.adminLevels,
    name: options.name,
    regionName: options.regionName
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const collection = await loadCollection(options);
  const json = options.pretty
    ? `${JSON.stringify(collection, null, 2)}\n`
    : `${JSON.stringify(collection)}\n`;

  mkdirSync(dirname(options.out), { recursive: true });
  writeFileSync(options.out, json, "utf8");

  console.log(
    JSON.stringify(
      {
        mode: options.mode,
        out: options.out,
        features: collection.features.length,
        bytes: Buffer.byteLength(json, "utf8"),
        sample: collection.features[0]?.properties ?? null
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
