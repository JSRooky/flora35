import {
  hashLocationFilters,
  partitionMapFeaturesByRegnum,
  resolveAutoRasterMode,
  slimMapFeatures
} from "./mapPerformance";

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

describe("slimMapFeatures", () => {
  test("keeps kingdom and drops properties the map does not paint", () => {
    const [feature] = slimMapFeatures([
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [30, 60] },
        properties: { regnum: "plantae", note: "field diary", name_latin: "Betula" }
      }
    ]);
    expect(feature.properties.regnum).toBe("plantae");
    expect(feature.properties.name_latin).toBe("Betula");
    expect(feature.properties.note).toBeUndefined();
  });
});

describe("resolveAutoRasterMode", () => {
  test("enters at 60000 and stays on until the count falls to 40000", () => {
    expect(resolveAutoRasterMode(59999, false)).toBe(false);
    expect(resolveAutoRasterMode(60000, false)).toBe(true);
    expect(resolveAutoRasterMode(40001, true)).toBe(true);
    expect(resolveAutoRasterMode(40000, true)).toBe(false);
  });
});

describe("hashLocationFilters", () => {
  test("ignores key order and null fields", () => {
    expect(hashLocationFilters({ year: { min: 2000, max: 2024 }, regnum: ["animalia", "plantae"] })).toBe(
      hashLocationFilters({ regnum: ["plantae", "animalia"], note: null, year: { min: 2000, max: 2024 } })
    );
  });
});
