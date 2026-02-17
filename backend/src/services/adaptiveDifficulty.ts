import type { UserState } from "../models/db";

export const DIFFICULTY_MIN = 1;
export const DIFFICULTY_MAX = 10;

const MIN_STREAK_FOR_INCREASE = 2; // rule (1)
const WINDOW_SIZE = 5; // rule (2)
const INC_THRESHOLD = 0.7; // >70% correct -> increase
const DEC_THRESHOLD = 0.4; // <40% correct -> decrease
const STREAK_DECAY_HOURS = 24; // rule: decay after 24h inactivity

export function clampDifficulty(difficulty: number): number {
  return Math.max(DIFFICULTY_MIN, Math.min(DIFFICULTY_MAX, difficulty));
}

export function hoursBetween(a: Date, b: Date): number {
  return Math.abs(b.getTime() - a.getTime()) / (1000 * 60 * 60);
}

export function computeRollingCorrectRate(lastAnswersCorrect: boolean[]): number | null {
  // PSEUDOCODE:
  // if no answers -> null
  // rate = (#true) / (n)
  if (lastAnswersCorrect.length === 0) return null;
  const correctCount = lastAnswersCorrect.reduce((acc, v) => acc + (v ? 1 : 0), 0);
  return correctCount / lastAnswersCorrect.length;
}

export function applyStreakDecay(previousStreak: number, lastAnswerAt: Date | null, now: Date): number {
  // PSEUDOCODE:
  // if never answered -> keep streak
  // if inactivity >= 24h -> streak resets to 0 (decay)
  // else -> keep streak
  if (!lastAnswerAt) return previousStreak;
  const inactiveHours = hoursBetween(lastAnswerAt, now);
  if (inactiveHours >= STREAK_DECAY_HOURS) return 0;
  return previousStreak;
}

export function computeNextStreak(streakAfterDecay: number, isCorrect: boolean): number {
  // PSEUDOCODE:
  // if correct -> streak += 1
  // else -> streak = 0
  return isCorrect ? streakAfterDecay + 1 : 0;
}

export function computeDifficultyDelta(params: {
  currentDifficulty: number;
  isCorrect: boolean;
  nextStreak: number;
  rollingCorrectRate: number | null;
}): { delta: -1 | 0 | 1; reason: string } {
  const { isCorrect, nextStreak, rollingCorrectRate } = params;

  // PSEUDOCODE OVERVIEW (stability rules):
  // 1) Wrong answer => decrease difficulty immediately (delta = -1).
  // 2) Correct answer:
  //    - we only allow an increase if streak >= 2 (minimum streak rule).
  // 3) Rolling window (last 5 answers including current):
  //    - if rate > 0.70 => increase (but still gated by streak>=2)
  //    - if rate < 0.40 => decrease
  //
  // Notes:
  // - Decrease is allowed even if streak rule is not met.
  // - Increase is always gated by MIN_STREAK_FOR_INCREASE to prevent ping-pong.

  // Defensive anti-oscillation notes:
  // - Difficulty can "ping-pong" if we react too aggressively to single answers.
  // - We prevent that by:
  //   (a) gating increases behind a minimum streak (2 correct in a row),
  //   (b) using a rolling window (last 5) to require sustained performance for increases,
  //   (c) allowing decreases immediately on wrong answers (to protect from over-challenge),
  //   (d) clamping final difficulty to [1..10].

  // Always decrease on wrong answer (fast correction, resets streak elsewhere)
  if (!isCorrect) {
    return { delta: -1, reason: "wrong_answer" };
  }

  // Rolling window decrease (can happen even after a correct, but is rare)
  if (rollingCorrectRate !== null && rollingCorrectRate < DEC_THRESHOLD) {
    return { delta: -1, reason: "rolling_window_low" };
  }

  // Minimum streak gate for any increase
  if (nextStreak < MIN_STREAK_FOR_INCREASE) {
    return { delta: 0, reason: "min_streak_not_met" };
  }

  // Rolling window increase
  if (rollingCorrectRate !== null && rollingCorrectRate > INC_THRESHOLD) {
    return { delta: 1, reason: "rolling_window_high" };
  }

  // Otherwise: correct answer with streak>=2 => increase by 1 (simple rule)
  return { delta: 1, reason: "two_correct_in_row" };
}

export function computeNextDifficulty(params: {
  currentDifficulty: number;
  delta: -1 | 0 | 1;
}): number {
  // PSEUDOCODE:
  // next = clamp(current + delta, 1..10)
  // Defensive: clamping ensures boundary correctness even if upstream callers pass unexpected values.
  return clampDifficulty(params.currentDifficulty + params.delta);
}

export function applyAdaptiveUpdate(params: {
  previous: Pick<
    UserState,
    "currentDifficulty" | "streak" | "maxStreak" | "totalScore" | "lastAnswerAt" | "stateVersion"
  >;
  isCorrect: boolean;
  answeredAt: Date;
  /**
   * Rolling window of correctness including current answer.
   * Provide up to the last 5 booleans (most recent first or last doesn't matter for rate).
   */
  rollingWindowCorrect: boolean[];
}): {
  nextDifficulty: number;
  nextStreak: number;
  nextMaxStreak: number;
  rollingCorrectRate: number | null;
  difficultyDelta: -1 | 0 | 1;
  difficultyReason: string;
  nextStateVersion: number;
} {
  const { previous, isCorrect, answeredAt, rollingWindowCorrect } = params;

  const lastAnswerAtDate = previous.lastAnswerAt ? new Date(previous.lastAnswerAt) : null;

  const streakAfterDecay = applyStreakDecay(previous.streak, lastAnswerAtDate, answeredAt);
  const nextStreak = computeNextStreak(streakAfterDecay, isCorrect);
  const nextMaxStreak = Math.max(previous.maxStreak, nextStreak);

  const window = rollingWindowCorrect.slice(0, WINDOW_SIZE);
  const rollingCorrectRate = computeRollingCorrectRate(window);

  const { delta: difficultyDelta, reason: difficultyReason } = computeDifficultyDelta({
    currentDifficulty: previous.currentDifficulty,
    isCorrect,
    nextStreak,
    rollingCorrectRate,
  });

  const nextDifficulty = computeNextDifficulty({
    currentDifficulty: previous.currentDifficulty,
    delta: difficultyDelta,
  });

  return {
    nextDifficulty,
    nextStreak,
    nextMaxStreak,
    rollingCorrectRate,
    difficultyDelta,
    difficultyReason,
    nextStateVersion: previous.stateVersion + 1,
  };
}

