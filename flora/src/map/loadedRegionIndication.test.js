import { setGbifFeatureCollection, clearGbifStore, replaceGbifLoadedRegionIds } from "../gbif/gbifStore";
import {
  listIndicatedExternalRegionIds,
  markExternalWorkingSetLoaded,
  markExternalWorkingSetUnloaded,
  resetLoadedRegionIndicationForTests,
  getIndicatedExternalRegionStats
} from "./loadedRegionIndication";

describe("loadedRegionIndication", () => {
  afterEach(() => {
    clearGbifStore();
    resetLoadedRegionIndicationForTests();
  });

  test("keeps remembered region ids after the working set is unloaded", () => {
    replaceGbifLoadedRegionIds(["vologda"], "vologda");
    markExternalWorkingSetLoaded();
    expect([...listIndicatedExternalRegionIds()]).toEqual(["vologda"]);

    markExternalWorkingSetUnloaded();
    clearGbifStore();
    expect([...listIndicatedExternalRegionIds()]).toEqual(["vologda"]);
  });

  test("keeps remembered region counts after the working set is unloaded", () => {
    setGbifFeatureCollection(
      {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: { type: "Point", coordinates: [40, 59] },
            properties: { gbif_key: 1, region_id: "vologda" }
          },
          {
            type: "Feature",
            geometry: { type: "Point", coordinates: [41, 59] },
            properties: { gbif_key: 2, region_id: "vologda" }
          }
        ]
      },
      "vologda"
    );
    markExternalWorkingSetLoaded();
    expect(getIndicatedExternalRegionStats().get("vologda")).toEqual({ gbif: 2, inat: 0 });

    markExternalWorkingSetUnloaded();
    clearGbifStore();
    expect([...listIndicatedExternalRegionIds()]).toEqual(["vologda"]);
    expect(getIndicatedExternalRegionStats().get("vologda")).toEqual({ gbif: 2, inat: 0 });
  });

  test("follows live data again after the working set is reloaded empty", () => {
    replaceGbifLoadedRegionIds(["vologda"], "vologda");
    markExternalWorkingSetLoaded();
    markExternalWorkingSetUnloaded();
    clearGbifStore();

    markExternalWorkingSetLoaded();
    expect([...listIndicatedExternalRegionIds()]).toEqual([]);
  });
});
