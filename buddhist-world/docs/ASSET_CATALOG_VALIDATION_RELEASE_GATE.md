# Asset Catalog validation release gate

## Current safety state

- Asset creation accepts descriptive metadata only. A client cannot submit `validationReport`.
- New asset rows are created with an empty validation report.
- The API rejects every transition to `approved` with `ASSET_VALIDATOR_NOT_CONFIGURED`.
- Public catalog responses do not expose the stored validation report as if it were trusted evidence.
- No existing rows, migrations, storage objects, or asset files are modified by this gate.
- This gate blocks new approval transitions only. It does not silently rewrite or hide legacy rows that may already be marked `approved`; those rows require a separate read-only inventory and reviewed quarantine plan before production consumers can treat them as trusted.

This is intentionally fail-closed. The repository does not yet contain a server-side validation service that can fetch the object identified by `storage_key`, validate its actual bytes, compare SHA-256 and size, and persist a server-issued attestation. A client-provided boolean such as `passed: true` is not proof of validation.

## Requirements before enabling publishing

1. Resolve `storage_key` through a configured, allowlisted storage provider; never accept an arbitrary URL or local filesystem path.
2. Fetch the exact immutable object version and calculate SHA-256 and byte size on the server.
3. Run format-specific validation on the fetched bytes (GLB structure, PBR/material policy, skeleton/animation contract, collision/navmesh rules and budgets).
4. Persist validator identity/version, object hash, validation timestamp, report, and a server-generated cryptographic attestation.
5. Verify that attestation and object hash inside the approval transaction. Do not trust client-supplied report fields.
6. Add tests proving altered bytes, stale reports, invalid signatures, missing variants, and validator failures cannot publish.
7. Only then remove the fail-closed approval response.

## Related gates

- The Git repository currently has no committed production GLB/GLTF/BLEND payloads.
- The asset registry and region manifest still need a runtime integration contract.
- No database migration is required for the current fail-closed behavior.
