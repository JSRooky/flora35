const API_PATH = `${process.env.PUBLIC_URL || ""}/api/userpoints`;

/**
 * Сохраняет пользовательскую находку в src/locations/userpoints.json (только npm start).
 * @returns {Promise<{ type: string, species: object[] }>}
 */
export async function saveUserFinding(payload) {
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
