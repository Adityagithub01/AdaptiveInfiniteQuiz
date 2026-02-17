import { redisClient } from "../config/redis";
import { db } from "../config/database";

export type LeaderboardType = "score" | "streak";

export interface LeaderboardEntry {
  userId: string;
  value: number;
  rank: number; // 1-based
}

export interface LeaderboardSnapshot {
  type: LeaderboardType;
  updatedAt: string; // ISO
  limit: number;
  entries: LeaderboardEntry[];
}

function zsetKey(type: LeaderboardType): string {
  return type === "score" ? "leaderboard:score" : "leaderboard:streak";
}

function snapshotKey(type: LeaderboardType, limit: number): string {
  return `leaderboard:snapshot:${type}:${limit}`;
}

function snapshotTtlSeconds(): number {
  return Number(process.env.LEADERBOARD_SNAPSHOT_TTL_SECONDS ?? 5);
}

function defaultLimit(): number {
  return Number(process.env.LEADERBOARD_SNAPSHOT_LIMIT ?? 25);
}

async function buildSnapshotFromRedis(type: LeaderboardType, limit: number): Promise<LeaderboardSnapshot> {
  const key = zsetKey(type);
  const top = await redisClient.zRangeWithScores(key, 0, limit - 1, { REV: true });
  const entries: LeaderboardEntry[] = top.map((it, idx) => ({
    userId: it.value,
    value: Number(it.score),
    rank: idx + 1,
  }));
  return {
    type,
    updatedAt: new Date().toISOString(),
    limit,
    entries,
  };
}

async function warmRedisFromDbIfEmpty(type: LeaderboardType): Promise<void> {
  const key = zsetKey(type);
  const size = await redisClient.zCard(key);
  if (size > 0) return;

  // Fallback source of truth:
  // - score leaderboard: leaderboard_score table
  // - streak leaderboard: current streak from user_state
  const rows =
    type === "score"
      ? (
          await db.query(
            `SELECT user_id, total_score
             FROM leaderboard_score
             ORDER BY total_score DESC, updated_at DESC
             LIMIT 1000`
          )
        ).rows.map((r) => ({ userId: String(r.user_id), value: Number(r.total_score) }))
      : (
          await db.query(
            `SELECT user_id, streak
             FROM user_state
             ORDER BY streak DESC, updated_at DESC
             LIMIT 1000`
          )
        ).rows.map((r) => ({ userId: String(r.user_id), value: Number(r.streak) }));

  if (rows.length === 0) return;

  // Bulk insert
  await redisClient.zAdd(
    key,
    rows.map((r) => ({ score: r.value, value: r.userId }))
  );
}

export async function getLeaderboardSnapshot(params: {
  type: LeaderboardType;
  limit?: number;
  userId?: string;
}): Promise<{ snapshot: LeaderboardSnapshot; userRank: number | null }> {
  const type = params.type;
  const limit = params.limit ?? defaultLimit();
  const sKey = snapshotKey(type, limit);

  await warmRedisFromDbIfEmpty(type);

  // Try cached snapshot
  const cached = await redisClient.get(sKey);
  let snapshot: LeaderboardSnapshot;
  if (cached) {
    snapshot = JSON.parse(cached) as LeaderboardSnapshot;
  } else {
    snapshot = await buildSnapshotFromRedis(type, limit);
    await redisClient.setEx(sKey, snapshotTtlSeconds(), JSON.stringify(snapshot));
  }

  let userRank: number | null = null;
  if (params.userId) {
    const r = await redisClient.zRevRank(zsetKey(type), params.userId);
    userRank = r === null ? null : Number(r) + 1;
  }

  return { snapshot, userRank };
}

export async function updateLeaderboards(params: {
  userId: string;
  totalScore: number;
  currentStreak: number;
  limit?: number;
}): Promise<{
  rankScore: number | null;
  rankStreak: number | null;
  snapshotScore: LeaderboardSnapshot;
  snapshotStreak: LeaderboardSnapshot;
}> {
  const limit = params.limit ?? defaultLimit();

  // Update zsets
  await redisClient.zAdd(zsetKey("score"), { score: params.totalScore, value: params.userId });
  await redisClient.zAdd(zsetKey("streak"), { score: params.currentStreak, value: params.userId });

  // Ranks (1-based)
  const rScore = await redisClient.zRevRank(zsetKey("score"), params.userId);
  const rStreak = await redisClient.zRevRank(zsetKey("streak"), params.userId);

  const rankScore = rScore === null ? null : Number(rScore) + 1;
  const rankStreak = rStreak === null ? null : Number(rStreak) + 1;

  // Refresh cached snapshots (write-through cache)
  const snapshotScore = await buildSnapshotFromRedis("score", limit);
  const snapshotStreak = await buildSnapshotFromRedis("streak", limit);

  await redisClient.setEx(
    snapshotKey("score", limit),
    snapshotTtlSeconds(),
    JSON.stringify(snapshotScore)
  );
  await redisClient.setEx(
    snapshotKey("streak", limit),
    snapshotTtlSeconds(),
    JSON.stringify(snapshotStreak)
  );

  return { rankScore, rankStreak, snapshotScore, snapshotStreak };
}

