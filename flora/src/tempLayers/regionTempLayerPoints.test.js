import {
  collectArchivedRegionOverlayFeatures,
  getTempLayers,
  getVisibleTempLayerFeatures,
  replaceTempLayers,
  saveFeaturesIntoRegionOverlayTempLayer,
  TEMP_SOURCE_IDS
} from "./tempLayerStore";

function gbifPoint(key, name) {
  return {
    type: "Feature",
    id: `gbif-${key}`,
    geometry: { type: "Point", coordinates: [40, 59] },
    properties: { source: "gbif", gbif_key: key, name_latin: name }
  };
}

describe("saveFeaturesIntoRegionOverlayTempLayer", () => {
  afterEach(() => {
    replaceTempLayers([]);
  });

  it("keeps points on a sibling layer instead of wiping the region overlay", () => {
    const result = saveFeaturesIntoRegionOverlayTempLayer({
      label: "Вологодская область",
      regionIds: ["vologda"],
      overlays: [
        {
          kind: "regions",
          label: "Вологодская область",
          features: [
            {
              type: "Feature",
              properties: { iso: "RU-VLG" },
              geometry: {
                type: "Polygon",
                coordinates: [
                  [
                    [0, 0],
                    [1, 0],
                    [1, 1],
                    [0, 1],
                    [0, 0]
                  ]
                ]
              }
            }
          ]
        }
      ],
      features: [gbifPoint(1, "Betula pendula"), gbifPoint(2, "Pinus sylvestris")]
    });

    expect(result.ok).toBe(true);
    expect(result.added).toBe(2);

    const stored = getTempLayers();
    const overlay = stored.find((layer) => layer.source === TEMP_SOURCE_IDS.REGIONS);
    const points = stored.filter((layer) => layer.source === TEMP_SOURCE_IDS.GBIF);

    expect(overlay?.features).toEqual([]);
    expect(points).toHaveLength(1);
    expect(points[0].features).toHaveLength(2);
    expect(getVisibleTempLayerFeatures()).toHaveLength(2);
  });

  it("collects archived region polygons only when the layer still has points", () => {
    const polygon = {
      type: "Feature",
      properties: { iso: "RU-VLG" },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
            [0, 0]
          ]
        ]
      }
    };
    const withData = collectArchivedRegionOverlayFeatures([
      {
        archiveId: "a1",
        markerColor: "#c45c26",
        layers: [
          {
            kind: "points",
            source: "gbif",
            features: [gbifPoint(1, "Betula pendula")],
            overlays: [{ kind: "regions", features: [polygon] }]
          }
        ]
      }
    ]);
    expect(withData).toHaveLength(1);
    expect(withData[0].properties.overlayRole).toBe("archived-region");
    expect(withData[0].properties.color).toBe("#c45c26");

    const empty = collectArchivedRegionOverlayFeatures([
      {
        archiveId: "a2",
        layers: [
          {
            kind: "regions",
            source: "regions",
            features: [],
            overlays: [{ kind: "regions", features: [polygon] }]
          }
        ]
      }
    ]);
    expect(empty).toEqual([]);
  });
});
