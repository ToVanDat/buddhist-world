import { useGLTF } from "@react-three/drei";
import { GLTFCacheLeaseManager } from "./gltfCacheLeaseManager";
export const gltfCacheLeases = new GLTFCacheLeaseManager();

/** The owning RegionAssetBoundary acquires the lease before its Suspense child starts loading. */
export function useGLTFWithLease(src: string) {
  return useGLTF(src);
}
