import { Router } from "express";
import { db } from "../config/database";
import { redisClient } from "../config/redis";

export const healthRouter = Router();

healthRouter.get("/", async (req, res) => {
  try {
    // Check PostgreSQL
    await db.query("SELECT 1");
    const dbStatus = "connected";

    // Check Redis
    let redisStatus = "disconnected";
    try {
      await redisClient.ping();
      redisStatus = "connected";
    } catch (error) {
      redisStatus = "disconnected";
    }

    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      services: {
        database: dbStatus,
        redis: redisStatus,
      },
    });
  } catch (error) {
    res.status(503).json({
      status: "error",
      message: "Service unavailable",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});
