import { getFirebaseApp } from "./config";

const SUBMISSIONS_COLLECTION = "user_submissions";

/**
 * Сохраняет пользовательскую находку в Firestore (тестовый модуль).
 * Данные не попадают на карту автоматически — только в коллекцию для проверки.
 */
export async function submitUserFinding(payload) {
  const [{ getFirestore, collection, addDoc, serverTimestamp }, app] =
    await Promise.all([import("firebase/firestore"), getFirebaseApp()]);

  const db = getFirestore(app);

  return addDoc(collection(db, SUBMISSIONS_COLLECTION), {
    ...payload,
    source: "flora35-test",
    submittedAt: serverTimestamp()
  });
}
