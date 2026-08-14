import { getFirebaseApp, isFirebaseConfigured } from "./config";
import {
  FINDINGS_COLLECTION,
  LOCATION_DATASETS,
  SUBMISSIONS_COLLECTION,
  findingDocsToSpeciesCollection,
  submissionDocsToSpeciesCollection
} from "./speciesCollectionFirestore";

/**
 * Загружает точки карты из Firestore:
 * findings (dataset=points) — проверенные, user_submissions — пользовательские.
 */
export async function loadLocationsFromFirestore() {
  if (!isFirebaseConfigured()) {
    throw new Error("Firebase is not configured");
  }

  const [{ getFirestore, collection, getDocs }, app] = await Promise.all([
    import("firebase/firestore"),
    getFirebaseApp()
  ]);

  const db = getFirestore(app);
  const [findingsSnapshot, submissionsSnapshot] = await Promise.all([
    getDocs(collection(db, FINDINGS_COLLECTION)),
    getDocs(collection(db, SUBMISSIONS_COLLECTION))
  ]);

  return {
    points: findingDocsToSpeciesCollection(
      findingsSnapshot.docs,
      LOCATION_DATASETS.POINTS
    ),
    userpoints: submissionDocsToSpeciesCollection(submissionsSnapshot.docs)
  };
}
