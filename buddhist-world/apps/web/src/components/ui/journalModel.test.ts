import { describe, expect, it } from "vitest";
import { getQuestProgress } from "./journalModel.js";

describe("getQuestProgress", () => {
  it("calculates combined objective progress", () => {
    expect(getQuestProgress(
      [{ targetId: "bell", count: 1 }, { targetId: "incense", count: 2 }],
      { bell: 1, incense: 1 },
    )).toEqual({ completed: 2, total: 3, percent: 67 });
  });

  it("clamps over-reported progress and ignores invalid objective counts", () => {
    expect(getQuestProgress(
      [{ targetId: "bell", count: 1 }, { targetId: "bad", count: 0 }],
      { bell: 9, bad: 9 },
    )).toEqual({ completed: 1, total: 1, percent: 100 });
  });

  it("handles missing progress and empty objectives", () => {
    expect(getQuestProgress([{ targetId: "bell", count: 2 }], undefined))
      .toEqual({ completed: 0, total: 2, percent: 0 });
    expect(getQuestProgress([], {})).toEqual({ completed: 0, total: 0, percent: 0 });
  });
});
