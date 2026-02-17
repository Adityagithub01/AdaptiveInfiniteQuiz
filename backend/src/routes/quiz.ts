import { Router } from "express";
import { db } from "../config/database";
import { ql } from "../db/queryLayer";
import { hashAnswer } from "../utils/hash";
import { applyAdaptiveUpdate } from "../services/adaptiveDifficulty";

export const quizRouter = Router();

function getSalt(): string {
  return process.env.QUIZ_ANSWER_SALT || "dev-salt-change-me";
}

function streakMultiplier(streakAtAnswer: number): number {
  // PSEUDOCODE:
  // if streak 1-2 -> 1.0
  // else if 3-5 -> 1.5
  // else (6+) -> 2.0 (cap)
  if (streakAtAnswer <= 2) return 1.0;
  if (streakAtAnswer <= 5) return 1.5;
  return 2.0;
}

/**
 * GET /quiz/next
 * Returns a random question at the user's current difficulty.
 *
 * Query params:
 * - userId (optional): if missing, a new user + state is created.
 */
quizRouter.get("/next", async (req, res) => {
  const userIdRaw = typeof req.query.userId === "string" ? req.query.userId : null;

  try {
    let userId = userIdRaw;
    if (!userId) {
      const user = await ql.createUser();
      userId = user.id;
      await ql.upsertUserState({
        userId,
        currentDifficulty: 1,
        streak: 0,
        maxStreak: 0,
        totalScore: 0,
        lastQuestionId: null,
        lastAnswerAt: null,
        stateVersion: 1,
      });
    }

    const state = await ql.getUserState(userId);
    if (!state) {
      // If a user exists without state, initialize.
      await ql.upsertUserState({
        userId,
        currentDifficulty: 1,
        streak: 0,
        maxStreak: 0,
        totalScore: 0,
        lastQuestionId: null,
        lastAnswerAt: null,
        stateVersion: 1,
      });
    }
    const freshState = (await ql.getUserState(userId))!;

    const question = await ql.getRandomQuestion({ difficulty: freshState.currentDifficulty });
    if (!question) {
      return res.status(404).json({ error: "No questions available for this difficulty." });
    }

    // Do NOT send correctAnswerHash to client.
    return res.json({
      userId,
      state: {
        currentDifficulty: freshState.currentDifficulty,
        streak: freshState.streak,
        maxStreak: freshState.maxStreak,
        totalScore: freshState.totalScore,
        accuracyLast10: freshState.accuracyLast10,
        accuracyOverall:
          freshState.totalAttempts > 0
            ? freshState.totalCorrect / freshState.totalAttempts
            : 0,
        difficultyHistogram: freshState.difficultyHistogram,
        recentPerformanceWindow: {
          correct: freshState.recentCorrectWindow,
          difficulty: freshState.recentDifficultyWindow,
        },
      },
      question: {
        id: question.id,
        difficulty: question.difficulty,
        prompt: question.prompt,
        choices: question.choices,
        tags: question.tags,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch next question." });
  }
});

/**
 * POST /quiz/answer
 * Body: { userId, questionId, answer }
 *
 * Applies:
 * - streak tracking + max streak
 * - streak decay after 24h inactivity
 * - adaptive difficulty update with stability rules:
 *   - min streak gate (2 correct) for increases
 *   - rolling window last 5 answers thresholds
 *   - clamp difficulty 1..10
 */
quizRouter.post("/answer", async (req, res) => {
  const userId = req.body?.userId as string | undefined;
  const questionId = req.body?.questionId as string | undefined;
  const answer = req.body?.answer as string | undefined;

  if (!userId || !questionId || typeof answer !== "string") {
    return res.status(400).json({ error: "Missing userId, questionId, or answer." });
  }

  const answeredAt = new Date();

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const qRes = await client.query(
      `SELECT id, difficulty, prompt, choices, correct_answer_hash, tags, created_at
       FROM questions WHERE id = $1`,
      [questionId]
    );
    if (qRes.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Question not found." });
    }
    const questionRow = qRes.rows[0];
    const correctAnswerHash = String(questionRow.correct_answer_hash);
    const difficultyAtAnswer = Number(questionRow.difficulty);

    const submittedHash = hashAnswer(answer, getSalt());
    const correct = submittedHash === correctAnswerHash;

    // Ensure state exists (idempotent)
    await client.query(
      `INSERT INTO user_state (user_id, current_difficulty, streak, max_streak, total_score, state_version)
       VALUES ($1, 1, 0, 0, 0, 1)
       ON CONFLICT (user_id) DO NOTHING`,
      [userId]
    );

    // Strong consistency: lock user_state row while computing score + updating metrics.
    const sRes = await client.query(
      `SELECT user_id, current_difficulty, streak, max_streak, total_score,
              total_attempts, total_correct, accuracy_last10,
              recent_correct_window, recent_difficulty_window, difficulty_histogram,
              last_question_id, last_answer_at, state_version, updated_at
       FROM user_state
       WHERE user_id = $1
       FOR UPDATE`,
      [userId]
    );
    const stateRow = sRes.rows[0];

    // Fetch last 9 answers so that (last 9 + current) = last 10 window.
    const recentRes = await client.query(
      `SELECT correct
       FROM answer_log
       WHERE user_id = $1
       ORDER BY answered_at DESC
       LIMIT 9`,
      [userId]
    );
    const prevCorrect = recentRes.rows.map((r) => Boolean(r.correct));

    // Rolling window (for adaptive difficulty stability): last 4 + current => max 5 answers.
    const rollingWindowCorrect = [correct, ...prevCorrect.slice(0, 4)].slice(0, 5);

    // Accuracy factor: percentage correct in last 10 answers (including current).
    // PSEUDOCODE:
    // window10 = [current] + last9Previous
    // accuracyFactor = countTrue(window10) / len(window10)
    const window10 = [correct, ...prevCorrect].slice(0, 10);
    const accuracyFactor =
      window10.length === 0
        ? 0
        : window10.reduce((acc, v) => acc + (v ? 1 : 0), 0) / window10.length;

    const adaptive = applyAdaptiveUpdate({
      previous: {
        currentDifficulty: Number(stateRow.current_difficulty),
        streak: Number(stateRow.streak),
        maxStreak: Number(stateRow.max_streak),
        totalScore: Number(stateRow.total_score),
        lastAnswerAt: stateRow.last_answer_at ? String(stateRow.last_answer_at) : null,
        stateVersion: Number(stateRow.state_version),
      },
      isCorrect: correct,
      answeredAt,
      rollingWindowCorrect,
    });

    // Scoring formula
    //
    // scoreDelta = difficultyWeight × streakMultiplier × accuracyFactor
    //
    // where:
    // - difficultyWeight = difficulty × 10
    // - streakMultiplier:
    //     1–2 streak => 1x
    //     3–5 streak => 1.5x
    //     6+ streak  => 2x (cap)
    // - accuracyFactor: percentage correct in last 10 answers (incl. current), range 0..1
    //
    // Note: wrong answers apply the same magnitude as a negative delta.
    const difficultyWeight = difficultyAtAnswer * 10;
    const sm = streakMultiplier(adaptive.nextStreak);
    const raw = difficultyWeight * sm * accuracyFactor;
    const magnitude = Math.round(raw);
    const scoreDelta = correct ? magnitude : -magnitude;

    const nextTotalScore = Math.max(0, Number(stateRow.total_score) + scoreDelta);

    // Track accuracy + histogram + recent windows in user_state.
    const nextTotalAttempts = Number(stateRow.total_attempts ?? 0) + 1;
    const nextTotalCorrect = Number(stateRow.total_correct ?? 0) + (correct ? 1 : 0);
    const accuracyOverall =
      nextTotalAttempts > 0 ? nextTotalCorrect / nextTotalAttempts : 0;

    // Difficulty histogram
    // PSEUDOCODE:
    // hist = existing or {}
    // hist[difficultyAtAnswer] += 1
    const hist: Record<string, number> =
      (stateRow.difficulty_histogram as Record<string, number>) ?? {};
    const key = String(difficultyAtAnswer);
    hist[key] = (hist[key] ?? 0) + 1;

    // Recent performance window (max 10)
    // PSEUDOCODE:
    // recentCorrect = (prevWindow + [correct]).takeLast(10)
    // recentDifficulty = (prevWindow + [difficultyAtAnswer]).takeLast(10)
    const prevRecentCorrect = (stateRow.recent_correct_window ?? []) as boolean[];
    const prevRecentDifficulty = (stateRow.recent_difficulty_window ?? []) as any[];
    const recentCorrectWindow = [...prevRecentCorrect, correct].slice(-10);
    const recentDifficultyWindow = [
      ...prevRecentDifficulty.map((v) => Number(v)),
      difficultyAtAnswer,
    ].slice(-10);

    // Append answer log
    await client.query(
      `INSERT INTO answer_log (
         user_id, question_id, difficulty, answer, correct, score_delta, streak_at_answer, answered_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [userId, questionId, difficultyAtAnswer, answer, correct, scoreDelta, adaptive.nextStreak, answeredAt]
    );

    // Update user_state
    const upRes = await client.query(
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
                 recent_correct_window, recent_difficulty_window, difficulty_histogram,
                 last_question_id, last_answer_at, state_version, updated_at`,
      [
        userId,
        adaptive.nextDifficulty,
        adaptive.nextStreak,
        adaptive.nextMaxStreak,
        nextTotalScore,
        nextTotalAttempts,
        nextTotalCorrect,
        accuracyFactor,
        recentCorrectWindow,
        recentDifficultyWindow,
        JSON.stringify(hist),
        questionId,
        answeredAt,
        adaptive.nextStateVersion,
      ]
    );

    // Update leaderboards (DB materialized tables)
    await client.query(
      `INSERT INTO leaderboard_score (user_id, total_score)
       VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET total_score = EXCLUDED.total_score`,
      [userId, nextTotalScore]
    );
    await client.query(
      `INSERT INTO leaderboard_streak (user_id, max_streak)
       VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET max_streak = EXCLUDED.max_streak`,
      [userId, adaptive.nextMaxStreak]
    );

    await client.query("COMMIT");

    const updated = upRes.rows[0];
    return res.json({
      correct,
      difficultyAtAnswer,
      scoreDelta,
      totalScore: Number(updated.total_score),
      streak: Number(updated.streak),
      maxStreak: Number(updated.max_streak),
      nextDifficulty: Number(updated.current_difficulty),
      accuracy: {
        last10: Number(updated.accuracy_last10),
        overall: accuracyOverall,
        windowSize: window10.length,
      },
      difficultyHistogram: updated.difficulty_histogram,
      recentPerformanceWindow: {
        correct: updated.recent_correct_window,
        difficulty: updated.recent_difficulty_window,
      },
      rollingWindow: {
        size: rollingWindowCorrect.length,
        correctRate: adaptive.rollingCorrectRate,
        values: rollingWindowCorrect,
      },
      decision: {
        delta: adaptive.difficultyDelta,
        reason: adaptive.difficultyReason,
      },
      scoringBreakdown: {
        difficultyWeight,
        streakMultiplier: sm,
        accuracyFactor,
        raw,
        magnitude,
      },
    });
  } catch (err) {
    await client.query("ROLLBACK");
    return res.status(500).json({ error: "Failed to submit answer." });
  } finally {
    client.release();
  }
});

