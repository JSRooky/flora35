import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const floraRoot = join(__dirname, "..");
import {
  SUBMISSIONS_COLLECTION,
  LOCATION_DATASETS,
  buildFirestoreDocId
} from "../src/firebase/speciesCollectionFirestore.js";
import { DEFAULT_SPECIES_DESCRIPTION_MD } from "../src/locations/defaultSpeciesDescription.js";
const dryRun = process.argv.includes("--dry-run");
const useAdmin = process.argv.includes("--admin");
const defaultProjectId = "redbook35-fa3f7";

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

function readSpeciesCollection(relativePath) {
  const absolutePath = join(floraRoot, relativePath);
  const collection = JSON.parse(readFileSync(absolutePath, "utf8"));

  if (collection.type !== "SpeciesCollection" || !Array.isArray(collection.species)) {
    throw new Error(`${relativePath} is not a SpeciesCollection`);
  }

  return collection;
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
      "Firebase config is missing. Add REACT_APP_FIREBASE_API_KEY and REACT_APP_FIREBASE_PROJECT_ID to flora/.env"
    );
  }

  return config;
}

/**
 * Разворачивает userpoints.json в документы коллекции user_submissions
 * (тот же формат, что и submitUserFinding в приложении).
 */
function userpointsToSubmissionDocs(collection) {
  const docs = [];

  collection.species.forEach((species) => {
    (species.findings ?? []).forEach((finding) => {
      const findingId = finding.id;
      if (!findingId) {
        throw new Error(`Finding without id in species "${species.id}"`);
      }

      docs.push({
        id: buildFirestoreDocId(LOCATION_DATASETS.USERPOINTS, findingId),
        data: {
          name_ru: species.name_ru ?? "",
          name_latin: species.name_latin ?? "",
          regnum: species.regnum ?? "",
          status: species.status ?? "",
          family: species.family ?? "",
          found_year: finding.found_year ?? null,
          found_by: finding.found_by ?? "",
          identified_by: finding.identified_by ?? "",
          coordinates: finding.coordinates,
          finding_id: findingId,
          species_id: species.id,
          description_md: species.description_md ?? DEFAULT_SPECIES_DESCRIPTION_MD,
          source: "userpoints-json"
        }
      });
    });
  });

  return docs;
}

async function writeSubmissionDocsWithClient(docs, firebaseConfig) {
  const { initializeApp } = await import("firebase/app");
  const { getFirestore, writeBatch, doc, collection, serverTimestamp } = await import(
    "firebase/firestore"
  );

  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);
  const batches = chunk(docs, 450);

  for (const [index, batchDocs] of batches.entries()) {
    const batch = writeBatch(db);

    batchDocs.forEach(({ id, data }) => {
      batch.set(doc(collection(db, SUBMISSIONS_COLLECTION), id), {
        ...data,
        submittedAt: serverTimestamp()
      });
    });

    await batch.commit();
    console.log(`Committed batch ${index + 1}/${batches.length} (${batchDocs.length} documents)`);
  }
}

async function writeSubmissionDocsWithAdmin(docs, projectId) {
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
      batch.set(
        db.collection(SUBMISSIONS_COLLECTION).doc(id),
        {
          ...data,
          submittedAt: admin.firestore.FieldValue.serverTimestamp()
        },
        { merge: false }
      );
    });

    await batch.commit();
    console.log(`Committed batch ${index + 1}/${batches.length} (${batchDocs.length} documents)`);
  }
}

async function main() {
  loadEnvFile(".env");
  loadEnvFile(".env.local");

  const userpoints = readSpeciesCollection("src/locations/userpoints.json");
  const docs = userpointsToSubmissionDocs(userpoints);

  const ids = new Set();
  docs.forEach(({ id }) => {
    if (ids.has(id)) {
      throw new Error(`Duplicate Firestore document id: ${id}`);
    }
    ids.add(id);
  });

  console.log(`Prepared ${docs.length} submissions from userpoints.json`);
  console.log(`Target collection: "${SUBMISSIONS_COLLECTION}"`);

  if (dryRun) {
    docs.forEach(({ id, data }) => {
      console.log(`  ${id}: ${data.name_latin} (${data.finding_id})`);
    });
    console.log("Dry run only — Firestore was not modified.");
    return;
  }

  const firebaseConfig = getFirebaseConfig();

  if (useAdmin) {
    await writeSubmissionDocsWithAdmin(docs, firebaseConfig.projectId);
  } else {
    console.log(`Importing via Firebase client SDK into project "${firebaseConfig.projectId}"...`);
    await writeSubmissionDocsWithClient(docs, firebaseConfig);
  }

  console.log(
    `Imported ${docs.length} documents into Firestore project "${firebaseConfig.projectId}".`
  );
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
