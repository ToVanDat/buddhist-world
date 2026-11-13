export const ASSET_BUDGETS = Object.freeze({
  hero: Object.freeze({ maxTriangles: 250_000, maxTextureDimension: 4096, maxFileBytes: 24 * 1024 * 1024 }),
  architecture: Object.freeze({ maxTriangles: 180_000, maxTextureDimension: 4096, maxFileBytes: 18 * 1024 * 1024 }),
  environment: Object.freeze({ maxTriangles: 120_000, maxTextureDimension: 2048, maxFileBytes: 12 * 1024 * 1024 }),
  vegetation: Object.freeze({ maxTriangles: 45_000, maxTextureDimension: 2048, maxFileBytes: 8 * 1024 * 1024 }),
  character: Object.freeze({ maxTriangles: 100_000, maxTextureDimension: 2048, maxFileBytes: 12 * 1024 * 1024 }),
  prop: Object.freeze({ maxTriangles: 60_000, maxTextureDimension: 2048, maxFileBytes: 8 * 1024 * 1024 }),
});

export function resolveAssetBudget(name) {
  return Object.hasOwn(ASSET_BUDGETS, name) ? ASSET_BUDGETS[name] : undefined;
}

export function evaluateAssetBudget({ budget, triangles, maxTextureDimension, fileBytes }) {
  const issues = [];
  if (triangles > budget.maxTriangles) issues.push(`triangles ${triangles} > ${budget.maxTriangles}`);
  if (maxTextureDimension > budget.maxTextureDimension) issues.push(`texture dimension ${maxTextureDimension} > ${budget.maxTextureDimension}`);
  if (fileBytes > budget.maxFileBytes) issues.push(`file bytes ${fileBytes} > ${budget.maxFileBytes}`);
  return issues;
}
