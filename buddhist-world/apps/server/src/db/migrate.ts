// Run SQL migrations in deterministic filename order, one transaction per file.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "./pool.js";

const dir = join(dirname(fileURLToPath(import.meta.url)), "migrations");
const MIGRATION_LOCK_ID = "72120261113";
const MIGRATION_FILE_PATTERN = /^\d{3}_[a-z0-9][a-z0-9_-]*\.sql$/;

interface AppliedMigration {
  name: string;
  checksum: string | null;
}

function checksum(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function listMigrationFiles(): string[] {
  const files = readdirSync(dir).filter((file) => file.endsWith(".sql")).sort();

  for (const file of files) {
    if (!MIGRATION_FILE_PATTERN.test(file)) {
      throw new Error(`Invalid migration filename "${file}". Expected NNN_description.sql.`);
    }
  }

  return files;
}

async function main(): Promise<void> {
  const client = await pool.connect();
  let lockAcquired = false;

  try {
    // A session-level lock prevents concurrent migration processes.
    await client.query("SELECT pg_advisory_lock($1::bigint)", [MIGRATION_LOCK_ID]);
    lockAcquired = true;

    // Upgrade migration bookkeeping additively; preserve every existing record.
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name text PRIMARY KEY,
        checksum text,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await client.query(
      "ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS checksum text",
    );

    const appliedResult = await client.query<AppliedMigration>(
      "SELECT name, checksum FROM schema_migrations",
    );
    const applied = new Map(appliedResult.rows.map((row) => [row.name, row.checksum]));

    for (const file of listMigrationFiles()) {
      const sql = readFileSync(join(dir, file), "utf8");
      const digest = checksum(sql);
      const previousChecksum = applied.get(file);

      if (applied.has(file)) {
        // Legacy rows predate checksum tracking; do not rewrite their history.
        if (previousChecksum == null) {
          console.warn("legacy migration has no stored checksum; left unchanged:", file);
        } else if (previousChecksum !== digest) {
          throw new Error(
            `Applied migration "${file}" has changed (checksum mismatch). Add a new migration instead of editing history.`,
          );
        }
        continue;
      }

      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)",
          [file, digest],
        );
        await client.query("COMMIT");
        console.log("applied", file);
      } catch (error) {
        await client.query("ROLLBACK");
        throw new Error(`Migration "${file}" failed; transaction rolled back.`, { cause: error });
      }
    }
  } finally {
    try {
      if (lockAcquired) {
        await client.query("SELECT pg_advisory_unlock($1::bigint)", [MIGRATION_LOCK_ID]);
      }
    } finally {
      client.release();
      await pool.end();
    }
  }
}

main().catch((error: unknown) => {
  console.error("database migration failed:", error);
  process.exitCode = 1;
});
