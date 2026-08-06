import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BOUNDS_LAYER_DEFINITIONS,
  analyzeBoundsCollectionDocs,
  geojsonToBoundsCollectionDocs,
  getBoundsCollectionName,
  getBoundsLayerIdFromSourceFile
} from "../src/firebase/boundsCollectionFirestore.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const floraRoot = join(__dirname, "..");
const boundsDir = join(floraRoot, "src/bounds");
const dryRun = process.argv.includes("--dry-run");
const useAdmin = process.argv.includes("--admin");
const defaultProjectId = "redbook35-fa3f7";
const FIRESTORE_DOC_LIMIT_BYTES = 1_048_576;

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

function chunk(items, size) {
  const chunks = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function readBoundsGeojson(sourceFile) {
  const absolutePath = join(boundsDir, sourceFile);
  const collection = JSON.parse(readFileSync(absolutePath, "utf8"));

  if (collection.type !== "FeatureCollection" || !Array.isArray(collection.features)) {
    throw new Error(`${sourceFile} is not a FeatureCollection`);
  }

  return collection;
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

function prepareImportPayload() {
  const collections = [];
  const stats = [];

  BOUNDS_LAYER_DEFINITIONS.forEach((layerDefinition) => {
    const geojson = readBoundsGeojson(layerDefinition.sourceFile);
    const payload = geojsonToBoundsCollectionDocs(layerDefinition, geojson);
    const analysis = analyzeBoundsCollectionDocs(payload.metadataDoc, payload.featureDocs);

    collections.push(payload);
    stats.push({
      layerId: layerDefinition.id,
      sourceFile: layerDefinition.sourceFile,
      collectionName: payload.collectionName,
      ...analysis
    });
  });

  collections.forEach(({ collectionName, metadataDoc, featureDocs }) => {
    const ids = new Set([metadataDoc.id, ...featureDocs.map((doc) => doc.id)]);
    if (ids.size !== featureDocs.length + 1) {
      throw new Error(`Duplicate Firestore document ids in collection "${collectionName}"`);
    }
  });

  return { collections, stats };
}

async function writeDocsWithClient(docs, collectionName, firebaseConfig) {
  const { initializeApp } = await import("firebase/app");
  const { getFirestore, writeBatch, doc, collection } = await import("firebase/firestore");

  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);
  const batches = chunk(docs, 450);

  for (const [index, batchDocs] of batches.entries()) {
    const batch = writeBatch(db);

    batchDocs.forEach(({ id, data }) => {
      batch.set(doc(collection(db, collectionName), id), data);
    });

    await batch.commit();
    console.log(
      `[${collectionName}] committed batch ${index + 1}/${batches.length} (${batchDocs.length} documents)`
    );
  }
}

async function writeDocsWithAdmin(docs, collectionName, projectId) {
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
      batch.set(db.collection(collectionName).doc(id), data, { merge: false });
    });

    await batch.commit();
    console.log(
      `[${collectionName}] committed batch ${index + 1}/${batches.length} (${batchDocs.length} documents)`
    );
  }
}

function printStats(stats) {
  console.log("Bounds import analysis (one Firestore collection per GeoJSON file):");
  stats.forEach((item) => {
    console.log(
      `- ${item.sourceFile} -> ${item.collectionName}: ${item.featureCount} features + _metadata, max doc ${item.maxFeatureBytes} bytes, over 1 MiB: ${item.overLimitCount}`
    );
  });

  const blocked = stats.filter((item) => item.overLimitCount > 0);
  if (blocked.length) {
    throw new Error(
      `Cannot import: ${blocked.length} collection(s) contain documents larger than ${FIRESTORE_DOC_LIMIT_BYTES} bytes`
    );
  }

  const totalDocs = stats.reduce(
    (sum, item) => sum + item.featureCount + 1,
    0
  );
  console.log(`Prepared ${stats.length} collections, ${totalDocs} documents total`);
}

async function main() {
  loadEnvFile(".env");
  loadEnvFile(".env.local");

  const availableFiles = readdirSync(boundsDir).filter((name) => name.endsWith(".geojson"));
  const missingDefinitions = availableFiles.filter(
    (fileName) => !getBoundsLayerIdFromSourceFile(fileName)
  );

  if (missingDefinitions.length) {
    console.warn(
      `Warning: GeoJSON files without layer definitions: ${missingDefinitions.join(", ")}`
    );
  }

  const { collections, stats } = prepareImportPayload();
  printStats(stats);

  if (dryRun) {
    console.log("Dry run only — Firestore was not modified.");
    return;
  }

  const firebaseConfig = getFirebaseConfig();
  const writeDocs = useAdmin ? writeDocsWithAdmin : writeDocsWithClient;

  for (const { collectionName, metadataDoc, featureDocs } of collections) {
    const docs = [metadataDoc, ...featureDocs];

    if (useAdmin) {
      await writeDocs(docs, collectionName, firebaseConfig.projectId);
    } else {
      console.log(`Importing collection "${collectionName}"...`);
      await writeDocs(docs, collectionName, firebaseConfig);
    }
  }

  console.log(
    `Imported ${collections.length} collections into Firestore project "${firebaseConfig.projectId}".`
  );
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
