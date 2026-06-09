CREATE TABLE system_metrics (
  server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  ts        INTEGER NOT NULL,
  cpu_pct   REAL NOT NULL,
  ram_pct   REAL NOT NULL,
  PRIMARY KEY (server_id, ts)
);
