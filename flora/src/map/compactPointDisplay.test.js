import {
  buildCompactViewportFeatures,
  COMPACT_MAX_VIEWPORT_POINTS,
  squareDegreesForZoom
} from "./compactPointDisplay";
import {
  createDefaultCompactGridSettings,
  setCompactDisplayedLayerPointCount,
  setCompactGridSettings
} from "./compactGridSettings";

function fakeMap({ zoom, west, south, east, north }) {
  return {
    getZoom: () => zoom,
    getBounds: () => ({
      getWest: () => west,
      getSouth: () => south,
      getEast: () => east,
      getNorth: () => north
    })
  };
}

function visitGrid(visit, count) {
  for (let i = 0; i < count; i += 1) {
    visit(40 + (i % 20) * 0.01, 57 + Math.floor(i / 20) * 0.01, i);
  }
}

describe("compactPointDisplay", () => {
  afterEach(() => {
    setCompactGridSettings(createDefaultCompactGridSettings());
    setCompactDisplayedLayerPointCount(0);
  });

  test("cells shrink as zoom grows", () => {
    expect(squareDegreesForZoom(6)).toBeGreaterThan(squareDegreesForZoom(10));
  });

  test("over the loaded-layer point limit draws density cells", () => {
    setCompactGridSettings({ pointLimit: 5000 });
    setCompactDisplayedLayerPointCount(6000);
    const map = fakeMap({ zoom: 6, west: 38, south: 56, east: 42, north: 58 });
    const { features, mode, inBoundsCount } = buildCompactViewportFeatures({
      map,
      source: "gbif",
      forEachPoint: (visit) => visitGrid(visit, 400),
      toPointFeature: (extra, lng, lat) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [lng, lat] },
        properties: { extra }
      })
    });
    expect(inBoundsCount).toBe(400);
    expect(mode).toBe("density");
    expect(features.length).toBeLessThan(400);
    expect(features.every((feature) => feature.properties.compact_density)).toBe(true);
    expect(features.every((feature) => feature.geometry.type === "Polygon")).toBe(
      true
    );
    const ring = features[0].geometry.coordinates[0];
    const width = ring[1][0] - ring[0][0];
    const height = ring[2][1] - ring[1][1];
    expect(width).toBeGreaterThan(0);
    expect(height).toBeGreaterThan(0);
    expect(height).toBeLessThan(width);
  });

  test("grid step is 32 cells per map tile by default", () => {
    expect(squareDegreesForZoom(6)).toBeCloseTo(360 / 2 ** 11, 10);
  });

  test("larger cells per setting make coarser grid", () => {
    setCompactGridSettings({ cellsPerTile: 8 });
    expect(squareDegreesForZoom(6)).toBeCloseTo(360 / 2 ** 9, 10);
  });

  test("under the loaded-layer point limit keeps markers", () => {
    setCompactGridSettings({ pointLimit: 50000 });
    setCompactDisplayedLayerPointCount(100);
    const map = fakeMap({
      zoom: 12,
      west: 39.9,
      south: 56.9,
      east: 40.1,
      north: 57.1
    });
    const { features, mode } = buildCompactViewportFeatures({
      map,
      forEachPoint: (visit) => {
        visit(40, 57, 1);
        visit(40.01, 57.01, 2);
      },
      toPointFeature: (_extra, lng, lat) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [lng, lat] },
        properties: {}
      })
    });
    expect(mode).toBe("points");
    expect(features).toHaveLength(2);
  });

  test("default point limit is a large viewport budget", () => {
    expect(COMPACT_MAX_VIEWPORT_POINTS).toBeGreaterThan(1000);
  });
});
