import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  FINDINGS_COLLECTION,
  SUBMISSIONS_COLLECTION
} from "../src/firebase/speciesCollectionFirestore.js";
import {
  COLLECTION_SCHEMAS,
  ensureSpeciesCollectionDescription,
  inspectFirestoreDocument
} from "./firestoreLocationSchema.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const floraRoot = join(__dirname, "..");
const dryRun = process.argv.includes("--dry-run");
const fixLocal = process.argv.includes("--fix-local");
const fixFirestore = process.argv.includes("--fix-firestore");
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

  return { relativePath, absolutePath, collection };
}

function writeSpeciesCollection(absolutePath, collection) {
  writeFileSync(absolutePath, `${JSON.stringify(collection, null, 2)}\n`, "utf8");
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

function auditLocalCollections() {
  console.log("\n=== Local SpeciesCollection files ===\n");

  const files = [
    readSpeciesCollection("src/locations/points.json"),
    readSpeciesCollection("src/locations/userpoints.json")
  ];

  let totalUpdated = 0;

  files.forEach(({ relativePath, absolutePath, collection }) => {
    const missing = collection.species.filter((species) => !species.description_md);
    console.log(`${relativePath}: ${collection.species.length} species, ${missing.length} without description_md`);

    if (missing.length > 0) {
      missing.forEach((species) => {
        console.log(`  - ${species.id}`);
      });
    }

    if (fixLocal && missing.length > 0) {
      const updated = ensureSpeciesCollectionDescription(collection);
      writeSpeciesCollection(absolutePath, collection);
      console.log(`  Updated ${updated} species in ${relativePath}`);
      totalUpdated += updated;
    }
  });

  if (fixLocal) {
    console.log(`\nLocal fix complete: ${totalUpdated} species updated.`);
  } else if (totalUpdated === 0) {
    console.log("\nRun with --fix-local to add missing description_md to local JSON files.");
  }
}

function printCollectionSchemaSummary() {
  console.log("\n=== Expected Firestore structure ===\n");

  Object.entries(COLLECTION_SCHEMAS).forEach(([collectionName, schema]) => {
    console.log(`${collectionName} (${schema.label}):`);

    Object.entries(schema.fields).forEach(([fieldName, rule]) => {
      const requiredLabel = rule.required ? "required" : "optional";
      console.log(`  - ${fieldName}: ${rule.type}, ${requiredLabel}`);
    });

    console.log("");
  });
}

async function readFirestoreCollections(firebaseConfig) {
  if (useAdmin) {
    const { default: admin } = await import("firebase-admin");

    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        projectId: firebaseConfig.projectId
      });
    }

    const db = admin.firestore();
    const [findingsSnapshot, submissionsSnapshot] = await Promise.all([
      db.collection(FINDINGS_COLLECTION).get(),
      db.collection(SUBMISSIONS_COLLECTION).get()
    ]);

    return {
      [FINDINGS_COLLECTION]: findingsSnapshot.docs.map((doc) => ({
        id: doc.id,
        data: doc.data()
      })),
      [SUBMISSIONS_COLLECTION]: submissionsSnapshot.docs.map((doc) => ({
        id: doc.id,
        data: doc.data()
      }))
    };
  }

  const { initializeApp } = await import("firebase/app");
  const { getFirestore, collection, getDocs } = await import("firebase/firestore");

  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);
  const [findingsSnapshot, submissionsSnapshot] = await Promise.all([
    getDocs(collection(db, FINDINGS_COLLECTION)),
    getDocs(collection(db, SUBMISSIONS_COLLECTION))
  ]);

  return {
    [FINDINGS_COLLECTION]: findingsSnapshot.docs.map((doc) => ({
      id: doc.id,
      data: doc.data()
    })),
    [SUBMISSIONS_COLLECTION]: submissionsSnapshot.docs.map((doc) => ({
      id: doc.id,
      data: doc.data()
    }))
  };
}

async function applyFirestorePatches(firebaseConfig, patchesByCollection) {
  if (useAdmin) {
    const { default: admin } = await import("firebase-admin");

    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        projectId: firebaseConfig.projectId
      });
    }

    const db = admin.firestore();

    for (const [collectionName, patches] of Object.entries(patchesByCollection)) {
      const batches = chunk(patches, 450);

      for (const [index, batchPatches] of batches.entries()) {
        const batch = db.batch();

        batchPatches.forEach(({ id, patch }) => {
          batch.set(db.collection(collectionName).doc(id), patch, { merge: true });
        });

        await batch.commit();
        console.log(
          `Committed ${collectionName} batch ${index + 1}/${batches.length} (${batchPatches.length} documents)`
        );
      }
    }

    return;
  }

  const { initializeApp } = await import("firebase/app");
  const { getFirestore, writeBatch, doc, collection } = await import("firebase/firestore");

  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);

  for (const [collectionName, patches] of Object.entries(patchesByCollection)) {
    const batches = chunk(patches, 450);

    for (const [index, batchPatches] of batches.entries()) {
      const batch = writeBatch(db);

      batchPatches.forEach(({ id, patch }) => {
        batch.set(doc(collection(db, collectionName), id), patch, { merge: true });
      });

      await batch.commit();
      console.log(
        `Committed ${collectionName} batch ${index + 1}/${batches.length} (${batchPatches.length} documents)`
      );
    }
  }
}

async function auditFirestoreCollections() {
  console.log("\n=== Firestore collections ===\n");

  const firebaseConfig = getFirebaseConfig();
  console.log(`Project: ${firebaseConfig.projectId}`);

  const collections = await readFirestoreCollections(firebaseConfig);
  const patchesByCollection = {
    [FINDINGS_COLLECTION]: [],
    [SUBMISSIONS_COLLECTION]: []
  };

  let totalDocs = 0;
  let docsWithIssues = 0;
  let docsFixable = 0;

  for (const [collectionName, docs] of Object.entries(collections)) {
    console.log(`\n${collectionName}: ${docs.length} documents`);

    docs.forEach(({ id, data }) => {
      totalDocs += 1;
      const { issues, patches } = inspectFirestoreDocument(collectionName, data, id);

      if (issues.length === 0) {
        return;
      }

      docsWithIssues += 1;
      console.log(`  ${id}:`);
      issues.forEach((issue) => {
        console.log(`    - ${issue}`);
      });

      if (Object.keys(patches).length > 0) {
        docsFixable += 1;
        patchesByCollection[collectionName].push({ id, patch: patches });

        if (dryRun || !fixFirestore) {
          console.log(`    patch: ${JSON.stringify(patches)}`);
        }
      }
    });
  }

  console.log(
    `\nSummary: ${totalDocs} documents, ${docsWithIssues} with issues, ${docsFixable} auto-fixable`
  );

  if (docsWithIssues === 0) {
    console.log("All Firestore documents match the expected structure.");
    return;
  }

  if (!fixFirestore) {
    console.log("\nRun with --fix-firestore to apply auto-fixable patches (merge).");
    return;
  }

  if (dryRun) {
    console.log("\nDry run — Firestore was not modified.");
    return;
  }

  const totalPatches =
    patchesByCollection[FINDINGS_COLLECTION].length +
    patchesByCollection[SUBMISSIONS_COLLECTION].length;

  if (totalPatches === 0) {
    console.log("\nNo auto-fixable patches available.");
    return;
  }

  console.log(`\nApplying ${totalPatches} patches...`);
  await applyFirestorePatches(firebaseConfig, patchesByCollection);
  console.log("Firestore patches applied.");
}

async function main() {
  loadEnvFile(".env");
  loadEnvFile(".env.local");

  printCollectionSchemaSummary();
  auditLocalCollections();

  try {
    await auditFirestoreCollections();
  } catch (error) {
    if (error.message?.includes("Firebase config is missing")) {
      console.log("\nFirestore audit skipped: Firebase config is not available.");
      return;
    }

    throw error;
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
