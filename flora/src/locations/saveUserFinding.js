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

  const refreshed = await refreshLocationsFromFirestore();
  if (!refreshed) {
    // Запись в Firestore прошла успешно, но перечитать коллекции не удалось —
    // сообщаем об этом явно, иначе UI покажет «Сохранено», а точка не появится на карте.
    throw new Error(
      "Находка сохранена, но не удалось обновить карту. Обновите страницу, чтобы увидеть точку."
    );
  }
}
