import { mapOccurrenceToFeature } from "./mapOccurrenceToFeature";

describe("mapOccurrenceToFeature", () => {
  test("stores the project kingdom id and skips a record without coordinates", () => {
    const feature = mapOccurrenceToFeature({
      key: 42,
      decimalLongitude: 39.9,
      decimalLatitude: 59.2,
      kingdom: "Plantae",
      species: "Betula pendula",
      year: 2024
    });
    expect(feature.properties.regnum).toBe("plantae");
    expect(feature.properties.gbif_key).toBe(42);
    expect(feature.geometry.coordinates).toEqual([39.9, 59.2]);
    expect(mapOccurrenceToFeature({ key: 43, kingdom: "Animalia" })).toBeNull();
  });
});
