import { describe, expect, it } from "vitest";
import {
  assetRegistrySchema,
  validateAssetRegistry,
  type AssetRegistryDocument,
} from "@bw/shared";

const validRegistry: AssetRegistryDocument = {
  schemaVersion: 1,
  registryVersion: 1,
  updatedAt: "2026-11-12T10:00:00+07:00",
  assets: [{
    id: "hero-temple-gate",
    version: 1,
    category: "architecture",
    tier: "HERO",
    status: "TECHNICALLY_VALIDATED",
    sourceBlend: "blender/projects/temple_gate.blend",
    variants: [
      { id: "lod0", kind: "visual", uri: "/assets/models/temple_gate_lod0.glb", distance: 18, sha256: "a".repeat(64), triangleCount: 18000 },
      { id: "lod1", kind: "visual", uri: "/assets/models/temple_gate_lod1.glb", distance: 45, sha256: "b".repeat(64), triangleCount: 9000 },
      { id: "collision", kind: "collision", uri: "/assets/collision/temple_gate.glb", sha256: "c".repeat(64), triangleCount: 1200 },
    ],
    dependencies: [],
    bounds: { min: [-5, 0, -3], max: [5, 12, 3] },
    budget: { maxTriangles: 25000, maxTextureBytes: 16_000_000, maxTextureDimension: 2048 },
    tags: ["temple", "gate"],
    updatedAt: "2026-11-12T10:00:00+07:00",
  }],
};

describe("asset registry contract", () => {
  it("accepts a versioned asset with visual LODs and a separate collision variant", () => {
    expect(assetRegistrySchema.safeParse(validRegistry).success).toBe(true);
  });

  it("rejects duplicate asset ids", () => {
    const input = { ...validRegistry, assets: [...validRegistry.assets, validRegistry.assets[0]!] };
    expect(validateAssetRegistry(input).success).toBe(false);
  });

  it("rejects dependencies that do not resolve to a registered asset", () => {
    const input = {
      ...validRegistry,
      assets: [{ ...validRegistry.assets[0]!, dependencies: ["missing-asset"] }],
    };
    expect(validateAssetRegistry(input).success).toBe(false);
  });

  it("requires a distance for visual LOD variants", () => {
    const asset = validRegistry.assets[0]!;
    const input = {
      ...validRegistry,
      assets: [{
        ...asset,
        variants: asset.variants.map((variant) => variant.id === "lod1" ? { ...variant, distance: undefined } : variant),
      }],
    };
    expect(validateAssetRegistry(input).success).toBe(false);
  });

  it("rejects non-positive and non-increasing LOD distances", () => {
    const asset = validRegistry.assets[0]!;
    const zeroDistance = {
      ...validRegistry,
      assets: [{ ...asset, variants: asset.variants.map((variant) => variant.id === "lod0" ? { ...variant, distance: 0 } : variant) }],
    };
    const unordered = {
      ...validRegistry,
      assets: [{ ...asset, variants: asset.variants.map((variant) => variant.id === "lod1" ? { ...variant, distance: 10 } : variant) }],
    };
    expect(validateAssetRegistry(zeroDistance).success).toBe(false);
    expect(validateAssetRegistry(unordered).success).toBe(false);
  });

  it("rejects variant identity/kind mismatches", () => {
    const asset = validRegistry.assets[0]!;
    const input = {
      ...validRegistry,
      assets: [{ ...asset, variants: asset.variants.map((variant) => variant.id === "collision" ? { ...variant, kind: "visual" as const } : variant) }],
    };
    expect(validateAssetRegistry(input).success).toBe(false);
  });

  it("rejects invalid SHA-256 and inverted bounds", () => {
    const asset = validRegistry.assets[0]!;
    const input = {
      ...validRegistry,
      assets: [{
        ...asset,
        variants: asset.variants.map((variant) => variant.id === "lod0" ? { ...variant, sha256: "not-a-hash" } : variant),
        bounds: { min: [2, 0, 0], max: [1, 1, 1] },
      }],
    };
    expect(validateAssetRegistry(input).success).toBe(false);
  });
});
