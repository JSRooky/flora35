import { chao1Interval, rarefactionCurve } from "./accumulation";
import { aooCellKey, computeAoo, collectOccurrenceCoords } from "./eooAoo";
import { computeKde } from "./kde";
import { applyQualityFilter } from "./qualityFilter";
import { mannKendall } from "./yearTrend";
import { ANALYSIS_METHODS, runAnalysis } from "./runAnalysis";

jest.mock("@turf/turf", () => ({
  point: (coords) => ({ type: "Feature", geometry: { type: "Point", coordinates: coords } }),
  featureCollection: (features) => ({ type: "FeatureCollection", features }),
  convex: (collection) => ({
    type: "Feature",
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          ...collection.features.map((feature) => feature.geometry.coordinates),
          collection.features[0].geometry.coordinates
        ]
      ]
    }
  }),
  area: () => 4_000_000
}));

function point(id, name_latin, lon, lat, extra = {}) {
  return {
    type: "Feature",
    id,
    properties: { finding_id: id, name_latin, ...extra },
    geometry: { type: "Point", coordinates: [lon, lat] }
  };
}

describe("qualityFilter", () => {
  test("drops points missing year or latin name when asked", () => {
    const features = [
      point("1", "Betula pendula", 40, 60, { found_year: 2001 }),
      point("2", "", 40, 60, { found_year: 2001 }),
      point("3", "Picea abies", 40, 60)
    ];
    expect(applyQualityFilter(features, { requireLatinName: true })).toHaveLength(2);
    expect(applyQualityFilter(features, { requireYear: true })).toHaveLength(2);
  });

  test("inat research grade does not drop GBIF", () => {
    const features = [
      point("g", "Picea abies", 40, 60, { source: "gbif" }),
      point("i1", "Picea abies", 40, 60, {
        source: "inaturalist",
        quality_grade: "casual"
      }),
      point("i2", "Picea abies", 40, 60, {
        source: "inaturalist",
        quality_grade: "research"
      })
    ];
    expect(applyQualityFilter(features, { inatResearchOnly: true })).toHaveLength(2);
  });
});

describe("aoo", () => {
  test("nearby points share a 2 km cell; distant points do not", () => {
    const near = collectOccurrenceCoords([
      point("a", "Betula pendula", 40, 60),
      point("b", "Betula pendula", 40.001, 60.001)
    ]);
    expect(computeAoo(near).occupiedCells).toBe(1);
    expect(aooCellKey(40, 60)).not.toBe(aooCellKey(41, 60));
    expect(computeAoo([[40, 60], [41, 60]]).areaKm2).toBe(8);
  });
});

describe("chao1Interval", () => {
  test("lower bound is at least observed richness", () => {
    const counts = new Map([
      ["a", 1],
      ["b", 1],
      ["c", 2],
      ["d", 5]
    ]);
    const interval = chao1Interval(counts);
    expect(interval.estimate).toBeGreaterThanOrEqual(interval.sObs);
    expect(interval.lower).toBeGreaterThanOrEqual(interval.sObs);
    expect(interval.upper).toBeGreaterThanOrEqual(interval.estimate);
  });

  test("rarefaction at full n equals observed richness", () => {
    const counts = new Map([
      ["a", 3],
      ["b", 1]
    ]);
    const curve = rarefactionCurve(counts);
    expect(curve[curve.length - 1]).toEqual({ n: 4, s: 2 });
  });
});

describe("mannKendall", () => {
  test("strictly increasing series is a significant increase with slope 1", () => {
    const result = mannKendall([1, 2, 3, 4, 5]);
    expect(result.trend).toBe("increase");
    expect(result.tau).toBe(1);
    expect(result.slope).toBe(1);
    expect(result.p).toBeLessThan(0.05);
  });

  test("constant series has no trend", () => {
    const result = mannKendall([3, 3, 3, 3]);
    expect(result.trend).toBe("none");
    expect(result.s).toBe(0);
  });
});

describe("kde", () => {
  test("needs two unique localities", () => {
    const result = computeKde([point("1", "Betula pendula", 40, 60)]);
    expect(result.reason).toBe("need_two_points");
    expect(result.overlay.features).toHaveLength(0);
  });

  test("two clusters: 50% isopleth is smaller than 95%", () => {
    const features = [
      point("a1", "Betula pendula", 40.0, 60.0),
      point("a2", "Betula pendula", 40.01, 60.01),
      point("a3", "Betula pendula", 40.02, 60.0),
      point("b1", "Betula pendula", 41.0, 61.0),
      point("b2", "Betula pendula", 41.01, 61.01),
      point("b3", "Betula pendula", 41.02, 61.0)
    ];
    const result = computeKde(features);
    expect(result.reason).toBeNull();
    expect(result.uniqueLocalities).toBe(6);
    expect(result.area50Km2).toBeGreaterThan(0);
    expect(result.area95Km2).toBeGreaterThan(result.area50Km2);
    expect(result.overlay.features).toHaveLength(2);
  });

  test("wider bandwidth increases 95% isopleth area", () => {
    const features = [
      point("a", "Picea abies", 40, 60),
      point("b", "Picea abies", 40.2, 60.1),
      point("c", "Picea abies", 40.4, 60.05)
    ];
    const narrow = computeKde(features, { bandwidthScale: 0.5 });
    const wide = computeKde(features, { bandwidthScale: 2 });
    expect(wide.bandwidthKm).toBeGreaterThan(narrow.bandwidthKm);
    expect(wide.area95Km2).toBeGreaterThan(narrow.area95Km2);
  });
});

describe("runAnalysis", () => {
  test("eoo-aoo reports unique localities and AOO area", () => {
    const report = runAnalysis(
      ANALYSIS_METHODS.EOO_AOO,
      [
        point("1", "Betula pendula", 40, 60, { found_year: 2000 }),
        point("2", "Betula pendula", 40.001, 60.001, { found_year: 2001 }),
        point("3", "Betula pendula", 41, 61, { found_year: 2002 })
      ],
      { sourceId: "visible_filtered" }
    );
    expect(report.meta.speciesCount).toBe(1);
    expect(report.metrics.uniqueLocalities).toBe(3);
    expect(report.metrics.aooKm2).toBeGreaterThan(0);
    expect(report.metrics.eooKm2).toBe(4);
  });

  test("kde reports bandwidth and isopleth areas", () => {
    const report = runAnalysis(
      ANALYSIS_METHODS.KDE,
      [
        point("1", "Betula pendula", 40, 60),
        point("2", "Betula pendula", 40.15, 60.08),
        point("3", "Betula pendula", 40.3, 60.02)
      ],
      { sourceId: "visible_filtered" }
    );
    expect(report.method).toBe(ANALYSIS_METHODS.KDE);
    expect(report.metrics.bandwidthKm).toBeGreaterThan(0);
    expect(report.metrics.area95Km2).toBeGreaterThan(report.metrics.area50Km2);
    expect(report.grid.values.length).toBe(report.grid.cols * report.grid.rows);
  });
});
