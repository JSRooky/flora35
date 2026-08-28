import {
  DISTRIBUTION_TAXON_MODES,
  buildCoordinateDistributions,
  listDistributionTaxa,
  meanDirectionFromPoints
} from "./distributionByCoords";

function point(lon, lat, nameLatin, family) {
  return {
    type: "Feature",
    properties: { name_latin: nameLatin, family },
    geometry: { type: "Point", coordinates: [lon, lat] }
  };
}

describe("buildCoordinateDistributions", () => {
  it("builds shared-axis share histograms", () => {
    const result = buildCoordinateDistributions(
      [
        {
          id: "a",
          label: "A",
          features: [point(30, 50, "Betula pendula", "Betulaceae"), point(30, 60, "Betula pendula", "Betulaceae")]
        },
        {
          id: "b",
          label: "B",
          features: [point(40, 55, "Pinus sylvestris", "Pinaceae")]
        }
      ],
      { binCount: 10 }
    );

    expect(result.layers).toHaveLength(2);
    expect(result.layers[0].pointCount).toBe(2);
    expect(result.layers[0].lat.shares.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1);
    expect(result.layers[1].lon.counts.reduce((sum, value) => sum + value, 0)).toBe(1);
    expect(result.bounds.latMin).toBeLessThan(result.bounds.latMax);
    expect(result.layers[0].meanLat).toBeCloseTo(55);
    expect(result.layers[0].meanLon).toBeCloseTo(30);
    expect(result.layers[1].meanLat).toBe(55);
    expect(result.layers[1].meanLon).toBe(40);
  });

  it("filters by genus", () => {
    const result = buildCoordinateDistributions(
      [
        {
          id: "a",
          features: [
            point(30, 50, "Betula pendula", "Betulaceae"),
            point(31, 51, "Pinus sylvestris", "Pinaceae")
          ]
        }
      ],
      { mode: DISTRIBUTION_TAXON_MODES.GENUS, taxonKey: "betula", binCount: 8 }
    );
    expect(result.layers[0].pointCount).toBe(1);
  });
});

describe("meanDirectionFromPoints", () => {
  it("returns nulls for empty input", () => {
    expect(meanDirectionFromPoints([])).toEqual({ meanLat: null, meanLon: null });
  });

  it("uses circular mean for longitude across the antimeridian", () => {
    const mean = meanDirectionFromPoints([
      { lat: 10, lon: 170 },
      { lat: 20, lon: -170 }
    ]);
    expect(mean.meanLat).toBeCloseTo(15);
    expect(Math.abs(mean.meanLon)).toBeCloseTo(180, 0);
  });
});

describe("listDistributionTaxa", () => {
  it("lists unique families", () => {
    const taxa = listDistributionTaxa(
      [
        {
          features: [
            point(0, 0, "Betula pendula", "Betulaceae"),
            point(1, 1, "Alnus glutinosa", "Betulaceae"),
            point(2, 2, "Pinus sylvestris", "Pinaceae")
          ]
        }
      ],
      DISTRIBUTION_TAXON_MODES.FAMILY
    );
    expect(taxa.map((item) => item.key)).toEqual(["betulaceae", "pinaceae"]);
  });
});
