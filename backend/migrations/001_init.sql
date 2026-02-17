-- AdaptiveInfiniteQuiz - initial schema

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Generic updated_at trigger helper
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- USERS
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_created_at ON users (created_at DESC);

-- QUESTIONS
CREATE TABLE IF NOT EXISTS questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  difficulty SMALLINT NOT NULL CHECK (difficulty BETWEEN 1 AND 10),
  prompt TEXT NOT NULL,
  choices JSONB NOT NULL, -- JSON array of strings
  correct_answer_hash TEXT NOT NULL,
  tags TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_questions_difficulty ON questions (difficulty);
CREATE INDEX IF NOT EXISTS idx_questions_created_at ON questions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_questions_tags_gin ON questions USING GIN (tags);

-- USER STATE (1 row per user)
CREATE TABLE IF NOT EXISTS user_state (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  current_difficulty SMALLINT NOT NULL DEFAULT 1 CHECK (current_difficulty BETWEEN 1 AND 10),
  streak INTEGER NOT NULL DEFAULT 0 CHECK (streak >= 0),
  max_streak INTEGER NOT NULL DEFAULT 0 CHECK (max_streak >= 0),
  total_score INTEGER NOT NULL DEFAULT 0,
  last_question_id UUID REFERENCES questions(id) ON DELETE SET NULL,
  last_answer_at TIMESTAMPTZ NULL,
  state_version INTEGER NOT NULL DEFAULT 1 CHECK (state_version >= 1),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_state_total_score ON user_state (total_score DESC);
CREATE INDEX IF NOT EXISTS idx_user_state_last_answer_at ON user_state (last_answer_at DESC);

CREATE TRIGGER trg_user_state_updated_at
BEFORE UPDATE ON user_state
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- ANSWER LOG (append-only)
CREATE TABLE IF NOT EXISTS answer_log (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  difficulty SMALLINT NOT NULL CHECK (difficulty BETWEEN 1 AND 10),
  answer TEXT NOT NULL,
  correct BOOLEAN NOT NULL,
  score_delta INTEGER NOT NULL,
  streak_at_answer INTEGER NOT NULL CHECK (streak_at_answer >= 0),
  answered_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_answer_log_user_answered_at ON answer_log (user_id, answered_at DESC);
CREATE INDEX IF NOT EXISTS idx_answer_log_question_id ON answer_log (question_id);
CREATE INDEX IF NOT EXISTS idx_answer_log_answered_at ON answer_log (answered_at DESC);
CREATE INDEX IF NOT EXISTS idx_answer_log_user_question ON answer_log (user_id, question_id);

-- LEADERBOARD SCORE (materialized summary)
CREATE TABLE IF NOT EXISTS leaderboard_score (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  total_score INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leaderboard_score_total_score ON leaderboard_score (total_score DESC, updated_at DESC);

CREATE TRIGGER trg_leaderboard_score_updated_at
BEFORE UPDATE ON leaderboard_score
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- LEADERBOARD STREAK (materialized summary)
CREATE TABLE IF NOT EXISTS leaderboard_streak (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  max_streak INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leaderboard_streak_max_streak ON leaderboard_streak (max_streak DESC, updated_at DESC);

CREATE TRIGGER trg_leaderboard_streak_updated_at
BEFORE UPDATE ON leaderboard_streak
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

