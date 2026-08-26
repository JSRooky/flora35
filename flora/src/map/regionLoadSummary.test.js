import {
  buildExternalIdToCatalogEntry,
  buildTempLayerRegionSummaries,
  formatCompactPointCount,
  isRegionPlaqueCompact,
  regionLabelCoordinates,
  regionPlaqueColorVars,
  setRegionLoadSummaryActive,
  setRegionLoadSummaryMode,
  shouldSuppressLoadedPointLayers
} from "./regionLoadSummary";
import { resolveTempSourceMarkerColor, TEMP_SOURCE_IDS } from "../tempLayers/tempLayerStore";

function squareFeature(west, south, east, north) {
  return {
    type: "Feature",
    properties: {},
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [west, south],
          [east, south],
          [east, north],
          [west, north],
          [west, south]
        ]
      ]
    }
  };
}

describe("regionLoadSummary", () => {
  test("places the label at the polygon centroid", () => {
    const [lng, lat] = regionLabelCoordinates(squareFeature(30, 50, 40, 60));
    expect(lng).toBeCloseTo(35, 5);
    expect(lat).toBeCloseTo(55, 5);
  });

  test("does not pull the label toward a densely sampled shoreline", () => {
    const ring = [];
    for (let x = 0; x <= 10; x += 0.05) {
      ring.push([x, 0]);
    }
    ring.push([10, 10], [0, 10], [0, 0]);
    const [lng, lat] = regionLabelCoordinates({
      type: "Feature",
      properties: {},
      geometry: { type: "Polygon", coordinates: [ring] }
    });
    expect(lng).toBeCloseTo(5, 1);
    expect(lat).toBeCloseTo(5, 1);
  });

  test("uses the bounding-box center of a rectangular region", () => {
    const [lng, lat] = regionLabelCoordinates(squareFeature(10, 20, 30, 40));
    expect(lng).toBeCloseTo(20, 5);
    expect(lat).toBeCloseTo(30, 5);
  });

  test("collapses the plaque when the region is small on screen", () => {
    expect(
      isRegionPlaqueCompact(
        { minX: 0, minY: 0, maxX: 1, maxY: 1 },
        () => ({ x: 0, y: 0 })
      )
    ).toBe(true);
    expect(
      isRegionPlaqueCompact(
        { minX: 0, minY: 0, maxX: 1, maxY: 1 },
        (point) => ({ x: point[0] * 400, y: point[1] * 400 })
      )
    ).toBe(false);
  });

  test("abbreviates large counts on compact plaques", () => {
    expect(formatCompactPointCount(12500)).toBe("13k");
    expect(formatCompactPointCount(1_500_000)).toBe("1.5M");
  });

  test("keeps the label inside an L-shaped region, not on a corner vertex", () => {
    const lShape = {
      type: "Feature",
      properties: {},
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            [6, 0],
            [6, 1],
            [1, 1],
            [1, 6],
            [0, 6],
            [0, 0]
          ]
        ]
      }
    };
    const [x, y] = regionLabelCoordinates(lShape);
    const inStem = x >= 0 && x <= 1 && y >= 0 && y <= 6;
    const inBar = x >= 0 && x <= 6 && y >= 0 && y <= 1;
    expect(inStem || inBar).toBe(true);
    expect(Math.hypot(x, y)).toBeGreaterThan(0.2);
  });

  test("maps catalog entries to external region ids", () => {
    const catalog = [
      {
        iso: "RU-VLG",
        name: "Вологодская область",
        nameEn: "Vologda",
        feature: squareFeature(35, 58, 45, 62)
      }
    ];
    const map = buildExternalIdToCatalogEntry(catalog);
    expect(map.get("vologda")?.iso).toBe("RU-VLG");
  });

  test("builds a temp-layer plaque per loaded region", () => {
    const catalog = [
      {
        iso: "RU-VLG",
        name: "Вологодская область",
        nameEn: "Vologda",
        feature: squareFeature(35, 58, 45, 62)
      }
    ];
    const summaries = buildTempLayerRegionSummaries({
      catalog,
      plaques: [
        {
          key: "pinus",
          taxonName: "Pinus sylvestris",
          label: "Pinus sylvestris",
          markerColor: "#c45c26",
          layers: [
            {
              id: "layer-1",
              source: "gbif",
              regionIds: ["vologda"],
              visible: false,
              features: [{ properties: { region_id: "vologda" } }, { properties: {} }]
            }
          ]
        }
      ]
    });
    expect(summaries).toHaveLength(1);
    expect(summaries[0].layerName).toBe("Pinus sylvestris");
    expect(summaries[0].pointCount).toBe(2);
    expect(summaries[0].sources.gbif).toBe(true);
    expect(summaries[0].displayOn).toBe(false);
    expect(summaries[0].layerIds).toEqual(["layer-1"]);
    expect(summaries[0].markerColor).toBe("#c45c26");
  });

  test("uses the temp-layer marker color for GBIF and iNat tints", () => {
    const vars = regionPlaqueColorVars({ markerColor: "#c45c26" });
    expect(vars["--temp-layer-color"]).toBe("#c45c26");
    expect(vars["--temp-layer-color-gbif"]).toBe(
      resolveTempSourceMarkerColor("#c45c26", TEMP_SOURCE_IDS.GBIF)
    );
    expect(vars["--temp-layer-color-inat"]).toBe(
      resolveTempSourceMarkerColor("#c45c26", TEMP_SOURCE_IDS.INAT)
    );
  });

  test("treats hidden temp layers like external summaries for map hit-testing", () => {
    setRegionLoadSummaryActive(true);
    setRegionLoadSummaryMode("temp");
    expect(shouldSuppressLoadedPointLayers()).toBe(true);
    setRegionLoadSummaryMode("external");
    setRegionLoadSummaryActive(false);
    expect(shouldSuppressLoadedPointLayers()).toBe(false);
  });
});
