import { getFirebaseApp, isFirebaseConfigured } from "./config";
import {
  BOUNDS_LAYER_DEFINITIONS,
  BOUNDS_METADATA_DOC_ID,
  boundsFeatureDocsToGeoJSON,
  getBoundsCollectionName,
  getBoundsLayerDefinition
} from "./boundsCollectionFirestore";

/**
 * Загружает метаданные слоёв границ из документов `_metadata` в каждой коллекции.
 */
export async function loadBoundsLayersFromFirestore() {
  if (!isFirebaseConfigured()) {
    throw new Error("Firebase is not configured");
  }

  const [{ getFirestore, collection, doc, getDoc }, app] = await Promise.all([
    import("firebase/firestore"),
    getFirebaseApp()
  ]);

  const db = getFirestore(app);
  const layers = await Promise.all(
    BOUNDS_LAYER_DEFINITIONS.map(async (definition) => {
      const collectionName = getBoundsCollectionName(definition);
      const metadataSnap = await getDoc(
        doc(collection(db, collectionName), BOUNDS_METADATA_DOC_ID)
      );

      if (metadataSnap.exists()) {
        return {
          id: definition.id,
          collection: collectionName,
          ...(metadataSnap.data() ?? {})
        };
      }

      return {
        id: definition.id,
        collection: collectionName,
        layer_id: definition.id,
        source_file: definition.sourceFile,
        label: definition.label,
        kind: definition.kind
      };
    })
  );

  return layers.sort((left, right) =>
    String(left.label ?? "").localeCompare(String(right.label ?? ""), "ru")
  );
}

/**
 * Загружает один слой границ как GeoJSON FeatureCollection из его коллекции.
 */
export async function loadBoundsLayerGeoJSONFromFirestore(layerId) {
  if (!isFirebaseConfigured()) {
    throw new Error("Firebase is not configured");
  }

  const layerDefinition = getBoundsLayerDefinition(layerId);
  if (!layerDefinition) {
    throw new Error(`Unknown bounds layer id: ${layerId}`);
  }

  const [{ getFirestore, collection, getDocs }, app] = await Promise.all([
    import("firebase/firestore"),
    getFirebaseApp()
  ]);

  const db = getFirestore(app);
  const collectionName = getBoundsCollectionName(layerDefinition);
  const snapshot = await getDocs(collection(db, collectionName));

  return boundsFeatureDocsToGeoJSON(snapshot.docs);
}

/**
 * Загружает все слои границ как GeoJSON FeatureCollection по layer_id.
 */
export async function loadAllBoundsLayersGeoJSONFromFirestore() {
  const layers = await loadBoundsLayersFromFirestore();
  const entries = await Promise.all(
    layers.map(async (layer) => [
      layer.layer_id ?? layer.id,
      await loadBoundsLayerGeoJSONFromFirestore(layer.layer_id ?? layer.id)
    ])
  );

  return Object.fromEntries(entries);
}
