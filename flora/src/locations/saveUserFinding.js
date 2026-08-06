import { isFirebaseConfigured } from "../firebase/config";
import { submitUserFinding } from "../firebase/submitFinding";
import { refreshLocationsFromFirestore } from "./loadPoints";

// Обновляет данные карты из Firestore после сохранения находки(ок);
// если обновление не удалось, бросает ошибку (сама находка при этом уже сохранена).
async function refreshMapAfterSave({ count = 1 } = {}) {
  const refreshed = await refreshLocationsFromFirestore();
  if (!refreshed) {
    const pointLabel = count === 1 ? "точку" : "точки";
    const savedLabel =
      count === 1
        ? "Находка сохранена, но не удалось обновить карту."
        : "Находки сохранены, но не удалось обновить карту.";

    throw new Error(
      `${savedLabel} Обновите страницу, чтобы увидеть ${pointLabel}.`
    );
  }
}

/** Сохраняет пользовательскую находку в Firestore (коллекция user_submissions) и обновляет карту. */
export async function saveUserFinding(payload) {
  if (!isFirebaseConfigured()) {
    throw new Error("Firebase не настроен. Добавьте переменные окружения Firebase.");
  }

  await submitUserFinding(payload);
  await refreshMapAfterSave();
}

/** Сохраняет несколько находок одного вида и один раз обновляет карту. */
export async function saveUserFindings(payloads) {
  if (!isFirebaseConfigured()) {
    throw new Error("Firebase не настроен. Добавьте переменные окружения Firebase.");
  }

  if (payloads.length === 0) {
    throw new Error("Нет координат для сохранения.");
  }

  await Promise.all(payloads.map((payload) => submitUserFinding(payload)));
  await refreshMapAfterSave({ count: payloads.length });
}
