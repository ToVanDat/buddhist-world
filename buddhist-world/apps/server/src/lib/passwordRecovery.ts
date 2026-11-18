import { createHash, randomBytes } from "node:crypto";

export function createPasswordResetToken() {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  return { token, tokenHash };
}

export function passwordResetRedisKey(tokenHash: string) {
  return `password-reset:${tokenHash}`;
}

export function buildPasswordResetUrl(appBaseUrl: string, token: string) {
  const url = new URL("/", appBaseUrl);
  // A fragment keeps the bearer token out of HTTP request logs and Referer headers.
  url.hash = new URLSearchParams({ reset: token }).toString();
  return url.toString();
}

export async function sendPasswordResetEmail(input: {
  apiKey: string;
  from: string;
  appBaseUrl: string;
  to: string;
  token: string;
}) {
  const resetUrl = buildPasswordResetUrl(input.appBaseUrl, input.token);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: input.from,
      to: [input.to],
      subject: "Đặt lại mật khẩu Buddhist World",
      text: [
        "Bạn đã yêu cầu đặt lại mật khẩu Buddhist World.",
        "Mở liên kết sau để tạo mật khẩu mới (liên kết chỉ dùng được một lần và sẽ hết hạn):",
        resetUrl,
        "Nếu bạn không thực hiện yêu cầu này, hãy bỏ qua email.",
      ].join("\n\n"),
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Password reset email provider rejected the request (${response.status}): ${detail.slice(0, 300)}`);
  }
}
