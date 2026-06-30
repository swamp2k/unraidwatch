ALTER TABLE servers ADD COLUMN availability_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE servers ADD COLUMN offline_since INTEGER;
ALTER TABLE servers ADD COLUMN last_online_at INTEGER;
ALTER TABLE servers ADD COLUMN availability_alerted INTEGER NOT NULL DEFAULT 0;
