# Blender Advanced Lighting & PBR Pipeline

## Responsibilities

Blender is the authoring and offline preview environment for light rigs, baked lighting, PBR maps and reference renders. R3F/Three.js recreates runtime lights from typed profiles. Do not expect active Blender light objects to survive GLB export as runtime light sources.

## Lighting preview profiles

The Blender preview values live in `scripts/lighting_profiles.py`; runtime environment profiles live in `apps/web/src/game/lighting/LightingProfiles.ts`. Preset IDs must remain aligned:

- `dawn`
- `day`
- `sunset`
- `night`

The two renderers do not share identical units. Blender preview energy values are art-direction starting points and must be tuned against the actual scene. The profile names and lighting intent are the shared contract.

## Windows CMD workflow

Run from the Buddhist World repository root. Start from a scene that already contains the generated temple and cinematic environment:

```cmd
blender -b blender/projects/temple_complex_cinematic.blend --python blender/scripts/generate_lighting_rigs.py -- --preset dawn --out blender/projects/temple_complex_lighting_dawn.blend
blender -b blender/projects/temple_complex_lighting_dawn.blend --python blender/scripts/validate_lighting_scenes.py

blender -b blender/projects/temple_complex_cinematic.blend --python blender/scripts/generate_lighting_rigs.py -- --preset day --out blender/projects/temple_complex_lighting_day.blend
blender -b blender/projects/temple_complex_lighting_day.blend --python blender/scripts/validate_lighting_scenes.py

blender -b blender/projects/temple_complex_cinematic.blend --python blender/scripts/generate_lighting_rigs.py -- --preset sunset --out blender/projects/temple_complex_lighting_sunset.blend
blender -b blender/projects/temple_complex_lighting_sunset.blend --python blender/scripts/validate_lighting_scenes.py

blender -b blender/projects/temple_complex_cinematic.blend --python blender/scripts/generate_lighting_rigs.py -- --preset night --out blender/projects/temple_complex_lighting_night.blend
blender -b blender/projects/temple_complex_lighting_night.blend --python blender/scripts/validate_lighting_scenes.py
```

The preview collection is named `PREVIEW_lighting_rig`; its objects are deliberately outside all `EXPORT_*` collections. The generator updates reserved preview objects in place and refuses incompatible name/type collisions.

## PBR material validation

After generating the PBR library and texture maps:

```cmd
blender -b blender/projects/temple_complex_pbr_textured.blend --python blender/scripts/validate_pbr_materials.py
```

Expected texture roles:

| Map | Blender color space | Runtime role |
|---|---|---|
| Base Color | sRGB | Albedo |
| Roughness | Non-Color | Micro-surface roughness |
| Normal | Non-Color | Tangent-space normal |
| AO | Non-Color | Authoring map; exporter-specific glTF occlusion wiring still requires verification |

The validator checks named materials, image nodes, color spaces and Principled BSDF links. It intentionally warns that the AO image is not yet guaranteed to be exported as the glTF occlusion texture.

## Runtime quality behavior

The browser runtime uses the quality profile in `apps/web/src/game/lighting/LightingProfiles.ts`. LOW disables real-time shadows, fog, reflections and the atmospheric sky dome; MOBILE keeps the existing shadow behavior but disables the sky dome and planar reflections. ULTRA/HIGH/MEDIUM enable the sky dome. Actual GPU cost must be profiled on target devices before changing these defaults.

## Validation boundaries

CI compiles the Python scripts but does not execute Blender. Run the commands above locally, render the four profiles, inspect color/exposure consistency and verify that no preview light appears in exported GLB files. A passing Python syntax check is not proof of a successful Blender render.
