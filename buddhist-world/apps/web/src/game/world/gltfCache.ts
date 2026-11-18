import { useEffect } from "react";
import { useGLTF } from "@react-three/drei";
import { GLTFCacheLeaseManager } from "./gltfCacheLeaseManager";
export const gltfCacheLeases = new GLTFCacheLeaseManager();

/** Route all runtime GLB consumers through one shared cache ownership registry. */
export function useGLTFWithLease(src: string) {
  const gltf = useGLTF(src);
  useEffect(() => gltfCacheLeases.retain(src, () => useGLTF.clear(src)), [src]);
  return gltf;
}
