import { isFirebaseConfigured, getFirebaseApp } from "./config";
import { MERGED_POINTS_COLLECTION } from "./mergedPointsFirestore";

/**
 * Удаляет слитую точку из Firestore.
 * @param {string} docId
 * @returns {Promise<void>}
 */
export async function deleteMergedPoint(docId) {
  if (!isFirebaseConfigured()) {
    throw new Error("Firebase не настроен. Добавьте переменные окружения Firebase.");
  }

  const id = String(docId ?? "").trim();
  if (!id) {
    throw new Error("Нельзя отменить слияние: нет идентификатора точки.");
  }

  const [{ getFirestore, doc, deleteDoc }, app] = await Promise.all([
    import("firebase/firestore"),
    getFirebaseApp()
  ]);

  const db = getFirestore(app);
  await deleteDoc(doc(db, MERGED_POINTS_COLLECTION, id));
}
