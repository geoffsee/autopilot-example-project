CREATE TABLE IF NOT EXISTS _webhook_deliveries (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  webhook_id        TEXT    NOT NULL,
  url               TEXT    NOT NULL,
  payload           TEXT    NOT NULL,
  status            TEXT    NOT NULL DEFAULT 'pending',
  attempt_count     INTEGER NOT NULL DEFAULT 0,
  next_retry_at     TEXT,
  created_at        TEXT    NOT NULL,
  last_attempted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_wd_pending ON _webhook_deliveries (status, next_retry_at)
  WHERE status = 'pending';
