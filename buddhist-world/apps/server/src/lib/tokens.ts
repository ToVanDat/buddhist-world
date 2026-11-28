import jwt from "jsonwebtoken";
import { createHash, randomBytes } from "node:crypto";
import { env } from "../config/env.js";

export interface AccessClaims { sub: string; name: string; role: string; sessionId: string }

export const signAccess = (c: AccessClaims) =>
  jwt.sign(c, env.JWT_ACCESS_SECRET, {
    expiresIn: env.ACCESS_TOKEN_TTL_SEC,
    algorithm: "HS256",
    issuer: "buddhist-world-api",
    audience: "buddhist-world-client",
  });

export function verifyAccess(token: string): AccessClaims | null {
  try {
    const p = jwt.verify(token, env.JWT_ACCESS_SECRET, {
      algorithms: ["HS256"],
      issuer: "buddhist-world-api",
      audience: "buddhist-world-client",
    }) as jwt.JwtPayload;
    if (typeof p.sub !== "string" || typeof p.sessionId !== "string") return null;
    if (typeof p.name !== "string" || typeof p.role !== "string") return null;
    return { sub: p.sub, name: p.name, role: p.role, sessionId: p.sessionId };
  } catch { return null; }
}
export const newRefreshToken = () => randomBytes(48).toString("base64url");
export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");
