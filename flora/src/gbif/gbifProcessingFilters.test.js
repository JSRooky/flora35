import {
  applyGbifProcessingFilters,
  filterGbifTableIndices
} from "./gbifProcessingFilters";
import { encodeGbifFeatures } from "./gbifColumnar";

describe("gbif region visibility filter", () => {
  const features = [
    {
      type: "Feature",
      properties: {
        gbif_key: 1,
        name_latin: "Betula pendula",
        family: "Betulaceae",
        regnum: "plantae",
        region_id: "vologda"
      },
      geometry: { type: "Point", coordinates: [39.8, 59.2] }
    },
    {
      type: "Feature",
      properties: {
        gbif_key: 2,
        name_latin: "Picea abies",
        family: "Pinaceae",
        regnum: "plantae",
        region_id: "moscow"
      },
      geometry: { type: "Point", coordinates: [37.6, 55.7] }
    }
  ];

  it("hides rows of disabled regions", () => {
    const table = encodeGbifFeatures(features);
    const indices = filterGbifTableIndices(table, {
      hiddenRegionIds: ["moscow"]
    });
    expect(indices).toEqual([0]);
  });

  it("filters feature arrays by region_id", () => {
    const visible = applyGbifProcessingFilters(features, {
      hiddenRegionIds: ["vologda"]
    });
    expect(visible).toHaveLength(1);
    expect(visible[0].properties.region_id).toBe("moscow");
  });
});
