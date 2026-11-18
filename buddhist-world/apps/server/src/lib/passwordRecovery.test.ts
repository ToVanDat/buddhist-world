import { describe, expect, it } from "vitest";
import { createPasswordResetOtp, createPasswordResetToken, passwordResetActiveRedisKey, passwordResetOtpRedisKey, passwordResetRedisKey } from "./passwordRecovery.js";

describe("password recovery token helpers", () => {
  it("creates a six-digit OTP and stores only its SHA-256 digest", () => {
    const first = createPasswordResetOtp();
    const second = createPasswordResetOtp();
    expect(first.otp).toMatch(/^\\d{6}$/);
    expect(first.otpHash).toMatch(/^[a-f0-9]{64}$/);
    expect(first.otp).not.toBe(first.otpHash);
    expect(first.otp).not.toBe(second.otp);
  });

  it("creates high-entropy opaque reset tokens and stores only a SHA-256 digest", () => {
    const first = createPasswordResetToken();
    const second = createPasswordResetToken();
    expect(first.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(first.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(first.token).not.toBe(first.tokenHash);
    expect(first.token).not.toBe(second.token);
    expect(passwordResetRedisKey(first.tokenHash)).toBe(`password-reset:${first.tokenHash}`);
  });

  it("namespaces OTP and active reset state without embedding raw email addresses", () => {
    expect(passwordResetOtpRedisKey("email-sha256")).toBe("password-reset-otp:email-sha256");
    expect(passwordResetActiveRedisKey("user-123")).toBe("password-reset-active:user-123");
  });
});
