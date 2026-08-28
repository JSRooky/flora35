import {
  featureMatchesRegionSpeciesAllowlist,
  speciesDisplayKey
} from "./regionSpeciesAllowlist";

describe("regionSpeciesAllowlist", () => {
  test("matches latin names case-insensitively", () => {
    const allowlist = [{ nameLatin: "Pinus sylvestris", nameRu: "" }];
    expect(
      featureMatchesRegionSpeciesAllowlist(
        { properties: { name_latin: "Pinus sylvestris" } },
        allowlist
      )
    ).toBe(true);
    expect(
      featureMatchesRegionSpeciesAllowlist(
        { properties: { name_latin: "Betula pendula" } },
        allowlist
      )
    ).toBe(false);
  });

  test("empty allowlist hides every point", () => {
    expect(
      featureMatchesRegionSpeciesAllowlist(
        { properties: { name_latin: "Pinus sylvestris" } },
        []
      )
    ).toBe(false);
  });

  test("null allowlist does not filter", () => {
    expect(
      featureMatchesRegionSpeciesAllowlist(
        { properties: { name_latin: "Pinus sylvestris" } },
        null
      )
    ).toBe(true);
  });

  test("builds a stable key", () => {
    expect(speciesDisplayKey({ nameLatin: "Pinus sylvestris" })).toBe(
      "latin:pinus sylvestris"
    );
  });
});
