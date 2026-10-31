import { describe, expect, it } from "vitest";

import {
  COOKING_TIME_OUTLIER_THRESHOLD_MINUTES,
  isCookingTimeOutlier,
} from "../scripts/cooking-time.js";

describe("cooking-time outlier threshold", () => {
  it("uses the nearest-rank Tukey upper fence", () => {
    expect(COOKING_TIME_OUTLIER_THRESHOLD_MINUTES).toBe(132.5);
  });

  it("does not flag the integer immediately below the fence", () => {
    expect(isCookingTimeOutlier(132)).toBe(false);
  });

  it("flags the first integer above the fence", () => {
    expect(isCookingTimeOutlier(133)).toBe(true);
  });

  it("does not classify null or invalid values as outliers", () => {
    expect(isCookingTimeOutlier(null)).toBe(false);
    expect(isCookingTimeOutlier(-1)).toBe(false);
    expect(isCookingTimeOutlier(133.5)).toBe(false);
  });
});
