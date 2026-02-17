import { db } from "../config/database";
import type {
  AnswerLogEntry,
  LeaderboardScoreRow,
  LeaderboardStreakRow,
  Question,
  User,
  UserState,
  UUID,
} from "../models/db";

function mapUser(row: any): User {
  return { id: row.id, createdAt: row.created_at };
}

function mapQuestion(row: any): Question {
  return {
    id: row.id,
    difficulty: Number(row.difficulty),
    prompt: row.prompt,
    choices: row.choices,
    correctAnswerHash: row.correct_answer_hash,
    tags: row.tags ?? [],
    createdAt: row.created_at,
  };
}

function mapUserState(row: any): UserState {
  return {
    userId: row.user_id,
    currentDifficulty: Number(row.current_difficulty),
    streak: Number(row.streak),
    maxStreak: Number(row.max_streak),
    totalScore: Number(row.total_score),
    totalAttempts: Number(row.total_attempts ?? 0),
    totalCorrect: Number(row.total_correct ?? 0),
    accuracyLast10: Number(row.accuracy_last10 ?? 0),
    recentCorrectWindow: (row.recent_correct_window ?? []) as boolean[],
    recentDifficultyWindow: ((row.recent_difficulty_window ?? []) as any[]).map((v) =>
      Number(v)
    ),
    difficultyHistogram: (row.difficulty_histogram ?? {}) as Record<string, number>,
    lastQuestionId: row.last_question_id,
    lastAnswerAt: row.last_answer_at,
    stateVersion: Number(row.state_version),
    updatedAt: row.updated_at,
  };
}

function mapAnswerLog(row: any): AnswerLogEntry {
  return {
    id: Number(row.id),
    userId: row.user_id,
    questionId: row.question_id,
    difficulty: Number(row.difficulty),
    answer: row.answer,
    correct: Boolean(row.correct),
    scoreDelta: Number(row.score_delta),
    streakAtAnswer: Number(row.streak_at_answer),
    answeredAt: row.answered_at,
  };
}

export const ql = {
  // USERS
  async createUser(): Promise<User> {
    const res = await db.query(
      "INSERT INTO users DEFAULT VALUES RETURNING id, created_at"
    );
    return mapUser(res.rows[0]);
  },

  async getUserById(id: UUID): Promise<User | null> {
    const res = await db.query("SELECT id, created_at FROM users WHERE id = $1", [
      id,
    ]);
    return res.rowCount ? mapUser(res.rows[0]) : null;
  },

  // QUESTIONS
  async insertQuestion(input: {
    difficulty: number;
    prompt: string;
    choices: string[];
    correctAnswerHash: string;
    tags: string[];
  }): Promise<Question> {
    const res = await db.query(
      `INSERT INTO questions (difficulty, prompt, choices, correct_answer_hash, tags)
       VALUES ($1, $2, $3::jsonb, $4, $5::text[])
       RETURNING id, difficulty, prompt, choices, correct_answer_hash, tags, created_at`,
      [
        input.difficulty,
        input.prompt,
        JSON.stringify(input.choices),
        input.correctAnswerHash,
        input.tags,
      ]
    );
    return mapQuestion(res.rows[0]);
  },

  async countQuestions(): Promise<number> {
    const res = await db.query("SELECT COUNT(*)::int AS count FROM questions");
    return Number(res.rows[0]?.count ?? 0);
  },

  async getQuestionById(id: UUID): Promise<Question | null> {
    const res = await db.query(
      `SELECT id, difficulty, prompt, choices, correct_answer_hash, tags, created_at
       FROM questions WHERE id = $1`,
      [id]
    );
    return res.rowCount ? mapQuestion(res.rows[0]) : null;
  },

  async getRandomQuestion(opts: {
    difficulty?: number;
    tagsAnyOf?: string[];
  }): Promise<Question | null> {
    const params: any[] = [];
    const where: string[] = [];

    if (typeof opts.difficulty === "number") {
      params.push(opts.difficulty);
      where.push(`difficulty = $${params.length}`);
    }
    if (opts.tagsAnyOf && opts.tagsAnyOf.length > 0) {
      params.push(opts.tagsAnyOf);
      where.push(`tags && $${params.length}::text[]`);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const res = await db.query(
      `SELECT id, difficulty, prompt, choices, correct_answer_hash, tags, created_at
       FROM questions
       ${whereSql}
       ORDER BY RANDOM()
       LIMIT 1`,
      params
    );
    return res.rowCount ? mapQuestion(res.rows[0]) : null;
  },

  // USER STATE
  async upsertUserState(input: {
    userId: UUID;
    currentDifficulty: number;
    streak: number;
    maxStreak: number;
    totalScore: number;
    lastQuestionId: UUID | null;
    lastAnswerAt: string | null;
    stateVersion: number;
  }): Promise<UserState> {
    const res = await db.query(
      `INSERT INTO user_state (
          user_id, current_difficulty, streak, max_streak, total_score,
          last_question_id, last_answer_at, state_version
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT (user_id) DO UPDATE SET
          current_difficulty = EXCLUDED.current_difficulty,
          streak = EXCLUDED.streak,
          max_streak = EXCLUDED.max_streak,
          total_score = EXCLUDED.total_score,
          last_question_id = EXCLUDED.last_question_id,
          last_answer_at = EXCLUDED.last_answer_at,
          state_version = EXCLUDED.state_version
        RETURNING user_id, current_difficulty, streak, max_streak, total_score,
                  total_attempts, total_correct, accuracy_last10,
                  recent_correct_window, recent_difficulty_window, difficulty_histogram,
                  last_question_id, last_answer_at, state_version, updated_at`,
      [
        input.userId,
        input.currentDifficulty,
        input.streak,
        input.maxStreak,
        input.totalScore,
        input.lastQuestionId,
        input.lastAnswerAt,
        input.stateVersion,
      ]
    );
    return mapUserState(res.rows[0]);
  },

  async getUserState(userId: UUID): Promise<UserState | null> {
    const res = await db.query(
      `SELECT user_id, current_difficulty, streak, max_streak, total_score,
              total_attempts, total_correct, accuracy_last10,
              recent_correct_window, recent_difficulty_window, difficulty_histogram,
              last_question_id, last_answer_at, state_version, updated_at
       FROM user_state WHERE user_id = $1`,
      [userId]
    );
    return res.rowCount ? mapUserState(res.rows[0]) : null;
  },

  // ANSWER LOG
  async insertAnswerLog(input: {
    userId: UUID;
    questionId: UUID;
    difficulty: number;
    answer: string;
    correct: boolean;
    scoreDelta: number;
    streakAtAnswer: number;
    answeredAt?: string; // optional override
  }): Promise<AnswerLogEntry> {
    const res = await db.query(
      `INSERT INTO answer_log (
          user_id, question_id, difficulty, answer, correct,
          score_delta, streak_at_answer, answered_at
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,COALESCE($8::timestamptz, NOW()))
        RETURNING id, user_id, question_id, difficulty, answer, correct,
                  score_delta, streak_at_answer, answered_at`,
      [
        input.userId,
        input.questionId,
        input.difficulty,
        input.answer,
        input.correct,
        input.scoreDelta,
        input.streakAtAnswer,
        input.answeredAt ?? null,
      ]
    );
    return mapAnswerLog(res.rows[0]);
  },

  // LEADERBOARDS
  async upsertLeaderboardScore(userId: UUID, totalScore: number): Promise<LeaderboardScoreRow> {
    const res = await db.query(
      `INSERT INTO leaderboard_score (user_id, total_score)
       VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET total_score = EXCLUDED.total_score
       RETURNING user_id, total_score, updated_at`,
      [userId, totalScore]
    );
    return {
      userId: res.rows[0].user_id,
      totalScore: Number(res.rows[0].total_score),
      updatedAt: res.rows[0].updated_at,
    };
  },

  async upsertLeaderboardStreak(userId: UUID, maxStreak: number): Promise<LeaderboardStreakRow> {
    const res = await db.query(
      `INSERT INTO leaderboard_streak (user_id, max_streak)
       VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET max_streak = EXCLUDED.max_streak
       RETURNING user_id, max_streak, updated_at`,
      [userId, maxStreak]
    );
    return {
      userId: res.rows[0].user_id,
      maxStreak: Number(res.rows[0].max_streak),
      updatedAt: res.rows[0].updated_at,
    };
  },
};

