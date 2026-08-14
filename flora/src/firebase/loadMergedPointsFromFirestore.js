import { isFirebaseConfigured, getFirebaseApp } from "./config";
import { MERGED_POINTS_COLLECTION } from "./mergedPointsFirestore";
import {
  collectHiddenKeysFromMerged,
  mergedRecordToFeature
} from "../dataWork/buildMergedPoint";

/**
 * Загружает слитые точки из Firestore.
 * @returns {Promise<{
 *   features: object[],
 *   collection: GeoJSON.FeatureCollection,
 *   hiddenKeys: string[]
 * }>}
 */
export async function loadMergedPointsFromFirestore() {
  if (!isFirebaseConfigured()) {
    return {
      features: [],
      collection: { type: "FeatureCollection", features: [] },
      hiddenKeys: []
    };
  }

  const [{ getFirestore, collection, getDocs }, app] = await Promise.all([
    import("firebase/firestore"),
    getFirebaseApp()
  ]);

  const db = getFirestore(app);
  const snapshot = await getDocs(collection(db, MERGED_POINTS_COLLECTION));
  const records = [];
  const features = [];

  snapshot.docs.forEach((docSnap) => {
    const record = docSnap.data();
    if (!record) {
      return;
    }

    records.push(record);
    const feature = mergedRecordToFeature(record, docSnap.id);
    if (feature) {
      features.push(feature);
    }
  });

  return {
    features,
    collection: {
      type: "FeatureCollection",
      features
    },
    hiddenKeys: collectHiddenKeysFromMerged(records)
  };
}
