import type { Request, Response, NextFunction } from "express";
import { verifyAccess, type AccessClaims } from "../../lib/tokens.js";
import { isSessionActive } from "../../lib/sessions.js";

declare module "express-serve-static-core" {
  interface Request { auth?: AccessClaims }
}
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const h = req.headers.authorization;
  const claims = h?.startsWith("Bearer ") ? verifyAccess(h.slice(7)) : null;
  if (!claims) { res.status(401).json({ error: "Chưa đăng nhập hoặc phiên đã hết hạn." }); return; }
  try {
    if (!(await isSessionActive(claims.sessionId, claims.sub))) {
      res.status(401).json({ error: "Phiên đã bị thu hồi hoặc hết hạn." });
      return;
    }
    req.auth = claims;
    next();
  } catch (error) {
    next(error);
  }
}
