export interface RegionAssetSourceDefinition {
  src: string;
  lods?: readonly { src: string }[];
}

/** Returns every loader cache key owned by one region asset, without duplicates. */
export function getRegionAssetSources(asset: RegionAssetSourceDefinition): string[] {
  return [...new Set([asset.src, ...(asset.lods ?? []).map((lod) => lod.src)])];
}
