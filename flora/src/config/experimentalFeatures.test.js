import {
  EXPERIMENTAL_FEATURE_IDS,
  acknowledgeExperimentalFeature,
  experimentalAckStorageKey,
  hasAcknowledgedExperimentalFeature
} from "./experimentalFeatures";

describe("experimentalFeatures", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("treats an unknown feature as not acknowledged", () => {
    expect(hasAcknowledgedExperimentalFeature(EXPERIMENTAL_FEATURE_IDS.COMPARE)).toBe(
      false
    );
    expect(hasAcknowledgedExperimentalFeature(EXPERIMENTAL_FEATURE_IDS.ANALYSIS)).toBe(
      false
    );
  });

  it("remembers acknowledgement per feature", () => {
    acknowledgeExperimentalFeature(EXPERIMENTAL_FEATURE_IDS.COMPARE);

    expect(hasAcknowledgedExperimentalFeature(EXPERIMENTAL_FEATURE_IDS.COMPARE)).toBe(
      true
    );
    expect(hasAcknowledgedExperimentalFeature(EXPERIMENTAL_FEATURE_IDS.ANALYSIS)).toBe(
      false
    );
    expect(window.localStorage.getItem(experimentalAckStorageKey("compare"))).toBe("1");
  });
});
