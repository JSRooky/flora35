import {
  chao1,
  coverage,
  computeEvennessStats,
  computeOverlapStats,
  computeQualityStats,
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

  test("overlap groups shared species by kingdom and family", () => {
    const point = (name_latin, regnum, family) => ({
      type: "Feature",
      properties: { name_latin, regnum, family },
      geometry: { type: "Point", coordinates: [0, 0] }
    });
    const report = computeOverlapStats([
      {
        id: "a",
        label: "A",
        features: [
          point("Betula pendula", "plantae", "Betulaceae"),
          point("Pinus sylvestris", "plantae", "Pinaceae"),
          point("Amanita muscaria", "fungi", "Amanitaceae")
        ]
      },
      {
        id: "b",
        label: "B",
        features: [
          point("Betula pendula", "plantae", "Betulaceae"),
          point("Amanita muscaria", "fungi", "Amanitaceae")
        ]
      }
    ]);
    const section = report.sections.find((item) => item.id === "overlap-kingdoms");
    expect(section.rows).toEqual([
      ["Растения", 1],
      ["Грибы", 1]
    ]);
    expect(report.overlapKingdoms.plantae.families[0]).toMatchObject({
      label: "Betulaceae",
      species: [{ name: "Betula pendula" }]
    });
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

  test("quality stats show criterion share of all points", () => {
    const report = computeQualityStats([
      {
        id: "a",
        label: "A",
        features: [
          {
            type: "Feature",
            properties: {
              name_latin: "Betula pendula",
              family: "Betulaceae",
              found_year: 2020,
              found_month: 6,
              temp_source: "gbif"
            },
            geometry: { type: "Point", coordinates: [40, 59] }
          },
          {
            type: "Feature",
            properties: { temp_source: "inat" },
            geometry: { type: "Point", coordinates: [40, 59] }
          }
        ]
      },
      layer("b", "B", ["Pinus sylvestris"])
    ]);
    expect(report.sections[0].rows[0]).toEqual([
      "A",
      2,
      "1 (50%)",
      "1 (50%)",
      "1 (50%)",
      "1 (50%)",
      "2 (100%)"
    ]);
    expect(report.sections[1].rows[0]).toEqual(["A", "1 (50%)", "1 (50%)", "0 (0%)"]);
  });
});
