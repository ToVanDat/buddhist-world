---
name: bw-world-simulation
description: Develop Buddhist World's real-time world simulation, character movement, Rapier physics, NPC behavior, navigation, multiplayer synchronization, and region streaming. Use when changing simulation or networked world behavior.
---

# Buddhist World World Simulation

## First: map existing ownership

Inspect the current Rapier integration, player controller, remote-player representation, NPC movement, waypoint/navigation code, world/region lifecycle, server authoritative state, schemas, and integration tests. Identify which system owns each state before editing.

Verify installed package versions and existing network message contracts. Do not assume a new controller, physics world, or synchronization protocol is needed.

## Simulation boundaries

- Separate authoritative server state, client prediction/interpolation, local presentation, and transient VFX.
- Keep physics fixed-step behavior separate from render-frame updates.
- Use stable entity IDs and explicit spawn/despawn lifecycle.
- Avoid coupling React component mount/unmount directly to authoritative entity creation without a defined lifecycle.
- Keep collision meshes simpler than visual meshes and validate scale/orientation.
- Make navigation data versioned and tied to the region/asset revision.
- Handle missing navmesh, disconnected clients, region unload, and invalid transforms safely.

## Rapier and character movement

- Follow the existing Rapier world and controller abstraction.
- Use fixed timestep/substep settings already established by the project unless measurements justify a change.
- Avoid creating duplicate physics worlds.
- Define collision groups and sensor behavior explicitly.
- Test slopes, steps, stairs, edges, ramps, moving platforms if supported, and collision seams.
- Keep visual character animation aligned with physics transforms without feeding render jitter back into simulation.

## NPC and navigation

- Use existing waypoint/navmesh formats and validators.
- Define deterministic state transitions and recovery behavior when paths are unavailable.
- Avoid unbounded path recalculation or per-frame expensive queries.
- Make region boundaries and spawn/despawn rules explicit.

## Multiplayer

- Preserve existing API/event schemas and protocol compatibility.
- Validate ownership and permissions on the server; never trust client-supplied position, identity, or interaction authorization.
- Use interpolation for remote presentation and prediction only for locally controlled movement where the architecture supports it.
- Bound update rates and payload sizes.
- Handle reconnect, stale state, duplicate messages, out-of-order updates, and region transitions.
- Add tests for multiple clients and soak/load behavior before claiming production readiness.

## Workflow

1. Document state ownership and current contracts.
2. Add or update schema and tests before changing protocol behavior.
3. Implement the smallest compatible change.
4. Test physics deterministically, then integration with multiple clients.
5. Measure CPU/network costs and document untested scale.

## Safety

Do not change database schemas, authentication, permissions, network protocol, production world state, or migration history as incidental work. Ask before any breaking or destructive change.
