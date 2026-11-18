import { beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
  process.env.NODE_ENV = "test";
  process.env.CORS_ORIGIN = "http://localhost:5173";
  process.env.DATABASE_URL = "postgres://test:test@127.0.0.1:5432/test";
  process.env.REDIS_URL = "redis://127.0.0.1:6379";
  process.env.JWT_ACCESS_SECRET = "test-only-secret-with-more-than-thirty-two-characters";
  process.env.ACCESS_TOKEN_TTL_SEC = "900";
  process.env.REFRESH_TOKEN_TTL_SEC = "3600";
  process.env.COOKIE_SECURE = "false";
});

describe("access token session binding", () => {
  it("round-trips the subject, role and session id", async () => {
    const { signAccess, verifyAccess } = await import("./tokens.js");
    const claims = { sub: "user-1", name: "Lotus", role: "player", sessionId: "session-1" };
    expect(verifyAccess(signAccess(claims))).toEqual(claims);
  });

  it("rejects tokens without a session id", async () => {
    const jwt = (await import("jsonwebtoken")).default;
    const { env } = await import("../config/env.js");
    const { verifyAccess } = await import("./tokens.js");
    const legacy = jwt.sign(
      { sub: "user-1", name: "Lotus", role: "player" },
      env.JWT_ACCESS_SECRET,
      { algorithm: "HS256", issuer: "buddhist-world-api", audience: "buddhist-world-client" },
    );
    expect(verifyAccess(legacy)).toBeNull();
  });

  it("rejects a token signed for another audience", async () => {
    const jwt = (await import("jsonwebtoken")).default;
    const { env } = await import("../config/env.js");
    const { verifyAccess } = await import("./tokens.js");
    const wrongAudience = jwt.sign(
      { sub: "user-1", name: "Lotus", role: "player", sessionId: "session-1" },
      env.JWT_ACCESS_SECRET,
      { algorithm: "HS256", issuer: "buddhist-world-api", audience: "another-client" },
    );
    expect(verifyAccess(wrongAudience)).toBeNull();
  });
});
