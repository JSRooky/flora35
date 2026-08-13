import {
  buildSpeciesSearchResults,
  createSpeciesSearchFilter,
  featureMatchesSpeciesSearch
} from "./speciesSearchFilter";

function point(latin, ru) {
  return {
    type: "Feature",
    properties: { name_latin: latin, name_ru: ru }
  };
}

describe("speciesSearchFilter", () => {
  test("createSpeciesSearchFilter ignores short queries", () => {
    expect(createSpeciesSearchFilter({ query: "B" })).toBeNull();
    expect(createSpeciesSearchFilter({ query: "Be" })).toEqual({
      query: "Be",
      nameLatin: null
    });
  });

  test("matches substring on latin or russian name", () => {
    const spec = { query: "берёз" };
    expect(featureMatchesSpeciesSearch(point("Betula pendula", "Берёза повислая"), spec)).toBe(
      true
    );
    expect(featureMatchesSpeciesSearch(point("Betula pubescens", "Берёза пушистая"), spec)).toBe(
      true
    );
    expect(featureMatchesSpeciesSearch(point("Pinus sylvestris", "Сосна обыкновенная"), spec)).toBe(
      false
    );
  });

  test("exact latin after species click", () => {
    const spec = { query: "Betul", nameLatin: "Betula pendula" };
    expect(featureMatchesSpeciesSearch(point("Betula pendula", "Берёза повислая"), spec)).toBe(
      true
    );
    expect(featureMatchesSpeciesSearch(point("Betula pubescens", "Берёза пушистая"), spec)).toBe(
      false
    );
  });

  test("buildSpeciesSearchResults groups by latin", () => {
    const results = buildSpeciesSearchResults([
      point("Betula pendula", "Берёза повислая"),
      point("Betula pendula", "Берёза повислая"),
      point("Betula pubescens", "Берёза пушистая")
    ]);
    expect(results).toHaveLength(2);
    expect(results.find((item) => item.nameLatin === "Betula pendula")?.pointCount).toBe(2);
  });
});
