ALTER TABLE coach_sessions ADD COLUMN run_started_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE coach_sessions ADD COLUMN finished_at INTEGER;
UPDATE coach_sessions SET run_started_at = COALESCE(CAST(json_extract(messages, '$[0].at') AS INTEGER), updated_at);
