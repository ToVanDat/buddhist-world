import jwt from "jsonwebtoken";
import { createHash, randomBytes } from "node:crypto";
import { env } from "../config/env.js";

export interface AccessClaims { sub: string; name: string; role: string }

export const signAccess = (c: AccessClaims) =>
  jwt.sign(c, env.JWT_ACCESS_SECRET, { expiresIn: env.ACCESS_TOKEN_TTL_SEC, algorithm: "HS256" });

export function verifyAccess(token: string): AccessClaims | null {
  try {
    const p = jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ["HS256"] }) as jwt.JwtPayload;
    if (typeof p.sub !== "string") return null;
    return { sub: p.sub, name: String(p.name), role: String(p.role) };
  } catch { return null; }
}
export const newRefreshToken = () => randomBytes(48).toString("base64url");
export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");
