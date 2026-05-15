import { Database } from "bun:sqlite";

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

export function runMigrations(db: Database, migrations: Migration[]): void {
  db.run(`CREATE TABLE IF NOT EXISTS _migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at INTEGER NOT NULL DEFAULT (unixepoch())
  )`);

  const applied = new Set(
    (db.query("SELECT version FROM _migrations").all() as { version: number }[]).map(
      r => r.version
    )
  );

  for (const m of [...migrations].sort((a, b) => a.version - b.version)) {
    if (!applied.has(m.version)) {
      db.run(m.sql);
      db.run("INSERT INTO _migrations (version, name) VALUES (?, ?)", [m.version, m.name]);
    }
  }
}
