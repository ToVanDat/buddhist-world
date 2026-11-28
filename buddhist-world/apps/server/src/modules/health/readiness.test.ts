import { describe, expect, it } from "vitest";
import { hasRequiredDemoSchema, REQUIRED_DEMO_MIGRATION } from "./readiness.js";

describe("demo schema readiness", () => {
  it("requires the latest migration needed by the demo", () => {
    expect(hasRequiredDemoSchema(["013_player_prayer_progress.sql", "014_communities.sql", "015_parties.sql", REQUIRED_DEMO_MIGRATION])).toBe(true);
  });

  it("does not report ready when the latest migration is missing", () => {
    expect(hasRequiredDemoSchema(["013_player_prayer_progress.sql", "014_communities.sql", "015_parties.sql"])).toBe(false);
  });

  it("fails closed when migration history is empty", () => {
    expect(hasRequiredDemoSchema([])).toBe(false);
  });
});
