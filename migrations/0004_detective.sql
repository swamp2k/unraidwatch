CREATE TABLE detective_investigations (
  id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  problem       TEXT NOT NULL,
  provider      TEXT NOT NULL,
  model         TEXT NOT NULL,
  severity      TEXT NOT NULL,
  summary       TEXT NOT NULL,
  root_cause    TEXT NOT NULL,
  evidence      TEXT NOT NULL,
  findings      TEXT NOT NULL,
  data_collected TEXT NOT NULL,
  created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
  expires_at    INTEGER NOT NULL
);
CREATE INDEX idx_detective_user ON detective_investigations(user_id, created_at DESC);
