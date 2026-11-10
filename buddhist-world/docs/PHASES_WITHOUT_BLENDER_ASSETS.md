# Runtime phases that can progress before Blender assets

Updated: 2026-11-10

This work intentionally advances systems that do not require artist-authored `.blend` files. It does not claim that the temple's final visual quality has been accepted.

## Implemented in this source-only pass

### Phase 2 — atmosphere baseline
- Reduced Drei Sky turbidity from 8 to 4.2, increased Rayleigh scattering from 2 to 2.4 and reduced Mie haze from 0.005 to 0.003.
- This is a controlled source-level adjustment motivated by the supplied Dawn/Day/Sunset Playwright captures, where the atmospheric sky appeared almost white.
- The change must be confirmed by the next browser visual QA run. Do not treat this as final color grading; sky and exposure must be tuned again against the complete authored terrain and PBR materials.

### Phase 4 — wind and wet-surface response
- Added `WindSway`, a deterministic, low-amplitude transform-based foliage motion component. It uses the authoritative weather snapshot and distinct phase offsets to avoid synchronized vegetation motion.
- Connected wind sway to visual-only region assets whose IDs identify vegetation/tree/bodhi/bamboo/shrub/foliage. Collision-enabled assets are deliberately excluded.
- Added `WeatherReactiveMaterial`, a reusable physical material that responds to rain intensity by lowering roughness and increasing clearcoat.
- Connected the wet material to the existing waterfall blockout wet rocks and mossy rock. The material returns to its dry baseline outside rain.
- Added unit tests for deterministic wind, zero-intensity behavior, rain gust scaling, stiffness clamping, dry material response, wet response and intensity clamping.

## Still not complete / requires further work

- Wind currently moves each eligible visual asset group as a whole. It is not vertex-level branch/leaf deformation; shader-based vertex wind can be added once final vegetation pivot/origin conventions are known.
- Wetness is currently a rain-driven material response. There is no puddle mask/accumulation, vertex painting, decals, terrain slope/flow simulation or rain splash interaction yet.
- The waterfall blockout uses the reactive material for its existing wet rocks; final authored rocks and cliff materials need material-slot mapping after GLB import.
- Sky tuning is not accepted until new Playwright captures are reviewed.
- The gate's visible triangular light/shadow artifact in earlier captures has not been attributed to a specific object/light. No fixture coordinate was guessed or changed.
- Phase 3 still needs Blender runtime execution, PBR graph/UV review, AO glTF channel inspection and GLB export validation.
- Phase 5 fixture placement still needs the complete authored temple and a controlled lighting render.
- Phase 6 DOF and volumetric lighting remain gated on focus-target design and measured post-processing cost.
- Phase 7 still needs target-device GPU/frame-time/memory profiling and the opt-in 30-minute multiplayer soak.

## Safety and validation notes

- Changes are isolated to `feature/phase1-foundation-hardening`.
- No generated asset, database migration, production deployment, merge or modification to `main` was performed.
- Automated unit tests and CI must pass before considering these source changes integrated.
- A passing CI run is not a substitute for Blender render acceptance or physical-device performance measurements.
