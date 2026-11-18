# D6 Phase 5 Readiness — World Map / Meditation

**Status:** Design and implementation gated pending source/data confirmation.

## World Map — required evidence

Before implementation, verify:

1. Stable region and area identifiers with display metadata.
2. Which locations are discoverable, unlocked, hidden or unavailable.
3. Authoritative player location and update cadence.
4. Waypoint validation, persistence and route/path semantics.
5. Access rules for region travel and destination selection.
6. Mobile map interaction and data-loading behavior.

The audited source has a TempleGuide with region spawn waypoints, distance and relative bearing. That is useful navigation data, but it is not by itself proof of a complete world-map model, discovery system or route graph. Do not fabricate map markers or route lines.

## Meditation — required evidence

Before implementation, verify:

1. Whether meditation is a real gameplay activity or only a planned experience.
2. Session lifecycle: start, pause, resume, end and interruption.
3. Whether session state is persisted and by which service.
4. Supported scene/environment and camera ownership.
5. Available licensed ambience/audio content.
6. Accessibility, reduced-motion and mobile behavior.
7. Whether any reward or progress is authoritative and server-confirmed.

The audited source did not establish a meditation session contract. Do not implement a fake countdown, session rewards or persistence.

## Decision

Keep both items as design-only until the prerequisites above are demonstrated in source and runtime. Once evidence exists, update this document with exact source paths, API/data contracts, tests and acceptance criteria before writing UI code.
