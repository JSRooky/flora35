import { getFirebaseApp, isFirebaseConfigured } from "./config";
import {
  SUBMISSIONS_COLLECTION,
  submissionDocsToSpeciesCollection
} from "./speciesCollectionFirestore";

const EMPTY_SPECIES_COLLECTION = {
  type: "SpeciesCollection",
  species: []
};

/**
 * Загружает точки карты из Firestore.
 * Проверенные (findings) пока не подключаем — только user_submissions.
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
  const submissionsSnapshot = await getDocs(
    collection(db, SUBMISSIONS_COLLECTION)
  );

  return {
    points: EMPTY_SPECIES_COLLECTION,
    userpoints: submissionDocsToSpeciesCollection(submissionsSnapshot.docs)
  };
}
