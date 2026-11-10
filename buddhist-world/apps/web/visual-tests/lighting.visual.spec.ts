import { expect, test } from "@playwright/test";

const presets = ["dawn", "day", "sunset", "night"] as const;
const pageErrors: string[] = [];

test.beforeEach(async ({ page }) => {
  pageErrors.length = 0;
  page.on("pageerror", (error) => pageErrors.push(error.message));
});

for (const preset of presets) {
  test(`renders ${preset} lighting preset without runtime errors`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/visual-qa.html?preset=${preset}&quality=HIGH&weather=clear`);
    await expect(page.locator("canvas")).toBeVisible();
    await expect(page.getByTestId("qa-preset")).toHaveText(`Preset: ${preset}`);
    await page.waitForFunction(() => document.documentElement.dataset.visualQaReady === "true");
    await page.waitForTimeout(900);
    await page.screenshot({ path: `test-results/visual-qa/${preset}-desktop.png`, fullPage: true });
    expect(pageErrors, pageErrors.join("\\n")).toEqual([]);
  });
}

test("renders mobile rain scene at MOBILE quality", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/visual-qa.html?preset=night&quality=MOBILE&weather=rain");
  await expect(page.locator("canvas")).toBeVisible();
  await expect(page.getByTestId("qa-quality")).toHaveText("Quality: MOBILE");
  await expect(page.getByTestId("qa-weather")).toContainText("rain");
  await page.waitForFunction(() => document.documentElement.dataset.visualQaReady === "true");
  await page.waitForTimeout(900);
  await page.screenshot({ path: "test-results/visual-qa/night-rain-mobile.png", fullPage: true });
  expect(pageErrors, pageErrors.join("\\n")).toEqual([]);
});

for (const quality of ["ULTRA", "HIGH", "MEDIUM", "LOW", "MOBILE"] as const) {
  test(`mounts ${quality} quality profile`, async ({ page }) => {
    await page.goto(`/visual-qa.html?preset=day&quality=${quality}&weather=clear`);
    await expect(page.locator("canvas")).toBeVisible();
    await expect(page.getByTestId("qa-quality")).toHaveText(`Quality: ${quality}`);
    await page.waitForFunction(() => document.documentElement.dataset.visualQaReady === "true");
    expect(pageErrors, pageErrors.join("\\n")).toEqual([]);
  });
}
