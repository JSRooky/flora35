import { splitTempUnitsByRegnum } from "./tempRegnumUnits";

function point(regnum) {
  return {
    type: "Feature",
    properties: { regnum },
    geometry: { type: "Point", coordinates: [0, 0] }
  };
}

describe("splitTempUnitsByRegnum", () => {
  test("splits a temp unit by kingdom and keeps points without regnum", () => {
    const plant = point("Plantae");
    const animal = point("animalia");
    const plain = point("");
    const units = splitTempUnitsByRegnum(
      [{ id: "all", markerColor: "#111111", features: [plant, animal, plain] }],
      true
    );

    expect(units.map((unit) => unit.id)).toEqual([
      "all--plantae",
      "all--animalia",
      "all--other"
    ]);
    expect(units[0].features).toEqual([plant]);
    expect(units[0].markerColor).not.toBe("#111111");
    expect(units[2].features).toEqual([plain]);
    expect(units[2].markerColor).toBe("#111111");
  });

  test("leaves the unit unchanged when grouping is off", () => {
    const unit = { id: "all", markerColor: null, features: [point("plantae")] };
    expect(splitTempUnitsByRegnum([unit], false)).toEqual([unit]);
  });
});
