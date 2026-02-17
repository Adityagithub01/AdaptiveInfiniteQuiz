import { redisClient } from "../config/redis";
import { redisKeys } from "./cache/keys";
import type { PoolClient } from "pg";
import { db } from "../config/database";

function ttlSeconds(): number {
  return Number(process.env.SESSION_USER_TTL_SECONDS ?? 3600);
}

/**
 * Stateless-session optimization:
 * - The backend remains stateless (no in-memory session store required).
 * - We resolve sessionId->userId via Redis (fast), falling back to Postgres.
 */
export async function resolveUserIdBySessionId(
  sessionId: string,
  client?: PoolClient
): Promise<string | null> {
  const cached = await redisClient.get(redisKeys.sessionUser(sessionId));
  if (cached) return cached;

  const res = client
    ? await client.query("SELECT user_id FROM sessions WHERE id = $1", [sessionId])
    : await db.query("SELECT user_id FROM sessions WHERE id = $1", [sessionId]);
  if (!res.rowCount) return null;
  const userId = String(res.rows[0].user_id);

  await redisClient.setEx(redisKeys.sessionUser(sessionId), ttlSeconds(), userId);
  return userId;
}

