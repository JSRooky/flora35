import {
  COMPARE_SET_MAX,
  DIVERSITY_GROUP_MODES,
  UNNAMED_SPECIES_KEY,
  countSpeciesByLayers,
  formatDiversityCsv,
  listCompareTempLayerOptions,
  listPresentCompareFields,
  listSharedSpeciesRows,
  plaquesToCompareLayerInputs,
  summarizeDiversity
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

  it("groups points by genus or family", () => {
    const familyPoint = (latin, family) => ({
      type: "Feature",
      properties: { name_latin: latin, family },
      geometry: { type: "Point", coordinates: [0, 0] }
    });
    const genera = countSpeciesByLayers(
      [
        {
          id: "a",
          features: [familyPoint("Betula pendula", "Betulaceae"), familyPoint("Betula pubescens", "Betulaceae")]
        },
        { id: "b", features: [familyPoint("Pinus sylvestris", "Pinaceae")] }
      ],
      DIVERSITY_GROUP_MODES.GENUS
    );
    expect(genera.rows.find((row) => row.key === "betula").counts).toEqual({ a: 2, b: 0 });
    const families = countSpeciesByLayers(
      [
        {
          id: "a",
          features: [familyPoint("Betula pendula", "Betulaceae"), familyPoint("Alnus glutinosa", "Betulaceae")]
        },
        { id: "b", features: [familyPoint("Pinus sylvestris", "Pinaceae")] }
      ],
      DIVERSITY_GROUP_MODES.FAMILY
    );
    expect(families.rows.find((row) => row.key === "betulaceae").counts).toEqual({ a: 2, b: 0 });
  });
});

describe("plaquesToCompareLayerInputs", () => {
  it("merges features from all layers on a plaque", () => {
    const inputs = plaquesToCompareLayerInputs([
      {
        key: "p1",
        taxonName: "Carex",
        layers: [
          { source: "gbif", features: [point("Carex acuta")] },
          { source: "inat", features: [point("Carex nigra")] }
        ]
      }
    ]);
    expect(inputs).toEqual([
      {
        id: "p1",
        label: "Carex",
        features: [point("Carex acuta"), point("Carex nigra")]
      }
    ]);
  });

  it("can drop GBIF or iNat layers", () => {
    const plaques = [
      {
        key: "p1",
        taxonName: "Carex",
        layers: [
          { source: "gbif", features: [point("Carex acuta")] },
          { source: "inat", features: [point("Carex nigra")] },
          { source: "map", features: [point("Carex rostrata")] }
        ]
      }
    ];
    expect(plaquesToCompareLayerInputs(plaques, { includeGbif: false })[0].features).toEqual([
      point("Carex nigra"),
      point("Carex rostrata")
    ]);
    expect(plaquesToCompareLayerInputs(plaques, { includeInat: false })[0].features).toEqual([
      point("Carex acuta"),
      point("Carex rostrata")
    ]);
  });

  it("filters features by kingdom", () => {
    const plant = {
      type: "Feature",
      properties: { name_latin: "Betula pendula", regnum: "plantae" },
      geometry: { type: "Point", coordinates: [0, 0] }
    };
    const fungus = {
      type: "Feature",
      properties: { name_latin: "Amanita muscaria", regnum: "fungi" },
      geometry: { type: "Point", coordinates: [0, 0] }
    };
    const plaques = [
      {
        key: "p1",
        taxonName: "Mix",
        layers: [{ source: "gbif", features: [plant, fungus] }]
      }
    ];
    expect(
      plaquesToCompareLayerInputs(plaques, { allowedRegnums: new Set(["plantae"]) })[0].features
    ).toEqual([plant]);
  });
});

describe("summarizeDiversity", () => {
  it("counts named unique species per layer and intersection", () => {
    const result = countSpeciesByLayers([
      {
        id: "a",
        label: "A",
        features: [point("Betula pendula"), point("Betula pendula"), point("Pinus sylvestris"), point("")]
      },
      {
        id: "b",
        label: "B",
        features: [point("Betula pendula"), point("Picea abies")]
      }
    ]);
    const summary = summarizeDiversity(result);
    expect(summary.namedSpeciesTotal).toBe(3);
    expect(summary.sharedNamedSpecies).toBe(1);
    expect(summary.layers).toEqual([
      { id: "a", label: "A", uniqueSpecies: 2, pointCount: 4 },
      { id: "b", label: "B", uniqueSpecies: 2, pointCount: 2 }
    ]);
    expect(listSharedSpeciesRows(result).map((row) => row.nameLatin)).toEqual(["Betula pendula"]);
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

describe("formatDiversityCsv", () => {
  it("writes species table with a BOM", () => {
    const comparison = countSpeciesByLayers([
      { id: "a", label: "A", features: [point("Rosa canina", "Шиповник")] },
      { id: "b", label: "B", features: [point("Rosa canina")] }
    ]);
    const csv = formatDiversityCsv(comparison, summarizeDiversity(comparison));
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain("Латинское название");
    expect(csv).toContain("Rosa canina");
    expect(csv).toContain("Шиповник");
  });
});
