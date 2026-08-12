import { isFirebaseConfigured, getFirebaseApp } from "./config";
import { POINT_ATTRIBUTIONS_COLLECTION } from "./pointAttributionsFirestore";
import { setAttributionOverlays } from "../dataWork/pointAttributionOverlay";
import { invalidateVisibleAttributionCaches } from "../components/addLocationsLayer";

/**
 * Загружает правки атрибуции из Firestore в in-memory overlay.
 * @returns {Promise<{ count: number }>}
 */
export async function loadPointAttributionsFromFirestore() {
  if (!isFirebaseConfigured()) {
    setAttributionOverlays([]);
    return { count: 0 };
  }

  const [{ getFirestore, collection, getDocs }, app] = await Promise.all([
    import("firebase/firestore"),
    getFirebaseApp()
  ]);

  const db = getFirestore(app);
  const snapshot = await getDocs(collection(db, POINT_ATTRIBUTIONS_COLLECTION));
  const entries = [];

  snapshot.docs.forEach((docSnap) => {
    const record = docSnap.data();
    const pointKey = record?.point_key || docSnap.id;
    const attributes = record?.attributes;
    if (!pointKey || !attributes || typeof attributes !== "object") {
      return;
    }

    entries.push([String(pointKey), attributes]);
  });

  setAttributionOverlays(entries);
  invalidateVisibleAttributionCaches();
  return { count: entries.length };
}
