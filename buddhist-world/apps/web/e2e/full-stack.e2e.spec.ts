import { expect, test } from "@playwright/test";

test("full stack: frontend, API, PostgreSQL, Redis and Socket.IO are reachable", async ({ page, request }) => {
  const readiness = await request.get("http://127.0.0.1:3001/api/health/ready");
  expect(readiness.status()).toBe(200);
  await expect(readiness).toBeOK();
  const health = await readiness.json() as {
    status: string;
    checks: { postgres: boolean; redis: boolean; migrations: boolean };
  };
  expect(health).toEqual({
    status: "ready",
    checks: { postgres: true, redis: true, migrations: true },
  });

  const socketHandshake = await request.get(
    "http://127.0.0.1:3001/socket.io/?EIO=4&transport=polling",
  );
  expect(socketHandshake.status()).toBe(200);
  expect(await socketHandshake.text()).toMatch(/^0\{"sid":/);

  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await expect(page.locator("#root")).toBeVisible();
  await expect.poll(
    () => page.locator("#root").evaluate((root) => root.childElementCount),
    { message: "React app should mount into #root" },
  ).toBeGreaterThan(0);
  expect(pageErrors).toEqual([]);
});
