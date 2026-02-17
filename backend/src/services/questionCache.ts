import { db } from "../config/database";
import { redisClient } from "../config/redis";
import { redisKeys } from "./cache/keys";
import { getJson, setJson } from "./cache/jsonCache";

export type QuestionPublic = {
  questionId: string;
  difficulty: number;
  prompt: string;
  choices: string[];
};

function poolTtlSeconds(): number {
  return Number(process.env.QUESTION_POOL_TTL_SECONDS ?? 21600); // 6h
}

function questionTtlSeconds(): number {
  return Number(process.env.QUESTION_TTL_SECONDS ?? 86400); // 24h
}

async function ensureQuestionPool(difficulty: number): Promise<void> {
  const key = redisKeys.questionPool(difficulty);

  // If pool exists and has members, keep it.
  const size = await redisClient.sCard(key);
  if (size > 0) return;

  // Rebuild pool from DB (questions are mostly static; TTL handles refresh).
  const res = await db.query(
    "SELECT id FROM questions WHERE difficulty = $1",
    [difficulty]
  );
  if (!res.rowCount) return;

  await redisClient.sAdd(
    key,
    res.rows.map((r) => String(r.id))
  );
  await redisClient.expire(key, poolTtlSeconds());
}

export async function getRandomQuestionIdByDifficulty(difficulty: number): Promise<string | null> {
  await ensureQuestionPool(difficulty);
  const key = redisKeys.questionPool(difficulty);

  const id = await redisClient.sRandMember(key);
  if (id) return id;

  // Pool is empty (or was evicted); retry once after rebuild.
  await ensureQuestionPool(difficulty);
  return await redisClient.sRandMember(key);
}

export async function getQuestionPublic(questionId: string): Promise<QuestionPublic | null> {
  const cached = await getJson<QuestionPublic>(redisKeys.question(questionId));
  if (cached) return cached;

  const res = await db.query(
    "SELECT id, difficulty, prompt, choices FROM questions WHERE id = $1",
    [questionId]
  );
  if (!res.rowCount) return null;
  const row = res.rows[0];
  const q: QuestionPublic = {
    questionId: String(row.id),
    difficulty: Number(row.difficulty),
    prompt: String(row.prompt),
    choices: row.choices as string[],
  };

  await setJson(redisKeys.question(questionId), q, questionTtlSeconds());
  return q;
}

