import { Router } from "express";
import { resolveUserIdBySessionId } from "../../services/sessionCache";
import { getUserStateSnapshot } from "../../services/userStateCache";

export const v1MetricsRouter = Router();

v1MetricsRouter.get("/", async (req, res) => {
  const sessionId = typeof req.query.sessionId === "string" ? req.query.sessionId : null;
  if (!sessionId) {
    return res.status(400).json({ error: "Missing sessionId" });
  }

  try {
    // Stateless backend sessions: sessionId is the only client token.
    // We cache sessionId->userId in Redis to avoid repeated DB hits.
    const userId = await resolveUserIdBySessionId(sessionId);
    if (!userId) return res.status(404).json({ error: "Unknown sessionId" });

    const snapshot = await getUserStateSnapshot(userId);
    if (!snapshot) return res.status(404).json({ error: "Missing user state" });

    const accuracyOverall =
      snapshot.totalAttempts > 0 ? snapshot.totalCorrect / snapshot.totalAttempts : 0;

    return res.json({
      currentScore: snapshot.totalScore,
      currentStreak: snapshot.streak,
      currentDifficulty: snapshot.currentDifficulty,
      accuracyLast10: snapshot.accuracyLast10,
      accuracyOverall,
      difficultyHistogram: snapshot.difficultyHistogram,
      recentPerformanceWindow: snapshot.recentPerformanceWindow,
    });
  } catch {
    return res.status(500).json({ error: "Failed to fetch metrics" });
  }
});

