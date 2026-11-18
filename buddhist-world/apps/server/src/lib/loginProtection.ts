import { createHash } from "node:crypto";
import { redis } from "./redis.js";
import { LOGIN_FAILURE_WINDOW_SECONDS } from "./loginProtectionPolicy.js";

function accountKeys(email: string) {
  const normalized = email.trim().toLowerCase();
  const digest = createHash("sha256").update(normalized).digest("hex");
  return { failures: `auth:login:failures:${digest}`, cooldown: `auth:login:cooldown:${digest}` };
}

const RECORD_FAILURE_SCRIPT = `
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

export async function loginCooldownRemaining(email: string): Promise<number> {
  const keys = accountKeys(email);
  return Math.max(0, await redis.ttl(keys.cooldown));
}

export async function recordLoginFailure(email: string): Promise<{ failures: number; cooldownSeconds: number }> {
  const keys = accountKeys(email);
  const result = await redis.eval(
    RECORD_FAILURE_SCRIPT, 2, keys.failures, keys.cooldown, String(LOGIN_FAILURE_WINDOW_SECONDS),
  ) as [number | string, number | string];
  return { failures: Number(result[0]), cooldownSeconds: Number(result[1]) };
}

export async function clearLoginFailures(email: string): Promise<void> {
  const keys = accountKeys(email);
  await redis.del(keys.failures, keys.cooldown);
}
