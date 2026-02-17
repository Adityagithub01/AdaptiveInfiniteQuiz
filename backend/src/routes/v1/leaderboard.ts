import { Router } from "express";
import { getLeaderboardSnapshot } from "../../services/leaderboardService";
import { resolveUserIdBySessionId } from "../../services/sessionCache";

export const v1LeaderboardRouter = Router();

v1LeaderboardRouter.get("/score", async (req, res) => {
  const sessionId = typeof req.query.sessionId === "string" ? req.query.sessionId : null;
  const limit = typeof req.query.limit === "string" ? Number(req.query.limit) : undefined;

  try {
    const userId = sessionId ? await resolveUserIdBySessionId(sessionId) : undefined;
    const { snapshot, userRank } = await getLeaderboardSnapshot({
      type: "score",
      limit,
      userId: userId ?? undefined,
    });
    return res.json({
      ...snapshot,
      userRank,
    });
  } catch {
    return res.status(500).json({ error: "Failed to fetch score leaderboard." });
  }
});

v1LeaderboardRouter.get("/streak", async (req, res) => {
  const sessionId = typeof req.query.sessionId === "string" ? req.query.sessionId : null;
  const limit = typeof req.query.limit === "string" ? Number(req.query.limit) : undefined;

  try {
    const userId = sessionId ? await resolveUserIdBySessionId(sessionId) : undefined;
    const { snapshot, userRank } = await getLeaderboardSnapshot({
      type: "streak",
      limit,
      userId: userId ?? undefined,
    });
    return res.json({
      ...snapshot,
      userRank,
    });
  } catch {
    return res.status(500).json({ error: "Failed to fetch streak leaderboard." });
  }
});

