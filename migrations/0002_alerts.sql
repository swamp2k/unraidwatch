CREATE TABLE alert_rules (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  metric      TEXT NOT NULL,
  operator    TEXT NOT NULL,
  threshold   TEXT NOT NULL,
  enabled     INTEGER NOT NULL DEFAULT 1,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE alert_history (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rule_id     TEXT REFERENCES alert_rules(id) ON DELETE SET NULL,
  rule_name   TEXT NOT NULL,
  metric      TEXT NOT NULL,
  value       TEXT NOT NULL,
  severity    TEXT NOT NULL,
  delivered_via TEXT,
  fired_at    INTEGER NOT NULL DEFAULT (unixepoch()),
  resolved_at INTEGER
);
CREATE INDEX idx_alert_history_user ON alert_history(user_id, fired_at DESC);
