-- Machine-to-machine integration tokens (Nexus is the first consumer).
--
-- Only a SHA-256 hash of the token is stored; the raw value is shown once at
-- creation and never again. token_prefix is a non-secret fragment used purely
-- to tell tokens apart in the UI.

CREATE TABLE IF NOT EXISTS integration_tokens (
  id           TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL DEFAULT 'Nexus',
  consumer     TEXT NOT NULL DEFAULT 'nexus',
  token_hash   TEXT NOT NULL UNIQUE,
  token_prefix TEXT NOT NULL,
  scope        TEXT NOT NULL DEFAULT 'read',
  last_used_at INTEGER,
  revoked_at   INTEGER,
  created_at   INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_integration_tokens_user ON integration_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_integration_tokens_hash ON integration_tokens(token_hash);
