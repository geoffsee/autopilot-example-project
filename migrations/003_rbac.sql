-- Token role configuration; actual secrets are provided via API_TOKEN (write) and READ_TOKEN (read) env vars.
CREATE TABLE IF NOT EXISTS _token_config (
  name TEXT PRIMARY KEY,
  role TEXT NOT NULL DEFAULT 'write'
);

INSERT OR IGNORE INTO _token_config (name, role) VALUES ('API_TOKEN', 'write');
INSERT OR IGNORE INTO _token_config (name, role) VALUES ('READ_TOKEN', 'read');
