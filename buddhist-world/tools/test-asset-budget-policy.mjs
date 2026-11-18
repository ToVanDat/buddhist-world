import assert from "node:assert/strict";
import test from "node:test";
import { ASSET_BUDGETS, evaluateAssetBudget, resolveAssetBudget } from "./asset-budget-policy.mjs";

test("all asset classes have finite positive budgets", () => {
  for (const budget of Object.values(ASSET_BUDGETS)) {
    assert.ok(budget.maxTriangles > 0);
    assert.ok(budget.maxTextureDimension > 0);
    assert.ok(budget.maxFileBytes > 0);
  }
});

test("hero budget is more permissive than environment and vegetation", () => {
  assert.ok(ASSET_BUDGETS.hero.maxTriangles > ASSET_BUDGETS.environment.maxTriangles);
  assert.ok(ASSET_BUDGETS.hero.maxTextureDimension > ASSET_BUDGETS.vegetation.maxTextureDimension);
});

test("budget evaluation accepts a compliant asset and reports each exceeded limit", () => {
  const budget = resolveAssetBudget("vegetation");
  assert.ok(budget);
  assert.deepEqual(evaluateAssetBudget({
    budget, triangles: 20_000, maxTextureDimension: 1024, fileBytes: 2_000_000,
  }), []);
  assert.equal(evaluateAssetBudget({
    budget, triangles: 50_000, maxTextureDimension: 4096, fileBytes: 9_000_000,
  }).length, 3);
});

test("unknown asset budget class is rejected", () => {
  assert.equal(resolveAssetBudget("unknown"), undefined);
});
