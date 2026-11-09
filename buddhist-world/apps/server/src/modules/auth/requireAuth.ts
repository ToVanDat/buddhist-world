import type { Request, Response, NextFunction } from "express";
import { verifyAccess, type AccessClaims } from "../../lib/tokens.js";

declare module "express-serve-static-core" {
  interface Request { auth?: AccessClaims }
}
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const h = req.headers.authorization;
  const claims = h?.startsWith("Bearer ") ? verifyAccess(h.slice(7)) : null;
  if (!claims) { res.status(401).json({ error: "Chưa đăng nhập hoặc phiên đã hết hạn." }); return; }
  req.auth = claims;
  next();
}
