import { isFirebaseConfigured } from "../firebase/config";
import { submitUserFinding } from "../firebase/submitFinding";
import { refreshLocationsFromFirestore } from "./loadPoints";

/**
 * Сохраняет пользовательскую находку в Firestore (коллекция user_submissions)
 * и обновляет данные на карте из базы.
 */
export async function saveUserFinding(payload) {
  if (!isFirebaseConfigured()) {
    throw new Error("Firebase не настроен. Добавьте переменные окружения Firebase.");
  }

  await submitUserFinding(payload);
  await refreshLocationsFromFirestore();
}
