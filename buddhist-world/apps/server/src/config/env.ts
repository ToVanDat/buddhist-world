import { z } from "zod";
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  CORS_ORIGIN: z.string().url(), DATABASE_URL: z.string().min(1), REDIS_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET phải dài tối thiểu 32 ký tự"),
  ACCESS_TOKEN_TTL_SEC: z.coerce.number().int().min(60).max(3600).default(900),
  REFRESH_TOKEN_TTL_SEC: z.coerce.number().int().min(300).default(60 * 60 * 24 * 30),
  COOKIE_SECURE: z.enum(["true", "false"]).default("false").transform((v) => v === "true"),
  SOCKET_OWNER_LEASE_MS: z.coerce.number().int().min(1_000).max(300_000).default(30_000),
  WORLD_WEATHER: z.enum(["clear", "cloudy", "rain", "fog"]).default("clear"),
  WORLD_WEATHER_INTENSITY: z.coerce.number().min(0).max(1).default(0),
  TURN_URLS: z.string().default(""),
  TURN_SHARED_SECRET: z.string().min(32).optional().or(z.literal("")),
  TURN_CREDENTIAL_TTL_SEC: z.coerce.number().int().min(60).max(3600).default(600),
});
const parsed = schema.safeParse(process.env);
if (!parsed.success) { console.error("Cấu hình .env không hợp lệ:
", parsed.error.flatten().fieldErrors); process.exit(1); }
if (parsed.data.NODE_ENV === "production") {
  if (parsed.data.JWT_ACCESS_SECRET.startsWith("CHANGE_ME")) { console.error("Không được dùng JWT secret mẫu ở production."); process.exit(1); }
  if (!parsed.data.COOKIE_SECURE) { console.error("COOKIE_SECURE phải là true ở production."); process.exit(1); }
}
export const env = parsed.data;
