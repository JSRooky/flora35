import { collectActiveMapFilters, MAP_FILTER_IDS } from "./mapActiveFilters";

describe("collectActiveMapFilters", () => {
  it("includes property filter values for the feature panel", () => {
    const entries = collectActiveMapFilters({
      propertyFilters: {
        family: "Rosaceae",
        found_year: 2018
      }
    });

    const feature = entries.find((entry) => entry.id === MAP_FILTER_IDS.FEATURE);
    expect(feature).toEqual({
      id: MAP_FILTER_IDS.FEATURE,
      label: "О точке",
      details: ["Семейство: Rosaceae", "Год находки: 2018"]
    });
  });

  it("includes year range details", () => {
    const entries = collectActiveMapFilters({
      yearFilterEnabled: true,
      yearRange: { min: 1990, max: 2020 }
    });

    expect(entries[0]).toEqual({
      id: MAP_FILTER_IDS.YEAR,
      label: "Год находки",
      details: ["1990–2020"]
    });
  });

  it("includes selected regions as a map filter", () => {
    const entries = collectActiveMapFilters({
      selectedRegionNames: ["Вологодская область", "Архангельская область"],
      regionBufferKm: 12
    });

    expect(entries[0]).toEqual({
      id: MAP_FILTER_IDS.REGION_BOUNDS,
      label: "Регионы",
      details: ["Вологодская область", "Архангельская область", "буфер 12 км"]
    });
  });
});
