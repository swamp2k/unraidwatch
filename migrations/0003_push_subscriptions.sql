CREATE TABLE push_subscriptions (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint    TEXT NOT NULL UNIQUE,
  p256dh      TEXT NOT NULL,
  auth        TEXT NOT NULL,
  user_agent  TEXT,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_push_subs_user ON push_subscriptions(user_id);
