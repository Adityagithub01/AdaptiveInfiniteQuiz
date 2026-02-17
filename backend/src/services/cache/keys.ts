/**
 * Redis key conventions (namespace everything).
 *
 * TTL strategy (defaults; configurable via env):
 * - session->userId: 1 hour (hot path for all v1 endpoints)
 * - user_state snapshot: 15s (changes after answers; short TTL + explicit invalidation)
 * - question pool ids by difficulty: 6 hours (questions mostly static)
 * - question by id: 24 hours (questions static)
 */

export const redisKeys = {
  sessionUser: (sessionId: string) => `session:user:${sessionId}`,
  userState: (userId: string) => `user_state:${userId}`,
  questionPool: (difficulty: number) => `questions:pool:difficulty:${difficulty}`,
  question: (questionId: string) => `question:${questionId}`,
};

