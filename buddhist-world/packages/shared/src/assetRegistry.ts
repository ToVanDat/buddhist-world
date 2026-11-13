import { z } from "zod";
import { vec3 } from "./schemas.js";

/**
 * Asset registry is the identity/provenance layer. Region manifests should only
 * decide where an accepted asset is placed; they must not duplicate its build
 * metadata or acceptance state.
 */
export const assetVariantKind = z.enum(["visual", "collision", "navmesh", "impostor"]);
export const assetAcceptanceState = z.enum([
  "DRAFT",
  "PROCEDURAL_BASE",
  "TECHNICALLY_VALIDATED",
  "VISUALLY_ACCEPTED",
  "RUNTIME_ACCEPTED",
]);

export const assetVariantSchema = z.object({
  id: z.string().regex(/^(lod[0-3]|collision|navmesh|impostor|main)$/),
  kind: assetVariantKind,
  uri: z.string().min(1).max(512).startsWith("/"),
  sha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  byteSize: z.number().int().positive().optional(),
  triangleCount: z.number().int().nonnegative().optional(),
  textureBytes: z.number().int().nonnegative().optional(),
  maxTextureDimension: z.number().int().positive().optional(),
  distance: z.number().positive().optional(),
  hysteresis: z.number().min(0).max(1).optional(),
}).strict();

export const assetBudgetSchema = z.object({
  maxTriangles: z.number().int().positive(),
  maxTextureBytes: z.number().int().positive(),
  maxTextureDimension: z.number().int().positive(),
  maxDrawCalls: z.number().int().positive().optional(),
}).strict();

export const assetRecordSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9._-]{2,95}$/),
  version: z.number().int().positive(),
  category: z.enum(["architecture", "vegetation", "prop", "character", "water", "vfx", "terrain"]),
  tier: z.enum(["HERO", "ENVIRONMENT", "PROP", "VEGETATION", "CHARACTER", "EFFECT"]),
  status: assetAcceptanceState,
  sourceBlend: z.string().min(1).max(512).optional(),
  variants: z.array(assetVariantSchema).min(1),
  dependencies: z.array(z.string().regex(/^[a-z0-9][a-z0-9._-]{2,95}$/)).default([]),
  bounds: z.object({ min: vec3, max: vec3 }).strict().optional(),
  budget: assetBudgetSchema.optional(),
  tags: z.array(z.string().min(1).max(48)).max(32).default([]),
  updatedAt: z.string().datetime({ offset: true }),
}).strict().superRefine((asset, ctx) => {
  const variantIds = new Set<string>();
  let previousLodDistance = 0;
  for (const [index, variant] of asset.variants.entries()) {
    if (variantIds.has(variant.id)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["variants", index, "id"], message: "Duplicate variant id" });
    }
    variantIds.add(variant.id);
    if (variant.id.startsWith("lod")) {
      if (variant.kind !== "visual") {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["variants", index, "kind"], message: "LOD variants must be visual" });
      }
      if (variant.distance === undefined) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["variants", index, "distance"], message: "LOD variants require a positive camera distance" });
      } else if (variant.distance <= previousLodDistance) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["variants", index, "distance"], message: "LOD distances must be positive and strictly increasing in registry order" });
      }
      if (variant.distance !== undefined) previousLodDistance = variant.distance;
    }
    const expectedKind = variant.id === "collision" ? "collision"
      : variant.id === "navmesh" ? "navmesh"
      : variant.id === "impostor" ? "impostor"
      : variant.id === "main" || variant.id.startsWith("lod") ? "visual"
      : null;
    if (expectedKind && variant.kind !== expectedKind) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["variants", index, "kind"], message: `Variant "${variant.id}" must use kind "${expectedKind}"` });
    }
  }
  if (new Set(asset.dependencies).size !== asset.dependencies.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["dependencies"], message: "Dependencies must be unique" });
  }
  if (asset.bounds) {
    for (let axis = 0; axis < 3; axis += 1) {
      if (asset.bounds.min[axis]! >= asset.bounds.max[axis]!) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["bounds"], message: "Bounds min must be lower than max" });
        break;
      }
    }
  }
});

export const assetRegistrySchema = z.object({
  schemaVersion: z.literal(1),
  registryVersion: z.number().int().positive(),
  updatedAt: z.string().datetime({ offset: true }),
  assets: z.array(assetRecordSchema),
}).strict().superRefine((registry, ctx) => {
  const ids = new Set<string>();
  registry.assets.forEach((asset, index) => {
    if (ids.has(asset.id)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["assets", index, "id"], message: "Duplicate asset id" });
    }
    ids.add(asset.id);
  });
  registry.assets.forEach((asset, index) => {
    asset.dependencies.forEach((dependency) => {
      if (!ids.has(dependency)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["assets", index, "dependencies"], message: `Unknown dependency: ${dependency}` });
      }
    });
  });
});

export type AssetVariant = z.infer<typeof assetVariantSchema>;
export type AssetRecord = z.infer<typeof assetRecordSchema>;
export type AssetRegistryDocument = z.infer<typeof assetRegistrySchema>;

/** Deliberately empty until real GLBs have been generated and reviewed. */
export const ASSET_REGISTRY: AssetRegistryDocument = {
  schemaVersion: 1,
  registryVersion: 1,
  updatedAt: "2026-11-12T00:00:00+07:00",
  assets: [],
};

export function validateAssetRegistry(input: unknown) {
  return assetRegistrySchema.safeParse(input);
}

export function resolveRegisteredAsset(id: string, registry: AssetRegistryDocument = ASSET_REGISTRY) {
  return registry.assets.find((asset) => asset.id === id);
}
