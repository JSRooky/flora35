import { COLUMNAR_FORMAT } from "../externalSources/columnarSnapshot";
import {
  compactGbifTable,
  decodeGbifFeatures,
  encodeGbifFeatures,
  gbifTablePackedBytes,
  hydrateGbifTable,
  upsertGbifFeaturesIntoTable
} from "./gbifColumnar";
import {
  compactInatTable,
  decodeInatFeatures,
  encodeInatFeatures,
  hydrateInatTable,
  upsertInatFeaturesIntoTable
} from "../inaturalist/inatColumnar";

function makeGbifFeature(overrides = {}) {
  const props = {
    source: "gbif",
    gbif_key: 1001,
    name_latin: "Betula pendula",
    name_ru: "берёза",
    species_key: 2878688,
    regnum: "plantae",
    family: "Betulaceae",
    found_year: 2020,
    found_month: 6,
    found_by: "Ivanov",
    identified_by: "Petrov",
    datasetKey: "abc-123",
    basisOfRecord: "HUMAN_OBSERVATION",
    gbif_url: "https://www.gbif.org/occurrence/stale",
    ...overrides.properties
  };

  return {
    type: "Feature",
    id: `gbif-${props.gbif_key}`,
    geometry: {
      type: "Point",
      coordinates: overrides.coordinates ?? [39.8, 59.2]
    },
    properties: props
  };
}

function makeInatFeature(overrides = {}) {
  const props = {
    source: "inaturalist",
    inat_id: 555,
    name_latin: "Picea abies",
    name_ru: "ель",
    taxon_id: 64540,
    regnum: "plantae",
    family: "Pinaceae",
    found_year: 2021,
    found_month: 7,
    found_by: "user1",
    quality_grade: "research",
    place_guess: "Vologda",
    license_code: "cc-by",
    obscured: false,
    inat_url: "https://www.inaturalist.org/observations/custom-555",
    ...overrides.properties
  };

  return {
    type: "Feature",
    id: `inat-${props.inat_id}`,
    geometry: {
      type: "Point",
      coordinates: overrides.coordinates ?? [40.1, 59.3]
    },
    properties: props
  };
}

describe("gbif columnar snapshot", () => {
  it("roundtrips fields and reconstructs source/url, dropping name_ru", () => {
    const table = encodeGbifFeatures([makeGbifFeature()]);
    const [decoded] = decodeGbifFeatures(table);

    expect(decoded.properties.source).toBe("gbif");
    expect(decoded.properties.gbif_key).toBe(1001);
    expect(decoded.properties.name_latin).toBe("Betula pendula");
    expect(decoded.properties.name_ru).toBeNull();
    expect(decoded.properties.species_key).toBe(2878688);
    expect(decoded.properties.regnum).toBe("plantae");
    expect(decoded.properties.family).toBe("Betulaceae");
    expect(decoded.properties.found_year).toBe(2020);
    expect(decoded.properties.found_month).toBe(6);
    expect(decoded.properties.found_by).toBe("Ivanov");
    expect(decoded.properties.identified_by).toBe("Petrov");
    expect(decoded.properties.datasetKey).toBe("abc-123");
    expect(decoded.properties.basisOfRecord).toBe("HUMAN_OBSERVATION");
    expect(decoded.properties.gbif_url).toBe("https://www.gbif.org/occurrence/1001");
    expect(decoded.properties.region_id).toBeNull();
    expect(decoded.geometry.coordinates).toEqual([39.8, 59.2]);
  });

  it("keeps null optional fields", () => {
    const table = encodeGbifFeatures([
      makeGbifFeature({
        properties: {
          name_latin: null,
          species_key: null,
          family: null,
          found_year: null,
          found_month: null,
          found_by: null,
          identified_by: null,
          datasetKey: null,
          basisOfRecord: null,
          regnum: null
        }
      })
    ]);
    const [decoded] = decodeGbifFeatures(table);

    expect(decoded.properties.name_latin).toBeNull();
    expect(decoded.properties.species_key).toBeNull();
    expect(decoded.properties.family).toBeNull();
    expect(decoded.properties.found_year).toBeNull();
    expect(decoded.properties.found_month).toBeNull();
    expect(decoded.properties.found_by).toBeNull();
    expect(decoded.properties.identified_by).toBeNull();
    expect(decoded.properties.datasetKey).toBeNull();
    expect(decoded.properties.basisOfRecord).toBeNull();
    expect(decoded.properties.regnum).toBeNull();
  });

  it("roundtrips empty table and compact/hydrate", () => {
    const empty = encodeGbifFeatures([]);
    expect(empty.rowCount).toBe(0);
    expect(decodeGbifFeatures(empty)).toEqual([]);

    const compacted = compactGbifTable(empty);
    expect(compacted.format).toBe(COLUMNAR_FORMAT);
    expect(hydrateGbifTable(compacted).rowCount).toBe(0);
  });

  it("shares string dictionaries across rows", () => {
    const table = encodeGbifFeatures([
      makeGbifFeature({ properties: { gbif_key: 1, name_latin: "Betula pendula" } }),
      makeGbifFeature({ properties: { gbif_key: 2, name_latin: "Betula pendula" } }),
      makeGbifFeature({ properties: { gbif_key: 3, name_latin: "Picea abies" } })
    ]);

    expect(table.name_latin.dict.filter(Boolean)).toEqual([
      "Betula pendula",
      "Picea abies"
    ]);
    expect(gbifTablePackedBytes(table)).toBeGreaterThan(0);
  });

  it("upserts by gbif_key", () => {
    let table = encodeGbifFeatures([makeGbifFeature({ properties: { gbif_key: 1 } })]);
    const idToIndex = new Map([["1", 0]]);
    const result = upsertGbifFeaturesIntoTable(table, idToIndex, [
      makeGbifFeature({
        properties: { gbif_key: 1, name_latin: "Updated" },
        coordinates: [1, 2]
      }),
      makeGbifFeature({ properties: { gbif_key: 2, name_latin: "New" } })
    ]);

    expect(result.added).toBe(1);
    expect(result.updated).toBe(1);
    expect(result.table.rowCount).toBe(2);

    const features = decodeGbifFeatures(result.table);
    expect(features[0].properties.name_latin).toBe("Updated");
    expect(features[0].geometry.coordinates).toEqual([1, 2]);
    expect(features[1].properties.gbif_key).toBe(2);
  });

  it("roundtrips region_id and hydrates snapshots without the column", () => {
    const table = encodeGbifFeatures([
      makeGbifFeature({ properties: { region_id: "vologda" } })
    ]);
    expect(decodeGbifFeatures(table)[0].properties.region_id).toBe("vologda");

    const compacted = compactGbifTable(table);
    const { region_id: _regionId, ...legacy } = compacted;
    const hydrated = hydrateGbifTable(legacy);
    expect(decodeGbifFeatures(hydrated)[0].properties.region_id).toBeNull();
  });
});

describe("inat columnar snapshot", () => {
  it("roundtrips fields and reconstructs default url", () => {
    const withDefaultUrl = makeInatFeature({
      properties: { inat_url: "https://www.inaturalist.org/observations/555" }
    });
    const table = encodeInatFeatures([withDefaultUrl]);
    const compacted = compactInatTable(table);
    const hydrated = hydrateInatTable(compacted);
    const [decoded] = decodeInatFeatures(hydrated);

    expect(decoded.properties.source).toBe("inaturalist");
    expect(decoded.properties.inat_id).toBe(555);
    expect(decoded.properties.name_ru).toBeNull();
    expect(decoded.properties.obscured).toBe(false);
    expect(decoded.properties.inat_url).toBe(
      "https://www.inaturalist.org/observations/555"
    );
    expect(decoded.properties.quality_grade).toBe("research");
  });

  it("keeps custom observation uri", () => {
    const table = encodeInatFeatures([makeInatFeature()]);
    const [decoded] = decodeInatFeatures(table);
    expect(decoded.properties.inat_url).toBe(
      "https://www.inaturalist.org/observations/custom-555"
    );
  });

  it("keeps null optional fields and obscured flag", () => {
    const table = encodeInatFeatures([
      makeInatFeature({
        properties: {
          name_latin: null,
          taxon_id: null,
          family: null,
          found_year: null,
          found_month: null,
          found_by: null,
          quality_grade: null,
          place_guess: null,
          license_code: null,
          obscured: true,
          inat_url: null
        }
      })
    ]);
    const [decoded] = decodeInatFeatures(table);

    expect(decoded.properties.name_latin).toBeNull();
    expect(decoded.properties.taxon_id).toBeNull();
    expect(decoded.properties.obscured).toBe(true);
    expect(decoded.properties.inat_url).toBe(
      "https://www.inaturalist.org/observations/555"
    );
  });

  it("upserts by inat_id", () => {
    const encoded = encodeInatFeatures([makeInatFeature({ properties: { inat_id: 1 } })]);
    const result = upsertInatFeaturesIntoTable(encoded, null, [
      makeInatFeature({ properties: { inat_id: 1, name_latin: "Updated" } }),
      makeInatFeature({ properties: { inat_id: 9, name_latin: "New" } })
    ]);

    expect(result.added).toBe(1);
    expect(result.updated).toBe(1);
    const features = decodeInatFeatures(result.table);
    expect(features.map((item) => item.properties.inat_id).sort()).toEqual([1, 9]);
  });
});
