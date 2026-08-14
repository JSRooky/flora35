import { isFirebaseConfigured, getFirebaseApp } from "./config";
import { MERGED_POINTS_COLLECTION } from "./mergedPointsFirestore";
import { buildMergedPointFromMatch } from "../dataWork/buildMergedPoint";

/**
 * Сохраняет объединённую точку в Firestore.
 * @param {{ left?: object, right?: object, nameLatin?: string, distanceMeters?: number }} match
 * @returns {Promise<{ docId: string, feature: object, hiddenKeys: string[] }>}
 */
export async function submitMergedPoint(match) {
  if (!isFirebaseConfigured()) {
    throw new Error("Firebase не настроен. Добавьте переменные окружения Firebase.");
  }

  const built = buildMergedPointFromMatch(match);
  const [{ getFirestore, doc, setDoc, serverTimestamp }, app] = await Promise.all([
    import("firebase/firestore"),
    getFirebaseApp()
  ]);

  const db = getFirestore(app);
  await setDoc(doc(db, MERGED_POINTS_COLLECTION, built.docId), {
    ...built.record,
    createdAt: serverTimestamp()
  });

  return {
    docId: built.docId,
    feature: built.feature,
    hiddenKeys: built.hiddenKeys
  };
}
