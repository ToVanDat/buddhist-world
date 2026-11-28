import { describe, expect, it } from "vitest";
import { isWorldContentSchemaNotReady } from "./interactionErrors.js";

describe("isWorldContentSchemaNotReady", () => {
  it.each(["42P01", "42703", "3F000"])("recognizes missing schema code %s", (code) => {
    expect(isWorldContentSchemaNotReady({ code })).toBe(true);
  });
  it("does not misclassify transient database failures", () => {
    expect(isWorldContentSchemaNotReady({ code: "08006" })).toBe(false);
    expect(isWorldContentSchemaNotReady(new Error("connection timeout"))).toBe(false);
    expect(isWorldContentSchemaNotReady(null)).toBe(false);
  });
});
