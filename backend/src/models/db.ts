export type UUID = string;

export interface User {
  id: UUID;
  createdAt: string; // ISO
}

export interface Question {
  id: UUID;
  difficulty: number; // 1-10
  prompt: string;
  choices: string[];
  correctAnswerHash: string;
  tags: string[];
  createdAt: string; // ISO
}

export interface UserState {
  userId: UUID;
  currentDifficulty: number; // 1-10
  streak: number;
  maxStreak: number;
  totalScore: number;
  totalAttempts: number;
  totalCorrect: number;
  /** 0..1, based on last 10 answers */
  accuracyLast10: number;
  /** last up-to-10 correctness values (oldest->newest) */
  recentCorrectWindow: boolean[];
  /** last up-to-10 answered difficulties (oldest->newest) */
  recentDifficultyWindow: number[];
  /** {"1": count, ..., "10": count} */
  difficultyHistogram: Record<string, number>;
  lastQuestionId: UUID | null;
  lastAnswerAt: string | null; // ISO
  stateVersion: number;
  updatedAt: string; // ISO
}

export interface AnswerLogEntry {
  id: number;
  userId: UUID;
  questionId: UUID;
  difficulty: number; // 1-10
  answer: string;
  correct: boolean;
  scoreDelta: number;
  streakAtAnswer: number;
  answeredAt: string; // ISO
}

export interface LeaderboardScoreRow {
  userId: UUID;
  totalScore: number;
  updatedAt: string; // ISO
}

export interface LeaderboardStreakRow {
  userId: UUID;
  maxStreak: number;
  updatedAt: string; // ISO
}

