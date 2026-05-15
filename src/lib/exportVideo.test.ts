import { describe, expect, it } from "vitest";
import { recordTimelineWebm } from "./exportVideo";

describe("recordTimelineWebm", () => {
  it("rejects empty histories before checking browser recording support", async () => {
    await expect(recordTimelineWebm([], () => undefined)).rejects.toThrow(
      "No commits available to export.",
    );
  });
});
