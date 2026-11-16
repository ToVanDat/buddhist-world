import { z } from "zod";

const assetTypes = [
  "character_model", "character_part", "clothing", "accessory",
  "animation", "cinematic", "vfx", "audio", "environment",
  "npc", "texture", "material", "ui",
] as const;

export const assetKey = z.string().min(2).max(160)
  .regex(/^[a-z0-9][a-z0-9._-]*$/)
  .refine((value) => !value.includes(".."));

const storageKey = z.string().min(2).max(512).refine((value) =>
  !value.startsWith("/") && !value.includes("..") && !value.includes("\\")
  && !/^https?:\/\//i.test(value),
);

export const assetType = z.enum(assetTypes);
const objectSchema = z.record(z.string(), z.unknown());

/**
 * Client metadata is descriptive only. Validation evidence is intentionally
 * excluded: only a server-side validator may attest that an asset is publishable.
 */
export const createAssetBodySchema = z.object({
  assetKey,
  assetType,
  category: z.string().min(1).max(80),
  name: z.string().min(1).max(160),
  description: z.string().max(4000).default(""),
  storageKey,
  contentType: z.string().max(120).optional(),
  sizeBytes: z.number().int().positive().max(5_000_000_000).optional(),
  sha256: z.string().regex(/^[0-9a-fA-F]{64}$/).optional(),
  metadata: objectSchema.default({}),
}).strict();

export const assetStatusBodySchema = z.object({
  status: z.enum(["review", "approved", "rejected", "archived"]),
}).strict();
