import {
  chao1,
  coverage,
  computeEvennessStats,
  computeOverlapStats,
  expectedRichness
} from "./compareExtraStats";

function layer(id, label, names) {
  return {
    id,
    label,
    features: names.map((name_latin) => ({
      type: "Feature",
      properties: { name_latin },
      geometry: { type: "Point", coordinates: [0, 0] }
    }))
  };
}

describe("compareExtraStats", () => {
  test("jaccard is 1 for identical species sets", () => {
    const report = computeOverlapStats([
      layer("a", "A", ["Betula pendula", "Pinus sylvestris"]),
      layer("b", "B", ["Betula pendula", "Pinus sylvestris"])
    ]);
    expect(report.sections[1].rows[0][1]).toBe("1");
  });

  test("chao1 grows when many singletons", () => {
    const counts = new Map([
      ["a", 1],
      ["b", 1],
      ["c", 2]
    ]);
    expect(chao1(counts)).toBeGreaterThan(3);
    expect(coverage(counts)).toBeCloseTo(1 - 2 / 4);
  });

  test("rarefaction at full n equals observed richness", () => {
    const counts = new Map([
      ["a", 3],
      ["b", 1]
    ]);
    expect(expectedRichness(counts, 4)).toBe(2);
  });

  test("evenness returns shannon for a layer", () => {
    const report = computeEvennessStats([
      layer("a", "A", ["Betula pendula", "Betula pendula", "Pinus sylvestris"]),
      layer("b", "B", ["Alnus glutinosa"])
    ]);
    expect(report.sections[0].rows[0][2]).not.toBe("—");
  });
});
