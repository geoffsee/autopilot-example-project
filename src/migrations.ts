import { Database } from "bun:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export function runMigrations(db: Database, migrationsDir?: string): void {
  const dir = migrationsDir ?? join(import.meta.dir, "..", "migrations");

  db.exec(`CREATE TABLE IF NOT EXISTS _migrations (
    version    TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  const files = readdirSync(dir)
    .filter(f => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const version = file.replace(/\.sql$/, "");
    const already = db.query("SELECT 1 FROM _migrations WHERE version = ?").get(version);
    if (already) continue;

    const sql = readFileSync(join(dir, file), "utf8");
    db.exec(sql);
    db.run("INSERT INTO _migrations (version) VALUES (?)", [version]);
  }
}
