import { Router, type Request, type Response } from "express";
import type { PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { registerBody, loginBody, DEFAULT_REGION_ID, getRegion } from "@bw/shared";
import { pool } from "../../db/pool.js";
import { env } from "../../config/env.js";
import { hashPassword, verifyPassword } from "../../lib/password.js";
import { signAccess, newRefreshToken, hashToken } from "../../lib/tokens.js";
import { hit, rateLimit } from "../../lib/rateLimit.js";
import { clearLoginFailures, loginCooldownRemaining, recordLoginFailure } from "../../lib/loginProtection.js";
import { redis } from "../../lib/redis.js";
import { logger } from "../../lib/logger.js";
import { createPasswordResetOtp, createPasswordResetToken, passwordResetActiveRedisKey, passwordResetOtpRedisKey, passwordResetRedisKey, sendPasswordResetOtpEmail } from "../../lib/passwordRecovery.js";

export const authRouter = Router();
const COOKIE = "bw_refresh";
const cookieOpts = {
  httpOnly: true, sameSite: "lax" as const, secure: env.COOKIE_SECURE,
  path: "/api/auth", maxAge: env.REFRESH_TOKEN_TTL_SEC * 1000,
};

async function issueSession(
  client: PoolClient,
  user: { id: string; username: string; role: string },
  familyId: string,
  ua?: string,
) {
  const refreshToken = newRefreshToken();
  const result = await client.query(
    `INSERT INTO player_sessions (user_id, family_id, token_hash, expires_at, user_agent)
     VALUES ($1,$2,$3, now() + ($4 || ' seconds')::interval, $5)
     RETURNING id`,
    [user.id, familyId, hashToken(refreshToken), String(env.REFRESH_TOKEN_TTL_SEC), ua?.slice(0, 200) ?? null],
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
    const session = await issueSession(client, user, randomUUID(), req.get("user-agent"));
    await client.query("COMMIT");
    setRefreshCookie(res, session.refreshToken);
    res.status(201).json({ accessToken: session.accessToken, user: { id: user.id, username: user.username } });
  } catch (e: any) {
    await client.query("ROLLBACK");
    if (e?.code === "23505") { res.status(409).json({ error: "Email hoặc tên người dùng đã được sử dụng." }); return; }
    throw e;
  } finally { client.release(); }
});

authRouter.post("/login", rateLimit("login", 20, 900), async (req: Request, res: Response) => {
  const p = loginBody.safeParse(req.body);
  if (!p.success) { res.status(400).json({ error: "Dữ liệu không hợp lệ" }); return; }
  // Capture server time before database work so a stale concurrent failure
  // cannot recreate cooldown after a newer successful authentication.
  const loginAttemptAt = Date.now();
  let cooldownRemaining: number;
  try {
    cooldownRemaining = await loginCooldownRemaining(p.data.email);
  } catch {
    res.status(503).json({ error: "Dịch vụ bảo vệ đăng nhập tạm thời không khả dụng." });
    return;
  }
  if (cooldownRemaining > 0) {
    res.setHeader("Retry-After", String(cooldownRemaining));
    res.status(429).json({ error: "Quá nhiều lần đăng nhập không thành công. Vui lòng thử lại sau." });
    return;
  }

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
      try {
        const failure = await recordLoginFailure(p.data.email, loginAttemptAt);
        if (failure.cooldownSeconds > 0) {
          res.setHeader("Retry-After", String(failure.cooldownSeconds));
          res.status(429).json({ error: "Quá nhiều lần đăng nhập không thành công. Vui lòng thử lại sau." });
          return;
        }
      } catch {
        res.status(503).json({ error: "Dịch vụ bảo vệ đăng nhập tạm thời không khả dụng." });
        return;
      }
      res.status(401).json({ error: "Email hoặc mật khẩu không đúng." });
      return;
    }
    try {
      await clearLoginFailures(p.data.email, loginAttemptAt);
    } catch {
      await client.query("ROLLBACK");
      res.status(503).json({ error: "Dịch vụ bảo vệ đăng nhập tạm thời không khả dụng." });
      return;
    }
    await client.query(`INSERT INTO audit_logs (user_id, action, ip) VALUES ($1,'login',$2)`, [user.id, req.ip]);
    const session = await issueSession(client, user, randomUUID(), req.get("user-agent"));
    await client.query("COMMIT");
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
  try {
    if (!(await hit(`refresh-token:${hashToken(token)}`, 10, 900))) {
      res.status(429).json({ error: "Yêu cầu làm mới phiên quá thường xuyên." });
      return;
    }
  } catch {
    res.status(503).json({ error: "Dịch vụ bảo vệ phiên tạm thời không khả dụng." });
    return;
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const r = await client.query(
      `SELECT s.id, s.user_id, s.family_id, s.revoked_at, s.expires_at, u.username, u.role
         FROM player_sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = $1 FOR UPDATE OF s`,
      [hashToken(token)],
    );
    const s = r.rows[0];
    if (!s) {
      await client.query("ROLLBACK");
      clearRefreshCookie(res);
      res.status(401).json({ error: "Phiên không hợp lệ." });
      return;
    }
    if (s.revoked_at) {
      await client.query(
        `UPDATE player_sessions SET revoked_at = now() WHERE family_id = $1 AND revoked_at IS NULL`,
        [s.family_id],
      );
      await client.query(
        `INSERT INTO audit_logs (user_id, action, ip) VALUES ($1,'refresh_reuse_detected',$2)`,
        [s.user_id, req.ip],
      );
      await client.query("COMMIT");
      clearRefreshCookie(res);
      res.status(401).json({ error: "Phiên đã bị thu hồi." });
      return;
    }
    if (new Date(s.expires_at) <= new Date()) {
      await client.query("ROLLBACK");
      clearRefreshCookie(res);
      res.status(401).json({ error: "Phiên đã hết hạn." });
      return;
    }
    await client.query(`UPDATE player_sessions SET revoked_at = now() WHERE id = $1`, [s.id]);
    const session = await issueSession(
      client, { id: s.user_id, username: s.username, role: s.role }, s.family_id, req.get("user-agent"),
    );
    await client.query("COMMIT");
    await redis.set(`revoked-session:${s.id}`, "1", "EX", env.ACCESS_TOKEN_TTL_SEC).catch((error) => logger.warn({ error }, "failed to cache revoked session; PostgreSQL remains authoritative"));
    setRefreshCookie(res, session.refreshToken);
    res.json({ accessToken: session.accessToken, user: { id: s.user_id, username: s.username } });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
});

const passwordResetRequestBody = z.object({ email: z.string().email().max(254).transform((value) => value.trim().toLowerCase()) });
const verifyPasswordResetOtpBody = z.object({
  email: z.string().email().max(254).transform((value) => value.trim().toLowerCase()),
  otp: z.string().regex(/^\d{6}$/),
});
const passwordResetBody = z.object({
  token: z.string().min(32).max(128),
  password: z.string().min(10).max(128),
});
const PASSWORD_RESET_REQUEST_MESSAGE = "Nếu email này thuộc về một tài khoản, mã OTP sẽ được gửi đến email đó nếu dịch vụ gửi thư khả dụng.";

const VERIFY_PASSWORD_RESET_OTP_SCRIPT = `
local ttl = redis.call('TTL', KEYS[1])
if ttl <= 0 then return -1 end
local attempts = tonumber(redis.call('HGET', KEYS[1], 'attempts') or '0')
if attempts >= 5 then redis.call('DEL', KEYS[1]); return -2 end
local expected = redis.call('HGET', KEYS[1], 'otp_hash')
if expected ~= ARGV[1] then
  local nextAttempt = redis.call('HINCRBY', KEYS[1], 'attempts', 1)
  if nextAttempt >= 5 then redis.call('DEL', KEYS[1]); return -2 end
  return -3
end
local userId = redis.call('HGET', KEYS[1], 'user_id')
if not userId or userId ~= ARGV[4] then redis.call('DEL', KEYS[1]); return -1 end
redis.call('SET', KEYS[2], userId, 'EX', ARGV[2])
redis.call('SET', KEYS[3], ARGV[3], 'EX', ARGV[2])
redis.call('DEL', KEYS[1])
return 1
`;

const CONSUME_PASSWORD_RESET_TOKEN_SCRIPT = `
local userId = redis.call('GET', KEYS[1])
if not userId then return nil end
local activeHash = redis.call('GET', KEYS[2])
if activeHash ~= ARGV[1] then return nil end
redis.call('DEL', KEYS[1], KEYS[2])
return userId
`;

authRouter.post("/forgot-password", rateLimit("password-reset-request", 5, 3600), async (req: Request, res: Response) => {
  const parsed = passwordResetRequestBody.safeParse(req.body);
  if (!parsed.success) { res.json({ message: PASSWORD_RESET_REQUEST_MESSAGE }); return; }

  const email = parsed.data.email;
  try {
    if (!(await hit(`password-reset-email:${hashToken(email)}`, 3, 3600))) {
      res.json({ message: PASSWORD_RESET_REQUEST_MESSAGE });
      return;
    }
  } catch (error) {
    logger.error({ error }, "password reset rate-limit store unavailable");
    res.status(503).json({ error: "Dịch vụ khôi phục mật khẩu tạm thời không khả dụng." });
    return;
  }

  if (!env.RESEND_API_KEY || !env.RESEND_FROM_EMAIL) {
    logger.warn("password recovery Resend settings are not configured");
    res.status(503).json({ error: "Dịch vụ gửi email khôi phục mật khẩu chưa được cấu hình." });
    return;
  }

  try {
    const result = await pool.query<{ id: string; email: string }>(
      "SELECT id, email FROM users WHERE lower(email)=lower($1) LIMIT 1",
      [email],
    );
    const user = result.rows[0];
    if (user) {
      const { otp, otpHash } = createPasswordResetOtp();
      const otpKey = passwordResetOtpRedisKey(hashToken(email));
      // A new request invalidates the previous OTP and any previously verified reset token.
      await redis.multi()
        .del(otpKey, passwordResetActiveRedisKey(user.id))
        .hset(otpKey, "user_id", user.id, "otp_hash", otpHash, "attempts", "0")
        .expire(otpKey, env.PASSWORD_RESET_OTP_TTL_SEC)
        .exec();
      try {
        await sendPasswordResetOtpEmail({
          apiKey: env.RESEND_API_KEY,
          from: env.RESEND_FROM_EMAIL,
          to: user.email,
          otp,
        });
      } catch (error) {
        await redis.del(otpKey).catch(() => undefined);
        logger.error({ error }, "password recovery OTP email delivery failed");
      }
    }
    res.json({ message: PASSWORD_RESET_REQUEST_MESSAGE });
  } catch (error) {
    logger.error({ error }, "password recovery request failed");
    res.status(503).json({ error: "Không thể xử lý yêu cầu lúc này. Vui lòng thử lại sau." });
  }
});

authRouter.post("/verify-reset-otp", rateLimit("password-reset-verify", 10, 900), async (req: Request, res: Response) => {
  const parsed = verifyPasswordResetOtpBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Email hoặc mã OTP không hợp lệ." });
    return;
  }

  const emailHash = hashToken(parsed.data.email);
  const otpKey = passwordResetOtpRedisKey(emailHash);
  const { token, tokenHash } = createPasswordResetToken();
  const resetKey = passwordResetRedisKey(tokenHash);
  try {
    const candidateUserId = await redis.hget(otpKey, "user_id");
    if (!candidateUserId) {
      res.status(400).json({ error: "Mã OTP không tồn tại hoặc đã hết hạn." });
      return;
    }
    const result = Number(await redis.eval(
      VERIFY_PASSWORD_RESET_OTP_SCRIPT,
      3,
      otpKey,
      resetKey,
      passwordResetActiveRedisKey(candidateUserId),
      hashToken(parsed.data.otp),
      env.PASSWORD_RESET_TOKEN_TTL_SEC,
      tokenHash,
      candidateUserId,
    ));
    if (result !== 1) {
      const message = result === -2 ? "Mã OTP đã vượt quá số lần thử. Hãy yêu cầu mã mới." :
        result === -3 ? "Mã OTP không đúng." : "Mã OTP không tồn tại hoặc đã hết hạn.";
      res.status(400).json({ error: message });
      return;
    }
    res.json({ resetToken: token, message: "Xác thực OTP thành công." });
  } catch (error) {
    logger.error({ error }, "password reset OTP verification failed");
    res.status(503).json({ error: "Dịch vụ xác thực OTP tạm thời không khả dụng." });
  }
});

authRouter.post("/reset-password", rateLimit("password-reset-complete", 10, 900), async (req: Request, res: Response) => {
  const parsed = passwordResetBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Mật khẩu mới phải có ít nhất 10 ký tự và liên kết phải hợp lệ." });
    return;
  }

  const tokenHash = hashToken(parsed.data.token);
  const resetKey = passwordResetRedisKey(tokenHash);
  let candidateUserId: string | null;
  try {
    candidateUserId = await redis.get(resetKey);
    if (!candidateUserId) {
      res.status(400).json({ error: "Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn." });
      return;
    }
    const consumedUserId = await redis.eval(
      CONSUME_PASSWORD_RESET_TOKEN_SCRIPT,
      2,
      resetKey,
      passwordResetActiveRedisKey(candidateUserId),
      tokenHash,
    );
    if (typeof consumedUserId !== "string") {
      res.status(400).json({ error: "Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn." });
      return;
    }
    candidateUserId = consumedUserId;
  } catch (error) {
    logger.error({ error }, "password reset token store unavailable");
    res.status(503).json({ error: "Dịch vụ khôi phục mật khẩu tạm thời không khả dụng." });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const updated = await client.query(
      "UPDATE users SET password_hash = $1 WHERE id = $2 RETURNING id",
      [await hashPassword(parsed.data.password), candidateUserId],
    );
    if (updated.rowCount !== 1) {
      await client.query("ROLLBACK");
      res.status(400).json({ error: "Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn." });
      return;
    }
    const revoked = await client.query<{ id: string }>(
      "UPDATE player_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL RETURNING id",
      [candidateUserId],
    );
    await client.query(
      "INSERT INTO audit_logs (user_id, action, ip) VALUES ($1,'password_reset',$2)",
      [candidateUserId, req.ip],
    );
    await client.query("COMMIT");
    await Promise.all(revoked.rows.map(({ id }) =>
      redis.set(`revoked-session:${id}`, "1", "EX", env.ACCESS_TOKEN_TTL_SEC)
        .catch((error) => logger.warn({ error, sessionId: id }, "failed to cache password-reset session revocation")),
    ));
    res.json({ message: "Mật khẩu đã được cập nhật. Vui lòng đăng nhập lại trên các thiết bị." });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

authRouter.post("/logout", async (req: Request, res: Response) => {
  const token = req.cookies?.[COOKIE];
  if (token) {
    const result = await pool.query(
      `UPDATE player_sessions SET revoked_at = now()
        WHERE token_hash = $1 AND revoked_at IS NULL
        RETURNING id`,
      [hashToken(token)],
    );
    const sessionId = result.rows[0]?.id as string | undefined;
    if (sessionId) {
      await redis.set(`revoked-session:${sessionId}`, "1", "EX", env.ACCESS_TOKEN_TTL_SEC).catch((error) => logger.warn({ error }, "failed to cache revoked session; PostgreSQL remains authoritative"));
    }
  }
  clearRefreshCookie(res);
  res.status(204).end();
});
