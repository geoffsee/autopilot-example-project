CREATE TABLE IF NOT EXISTS webhooks (
  counter_name TEXT PRIMARY KEY,
  url          TEXT NOT NULL,
  created_at   TEXT NOT NULL
);

-- down:
DROP TABLE IF EXISTS webhooks;
