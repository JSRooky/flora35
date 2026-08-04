export const BOUNDS_METADATA_DOC_ID = "_metadata";

export const BOUNDS_LAYER_KINDS = {
  POLYGON: "polygon",
  POINT: "point"
};

/** Описание слоёв, соответствующих GeoJSON-файлам в src/bounds. */
export const BOUNDS_LAYER_DEFINITIONS = [
  {
    id: "nature_reserve_polygon",
    sourceFile: "nature_reserve-polygon.geojson",
    label: "Заповедники",
    kind: BOUNDS_LAYER_KINDS.POLYGON
  },
  {
    id: "oopt_pol",
    sourceFile: "oopt_pol.geojson",
    label: "ООПТ",
    kind: BOUNDS_LAYER_KINDS.POLYGON
  }
];

const layerDefinitionById = new Map(
  BOUNDS_LAYER_DEFINITIONS.map((definition) => [definition.id, definition])
);

/** Имя отдельной коллекции Firestore для одного GeoJSON-файла. */
export function getBoundsCollectionName(layerDefinitionOrId) {
  const layerId =
    typeof layerDefinitionOrId === "string"
      ? layerDefinitionOrId
      : layerDefinitionOrId?.id;

  if (!layerId) {
    throw new Error("Cannot resolve bounds collection name without layer id");
  }

  return `bounds_${layerId}`;
}

export function getBoundsLayerDefinition(layerId) {
  return layerDefinitionById.get(layerId) ?? null;
}

export function getBoundsLayerIdFromSourceFile(sourceFile) {
  const definition = BOUNDS_LAYER_DEFINITIONS.find(
    (item) => item.sourceFile === sourceFile
  );
  return definition?.id ?? null;
}

function normalizePropertyValue(value) {
  if (value === undefined) {
    return null;
  }

  if (typeof value === "number" && !Number.isFinite(value)) {
    return null;
  }

  return value;
}

/** Приводит properties GeoJSON к плоскому объекту, совместимому с Firestore. */
export function normalizeBoundsProperties(properties = {}) {
  return Object.fromEntries(
    Object.entries(properties).map(([key, value]) => [key, normalizePropertyValue(value)])
  );
}

/** Читабельное название объекта для UI и поиска. */
export function getBoundsFeatureTitle(properties = {}) {
  const nameCandidate =
    properties.title ??
    properties.NAME_RU ??
    properties.NAME ??
    properties.name;

  if (nameCandidate != null && nameCandidate !== "") {
    return String(nameCandidate);
  }

  const idCandidate = properties.nid ?? properties.OSM_ID ?? properties.id;

  if (idCandidate != null && idCandidate !== "") {
    return `Объект ${idCandidate}`;
  }

  return "";
}

function buildFeatureKey(properties = {}, featureIndex) {
  const rawKey =
    properties.nid ??
    properties.OSM_ID ??
    properties.id ??
    featureIndex;

  return String(rawKey).replace(/[^\w.-]+/g, "_");
}

/** ID документа Firestore для одного GeoJSON feature внутри коллекции слоя. */
export function buildBoundsFeatureDocId(properties, featureIndex) {
  return buildFeatureKey(properties, featureIndex);
}

/** Составной ключ объекта bounds для UI и состояния видимости. */
export function getBoundsFeatureKey(layerId, properties, featureIndex = 0) {
  return `${layerId}:${buildBoundsFeatureDocId(properties, featureIndex)}`;
}

export function parseBoundsFeatureKey(featureKey) {
  const colonIndex = featureKey.indexOf(":");
  if (colonIndex === -1) {
    return null;
  }

  return {
    layerId: featureKey.slice(0, colonIndex),
    docId: featureKey.slice(colonIndex + 1)
  };
}

function getBoundsFeatureSubtitle(layerId, properties = {}) {
  if (layerId === "oopt_pol") {
    return properties.category_t ?? properties.status_tit ?? null;
  }

  if (layerId === "nature_reserve_polygon") {
    const boundaryLabels = {
      national_park: "Национальный парк",
      protected_area: "ООПТ",
      boundary: "Граница"
    };

    return boundaryLabels[properties.BOUNDARY] ?? null;
  }

  return null;
}

/** Краткий каталог объектов слоя для списка в панели ООПТ. */
export function buildBoundsCatalogFromGeoJSON(layerId, featureCollection) {
  const features = Array.isArray(featureCollection?.features) ? featureCollection.features : [];

  return features
    .map((feature, featureIndex) => {
      const properties = feature.properties ?? {};
      const title = getBoundsFeatureTitle(properties);

      return {
        key: getBoundsFeatureKey(layerId, properties, featureIndex),
        layerId,
        featureIndex,
        title: title || `Объект ${featureIndex + 1}`,
        subtitle: getBoundsFeatureSubtitle(layerId, properties)
      };
    })
    .sort((left, right) => left.title.localeCompare(right.title, "ru", { numeric: true }));
}

export function findBoundsCatalogEntry(catalog, featureKey) {
  return catalog.find((entry) => entry.key === featureKey) ?? null;
}

export function countVisibleBoundsFeatures(featureVisibility = {}) {
  return Object.values(featureVisibility).filter(Boolean).length;
}

/** Firestore не поддерживает вложенные массивы координат GeoJSON — храним geometry как JSON-строку. */
export function serializeBoundsGeometry(geometry) {
  if (!geometry) {
    return null;
  }

  return JSON.stringify(geometry);
}

export function parseBoundsGeometry(record) {
  if (!record) {
    return null;
  }

  if (typeof record.geometry_json === "string" && record.geometry_json) {
    return JSON.parse(record.geometry_json);
  }

  // Обратная совместимость, если geometry когда-либо сохраняли объектом.
  return record.geometry ?? null;
}

/** Преобразует GeoJSON FeatureCollection в документы одной коллекции Firestore. */
export function geojsonToBoundsCollectionDocs(layerDefinition, featureCollection) {
  if (!layerDefinition || featureCollection?.type !== "FeatureCollection") {
    return { collectionName: null, metadataDoc: null, featureDocs: [] };
  }

  const features = Array.isArray(featureCollection.features)
    ? featureCollection.features
    : [];
  const collectionName = getBoundsCollectionName(layerDefinition);

  const metadataDoc = {
    id: BOUNDS_METADATA_DOC_ID,
    data: {
      layer_id: layerDefinition.id,
      source_file: layerDefinition.sourceFile,
      label: layerDefinition.label,
      kind: layerDefinition.kind,
      feature_count: features.length
    }
  };

  const featureDocs = features.map((feature, featureIndex) => {
    const properties = normalizeBoundsProperties(feature.properties ?? {});

    return {
      id: buildBoundsFeatureDocId(properties, featureIndex),
      data: {
        feature_index: featureIndex,
        geometry_json: serializeBoundsGeometry(feature.geometry),
        properties,
        title: getBoundsFeatureTitle(properties)
      }
    };
  });

  return {
    collectionName,
    metadataDoc,
    featureDocs
  };
}

/** Собирает GeoJSON FeatureCollection из документов одной коллекции Firestore. */
export function boundsFeatureDocsToGeoJSON(docs) {
  const sortedDocs = [...docs]
    .filter((doc) => {
      const docId = doc.id ?? doc.data?.()?.id;
      return docId !== BOUNDS_METADATA_DOC_ID;
    })
    .sort((leftDoc, rightDoc) => {
      const left = leftDoc.data?.() ?? leftDoc.data ?? leftDoc;
      const right = rightDoc.data?.() ?? rightDoc.data ?? rightDoc;
      return (left.feature_index ?? 0) - (right.feature_index ?? 0);
    });

  const features = sortedDocs
    .map((doc) => {
      const record = doc.data?.() ?? doc.data ?? doc;
      const geometry = parseBoundsGeometry(record);

      if (!geometry) {
        return null;
      }

      return {
        type: "Feature",
        properties: record.properties ?? {},
        geometry
      };
    })
    .filter(Boolean);

  return {
    type: "FeatureCollection",
    features
  };
}

/** Оценивает, помещаются ли документы коллекции в лимит Firestore 1 MiB. */
export function analyzeBoundsCollectionDocs(metadataDoc, featureDocs) {
  const metadataBytes = Buffer.byteLength(JSON.stringify(metadataDoc.data), "utf8");
  const featureSizes = featureDocs.map((doc) =>
    Buffer.byteLength(JSON.stringify(doc.data), "utf8")
  );
  const maxFeatureBytes = featureSizes.length ? Math.max(...featureSizes) : 0;
  const overLimitCount = featureSizes.filter((size) => size > 1_048_576).length;

  return {
    metadataBytes,
    featureCount: featureDocs.length,
    maxFeatureBytes,
    overLimitCount,
    totalFeatureBytes: featureSizes.reduce((sum, size) => sum + size, 0)
  };
}
