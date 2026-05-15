import { describe, expect, it } from "vitest";
import { chooseCheckpointInterval } from "./performance";

describe("chooseCheckpointInterval", () => {
  it("keeps small histories dense", () => {
    expect(chooseCheckpointInterval(20, 200)).toBe(5);
  });

  it("widens checkpoints as commit and file counts grow", () => {
    expect(chooseCheckpointInterval(75, 200)).toBe(10);
    expect(chooseCheckpointInterval(150, 200)).toBe(25);
    expect(chooseCheckpointInterval(350, 200)).toBe(50);
    expect(chooseCheckpointInterval(20, 12_000)).toBe(50);
  });
});
