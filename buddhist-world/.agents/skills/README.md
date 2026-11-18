# Buddhist World Agent Skills

Project-specific Codex skills for the Buddhist World repository.

## Installed project skills

| Skill | Scope |
|---|---|
| `bw-r3f-engineering` | Three.js / React Three Fiber runtime |
| `bw-glb-asset-pipeline` | Blender → GLB → validation → R3F acceptance |
| `bw-shader-vfx-engineering` | GLSL, water, wind, weather, particles, post-processing |
| `bw-world-simulation` | Rapier, characters, NPCs, navigation, multiplayer, regions |
| `bw-visual-performance-qa` | Visual regression, GPU/CPU performance, memory, QA |

## Relationship to external skills

- Use `arjun988/blender-skills` for Blender authoring workflows such as modeling, sculpting, UVs, materials, Geometry Nodes, rigging, and Blender scene operations.
- Use these `bw-*` skills for project-specific runtime, integration, simulation, and acceptance rules.
- If an external skill and a `bw-*` skill conflict, follow the repository's actual code, dependency versions, tests, and the project-specific acceptance rules. Do not blindly follow external version-specific examples.

## General operating rules

1. Inspect the current branch and source before acting.
2. Confirm installed dependency versions; never upgrade packages as a side effect of following a skill.
3. Prefer existing modules and validators over parallel implementations.
4. Use read-only inspection first. Work on copies/staging outputs for Blender and asset operations.
5. Do not overwrite approved assets, change production data, or alter MCP configuration without explicit approval.
6. Report exact files, commands, test results, and limitations. Never claim a test ran if it did not.

These skills are guidance, not proof that a capability exists or has been tested. Validate behavior against the current repository.
