-- Add scoring/metrics fields for consistency + fast reads.

ALTER TABLE user_state
  ADD COLUMN IF NOT EXISTS total_attempts INTEGER NOT NULL DEFAULT 0 CHECK (total_attempts >= 0),
  ADD COLUMN IF NOT EXISTS total_correct INTEGER NOT NULL DEFAULT 0 CHECK (total_correct >= 0),
  -- accuracy over last 10 answers, stored as 0..1
  ADD COLUMN IF NOT EXISTS accuracy_last10 NUMERIC(5,4) NOT NULL DEFAULT 0 CHECK (accuracy_last10 >= 0 AND accuracy_last10 <= 1),
  -- rolling windows (max length 10) stored for quick UI/analytics
  ADD COLUMN IF NOT EXISTS recent_correct_window BOOLEAN[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS recent_difficulty_window SMALLINT[] NOT NULL DEFAULT '{}',
  -- histogram of attempted question difficulties: {"1": 12, "2": 5, ...}
  ADD COLUMN IF NOT EXISTS difficulty_histogram JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_user_state_accuracy_last10 ON user_state (accuracy_last10 DESC);

