import { isFirebaseConfigured, getFirebaseApp } from "./config";
import {
  POINT_ATTRIBUTIONS_COLLECTION,
  buildPointAttributionDocId
} from "./pointAttributionsFirestore";
import { ATTRIBUTION_FIELDS, isEmptyAttr } from "../dataWork/findUnattributedPoints";
import {
  getAttributionOverlay,
  upsertAttributionOverlay
} from "../dataWork/pointAttributionOverlay";
import { invalidateVisibleAttributionCaches } from "../components/addLocationsLayer";

/**
 * Сохраняет правки атрибуции точки в Firestore и обновляет in-memory overlay.
 *
 * @param {{
 *   pointKey: string,
 *   source?: string,
 *   attributes: Record<string, unknown>,
 *   coordinates?: number[]|null
 * }} payload
 * @returns {Promise<{ docId: string, attributes: Record<string, unknown> }>}
 */
export async function submitPointAttribution(payload) {
  if (!isFirebaseConfigured()) {
    throw new Error("Firebase не настроен. Добавьте переменные окружения Firebase.");
  }

  const pointKey = String(payload?.pointKey ?? "").trim();
  if (!pointKey) {
    throw new Error("Нельзя сохранить: нет идентификатора точки.");
  }

  const attributes = {};
  ATTRIBUTION_FIELDS.forEach((field) => {
    const value = payload?.attributes?.[field];
    if (!isEmptyAttr(value)) {
      attributes[field] =
        field === "found_year" ? Number(value) : String(value).trim();
    }
  });

  if (Object.keys(attributes).length === 0) {
    throw new Error("Заполните хотя бы одно пустое поле.");
  }

  if (
    attributes.found_year != null &&
    !Number.isFinite(attributes.found_year)
  ) {
    throw new Error("Год находки должен быть числом.");
  }

  // Firestore merge мелкий: attributes нужно слить на клиенте.
  const mergedAttributes = {
    ...(getAttributionOverlay(pointKey) ?? {}),
    ...attributes
  };

  const docId = buildPointAttributionDocId(pointKey);
  const [{ getFirestore, doc, setDoc, serverTimestamp }, app] = await Promise.all([
    import("firebase/firestore"),
    getFirebaseApp()
  ]);

  const db = getFirestore(app);
  await setDoc(
    doc(db, POINT_ATTRIBUTIONS_COLLECTION, docId),
    {
      point_key: pointKey,
      source: payload?.source || null,
      coordinates: Array.isArray(payload?.coordinates) ? payload.coordinates : null,
      attributes: mergedAttributes,
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );

  upsertAttributionOverlay(pointKey, mergedAttributes);
  invalidateVisibleAttributionCaches();

  return { docId, attributes: mergedAttributes };
}
