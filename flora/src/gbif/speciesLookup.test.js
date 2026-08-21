import { collapseTaxonSuggestions, isLatinBinomial } from "./speciesLookup";

describe("taxon suggestions", () => {
  test("распознаёт латинский биномен", () => {
    expect(isLatinBinomial("Calypso bulbosa")).toBe(true);
    expect(isLatinBinomial("Calypso")).toBe(false);
    expect(isLatinBinomial("калипсо")).toBe(false);
  });

  test("для Calypso bulbosa оставляет один принятый вид", () => {
    const items = [
      {
        taxonKey: 8354522,
        scientificName: "Calypso bulbosa",
        rank: "SPECIES",
        status: "DOUBTFUL",
        source: "suggest"
      },
      {
        taxonKey: 5323572,
        scientificName: "Calypso bulbosa",
        rank: "SPECIES",
        status: "ACCEPTED",
        source: "match"
      },
      {
        taxonKey: 7910671,
        scientificName: "Calypso bulbosa",
        rank: "SPECIES",
        status: "DOUBTFUL",
        source: "suggest"
      },
      {
        taxonKey: 5323590,
        scientificName: "Calypso bulbosa occidentalis",
        rank: "VARIETY",
        status: "ACCEPTED",
        source: "suggest"
      },
      {
        taxonKey: "local:1",
        scientificName: "Calypso bulbosa",
        vernacularName: "Калипсо луковичная",
        rank: "SPECIES",
        status: "LOCAL",
        source: "local"
      }
    ];

    const collapsed = collapseTaxonSuggestions(items, "Calypso bulbosa");
    expect(collapsed).toHaveLength(1);
    expect(collapsed[0].taxonKey).toBe(5323572);
    expect(collapsed[0].vernacularName).toBe("Калипсо луковичная");
  });
});
