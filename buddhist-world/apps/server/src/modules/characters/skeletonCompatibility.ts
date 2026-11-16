/**
 * A wearable that declares a skeleton requirement must not be equipped when
 * the selected base model has no matching skeleton metadata.
 */
export function isSkeletonProfileCompatible(
  itemSkeletonProfile: string | null,
  modelSkeletonProfile: string | null,
): boolean {
  if (!itemSkeletonProfile) return true;
  return Boolean(modelSkeletonProfile) && itemSkeletonProfile === modelSkeletonProfile;
}
