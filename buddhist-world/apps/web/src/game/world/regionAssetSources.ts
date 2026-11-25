export interface RegionAssetSourceDefinition {
  src: string;
  lods?: readonly { src: string }[];
}

/** Returns every loader cache key owned by one region asset, without duplicates. */
export function getRegionAssetSources(asset: RegionAssetSourceDefinition): string[] {
  return [...new Set([asset.src, ...(asset.lods ?? []).map((lod) => lod.src)])];
}

/** Detects when a boundary must discard a previous load failure after manifest updates. */
export function haveRegionAssetSourcesChanged(
  previous: RegionAssetSourceDefinition,
  next: RegionAssetSourceDefinition,
): boolean {
  const previousSources = getRegionAssetSources(previous);
  const nextSources = getRegionAssetSources(next);
  return previousSources.length !== nextSources.length ||
    previousSources.some((source, index) => source !== nextSources[index]);
}
