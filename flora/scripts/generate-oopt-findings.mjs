import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as turf from "@turf/turf";
import {
  FINDINGS_COLLECTION,
  LOCATION_DATASETS,
  speciesCollectionToFindingDocs
} from "../src/firebase/speciesCollectionFirestore.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const floraRoot = join(__dirname, "..");
const POINTS_PATH = join(floraRoot, "src/locations/points.json");

const BOUNDS_SOURCES = [
  "src/bounds/oopt_pol.geojson",
  "src/bounds/nature_reserve-polygon.geojson"
];

const REGION_BOUNDS = {
  lonMin: 35.5,
  lonMax: 45.6,
  latMin: 57.35,
  latMax: 61.85
};

const DEFAULT_COUNT = 120;
const DEFAULT_INSIDE_RATIO = 0.85;
const DEFAULT_SEED = 20260804;
const defaultProjectId = "redbook35-fa3f7";

function parseArgs(argv) {
  const options = {
    dryRun: argv.includes("--dry-run"),
    importFirestore: argv.includes("--import"),
    useAdmin: argv.includes("--admin"),
    count: DEFAULT_COUNT,
    insideRatio: DEFAULT_INSIDE_RATIO,
    seed: DEFAULT_SEED
  };

  argv.forEach((arg, index) => {
    if (arg === "--count" && argv[index + 1]) {
      options.count = Number(argv[index + 1]);
    }
    if (arg === "--inside-ratio" && argv[index + 1]) {
      options.insideRatio = Number(argv[index + 1]);
    }
    if (arg === "--seed" && argv[index + 1]) {
      options.seed = Number(argv[index + 1]);
    }
  });

  if (!Number.isFinite(options.count) || options.count <= 0) {
    throw new Error("--count must be a positive number");
  }

  if (!Number.isFinite(options.insideRatio) || options.insideRatio < 0 || options.insideRatio > 1) {
    throw new Error("--inside-ratio must be between 0 and 1");
  }

  return options;
}

function loadEnvFile(relativePath) {
  try {
    const absolutePath = join(floraRoot, relativePath);
    const content = readFileSync(absolutePath, "utf8");

    content.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        return;
      }

      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex === -1) {
        return;
      }

      const key = trimmed.slice(0, separatorIndex).trim();
      const value = trimmed.slice(separatorIndex + 1).trim();

      if (key && process.env[key] === undefined) {
        process.env[key] = value;
      }
    });
  } catch {
    // Optional env files.
  }
}

function createRng(seed) {
  let state = seed >>> 0;

  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function readSpeciesCollection() {
  const collection = JSON.parse(readFileSync(POINTS_PATH, "utf8"));

  if (collection.type !== "SpeciesCollection" || !Array.isArray(collection.species)) {
    throw new Error("points.json is not a SpeciesCollection");
  }

  return collection;
}

function readBoundsFeatures() {
  const features = [];

  BOUNDS_SOURCES.forEach((relativePath) => {
    const absolutePath = join(floraRoot, relativePath);
    const geojson = JSON.parse(readFileSync(absolutePath, "utf8"));

    if (!Array.isArray(geojson.features)) {
      throw new Error(`${relativePath} is not a FeatureCollection`);
    }

    geojson.features.forEach((feature) => {
      if (
        feature?.geometry &&
        (feature.geometry.type === "Polygon" || feature.geometry.type === "MultiPolygon")
      ) {
        features.push(feature);
      }
    });
  });

  if (features.length === 0) {
    throw new Error("No polygon features found in bounds GeoJSON sources");
  }

  return features;
}

function buildPolygonIndex(features) {
  const entries = features
    .map((feature) => ({
      feature,
      area: turf.area(feature)
    }))
    .filter((entry) => entry.area > 0);

  const totalArea = entries.reduce((sum, entry) => sum + entry.area, 0);

  return { entries, totalArea };
}

function pickWeightedPolygon(polygonIndex, rng) {
  const target = rng() * polygonIndex.totalArea;
  let accumulated = 0;

  for (const entry of polygonIndex.entries) {
    accumulated += entry.area;
    if (target <= accumulated) {
      return entry.feature;
    }
  }

  return polygonIndex.entries[polygonIndex.entries.length - 1].feature;
}

function randomPointInPolygon(feature) {
  const bbox = turf.bbox(feature);
  const point = turf.randomPoint(1, { bbox, mask: feature }).features[0];
  const [lon, lat] = point.geometry.coordinates;

  return [Number(lon.toFixed(4)), Number(lat.toFixed(4))];
}

function randomPointInRegion(rng) {
  const lon = REGION_BOUNDS.lonMin + rng() * (REGION_BOUNDS.lonMax - REGION_BOUNDS.lonMin);
  const lat = REGION_BOUNDS.latMin + rng() * (REGION_BOUNDS.latMax - REGION_BOUNDS.latMin);

  return [Number(lon.toFixed(4)), Number(lat.toFixed(4))];
}

function collectPersonNames(collection) {
  const names = new Set();

  collection.species.forEach((species) => {
    species.findings.forEach((finding) => {
      if (finding.found_by) {
        names.add(finding.found_by);
      }
      if (finding.identified_by) {
        names.add(finding.identified_by);
      }
    });
  });

  return [...names];
}

function collectExistingFindingIds(collection) {
  return new Set(collection.species.flatMap((species) => species.findings.map((finding) => finding.id)));
}

function buildSpeciesCounters(collection) {
  const counters = new Map();

  collection.species.forEach((species) => {
    let maxSuffix = 0;

    species.findings.forEach((finding) => {
      const match = String(finding.id).match(/-oopt-(\d+)$/);
      if (match) {
        maxSuffix = Math.max(maxSuffix, Number(match[1]));
      }
    });

    counters.set(species.id, maxSuffix);
  });

  return counters;
}

function pickRandomItem(items, rng) {
  return items[Math.floor(rng() * items.length)];
}

function randomYear(rng) {
  return 1995 + Math.floor(rng() * 31);
}

function generateFindings(collection, polygonIndex, options) {
  const rng = createRng(options.seed);
  const personNames = collectPersonNames(collection);
  const existingIds = collectExistingFindingIds(collection);
  const ooptCounters = buildSpeciesCounters(collection);
  const speciesPool = collection.species.filter((species) => species.findings?.length);

  if (speciesPool.length === 0) {
    throw new Error("No species with findings available in points.json");
  }

  const generated = [];
  let insideCount = 0;

  for (let index = 0; index < options.count; index += 1) {
    const species = pickRandomItem(speciesPool, rng);
    const nextCounter = (ooptCounters.get(species.id) ?? 0) + 1;
    ooptCounters.set(species.id, nextCounter);

    let findingId = `${species.id}-oopt-${String(nextCounter).padStart(3, "0")}`;
    while (existingIds.has(findingId)) {
      ooptCounters.set(species.id, ooptCounters.get(species.id) + 1);
      findingId = `${species.id}-oopt-${String(ooptCounters.get(species.id)).padStart(3, "0")}`;
    }
    existingIds.add(findingId);

    const placeInside = rng() < options.insideRatio;
    const coordinates = placeInside
      ? randomPointInPolygon(pickWeightedPolygon(polygonIndex, rng))
      : randomPointInRegion(rng);

    if (placeInside) {
      insideCount += 1;
    }

    const finding = {
      id: findingId,
      coordinates,
      found_by: pickRandomItem(personNames, rng),
      identified_by: pickRandomItem(personNames, rng),
      found_year: randomYear(rng)
    };

    species.findings.push(finding);
    generated.push({ speciesId: species.id, finding, inside: placeInside });
  }

  return { generated, insideCount };
}

function chunk(items, size) {
  const chunks = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function getFirebaseConfig() {
  const projectId =
    process.env.REACT_APP_FIREBASE_PROJECT_ID ||
    process.env.FIREBASE_PROJECT_ID ||
    defaultProjectId;

  const config = {
    apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
    authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
    projectId,
    storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.REACT_APP_FIREBASE_APP_ID
  };

  if (!config.apiKey || !config.projectId) {
    throw new Error(
      "Firebase config is missing. Add REACT_APP_FIREBASE_API_KEY and REACT_APP_FIREBASE_PROJECT_ID to flora/.env.local"
    );
  }

  return config;
}

async function writeFindingDocsWithClient(docs, firebaseConfig) {
  const { initializeApp } = await import("firebase/app");
  const { getFirestore, writeBatch, doc, collection } = await import("firebase/firestore");

  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);
  const batches = chunk(docs, 450);

  for (const [index, batchDocs] of batches.entries()) {
    const batch = writeBatch(db);

    batchDocs.forEach(({ id, data }) => {
      batch.set(doc(collection(db, FINDINGS_COLLECTION), id), data, { merge: true });
    });

    await batch.commit();
    console.log(`Committed batch ${index + 1}/${batches.length} (${batchDocs.length} documents)`);
  }
}

async function writeFindingDocsWithAdmin(docs, projectId) {
  const { default: admin } = await import("firebase-admin");

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId
    });
  }

  const db = admin.firestore();
  const batches = chunk(docs, 450);

  for (const [index, batchDocs] of batches.entries()) {
    const batch = db.batch();

    batchDocs.forEach(({ id, data }) => {
      batch.set(db.collection(FINDINGS_COLLECTION).doc(id), data, { merge: true });
    });

    await batch.commit();
    console.log(`Committed batch ${index + 1}/${batches.length} (${batchDocs.length} documents)`);
  }
}

async function importGeneratedDocs(generated, useAdmin) {
  const speciesById = new Map();

  generated.forEach((entry) => {
    if (!speciesById.has(entry.speciesId)) {
      const sourceSpecies = entry.sourceSpecies;
      speciesById.set(entry.speciesId, {
        id: sourceSpecies.id,
        regnum: sourceSpecies.regnum,
        status: sourceSpecies.status,
        family: sourceSpecies.family,
        name_ru: sourceSpecies.name_ru,
        name_latin: sourceSpecies.name_latin,
        description_md: sourceSpecies.description_md,
        findings: []
      });
    }

    speciesById.get(entry.speciesId).findings.push(entry.finding);
  });

  const partialCollection = {
    type: "SpeciesCollection",
    species: [...speciesById.values()]
  };

  const docs = speciesCollectionToFindingDocs(partialCollection, LOCATION_DATASETS.POINTS);
  const firebaseConfig = getFirebaseConfig();

  if (useAdmin) {
    await writeFindingDocsWithAdmin(docs, firebaseConfig.projectId);
  } else {
    console.log(`Importing via Firebase client SDK into project "${firebaseConfig.projectId}"...`);
    await writeFindingDocsWithClient(docs, firebaseConfig);
  }

  return docs.length;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  loadEnvFile(".env");
  loadEnvFile(".env.local");

  const collection = readSpeciesCollection();
  const boundsFeatures = readBoundsFeatures();
  const polygonIndex = buildPolygonIndex(boundsFeatures);
  const beforeCount = collection.species.reduce(
    (sum, species) => sum + (species.findings?.length ?? 0),
    0
  );

  const { generated, insideCount } = generateFindings(collection, polygonIndex, options);
  const afterCount = beforeCount + generated.length;

  console.log(`Bounds polygons loaded: ${boundsFeatures.length}`);
  console.log(`Generated findings: ${generated.length}`);
  console.log(
    `Inside OOPT polygons: ${insideCount} (${((insideCount / generated.length) * 100).toFixed(1)}%)`
  );
  console.log(`Findings total: ${beforeCount} -> ${afterCount}`);

  if (options.dryRun) {
    console.log("Sample new findings:");
    generated.slice(0, 5).forEach(({ speciesId, finding, inside }) => {
      console.log(
        `  ${finding.id} (${speciesId}) ${inside ? "inside" : "outside"} ${finding.coordinates.join(", ")}`
      );
    });
    console.log("Dry run only — points.json and Firestore were not modified.");
    return;
  }

  writeFileSync(POINTS_PATH, `${JSON.stringify(collection, null, 2)}\n`, "utf8");
  console.log(`Updated ${POINTS_PATH}`);

  if (options.importFirestore) {
    const speciesById = new Map(collection.species.map((species) => [species.id, species]));
    const importEntries = generated.map(({ speciesId, finding, inside }) => ({
      speciesId,
      finding,
      inside,
      sourceSpecies: speciesById.get(speciesId)
    }));

    const importedCount = await importGeneratedDocs(importEntries, options.useAdmin);
    console.log(`Imported ${importedCount} new documents into "${FINDINGS_COLLECTION}".`);
  } else {
    console.log('Run with --import to upload new findings to Firestore.');
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
