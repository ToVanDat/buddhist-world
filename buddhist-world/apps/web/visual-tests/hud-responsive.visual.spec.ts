import { expect, test, type Page, type TestInfo } from "@playwright/test";

const mockApi = async (page: Page) => {
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const json = (body: unknown, status = 200) => route.fulfill({
      status, contentType: "application/json", body: JSON.stringify(body),
    });
    if (path === "/api/auth/refresh") {
      return json({
        accessToken: "responsive-visual-test-token",
        user: { id: "visual-player", username: "visual-player", displayName: "Người khám phá", role: "player" },
      });
    }
    if (path === "/api/world/quests") return json({ quests: [{
      id: "quest-bell", title: "Thỉnh chuông buổi sớm",
      description: "Đến tháp chuông và thỉnh một tiếng chuông.",
      objectives: [{ targetId: "bell", count: 1, label: "Thỉnh chuông" }],
      rewards: [{ itemId: "lotus-token", quantity: 1 }], status: null,
      is_repeatable: false, progress: {},
    }] });
    if (path === "/api/world/inventory") return json({ items: [{
      id: "incense-01", name: "Nén hương trầm", description: "Hương thơm dùng tại chính điện.",
      category: "offering", quantity: 3, stack_limit: 10,
    }] });
    if (path === "/api/world/events") return json({ events: [] });
    if (path === "/api/world/achievements") return json({ achievements: [] });
    return json({});
  });
  await page.route("**/socket.io/**", (route) => route.abort());
};

async function assertNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  expect(dimensions.document, JSON.stringify(dimensions)).toBeLessThanOrEqual(dimensions.viewport + 1);
  expect(dimensions.body, JSON.stringify(dimensions)).toBeLessThanOrEqual(dimensions.viewport + 1);
  return dimensions;
}

async function assertInsideViewport(page: Page, selector: string, inset = 8) {
  const viewport = page.viewportSize()!;
  const boxes = await page.locator(selector).evaluateAll((elements) => elements.map((element) => {
    const r = element.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
  }));
  for (const box of boxes) {
    expect(box.left, JSON.stringify(box)).toBeGreaterThanOrEqual(inset);
    expect(box.top, JSON.stringify(box)).toBeGreaterThanOrEqual(0);
    expect(box.right, JSON.stringify(box)).toBeLessThanOrEqual(viewport.width - inset);
    expect(box.bottom, JSON.stringify(box)).toBeLessThanOrEqual(viewport.height);
  }
  return boxes;
}

test("HUD, gameplay, onboarding, settings and journal responsive visual audit", async ({ page }, testInfo: TestInfo) => {
  test.setTimeout(180_000);
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.addInitScript(() => {
    localStorage.removeItem("bw.player.onboarding-dismissed.v1");
    localStorage.removeItem("bw.player.settings.v1");
    localStorage.removeItem("bw.player.camera-mode.v1");
  });
  await mockApi(page);
  await page.goto("/");
  await expect(page.locator(".bw-hud-top")).toBeVisible();
  await expect(page.locator(".stage canvas")).toBeVisible({ timeout: 45_000 });
  await expect(page.getByRole("complementary", { name: "Hướng dẫn điều khiển nhanh" })).toBeVisible();

  const audit: Record<string, unknown> = {
    project: testInfo.project.name,
    viewport: page.viewportSize(),
    screenshots: [],
  };
  const screenshots = audit.screenshots as string[];
  await page.screenshot({ path: testInfo.outputPath("01-gameplay-onboarding.png"), fullPage: true });
  screenshots.push("01-gameplay-onboarding.png");
  const pageSize = await assertNoHorizontalOverflow(page);

  const hudButtons = page.locator(".bw-hud-actions > button:visible");
  await expect(hudButtons).toHaveCount(4);
  const hudBoxes = await assertInsideViewport(page, ".bw-hud-actions > button:visible", 6);
  for (let i = 0; i < hudBoxes.length; i++) {
    for (let j = i + 1; j < hudBoxes.length; j++) {
      const a = hudBoxes[i]!, b = hudBoxes[j]!;
      const overlap = a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
      expect(overlap, `HUD actions overlap: ${i} / ${j}`).toBe(false);
    }
  }

  const hint = page.getByRole("complementary", { name: "Hướng dẫn điều khiển nhanh" });
  await hint.getByRole("button", { name: "Đóng hướng dẫn" }).click();
  await expect(hint).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem("bw.player.onboarding-dismissed.v1"))).toBe("1");

  await page.getByRole("button", { name: "Mở cài đặt" }).click();
  const settings = page.getByRole("dialog", { name: "Cài đặt" });
  await expect(settings).toBeVisible();
  await page.waitForTimeout(50);
  const openingAnimations = await settings.evaluate((element) => element.getAnimations({ subtree: true }).length);
  expect(openingAnimations, "Settings panel should animate when opened").toBeGreaterThan(0);
  const settingsTabs = [
    { label: "Đồ họa", file: "02-settings-graphics.png" },
    { label: "Âm thanh", file: "03-settings-audio.png" },
    { label: "Camera", file: "04-settings-camera.png" },
    { label: "Điều khiển", file: "05-settings-controls.png" },
  ];
  for (const tab of settingsTabs) {
    await settings.getByRole("button", { name: new RegExp(tab.label) }).click();
    await expect(settings.getByRole("button", { name: new RegExp(tab.label) })).toHaveAttribute("aria-pressed", "true");
    await expect(settings.locator(".bw-settings-content")).toBeVisible();
    const modalAudit = await settings.evaluate((element) => ({
      width: element.getBoundingClientRect().width,
      height: element.getBoundingClientRect().height,
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight,
    }));
    expect(modalAudit.scrollWidth, JSON.stringify(modalAudit)).toBeLessThanOrEqual(modalAudit.clientWidth + 1);
    await page.screenshot({ path: testInfo.outputPath(tab.file), fullPage: true });
    screenshots.push(tab.file);
  }
  await settings.getByRole("button", { name: "Hoàn tất" }).click();
  await expect(settings).toBeHidden();

  await page.getByRole("button", { name: "Mở hành trình" }).click();
  const journal = page.getByRole("dialog", { name: "Hành trình của bạn" });
  await expect(journal).toBeVisible();
  await expect(journal.getByText("Thỉnh chuông buổi sớm")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("06-journal-quests.png"), fullPage: true });
  screenshots.push("06-journal-quests.png");
  await journal.getByRole("button", { name: /Vật phẩm/ }).click();
  await expect(journal.getByRole("searchbox", { name: "Tìm vật phẩm" })).toBeVisible();
  await journal.getByText("Nén hương trầm").waitFor();
  await page.screenshot({ path: testInfo.outputPath("07-journal-inventory.png"), fullPage: true });
  screenshots.push("07-journal-inventory.png");
  await journal.getByRole("button", { name: "Đóng sổ hành trình" }).click();
  await expect(journal).toBeHidden();

  const touchControls = page.locator(".touch");
  if (await touchControls.isVisible().catch(() => false)) {
    const controls = await assertInsideViewport(page, ".touch .joy, .touch .tbtn", 8);
    expect(controls.length).toBeGreaterThanOrEqual(3);
    const safeArea = await page.locator(".touch").evaluate((element) => {
      const r = element.getBoundingClientRect();
      return { bottomGap: window.innerHeight - r.bottom, left: r.left, rightGap: window.innerWidth - r.right };
    });
    expect(safeArea.bottomGap, JSON.stringify(safeArea)).toBeGreaterThanOrEqual(8);
    audit.touchControls = { status: "visible-and-inside-viewport", controls, safeArea };
  } else if (testInfo.project.name === "mobile" || testInfo.project.name === "tablet") {
    throw new Error("Touch controls are not visible in a touch-enabled viewport.");
  } else {
    audit.touchControls = { status: "not-applicable-on-desktop" };
  }

  await assertNoHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath("08-gameplay-after-panels.png"), fullPage: true });
  screenshots.push("08-gameplay-after-panels.png");
  audit.pageSize = pageSize;
  audit.pageErrors = pageErrors;
  audit.consoleErrors = consoleErrors;
  await testInfo.attach("responsive-layout-audit.json", {
    body: Buffer.from(JSON.stringify(audit, null, 2)),
    contentType: "application/json",
  });
  expect(pageErrors, pageErrors.join("\n")).toEqual([]);
  expect(consoleErrors, consoleErrors.join("\n")).toEqual([]);
});
