# Cinematic Lighting Acceptance Plan

This checklist is a manual runtime gate. Passing source tests or CI does not mean the scene has passed visual or device acceptance.

## Visual matrix

- [ ] Dawn: inspect warm key light, cool ambient fill, fog color and sky horizon.
- [ ] Day: inspect sun direction, contact shadows, roof/material highlight clipping and exposure.
- [ ] Sunset: inspect warm directional light, atmospheric depth and color separation.
- [ ] Night: inspect silhouette readability, temple focal lighting, lantern pools and dark-value detail.
- [ ] Cloudy/rain/fog: verify lighting/fog response and quality-budgeted rain streaks; wind-driven vegetation and wet-surface response are not part of the current implementation.
- [ ] Inspect the gate, courtyard, main hall and lotus pond from gameplay, cinematic and photo camera modes.
- [ ] Check shadow acne, peter-panning, cascaded coverage limits, z-fighting, bloom halos, vignette strength and tone-mapping consistency.
- [ ] Compare the Blender preview render with the R3F runtime; Blender area lights/lightmaps are not automatically exported as active WebGL lights.

## Local acceptance commands (Windows CMD)

Run from the repository root after confirming the source Blender scene has an active camera:

```cmd
cd buddhist-world

blender -b blender/projects/temple_complex_cinematic.blend --python blender/scripts/generate_lighting_rigs.py -- --preset dawn --out blender/projects/lighting/temple_dawn.blend
blender -b blender/projects/lighting/temple_dawn.blend --python blender/scripts/validate_lighting_scenes.py
blender -b blender/projects/lighting/temple_dawn.blend --python blender/scripts/render_lighting_acceptance.py -- --out artifacts/lighting/dawn.png

blender -b blender/projects/temple_complex_cinematic.blend --python blender/scripts/generate_lighting_rigs.py -- --preset day --out blender/projects/lighting/temple_day.blend
blender -b blender/projects/lighting/temple_day.blend --python blender/scripts/validate_lighting_scenes.py
blender -b blender/projects/lighting/temple_day.blend --python blender/scripts/render_lighting_acceptance.py -- --out artifacts/lighting/day.png

blender -b blender/projects/temple_complex_cinematic.blend --python blender/scripts/generate_lighting_rigs.py -- --preset sunset --out blender/projects/lighting/temple_sunset.blend
blender -b blender/projects/lighting/temple_sunset.blend --python blender/scripts/validate_lighting_scenes.py
blender -b blender/projects/lighting/temple_sunset.blend --python blender/scripts/render_lighting_acceptance.py -- --out artifacts/lighting/sunset.png

blender -b blender/projects/temple_complex_cinematic.blend --python blender/scripts/generate_lighting_rigs.py -- --preset night --out blender/projects/lighting/temple_night.blend
blender -b blender/projects/lighting/temple_night.blend --python blender/scripts/validate_lighting_scenes.py
blender -b blender/projects/lighting/temple_night.blend --python blender/scripts/render_lighting_acceptance.py -- --out artifacts/lighting/night.png

pnpm --filter @bw/web test:visual
```

If the actual source blend path differs, replace only that path. The render script fails when no active camera exists; it does not invent camera framing. Run the PBR validator against the scene saved by the PBR texture-map generator.

## PBR authoring acceptance commands (Windows CMD)

These commands generate the current procedural baseline maps. They are useful for pipeline validation, but 512px procedural maps are not final AAA hero-asset textures; replace them with authored/scanned 2K–4K texture sets and art-directed roughness/normal detail before final asset sign-off.

```cmd
blender -b blender/projects/temple_complex_cinematic.blend --python blender/scripts/generate_pbr_material_library.py -- --out blender/projects/lighting/temple_pbr.blend
blender -b blender/projects/lighting/temple_pbr.blend --python blender/scripts/generate_pbr_texture_maps.py -- --out artifacts/pbr --size 512 --blend-out blender/projects/lighting/temple_pbr_textured.blend
blender -b blender/projects/lighting/temple_pbr_textured.blend --python blender/scripts/validate_pbr_materials.py
```

Check the PNG maps and Blender node graph visually. AO is currently packed as an authoring map; it is not yet confirmed in the exported glTF occlusion channel.

## Quality and performance matrix

| Tier | Target behavior | Runtime gate |
|---|---|---|
| ULTRA | 4096 shadow map, up to 24 local lights, bloom + vignette | Desktop GPU; target 60 FPS and p95 frame time ≤ 16.7 ms |
| HIGH | 2048 shadow map, up to 16 local lights, bloom + vignette | Mid-range desktop; target 60 FPS and p95 ≤ 16.7 ms |
| MEDIUM | 1024 shadow map, up to 8 local lights, no cinematic composer | Target stable 45–60 FPS; investigate p95 > 22 ms |
| LOW | shadows and sky dome disabled, up to 3 local lights | Target stable 30 FPS; p95 ≤ 33.3 ms |
| MOBILE | reduced local lights, no cinematic composer | Test representative iOS Safari and Android Chrome devices; target stable 30 FPS |

Targets are acceptance goals, not measured results. Re-test at the actual target resolution and device; record browser, GPU, OS, viewport, quality tier, scene, warm-up duration, average FPS, p95 frame time, draw calls, triangles, geometries and textures.

## Interaction and accessibility

- [ ] Switch camera modes while idle and moving; verify no camera snap or collision clipping.
- [ ] Verify orbit, zoom and touch controls continue to work in every camera mode.
- [ ] Verify keyboard focus and screen-reader label for the camera selector.
- [ ] Check reduced-motion preferences; do not add camera shake or animated exposure without an explicit opt-in.
- [ ] Check HUD controls on desktop, tablet and mobile widths.

## Automated and manual evidence

- CI: typecheck, unit tests, integration tests, Blender script syntax, production builds and Playwright WebGL smoke/capture tests.
- Browser harness: `pnpm --filter @bw/web test:visual`; captures Dawn/Day/Sunset/Night at desktop size, Night/Rain on a mobile viewport, and mounts all five quality tiers. Screenshots are uploaded as the `buddhist-world-lighting-visual-qa` CI artifact.
- The harness isolates the base lighting stack (no cinematic composer) so visual acceptance can inspect light, sky, fog, shadow and materials before evaluating post-processing. It uses the temple blockout and runtime architectural lights; it is not a substitute for checking final authored GLB assets.
- Blender: run `generate_lighting_rigs.py`, `validate_lighting_scenes.py`, `validate_pbr_materials.py`, then `render_lighting_acceptance.py` for each profile. Inspect the generated PNGs side-by-side with the browser captures.
- Device: run a minimum 5-minute steady-state sample per tier after a 30-second warm-up.
- Stress: repeat with the expected active NPCs, water reflection and vegetation LOD; record memory after scene entry and region switch.
- Multiplayer: confirm all clients receive the same server environment snapshot while local rendering remains quality-specific.

## Known limitations

- Playwright currently produces screenshot evidence and checks WebGL mount/runtime exceptions; it does not compare screenshots to approved pixel-diff baselines or measure real GPU frame time.
- Depth of field and volumetric lighting are intentionally deferred. The existing Bloom/Vignette composer is not included in the visual QA harness; it remains separately quality-gated in the game runtime.
- Weather adjusts lighting/fog and has budgeted client-side rain streaks; wind-driven vegetation, puddles and wet-surface response are not implemented.
- Blender acceptance still requires execution against the user's actual .blend file. No actual render, authored GLB visual inspection, or target-device benchmark is claimed by source CI alone.
