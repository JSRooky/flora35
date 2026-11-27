import {
  DEFAULT_CLUSTER_REGNUM_COLORS,
  normalizeClusterRegnumColors
} from "./pointColors";

describe("normalizeClusterRegnumColors", () => {
  test("normalizes valid hex colors and uses defaults for invalid values", () => {
    expect(
      normalizeClusterRegnumColors({
        plantae: "#A1B2C3",
        animalia: "red",
        fungi: "#12345"
      })
    ).toEqual({
      plantae: "#a1b2c3",
      animalia: DEFAULT_CLUSTER_REGNUM_COLORS.animalia,
      fungi: DEFAULT_CLUSTER_REGNUM_COLORS.fungi,
      protozoa: DEFAULT_CLUSTER_REGNUM_COLORS.protozoa
    });
  });
});
