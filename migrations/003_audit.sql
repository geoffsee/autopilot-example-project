CREATE TABLE IF NOT EXISTS _audit (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  actor        TEXT NOT NULL,
  counter_name TEXT NOT NULL,
  old_value    INTEGER NOT NULL,
  new_value    INTEGER NOT NULL,
  timestamp    TEXT NOT NULL
);

-- down:
DROP TABLE IF EXISTS _audit;
