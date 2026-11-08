jest.mock("./spreadCoincidentPoints", () => ({
  getFeatureCoordinates: (feature) => {
    const coordinates = feature?.geometry?.coordinates;
    return Array.isArray(coordinates) && coordinates.length >= 2 ? coordinates : null;
  }
}));

import {
  partitionFeaturesByDensePiles,
  setHiddenDensePileKeys
} from "./densePiles";

function point(id, lng, lat) {
  return {
    type: "Feature",
    properties: { id, regnum: "Plantae" },
    geometry: { type: "Point", coordinates: [lng, lat] }
  };
}

describe("partitionFeaturesByDensePiles", () => {
  afterEach(() => {
    setHiddenDensePileKeys([]);
  });

  test("keeps every coincident point below the dense threshold", () => {
    const features = [point("a", 30, 60), point("b", 30, 60), point("c", 31, 60)];
    const { otherFeatures, denseClusterFeatures } = partitionFeaturesByDensePiles(
      features,
      { minSize: 10 }
    );
    expect(otherFeatures).toEqual(features);
    expect(denseClusterFeatures).toEqual([]);
  });

  test("collapsed dense pile counts points and expanded pile returns them all", () => {
    const features = Array.from({ length: 12 }, (_, index) => point(index, 30, 60));
    const collapsed = partitionFeaturesByDensePiles(features, { minSize: 10 });
    expect(collapsed.otherFeatures).toEqual([]);
    expect(collapsed.denseClusterFeatures).toHaveLength(1);
    expect(collapsed.denseClusterFeatures[0].properties.point_count).toBe(12);
    expect(collapsed.densePileMembersById.get("dense-30,60")).toBeInstanceOf(Map);

    const expanded = partitionFeaturesByDensePiles(features, {
      minSize: 10,
      expandedPileKeys: new Set(["30,60"])
    });
    expect(expanded.expandedDenseFeatures).toEqual(features);
    expect(expanded.densePileMembersById.get("dense-30,60")).toEqual(features);
    expect(expanded.denseClusterFeatures).toEqual([]);
  });
});
