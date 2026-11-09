import express, { type NextFunction, type Request, type Response } from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { healthRouter } from "./modules/health/routes.js";
import { authRouter } from "./modules/auth/routes.js";
import { meRouter } from "./modules/me/routes.js";
import { worldRouter } from "./modules/world/routes.js";

export function createApp() {
  const app = express();
  app.set("trust proxy", 1);
  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
  app.use(express.json({ limit: "32kb" }));
  app.use(cookieParser());
  app.use("/api/health", healthRouter);
  app.use("/api/auth", authRouter);
  app.use("/api/me", meRouter);
  app.use("/api/world", worldRouter);
  app.use((_req, res) => { res.status(404).json({ error: "Không tìm thấy." }); });
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    logger.error({ err }, "unhandled");
    res.status(500).json({ error: "Lỗi máy chủ." });
  });
  return app;
}
