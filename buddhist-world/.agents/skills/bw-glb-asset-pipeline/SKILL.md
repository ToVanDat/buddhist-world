---
name: bw-glb-asset-pipeline
description: Produce, validate, optimize, version, and integrate Blender-to-GLB assets for Buddhist World. Use for Blender export, glTF validation, PBR textures, LODs, collision meshes, navmeshes, asset manifests, or R3F asset acceptance.
---

# Buddhist World GLB Asset Pipeline

## First: inspect the real pipeline

1. Read `tools/validate-glb.mjs`, related validators, Blender scripts, asset manifests, importers, and CI workflows before changing them.
2. Inspect the current Blender version, exporter settings, installed Python packages, pnpm scripts, and lockfile. Never assume a tool is installed because a script references it.
3. Find the project's naming, coordinate, scale, unit, collection, texture, and directory conventions.
4. Check whether the target asset already exists in source, generated output, or another branch.

## Asset contract

For each asset, record:
- Stable asset ID and semantic name.
- Source .blend path and source revision.
- Exported .glb path and export timestamp/revision.
- Units, forward/up axes, origin/pivot, scale, and bounds.
- Mesh/material/texture inventory.
- Animation clips and expected playback behavior.
- LOD levels and transition distances, if applicable.
- Collision/navmesh representation, if applicable.
- Texture dimensions, formats, color spaces, and compression status.
- Validation report and runtime acceptance status.

## Export and validation

- Preserve a reproducible Blender source; do not treat GLB as the only source of truth.
- Apply or document transforms consistently. Do not blindly apply transforms to rigs or animation.
- Convert unsupported procedural results to exportable geometry or bake them intentionally.
- Use glTF-compatible PBR materials and verify texture color spaces.
- Keep collision geometry separate from visual geometry when the runtime needs it.
- Bake or replace Blender-only particles, simulations, compositor effects, and custom nodes with supported runtime implementations.
- Run the repository's existing `pnpm validate:glb` and asset-specific validators. Read their source and reports; do not bypass them with permissive flags.
- Use Khronos glTF Validator or glTF Transform only if installed/configured. Verify CLI/API versions before writing commands.
- Optimize with measured targets: mesh complexity, draw calls, texture memory, compression, and load time. Do not degrade hero assets without visual comparison.
- Never silently overwrite a published asset. Write to a staging/output path, compare, then request approval for replacement.

## Runtime acceptance

An asset is not complete merely because export succeeds. Verify:
1. GLB parses and passes structural validation.
2. Meshes, materials, textures, and animations are present.
3. Bounds, scale, pivot, orientation, and collision are correct.
4. Asset loads in the actual R3F scene.
5. Visual comparison is made from agreed camera views.
6. Performance and memory impact are recorded.

## Workflow

1. Inspect source asset and pipeline.
2. Create an asset brief and acceptance criteria.
3. Work on a copy or isolated Blender scene.
4. Export to a staging path.
5. Run validators and capture reports.
6. Integrate into a test scene before production registry changes.
7. Promote only after explicit acceptance.

## Safety

Do not delete source .blend files, overwrite approved GLBs, alter production manifests, regenerate an entire asset library, or change export conventions without explicit approval.
