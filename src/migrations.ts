import { Database } from "bun:sqlite";
import { readdirSync } from "node:fs";
import { join } from "node:path";

export async function runMigrations(db: Database, migrationsDir?: string): Promise<void> {
  const dir = migrationsDir ?? join(import.meta.dir, "..", "migrations");

  db.exec(`CREATE TABLE IF NOT EXISTS _migrations (
    version    TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  const files = readdirSync(dir)
    .filter(f => f.endsWith(".sql"))
    .sort();

  const applyMigration = db.transaction((ver: string, sql: string) => {
    db.exec(sql);
    db.run("INSERT INTO _migrations (version) VALUES (?)", [ver]);
  });

  const checkApplied = db.query("SELECT 1 FROM _migrations WHERE version = ?");

  for (const file of files) {
    const version = file.replace(/\.sql$/, "");
    if (checkApplied.get(version)) continue;

    const sql = await Bun.file(join(dir, file)).text();
    applyMigration(version, sql);
  }
}
