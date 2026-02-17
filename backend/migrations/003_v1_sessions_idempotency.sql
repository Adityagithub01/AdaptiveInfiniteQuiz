-- v1 API support: sessions + idempotency + optimistic-locking bookkeeping

-- Client-visible session (stable id per user).
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_last_seen_at ON sessions (last_seen_at DESC);

CREATE OR REPLACE FUNCTION set_last_seen_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_seen_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sessions_last_seen_at
BEFORE UPDATE ON sessions
FOR EACH ROW
EXECUTE FUNCTION set_last_seen_at();

-- Add idempotency + response snapshot fields to answer_log for safe retries.
ALTER TABLE answer_log
  ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS state_version_before INTEGER,
  ADD COLUMN IF NOT EXISTS state_version_after INTEGER,
  ADD COLUMN IF NOT EXISTS difficulty_before SMALLINT,
  ADD COLUMN IF NOT EXISTS difficulty_after SMALLINT,
  ADD COLUMN IF NOT EXISTS total_score_after INTEGER,
  ADD COLUMN IF NOT EXISTS leaderboard_rank_score INTEGER,
  ADD COLUMN IF NOT EXISTS leaderboard_rank_streak INTEGER;

-- Enforce idempotency per (user, key) when key is present.
CREATE UNIQUE INDEX IF NOT EXISTS uq_answer_log_user_idem
  ON answer_log (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_answer_log_session_answered_at
  ON answer_log (session_id, answered_at DESC);

