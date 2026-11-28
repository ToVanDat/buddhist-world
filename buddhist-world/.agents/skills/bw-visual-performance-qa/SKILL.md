---
name: bw-visual-performance-qa
description: Validate Buddhist World's visual quality, browser rendering, asset regressions, GPU/CPU performance, memory, LOD, and automated tests. Use before accepting visual or runtime changes and when diagnosing regressions.
---

# Buddhist World Visual and Performance QA

## First: establish the test surface

Inspect Playwright configuration, browser test scripts, screenshot baselines, visual QA routes, telemetry hooks, performance budgets, CI workflows, and supported target devices. Reuse existing test infrastructure; do not introduce another test framework without justification.

Record the test environment: browser/version, viewport, device scale factor, GPU/driver if available, quality profile, scene/region, and asset revision.

## Visual QA

- Use deterministic camera positions, time, weather, and random seeds for comparable captures.
- Capture agreed views: establishing wide shot, ground-level approach, architecture detail, statue/hero asset, vegetation, water, and night/lighting view where applicable.
- Compare against approved reference images and the previous baseline.
- Review silhouette, proportions, composition, material response, texture scale, lighting, shadow artifacts, z-fighting, clipping, missing assets, and animation artifacts.
- Treat pixel-diff thresholds as signals, not substitutes for human visual review.
- Include responsive viewport and reduced-motion checks for UI overlays.

## Performance QA

Measure, do not infer:
- FPS and frame-time percentiles (especially p95/p99 where available).
- CPU and GPU frame time when tooling supports it.
- Draw calls, triangles, visible objects, shader/program count.
- Texture and geometry memory estimates.
- Load/parse time and network payload.
- Shadow, reflection, transparency, and post-processing cost.
- Region transition and multiplayer update costs.

Test representative low, medium, and high quality profiles. Include camera movement and scene transitions, not only a static frame.

## Regression and failure handling

- Run the existing typecheck, unit, integration, browser, GLB, navmesh, and rig validators relevant to the change.
- Preserve screenshots, logs, metrics, browser console output, and failing asset identifiers.
- Separate code failure, missing asset, environment limitation, and visual-art-direction disagreement.
- Do not suppress flaky tests or loosen thresholds merely to obtain a green run.
- A CI pass does not prove GPU hardware performance or asset visual quality.

## Acceptance report

Every QA report should include:
1. Commit and asset revision.
2. Environment and test configuration.
3. Commands and tests executed.
4. Pass/fail/blocked results.
5. Screenshot and telemetry locations.
6. Known gaps and untested conditions.
7. Explicit acceptance recommendation.

## Safety

Do not rewrite baselines, delete test artifacts, change performance budgets, or mark a failed visual test as accepted without explaining the reason and obtaining approval.
