CREATE TABLE IF NOT EXISTS _api_keys (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL UNIQUE,
  token_hash TEXT NOT NULL UNIQUE,
  scope      TEXT NOT NULL CHECK(scope IN ('read', 'write')),
  created_at TEXT NOT NULL
);
