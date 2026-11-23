import { describe, expect, it } from "vitest";
import { REGIONS, WORLD_INTERACTIONS } from "@bw/shared";

describe("Buddhist World visitor content", () => {
  const region = REGIONS.temple_complex!;

  it("presents the four-stop visit in the intended visitor journey order", () => {
    expect(region.spawns.map((stop) => stop.id)).toEqual([
      "main_entrance",
      "courtyard",
      "main_hall",
      "lotus_pond",
    ]);
    expect(region.spawns.every((stop) => stop.name.trim() && stop.description.trim().length >= 80)).toBe(true);
  });

  it("gives each landmark a distinct, respectful visitor instruction", () => {
    const descriptions = region.spawns.map((stop) => stop.description.toLocaleLowerCase("vi"));
    expect(descriptions[0]).toContain("tam quan");
    expect(descriptions[1]).toContain("sân chùa");
    expect(descriptions[2]).toContain("giữ giọng nói nhỏ");
    expect(descriptions[3]).toContain("hoa sen");
    expect(new Set(descriptions).size).toBe(4);
  });

  it("keeps interaction prompts and narration aligned with their physical subjects", () => {
    const byId = new Map(WORLD_INTERACTIONS.map((interaction) => [interaction.id, interaction]));
    expect(byId.get("temple_bell")?.prompt.toLocaleLowerCase("vi")).toContain("tiếng chuông");
    expect(byId.get("incense_burner")?.response.toLocaleLowerCase("vi")).toContain("lòng thành kính");
    expect(byId.get("buddha_statue")?.response.toLocaleLowerCase("vi")).toContain("tôn tượng");
    expect(byId.get("main_altar")?.response.toLocaleLowerCase("vi")).toContain("tôn nghiêm");
    expect(byId.get("monk_guide")?.response.toLocaleLowerCase("vi")).toContain("hành trình gợi ý");
    expect(WORLD_INTERACTIONS.every((interaction) => interaction.response.trim().length >= 60)).toBe(true);
  });

  it("does not frame worship or cultural learning as combat, loot, or reward loops", () => {
    const copy = [
      ...region.spawns.map((stop) => stop.description),
      ...WORLD_INTERACTIONS.map((interaction) => interaction.prompt + " " + interaction.response),
    ].join(" ").toLocaleLowerCase("vi");
    expect(copy).not.toMatch(/chiến đấu|tiêu diệt|loot|phần thưởng|cày cấp/);
  });
});
