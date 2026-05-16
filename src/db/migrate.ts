import { Database } from "bun:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DEFAULT_MIGRATIONS_DIR = join(import.meta.dir, "migrations");

export function runMigrations(db: Database, migrationsDir = DEFAULT_MIGRATIONS_DIR): void {
  if (process.env.SKIP_MIGRATIONS === "1") return;

  db.run(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      filename   TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL
    )
  `);

  const applied = new Set(
    (db.query("SELECT filename FROM _migrations").all() as { filename: string }[]).map(
      r => r.filename
    )
  );

  const files = readdirSync(migrationsDir)
    .filter(f => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(join(migrationsDir, file), "utf-8");
    db.run(sql);
    db.run("INSERT INTO _migrations (filename, applied_at) VALUES (?, ?)", [
      file,
      new Date().toISOString(),
    ]);
  }
}
