---
name: bw-shader-vfx-engineering
description: Design, implement, profile, and validate real-time shaders and visual effects in Buddhist World. Use for GLSL, water, wind deformation, weather response, fog, particles, reflections, lighting effects, and post-processing.
---

# Buddhist World Shader and VFX Engineering

## First: inspect existing systems

Read the current shader/material modules, weather and environment systems, VFX components, render pipeline, quality profiles, and tests before implementation. Search for existing effects such as water, waterfall, mist, foam, wind sway, rain, fog, sky, lighting profiles, and post-processing. Extend them; do not create competing systems.

Confirm actual Three.js/R3F versions and shader integration patterns. Check whether effects use ShaderMaterial, onBeforeCompile, node materials, custom hooks, or shared uniforms.

## Design principles

- Separate effect simulation, rendering, configuration, and lifecycle.
- Use shared time/weather uniforms where appropriate; avoid duplicate clocks and per-object timers.
- Use deterministic seeds when reproducible visuals or tests matter.
- Support quality tiers and graceful fallback paths.
- Make effects respond to world/weather state through explicit interfaces, not hidden global coupling.
- Use vertex displacement only when mesh density and vertex masks support the intended deformation.
- Preserve normals/tangents or provide a deliberate lighting strategy after displacement.
- Use physically plausible ranges for roughness, opacity, light intensity, and color; art-direct hero effects with reference images.
- Distinguish GPU shader particles from CPU-managed particle objects. Measure both CPU and GPU costs.
- Avoid excessive transparent overdraw, full-screen passes, dynamic shadows, and reflection passes.
- Respect reduced-motion and low-quality modes where effects are user-facing.

## Effect-specific guidance

- Water: define flow direction, wave scale, normal detail, shoreline/foam behavior, transparency strategy, and reflection budget.
- Wind: use per-vertex masks/weights; bend leaves and flexible branches more than trunks; avoid uniform whole-mesh wobble.
- Rain/snow: use bounded emitters, camera-relative or region-based placement, deterministic density, and distance culling.
- Fog/mist: control depth range and layering; avoid stacking multiple expensive volumetric systems.
- Fire/smoke/incense: separate emitter behavior from material shading; manage particle lifetime and pooling.
- Post-processing: keep passes explicit and budgeted; test color space, tone mapping, and resolution scaling.

## Validation workflow

1. Capture baseline screenshots and performance telemetry.
2. Implement one effect or one controlled change at a time.
3. Test representative high, medium, and low quality profiles.
4. Test camera movement, scene transitions, and weather transitions.
5. Check shader compilation errors and WebGL fallback behavior.
6. Record GPU time, frame time, draw calls, overdraw risks, and memory where available.
7. Compare screenshots against references and existing baseline.

## Safety

Do not replace the global lighting/post-processing pipeline or add a new particle framework without an architecture review. Do not claim an effect is GPU-accelerated unless its implementation and profiling demonstrate that.
