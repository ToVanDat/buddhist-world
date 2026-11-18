export const REQUIRED_PBR_TEXTURES = [
  ["base color", "getBaseColorTexture"],
  ["metallic-roughness", "getMetallicRoughnessTexture"],
  ["normal", "getNormalTexture"],
  ["occlusion", "getOcclusionTexture"],
];

export function inspectPbrMaterial(material, hasUv0, strict = false) {
  if (!material) return { errors: ["material is missing"], warnings: [] };
  const errors = [];
  const warnings = [];
  let textureCount = 0;

  for (const [label, getter] of REQUIRED_PBR_TEXTURES) {
    const texture = typeof material[getter] === "function" ? material[getter]() : null;
    if (texture) {
      textureCount += 1;
      if (!hasUv0) errors.push(`${label} texture is present but TEXCOORD_0 is missing`);
    } else if (strict) {
      errors.push(`required ${label} texture is missing`);
    } else {
      warnings.push(`${label} texture is not authored`);
    }
  }

  if (textureCount === 0 && !strict) {
    warnings.push("material uses scalar PBR factors only; texture quality is not verified");
  }
  return { errors, warnings, textureCount };
}
