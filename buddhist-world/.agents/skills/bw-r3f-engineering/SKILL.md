---
name: bw-r3f-engineering
description: Build, debug, and maintain Buddhist World's Three.js and React Three Fiber runtime. Use when working on Canvas, scenes, cameras, GLTF loading, animation, interaction, materials, lighting, rendering lifecycle, or R3F performance.
---

# Buddhist World R3F Engineering

## First: inspect, do not assume

1. Read the root and relevant workspace `package.json`, `pnpm-workspace.yaml`, lockfile, and the target module.
2. Confirm installed versions of React, Three.js, `@react-three/fiber`, `@react-three/drei`, and related packages. The repository has previously declared React 19, Three.js 0.170.x, R3F 9.x, and Drei 10.x; verify the current branch before using APIs.
3. Read existing scene composition, Canvas ownership, render-loop conventions, state stores, asset loaders, and tests. Extend existing abstractions instead of creating parallel engines.
4. Search for an existing component or hook before introducing a new one.

## Engineering rules

- Keep R3F components declarative; use `useFrame` only for per-frame work that truly needs it.
- Do not call React state setters on every frame. Use refs, typed buffers, and imperative object updates for high-frequency animation.
- Keep simulation state, network state, UI state, and render-only state separate.
- Use Drei helpers only when compatible with the installed version and existing architecture.
- Reuse loaders and cache assets deliberately; dispose resources only when ownership is clear.
- Prefer instancing for repeated vegetation, stones, lamps, and other repeated props. Measure draw calls before and after.
- Use LOD and distance/visibility policies for large scenes. Do not add expensive shadows, reflections, or post-processing globally without a quality budget.
- Respect accessibility and reduced-motion behavior for UI-driven motion.
- Avoid hidden global singletons and duplicate Canvas/render loops.

## GLTF runtime integration

- Validate asset paths, naming, scale, orientation, materials, animations, and bounding volumes.
- Handle loading, error, fallback, and disposal states.
- Do not assume Blender-only nodes, modifiers, Geometry Nodes, or custom shaders survive GLB export. Require an explicit runtime equivalent or baked representation.
- Keep asset-specific transforms in metadata/configuration rather than unexplained hard-coded offsets in components.

## Workflow

1. State the relevant existing architecture and files.
2. Propose the smallest change that follows current patterns.
3. Implement only the requested scope.
4. Add or update unit/component tests and a browser visual check where practical.
5. Run the narrowest relevant checks, then workspace typecheck/test/build if the change warrants it.
6. Report files changed, commands run, results, and unverified runtime conditions.

## Acceptance checklist

- No duplicate Canvas or render loop.
- No per-frame React re-render storm.
- Correct asset scale/orientation and loading/error behavior.
- No unowned GPU resource leaks.
- Performance impact is measured or explicitly marked unmeasured.
- Existing scene and multiplayer behavior remain intact.

## Safety

Do not upgrade dependencies, change renderer architecture, delete scenes/assets, or alter network protocols as part of an ordinary feature task. Ask before destructive or broad changes.
