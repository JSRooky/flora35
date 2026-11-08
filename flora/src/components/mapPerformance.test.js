import { partitionMapFeaturesByRegnum } from "./mapPerformance";

describe("partitionMapFeaturesByRegnum", () => {
  test("partitions features in one pass into kingdom buckets and other", () => {
    const planta = { properties: { regnum: "Plantae" } };
    const animal = { properties: { regnum: "animalia" } };
    const unknown = { properties: { regnum: "unknown" } };
    const missing = { properties: {} };

    const { groups, other } = partitionMapFeaturesByRegnum(
      [planta, animal, unknown, missing],
      ["plantae", "animalia"]
    );

    expect(groups.get("plantae")).toEqual([planta]);
    expect(groups.get("animalia")).toEqual([animal]);
    expect(other).toEqual([unknown, missing]);
  });
});
