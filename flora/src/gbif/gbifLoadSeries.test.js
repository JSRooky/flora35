import { estimateGbifLoadSeriesCount, GBIF_SERIES_SOFT_LIMIT } from "./gbifLoadSeries";

describe("estimateGbifLoadSeriesCount", () => {
  test("keeps a small preview in one series", () => {
    expect(estimateGbifLoadSeriesCount(null)).toBe(1);
    expect(estimateGbifLoadSeriesCount(GBIF_SERIES_SOFT_LIMIT)).toBe(1);
  });

  test("splits a large preview into year-sized series plus one spare", () => {
    expect(estimateGbifLoadSeriesCount(GBIF_SERIES_SOFT_LIMIT + 1)).toBe(
      Math.max(2, Math.ceil((GBIF_SERIES_SOFT_LIMIT + 1) / 450) + 1)
    );
  });
});
