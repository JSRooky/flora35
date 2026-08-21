import { firstLatinWord } from "./speciesLookup";
import { buildTaxonSearchExtras } from "./taxonFilters";
import {
  TAXON_LOAD_MODES,
  buildGbifLoadExtras,
  buildGbifTaxonOnlyExtras,
  buildInatLoadExtras,
  extrasFromLoadedQuery,
  taxonQueryFields
} from "./taxonLoadSelection";

describe("firstLatinWord", () => {
  it("takes the first Latin token from a binomial", () => {
    expect(firstLatinWord("Betula pendula")).toBe("Betula");
  });

  it("finds Latin after a Russian name", () => {
    expect(firstLatinWord("Берёза Betula pendula")).toBe("Betula");
  });

  it("returns empty string without Latin letters", () => {
    expect(firstLatinWord("Берёза повислая")).toBe("");
  });
});

describe("taxon load extras", () => {
  it("ignores local GBIF keys", () => {
    expect(
      buildTaxonSearchExtras({
        kingdomId: "plantae",
        taxon: { taxonKey: "local:betula-pendula" }
      })
    ).toEqual({ kingdomKey: 6 });
  });

  it("builds GBIF extras for a species taxonKey", () => {
    const extras = buildGbifLoadExtras(
      {
        mode: TAXON_LOAD_MODES.SPECIES,
        taxonKey: 2874620,
        kingdomId: "plantae"
      },
      "animalia"
    );
    expect(extras).toEqual({ kingdomKey: 6, taxonKey: 2874620 });
  });

  it("builds family extras without mixing taxonKey", () => {
    const extras = buildGbifTaxonOnlyExtras({
      mode: TAXON_LOAD_MODES.FAMILY,
      familyKey: 2405,
      taxonKey: 2405
    });
    expect(extras).toEqual({ familyKey: 2405 });
  });

  it("prefers iNat taxon_id over iconic taxa", () => {
    const extras = buildInatLoadExtras(
      { inatTaxonId: 50108 },
      ["plantae"],
      { plantae: "Plantae" }
    );
    expect(extras).toEqual({ taxon_id: 50108 });
  });

  it("stores taxon fields on the load query", () => {
    expect(
      taxonQueryFields({
        mode: TAXON_LOAD_MODES.GENUS,
        taxonKey: 2684242,
        scientificName: "Betula",
        inatTaxonId: 50108
      })
    ).toMatchObject({
      taxonMode: TAXON_LOAD_MODES.GENUS,
      taxonKey: 2684242,
      scientificName: "Betula",
      inatTaxonId: 50108
    });
  });

  it("rebuilds extras from a stored query for incremental loads", () => {
    expect(
      extrasFromLoadedQuery(
        {
          taxonMode: TAXON_LOAD_MODES.SPECIES,
          taxonKey: 12,
          inatTaxonId: 99,
          kingdomId: "plantae"
        },
        "inat"
      )
    ).toEqual({ taxon_id: 99 });

    expect(
      extrasFromLoadedQuery(
        {
          taxonMode: TAXON_LOAD_MODES.SPECIES,
          taxonKey: 12,
          kingdomId: "plantae"
        },
        "gbif"
      )
    ).toEqual({ kingdomKey: 6, taxonKey: 12 });
  });
});
