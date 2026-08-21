import {
  COMPARE_SET_MAX,
  UNNAMED_SPECIES_KEY,
  countSpeciesByLayers,
  listCompareTempLayerOptions,
  listPresentCompareFields
} from "./countSpeciesByLayers";

function point(nameLatin, nameRu) {
  return {
    type: "Feature",
    properties: { name_latin: nameLatin, name_ru: nameRu },
    geometry: { type: "Point", coordinates: [0, 0] }
  };
}

describe("countSpeciesByLayers", () => {
  it("counts each species across two layers", () => {
    const result = countSpeciesByLayers([
      {
        id: "a",
        label: "A",
        features: [point("Betula pendula"), point("Betula pendula"), point("Pinus sylvestris")]
      },
      {
        id: "b",
        label: "B",
        features: [point("Betula pendula"), point("Picea abies")]
      }
    ]);

    expect(result.layers).toEqual([
      { id: "a", label: "A" },
      { id: "b", label: "B" }
    ]);
    const birch = result.rows.find((row) => row.key === "betula pendula");
    expect(birch.counts).toEqual({ a: 2, b: 1 });
    expect(birch.total).toBe(3);
    const pine = result.rows.find((row) => row.key === "pinus sylvestris");
    expect(pine.counts).toEqual({ a: 1, b: 0 });
  });

  it("keeps unnamed points and supports more than two layers", () => {
    const result = countSpeciesByLayers([
      { id: "a", features: [point(""), point("Rosa canina")] },
      { id: "b", features: [{ type: "Feature", properties: {}, geometry: null }] },
      { id: "c", features: [point("Rosa canina")] }
    ]);

    expect(result.layers).toHaveLength(3);
    const unnamed = result.rows.find((row) => row.key === UNNAMED_SPECIES_KEY);
    expect(unnamed.counts).toEqual({ a: 1, b: 1, c: 0 });
    expect(unnamed.unnamed).toBe(true);
    expect(COMPARE_SET_MAX).toBeGreaterThanOrEqual(5);
  });
});

describe("listPresentCompareFields", () => {
  it("lists only fields that have values", () => {
    expect(
      listPresentCompareFields([
        point("Rosa canina", "Шиповник"),
        { type: "Feature", properties: { found_year: 2019 }, geometry: null }
      ])
    ).toEqual(["name_latin", "name_ru", "found_year"]);
  });
});

describe("listCompareTempLayerOptions", () => {
  it("skips region layers and formats labels", () => {
    const options = listCompareTempLayerOptions([
      {
        id: "1",
        label: "Carex",
        source: "gbif",
        features: [point("Carex acuta")]
      },
      {
        id: "2",
        source: "regions",
        kind: "regions",
        features: []
      }
    ]);

    expect(options).toHaveLength(1);
    expect(options[0].label).toContain("Carex");
    expect(options[0].label).toContain("GBIF");
    expect(options[0].pointCount).toBe(1);
  });
});
