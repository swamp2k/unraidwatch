ALTER TABLE system_metrics ADD COLUMN net_rx_kbps REAL DEFAULT 0;
ALTER TABLE system_metrics ADD COLUMN net_tx_kbps REAL DEFAULT 0;

CREATE TABLE IF NOT EXISTS container_metrics (
  server_id      TEXT    NOT NULL,
  container_id   TEXT    NOT NULL,
  container_name TEXT    NOT NULL,
  ts             INTEGER NOT NULL,
  cpu_pct        REAL    DEFAULT 0,
  mem_mb         REAL    DEFAULT 0,
  net_rx_kbps    REAL    DEFAULT 0,
  net_tx_kbps    REAL    DEFAULT 0,
  PRIMARY KEY (server_id, container_id, ts)
);

CREATE TABLE IF NOT EXISTS retention_settings (
  user_id        TEXT    NOT NULL,
  resource_type  TEXT    NOT NULL,
  retention_days INTEGER NOT NULL DEFAULT 7,
  PRIMARY KEY (user_id, resource_type)
);
