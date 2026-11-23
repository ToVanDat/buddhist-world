import { expect, test } from "@playwright/test";

interface MockQuest {
  id: string;
  title: string;
  description: string;
  objectives: { targetId: string; count: number; label: string }[];
  rewards: { itemId: string; quantity: number }[];
  status: "active" | "completed" | "abandoned" | null;
  is_repeatable: boolean;
  progress: Record<string, number>;
}

test("journal quest acceptance serializes actions and refreshes the HUD tracker", async ({ page }) => {
  let quests: MockQuest[] = [
    {
      id: "quest-bell",
      title: "Thỉnh chuông buổi sớm",
      description: "Hãy đến tháp chuông và thỉnh một tiếng chuông.",
      objectives: [{ targetId: "bell", count: 1, label: "Thỉnh chuông" }],
      rewards: [{ itemId: "lotus-token", quantity: 1 }],
      status: null,
      is_repeatable: false,
      progress: {},
    },
    {
      id: "quest-incense",
      title: "Nén hương thành kính",
      description: "Dâng một nén hương tại chính điện.",
      objectives: [{ targetId: "incense", count: 1, label: "Dâng hương" }],
      rewards: [],
      status: null,
      is_repeatable: false,
      progress: {},
    },
  ];
  let releaseAccept!: () => void;
  const acceptPending = new Promise<void>((resolve) => { releaseAccept = resolve; });

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (path === "/api/auth/refresh" && request.method() === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          accessToken: "playwright-test-token",
          user: { id: "player-e2e", username: "player-e2e", role: "player" },
        }),
      });
      return;
    }
    if (path === "/api/world/quests" && request.method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ quests }) });
      return;
    }
    if (path.startsWith("/api/world/quests/") && path.endsWith("/accept") && request.method() === "POST") {
      await acceptPending;
      const questId = path.split("/").at(-2);
      quests = quests.map((quest) => quest.id === questId ? { ...quest, status: "active" } : quest);
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true }) });
      return;
    }
    if (path === "/api/world/inventory" && request.method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [] }) });
      return;
    }
    if (path === "/api/world/events" && request.method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ events: [] }) });
      return;
    }
    if (path === "/api/world/achievements" && request.method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ achievements: [] }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });

  await page.route("**/socket.io/**", (route) => route.abort());
  await page.goto("/");
  await expect(page.locator(".bw-hud-top")).toBeVisible();

  await page.getByRole("button", { name: "Hành trình" }).click();
  const journal = page.getByRole("dialog", { name: "Hành trình của bạn" });
  await expect(journal).toBeVisible();
  const firstQuest = journal.locator("article").filter({ hasText: "Thỉnh chuông buổi sớm" });
  const secondQuest = journal.locator("article").filter({ hasText: "Nén hương thành kính" });
  const firstAccept = firstQuest.getByRole("button", { name: "Bắt đầu tìm hiểu" });
  const secondAccept = secondQuest.getByRole("button", { name: "Bắt đầu tìm hiểu" });

  await expect(firstAccept).toBeVisible();
  await firstAccept.scrollIntoViewIfNeeded();
  await firstAccept.click();
  await expect(firstQuest.getByRole("button", { name: "Đang xử lý…" })).toBeVisible();
  await expect(secondAccept).toBeDisabled();

  releaseAccept();
  await expect(firstQuest.getByText("Đang tìm hiểu")).toBeVisible();
  await expect(secondAccept).toBeEnabled();
  await journal.getByRole("button", { name: "Đóng sổ hành trình" }).click();

  const tracker = page.getByRole("complementary", { name: "Điểm khám phá đang theo dõi" });
  await expect(tracker).toBeVisible();
  await tracker.getByRole("button", { name: "Mở danh sách điểm khám phá" }).click();
  await expect(tracker.getByText("Thỉnh chuông buổi sớm")).toBeVisible();
  await expect(tracker.getByText("Thỉnh chuông", { exact: true })).toBeVisible();
});
