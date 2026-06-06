CREATE TABLE users (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  email       TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  role        TEXT NOT NULL DEFAULT 'user',
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  last_login  INTEGER
);

CREATE TABLE invites (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  email       TEXT NOT NULL,
  token       TEXT UNIQUE NOT NULL,
  created_by  TEXT NOT NULL REFERENCES users(id),
  used_at     INTEGER,
  expires_at  INTEGER NOT NULL
);

CREATE TABLE servers (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id     TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  label       TEXT NOT NULL DEFAULT 'My Tower',
  url         TEXT NOT NULL,
  api_key     TEXT NOT NULL,
  verified_at INTEGER,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE ai_configs (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id     TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  provider    TEXT NOT NULL DEFAULT 'claude',
  api_key     TEXT NOT NULL,
  default_model TEXT NOT NULL,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE log_analyses (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source      TEXT NOT NULL,
  trigger     TEXT NOT NULL DEFAULT 'manual',
  provider    TEXT NOT NULL,
  model       TEXT NOT NULL,
  log_excerpt TEXT NOT NULL,
  summary     TEXT NOT NULL,
  severity    TEXT NOT NULL,
  findings    TEXT NOT NULL,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  expires_at  INTEGER NOT NULL
);
CREATE INDEX idx_log_analyses_user ON log_analyses(user_id, created_at DESC);

CREATE TABLE briefing_schedules (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id     TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  enabled     INTEGER NOT NULL DEFAULT 0,
  hour_utc    INTEGER NOT NULL DEFAULT 7,
  deliver_via TEXT NOT NULL DEFAULT 'email'
);

CREATE TABLE notification_prefs (
  user_id         TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  email_alerts    INTEGER NOT NULL DEFAULT 1,
  push_alerts     INTEGER NOT NULL DEFAULT 0,
  alert_min_severity TEXT NOT NULL DEFAULT 'warning'
);
