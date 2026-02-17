import type { NextFunction, Request, Response } from "express";

export function createApiRateLimiter() {
  // Simple in-memory fixed-window limiter (per IP).
  // Note: For multi-instance deployments, swap this for a Redis-backed limiter.
  const windowMs = Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000); // 1 minute
  const max = Number(process.env.RATE_LIMIT_MAX ?? 120); // requests per window per IP

  type Bucket = { windowStartMs: number; count: number };
  const buckets = new Map<string, Bucket>();

  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const ip = req.ip || req.socket.remoteAddress || "unknown";

    const b = buckets.get(ip);
    if (!b || now - b.windowStartMs >= windowMs) {
      buckets.set(ip, { windowStartMs: now, count: 1 });
    } else {
      b.count += 1;
    }

    const bucket = buckets.get(ip)!;
    const remaining = Math.max(0, max - bucket.count);
    const resetMs = Math.max(0, windowMs - (now - bucket.windowStartMs));

    res.setHeader("RateLimit-Limit", String(max));
    res.setHeader("RateLimit-Remaining", String(remaining));
    res.setHeader("RateLimit-Reset", String(Math.ceil(resetMs / 1000)));

    if (bucket.count > max) {
      return res.status(429).json({ error: "Too many requests" });
    }

    return next();
  };
}

