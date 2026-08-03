import { isFirebaseConfigured } from "../firebase/config";
import { submitUserFinding } from "../firebase/submitFinding";
import { appendUserSubmission } from "./loadPoints";

const API_PATH = `${process.env.PUBLIC_URL || ""}/api/userpoints`;

/**
 * Сохраняет пользовательскую находку.
 * При настроенном Firebase — в Firestore (коллекция user_submissions).
 * Иначе — в src/locations/userpoints.json (только npm start).
 * @returns {Promise<{ type: string, species: object[] }>}
 */
export async function saveUserFinding(payload) {
  if (isFirebaseConfigured()) {
    const { finding_id: findingId } = await submitUserFinding(payload);
    return appendUserSubmission(payload, findingId);
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
