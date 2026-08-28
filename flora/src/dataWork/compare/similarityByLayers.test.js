import {
  computeLayerSimilarity,
  formatSimilarityCsv,
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

describe("formatSimilarityCsv", () => {
  it("writes levels as rows and pairs as columns", () => {
    const csv = formatSimilarityCsv({
      pairs: [
        {
          leftLabel: "A",
          rightLabel: "B",
          species: { n: 3, r: 1, r2: 1 },
          genus: { n: 2, r: 0.5, r2: 0.25 },
          family: { n: 1, r: null, r2: null },
          overall: { n: 4, r: 0.25, r2: 0.0625 }
        }
      ]
    });
    expect(csv).toContain("Уровень,Показатель,A · B");
    expect(csv).toContain("Виды,n,3");
    expect(csv).toContain("Виды,R,1");
    expect(csv).toContain("Семейства,R,—");
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
