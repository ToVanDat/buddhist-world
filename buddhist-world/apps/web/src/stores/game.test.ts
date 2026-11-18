import { beforeEach, describe, expect, it } from "vitest";
import { useGame } from "./game";

describe("quest tracker invalidation", () => {
  beforeEach(() => useGame.setState({ questRevision: 0 }));

  it("increments the revision after a successful quest mutation", () => {
    useGame.getState().refreshQuestTracker();
    expect(useGame.getState().questRevision).toBe(1);
    useGame.getState().refreshQuestTracker();
    expect(useGame.getState().questRevision).toBe(2);
  });
});
