import { describe, expect, it } from "vitest";
import { buildPasswordResetUrl, createPasswordResetToken, passwordResetRedisKey } from "./passwordRecovery.js";

describe("password recovery token helpers", () => {
  it("creates high-entropy opaque tokens and stores only a SHA-256 digest", () => {
    const first = createPasswordResetToken();
    const second = createPasswordResetToken();
    expect(first.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(first.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(first.token).not.toBe(first.tokenHash);
    expect(first.token).not.toBe(second.token);
    expect(passwordResetRedisKey(first.tokenHash)).toBe(`password-reset:${first.tokenHash}`);
  });

  it("places the token in the URL fragment rather than the request path or query", () => {
    const url = new URL(buildPasswordResetUrl("https://game.example", "opaque-token"));
    expect(url.origin).toBe("https://game.example");
    expect(url.pathname).toBe("/");
    expect(url.search).toBe("");
    expect(new URLSearchParams(url.hash.slice(1)).get("reset")).toBe("opaque-token");
  });
});
