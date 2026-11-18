import { describe, expect, it } from "vitest";
import { stepDown, stepUp, type Quality } from "./quality";

describe("adaptive quality tiers", () => {
  const tiers: Quality[] = ["ULTRA", "HIGH", "MEDIUM", "LOW", "MOBILE"];

  it("steps down one tier at a time and stays at the minimum", () => {
    expect(tiers.map(stepDown)).toEqual(["HIGH", "MEDIUM", "LOW", "MOBILE", "MOBILE"]);
  });

  it("steps up one tier at a time and stays at the maximum", () => {
    expect(tiers.map(stepUp)).toEqual(["ULTRA", "ULTRA", "HIGH", "MEDIUM", "LOW"]);
  });

  it("can recover from the minimum to the highest tier without skipping levels", () => {
    let quality: Quality = "MOBILE";
    const recovered: Quality[] = [quality];
    while (quality !== "ULTRA") {
      quality = stepUp(quality);
      recovered.push(quality);
    }
    expect(recovered).toEqual(["MOBILE", "LOW", "MEDIUM", "HIGH", "ULTRA"]);
  });
});
