import { getAreaContainedPointsSummary } from "../addAreaSelectionLayer";
import { getToolFeatures } from "../addLocationsLayer";
import { getPointsWithinPolygonFeature } from "../addSpeciesPolygonLayer";
import {
  collectReportPoints,
  isReportSourceAvailable,
  resolveSpatialToolSummary
} from "./collectReportPoints";
import { REPORT_SOURCES } from "./reportSources";

jest.mock("@turf/turf", () => ({
  booleanPointInPolygon: jest.fn(() => false),
  circle: jest.fn(),
  point: jest.fn(),
  union: jest.fn(),
  featureCollection: jest.fn()
}));

jest.mock("../addLocationsLayer", () => ({
  getToolFeatures: jest.fn(() => [])
}));

jest.mock("../addAreaSelectionLayer", () => ({
  getAreaContainedPointsSummary: jest.fn()
}));

jest.mock("../addSpeciesPolygonLayer", () => ({
  getPointsWithinPolygonFeature: jest.fn(() => [])
}));

function point(id, name_ru, name_latin, coordinates = [40, 60]) {
  return {
    type: "Feature",
    id,
    properties: { finding_id: id, name_ru, name_latin },
    geometry: { type: "Point", coordinates }
  };
}

describe("collectReportPoints", () => {
  beforeEach(() => {
    getToolFeatures.mockReset();
    getAreaContainedPointsSummary.mockReset();
    getPointsWithinPolygonFeature.mockReset();
    getToolFeatures.mockReturnValue([]);
    getPointsWithinPolygonFeature.mockReturnValue([]);
  });

  test("visible filtered uses tool features, not the local-only layer", () => {
    const gbifPoint = point("gbif-1", "Ель", "Picea abies");
    getToolFeatures.mockReturnValue([gbifPoint]);

    const filters = { status: ["VU"] };
    const result = collectReportPoints(REPORT_SOURCES.VISIBLE_FILTERED, {
      locationFilters: filters
    });

    expect(getToolFeatures).toHaveBeenCalledWith(filters);
    expect(result).toEqual([gbifPoint]);
  });

  test("preview keeps source order; download sorts by name_ru", () => {
    const spruce = point("2", "Ель", "Picea abies");
    const birch = point("1", "Берёза", "Betula pendula");
    getToolFeatures.mockReturnValue([spruce, birch]);

    const preview = collectReportPoints(REPORT_SOURCES.VISIBLE_FILTERED, {});
    const downloaded = collectReportPoints(
      REPORT_SOURCES.VISIBLE_FILTERED,
      {},
      { sort: true }
    );

    expect(preview.map((item) => item.id)).toEqual(["2", "1"]);
    expect(downloaded.map((item) => item.id)).toEqual(["1", "2"]);
  });

  test("selected point returns a single feature", () => {
    const selected = point("sel", "Сосна", "Pinus sylvestris");
    expect(
      collectReportPoints(REPORT_SOURCES.SELECTED_POINT, { selectedPoint: selected })
    ).toEqual([selected]);
    expect(collectReportPoints(REPORT_SOURCES.SELECTED_POINT, {})).toEqual([]);
  });

  test("tool filter only uses the provided summary", () => {
    const inside = point("in", "Ива", "Salix alba");
    const result = collectReportPoints(REPORT_SOURCES.TOOL_FILTER_ONLY, {
      toolFilterPointsSummary: { points: [inside] }
    });
    expect(result).toEqual([inside]);
  });

  test("buffer multi-select dedupes by finding_id", () => {
    const first = point("same", "Ольха", "Alnus glutinosa");
    const duplicate = point("same", "Ольха", "Alnus glutinosa");
    const result = collectReportPoints(REPORT_SOURCES.BUFFER_MULTI_SELECT, {
      bufferSelectedPoints: [first, duplicate]
    });
    expect(result).toHaveLength(1);
    expect(result[0].properties.finding_id).toBe("same");
  });

  test("spatial tool prefers area summary when areaGeometry is set", () => {
    const areaPoint = point("area", "Клён", "Acer platanoides");
    getAreaContainedPointsSummary.mockReturnValue({
      count: 1,
      points: [areaPoint]
    });

    const context = {
      locationFilters: { year: [2000, 2020] },
      areaGeometry: { type: "Polygon", coordinates: [] }
    };

    expect(resolveSpatialToolSummary(context)).toMatchObject({
      sourceLabel: "Область",
      points: [areaPoint]
    });
    expect(collectReportPoints(REPORT_SOURCES.SPATIAL_TOOL, context)).toEqual([
      areaPoint
    ]);
    expect(getAreaContainedPointsSummary).toHaveBeenCalledWith(context.areaGeometry, {
      year: [2000, 2020]
    });
  });
});

describe("isReportSourceAvailable", () => {
  test("visible filtered is always available", () => {
    expect(isReportSourceAvailable(REPORT_SOURCES.VISIBLE_FILTERED, {})).toBe(true);
  });

  test("optional sources follow context", () => {
    expect(isReportSourceAvailable(REPORT_SOURCES.SELECTED_POINT, {})).toBe(false);
    expect(
      isReportSourceAvailable(REPORT_SOURCES.SELECTED_POINT, {
        selectedPoint: point("1", "Берёза", "Betula pendula")
      })
    ).toBe(true);
    expect(isReportSourceAvailable(REPORT_SOURCES.TOOL_FILTER_ONLY, {})).toBe(false);
    expect(
      isReportSourceAvailable(REPORT_SOURCES.TOOL_FILTER_ONLY, {
        toolFilterPointsSummary: { points: [point("1", "Берёза", "Betula pendula")] }
      })
    ).toBe(true);
    expect(isReportSourceAvailable(REPORT_SOURCES.BUFFER_MULTI_SELECT, {})).toBe(false);
    expect(
      isReportSourceAvailable(REPORT_SOURCES.BUFFER_MULTI_SELECT, {
        bufferSelectedPoints: [point("1", "Берёза", "Betula pendula")]
      })
    ).toBe(true);
  });
});
