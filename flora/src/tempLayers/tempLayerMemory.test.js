import {
  TEMP_GEOJSON_FEATURE_BYTES,
  TEMP_WORKING_SET_POINT_LIMIT,
  estimateTempGeoJsonBytes,
  evaluateTempLayerBudget,
  formatTempBudgetBlockMessage
} from "./tempLayerMemory";

describe("tempLayerMemory", () => {
  it("estimates GeoJSON bytes far above the columnar 120 B preview", () => {
    expect(estimateTempGeoJsonBytes(1000)).toBe(1000 * TEMP_GEOJSON_FEATURE_BYTES);
    expect(TEMP_GEOJSON_FEATURE_BYTES).toBeGreaterThan(120);
  });

  it("allows a load that fits the working-set cap", () => {
    const status = evaluateTempLayerBudget({
      currentCount: 50_000,
      incomingCount: 10_000
    });
    expect(status.ok).toBe(true);
    expect(status.next).toBe(60_000);
    expect(status.remaining).toBe(TEMP_WORKING_SET_POINT_LIMIT - 50_000);
  });

  it("blocks a region-scale append past the cap", () => {
    const status = evaluateTempLayerBudget({
      currentCount: 180_000,
      incomingCount: 50_000,
      limit: 200_000
    });
    expect(status.ok).toBe(false);
    expect(formatTempBudgetBlockMessage(status)).toMatch(/Лимит/);
  });
});
