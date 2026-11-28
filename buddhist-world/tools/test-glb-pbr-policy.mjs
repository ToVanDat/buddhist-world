import test from "node:test";
import assert from "node:assert/strict";
import { inspectPbrMaterial } from "./glb-pbr-policy.mjs";

function materialWith(maps = {}) {
  return {
    getBaseColorTexture: () => maps.baseColor ?? null,
    getMetallicRoughnessTexture: () => maps.metallicRoughness ?? null,
    getNormalTexture: () => maps.normal ?? null,
    getOcclusionTexture: () => maps.occlusion ?? null,
  };
}

test("strict PBR requires base color, metallic-roughness, normal and occlusion maps", () => {
  const result = inspectPbrMaterial(materialWith(), true, true);
  assert.equal(result.errors.length, 4);
  assert.equal(result.textureCount, 0);
});

test("textured PBR material requires UV0", () => {
  const result = inspectPbrMaterial(materialWith({
    baseColor: {}, metallicRoughness: {}, normal: {}, occlusion: {},
  }), false, true);
  assert.equal(result.errors.length, 4);
  assert.equal(result.textureCount, 4);
});

test("complete textured PBR material passes strict validation", () => {
  const result = inspectPbrMaterial(materialWith({
    baseColor: {}, metallicRoughness: {}, normal: {}, occlusion: {},
  }), true, true);
  assert.deepEqual(result.errors, []);
});

test("non-strict mode reports missing authored maps as warnings", () => {
  const result = inspectPbrMaterial(materialWith(), true, false);
  assert.equal(result.errors.length, 0);
  assert.equal(result.warnings.length, 5);
});

test("missing material is always an error", () => {
  assert.deepEqual(inspectPbrMaterial(null, false, false), {
    errors: ["material is missing"], warnings: [],
  });
});
