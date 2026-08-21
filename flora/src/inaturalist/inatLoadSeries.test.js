import { planInatLoadSeries } from "./inatLoadSeries";

describe("planInatLoadSeries taxon_id", () => {
  it("does not split by iconic taxa when taxon_id is set", async () => {
    const series = await planInatLoadSeries(
      { id: "vologda" },
      {
        extras: { taxon_id: 50108 },
        previewCount: 50000
      }
    );

    expect(series).toHaveLength(1);
    expect(series[0].extras.taxon_id).toBe(50108);
    expect(series[0].extras.iconicTaxa).toBeUndefined();
  });
});
