const SOURCE_ID = "analysis-kde";
const FILL_LAYER_ID = "analysis-kde-fill";
const LINE_LAYER_ID = "analysis-kde-line";

const EMPTY_COLLECTION = {
  type: "FeatureCollection",
  features: []
};

function beforeLayerId(map) {
  if (map.getLayer("heatmap")) {
    return "heatmap";
  }
  return undefined;
}

/** Слой изоплет KDE анализа — под тепловой картой и точками, без перехвата кликов поверх маркеров. */
export function addAnalysisKdeLayer(map) {
  if (!map || map.getSource(SOURCE_ID)) {
    return;
  }

  map.addSource(SOURCE_ID, {
    type: "geojson",
    data: EMPTY_COLLECTION
  });

  const beforeId = beforeLayerId(map);

  map.addLayer(
    {
      id: FILL_LAYER_ID,
      type: "fill",
      source: SOURCE_ID,
      paint: {
        "fill-color": ["coalesce", ["get", "color"], "#c2410c"],
        "fill-opacity": [
          "match",
          ["get", "level"],
          "50",
          0.45,
          0.22
        ]
      }
    },
    beforeId
  );

  map.addLayer(
    {
      id: LINE_LAYER_ID,
      type: "line",
      source: SOURCE_ID,
      paint: {
        "line-color": ["coalesce", ["get", "color"], "#9a3412"],
        "line-width": [
          "match",
          ["get", "level"],
          "50",
          1.75,
          1
        ],
        "line-opacity": 0.9
      }
    },
    beforeId
  );
}

export function setAnalysisKdeData(map, collection) {
  if (!map) {
    return;
  }
  if (!map.getSource(SOURCE_ID)) {
    addAnalysisKdeLayer(map);
  }
  const source = map.getSource(SOURCE_ID);
  if (!source) {
    return;
  }
  const data =
    collection?.type === "FeatureCollection" ? collection : EMPTY_COLLECTION;
  source.setData(data);
}

export function clearAnalysisKdeLayer(map) {
  setAnalysisKdeData(map, EMPTY_COLLECTION);
}
