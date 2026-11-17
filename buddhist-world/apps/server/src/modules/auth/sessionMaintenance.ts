import { pool } from "../../db/pool.js";
import { logger } from "../../lib/logger.js";

const MAINTENANCE_LOCK_ID = "72120261114";
const CLEANUP_BATCH_SIZE = 500;
const MAINTENANCE_INTERVAL_MS = 60 * 60 * 1000;

export interface SessionMaintenanceResult {
  deletedSessions: number;
  auditLogRows: string;
  auditLogBytes: string;
  oldestAuditLogAt: Date | null;
  newestAuditLogAt: Date | null;
}

/**
 * Delete only sessions that are safely outside their usable lifetime.
 * Refresh-token history cascades with its owning session. General audit logs
 * are measured but deliberately not purged until a product retention policy
 * has been approved.
 */
export async function runSessionMaintenance(): Promise<SessionMaintenanceResult | null> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const lock = await client.query<{ locked: boolean }>(
      "SELECT pg_try_advisory_xact_lock($1::bigint) AS locked",
      [MAINTENANCE_LOCK_ID],
    );
    if (!lock.rows[0]?.locked) {
      await client.query("ROLLBACK");
      return null;
    }

    const deleted = await client.query(
      `WITH candidates AS (
         SELECT id
           FROM player_sessions
          WHERE expires_at <= now() - interval '7 days'
             OR (revoked_at IS NOT NULL AND revoked_at <= now() - interval '1 day')
          ORDER BY COALESCE(revoked_at, expires_at), id
          LIMIT $1
          FOR UPDATE SKIP LOCKED
       )
       DELETE FROM player_sessions s
        USING candidates c
        WHERE s.id = c.id
       RETURNING s.id`,
      [CLEANUP_BATCH_SIZE],
    );

    const audit = await client.query<{
      row_count: string;
      bytes: string;
      oldest: Date | null;
      newest: Date | null;
    }>(
      `SELECT count(*)::text AS row_count,
              pg_total_relation_size('audit_logs')::text AS bytes,
              min(created_at) AS oldest,
              max(created_at) AS newest
         FROM audit_logs`,
    );
    await client.query("COMMIT");

    return {
      deletedSessions: deleted.rowCount ?? 0,
      auditLogRows: audit.rows[0]?.row_count ?? "0",
      auditLogBytes: audit.rows[0]?.bytes ?? "0",
      oldestAuditLogAt: audit.rows[0]?.oldest ?? null,
      newestAuditLogAt: audit.rows[0]?.newest ?? null,
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/** One scheduler per database wins the advisory lock; safe to run on every gateway. */
export function startSessionMaintenance(): () => void {
  let inFlight: Promise<void> | null = null;
  const execute = () => {
    if (inFlight) return inFlight;
    inFlight = (async () => {
      const result = await runSessionMaintenance();
      if (result) logger.info(result, "session cleanup and audit growth metrics completed");
    })().catch((error) => {
      logger.warn({ error }, "session maintenance failed; it will retry on the next interval");
    }).finally(() => {
      inFlight = null;
    });
    return inFlight;
  };

  void execute();
  const timer = setInterval(() => void execute(), MAINTENANCE_INTERVAL_MS);
  timer.unref();
  return () => clearInterval(timer);
}
