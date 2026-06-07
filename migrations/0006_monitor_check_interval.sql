ALTER TABLE docker_monitors ADD COLUMN check_interval_s INTEGER NOT NULL DEFAULT 3600;
ALTER TABLE docker_monitors ADD COLUMN last_checked_at INTEGER;

ALTER TABLE log_monitors ADD COLUMN check_interval_s INTEGER NOT NULL DEFAULT 3600;
ALTER TABLE log_monitors ADD COLUMN last_checked_at INTEGER;
