# Database migration policy

## Ordering and immutability

- Migration files use the format `NNN_description.sql`.
- The runner applies files in lexicographic filename order.
- Existing filenames are intentionally preserved. The repository currently contains historical duplicate prefixes (`002` and `004`); do not rename or reorder those files because a database may already have recorded their exact names in `schema_migrations`.
- New migrations must use the next unused numeric prefix and a unique descriptive name (currently start at `008_`).
- Once a migration has been applied in any shared environment, do not edit it. Add a new forward-only migration instead.

## Execution guarantees

- Migrations are invoked explicitly with `pnpm db:migrate`; the application server does not run them during startup.
- The runner obtains a PostgreSQL advisory lock so concurrent invocations cannot apply the same pending migration.
- Each migration and its `schema_migrations` record are committed in one transaction. A failed migration is rolled back.
- New migration records store a SHA-256 checksum. If an already-checksummed migration file changes, the runner stops and asks for a new migration.
- Existing records created before checksum tracking have a NULL checksum. They are preserved and skipped; the runner does not claim to verify their historical contents retroactively.

## Data-safety requirements

- Prefer additive changes: create new objects, add nullable columns, or add constraints only after checking existing data.
- Before adding a constraint to populated tables, include a non-destructive preflight query or a `NOT VALID`/later validation strategy where appropriate.
- Do not use `DROP`, `TRUNCATE`, table rebuilds, destructive type conversions, or data resets in routine migrations.
- Do not put demo/seed content in schema migrations unless the content is explicitly approved as permanent authored world content and is idempotent.
- Never run migrations against a shared or production database without a verified backup, a reviewed diff, and an explicit deployment window.