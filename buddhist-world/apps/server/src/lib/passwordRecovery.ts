import { createHash, randomBytes, randomInt } from "node:crypto";

export function createPasswordResetOtp() {
  const otp = randomInt(100_000, 1_000_000).toString();
  const otpHash = createHash("sha256").update(otp).digest("hex");
  return { otp, otpHash };
}

export function createPasswordResetToken() {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  return { token, tokenHash };
}

export function passwordResetOtpRedisKey(emailHash: string) {
  return `password-reset-otp:${emailHash}`;
}

export function passwordResetRedisKey(tokenHash: string) {
  return `password-reset:${tokenHash}`;
}

export function passwordResetActiveRedisKey(userId: string) {
  return `password-reset-active:${userId}`;
}

export async function sendPasswordResetOtpEmail(input: {
  apiKey: string;
  from: string;
  to: string;
  otp: string;
}) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: input.from,
      to: [input.to],
      subject: "Buddhist World — Mã OTP đặt lại mật khẩu",
      html: `<!doctype html>
<html lang="vi">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:32px 16px;background:#171713;color:#e8e1d2;font-family:Arial,sans-serif">
  <main style="max-width:560px;margin:0 auto;padding:32px;border:1px solid #756746;border-radius:16px;background:#24231e">
    <p style="margin:0 0 8px;color:#b79b5b;font-size:11px;letter-spacing:3px">BUDDHIST WORLD</p>
    <h1 style="margin:0 0 20px;font-family:Georgia,serif;font-size:26px;font-weight:500">Khôi phục hành trình</h1>
    <p style="line-height:1.6">Bạn vừa yêu cầu đặt lại mật khẩu. Nhập mã OTP sau trong ứng dụng Buddhist World:</p>
    <div style="margin:28px 0;padding:20px;text-align:center;border:1px solid #756746;border-radius:12px;background:#171713">
      <strong style="font-size:34px;letter-spacing:10px;color:#e8d4a0">${input.otp}</strong>
    </div>
    <p style="line-height:1.6">Mã có hiệu lực trong <strong>5 phút</strong> và tối đa 5 lần nhập. Không chia sẻ mã này với bất kỳ ai.</p>
    <p style="margin-top:28px;color:#aaa18f;font-size:12px;line-height:1.6">Nếu bạn không yêu cầu đặt lại mật khẩu, hãy bỏ qua email này.</p>
  </main>
</body>
</html>`,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Password reset email provider rejected the request (${response.status}): ${detail.slice(0, 300)}`);
  }
}
