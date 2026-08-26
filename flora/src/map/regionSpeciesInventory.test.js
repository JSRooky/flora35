import { buildRegionSpeciesInventory } from "./regionSpeciesInventory";
import { getTempLayers } from "../tempLayers/tempLayerStore";
import { getGbifColumnarTable } from "../gbif/gbifStore";
import { getInatColumnarTable } from "../inaturalist/inatStore";

jest.mock("../gbif/gbifStore", () => ({
  getGbifColumnarTable: jest.fn()
}));
jest.mock("../gbif/gbifColumnar", () => ({
  readGbifFamily: (_table, i) => _table.family[i],
  readGbifNameLatin: (_table, i) => _table.name_latin[i],
  readGbifRegionId: (_table, i) => _table.region_id[i],
  readGbifRegnum: (_table, i) => _table.regnum[i]
}));
jest.mock("../inaturalist/inatStore", () => ({
  getInatColumnarTable: jest.fn()
}));
jest.mock("../inaturalist/inatColumnar", () => ({
  readInatFamily: (_table, i) => _table.family[i],
  readInatNameLatin: (_table, i) => _table.name_latin[i],
  readInatRegionId: (_table, i) => _table.region_id[i],
  readInatRegnum: (_table, i) => _table.regnum[i]
}));
jest.mock("../names/nameRuCache", () => ({
  getOverlayRussianName: () => ""
}));
jest.mock("../tempLayers/tempLayerStore", () => ({
  getTempLayers: jest.fn()
}));

describe("buildRegionSpeciesInventory", () => {
  beforeEach(() => {
    getGbifColumnarTable.mockReturnValue({ rowCount: 0 });
    getInatColumnarTable.mockReturnValue({ rowCount: 0 });
    getTempLayers.mockReturnValue([]);
  });

  test("collects unique species for an external region", () => {
    getGbifColumnarTable.mockReturnValue({
      rowCount: 3,
      name_latin: ["Pinus sylvestris", "Pinus sylvestris", "Betula pendula"],
      family: ["Pinaceae", "Pinaceae", "Betulaceae"],
      regnum: ["plantae", "plantae", "plantae"],
      region_id: ["vologda", "vologda", "moscow"]
    });
    const species = buildRegionSpeciesInventory({
      regionId: "vologda",
      mode: "external"
    });
    expect(species).toHaveLength(1);
    expect(species[0].nameLatin).toBe("Pinus sylvestris");
    expect(species[0].pointCount).toBe(2);
    expect(species[0].family).toBe("Pinaceae");
  });

  test("reads temp-layer features for the matching region", () => {
    getTempLayers.mockReturnValue([
      {
        id: "layer-1",
        regionIds: ["vologda"],
        features: [
          {
            properties: {
              name_latin: "Picea abies",
              family: "Pinaceae",
              regnum: "plantae",
              region_id: "vologda"
            }
          },
          {
            properties: {
              name_latin: "Canis lupus",
              family: "Canidae",
              regnum: "animalia",
              region_id: "moscow"
            }
          }
        ]
      }
    ]);
    const species = buildRegionSpeciesInventory({
      regionId: "vologda",
      layerIds: ["layer-1"],
      mode: "temp"
    });
    expect(species.map((item) => item.nameLatin)).toEqual(["Picea abies"]);
  });
});
