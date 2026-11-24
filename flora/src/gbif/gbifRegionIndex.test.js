import {
  clearGbifStore,
  getGbifFeaturesForRegionIds,
  upsertGbifFeatures
} from "./gbifStore";

function point(key, lng) {
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [lng, 60] },
    properties: { gbif_key: key, regnum: "plantae", name_latin: "Betula pendula" }
  };
}

describe("getGbifFeaturesForRegionIds", () => {
  afterEach(() => {
    clearGbifStore();
  });

  test("returns only the requested region after the row index is rebuilt", () => {
    upsertGbifFeatures([point(1, 30), point(2, 31)], "RU-VLG");
    upsertGbifFeatures([point(3, 37)], "RU-MOW");

    const vologda = getGbifFeaturesForRegionIds(["RU-VLG"]);
    const both = getGbifFeaturesForRegionIds(["RU-MOW", "RU-VLG"]);

    expect(vologda.map((feature) => feature.properties.gbif_key)).toEqual([1, 2]);
    expect(both.map((feature) => feature.properties.gbif_key)).toEqual([3, 1, 2]);
  });
});
