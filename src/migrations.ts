import { Database } from "bun:sqlite";
import { stat } from "node:fs/promises";
import { join } from "node:path";

export async function runMigrations(db: Database, migrationsDir?: string): Promise<void> {
  const dir = migrationsDir ?? join(import.meta.dir, "..", "migrations");

  let isDir = false;
  try { isDir = (await stat(dir)).isDirectory(); } catch { /* not found */ }
  if (!isDir) {
    throw new Error(`Migrations directory not found: ${dir}`);
  }

  db.exec(`CREATE TABLE IF NOT EXISTS _migrations (
    version    TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  const files = [...new Bun.Glob("*.sql").scanSync(dir)].sort();

  const applyMigration = db.transaction((ver: string, sql: string) => {
    db.exec(sql);
    db.run("INSERT OR IGNORE INTO _migrations (version) VALUES (?)", [ver]);
  });

  const checkApplied = db.query("SELECT 1 FROM _migrations WHERE version = ?");

  try {
    for (const file of files) {
      const version = file.replace(/\.sql$/, "");
      if (checkApplied.get(version)) continue;

      const sql = await Bun.file(join(dir, file)).text();
      applyMigration(version, sql);
    }
  } finally {
    checkApplied.finalize();
  }
}
