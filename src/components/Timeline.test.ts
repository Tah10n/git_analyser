import { describe, expect, it } from "vitest";
import { getMarkerPositionPercent } from "./Timeline";

describe("getMarkerPositionPercent", () => {
  it("keeps a single-commit timeline marker in bounds", () => {
    expect(getMarkerPositionPercent(0, 1)).toBe("0%");
  });

  it("spreads multi-commit markers across the full timeline", () => {
    expect(getMarkerPositionPercent(0, 3)).toBe("0%");
    expect(getMarkerPositionPercent(1, 3)).toBe("50%");
    expect(getMarkerPositionPercent(2, 3)).toBe("100%");
  });
});
