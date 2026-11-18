import { createHmac } from "node:crypto";
import { Router } from "express";
import { env } from "../../config/env.js";
import { requireAuth } from "../auth/requireAuth.js";
import { rateLimit } from "../../lib/rateLimit.js";

export const voiceRouter = Router();
voiceRouter.get("/ice-servers", requireAuth, rateLimit("voice-ice-servers", 20, 60, (req) => req.auth?.sub ?? req.ip ?? "unknown"), (req, res) => {
  const iceServers: Array<{ urls: string | string[]; username?: string; credential?: string }> = [
    { urls: "stun:stun.l.google.com:19302" },
  ];
  const urls = env.TURN_URLS.split(",").map((url) => url.trim()).filter(Boolean);
  if (urls.length && env.TURN_SHARED_SECRET && req.auth) {
    const expiresAt = Math.floor(Date.now() / 1000) + env.TURN_CREDENTIAL_TTL_SEC;
    const username = `${expiresAt}:${req.auth.sub}`;
    const credential = createHmac("sha1", env.TURN_SHARED_SECRET).update(username).digest("base64");
    iceServers.push({ urls, username, credential });
  }
  res.setHeader("Cache-Control", "no-store");
  res.json({ iceServers, turnConfigured: iceServers.length > 1 });
});
