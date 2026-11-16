import { describe, expect, it } from "vitest";
import { createAssetBodySchema } from "./schemas.js";

const validAsset = {
  assetKey: "temple.gate",
  assetType: "environment",
  category: "architecture",
  name: "Temple Gate",
  storageKey: "environment/temple-gate.glb",
};

describe("asset creation contract", () => {
  it("rejects client-supplied validation reports, including passed=true", () => {
    const result = createAssetBodySchema.safeParse({
      ...validAsset,
      validationReport: { passed: true, validator: "client" },
    });

    expect(result.success).toBe(false);
  });

  it("rejects traversal and external URLs as storage keys", () => {
    expect(createAssetBodySchema.safeParse({ ...validAsset, storageKey: "../private.glb" }).success).toBe(false);
    expect(createAssetBodySchema.safeParse({ ...validAsset, storageKey: "https://example.com/asset.glb" }).success).toBe(false);
  });

  it("accepts descriptive metadata without treating it as validation evidence", () => {
    const result = createAssetBodySchema.safeParse({
      ...validAsset,
      metadata: { source: "blender", pipelineVersion: "1" },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.metadata).toEqual({ source: "blender", pipelineVersion: "1" });
      expect("validationReport" in result.data).toBe(false);
    }
  });
});
