export type QuizNextResponse = {
  questionId: string;
  difficulty: number;
  prompt: string;
  choices: string[];
  sessionId: string;
  stateVersion: number;
  currentScore: number;
  currentStreak: number;
};

export type QuizAnswerRequest = {
  sessionId: string;
  questionId: string;
  answer: string;
  stateVersion: number;
  answerIdempotencyKey: string;
};

export type QuizAnswerResponse = {
  correct: boolean;
  newDifficulty: number;
  newStreak: number;
  scoreDelta: number;
  totalScore: number;
  stateVersion: number;
  leaderboardRankScore: number | null;
  leaderboardRankStreak: number | null;
};

export type LeaderboardEntry = { userId: string; value: number; rank: number };

export type LeaderboardSnapshotResponse = {
  type: "score" | "streak";
  updatedAt: string;
  limit: number;
  entries: LeaderboardEntry[];
  userRank: number | null;
};

export type MetricsResponse = {
  // minimal dashboard payload from backend /v1/metrics
  currentScore: number;
  currentStreak: number;
  currentDifficulty: number;
  accuracyLast10: number;
  accuracyOverall: number;
  difficultyHistogram: Record<string, number>;
  recentPerformanceWindow: {
    correct: boolean[];
    difficulty: number[];
  };
};

