import {
  buildCompactViewportFeatures,
  buildCompactViewportFromGeojson,
  COMPACT_MAX_VIEWPORT_POINTS,
  forEachCompactPointInBounds,
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

  test("compact viewport visits nearby spatial buckets instead of scanning every point", () => {
    const points = Array.from({ length: 20000 }, (_, index) => ({
      lng: (index % 512) * (360 / 512) - 180,
      lat: Math.floor(index / 512) * (180 / 40) - 90
    }));
    points.push({ lng: 40, lat: 57 });
    const map = fakeMap({
      zoom: 8,
      west: 39.9,
      south: 56.9,
      east: 40.1,
      north: 57.1
    });
    let coordinateReads = 0;
    const visited = [];
    const options = {
      map,
      source: "spatial-index-performance-test",
      token: points,
      count: points.length,
      getLng: (index) => {
        coordinateReads += 1;
        return points[index].lng;
      },
      getLat: (index) => {
        coordinateReads += 1;
        return points[index].lat;
      },
      visit: (_lng, _lat, index) => visited.push(index)
    };

    forEachCompactPointInBounds(options);
    expect(visited).toContain(points.length - 1);
    expect(coordinateReads).toBeGreaterThanOrEqual(points.length * 2);

    coordinateReads = 0;
    forEachCompactPointInBounds(options);
    expect(coordinateReads).toBeLessThan(points.length / 100);
  });

  test("filtered local points reuse the unfiltered spatial index", () => {
    const features = Array.from({ length: 20000 }, (_, index) => {
      const lng = (index % 512) * (360 / 512) - 180;
      const lat = Math.floor(index / 512) * (180 / 40) - 90;
      return {
        properties: { id: String(index) },
        get geometry() {
          coordinateReads += 1;
          return {
            type: "Point",
            coordinates: [lng, lat]
          };
        }
      };
    });
    const selectedFeature = {
      properties: { id: "selected" },
      get geometry() {
        coordinateReads += 1;
        return { type: "Point", coordinates: [40, 57] };
      }
    };
    features.push(selectedFeature);
    const map = fakeMap({
      zoom: 8,
      west: 39.9,
      south: 56.9,
      east: 40.1,
      north: 57.1
    });
    let coordinateReads = 0;
    const options = {
      indexFeatures: features,
      getFeatureKey: (feature) => feature.properties.id
    };

    expect(
      buildCompactViewportFromGeojson(
        map,
        [selectedFeature],
        "filtered-local-index-test",
        options
      ).features
    ).toEqual([selectedFeature]);

    coordinateReads = 0;
    expect(
      buildCompactViewportFromGeojson(
        map,
        [],
        "filtered-local-index-test",
        options
      ).features
    ).toEqual([]);
    expect(coordinateReads).toBeLessThan(features.length / 100);
  });

  test("density grid cells use the coordinates of each source", () => {
    setCompactGridSettings({ pointLimit: 1 });
    setCompactDisplayedLayerPointCount(2);
    const map = fakeMap({ zoom: 6, west: -180, south: -80, east: 180, north: 80 });
    const makePoint = (source, lng, lat) =>
      buildCompactViewportFeatures({
        map,
        source,
        forEachPoint: (visit) => visit(lng, lat, 0)
      }).features[0];

    const first = makePoint("cache-source-a", 40, 57);
    const second = makePoint("cache-source-b", -100, -20);
    const firstCenter = first.properties;
    const secondCenter = second.properties;

    expect(firstCenter.center_lng).toBeGreaterThan(0);
    expect(firstCenter.center_lat).toBeGreaterThan(0);
    expect(secondCenter.center_lng).toBeLessThan(0);
    expect(secondCenter.center_lat).toBeLessThan(0);
  });
});
