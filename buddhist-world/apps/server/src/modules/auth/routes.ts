import { Router, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { registerBody, loginBody, DEFAULT_REGION_ID, getRegion } from "@bw/shared";
import { pool } from "../../db/pool.js";
import { env } from "../../config/env.js";
import { hashPassword, verifyPassword } from "../../lib/password.js";
import { signAccess, newRefreshToken, hashToken } from "../../lib/tokens.js";
import { rateLimit } from "../../lib/rateLimit.js";

export const authRouter = Router();
const COOKIE = "bw_refresh";
const cookieOpts = {
  httpOnly: true, sameSite: "lax" as const, secure: env.COOKIE_SECURE,
  path: "/api/auth", maxAge: env.REFRESH_TOKEN_TTL_SEC * 1000,
};

async function issueSession(res: Response, user: { id: string; username: string; role: string }, familyId: string, ua?: string) {
  const refresh = newRefreshToken();
  await pool.query(
    `INSERT INTO player_sessions (user_id, family_id, token_hash, expires_at, user_agent)
     VALUES ($1,$2,$3, now() + ($4 || ' seconds')::interval, $5)`,
    [user.id, familyId, hashToken(refresh), String(env.REFRESH_TOKEN_TTL_SEC), ua?.slice(0, 200) ?? null],
  );
  res.cookie(COOKIE, refresh, cookieOpts);
  return signAccess({ sub: user.id, name: user.username, role: user.role });
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
      `INSERT INTO player_locations (user_id, region_id, spawn_id, x,y,z) VALUES ($1,$2,$3,$4,$5,$6)`,
      [user.id, r.id, s.id, ...s.position],
    );
    await client.query(`INSERT INTO audit_logs (user_id, action, ip) VALUES ($1,'register',$2)`, [user.id, req.ip]);
    await client.query("COMMIT");
    const accessToken = await issueSession(res, user, randomUUID(), req.get("user-agent"));
    res.status(201).json({ accessToken, user: { id: user.id, username: user.username } });
  } catch (e: any) {
    await client.query("ROLLBACK");
    if (e?.code === "23505") { res.status(409).json({ error: "Email hoặc tên người dùng đã được sử dụng." }); return; }
    throw e;
  } finally { client.release(); }
});

authRouter.post("/login", rateLimit("login", 20, 900), async (req: Request, res: Response) => {
  const p = loginBody.safeParse(req.body);
  if (!p.success) { res.status(400).json({ error: "Dữ liệu không hợp lệ" }); return; }
  const r = await pool.query(`SELECT id, username, role, password_hash FROM users WHERE lower(email)=lower($1)`, [p.data.email]);
  const user = r.rows[0];
  // Luôn chạy verify để tránh lộ thông tin qua thời gian phản hồi.
  const ok = await verifyPassword(p.data.password, user?.password_hash ?? "scrypt$00$00");
  if (!user || !ok) { res.status(401).json({ error: "Email hoặc mật khẩu không đúng." }); return; }
  await pool.query(`INSERT INTO audit_logs (user_id, action, ip) VALUES ($1,'login',$2)`, [user.id, req.ip]);
  const accessToken = await issueSession(res, user, randomUUID(), req.get("user-agent"));
  res.json({ accessToken, user: { id: user.id, username: user.username } });
});

/** Xoay refresh token. Nếu token đã bị thu hồi mà vẫn được dùng lại → thu hồi cả họ phiên. */
authRouter.post("/refresh", rateLimit("refresh", 60, 900), async (req: Request, res: Response) => {
  const token = req.cookies?.[COOKIE];
  if (!token) { res.status(401).json({ error: "Không có phiên." }); return; }
  const r = await pool.query(
    `SELECT s.id, s.user_id, s.family_id, s.revoked_at, s.expires_at, u.username, u.role
       FROM player_sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = $1`,
    [hashToken(token)],
  );
  const s = r.rows[0];
  if (!s) { res.clearCookie(COOKIE, { path: "/api/auth" }); res.status(401).json({ error: "Phiên không hợp lệ." }); return; }
  if (s.revoked_at) {
    await pool.query(`UPDATE player_sessions SET revoked_at = now() WHERE family_id = $1 AND revoked_at IS NULL`, [s.family_id]);
    await pool.query(`INSERT INTO audit_logs (user_id, action, ip) VALUES ($1,'refresh_reuse_detected',$2)`, [s.user_id, req.ip]);
    res.clearCookie(COOKIE, { path: "/api/auth" });
    res.status(401).json({ error: "Phiên đã bị thu hồi." }); return;
  }
  if (new Date(s.expires_at) < new Date()) { res.status(401).json({ error: "Phiên đã hết hạn." }); return; }
  await pool.query(`UPDATE player_sessions SET revoked_at = now() WHERE id = $1`, [s.id]);
  const accessToken = await issueSession(res, { id: s.user_id, username: s.username, role: s.role }, s.family_id, req.get("user-agent"));
  res.json({ accessToken, user: { id: s.user_id, username: s.username } });
});

authRouter.post("/logout", async (req: Request, res: Response) => {
  const token = req.cookies?.[COOKIE];
  if (token) await pool.query(`UPDATE player_sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL`, [hashToken(token)]);
  res.clearCookie(COOKIE, { path: "/api/auth" });
  res.status(204).end();
});
