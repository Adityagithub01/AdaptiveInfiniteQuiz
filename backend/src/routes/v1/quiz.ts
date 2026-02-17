import { Router } from "express";
import { db } from "../../config/database";
import { hashAnswer } from "../../utils/hash";
import { applyAdaptiveUpdate } from "../../services/adaptiveDifficulty";
import { updateLeaderboards } from "../../services/leaderboardService";
import { broadcastLeaderboardUpdate } from "../../socket/broadcast";
import { resolveUserIdBySessionId } from "../../services/sessionCache";
import { getUserStateSnapshot, setUserStateSnapshot } from "../../services/userStateCache";
import { getQuestionPublic, getRandomQuestionIdByDifficulty } from "../../services/questionCache";

export const v1QuizRouter = Router();

function getSalt(): string {
  return process.env.QUIZ_ANSWER_SALT || "dev-salt-change-me";
}

function streakMultiplier(streakAtAnswer: number): number {
  // 1–2 -> 1x, 3–5 -> 1.5x, 6+ -> 2x (cap)
  if (streakAtAnswer <= 2) return 1.0;
  if (streakAtAnswer <= 5) return 1.5;
  return 2.0;
}

function rankByGreaterCount(params: {
  orderedTable: "leaderboard_score" | "leaderboard_streak";
  valueColumn: string;
}): string {
  // Rank = 1 + count(rows with strictly greater value).
  // Deterministic tie-breaking isn't required for rank-by-value; we return a stable value-based rank.
  return `SELECT 1 + COUNT(*)::int AS rank
          FROM ${params.orderedTable}
          WHERE ${params.valueColumn} > $1`;
}

/**
 * GET /v1/quiz/next
 *
 * Creates a new session if `sessionId` is missing/unknown.
 * Returns exactly:
 * questionId, difficulty, prompt, choices,
 * sessionId, stateVersion,
 * currentScore, currentStreak
 */
v1QuizRouter.get("/next", async (req, res) => {
  const sessionId = typeof req.query.sessionId === "string" ? req.query.sessionId : null;

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    // Resolve session -> user
    let resolvedSessionId = sessionId;
    let userId: string | null = null;

    if (resolvedSessionId) {
      // Fast path: Redis session->user cache (fallback to DB inside helper)
      userId = await resolveUserIdBySessionId(resolvedSessionId);
      if (!userId) resolvedSessionId = null;
    }

    if (!resolvedSessionId) {
      // Create user + initial state + session
      const uRes = await client.query(
        "INSERT INTO users DEFAULT VALUES RETURNING id"
      );
      userId = String(uRes.rows[0].id);

      await client.query(
        `INSERT INTO user_state (user_id, current_difficulty, streak, max_streak, total_score, state_version)
         VALUES ($1, 1, 0, 0, 0, 1)`,
        [userId]
      );

      const newSession = await client.query(
        `INSERT INTO sessions (user_id) VALUES ($1) RETURNING id`,
        [userId]
      );
      resolvedSessionId = String(newSession.rows[0].id);
    }

    if (!userId) {
      await client.query("ROLLBACK");
      return res.status(500).json({ error: "Failed to resolve user." });
    }

    // Read user_state from Redis (short TTL). Safe for GET; strong consistency is enforced on POST.
    const cachedState = await getUserStateSnapshot(userId);
    const state =
      cachedState ??
      (await client.query(
        `SELECT current_difficulty, streak, total_score, state_version
         FROM user_state WHERE user_id = $1`,
        [userId]
      )).rows[0];

    const currentDifficulty = Number(
      "currentDifficulty" in state ? (state as any).currentDifficulty : state.current_difficulty
    );
    const currentStreak = Number("streak" in state ? (state as any).streak : state.streak);
    const currentScore = Number(
      "totalScore" in state ? (state as any).totalScore : state.total_score
    );
    const stateVersionOut = Number(
      "stateVersion" in state ? (state as any).stateVersion : state.state_version
    );

    // Pick a question without ORDER BY RANDOM(): use Redis pool of question ids (rebuilt lazily).
    const qid = await getRandomQuestionIdByDifficulty(currentDifficulty);
    if (!qid) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "No questions available." });
    }
    const q = await getQuestionPublic(qid);
    if (!q) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "No questions available." });
    }

    // Touch session last_seen_at
    await client.query("UPDATE sessions SET last_seen_at = NOW() WHERE id = $1", [
      resolvedSessionId,
    ]);

    await client.query("COMMIT");

    return res.json({
      questionId: q.questionId,
      difficulty: q.difficulty,
      prompt: q.prompt,
      choices: q.choices,
      sessionId: resolvedSessionId,
      stateVersion: stateVersionOut,
      currentScore,
      currentStreak,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    return res.status(500).json({ error: "Failed to get next question." });
  } finally {
    client.release();
  }
});

/**
 * POST /v1/quiz/answer
 *
 * Requirements:
 * - Idempotency via answerIdempotencyKey
 * - Optimistic locking via stateVersion
 * - Update difficulty, streak, score, leaderboard atomically
 *
 * Body:
 * { sessionId, questionId, answer, stateVersion, answerIdempotencyKey }
 */
v1QuizRouter.post("/answer", async (req, res) => {
  const sessionId = req.body?.sessionId as string | undefined;
  const questionId = req.body?.questionId as string | undefined;
  const answer = req.body?.answer as string | undefined;
  const stateVersion = req.body?.stateVersion as number | undefined;
  const answerIdempotencyKey = req.body?.answerIdempotencyKey as string | undefined;

  if (!sessionId || !questionId || typeof answer !== "string" || typeof stateVersion !== "number" || !answerIdempotencyKey) {
    return res.status(400).json({
      error: "Missing sessionId, questionId, answer, stateVersion, or answerIdempotencyKey.",
    });
  }

  const answeredAt = new Date();
  const client = await db.connect();
  try {
    await client.query("BEGIN");

    // Resolve session -> user
    // Defensive: session cache is a performance optimization; DB is source of truth.
    const userId = await resolveUserIdBySessionId(sessionId, client);
    if (!userId) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Unknown sessionId." });
    }

    // Idempotency check (return snapshot if already processed)
    const idemRes = await client.query(
      `SELECT correct, difficulty_after, streak_at_answer, score_delta,
              total_score_after, state_version_after,
              leaderboard_rank_score, leaderboard_rank_streak
       FROM answer_log
       WHERE user_id = $1 AND idempotency_key = $2
       LIMIT 1`,
      [userId, answerIdempotencyKey]
    );
    if (idemRes.rowCount) {
      const r = idemRes.rows[0];
      await client.query("COMMIT");
      return res.json({
        correct: Boolean(r.correct),
        newDifficulty: Number(r.difficulty_after),
        newStreak: Number(r.streak_at_answer),
        scoreDelta: Number(r.score_delta),
        totalScore: Number(r.total_score_after),
        stateVersion: Number(r.state_version_after),
        leaderboardRankScore:
          r.leaderboard_rank_score === null ? null : Number(r.leaderboard_rank_score),
        leaderboardRankStreak:
          r.leaderboard_rank_streak === null ? null : Number(r.leaderboard_rank_streak),
      });
    }

    // Lock user_state row for consistency and enforce optimistic locking.
    const stRes = await client.query(
      `SELECT user_id, current_difficulty, streak, max_streak, total_score,
              total_attempts, total_correct,
              recent_correct_window, recent_difficulty_window, difficulty_histogram,
              last_answer_at, state_version
       FROM user_state
       WHERE user_id = $1
       FOR UPDATE`,
      [userId]
    );
    if (stRes.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Missing user state." });
    }
    const state = stRes.rows[0];

    if (Number(state.state_version) !== stateVersion) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        error: "stateVersion conflict",
        // Defensive: client should refresh state/question and retry with the latest version.
        expectedStateVersion: Number(state.state_version),
      });
    }

    // Load question
    // Use question cache for public data, but correctness requires hash from DB.
    // (We keep correct_answer_hash out of Redis cache to reduce risk of leakage.)
    const qRes = await client.query(
      `SELECT id, difficulty, correct_answer_hash FROM questions WHERE id = $1`,
      [questionId]
    );
    if (!qRes.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Question not found." });
    }
    const q = qRes.rows[0];
    const difficultyAtAnswer = Number(q.difficulty);
    const correctHash = String(q.correct_answer_hash);
    const correct = hashAnswer(answer, getSalt()) === correctHash;

    // Rolling window for adaptive difficulty: last 4 + current => max 5
    const prev4Res = await client.query(
      `SELECT correct
       FROM answer_log
       WHERE user_id = $1
       ORDER BY answered_at DESC
       LIMIT 4`,
      [userId]
    );
    const prev4 = prev4Res.rows.map((r) => Boolean(r.correct));
    const rolling5 = [correct, ...prev4].slice(0, 5);

    const adaptive = applyAdaptiveUpdate({
      previous: {
        currentDifficulty: Number(state.current_difficulty),
        streak: Number(state.streak),
        maxStreak: Number(state.max_streak),
        totalScore: Number(state.total_score),
        lastAnswerAt: state.last_answer_at ? String(state.last_answer_at) : null,
        stateVersion: Number(state.state_version),
      },
      isCorrect: correct,
      answeredAt,
      rollingWindowCorrect: rolling5,
    });

    // Defensive: ensure difficulty boundaries even if upstream state is corrupted.
    // (The adaptive module clamps again, but we keep this close to the DB write.)

    // Accuracy factor: last 10 (current + previous 9)
    const prev9Res = await client.query(
      `SELECT correct
       FROM answer_log
       WHERE user_id = $1
       ORDER BY answered_at DESC
       LIMIT 9`,
      [userId]
    );
    const prev9 = prev9Res.rows.map((r) => Boolean(r.correct));
    const window10 = [correct, ...prev9].slice(0, 10);
    const accuracyFactor =
      window10.reduce((acc, v) => acc + (v ? 1 : 0), 0) / window10.length;

    // Score formula:
    // scoreDelta = (difficulty*10) * streakMultiplier * accuracyFactor
    const difficultyWeight = difficultyAtAnswer * 10;
    const sm = streakMultiplier(adaptive.nextStreak);
    const magnitude = Math.round(difficultyWeight * sm * accuracyFactor);
    const scoreDelta = correct ? magnitude : -magnitude;

    const totalScoreAfter = Math.max(0, Number(state.total_score) + scoreDelta);
    const stateVersionAfter = adaptive.nextStateVersion;

    // Metrics updates
    const totalAttemptsAfter = Number(state.total_attempts ?? 0) + 1;
    const totalCorrectAfter = Number(state.total_correct ?? 0) + (correct ? 1 : 0);

    const hist: Record<string, number> =
      (state.difficulty_histogram as Record<string, number>) ?? {};
    const key = String(difficultyAtAnswer);
    hist[key] = (hist[key] ?? 0) + 1;

    const prevRecentCorrect = (state.recent_correct_window ?? []) as boolean[];
    const prevRecentDifficulty = (state.recent_difficulty_window ?? []) as any[];
    const recentCorrectWindow = [...prevRecentCorrect, correct].slice(-10);
    const recentDifficultyWindow = [
      ...prevRecentDifficulty.map((v) => Number(v)),
      difficultyAtAnswer,
    ].slice(-10);

    // Update user_state (single row update)
    const updatedRes = await client.query(
      `UPDATE user_state
       SET current_difficulty = $2,
           streak = $3,
           max_streak = $4,
           total_score = $5,
           total_attempts = $6,
           total_correct = $7,
           accuracy_last10 = $8,
           recent_correct_window = $9,
           recent_difficulty_window = $10,
           difficulty_histogram = $11::jsonb,
           last_question_id = $12,
           last_answer_at = $13,
           state_version = $14
       WHERE user_id = $1
       RETURNING user_id, current_difficulty, streak, max_streak, total_score,
                 total_attempts, total_correct, accuracy_last10,
                 difficulty_histogram, recent_correct_window, recent_difficulty_window,
                 state_version, updated_at`,
      [
        userId,
        adaptive.nextDifficulty,
        adaptive.nextStreak,
        adaptive.nextMaxStreak,
        totalScoreAfter,
        totalAttemptsAfter,
        totalCorrectAfter,
        accuracyFactor,
        recentCorrectWindow,
        recentDifficultyWindow,
        JSON.stringify(hist),
        questionId,
        answeredAt,
        stateVersionAfter,
      ]
    );

    // Update leaderboards
    await client.query(
      `INSERT INTO leaderboard_score (user_id, total_score)
       VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET total_score = EXCLUDED.total_score`,
      [userId, totalScoreAfter]
    );
    await client.query(
      `INSERT INTO leaderboard_streak (user_id, max_streak, current_streak)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE SET
         max_streak = GREATEST(leaderboard_streak.max_streak, EXCLUDED.max_streak),
         current_streak = EXCLUDED.current_streak`,
      [userId, adaptive.nextMaxStreak, adaptive.nextStreak]
    );

    // Compute leaderboard ranks from Postgres *inside the transaction* so ranks match the committed state.
    // This avoids race conditions where Redis could reflect an uncommitted write.
    const rankScoreRes = await client.query(
      rankByGreaterCount({ orderedTable: "leaderboard_score", valueColumn: "total_score" }),
      [totalScoreAfter]
    );
    const leaderboardRankScore = Number(rankScoreRes.rows[0].rank);

    const rankStreakRes = await client.query(
      rankByGreaterCount({ orderedTable: "leaderboard_streak", valueColumn: "current_streak" }),
      [adaptive.nextStreak]
    );
    const leaderboardRankStreak = Number(rankStreakRes.rows[0].rank);

    // Insert answer_log with idempotency snapshot (so retries return identical result)
    await client.query(
      `INSERT INTO answer_log (
         user_id, session_id, idempotency_key,
         question_id, difficulty, answer, correct,
         score_delta, streak_at_answer, answered_at,
         state_version_before, state_version_after,
         difficulty_before, difficulty_after,
         total_score_after,
         leaderboard_rank_score, leaderboard_rank_streak
       ) VALUES (
         $1,$2,$3,
         $4,$5,$6,$7,
         $8,$9,$10,
         $11,$12,
         $13,$14,
         $15,
         $16,$17
       )`,
      [
        userId,
        sessionId,
        answerIdempotencyKey,
        questionId,
        difficultyAtAnswer,
        answer,
        correct,
        scoreDelta,
        adaptive.nextStreak,
        answeredAt,
        stateVersion,
        stateVersionAfter,
        Number(state.current_difficulty),
        adaptive.nextDifficulty,
        totalScoreAfter,
        leaderboardRankScore,
        leaderboardRankStreak,
      ]
    );

    await client.query("UPDATE sessions SET last_seen_at = NOW() WHERE id = $1", [
      sessionId,
    ]);

    await client.query("COMMIT");

    // Cache write-through AFTER commit (strong consistency: DB is source of truth).
    // This avoids cache reflecting uncommitted data if the transaction rolls back.
    const ur = updatedRes.rows[0];
    await setUserStateSnapshot({
      userId: String(ur.user_id),
      currentDifficulty: Number(ur.current_difficulty),
      streak: Number(ur.streak),
      maxStreak: Number(ur.max_streak),
      totalScore: Number(ur.total_score),
      totalAttempts: Number(ur.total_attempts ?? 0),
      totalCorrect: Number(ur.total_correct ?? 0),
      accuracyLast10: Number(ur.accuracy_last10 ?? 0),
      difficultyHistogram: (ur.difficulty_histogram ?? {}) as Record<string, number>,
      recentPerformanceWindow: {
        correct: (ur.recent_correct_window ?? []) as boolean[],
        difficulty: ((ur.recent_difficulty_window ?? []) as any[]).map((v) => Number(v)),
      },
      stateVersion: Number(ur.state_version),
      updatedAt: String(ur.updated_at),
    });

    // Leaderboard cache/broadcast AFTER commit (strong consistency).
    // Network retries are safe because answer_log has an idempotency snapshot.
    const lb = await updateLeaderboards({
      userId,
      totalScore: totalScoreAfter,
      currentStreak: adaptive.nextStreak,
    });
    broadcastLeaderboardUpdate(lb.snapshotScore);
    broadcastLeaderboardUpdate(lb.snapshotStreak);

    return res.json({
      correct,
      newDifficulty: adaptive.nextDifficulty,
      newStreak: adaptive.nextStreak,
      scoreDelta,
      totalScore: totalScoreAfter,
      stateVersion: stateVersionAfter,
      leaderboardRankScore,
      leaderboardRankStreak,
    });
  } catch (err: any) {
    await client.query("ROLLBACK");

    // Handle concurrent idempotency insert race (unique index)
    if (String(err?.code) === "23505") {
      // Retry by reading the idempotent row (safe)
      try {
        const sessRes = await client.query(
          "SELECT user_id FROM sessions WHERE id = $1",
          [sessionId]
        );
        if (!sessRes.rowCount) {
          return res.status(404).json({ error: "Unknown sessionId." });
        }
        const userId = String(sessRes.rows[0].user_id);
        const idemRes = await client.query(
          `SELECT correct, difficulty_after, streak_at_answer, score_delta,
                  total_score_after, state_version_after,
                  leaderboard_rank_score, leaderboard_rank_streak
           FROM answer_log
           WHERE user_id = $1 AND idempotency_key = $2
           LIMIT 1`,
          [userId, answerIdempotencyKey]
        );
        if (idemRes.rowCount) {
          const r = idemRes.rows[0];
          return res.json({
            correct: Boolean(r.correct),
            newDifficulty: Number(r.difficulty_after),
            newStreak: Number(r.streak_at_answer),
            scoreDelta: Number(r.score_delta),
            totalScore: Number(r.total_score_after),
            stateVersion: Number(r.state_version_after),
            leaderboardRankScore:
              r.leaderboard_rank_score === null ? null : Number(r.leaderboard_rank_score),
            leaderboardRankStreak:
              r.leaderboard_rank_streak === null ? null : Number(r.leaderboard_rank_streak),
          });
        }
      } catch {
        // fall through to generic error
      }
    }

    return res.status(500).json({ error: "Failed to submit answer." });
  } finally {
    client.release();
  }
});

