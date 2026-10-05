ALTER TABLE coach_sessions ADD COLUMN level TEXT NOT NULL DEFAULT 'beginner';
CREATE UNIQUE INDEX idx_coach_sessions_level ON coach_sessions(user_id, document_id, level);
CREATE TABLE learning_attempts (
  id TEXT PRIMARY KEY NOT NULL,
  session_id TEXT NOT NULL REFERENCES coach_sessions(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  document_id TEXT NOT NULL REFERENCES guidance(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  level TEXT NOT NULL CHECK(level IN ('beginner','intermediate','advanced')),
  section_id TEXT NOT NULL,
  section_title TEXT NOT NULL,
  question_at INTEGER NOT NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  score INTEGER NOT NULL CHECK(score >= 0 AND score <= 100),
  assessment TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(session_id, question_at)
);
CREATE INDEX idx_learning_attempts_progress ON learning_attempts(user_id,document_id,version,level,created_at);
