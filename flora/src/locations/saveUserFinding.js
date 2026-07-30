import { isFirebaseConfigured } from "../firebase/config";
import { submitUserFinding } from "../firebase/submitFinding";

const API_PATH = `${process.env.PUBLIC_URL || ""}/api/userpoints`;

/**
 * Сохраняет пользовательскую находку.
 * При настроенном Firebase — в Firestore (коллекция user_submissions).
 * Иначе — в src/locations/userpoints.json (только npm start).
 * @returns {Promise<{ type: string, species: object[] } | null>}
 */
export async function saveUserFinding(payload) {
  if (isFirebaseConfigured()) {
    await submitUserFinding(payload);
    return null;
  }

  const response = await fetch(API_PATH, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json();

  if (!response.ok || !data.ok) {
    throw new Error(data.error || "Не удалось сохранить данные.");
  }

  return data.collection;
}
