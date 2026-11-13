# Buddhist World — Procedural Blockout Upgrade (BU-01–BU-04)

- Branch: `feature/phase1-foundation-hardening`
- Date: 2026-11-13
- Scope: asset-independent visual upgrade; no Blender/GLB files required
- Status: source implementation committed; CI/runtime/browser visual acceptance pending

## Non-negotiable world anchors

| Element | Position |
|---|---|
| Tam Quan | `(0, 0, 20)` |
| Courtyard | `(0, 0, 0)` |
| Main Hall | `(0, 0, -22)` |
| Lotus Pond | `(-18, 0, 4)` |

The playable ground collider remains flat and covers the existing 250 × 250 region. This intentionally avoids introducing visual terrain height changes that do not yet have matching Rapier collision or a validated navmesh.

## Implemented source changes

### BU-01 — Geometry

- Replaced the two-box Tam Quan roof silhouette with procedural curved roof surfaces, upturned eaves, layered roof masses, ridge caps, beam bands and articulated columns.
- Rebuilt the Main Hall blockout with a raised plinth, split facade and real walk-through entrance opening, matching doorway collision, front/side column rhythm, layered curved roofs and entrance steps.
- Added deterministic geometry builders in `TempleProceduralGeometry.ts` for curved roof surfaces and irregular distant mountain masses.
- Retained approximate fixed colliders for the existing building footprint and pillar positions; no new navmesh is claimed.

### BU-02 — Material

- Added deterministic procedural DataTexture noise for wood, roof, stone, ground and foliage.
- Applied roughness/bump response to procedural surfaces.
- Extended `WeatherReactiveMaterial` additively so it can accept map, roughnessMap, bumpMap and bumpScale while preserving its existing rain-driven roughness/clearcoat behavior.
- Ground remains weather-reactive. No external texture files or fabricated 8K maps were added.

### BU-03 — Environment

- Added procedural banyan-like tree masses, trunk/branch forms and shared `WindSway` response.
- Added deterministic grass patch geometry, grouped into a small number of meshes for browser rendering.
- Added irregular low-poly rock masses with moss growth patches.
- Added deterministic distant mountain meshes to create layered silhouettes.
- Retained the existing lotus water and waterfall effects.
- Vegetation is intentionally kept outside the primary courtyard/path and spawn anchors.
- Decorative grass and moss are visual-only; they do not add physics colliders.

### BU-04 — Presentation

- Reuses the existing `LightingManager`, sky, scene fog, shadow quality profiles, weather response and cinematic post-processing.
- Procedural geometry casts/receives shadows where appropriate.
- Does not add a second lighting manager, duplicate global fog, or unbudgeted volumetric effect.

## New automated geometry coverage

`TempleProceduralGeometry.test.ts` covers:
- curved roof vertex finiteness and upward-facing center normal;
- invalid roof dimension sanitization;
- deterministic mountain geometry and height bounds;
- repeatable procedural noise texture generation;
- deterministic grass blade generation and patch bounds.

These tests are authored. They must not be reported as passing until the CI run or local Vitest command completes successfully.

## Acceptance still required

1. `pnpm typecheck`
2. `pnpm test`
3. `pnpm build`
4. Playwright visual QA on desktop and mobile.
5. Verify player spawn, walking, jump, camera obstruction and collision around gate, hall, pond and tree clusters.
6. Review silhouette, texture tiling, roof normals, shadow acne, grass overdraw, mountain horizon and foliage sway in actual browser screenshots.
7. Measure draw calls, frame-time percentiles and memory under LOW/MOBILE, MEDIUM, HIGH and ULTRA profiles.

## Explicit limitations

- This is a substantial procedural blockout upgrade, not final AAA art and not a substitute for authored Blender hero assets.
- No production Buddha statue, detailed roof tile mesh, carved wood ornaments, authored UV atlas, physically sculpted bark, high-resolution texture set or final terrain sculpt has been created.
- Terrain collision and navmesh have not been changed. Distant mountains and decorative set dressing are visual-only.
- The existing `REGIONS.temple_complex.assets` manifest remains unchanged; procedural blockout remains the fallback while production GLBs are absent.
- No database, backend protocol, production configuration, deployment or destructive asset operation was changed.
