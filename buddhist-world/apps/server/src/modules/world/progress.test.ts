import { describe, expect, it } from "vitest";
import { advanceInteractionProgress, type QuestObjective } from "./progress";

const objectives: QuestObjective[] = [
  { type: "interact", targetId: "temple_bell", count: 1 },
  { type: "interact", targetId: "incense_burner", count: 2 },
];

describe("advanceInteractionProgress", () => {
  it("increments only the objective matching the validated target", () => {
    const result = advanceInteractionProgress(objectives, {}, "temple_bell");
    expect(result.progress).toEqual({ temple_bell: 1 });
    expect(result.completed).toBe(false);
  });
  it("caps progress at the objective count and completes only when all objectives are met", () => {
    const first = advanceInteractionProgress(objectives, { temple_bell: 1 }, "incense_burner");
    expect(first.progress.incense_burner).toBe(1);
    expect(first.completed).toBe(false);
    const second = advanceInteractionProgress(objectives, first.progress, "incense_burner");
    expect(second.progress.incense_burner).toBe(2);
    expect(second.completed).toBe(true);
    const capped = advanceInteractionProgress(objectives, second.progress, "incense_burner");
    expect(capped.progress.incense_burner).toBe(2);
  });
  it("does not complete an empty objective list", () => {
    expect(advanceInteractionProgress([], {}, "temple_bell").completed).toBe(false);
  });
});
