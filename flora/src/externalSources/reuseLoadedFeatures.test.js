import {
  canReuseCoverage,
  extrasLookIncremental,
  filterReusableFeatures,
  kingdomsCoveredByFeatures,
  regionHasSpatialOverride,
  requestedKingdomIds
} from "./reuseLoadedFeatures";

describe("reuseLoadedFeatures", () => {
  it("does not reuse buffered or incremental requests", () => {
    expect(regionHasSpatialOverride({ gbif: { geometry: "POLYGON((0 0,1 0,1 1,0 0))" } })).toBe(
      true
    );
    expect(extrasLookIncremental({ lastInterpreted: "2024-01-01,*" })).toBe(true);
  });

  it("reuses a region only when requested kingdoms are already present", () => {
    const features = [
      { properties: { regnum: "plantae" } },
      { properties: { regnum: "animalia" } }
    ];
    const covered = kingdomsCoveredByFeatures(features);
    expect(canReuseCoverage(covered, ["plantae"])).toBe(true);
    expect(canReuseCoverage(covered, [])).toBe(true);
    expect(canReuseCoverage(covered, [], { regionLoaded: true })).toBe(true);
    expect(canReuseCoverage(covered, ["fungi"])).toBe(false);
  });

  it("filters reused points by taxon name", () => {
    const features = [
      { properties: { name_latin: "Picea abies", regnum: "plantae", species_key: 1 } },
      { properties: { name_latin: "Pinus sylvestris", regnum: "plantae", species_key: 2 } }
    ];
    const next = filterReusableFeatures(features, {
      taxon: { scientificName: "Picea abies", taxonKey: 1 }
    });
    expect(next).toHaveLength(1);
    expect(next[0].properties.species_key).toBe(1);
  });

  it("parses kingdom ids from the load query", () => {
    expect(requestedKingdomIds("fungi", {})).toEqual(["fungi"]);
    expect(requestedKingdomIds("", { kingdomIds: ["plantae", "animalia"] })).toEqual([
      "plantae",
      "animalia"
    ]);
  });
});
