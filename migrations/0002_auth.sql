CREATE TABLE auth_sessions (
  token_hash TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL,
  credential_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX idx_auth_sessions_expiry ON auth_sessions (expires_at);
