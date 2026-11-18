import { createHash } from "node:crypto";
import { redis } from "./redis.js";
import { LOGIN_FAILURE_WINDOW_SECONDS } from "./loginProtectionPolicy.js";

function accountKeys(email: string) {
  const normalized = email.trim().toLowerCase();
  const digest = createHash("sha256").update(normalized).digest("hex");
  return {
    failures: "auth:login:failures:" + digest,
    cooldown: "auth:login:cooldown:" + digest,
    success: "auth:login:last-success:" + digest,
  };
}

const RECORD_FAILURE_SCRIPT = `
local lastSuccess = tonumber(redis.call('GET', KEYS[3]) or '0')
local attemptAt = tonumber(ARGV[2]) or 0
-- Ignore an older request that finished after a newer successful login.
if attemptAt <= lastSuccess then
  return { tonumber(redis.call('GET', KEYS[1]) or '0'), 0 }
end
local failures = redis.call('INCR', KEYS[1])
if failures == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
local cooldown = 0
if failures >= 12 then cooldown = 1800
elseif failures >= 10 then cooldown = 900
elseif failures >= 8 then cooldown = 300
elseif failures >= 6 then cooldown = 60
elseif failures >= 4 then cooldown = 30
end
if cooldown > 0 then redis.call('SET', KEYS[2], '1', 'EX', cooldown) end
return { failures, cooldown }
`;

const CLEAR_FAILURES_SCRIPT = `
redis.call('DEL', KEYS[1], KEYS[2])
redis.call('SET', KEYS[3], ARGV[1], 'EX', ARGV[2])
return 1
`;

export async function loginCooldownRemaining(email: string): Promise<number> {
  const keys = accountKeys(email);
  return Math.max(0, await redis.ttl(keys.cooldown));
}

export async function recordLoginFailure(
  email: string,
  attemptStartedAt = Date.now(),
): Promise<{ failures: number; cooldownSeconds: number }> {
  const keys = accountKeys(email);
  const result = await redis.eval(
    RECORD_FAILURE_SCRIPT, 3, keys.failures, keys.cooldown, keys.success,
    String(LOGIN_FAILURE_WINDOW_SECONDS), String(attemptStartedAt),
  ) as [number | string, number | string];
  return { failures: Number(result[0]), cooldownSeconds: Number(result[1]) };
}

export async function clearLoginFailures(email: string, successfulAttemptAt = Date.now()): Promise<void> {
  const keys = accountKeys(email);
  await redis.eval(
    CLEAR_FAILURES_SCRIPT, 3, keys.failures, keys.cooldown, keys.success,
    String(successfulAttemptAt), String(LOGIN_FAILURE_WINDOW_SECONDS),
  );
}
