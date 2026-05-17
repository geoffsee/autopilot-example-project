import { Database } from "bun:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

function ensureMigrationsTable(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS _migrations (
      filename   TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `);
}

function getAppliedMigrations(db: Database): Set<string> {
  const rows = db
    .query<{ filename: string }, []>("SELECT filename FROM _migrations")
    .all();
  return new Set(rows.map(r => r.filename));
}

export function runMigrations(db: Database, migrationsDir: string): void {
  ensureMigrationsTable(db);
  const applied = getAppliedMigrations(db);

  const files = readdirSync(migrationsDir)
    .filter(f => f.endsWith(".sql"))
    .sort();

  const applyMigration = db.transaction((file: string, sql: string) => {
    db.exec(sql);
    db.run("INSERT INTO _migrations (filename, applied_at) VALUES (?, ?)", [
      file,
      new Date().toISOString(),
    ]);
  });

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(join(migrationsDir, file), "utf-8");
    applyMigration(file, sql);
  }
}
