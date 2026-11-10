# Cinematic Lighting Acceptance Plan

This checklist is a manual runtime gate. Passing source tests or CI does not mean the scene has passed visual or device acceptance.

## Visual matrix

- [ ] Dawn: inspect warm key light, cool ambient fill, fog color and sky horizon.
- [ ] Day: inspect sun direction, contact shadows, roof/material highlight clipping and exposure.
- [ ] Sunset: inspect warm directional light, atmospheric depth and color separation.
- [ ] Night: inspect silhouette readability, temple focal lighting, lantern pools and dark-value detail.
- [ ] Cloudy/rain/fog: verify the current lighting/fog response; precipitation particles and wet-surface response are not part of the current implementation.
- [ ] Inspect the gate, courtyard, main hall and lotus pond from gameplay, cinematic and photo camera modes.
- [ ] Check shadow acne, peter-panning, cascaded coverage limits, z-fighting, bloom halos, vignette strength and tone-mapping consistency.
- [ ] Compare the Blender preview render with the R3F runtime; Blender area lights/lightmaps are not automatically exported as active WebGL lights.

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

- CI: typecheck, unit tests, integration tests, Blender script syntax and production builds.
- Browser: capture identical camera positions at dawn/day/sunset/night for visual comparison.
- Device: run a minimum 5-minute steady-state sample per tier after a 30-second warm-up.
- Stress: repeat with the expected active NPCs, water reflection and vegetation LOD; record memory after scene entry and region switch.
- Multiplayer: confirm all clients receive the same server environment snapshot while local rendering remains quality-specific.

## Known limitations

- No GPU timer-query instrumentation or browser screenshot regression is currently configured.
- Depth of field and volumetric lighting are intentionally deferred.
- Weather currently adjusts lighting and fog only; no rain particle, wind, puddle or wetness simulation is claimed.
- Blender authoring scripts still require execution against the user's actual Blender project file and inspection of exported GLB assets.
