import { db } from "../config/database";
import { redisClient } from "../config/redis";
import { redisKeys } from "./cache/keys";
import { getJson, setJson } from "./cache/jsonCache";

export type UserStateSnapshot = {
  userId: string;
  currentDifficulty: number;
  streak: number;
  maxStreak: number;
  totalScore: number;
  totalAttempts: number;
  totalCorrect: number;
  accuracyLast10: number;
  difficultyHistogram: Record<string, number>;
  recentPerformanceWindow: {
    correct: boolean[];
    difficulty: number[];
  };
  stateVersion: number;
  updatedAt: string;
};

function ttlSeconds(): number {
  return Number(process.env.USER_STATE_TTL_SECONDS ?? 15);
}

export async function getUserStateSnapshot(userId: string): Promise<UserStateSnapshot | null> {
  const cached = await getJson<UserStateSnapshot>(redisKeys.userState(userId));
  if (cached) return cached;

  const res = await db.query(
    `SELECT user_id, current_difficulty, streak, max_streak, total_score,
            total_attempts, total_correct, accuracy_last10,
            difficulty_histogram, recent_correct_window, recent_difficulty_window,
            state_version, updated_at
     FROM user_state
     WHERE user_id = $1`,
    [userId]
  );
  if (!res.rowCount) return null;
  const row = res.rows[0];

  const snapshot: UserStateSnapshot = {
    userId: String(row.user_id),
    currentDifficulty: Number(row.current_difficulty),
    streak: Number(row.streak),
    maxStreak: Number(row.max_streak),
    totalScore: Number(row.total_score),
    totalAttempts: Number(row.total_attempts ?? 0),
    totalCorrect: Number(row.total_correct ?? 0),
    accuracyLast10: Number(row.accuracy_last10 ?? 0),
    difficultyHistogram: (row.difficulty_histogram ?? {}) as Record<string, number>,
    recentPerformanceWindow: {
      correct: (row.recent_correct_window ?? []) as boolean[],
      difficulty: ((row.recent_difficulty_window ?? []) as any[]).map((v) => Number(v)),
    },
    stateVersion: Number(row.state_version),
    updatedAt: String(row.updated_at),
  };

  await setJson(redisKeys.userState(userId), snapshot, ttlSeconds());
  return snapshot;
}

export async function setUserStateSnapshot(snapshot: UserStateSnapshot): Promise<void> {
  await setJson(redisKeys.userState(snapshot.userId), snapshot, ttlSeconds());
}

export async function invalidateUserStateSnapshot(userId: string): Promise<void> {
  await redisClient.del(redisKeys.userState(userId));
}

