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
    if (message.type() !== "error") return;
    // This suite intentionally aborts Socket.IO because realtime is covered by
    // full-stack E2E; do not misreport that deliberate network abort as a UI error.
    if (message.text().includes("/socket.io/") && message.text().includes("ERR_FAILED")) return;
    consoleErrors.push(message.text());
  });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.addInitScript(() => {
    localStorage.removeItem("bw.player.onboarding-dismissed.v1");
    localStorage.removeItem("bw.player.settings.v1");
    localStorage.removeItem("bw.player.camera-mode.v1");
    localStorage.removeItem("bw.prayer.progress.v1:visual-player");
  });
  await mockApi(page);
  await page.goto("/");
  await expect(page.getByRole("main", { name: "Main menu" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Một chốn an yên/ })).toBeVisible();
  await assertNoHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath("00-main-menu.png"), fullPage: true });
  await page.getByRole("button", { name: /TIẾP TỤC HÀNH TRÌNH/ }).click();
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

  const hudButtons = page.locator(".bw-hud-actions > button:not(.bw-dev-action):visible");
  await expect(hudButtons).toHaveCount(page.viewportSize()!.width < 768 ? 5 : 6);
  const hudBoxes = await assertInsideViewport(page, ".bw-hud-actions > button:not(.bw-dev-action):visible", 6);
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
  await page.waitForTimeout(40);
  // Framer Motion updates transforms on requestAnimationFrame; it does not
  // necessarily create Web Animations API Animation objects.
  const journalAnimated = await journal.evaluate(async (element) => {
    const style = () => {
      const current = getComputedStyle(element);
      return current.transform + "|" + current.opacity;
    };
    const before = style();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    return before !== style();
  });
  expect(journalAnimated, "Journal panel should animate when opened").toBe(true);
  const journalBounds = await journal.boundingBox();
  expect(journalBounds).not.toBeNull();
  expect(journalBounds!.x).toBeGreaterThanOrEqual(0);
  expect(journalBounds!.x + journalBounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
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
    expect(safeArea.bottomGap, JSON.stringify(safeArea)).toBeGreaterThanOrEqual(4);
    audit.touchControls = { status: "visible-and-inside-viewport", controls, safeArea };
  } else if (testInfo.project.name === "mobile" || testInfo.project.name === "tablet") {
    throw new Error("Touch controls are not visible in a touch-enabled viewport.");
  } else {
    audit.touchControls = { status: "not-applicable-on-desktop" };
  }

  await assertNoHorizontalOverflow(page);

  await page.getByRole("button", { name: "Mở menu chính" }).click();
  await expect(page.getByRole("main", { name: "Main menu" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("09-main-menu-return.png"), fullPage: true });
  await page.getByRole("button", { name: /Bản đồ khuôn viên/ }).click();
  const map = page.getByRole("dialog", { name: "Bản đồ khuôn viên" });
  await expect(map).toBeVisible();
  await expect(map.locator(".bw-map-pin")).toHaveCount(4);
  await map.getByRole("button", { name: "Chọn Hồ sen" }).click();
  await expect(map.getByRole("heading", { name: "Hồ sen" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("10-world-map.png"), fullPage: true });
  await map.getByRole("button", { name: "Đóng bản đồ" }).first().click();

  await page.getByRole("button", { name: /Thiền định/ }).click();
  const meditation = page.getByRole("dialog", { name: "Trở về với hơi thở" });
  await expect(meditation).toBeVisible();
  await meditation.getByRole("button", { name: "1 phút" }).click();
  await meditation.getByRole("button", { name: "BẮT ĐẦU" }).click();
  await expect(meditation.getByRole("timer")).toHaveAttribute("aria-label", "Thời gian còn lại 01:00");
  await meditation.getByRole("button", { name: "TẠM DỪNG" }).click();
  await meditation.getByRole("button", { name: "ĐẶT LẠI" }).click();
  const savedMeditation = await page.evaluate(() => JSON.parse(localStorage.getItem("bw.meditation.local.v1") ?? "null"));
  expect(savedMeditation).toMatchObject({ version: 1, minutes: 1, remainingMs: 60_000, endAt: null, completed: false });
  await page.screenshot({ path: testInfo.outputPath("11-meditation.png"), fullPage: true });
  await meditation.getByRole("button", { name: "Đóng thiền định" }).click();
  await page.getByRole("button", { name: /Thiền định/ }).click();
  const restoredMeditation = page.getByRole("dialog", { name: "Trở về với hơi thở" });
  await expect(restoredMeditation.getByRole("timer")).toHaveAttribute("aria-label", "Thời gian còn lại 01:00");
  await expect(restoredMeditation.getByRole("button", { name: "1 phút" })).toHaveAttribute("aria-pressed", "true");
  await restoredMeditation.getByRole("button", { name: "Đóng thiền định" }).click();
  await page.getByRole("button", { name: /TIẾP TỤC HÀNH TRÌNH/ }).click();
  await expect(page.locator(".bw-hud-top")).toBeVisible();

  await page.getByRole("button", { name: "Mở niệm Phật" }).click();
  const prayer = page.getByRole("dialog", { name: "Niệm Phật" });
  await expect(prayer).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("12-prayer-panel.png"), fullPage: true });
  screenshots.push("12-prayer-panel.png");
  await expect(prayer.getByRole("status")).toContainText("Chưa cấu hình bản ghi âm");
  await prayer.getByRole("button", { name: /NAM MÔ A DI ĐÀ PHẬT/ }).click();
  await expect(prayer.locator('strong[aria-live="polite"]')).toHaveText("1");
  const savedPrayer = await page.evaluate(() => JSON.parse(localStorage.getItem("bw.prayer.progress.v1:visual-player") ?? "null"));
  expect(savedPrayer).toMatchObject({ version: 1, count: 1, target: 108, sessions: 0 });
  await page.keyboard.press("Escape");
  await expect(prayer).toBeHidden();
  await expect(page.locator(".bw-hud-top")).toBeVisible();
  await expect(page.getByRole("button", { name: "Mở niệm Phật" })).toBeFocused();
  const restoredPrayer = await page.evaluate(() => JSON.parse(localStorage.getItem("bw.prayer.progress.v1:visual-player") ?? "null"));
  expect(restoredPrayer).toMatchObject({ count: 1, target: 108 });

  await page.screenshot({ path: testInfo.outputPath("13-gameplay-after-panels.png"), fullPage: true });
  screenshots.push("13-gameplay-after-panels.png");
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


test("cinematic login and registration layout adapts across game viewports", async ({ page }, testInfo: TestInfo) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockApi(page);
  await page.route("**/api/auth/refresh", (route) => route.fulfill({
    status: 401, contentType: "application/json", body: JSON.stringify({ error: "NO_SESSION" }),
  }));
  await page.route("**/api/auth/login", (route) => route.fulfill({
    status: 401, contentType: "application/json", body: JSON.stringify({ error: "Thông tin đăng nhập không chính xác." }),
  }));

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Chào mừng trở lại" })).toBeVisible();
  await expect(page.locator(".login-world canvas")).toBeVisible({ timeout: 45_000 });
  await expect(page.locator(".auth-panel")).toBeVisible();
  await expect.poll(() => page.locator(".auth-panel").evaluate((element) => {
    const transform = new DOMMatrixReadOnly(getComputedStyle(element).transform);
    return Math.abs(transform.m41);
  })).toBeLessThan(1);

  const viewportCases = [
    { width: 320, height: 820 },
    { width: 375, height: 844 },
    { width: 390, height: 844 },
    { width: 430, height: 900 },
    { width: 768, height: 1024 },
    { width: 820, height: 1024 },
    { width: 1024, height: 900 },
    { width: 1440, height: 900 },
  ];
  const layoutAudit: Array<Record<string, unknown>> = [];
  for (const viewport of viewportCases) {
    await page.setViewportSize(viewport);
    await expect(page.locator(".auth-panel")).toBeVisible();
    const dimensions = await page.evaluate(() => {
      const panel = document.querySelector<HTMLElement>(".auth-panel")!;
      const hero = document.querySelector<HTMLElement>(".menu-copy")!;
      const p = panel.getBoundingClientRect();
      const h = hero.getBoundingClientRect();
      return {
        viewport: window.innerWidth,
        document: document.documentElement.scrollWidth,
        panel: { left: p.left, right: p.right, width: p.width },
        hero: { left: h.left, right: h.right, width: h.width },
        horizontalOverlap: h.left < p.right && h.right > p.left && h.top < p.bottom && h.bottom > p.top,
      };
    });
    expect(dimensions.document, JSON.stringify(dimensions)).toBeLessThanOrEqual(viewport.width + 1);
    expect(dimensions.panel.left, JSON.stringify(dimensions)).toBeGreaterThanOrEqual(0);
    expect(dimensions.panel.right, JSON.stringify(dimensions)).toBeLessThanOrEqual(viewport.width + 1);
    if (viewport.width > 820) {
      expect(dimensions.horizontalOverlap, JSON.stringify(dimensions)).toBe(false);
    }
    layoutAudit.push({ ...dimensions, height: viewport.height });
    if ([320, 390, 768, 1440].includes(viewport.width)) {
      await page.screenshot({ path: testInfo.outputPath(`auth-${viewport.width}.png`), fullPage: true });
    }
  }

  await page.locator('input[name="email"]').fill("player@example.com");
  await page.locator('input[name="password"]').fill("incorrect-password");
  await page.getByRole("button", { name: /BƯỚC VÀO THẾ GIỚI/ }).click();
  await expect(page.getByRole("alert")).toContainText("Thông tin đăng nhập không chính xác.");

  await page.getByRole("button", { name: "Đăng ký" }).click();
  await expect(page.getByRole("heading", { name: "Tạo hành trình mới" })).toBeVisible();
  await expect(page.locator('input[name="username"]')).toBeVisible();
  await expect(page.locator('input[name="password"]')).toHaveAttribute("autocomplete", "new-password");
  await testInfo.attach("auth-responsive-layout.json", {
    body: Buffer.from(JSON.stringify(layoutAudit, null, 2)),
    contentType: "application/json",
  });
});
