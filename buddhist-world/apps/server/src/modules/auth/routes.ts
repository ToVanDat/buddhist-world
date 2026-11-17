import { Router, type Request, type Response, type NextFunction } from "express";
import type { PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import { registerBody, loginBody, DEFAULT_REGION_ID, getRegion } from "@bw/shared";
import { pool } from "../../db/pool.js";
import { env } from "../../config/env.js";
import { hashPassword, verifyPassword } from "../../lib/password.js";
import { signAccess, newRefreshToken, hashToken } from "../../lib/tokens.js";
import { rateLimit } from "../../lib/rateLimit.js";
import { redis } from "../../lib/redis.js";

export const authRouter = Router();
const COOKIE = "bw_refresh";

/** Cookie-backed auth endpoints must not accept cross-origin browser mutations. */
function requireTrustedOrigin(req: Request, res: Response, next: NextFunction) {
  const origin = req.get("origin");
  if ((origin && origin !== env.CORS_ORIGIN) || (env.NODE_ENV === "production" && !origin)) {
    res.status(403).json({ error: "Nguồn yêu cầu không được phép." });
    return;
  }
  next();
}
authRouter.use(requireTrustedOrigin);
const cookieOpts = {
  httpOnly: true, sameSite: "lax" as const, secure: env.COOKIE_SECURE,
  path: "/api/auth", maxAge: env.REFRESH_TOKEN_TTL_SEC * 1000,
};

async function issueSession(
  client: PoolClient,
  user: { id: string; username: string; role: string },
  ua?: string,
) {
  const refreshToken = newRefreshToken();
  const result = await client.query(
    `INSERT INTO player_sessions (user_id, family_id, token_hash, expires_at, user_agent)
     VALUES ($1,$2,$3, now() + ($4 || ' seconds')::interval, $5)
     RETURNING id`,
    // family_id is retained only for compatibility with the existing schema.
    // Each row gets an isolated value; refresh/revocation no longer use families.
    [user.id, randomUUID(), hashToken(refreshToken), String(env.REFRESH_TOKEN_TTL_SEC), ua?.slice(0, 200) ?? null],
  );
  const accessToken = signAccess({
    sub: user.id, name: user.username, role: user.role, sessionId: result.rows[0].id,
  });
  return { accessToken, refreshToken };
}

function setRefreshCookie(res: Response, token: string) {
  res.cookie(COOKIE, token, cookieOpts);
}
function clearRefreshCookie(res: Response) {
  res.clearCookie(COOKIE, { httpOnly: true, sameSite: "lax", secure: env.COOKIE_SECURE, path: "/api/auth" });
}

authRouter.post("/register", rateLimit("register", 10, 3600), async (req: Request, res: Response) => {
  const p = registerBody.safeParse(req.body);
  if (!p.success) { res.status(400).json({ error: "Dữ liệu không hợp lệ", fields: p.error.flatten().fieldErrors }); return; }
  const { email, username, password } = p.data;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const u = await client.query(
      `INSERT INTO users (email, username, password_hash) VALUES ($1,$2,$3) RETURNING id, username, role`,
      [email, username, await hashPassword(password)],
    );
    const user = u.rows[0];
    await client.query(`INSERT INTO player_profiles (user_id, display_name) VALUES ($1,$2)`, [user.id, username]);
    await client.query(`INSERT INTO player_characters (user_id) VALUES ($1)`, [user.id]);
    const r = getRegion(DEFAULT_REGION_ID)!;
    const s = r.spawns.find((x) => x.id === r.defaultSpawn)!;
    await client.query(
      `INSERT INTO player_locations (user_id, region_id, spawn_id, x,y,z,yaw) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [user.id, r.id, s.id, ...s.position, s.yaw],
    );
    await client.query(`INSERT INTO audit_logs (user_id, action, ip) VALUES ($1,'register',$2)`, [user.id, req.ip]);
    const session = await issueSession(client, user, req.get("user-agent"));
    await client.query("COMMIT");
    setRefreshCookie(res, session.refreshToken);
    res.status(201).json({ accessToken: session.accessToken, user: { id: user.id, username: user.username, role: user.role } });
  } catch (e: any) {
    await client.query("ROLLBACK");
    if (e?.code === "23505") { res.status(409).json({ error: "Email hoặc tên người dùng đã được sử dụng." }); return; }
    throw e;
  } finally { client.release(); }
});

authRouter.post("/login", rateLimit("login", 20, 900), async (req: Request, res: Response) => {
  const p = loginBody.safeParse(req.body);
  if (!p.success) { res.status(400).json({ error: "Dữ liệu không hợp lệ" }); return; }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const r = await client.query(
      `SELECT id, username, role, password_hash FROM users WHERE lower(email)=lower($1)`,
      [p.data.email],
    );
    const user = r.rows[0];
    // Luôn chạy verify để tránh lộ thông tin qua thời gian phản hồi.
    const ok = await verifyPassword(p.data.password, user?.password_hash ?? "scrypt$00$00");
    if (!user || !ok) {
      await client.query("ROLLBACK");
      res.status(401).json({ error: "Email hoặc mật khẩu không đúng." });
      return;
    }
    // Serialize all session mutations for this account. A successful login
    // replaces the previous game session rather than creating another family.
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [user.id]);
    const revoked = await client.query(
      `UPDATE player_sessions SET revoked_at = now()
        WHERE user_id = $1 AND revoked_at IS NULL
        RETURNING id`,
      [user.id],
    );
    await client.query(`INSERT INTO audit_logs (user_id, action, ip) VALUES ($1,'login',$2)`, [user.id, req.ip]);
    const session = await issueSession(client, user, req.get("user-agent"));
    await client.query("COMMIT");
    await Promise.allSettled(revoked.rows.map((row: { id: string }) =>
      redis.set(`revoked-session:${row.id}`, "1", "EX", env.ACCESS_TOKEN_TTL_SEC),
    ));
    setRefreshCookie(res, session.refreshToken);
    res.json({ accessToken: session.accessToken, user: { id: user.id, username: user.username } });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
});

/** Refresh rotation khóa row hiện tại; hai request đồng thời không thể phát hành hai nhánh token hợp lệ. */
authRouter.post("/refresh", rateLimit("refresh", 60, 900), async (req: Request, res: Response) => {
  const token = req.cookies?.[COOKIE];
  if (!token) { res.status(401).json({ error: "Không có phiên." }); return; }
  const tokenHash = hashToken(token);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const currentOwner = await client.query(
      "SELECT id, user_id FROM player_sessions WHERE token_hash = $1",
      [tokenHash],
    );
    const historicalOwner = currentOwner.rows[0] ? null : await client.query(
      `SELECT user_id, detail->>'sessionId' AS session_id
         FROM audit_logs
        WHERE action = 'refresh_token_rotated'
          AND detail->>'rotatedTokenHash' = $1
        ORDER BY id DESC LIMIT 1`,
      [tokenHash],
    );
    const owner = currentOwner.rows[0] ?? historicalOwner?.rows[0];
    if (!owner) {
      await client.query("ROLLBACK");
      clearRefreshCookie(res);
      res.status(401).json({ error: "Phiên không hợp lệ." });
      return;
    }

    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      [owner.user_id],
    );

    // A refresh token is rotated in-place: the player keeps one stable
    // session row/id. Historical hashes are stored only as hashes in audit_logs.
    const r = await client.query(
      `SELECT s.id, s.user_id, s.revoked_at, s.expires_at, u.username, u.role
         FROM player_sessions s JOIN users u ON u.id = s.user_id
        WHERE s.id = $1 AND s.user_id = $2 AND s.token_hash = $3
        FOR UPDATE OF s`,
      [currentOwner.rows[0]?.id ?? owner.session_id, owner.user_id, tokenHash],
    );
    const sessionRow = r.rows[0];
    if (!sessionRow || sessionRow.revoked_at) {
      const sessionId = currentOwner.rows[0]?.id ?? owner.session_id;
      if (sessionId) {
        await client.query(
          `UPDATE player_sessions SET revoked_at = COALESCE(revoked_at, now())
            WHERE id = $1 AND user_id = $2`,
          [sessionId, owner.user_id],
        );
        await client.query(
          `INSERT INTO audit_logs (user_id, action, ip, detail)
           VALUES ($1,'refresh_reuse_detected',$2,$3::jsonb)`,
          [owner.user_id, req.ip, JSON.stringify({ sessionId })],
        );
        await client.query("COMMIT");
        await redis.set(`revoked-session:${sessionId}`, "1", "EX", env.ACCESS_TOKEN_TTL_SEC).catch(() => {});
      } else {
        await client.query("ROLLBACK");
      }
      clearRefreshCookie(res);
      res.status(401).json({ error: "Phiên đã bị thu hồi." });
      return;
    }
    if (new Date(sessionRow.expires_at) <= new Date()) {
      await client.query("ROLLBACK");
      clearRefreshCookie(res);
      res.status(401).json({ error: "Phiên đã hết hạn." });
      return;
    }

    const refreshToken = newRefreshToken();
    const nextHash = hashToken(refreshToken);
    await client.query(
      `INSERT INTO audit_logs (user_id, action, ip, detail)
       VALUES ($1,'refresh_token_rotated',$2,$3::jsonb)`,
      [sessionRow.user_id, req.ip, JSON.stringify({
        sessionId: sessionRow.id,
        rotatedTokenHash: tokenHash,
      })],
    );
    await client.query(
      `UPDATE player_sessions
          SET token_hash = $2,
              expires_at = now() + ($3 || ' seconds')::interval,
              user_agent = $4
        WHERE id = $1`,
      [sessionRow.id, nextHash, String(env.REFRESH_TOKEN_TTL_SEC), req.get("user-agent")?.slice(0, 200) ?? null],
    );
    const accessToken = signAccess({
      sub: sessionRow.user_id, name: sessionRow.username, role: sessionRow.role, sessionId: sessionRow.id,
    });
    await client.query("COMMIT");
    setRefreshCookie(res, refreshToken);
    res.json({ accessToken, user: { id: sessionRow.user_id, username: sessionRow.username, role: sessionRow.role } });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
});

authRouter.post("/logout", async (req: Request, res: Response) => {
  const token = req.cookies?.[COOKIE];
  if (token) {
    const tokenHash = hashToken(token);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const current = await client.query(
        "SELECT id, user_id FROM player_sessions WHERE token_hash = $1",
        [tokenHash],
      );
      const historical = current.rows[0] ? null : await client.query(
        `SELECT user_id, detail->>'sessionId' AS session_id
           FROM audit_logs
          WHERE action = 'refresh_token_rotated'
            AND detail->>'rotatedTokenHash' = $1
          ORDER BY id DESC LIMIT 1`,
        [tokenHash],
      );
      const owner = current.rows[0] ?? historical?.rows[0];
      if (owner) {
        await client.query(
          "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
          [owner.user_id],
        );
        const sessionId = current.rows[0]?.id ?? owner.session_id;
        const result = await client.query(
          `UPDATE player_sessions SET revoked_at = now()
            WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL
            RETURNING id`,
          [sessionId, owner.user_id],
        );
        await client.query("COMMIT");
        if (result.rows[0]?.id) {
          await redis.set(`revoked-session:${sessionId}`, "1", "EX", env.ACCESS_TOKEN_TTL_SEC).catch(() => {});
        }
      } else {
        await client.query("COMMIT");
      }
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  clearRefreshCookie(res);
  res.status(204).end();
});
