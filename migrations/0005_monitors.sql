-- Docker Monitors
CREATE TABLE docker_monitors (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  container_id    TEXT NOT NULL,
  container_name  TEXT NOT NULL,
  enabled         INTEGER NOT NULL DEFAULT 1,
  notify_email    INTEGER NOT NULL DEFAULT 0,
  notify_record   INTEGER NOT NULL DEFAULT 1,
  notify_action   INTEGER NOT NULL DEFAULT 0,
  action_type     TEXT,
  cooldown_s      INTEGER NOT NULL DEFAULT 3600,
  last_fired_at   INTEGER,
  last_status     TEXT,
  created_at      INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_docker_monitors_user ON docker_monitors(user_id, enabled);
CREATE UNIQUE INDEX idx_docker_monitors_unique ON docker_monitors(user_id, container_id);

-- Log Monitors
CREATE TABLE log_monitors (
  id                   TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id              TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name                 TEXT NOT NULL,
  enabled              INTEGER NOT NULL DEFAULT 1,
  source_type          TEXT NOT NULL,
  source_id            TEXT,
  source_label         TEXT,
  keywords             TEXT NOT NULL,
  notify_email         INTEGER NOT NULL DEFAULT 0,
  notify_record        INTEGER NOT NULL DEFAULT 1,
  notify_action        INTEGER NOT NULL DEFAULT 0,
  action_container_id  TEXT,
  action_type          TEXT,
  cursor               TEXT,
  cooldown_s           INTEGER NOT NULL DEFAULT 3600,
  last_fired_at        INTEGER,
  created_at           INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_log_monitors_user ON log_monitors(user_id, enabled);

-- Monitor Events (shared history for docker and log monitors)
CREATE TABLE monitor_events (
  id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  monitor_type  TEXT NOT NULL,
  monitor_id    TEXT NOT NULL,
  monitor_name  TEXT NOT NULL,
  detail        TEXT NOT NULL,
  actions_taken TEXT NOT NULL,
  fired_at      INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_monitor_events_user ON monitor_events(user_id, fired_at DESC);
CREATE INDEX idx_monitor_events_monitor ON monitor_events(monitor_id, fired_at DESC);

-- Dashboard Layouts
CREATE TABLE dashboard_layouts (
  user_id    TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  layout     TEXT NOT NULL DEFAULT '[]',
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
