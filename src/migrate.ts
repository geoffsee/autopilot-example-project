import { Database } from "bun:sqlite";
import { readdir } from "node:fs/promises";
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

// Splits a migration file into up and down sections separated by a "-- down:" marker line.
// Files without the marker are treated as up-only.
function parseUpDown(sql: string): { up: string; down: string } {
  const downMarkerRe = /^--\s*down\s*:?\s*$/im;
  const downMatch = downMarkerRe.exec(sql);

  if (!downMatch) {
    const upMarkerRe = /^--\s*up\s*:?\s*$/im;
    const upMatch = upMarkerRe.exec(sql);
    if (upMatch) {
      return { up: sql.slice(upMatch.index + upMatch[0].length).trim(), down: "" };
    }
    return { up: sql, down: "" };
  }

  let upSql = sql.slice(0, downMatch.index);
  const upMarkerRe = /^--\s*up\s*:?\s*$/im;
  const upMatch = upMarkerRe.exec(upSql);
  if (upMatch) {
    upSql = upSql.slice(upMatch.index + upMatch[0].length);
  }

  const downSql = sql.slice(downMatch.index + downMatch[0].length);

  return { up: upSql.trim(), down: downSql.trim() };
}

export async function runMigrations(db: Database, migrationsDir: string): Promise<void> {
  ensureMigrationsTable(db);
  const applied = getAppliedMigrations(db);

  const files = (await readdir(migrationsDir))
    .filter(f => f.endsWith(".sql"))
    .sort();

  const applyMigration = db.transaction((file: string, sql: string) => {
    const stripped = sql.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "").trim();
    if (stripped) db.exec(sql);
    db.run("INSERT INTO _migrations (filename, applied_at) VALUES (?, ?)", [
      file,
      new Date().toISOString(),
    ]);
  });

  for (const file of files) {
    if (applied.has(file)) continue;
    const raw = await Bun.file(join(migrationsDir, file)).text();
    const { up } = parseUpDown(raw);
    applyMigration(file, up);
  }
}

// Rolls back the most recently applied migration and returns its filename, or null if none exist.
export async function rollbackLastMigration(db: Database, migrationsDir: string): Promise<string | null> {
  ensureMigrationsTable(db);

  const row = db
    .query<{ filename: string }, []>(
      "SELECT filename FROM _migrations ORDER BY applied_at DESC, filename DESC LIMIT 1",
    )
    .get();

  if (!row) return null;

  const { filename } = row;
  const raw = await Bun.file(join(migrationsDir, filename)).text();
  const { down } = parseUpDown(raw);

  if (!down) {
    throw new Error(`Migration ${filename} has no -- down: section`);
  }

  const rollback = db.transaction(() => {
    db.exec(down);
    db.run("DELETE FROM _migrations WHERE filename = ?", [filename]);
  });

  rollback();
  return filename;
}
