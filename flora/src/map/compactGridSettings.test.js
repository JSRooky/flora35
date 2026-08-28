import {
  clampCompactGridCellsPerTile,
  clampCompactGridPointLimit,
  COMPACT_GRID_CELLS_MAX,
  COMPACT_GRID_FILL,
  createDefaultCompactGridSettings,
  resolveCompactGridFillColor,
  setCompactDisplayedLayerPointCount,
  setCompactGridSettings,
  shouldUseCompactDensityGrid
} from "./compactGridSettings";

describe("compactGridSettings", () => {
  afterEach(() => {
    setCompactGridSettings(createDefaultCompactGridSettings());
    setCompactDisplayedLayerPointCount(0);
  });

  test("does not allow cells finer than 32 per tile", () => {
    expect(clampCompactGridCellsPerTile(64)).toBe(COMPACT_GRID_CELLS_MAX);
    expect(clampCompactGridCellsPerTile(3)).toBe(8);
  });

  test("clamps the loaded-layer point limit", () => {
    expect(clampCompactGridPointLimit(10)).toBe(5000);
    expect(clampCompactGridPointLimit(999999)).toBe(500000);
  });

  test("uses the temp layer color when auto color is on", () => {
    setCompactGridSettings({ useLayerColor: true, color: COMPACT_GRID_FILL });
    expect(resolveCompactGridFillColor("#3267e0")).toBe("#3267e0");
  });

  test("uses the custom color when auto color is off", () => {
    setCompactGridSettings({ useLayerColor: false, color: "#20a04c" });
    expect(resolveCompactGridFillColor("#3267e0")).toBe("#20a04c");
  });

  test("turns the grid on from total loaded points", () => {
    setCompactGridSettings({ pointLimit: 50000 });
    setCompactDisplayedLayerPointCount(50000);
    expect(shouldUseCompactDensityGrid()).toBe(false);
    setCompactDisplayedLayerPointCount(50001);
    expect(shouldUseCompactDensityGrid()).toBe(true);
  });
});
