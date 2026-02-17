import { redisClient } from "../../config/redis";

export async function getJson<T>(key: string): Promise<T | null> {
  const v = await redisClient.get(key);
  if (!v) return null;
  return JSON.parse(v) as T;
}

export async function setJson<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
  await redisClient.setEx(key, ttlSeconds, JSON.stringify(value));
}

