-- Add current streak to leaderboard_streak for consistent ranking queries.

ALTER TABLE leaderboard_streak
  ADD COLUMN IF NOT EXISTS current_streak INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_leaderboard_streak_current_streak
  ON leaderboard_streak (current_streak DESC, updated_at DESC);

-- Backfill current_streak from user_state (best-effort).
UPDATE leaderboard_streak ls
SET current_streak = us.streak
FROM user_state us
WHERE us.user_id = ls.user_id;

