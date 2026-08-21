import {
  computeLayerSimilarity,
  overallSimilarityVectors,
  pearsonR
} from "./similarityByLayers";

function point(nameLatin, family) {
  return {
    type: "Feature",
    properties: { name_latin: nameLatin, family },
    geometry: { type: "Point", coordinates: [0, 0] }
  };
}

describe("pearsonR", () => {
  it("returns 1 for identical series", () => {
    expect(pearsonR([1, 2, 3], [1, 2, 3])).toBeCloseTo(1);
  });

  it("returns 0 when one series has no variance", () => {
    expect(pearsonR([2, 2, 2], [1, 3, 5])).toBe(0);
  });

  it("returns 1 when both series are the same constant", () => {
    expect(pearsonR([2, 2, 2], [2, 2, 2])).toBe(1);
  });
});

describe("computeLayerSimilarity", () => {
  it("computes four levels for a layer pair", () => {
    const result = computeLayerSimilarity([
      {
        id: "a",
        label: "A",
        features: [
          point("Betula pendula", "Betulaceae"),
          point("Betula pendula", "Betulaceae"),
          point("Alnus glutinosa", "Betulaceae"),
          point("Pinus sylvestris", "Pinaceae")
        ]
      },
      {
        id: "b",
        label: "B",
        features: [
          point("Betula pendula", "Betulaceae"),
          point("Alnus glutinosa", "Betulaceae"),
          point("Picea abies", "Pinaceae")
        ]
      }
    ]);

    expect(result.pairs).toHaveLength(1);
    const pair = result.pairs[0];
    expect(pair.species.n).toBeGreaterThanOrEqual(3);
    expect(pair.genus.n).toBeGreaterThanOrEqual(3);
    expect(pair.family.n).toBe(2);
    expect(pair.overall.n).toBeGreaterThan(pair.family.n);
    expect(pair.species.r).not.toBeNull();
    expect(pair.species.r2).toBeCloseTo(pair.species.r * pair.species.r);
  });
});

describe("overallSimilarityVectors", () => {
  it("stacks family genus-richness, genus species-richness and species points", () => {
    const { xs, ys } = overallSimilarityVectors(
      [point("Betula pendula", "Betulaceae"), point("Betula pubescens", "Betulaceae")],
      [point("Betula pendula", "Betulaceae")]
    );
    expect(xs.length).toBe(ys.length);
    expect(xs.length).toBe(1 + 1 + 2);
  });
});
